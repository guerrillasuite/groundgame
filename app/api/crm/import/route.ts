import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdminIdentity } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

type MappedRow = {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  contact_type?: string;
  occupation?: string;
  notes?: string;
  address_line1?: string;
  address?: string; // alias used when mapped via schema join field
  city?: string;
  state?: string;
  postal_code?: string;
  __meta?: Record<string, string>; // custom fields → stored in meta_json
};

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
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

  // Resolve tenant
  let tenantId: string;
  if (identity.isSuperAdmin && requestedTenantId) {
    tenantId = requestedTenantId;
  } else if (identity.tenantId) {
    tenantId = identity.tenantId;
  } else {
    return NextResponse.json({ error: "No tenant resolved" }, { status: 400 });
  }

  if (!rows.length) {
    return NextResponse.json({ inserted: 0, updated: 0, skipped: 0, failed: 0, errors: [] });
  }

  const sb = makeSb(tenantId);
  const errors: string[] = [];
  let inserted = 0;
  let updated = 0;

  // ── Phase A: Locations ────────────────────────────────────────────────────

  // Build unique address set
  const uniqueAddrKeys = new Map<string, MappedRow>(); // key → first row with that addr
  for (const row of rows) {
    const k = addrKey(row);
    if (k && !uniqueAddrKeys.has(k)) uniqueAddrKeys.set(k, row);
  }

  const locMap = new Map<string, string>(); // addressKey → location_id

  if (uniqueAddrKeys.size > 0) {
    const addrs = [...uniqueAddrKeys.values()].map((r) => (r.address_line1 ?? r.address ?? "").trim()).filter(Boolean);

    // Fetch existing locations
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

    // Insert new locations
    const toInsertLocs = [...uniqueAddrKeys.entries()]
      .filter(([k]) => !locMap.has(k))
      .map(([, row]) => ({
        tenant_id: tenantId,
        address_line1: (row.address_line1 ?? row.address ?? "").trim() || null,
        city: (row.city ?? "").trim() || null,
        state: (row.state ?? "").trim() || null,
        postal_code: (row.postal_code ?? "").trim() || null,
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
  }

  // ── Phase B: Households ───────────────────────────────────────────────────

  const hhMap = new Map<string, string>(); // location_id → household_id
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

    const toInsertHH = allLocIds
      .filter((locId) => !hhMap.has(locId))
      .map((locId) => ({
        tenant_id: tenantId,
        location_id: locId,
        name: null as string | null, // set to address temporarily; Phase D overwrites with last names
      }));

    // Temporarily name by street address (Phase D will overwrite with last names)
    const locIdToAddr = new Map<string, string>();
    for (const [k, locId] of locMap.entries()) {
      const addr = k.split("|")[0];
      if (!locIdToAddr.has(locId)) locIdToAddr.set(locId, addr);
    }
    for (const hh of toInsertHH) {
      hh.name = locIdToAddr.get(hh.location_id) ?? null;
    }

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
  }

  // ── Phase C: People (upsert) ──────────────────────────────────────────────

  // Build lookup maps for existing people by email
  const emails = rows.map((r) => (r.email ?? "").trim().toLowerCase()).filter(Boolean);
  const existingByEmail = new Map<string, string>(); // email → person_id

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

  // For rows without email, look up by first+last+household_id
  const noEmailRows = rows.filter((r) => !(r.email ?? "").trim());
  const nameHHKeys = new Map<string, MappedRow>(); // "first|last|hhId" → row
  for (const row of noEmailRows) {
    const fn = (row.first_name ?? "").trim().toLowerCase();
    const ln = (row.last_name ?? "").trim().toLowerCase();
    const k = addrKey(row);
    const locId = k ? locMap.get(k) : undefined;
    const hhId = locId ? hhMap.get(locId) : undefined;
    if ((fn || ln) && hhId) nameHHKeys.set(`${fn}|${ln}|${hhId}`, row);
  }

  const existingByNameHH = new Map<string, string>(); // "first|last|hhId" → person_id
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

  // Separate into insert vs update
  const toInsert: Record<string, any>[] = [];
  const toUpdate: Record<string, any>[] = [];

  for (const row of rows) {
    const fn = (row.first_name ?? "").trim();
    const ln = (row.last_name ?? "").trim();
    if (!fn && !ln) continue; // skip rows with no name

    const email = (row.email ?? "").trim().toLowerCase() || null;
    const k = addrKey(row);
    const locId = k ? locMap.get(k) : undefined;
    const hhId = locId ? hhMap.get(locId) : undefined;

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
      ...(row.__meta && Object.keys(row.__meta).length > 0 ? { meta_json: row.__meta } : {}),
    };

    // Find existing
    let existingId: string | undefined;
    if (email) {
      existingId = existingByEmail.get(email) ?? undefined;
    }
    if (!existingId && hhId) {
      const nameKey = `${fn.toLowerCase()}|${ln.toLowerCase()}|${hhId}`;
      existingId = existingByNameHH.get(nameKey) ?? undefined;
    }

    if (existingId) {
      toUpdate.push({ id: existingId, ...personData });
    } else {
      toInsert.push(personData);
    }
  }

  // Insert new people
  for (const personChunk of chunk(toInsert, 500)) {
    const { error: insErr } = await sb.from("people").insert(personChunk);
    if (insErr) {
      errors.push(`Person insert error: ${insErr.message}`);
    } else {
      inserted += personChunk.length;
    }
  }

  // Upsert existing people (update by id)
  for (const personChunk of chunk(toUpdate, 500)) {
    const { error: upErr } = await sb.from("people").upsert(personChunk, { onConflict: "id" });
    if (upErr) {
      errors.push(`Person update error: ${upErr.message}`);
    } else {
      updated += personChunk.length;
    }
  }

  // ── Phase D: Rename households from last names of residents ───────────────

  const involvedHhIds = [...new Set(
    [...toInsert, ...toUpdate].map((p) => p.household_id).filter(Boolean) as string[]
  )];

  if (involvedHhIds.length > 0) {
    for (const hhChunk of chunk(involvedHhIds, 500)) {
      const { data: residents } = await sb
        .from("people")
        .select("last_name, household_id")
        .eq("tenant_id", tenantId)
        .in("household_id", hhChunk);

      // Group last names by household
      const namesByHh = new Map<string, Set<string>>();
      for (const r of residents ?? []) {
        if (!r.household_id) continue;
        if (!namesByHh.has(r.household_id)) namesByHh.set(r.household_id, new Set());
        const ln = (r.last_name ?? "").trim();
        if (ln) namesByHh.get(r.household_id)!.add(ln);
      }

      // Update each household name
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
    inserted,
    updated,
    skipped: 0,
    failed: errors.length,
    errors: errors.slice(0, 50),
  });
}
