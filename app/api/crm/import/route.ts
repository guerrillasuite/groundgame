import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdminIdentity } from "@/lib/adminAuth";
import { getTenant } from "@/lib/tenant";
import { validateRow, findDuplicateEmails, type MappedRow } from "@/lib/crm/import-validation";
import {
  PEOPLE_L2_COLS, HOUSEHOLD_L2_COLS, LOCATION_L2_COLS,
  applyL2Transform,
} from "@/lib/crm/l2-field-map";
import { normalizeAddr, addrKey as addrKeyUtil } from "@/lib/crm/location-utils";

export const dynamic = "force-dynamic";

type ImportMode = "fill_blanks" | "smart_merge" | "override";

const SOURCE_AUTHORITY: Record<string, number> = { l2: 3, manual: 3, import: 2 };
const STALE_MS = 180 * 24 * 60 * 60 * 1000; // 180 days

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

/** Service-role client with NO tenant header — for global dedup lookups across all tenants */
function makeSbGlobal() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

/**
 * Given an existing record and incoming data, filter the incoming fields
 * based on import mode + confidence model.
 * - fill_blanks: only include fields where existing value is null/empty
 * - smart_merge: include fields where incoming authority >= existing effective authority
 * - override: include all fields
 */
function applyImportMode(
  incoming: Record<string, unknown>,
  existing: Record<string, unknown>,
  existingSource: string | null,
  existingUpdatedAt: string | null,
  mode: ImportMode,
): Record<string, unknown> {
  if (mode === "override") return incoming;

  const inAuth = SOURCE_AUTHORITY["import"] ?? 2;
  const exAuth = SOURCE_AUTHORITY[existingSource ?? ""] ?? 2;
  const ageMs = existingUpdatedAt ? Date.now() - new Date(existingUpdatedAt).getTime() : Infinity;
  const exEffective = ageMs > STALE_MS ? Math.max(exAuth - 1, 0) : exAuth;

  const filtered: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(incoming)) {
    if (mode === "fill_blanks") {
      // Only write if existing value is null/undefined/empty string
      const exVal = existing[k];
      if (exVal == null || exVal === "") filtered[k] = v;
    } else {
      // smart_merge: write if incoming auth >= existing effective auth, OR if existing is null
      const exVal = existing[k];
      if (exVal == null || exVal === "" || inAuth >= exEffective) filtered[k] = v;
    }
  }
  return filtered;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Extract L2 fields for a given table from a MappedRow, applying type coercion. */
function pickL2(row: MappedRow, cols: Set<string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const col of cols) {
    const raw = (row as Record<string, string | undefined>)[col];
    if (raw !== undefined && raw !== "") {
      out[col] = applyL2Transform(raw, col);
    }
  }
  return out;
}

/** Assemble address_line1 from GIS component fields when a pre-built string isn't present. */
function assembleGisAddress(row: MappedRow): string {
  const parts = [
    row.house_number,
    row.pre_dir,
    row.street_name,
    row.street_suffix,
    row.post_dir,
  ].map((p) => (p ?? "").trim()).filter(Boolean);
  return parts.join(" ");
}

function addrKey(row: MappedRow): string | null {
  const raw = row.address_line1 ?? row.address ?? assembleGisAddress(row);
  return addrKeyUtil(raw, row.postal_code ?? "");
}

function parseDollarsToCents(raw: string): number {
  const n = parseFloat(raw.replace(/[$,\s]/g, ""));
  return isNaN(n) || n <= 0 ? 0 : Math.round(n * 100);
}

function cycleYearFromDate(raw: string): number {
  const d = new Date(raw);
  const y = isNaN(d.getTime())
    ? (() => { const m = raw.match(/\b(20[12]\d)\b/); return m ? parseInt(m[1]) : new Date().getFullYear(); })()
    : d.getFullYear();
  return y % 2 === 0 ? y : y + 1;
}

function normalizeDomain(d: string): string {
  return d.trim().toLowerCase()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "")
    .replace(/\s+/g, "");
}

