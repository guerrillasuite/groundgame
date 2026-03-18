import { NextResponse } from "next/server";
import { getTenant } from "@/lib/tenant";
import { createClient } from "@supabase/supabase-js";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

function makeSbGlobal() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function GET(request: Request) {
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);
  const sbGlobal = makeSbGlobal();
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 500);
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0"), 0);

  // Step 1: Get all household_ids linked to people this tenant can see
  // Check both people.household_id and person_households junction
  const [directPeople, junctionRows] = await Promise.all([
    sb
      .from("people")
      .select("household_id, tenant_people!inner(tenant_id)")
      .eq("tenant_people.tenant_id", tenant.id)
      .not("household_id", "is", null)
      .limit(50000),
    sb
      .from("person_households")
      .select("household_id")
      .eq("tenant_id", tenant.id)
      .limit(50000),
  ]);

  const allHhIds = [
    ...new Set([
      ...(directPeople.data ?? []).map((p: any) => p.household_id).filter(Boolean),
      ...(junctionRows.data ?? []).map((r: any) => r.household_id).filter(Boolean),
    ]),
  ] as string[];

  if (allHhIds.length === 0) return NextResponse.json({ rows: [], total: 0 });

  // Step 2: Fetch matching households across all chunks, with optional name filter
  const like = q ? `%${q}%` : null;
  const allMatching: any[] = [];

  for (const idChunk of chunk(allHhIds, 100)) {
    let hhQuery = sbGlobal
      .from("households")
      .select("id, name, location_id")
      .in("id", idChunk);
    if (like) hhQuery = (hhQuery as any).ilike("name", like);
    const { data } = await hhQuery;
    allMatching.push(...(data ?? []));
  }

  allMatching.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  const total = allMatching.length;
  const pageRows = allMatching.slice(offset, offset + limit);

  // Step 3: Fetch addresses for the returned page
  const locIds = [...new Set(pageRows.map((h: any) => h.location_id).filter(Boolean))];
  const addressById = new Map<string, string>();

  if (locIds.length > 0) {
    for (const locChunk of chunk(locIds as string[], 100)) {
      const { data: locs } = await sbGlobal
        .from("locations")
        .select("id, normalized_key, address_line1, city, state, postal_code")
        .in("id", locChunk);

      for (const l of locs ?? []) {
        const nk = (l.normalized_key ?? "").trim();
        addressById.set(
          l.id,
          nk || [l.address_line1, [l.city, l.state].filter(Boolean).join(", "), l.postal_code].filter(Boolean).join(", ")
        );
      }
    }
  }

  return NextResponse.json({
    rows: pageRows.map((h: any) => ({
      id: h.id,
      name: (h.name?.trim() ?? "") || "(unnamed)",
      address: h.location_id ? (addressById.get(h.location_id) ?? "") : "",
    })),
    total,
  });
}
