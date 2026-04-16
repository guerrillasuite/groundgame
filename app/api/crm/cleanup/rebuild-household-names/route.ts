import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { requireDirectorApi } from "@/lib/crm-auth";

export const dynamic = "force-dynamic";

const BIG = 100_000; // override PostgREST's default 1000-row cap

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

function buildHouseholdName(lastNames: string[]): string {
  const unique = [...new Set(lastNames.map((n) => n.trim()).filter(Boolean))].sort();
  if (unique.length === 0) return "Household";
  if (unique.length === 1) return `${unique[0]} Family`;
  if (unique.length === 2) return `${unique[0]} & ${unique[1]}`;
  const rest = unique.slice(0, -1).join(", ");
  return `${rest} & ${unique[unique.length - 1]}`;
}

/** Fetch all rows from a query with pagination, overcoming the 1000-row default cap. */
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

export async function POST() {
  const denied = await requireDirectorApi();
  if (denied) return denied;
  const tenant = await getTenant();
  const tenantId = tenant.id;
  const sb = makeSb(tenantId);

  // Fetch ALL households for this tenant (paginated)
  const households = await fetchAll<{ id: string; name: string | null }>((offset) =>
    sb.from("households").select("id, name").eq("tenant_id", tenantId).range(offset, offset + 999)
  );

  if (households.length === 0) return NextResponse.json({ updated: 0 });

  const lastNamesByHh = new Map<string, string[]>();
  for (const hh of households) lastNamesByHh.set(hh.id, []);

  // Path 1: people.household_id (paginated, scoped to this tenant)
  const directPeople = await fetchAll<{ household_id: string | null; last_name: string | null }>((offset) =>
    sb.from("people")
      .select("household_id, last_name")
      .eq("tenant_id", tenantId)
      .not("household_id", "is", null)
      .not("last_name", "is", null)
      .neq("last_name", "")
      .range(offset, offset + 999)
  );

  for (const p of directPeople) {
    if (p.household_id && p.last_name?.trim() && lastNamesByHh.has(p.household_id)) {
      lastNamesByHh.get(p.household_id)!.push(p.last_name.trim());
    }
  }

  // Path 2: person_households junction (paginated, scoped to this tenant)
  const phRows = await fetchAll<{ household_id: string; person_id: string }>((offset) =>
    sb.from("person_households")
      .select("household_id, person_id")
      .eq("tenant_id", tenantId)
      .range(offset, offset + 999)
  );

  if (phRows.length > 0) {
    // Collect all unique person IDs from the junction, fetch their last names in chunks
    const personIdSet = new Set(phRows.map((r) => r.person_id));
    const personIds = [...personIdSet];
    const lastNameById = new Map<string, string>();
    const chunkSize = 200;
    for (let i = 0; i < personIds.length; i += chunkSize) {
      const chunk = personIds.slice(i, i + chunkSize);
      const people = await fetchAll<{ id: string; last_name: string | null }>((offset) =>
        sb.from("people")
          .select("id, last_name")
          .in("id", chunk)
          .not("last_name", "is", null)
          .neq("last_name", "")
          .range(offset, offset + 999)
      );
      for (const p of people) {
        if (p.last_name?.trim()) lastNameById.set(p.id, p.last_name.trim());
      }
    }

    // Map junction rows → last names, avoiding duplicates from Path 1
    const seen = new Set<string>(); // "householdId:personId"
    for (const row of phRows) {
      const key = `${row.household_id}:${row.person_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const lastName = lastNameById.get(row.person_id);
      if (lastName && lastNamesByHh.has(row.household_id)) {
        lastNamesByHh.get(row.household_id)!.push(lastName);
      }
    }
  }

  // Compute new names, collect only changed ones
  const toUpdate: { id: string; name: string }[] = [];
  for (const hh of households) {
    const lastNames = lastNamesByHh.get(hh.id) ?? [];
    const newName = buildHouseholdName(lastNames);
    if (newName !== hh.name) toUpdate.push({ id: hh.id, name: newName });
  }

  if (toUpdate.length === 0) return NextResponse.json({ updated: 0 });

  // Upsert in chunks of 200
  let updated = 0;
  const chunkSize = 200;
  for (let i = 0; i < toUpdate.length; i += chunkSize) {
    const chunk = toUpdate.slice(i, i + chunkSize);
    const { error } = await sb
      .from("households")
      .upsert(chunk.map((h) => ({ ...h, tenant_id: tenantId })), { onConflict: "id" });
    if (!error) updated += chunk.length;
  }

  return NextResponse.json({ updated });
}