export async function POST(request: Request) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const identity = await getAdminIdentity(request);
  if (!identity) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const isAdmin = identity.isSuperAdmin || identity.role === "admin";
  if (!isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const body = await request.json();
  const rows: MappedRow[] = body.rows ?? [];
  const requestedTenantId: string | undefined = body.tenant_id;
  const dryRun: boolean = body.dryRun === true;
  const importMode: ImportMode = (body.importMode as ImportMode) ?? "smart_merge";
  const importType: string = body.importType ?? "people";

  // Resolve tenant: explicit body param first, then URL-based tenant
  let tenantId: string;
  if (requestedTenantId) {
    tenantId = requestedTenantId;
  } else {
    try {
      const urlTenant = await getTenant();
      tenantId = urlTenant.id;
    } catch {
      return NextResponse.json({ error: "No tenant resolved" }, { status: 400 });
    }
  }

  if (!rows.length) {
    return NextResponse.json({ dryRun, inserted: 0, updated: 0, skipped: 0, failed: 0, errors: [] });
  }

  const errors: string[] = [];
  let skipped = 0;

  // ── Validation pass ───────────────────────────────────────────────────────
  const validRows: MappedRow[] = [];
  if (importType === "companies") {
    // Company import: require __company.name
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const name = (row.__company?.name ?? "").trim();
      if (!name) {
        skipped++;
        errors.push(`Row ${i + 1}: company must have a name`);
      } else {
        validRows.push(row);
      }
    }
  } else if (importType === "donations") {
    // Donations import: require amount + at least one person identifier
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const hasAmount = !!parseDollarsToCents((row.__donation?.amount ?? "").trim());
      const hasId = !!(row.email || row.first_name || row.last_name);
      if (!hasAmount || !hasId) {
        skipped++;
        errors.push(`Row ${i + 1}: donation must have an amount and a person identifier (email or name)`);
      } else {
        validRows.push(row);
      }
    }
  } else if (importType === "locations") {
    // Locations import: require a resolvable address
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const addr = (row.address_line1 ?? row.address ?? assembleGisAddress(row)).trim();
      if (!addr) {
        skipped++;
        errors.push(`Row ${i + 1}: location must have an address`);
      } else {
        // Ensure address_line1 is always set for consistent downstream processing
        validRows.push({ ...row, address_line1: row.address_line1 ?? row.address ?? addr });
      }
    }
  } else {
    for (let i = 0; i < rows.length; i++) {
      const result = validateRow(rows[i], i + 1);
      if (result.valid) {
        validRows.push(result.normalized);
      } else {
        skipped++;
        errors.push(result.reason);
      }
    }
    // Warn about intra-file duplicate emails (not a skip, just informational)
    const dupWarnings = findDuplicateEmails(validRows);
    errors.push(...dupWarnings);
  }

  if (!validRows.length) {
    return NextResponse.json({ dryRun, inserted: 0, updated: 0, skipped, failed: 0, errors: errors.slice(0, 50) });
  }

  // ── Dry run: simulate phases A–D without writing ──────────────────────────
  if (dryRun) {
    const sbGlobal = makeSbGlobal();

    // Simulate Phase A: locate existing locations globally
    const uniqueAddrKeys = new Map<string, MappedRow>();
    for (const row of validRows) {
      const k = addrKey(row);
      if (k && !uniqueAddrKeys.has(k)) uniqueAddrKeys.set(k, row);
    }

    const locMap = new Map<string, string>(); // addressKey → location_id (existing only)
    if (uniqueAddrKeys.size > 0) {
      const addrs = [...uniqueAddrKeys.values()]
        .map((r) => (r.address_line1 ?? r.address ?? assembleGisAddress(r)).trim())
        .filter(Boolean);
      for (const addrChunk of chunk(addrs, 500)) {
        const { data: existing } = await sbGlobal
          .from("locations")
          .select("id, address_line1, postal_code")
          .in("address_line1", addrChunk);
        for (const loc of existing ?? []) {
          const k = normalizeAddr(loc.address_line1 ?? "") + "|" + (loc.postal_code ?? "").trim();
          locMap.set(k, loc.id);
        }
      }
    }

    // Simulate Phase B: locate existing households globally
    const hhMap = new Map<string, string>(); // location_id → household_id (existing only)
    const allLocIds = [...new Set(locMap.values())];
    if (allLocIds.length > 0) {
      for (const locChunk of chunk(allLocIds, 100)) {
        const { data: existingHH } = await sbGlobal
          .from("households")
          .select("id, location_id")
          .in("location_id", locChunk)
          .limit(10000);
        for (const hh of existingHH ?? []) {
          if (hh.location_id) hhMap.set(hh.location_id, hh.id);
        }
      }
    }

    // Locations-only dry run: skip people simulation
    if (importType === "locations") {
      return NextResponse.json({
        dryRun: true,
        inserted: uniqueAddrKeys.size - locMap.size, // new locations
        updated: locMap.size,                         // existing locations
        skipped,
        failed: 0,
        errors: errors.slice(0, 50),
        importType,
      });
    }

    // Simulate Phase C: global dedup — voter IDs, email, name+HH (mirrors real import path)
    const lalvoteids = validRows.map((r) => (r.lalvoteid ?? "").trim()).filter(Boolean);
    const stateVoterIds = validRows.map((r) => (r.state_voter_id ?? "").trim()).filter(Boolean);
    const emails = validRows.map((r) => (r.email ?? "").trim().toLowerCase()).filter(Boolean);

    const existingByLalvoteid = new Map<string, string>();
    if (lalvoteids.length > 0) {
      for (const chunk_ of chunk([...new Set(lalvoteids)], 500)) {
        const { data } = await sbGlobal.from("people").select("id, lalvoteid").in("lalvoteid", chunk_);
        for (const p of data ?? []) { if (p.lalvoteid) existingByLalvoteid.set(p.lalvoteid, p.id); }
      }
    }

    const existingByStateVoterId = new Map<string, string>();
    if (stateVoterIds.length > 0) {
      for (const chunk_ of chunk([...new Set(stateVoterIds)], 500)) {
        const { data } = await sbGlobal.from("people").select("id, state_voter_id").in("state_voter_id", chunk_);
        for (const p of data ?? []) { if (p.state_voter_id) existingByStateVoterId.set(p.state_voter_id, p.id); }
      }
    }

    const existingByEmail = new Map<string, string>();
    if (emails.length > 0) {
      for (const emailChunk of chunk([...new Set(emails)], 500)) {
        const { data: existing } = await sbGlobal
          .from("people")
          .select("id, email")
          .in("email", emailChunk);
        for (const p of existing ?? []) {
          if (p.email) existingByEmail.set(p.email.toLowerCase(), p.id);
        }
      }
    }

    const nameHHKeys = new Map<string, MappedRow>();
    for (const row of validRows) {
      const fn = (row.first_name ?? "").trim().toLowerCase();
      const ln = (row.last_name ?? "").trim().toLowerCase();
      const k = addrKey(row);
      const locId = k ? locMap.get(k) : undefined;
      const hhId = locId ? hhMap.get(locId) : undefined;
      if ((fn || ln) && hhId) nameHHKeys.set(`${fn}|${ln}|${hhId}`, row);
    }

    const existingByNameHH = new Map<string, string>();
    if (nameHHKeys.size > 0) {
      const hhIds = [...new Set([...nameHHKeys.keys()].map((k) => k.split("|")[2]))];
      for (const hhChunk of chunk(hhIds, 100)) {
        const { data: existing } = await sbGlobal
          .from("people")
          .select("id, first_name, last_name, household_id")
          .in("household_id", hhChunk)
          .limit(10000);
        for (const p of existing ?? []) {
          const key = `${(p.first_name ?? "").toLowerCase()}|${(p.last_name ?? "").toLowerCase()}|${p.household_id}`;
          existingByNameHH.set(key, p.id);
        }
      }
    }

    let dryInserted = 0;
    let dryUpdated = 0;
    for (const row of validRows) {
      const fn = (row.first_name ?? "").trim();
      const ln = (row.last_name ?? "").trim();
      if (!fn && !ln) continue;

      const email = (row.email ?? "").trim().toLowerCase() || null;
      const k = addrKey(row);
      const locId = k ? locMap.get(k) : undefined;
      const hhId = locId ? hhMap.get(locId) : undefined;

      let existingId: string | undefined;
      if (row.lalvoteid?.trim()) existingId = existingByLalvoteid.get(row.lalvoteid.trim());
      if (!existingId && row.state_voter_id?.trim()) existingId = existingByStateVoterId.get(row.state_voter_id.trim());
      if (!existingId && email) existingId = existingByEmail.get(email) ?? undefined;
      if (!existingId && hhId) {
        const nameKey = `${fn.toLowerCase()}|${ln.toLowerCase()}|${hhId}`;
        existingId = existingByNameHH.get(nameKey) ?? undefined;
      }

      if (existingId) dryUpdated++;
      else dryInserted++;
    }

    return NextResponse.json({
      dryRun: true,
      inserted: dryInserted,
      updated: dryUpdated,
      skipped,
      failed: 0,
      errors: errors.slice(0, 50),
    });
  }

  // ── Real import: phases A–D (people) / E–G (companies) ─────────────────
  const sb = makeSb(tenantId);
  const sbGlobal = makeSbGlobal();
  let inserted = 0;
  let updated = 0;

  // ── Donations import path (Shape B: one transaction per row) ─────────────
  if (importType === "donations") {
    // Group rows by person identifier, accumulate amounts by cycle year
    const personGroups = new Map<string, {
      email: string; first: string; last: string; zip: string;
      cycles: Record<number, number>;
    }>();

    for (const row of validRows) {
      const email = (row.email ?? "").trim().toLowerCase();
      const first = (row.first_name ?? "").trim();
      const last  = (row.last_name  ?? "").trim();
      const zip   = (row.postal_code ?? "").trim();
      const amountCents = parseDollarsToCents((row.__donation?.amount ?? "").trim());
      if (amountCents <= 0) { skipped++; continue; }

      const cycleYear = cycleYearFromDate((row.__donation?.date ?? "").trim());
      const groupKey  = email || `${first.toLowerCase()}|${last.toLowerCase()}|${zip}`;
      if (!groupKey) { skipped++; continue; }

      const g = personGroups.get(groupKey) ?? { email, first, last, zip, cycles: {} };
      g.cycles[cycleYear] = (g.cycles[cycleYear] ?? 0) + amountCents;
      personGroups.set(groupKey, g);
    }

    // Dedup by email against existing people
    const uniqueEmails = [...new Set(
      [...personGroups.values()].map(g => g.email).filter(Boolean)
    )];
    const existingByEmail = new Map<string, string>();
    if (uniqueEmails.length > 0) {
      for (const emailChunk of chunk(uniqueEmails, 200)) {
        const { data } = await sbGlobal.from("people").select("id, email").in("email", emailChunk);
        for (const p of data ?? []) {
          if (p.email) existingByEmail.set(p.email.toLowerCase(), p.id);
        }
      }
    }

    // Find or create each person, then merge giving history
    for (const [, group] of personGroups) {
      let personId: string | null = group.email
        ? (existingByEmail.get(group.email) ?? null)
        : null;

      if (!personId) {
        const { data: newP, error: pErr } = await sb
          .from("people")
          .insert({
            first_name: group.first || null,
            last_name:  group.last  || null,
            email:      group.email || null,
            data_source: "import",
            data_updated_at: new Date().toISOString(),
          })
          .select("id")
          .maybeSingle();
        if (pErr || !newP) {
          errors.push(`Donation insert error: ${pErr?.message ?? "unknown"}`);
          continue;
        }
        personId = newP.id;
        inserted++;
      } else {
        updated++;
      }

      // Link to tenant
      await sb.from("tenant_people").upsert(
        { tenant_id: tenantId, person_id: personId, linked_at: new Date().toISOString() },
        { onConflict: "tenant_id,person_id", ignoreDuplicates: true }
      );

      // Merge giving history
      const cyclesJsonb: Record<string, number> = {};
      for (const [year, cents] of Object.entries(group.cycles)) {
        cyclesJsonb[String(year)] = cents;
      }
      await sb.rpc("gs_merge_giving_cycles", {
        p_person_id: personId,
        p_tenant_id: tenantId,
        p_cycles: cyclesJsonb,
      });
    }

    return NextResponse.json({
      dryRun: false,
      inserted,
      updated,
      skipped,
      failed: errors.filter(e => e.startsWith("Donation")).length,
      errors: errors.slice(0, 50),
      importType,
    });
  }

  // ── Company import path (phases E–G) ──────────────────────────────────────
  if (importType === "companies") {
    type RowCoAssignment = {
      row: MappedRow;
      companyId: string | null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      companyData: Record<string, any>;
    };

    // Phase E: build company rows, dedup by domain
    const assignments: RowCoAssignment[] = [];
    for (const row of validRows) {
      const co = row.__company ?? {};
      const name = (co.name ?? "").trim();
      if (!name) continue;
      const domain = normalizeDomain(co.domain ?? "");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const companyData: Record<string, any> = {
        name,
        ...(domain       ? { domain }            : {}),
        ...(co.phone     ? { phone: co.phone }     : {}),
        ...(co.email     ? { email: co.email }     : {}),
        ...(co.industry  ? { industry: co.industry}: {}),
        ...(co.status    ? { status: co.status }   : {}),
        ...(co.presence  ? { presence: co.presence}: {}),
      };
      assignments.push({ row, companyId: null, companyData });
    }

    // Fetch existing companies by normalized domain
    const uniqueDomains = [...new Set(
      assignments.map(a => normalizeDomain(a.companyData.domain ?? "")).filter(Boolean)
    )];
    const existingByDomain = new Map<string, string>();
    if (uniqueDomains.length > 0) {
      for (const domainChunk of chunk(uniqueDomains, 200)) {
        const { data } = await sbGlobal.from("companies").select("id, domain").in("domain", domainChunk);
        for (const co of data ?? []) {
          if (co.domain) existingByDomain.set(normalizeDomain(co.domain), co.id);
        }
      }
    }

    for (const a of assignments) {
      const domain = normalizeDomain(a.companyData.domain ?? "");
      if (domain) a.companyId = existingByDomain.get(domain) ?? null;
    }

    const newAssignments    = assignments.filter(a => !a.companyId);
    const existingAssignments = assignments.filter(a => !!a.companyId);
    const insertedCompanyIds: string[] = [];

    // Insert new companies (batch, preserve order to pair back IDs)
    for (let i = 0; i < newAssignments.length; i += 500) {
      const batch = newAssignments.slice(i, i + 500);
      const { data: newCos, error: coErr } = await sb
        .from("companies")
        .insert(batch.map(a => a.companyData))
        .select("id");
      if (coErr) {
        errors.push(`Company insert error: ${coErr.message}`);
      } else {
        inserted += batch.length;
        (newCos ?? []).forEach((co, j) => {
          const a = newAssignments[i + j];
          if (a) { a.companyId = co.id; insertedCompanyIds.push(co.id); }
        });
      }
    }

    // Update existing companies
    for (const a of existingAssignments) {
      const { error: coErr } = await sb.from("companies").update(a.companyData).eq("id", a.companyId!);
      if (coErr) errors.push(`Company update error: ${coErr.message}`);
      else updated++;
    }

    // Phase F: Upsert tenant_companies links
    const allCompanyIds = assignments.map(a => a.companyId).filter(Boolean) as string[];
    if (allCompanyIds.length > 0) {
      const linkRows = [...new Set(allCompanyIds)].map(companyId => ({
        tenant_id: tenantId,
        company_id: companyId,
        linked_at: new Date().toISOString(),
      }));
      for (const linkChunk of chunk(linkRows, 500)) {
        await sb.from("tenant_companies").upsert(linkChunk, { onConflict: "tenant_id,company_id", ignoreDuplicates: true });
      }
    }

    // Phase G: Point-of-contact persons
    const contactAssignments = assignments.filter(
      a => a.companyId && a.row.__contact && Object.keys(a.row.__contact).length > 0
    );

    if (contactAssignments.length > 0) {
      const contactEmails = contactAssignments
        .map(a => (a.row.__contact?.email ?? "").trim().toLowerCase())
        .filter(Boolean);

      const existingContactByEmail = new Map<string, string>();
      if (contactEmails.length > 0) {
        for (const emailChunk of chunk([...new Set(contactEmails)], 200)) {
          const { data } = await sbGlobal.from("people").select("id, email").in("email", emailChunk);
          for (const p of data ?? []) {
            if (p.email) existingContactByEmail.set(p.email.toLowerCase(), p.id);
          }
        }
      }

      for (const { row, companyId } of contactAssignments) {
        const c = row.__contact!;
        const fn    = (c.first ?? "").trim();
        const ln    = (c.last  ?? "").trim();
        const email = (c.email ?? "").trim().toLowerCase();
        const phone = (c.phone ?? "").trim();
        const title = (c.title ?? "").trim();
        if (!fn && !ln && !email) continue;

        let personId: string | null = email ? (existingContactByEmail.get(email) ?? null) : null;
        if (!personId) {
          const { data: newP, error: pErr } = await sb
            .from("people")
            .insert({
              first_name: fn || null,
              last_name:  ln || null,
              email:      email || null,
              phone:      phone || null,
              data_source: "import",
              data_updated_at: new Date().toISOString(),
            })
            .select("id")
            .maybeSingle();
          if (pErr || !newP) { errors.push(`Contact insert error: ${pErr?.message ?? "unknown"}`); continue; }
          personId = newP.id;
        }

        await sb.from("tenant_people").upsert(
          { tenant_id: tenantId, person_id: personId, linked_at: new Date().toISOString() },
          { onConflict: "tenant_id,person_id", ignoreDuplicates: true }
        );

        await sb.from("person_companies").upsert(
          { person_id: personId, company_id: companyId!, tenant_id: tenantId, title: title || null, is_primary: true, is_current: true },
          { onConflict: "person_id,company_id" }
        );
      }
    }

    return NextResponse.json({
      dryRun: false,
      inserted,
      updated,
      skipped,
      failed: errors.filter(e => e.startsWith("Company") || e.startsWith("Contact")).length,
      errors: errors.slice(0, 50),
      insertedCompanyIds,
      importType,
    });
  }

  // ── Phase A: Locations ────────────────────────────────────────────────────

  const uniqueAddrKeys = new Map<string, MappedRow>();
  for (const row of validRows) {
    const k = addrKey(row);
    if (k && !uniqueAddrKeys.has(k)) uniqueAddrKeys.set(k, row);
  }

  const locMap = new Map<string, string>();

  if (uniqueAddrKeys.size > 0) {
    const addrs = [...uniqueAddrKeys.values()]
      .map((r) => (r.address_line1 ?? r.address ?? "").trim())
      .filter(Boolean);

    for (const addrChunk of chunk(addrs, 500)) {
      const { data: existing } = await sbGlobal
        .from("locations")
        .select("id, address_line1, postal_code")
        .in("address_line1", addrChunk);

      for (const loc of existing ?? []) {
        const k = normalizeAddr(loc.address_line1 ?? "") + "|" + (loc.postal_code ?? "").trim();
        locMap.set(k, loc.id);
      }
    }

    const toInsertLocs = [...uniqueAddrKeys.entries()]
      .filter(([k]) => !locMap.has(k))
      .map(([, row]) => ({
        tenant_id: tenantId,
        address_line1: (row.address_line1 ?? row.address ?? assembleGisAddress(row)).trim() || null,
        city: (row.city ?? row.postal_community ?? "").trim() || null,
        state: (row.state ?? "").trim() || null,
        postal_code: (row.postal_code ?? "").trim() || null,
        ...pickL2(row, LOCATION_L2_COLS),
      }));

    for (const locChunk of chunk(toInsertLocs, 500)) {
      const { data: newLocs, error: locErr } = await sb
        .from("locations")
        .insert(locChunk)
        .select("id, address_line1, postal_code");

      if (locErr) {
        errors.push(`Location insert error: ${locErr.message}`);
      } else {
        for (const loc of newLocs ?? []) {
          const k = normalizeAddr(loc.address_line1 ?? "") + "|" + (loc.postal_code ?? "").trim();
          locMap.set(k, loc.id);
        }
      }
    }

    // Backfill L2 district/geo data onto already-existing locations
    const toUpdateLocs = [...uniqueAddrKeys.entries()]
      .filter(([k]) => locMap.has(k))
      .map(([k, row]) => ({ id: locMap.get(k)!, ...pickL2(row, LOCATION_L2_COLS) }))
      .filter((u) => Object.keys(u).length > 1); // skip if no L2 data

    for (const locChunk of chunk(toUpdateLocs, 500)) {
      for (const { id, ...l2Data } of locChunk) {
        if (Object.keys(l2Data).length === 0) continue;
        await sb.from("locations").update(l2Data).eq("id", id).eq("tenant_id", tenantId);
      }
    }
  }

  // ── Phase B: Households ───────────────────────────────────────────────────

  const hhMap = new Map<string, string>();
  const allLocIds = [...new Set(locMap.values())];

  if (allLocIds.length > 0) {
    for (const locChunk of chunk(allLocIds, 100)) {
      const { data: existingHH } = await sbGlobal
        .from("households")
        .select("id, location_id")
        .in("location_id", locChunk);

      for (const hh of existingHH ?? []) {
        if (hh.location_id) hhMap.set(hh.location_id, hh.id);
      }
    }

    // Build a map: locId → first row with that address (for L2 household fields)
    const locIdToFirstRow = new Map<string, MappedRow>();
    for (const [k, row] of uniqueAddrKeys.entries()) {
      const locId = locMap.get(k);
      if (locId && !locIdToFirstRow.has(locId)) locIdToFirstRow.set(locId, row);
    }

    const locIdToAddr = new Map<string, string>();
    for (const [k, locId] of locMap.entries()) {
      const addr = k.split("|")[0];
      if (!locIdToAddr.has(locId)) locIdToAddr.set(locId, addr);
    }

    const toInsertHH = allLocIds
      .filter((locId) => !hhMap.has(locId))
      .map((locId) => {
        const firstRow = locIdToFirstRow.get(locId);
        return {
          tenant_id: tenantId,
          location_id: locId,
          name: locIdToAddr.get(locId) ?? null,
          ...(firstRow ? pickL2(firstRow, HOUSEHOLD_L2_COLS) : {}),
        };
      });

    for (const hhChunk of chunk(toInsertHH, 500)) {
      const { data: newHH, error: hhErr } = await sb
        .from("households")
        .insert(hhChunk)
        .select("id, location_id");

      if (hhErr) {
        errors.push(`Household insert error: ${hhErr.message}`);
      } else {
        for (const hh of newHH ?? []) {
          if (hh.location_id) hhMap.set(hh.location_id, hh.id);
        }
      }
    }

    // Backfill L2 household data onto already-existing households
    const toUpdateHH = allLocIds
      .filter((locId) => hhMap.has(locId))
      .map((locId) => {
        const firstRow = locIdToFirstRow.get(locId);
        if (!firstRow) return null;
        const l2Data = pickL2(firstRow, HOUSEHOLD_L2_COLS);
        if (Object.keys(l2Data).length === 0) return null;
        return { id: hhMap.get(locId)!, ...l2Data };
      })
      .filter(Boolean) as Array<Record<string, unknown>>;

    for (const hhChunk of chunk(toUpdateHH, 500)) {
      for (const { id, ...l2Data } of hhChunk) {
        if (Object.keys(l2Data).length === 0) continue;
        await sb.from("households").update(l2Data).eq("id", id).eq("tenant_id", tenantId);
      }
    }
  }

  // ── Locations-only import: return after Phase B ───────────────────────────
  if (importType === "locations") {
    return NextResponse.json({
      dryRun,
      inserted: locMap.size,
      updated: 0,
      skipped,
      failed: errors.filter(e => e.startsWith("Location") || e.startsWith("Household")).length,
      errors: errors.slice(0, 50),
      importType,
    });
  }

  // ── Phase C: People (global dedup + upsert) ──────────────────────────────

  // Collect dedup keys
  const emails = validRows.map((r) => (r.email ?? "").trim().toLowerCase()).filter(Boolean);
  const lalvoteids = validRows.map((r) => (r.lalvoteid ?? "").trim()).filter(Boolean);
  const stateVoterIds = validRows.map((r) => (r.state_voter_id ?? "").trim()).filter(Boolean);

  // Global lookup maps: key → { id, data_source, data_updated_at, ...existing fields }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existingByLalvoteid = new Map<string, Record<string, any>>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existingByStateVoterId = new Map<string, Record<string, any>>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existingByEmail = new Map<string, Record<string, any>>();

  const DEDUP_SELECT = "id, email, lalvoteid, state_voter_id, first_name, last_name, household_id, data_source, data_updated_at";

  if (lalvoteids.length > 0) {
    for (const chunk_ of chunk([...new Set(lalvoteids)], 500)) {
      const { data } = await sbGlobal.from("people").select(DEDUP_SELECT).in("lalvoteid", chunk_);
      for (const p of data ?? []) {
        if (p.lalvoteid) existingByLalvoteid.set(p.lalvoteid, p);
      }
    }
  }

  if (stateVoterIds.length > 0) {
    for (const chunk_ of chunk([...new Set(stateVoterIds)], 500)) {
      const { data } = await sbGlobal.from("people").select(DEDUP_SELECT).in("state_voter_id", chunk_);
      for (const p of data ?? []) {
        if (p.state_voter_id) existingByStateVoterId.set(p.state_voter_id, p);
      }
    }
  }

  if (emails.length > 0) {
    for (const chunk_ of chunk([...new Set(emails)], 500)) {
      const { data } = await sbGlobal.from("people").select(DEDUP_SELECT).in("email", chunk_);
      for (const p of data ?? []) {
        if (p.email) existingByEmail.set(p.email.toLowerCase(), p);
      }
    }
  }

  // name+household fallback — all rows (voter ID / email checked first in the loop below)
  const nameHHKeys = new Map<string, MappedRow>();
  for (const row of validRows) {
    const fn = (row.first_name ?? "").trim().toLowerCase();
    const ln = (row.last_name ?? "").trim().toLowerCase();
    const k = addrKey(row);
    const locId = k ? locMap.get(k) : undefined;
    const hhId = locId ? hhMap.get(locId) : undefined;
    if ((fn || ln) && hhId) nameHHKeys.set(`${fn}|${ln}|${hhId}`, row);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existingByNameHH = new Map<string, Record<string, any>>();
  if (nameHHKeys.size > 0) {
    const hhIds = [...new Set([...nameHHKeys.keys()].map((k) => k.split("|")[2]))];
    for (const hhChunk of chunk(hhIds, 100)) {
      const { data } = await sbGlobal
        .from("people")
        .select(DEDUP_SELECT)
        .in("household_id", hhChunk)
        .limit(10000);
      for (const p of data ?? []) {
        const key = `${(p.first_name ?? "").toLowerCase()}|${(p.last_name ?? "").toLowerCase()}|${p.household_id}`;
        existingByNameHH.set(key, p);
      }
    }
  }

  type TenantPeopleData = { named: Record<string, string>; custom: Record<string, string>; giving: Record<string, number> };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toInsert: Record<string, any>[] = [];
  const toInsertTp: TenantPeopleData[] = []; // parallel to toInsert
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toUpdate: Array<{ id: string; existing: Record<string, any>; data: Record<string, any>; tp: TenantPeopleData }> = [];
  const personTenantMap = new Map<string, TenantPeopleData>(); // personId → tenant data
  const insertedPersonIds: string[] = [];

  for (const row of validRows) {
    const fn = (row.first_name ?? "").trim();
    const ln = (row.last_name ?? "").trim();
    if (!fn && !ln) continue;

    const email = (row.email ?? "").trim().toLowerCase() || null;
    const k = addrKey(row);
    const locId = k ? locMap.get(k) : undefined;
    const hhId = locId ? hhMap.get(locId) : undefined;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const personData: Record<string, any> = {
      tenant_id: tenantId,
      title: (row.title ?? "").trim() || null,
      first_name: fn || null,
      middle_name: (row.middle_name ?? "").trim() || null,
      middle_initial: (row.middle_initial ?? "").trim() || null,
      last_name: ln || null,
      suffix: (row.suffix ?? "").trim() || null,
      email: email || null,
      email2: (row.email2 ?? "").trim().toLowerCase() || null,
      email3: (row.email3 ?? "").trim().toLowerCase() || null,
      phone: (row.phone ?? "").trim() || null,
      phone2: (row.phone2 ?? "").trim() || null,
      phone3: (row.phone3 ?? "").trim() || null,
      contact_type: (row.contact_type ?? "").trim() || null,
      occupation: (row.occupation ?? "").trim() || null,
      notes: (row.notes ?? "").trim() || null,
      household_id: hhId ?? null,
      data_source: "import",
      data_updated_at: new Date().toISOString(),
      ...pickL2(row, PEOPLE_L2_COLS),
      ...(row.__meta && Object.keys(row.__meta).length > 0 ? { meta_json: row.__meta } : {}),
    };

    // Tenant-specific data (→ tenant_people link table, not people table)
    const tpNamed: Record<string, string> = {};
    const tpCustom: Record<string, string> = {};
    const tpGiving: Record<string, number> = {};
    if (row.__tenant_people) Object.assign(tpNamed, row.__tenant_people);
    if (row.__tenant_custom) Object.assign(tpCustom, row.__tenant_custom);
    if (row.__giving) {
      for (const [year, amtStr] of Object.entries(row.__giving)) {
        const cents = parseDollarsToCents(amtStr);
        if (cents > 0) tpGiving[year] = cents;
      }
    }
    const tp: TenantPeopleData = { named: tpNamed, custom: tpCustom, giving: tpGiving };

    // Global dedup priority: lalvoteid → state_voter_id → email → name+household
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let existingRecord: Record<string, any> | undefined;
    if (row.lalvoteid?.trim()) existingRecord = existingByLalvoteid.get(row.lalvoteid.trim());
    if (!existingRecord && row.state_voter_id?.trim()) existingRecord = existingByStateVoterId.get(row.state_voter_id.trim());
    if (!existingRecord && email) existingRecord = existingByEmail.get(email);
    if (!existingRecord && hhId) {
      const nameKey = `${fn.toLowerCase()}|${ln.toLowerCase()}|${hhId}`;
      existingRecord = existingByNameHH.get(nameKey);
    }

    if (existingRecord) {
      toUpdate.push({ id: existingRecord.id, existing: existingRecord, data: personData, tp });
    } else {
      toInsert.push(personData);
      toInsertTp.push(tp);
    }
  }

  for (let i = 0; i < toInsert.length; i += 500) {
    const personChunk = toInsert.slice(i, i + 500);
    const tpChunk     = toInsertTp.slice(i, i + 500);
    const { data: newPeople, error: insErr } = await sb.from("people").insert(personChunk).select("id");
    if (insErr) {
      errors.push(`Person insert error: ${insErr.message}`);
    } else {
      inserted += personChunk.length;
      (newPeople ?? []).forEach((p, j) => {
        insertedPersonIds.push(p.id);
        personTenantMap.set(p.id, tpChunk[j] ?? { named: {}, custom: {}, giving: {} });
      });
    }
  }

  for (const { id, existing, data: personData, tp } of toUpdate) {
    // Strip always-set metadata fields before mode filtering, then re-add
    const { data_source, data_updated_at, tenant_id, household_id, ...filterable } = personData;
    const modeFiltered = applyImportMode(
      filterable,
      existing,
      existing.data_source as string | null,
      existing.data_updated_at as string | null,
      importMode,
    );
    const updatePayload = { ...modeFiltered, data_source, data_updated_at, household_id: household_id ?? existing.household_id };
    const { error: upErr } = await sb.from("people").update(updatePayload).eq("id", id);
    if (upErr) {
      errors.push(`Person update error: ${upErr.message}`);
    } else {
      updated++;
      personTenantMap.set(id, tp);
    }
  }

  // ── Link all processed people to this tenant (with tenant-specific data) ──
  if (personTenantMap.size > 0) {
    const linkRows = [...personTenantMap.entries()].map(([personId, tp]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r: Record<string, any> = {
        tenant_id: tenantId,
        person_id: personId,
        linked_at: new Date().toISOString(),
      };
      if (tp.named.notes)                     r.notes            = tp.named.notes;
      if (tp.named.contact_type)              r.contact_type     = tp.named.contact_type;
      if (tp.named.delegation_state)          r.delegation_state = tp.named.delegation_state;
      if (Object.keys(tp.custom).length > 0)  r.custom_data  = tp.custom;
      return r;
    });
    for (const linkChunk of chunk(linkRows, 500)) {
      await sb.from("tenant_people").upsert(linkChunk, { onConflict: "tenant_id,person_id" });
    }
  }

  // ── Shape A giving history: merge giving_cycles for people with __giving data ──
  for (const [personId, tp] of personTenantMap.entries()) {
    if (Object.keys(tp.giving).length === 0) continue;
    await sb.rpc("gs_merge_giving_cycles", {
      p_person_id: personId,
      p_tenant_id: tenantId,
      p_cycles: tp.giving,
    });
  }

  // ── Phase D: Rename households from last names of residents ───────────────

  const involvedHhIds = [...new Set(
    [
      ...toInsert.map((p) => p.household_id),
      ...toUpdate.map(({ data }) => data.household_id),
    ].filter(Boolean) as string[]
  )];

  if (involvedHhIds.length > 0) {
    for (const hhChunk of chunk(involvedHhIds, 100)) {
      const { data: residents } = await sb
        .from("people")
        .select("last_name, household_id")
        .eq("tenant_id", tenantId)
        .in("household_id", hhChunk);

      const namesByHh = new Map<string, Set<string>>();
      for (const r of residents ?? []) {
        if (!r.household_id) continue;
        if (!namesByHh.has(r.household_id)) namesByHh.set(r.household_id, new Set());
        const ln = (r.last_name ?? "").trim();
        if (ln) namesByHh.get(r.household_id)!.add(ln);
      }

      for (const [hhId, names] of namesByHh.entries()) {
        const nameStr = [...names].slice(0, 3).join(" / ");
        if (nameStr) {
          await sb
            .from("households")
            .update({ name: nameStr })
            .eq("id", hhId)
            .eq("tenant_id", tenantId);
        }
      }
    }
  }

  return NextResponse.json({
    dryRun: false,
    inserted,
    updated,
    skipped,
    failed: errors.filter((e) => e.startsWith("Person") || e.startsWith("Location") || e.startsWith("Household")).length,
    errors: errors.slice(0, 50),
    insertedPersonIds,
    importType,
  });
}
