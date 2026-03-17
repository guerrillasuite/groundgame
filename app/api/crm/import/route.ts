import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdminIdentity } from "@/lib/adminAuth";
import { getTenant } from "@/lib/tenant";
import { validateRow, findDuplicateEmails, type MappedRow } from "@/lib/crm/import-validation";
import {
  PEOPLE_L2_COLS, HOUSEHOLD_L2_COLS, LOCATION_L2_COLS,
  applyL2Transform,
} from "@/lib/crm/l2-field-map";

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

function normalizeAddr(s: string): string {
  return s.trim().toLowerCase()
    .replace(/\.+$/, "")   // remove trailing period(s)
    .replace(/\s+/g, " "); // collapse whitespace
}

function addrKey(row: MappedRow): string | null {
  const a = normalizeAddr(row.address_line1 ?? row.address ?? "");
  if (!a) return null;
  return `${a}|${(row.postal_code ?? "").trim()}`;
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

  if (!validRows.length) {
    return NextResponse.json({ dryRun, inserted: 0, updated: 0, skipped, failed: 0, errors: errors.slice(0, 50) });
  }

  // ── Dry run: simulate phases A–D without writing ──────────────────────────
  if (dryRun) {
    const sb = makeSb(tenantId);

    // Simulate Phase A: count new vs existing locations
    const uniqueAddrKeys = new Map<string, MappedRow>();
    for (const row of validRows) {
      const k = addrKey(row);
      if (k && !uniqueAddrKeys.has(k)) uniqueAddrKeys.set(k, row);
    }

    const locMap = new Map<string, string>(); // addressKey → location_id (existing only)
    if (uniqueAddrKeys.size > 0) {
      const addrs = [...uniqueAddrKeys.values()]
        .map((r) => (r.address_line1 ?? r.address ?? "").trim())
        .filter(Boolean);
      for (const addrChunk of chunk(addrs, 500)) {
        const { data: existing } = await sb
          .from("locations")
          .select("id, address_line1, postal_code")
          .eq("tenant_id", tenantId)
          .in("address_line1", addrChunk);
        for (const loc of existing ?? []) {
          const k = normalizeAddr(loc.address_line1 ?? "") + "|" + (loc.postal_code ?? "").trim();
          locMap.set(k, loc.id);
        }
      }
    }

    // Simulate Phase B: count new vs existing households
    const hhMap = new Map<string, string>(); // location_id → household_id (existing only)
    const allLocIds = [...new Set(locMap.values())];
    if (allLocIds.length > 0) {
      for (const locChunk of chunk(allLocIds, 500)) {
        const { data: existingHH } = await sb
          .from("households")
          .select("id, location_id")
          .eq("tenant_id", tenantId)
          .in("location_id", locChunk);
        for (const hh of existingHH ?? []) {
          if (hh.location_id) hhMap.set(hh.location_id, hh.id);
        }
      }
    }

    // Simulate Phase C: count inserts vs updates
    const emails = validRows.map((r) => (r.email ?? "").trim().toLowerCase()).filter(Boolean);
    const existingByEmail = new Map<string, string>();
    if (emails.length > 0) {
      for (const emailChunk of chunk([...new Set(emails)], 500)) {
        const { data: existing } = await sb
          .from("people")
          .select("id, email")
          .eq("tenant_id", tenantId)
          .in("email", emailChunk);
        for (const p of existing ?? []) {
          if (p.email) existingByEmail.set(p.email.toLowerCase(), p.id);
        }
      }
    }

    const noEmailRows = validRows.filter((r) => !(r.email ?? "").trim());
    const nameHHKeys = new Map<string, MappedRow>();
    for (const row of noEmailRows) {
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
      for (const hhChunk of chunk(hhIds, 500)) {
        const { data: existing } = await sb
          .from("people")
          .select("id, first_name, last_name, household_id")
          .eq("tenant_id", tenantId)
          .in("household_id", hhChunk);
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
      if (email) existingId = existingByEmail.get(email) ?? undefined;
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

  // ── Real import: phases A–D ───────────────────────────────────────────────
  const sb = makeSb(tenantId);
  let inserted = 0;
  let updated = 0;

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
      const { data: existing } = await sb
        .from("locations")
        .select("id, address_line1, postal_code")
        .eq("tenant_id", tenantId)
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
        address_line1: (row.address_line1 ?? row.address ?? "").trim() || null,
        city: (row.city ?? "").trim() || null,
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
    for (const locChunk of chunk(allLocIds, 500)) {
      const { data: existingHH } = await sb
        .from("households")
        .select("id, location_id")
        .eq("tenant_id", tenantId)
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

  // ── Phase C: People (global dedup + upsert) ──────────────────────────────

  // Global client — searches ALL tenants for dedup matching
  const sbGlobal = makeSbGlobal();

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

  // name+household fallback (within this tenant only for households)
  const noEmailRows = validRows.filter((r) => !(r.email ?? "").trim());
  const nameHHKeys = new Map<string, MappedRow>();
  for (const row of noEmailRows) {
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
    for (const hhChunk of chunk(hhIds, 500)) {
      const { data } = await sb
        .from("people")
        .select(DEDUP_SELECT)
        .eq("tenant_id", tenantId)
        .in("household_id", hhChunk)
        .limit(10000);
      for (const p of data ?? []) {
        const key = `${(p.first_name ?? "").toLowerCase()}|${(p.last_name ?? "").toLowerCase()}|${p.household_id}`;
        existingByNameHH.set(key, p);
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toInsert: Record<string, any>[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toUpdate: Array<{ id: string; existing: Record<string, any>; data: Record<string, any> }> = [];
  // Collected person IDs to link to this tenant after insert/update
  const personIdsToLink: string[] = [];

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
      first_name: fn || null,
      last_name: ln || null,
      email: email || null,
      phone: (row.phone ?? "").trim() || null,
      contact_type: (row.contact_type ?? "").trim() || null,
      occupation: (row.occupation ?? "").trim() || null,
      notes: (row.notes ?? "").trim() || null,
      household_id: hhId ?? null,
      data_source: "import",
      data_updated_at: new Date().toISOString(),
      ...pickL2(row, PEOPLE_L2_COLS),
      ...(row.__meta && Object.keys(row.__meta).length > 0 ? { meta_json: row.__meta } : {}),
    };

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
      toUpdate.push({ id: existingRecord.id, existing: existingRecord, data: personData });
    } else {
      toInsert.push(personData);
    }
  }

  for (const personChunk of chunk(toInsert, 500)) {
    const { data: newPeople, error: insErr } = await sb.from("people").insert(personChunk).select("id");
    if (insErr) {
      errors.push(`Person insert error: ${insErr.message}`);
    } else {
      inserted += personChunk.length;
      for (const p of newPeople ?? []) personIdsToLink.push(p.id);
    }
  }

  for (const { id, existing, data: personData } of toUpdate) {
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
      personIdsToLink.push(id);
    }
  }

  // ── Link all processed people to this tenant ──────────────────────────────
  if (personIdsToLink.length > 0) {
    const linkRows = [...new Set(personIdsToLink)].map((personId) => ({
      tenant_id: tenantId,
      person_id: personId,
      linked_at: new Date().toISOString(),
    }));
    for (const linkChunk of chunk(linkRows, 500)) {
      await sb.from("tenant_people").upsert(linkChunk, { onConflict: "tenant_id,person_id", ignoreDuplicates: true });
    }
  }

  // ── Phase D: Rename households from last names of residents ───────────────

  const involvedHhIds = [...new Set(
    [
      ...toInsert.map((p) => p.household_id),
      ...toUpdate.map(({ data }) => data.household_id),
    ].filter(Boolean) as string[]
  )];

  if (involvedHhIds.length > 0) {
    for (const hhChunk of chunk(involvedHhIds, 500)) {
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
  });
}
