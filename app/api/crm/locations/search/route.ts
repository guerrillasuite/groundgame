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
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100"), 2000);
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0"), 0);

  const orClause = like
    ? `address_line1.ilike.${like},city.ilike.${like},state.ilike.${like},postal_code.ilike.${like}`
    : null;

  // Run count + page query in parallel
  let countQ = sb
    .from("locations")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenant.id);
  if (orClause) countQ = countQ.or(orClause);

  let dataQ = sb
    .from("locations")
    .select("id, normalized_key, address_line1, city, state, postal_code")
    .eq("tenant_id", tenant.id)
    .order("address_line1", { ascending: true })
    .range(offset, offset + limit - 1);
  if (orClause) dataQ = dataQ.or(orClause);

  const [{ count, error: countErr }, { data, error: dataErr }] = await Promise.all([
    countQ,
    dataQ,
  ]);

  if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 });
  if (dataErr) return NextResponse.json({ error: dataErr.message }, { status: 500 });

  const rows = (data ?? []).map((l: any) => ({ id: l.id, address: fmt(l) }));
  return NextResponse.json({ rows, total: count ?? 0 });
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
