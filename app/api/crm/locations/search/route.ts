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

function fmt(l: any): string {
  const nk = (l.normalized_key ?? "").trim();
  if (nk) return nk;
  const line2 = [l.city, l.state].filter(Boolean).join(", ");
  return [l.address_line1, line2, l.postal_code].filter(Boolean).join(", ");
}

export async function GET(request: Request) {
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const like = q ? `%${q}%` : null;

  let allData: any[];
  try {
    allData = await fetchAll(() => {
      let query = sb
        .from("locations")
        .select("id, normalized_key, address_line1, city, state, postal_code")
        .eq("tenant_id", tenant.id)
        .order("address_line1", { ascending: true });
      if (like) {
        query = query.or(
          `address_line1.ilike.${like},city.ilike.${like},state.ilike.${like},postal_code.ilike.${like}`
        );
      }
      return query;
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  const rows = allData.map((l) => ({ id: l.id, address: fmt(l) }));
  return NextResponse.json({ rows, total: rows.length });
}

export async function POST(request: NextRequest) {
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);

  const body = await request.json();
  const { address, city, state, postal_code } = body as {
    address?: string;
    city?: string;
    state?: string;
    postal_code?: string;
  };

  let query = sb
    .from("locations")
    .select("id, address_line1, city, state, postal_code")
    .eq("tenant_id", tenant.id)
    .limit(200);

  if (address?.trim()) query = query.ilike("address_line1", `%${address.trim()}%`);
  if (city?.trim()) query = query.ilike("city", `%${city.trim()}%`);
  if (state?.trim()) query = query.ilike("state", `%${state.trim()}%`);
  if (postal_code?.trim()) query = query.ilike("postal_code", `%${postal_code.trim()}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(
    (data ?? []).map((l) => ({
      id: l.id,
      address: l.address_line1,
      city: l.city,
      state: l.state,
      postal_code: l.postal_code,
    }))
  );
}
