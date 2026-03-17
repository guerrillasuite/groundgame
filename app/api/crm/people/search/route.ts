import { NextRequest, NextResponse } from "next/server";
import { getTenant } from "@/lib/tenant";
import { createClient } from "@supabase/supabase-js";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

// Supabase PostgREST caps rows at max_rows (default 1000).
// Loop with .range() to fetch everything.
async function fetchAll(buildQuery: () => any, chunkSize = 1000): Promise<any[]> {
  const all: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery().range(from, from + chunkSize - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < chunkSize) break;
    from += chunkSize;
  }
  return all;
}

export async function GET(request: Request) {
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const like = q ? `%${q}%` : null;

  const buildQuery = () => {
    let query = sb
      .from("people")
      .select("id, first_name, last_name, email, phone, contact_type, tenant_people!inner(tenant_id)")
      .eq("tenant_people.tenant_id", tenant.id)
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true });
    if (like) {
      query = query.or(`first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`);
    }
    return query;
  };

  let allData: any[];
  try {
    allData = await fetchAll(buildQuery);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  const rows = allData.map((p) => ({
    id: p.id,
    name: [p.first_name, p.last_name].filter(Boolean).join(" ") || "—",
    email: p.email ?? "",
    phone: p.phone ?? "",
    contact_type: p.contact_type ?? "",
  }));

  return NextResponse.json({ rows, total: rows.length });
}

export async function POST(request: NextRequest) {
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);

  const body = await request.json();
  const { first_name, last_name, email, phone, contact_type, city, state, postal_code } = body as {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
    contact_type?: string;
    city?: string;
    state?: string;
    postal_code?: string;
  };

  let query = sb
    .from("people")
    .select("id, first_name, last_name, email, phone, contact_type, tenant_people!inner(tenant_id)")
    .eq("tenant_people.tenant_id", tenant.id)
    .limit(10000);

  if (first_name?.trim()) query = query.ilike("first_name", `%${first_name.trim()}%`);
  if (last_name?.trim()) query = query.ilike("last_name", `%${last_name.trim()}%`);
  if (email?.trim()) query = query.ilike("email", `%${email.trim()}%`);
  if (phone?.trim()) {
    const digits = phone.replace(/\D/g, "");
    if (digits) query = query.ilike("phone", `%${digits}%`);
  }
  if (contact_type?.trim()) query = query.ilike("contact_type", `%${contact_type.trim()}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let results = data ?? [];

  // Filter by location fields if provided (city / state / postal_code)
  if (city?.trim() || state?.trim() || postal_code?.trim()) {
    // Fetch matching locations, then filter people by household → location
    let locQuery = sb
      .from("locations")
      .select("id, normalized_key")
      .eq("tenant_id", tenant.id);

    if (city?.trim()) locQuery = locQuery.ilike("city", `%${city.trim()}%`);
    if (state?.trim()) locQuery = locQuery.ilike("state", `%${state.trim()}%`);
    if (postal_code?.trim()) locQuery = locQuery.ilike("postal_code", `%${postal_code.trim()}%`);

    const { data: locs } = await locQuery.limit(10000);
    const locKeys = new Set((locs ?? []).map((l) => l.normalized_key));

    if (locKeys.size > 0) {
      // Fetch households in those locations
      const { data: hhs } = await sb
        .from("households")
        .select("id, location_normalized_key")
        .eq("tenant_id", tenant.id)
        .in("location_normalized_key", [...locKeys]);

      const hhIds = new Set((hhs ?? []).map((h) => h.id));
      if (hhIds.size > 0) {
        // Re-query people scoped to matching households
        let personQuery = sb
          .from("people")
          .select("id, first_name, last_name, email, phone, contact_type, tenant_people!inner(tenant_id)")
          .eq("tenant_people.tenant_id", tenant.id)
          .in("household_id", [...hhIds])
          .limit(10000);

        if (first_name?.trim()) personQuery = personQuery.ilike("first_name", `%${first_name.trim()}%`);
        if (last_name?.trim()) personQuery = personQuery.ilike("last_name", `%${last_name.trim()}%`);
        if (email?.trim()) personQuery = personQuery.ilike("email", `%${email.trim()}%`);
        if (contact_type?.trim()) personQuery = personQuery.ilike("contact_type", `%${contact_type.trim()}%`);

        const { data: filteredPeople } = await personQuery;
        results = filteredPeople ?? [];
      } else {
        results = [];
      }
    }
  }

  return NextResponse.json(results);
}
