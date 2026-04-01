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

export async function GET(request: Request) {
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const like = q ? `%${q}%` : null;
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100"), 2000);
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0"), 0);

  const orClause = like
    ? `name.ilike.${like},domain.ilike.${like},industry.ilike.${like}`
    : null;

  // Run count + page query in parallel
  let countQ = sb
    .from("companies")
    .select("id, tenant_companies!inner(tenant_id)", { count: "exact", head: true })
    .eq("tenant_companies.tenant_id", tenant.id);
  if (orClause) countQ = countQ.or(orClause);

  let dataQ = sb
    .from("companies")
    .select("id, name, industry, domain, status, tenant_companies!inner(tenant_id)")
    .eq("tenant_companies.tenant_id", tenant.id)
    .order("name", { ascending: true })
    .range(offset, offset + limit - 1);
  if (orClause) dataQ = dataQ.or(orClause);

  const [{ count, error: countErr }, { data, error: dataErr }] = await Promise.all([
    countQ,
    dataQ,
  ]);

  if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 });
  if (dataErr) return NextResponse.json({ error: dataErr.message }, { status: 500 });

  const rows = (data ?? []).map((c: any) => ({
    id: c.id,
    name: c.name ?? "(Unnamed)",
    industry: c.industry ?? "",
    domain: c.domain ?? "",
    status: c.status ?? "",
  }));
  return NextResponse.json({ rows, total: count ?? 0 });
}

export async function POST(request: NextRequest) {
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);

  const body = await request.json();
  const { name, industry, domain, status } = body as {
    name?: string;
    industry?: string;
    domain?: string;
    status?: string;
  };

  let query = sb
    .from("companies")
    .select("id, name, industry, domain, status, tenant_companies!inner(tenant_id)")
    .eq("tenant_companies.tenant_id", tenant.id)
    .limit(200);

  if (name?.trim()) query = query.ilike("name", `%${name.trim()}%`);
  if (industry?.trim()) query = query.ilike("industry", `%${industry.trim()}%`);
  if (domain?.trim()) query = query.ilike("domain", `%${domain.trim()}%`);
  if (status?.trim()) query = query.ilike("status", `%${status.trim()}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(
    (data ?? []).map((c: any) => ({
      id: c.id,
      name: c.name ?? "(Unnamed)",
      industry: c.industry ?? "",
      domain: c.domain ?? "",
      status: c.status ?? "",
    }))
  );
}
