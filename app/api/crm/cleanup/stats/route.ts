import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

/** Normalize a phone number to (XXX) XXX-XXXX or null if invalid. */
function normalizePhone(raw: string | null): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length !== 10) return null;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

async function fetchAll<T>(
  queryFn: (offset: number) => PromiseLike<{ data: T[] | null; error: any }>
): Promise<T[]> {
  const pageSize = 1000;
  const results: T[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await queryFn(offset);
    if (error || !data || data.length === 0) break;
    results.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return results;
}

export async function GET() {
  const tenant = await getTenant();
  const tenantId = tenant.id;
  const sb = makeSb(tenantId);

  // Fetch people linked to this tenant via tenant_people (same filter as dedupe page)
  const allPeople = await fetchAll<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    middle_name: string | null;
    middle_initial: string | null;
    email: string | null;
    phone: string | null;
    phone_cell: string | null;
    phone_landline: string | null;
    active: boolean | null;
    length_of_residence: number | null;
    moved_from_state: string | null;
  }>((offset) =>
    sb.from("people")
      .select("id, first_name, last_name, middle_name, middle_initial, email, phone, phone_cell, phone_landline, active, length_of_residence, moved_from_state, tenant_people!inner(tenant_id)")
      .eq("tenant_people.tenant_id", tenantId)
      .range(offset, offset + 999)
  );

  const activePeople = allPeople.filter((p) => p.active !== false);

  const missingMiddleInitial = activePeople.filter((p) =>
    p.middle_name?.trim() && !p.middle_initial?.trim()
  ).length;

  const malformedPhones = activePeople.filter((p) =>
    [p.phone, p.phone_cell, p.phone_landline].some((ph) => {
      if (!ph?.trim()) return false;
      return normalizePhone(ph) !== ph;
    })
  ).length;

  const malformedEmails = activePeople.filter((p) => {
    if (!p.email?.trim()) return false;
    return p.email !== p.email.toLowerCase().trim();
  }).length;

  // All-caps: only names that would actually change after titleCase
  const allCapsNames = activePeople.filter((p) => {
    const fn = p.first_name ?? "";
    const ln = p.last_name ?? "";
    return (
      (/^[A-Z]{2,}$/.test(fn) && fn !== fn.slice(0, 1) + fn.slice(1).toLowerCase()) ||
      (/^[A-Z]{2,}$/.test(ln) && ln !== ln.slice(0, 1) + ln.slice(1).toLowerCase())
    );
  }).length;

  const blankRecords = activePeople.filter((p) =>
    !p.first_name?.trim() && !p.last_name?.trim() &&
    !p.email?.trim() && !p.phone?.trim()
  ).length;

  const likelyMovers = activePeople.filter((p) =>
    (p.moved_from_state?.trim()) ||
    (p.length_of_residence !== null && p.length_of_residence !== undefined && p.length_of_residence <= 12)
  ).length;

  // Duplicate people groups — use the same RPC as the dedupe page to avoid drift
  const { data: dupRows } = await sb.rpc("find_dup_people", { p_tenant_id: tenantId });
  const duplicatePeopleGroups = ((dupRows as any[]) ?? [])
    .filter((r: any) => (r.person_ids as string[])?.length > 1).length;

  // Fetch ALL households for this tenant
  const allHouseholds = await fetchAll<{ id: string; location_id: string | null }>((offset) =>
    sb.from("households").select("id, location_id").eq("tenant_id", tenantId).range(offset, offset + 999)
  );

  const locGroups = new Map<string, number>();
  for (const hh of allHouseholds) {
    if (!hh.location_id) continue;
    locGroups.set(hh.location_id, (locGroups.get(hh.location_id) ?? 0) + 1);
  }
  const duplicateHouseholdGroups = [...locGroups.values()].filter((c) => c > 1).length;
  const householdsNeedingNameRebuild = allHouseholds.length;

  const linkedLocIds = [...new Set(allHouseholds.map((h) => h.location_id).filter(Boolean) as string[])];

  // Geocode missing — only this tenant's linked locations
  let missingCoordinates = 0;
  const chunkSize = 200;
  if (linkedLocIds.length > 0) {
    for (let i = 0; i < linkedLocIds.length; i += chunkSize) {
      const chunk = linkedLocIds.slice(i, i + chunkSize);
      const locs = await fetchAll<{ id: string; lat: number | null; lon: number | null; geocode_failed: boolean }>((offset) =>
        sb.from("locations").select("id, lat, lon, geocode_failed").in("id", chunk).range(offset, offset + 999)
      );
      missingCoordinates += locs.filter((l) => (l.lat === null || l.lon === null) && !l.geocode_failed).length;
    }
  }

  // Orphaned locations — globally (locations not linked by ANY tenant's households or companies)
  const allUsedLocIds = new Set<string>();

  const allHhLocIds = await fetchAll<{ location_id: string | null }>((offset) =>
    sb.from("households").select("location_id").not("location_id", "is", null).range(offset, offset + 999)
  );
  for (const h of allHhLocIds) if (h.location_id) allUsedLocIds.add(h.location_id);

  const allCoLocIds = await fetchAll<{ location_id: string | null }>((offset) =>
    sb.from("companies").select("location_id").not("location_id", "is", null).range(offset, offset + 999)
  );
  for (const c of allCoLocIds) if (c.location_id) allUsedLocIds.add(c.location_id);

  const allLocs = await fetchAll<{ id: string }>((offset) =>
    sb.from("locations").select("id").range(offset, offset + 999)
  );
  const orphanedLocations = allLocs.filter((l) => !allUsedLocIds.has(l.id)).length;

  // Count locations needing address normalization (missing parsed fields or bad capitalization)
  let addressesToNormalize = 0;
  if (linkedLocIds.length > 0) {
    for (let i = 0; i < linkedLocIds.length; i += 200) {
      const chunk = linkedLocIds.slice(i, i + 200);
      const { data: locRows } = await sb
        .from("locations")
        .select("id, address_line1, street_name, normalized_key")
        .in("id", chunk)
        .not("address_line1", "is", null);
      for (const loc of locRows ?? []) {
        const needsParsing = !loc.street_name;
        const needsCaps =
          loc.address_line1 !== null &&
          (loc.address_line1 === loc.address_line1.toUpperCase() ||
           loc.address_line1 === loc.address_line1.toLowerCase());
        const missingKey = !loc.normalized_key;
        if (needsParsing || needsCaps || missingKey) addressesToNormalize++;
      }
    }
  }

  return NextResponse.json({
    missingMiddleInitial,
    missingCoordinates,
    duplicatePeopleGroups,
    duplicateHouseholdGroups,
    malformedPhones,
    malformedEmails,
    allCapsNames,
    blankRecords,
    householdsNeedingNameRebuild,
    orphanedLocations,
    likelyMovers,
    addressesToNormalize,
  });
}
