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

  let allData: any[];
  try {
    allData = await fetchAll(() => {
      let query = sb
        .from("companies")
        .select("id, name, industry, domain, status, tenant_companies!inner(tenant_id)")
        .eq("tenant_companies.tenant_id", tenant.id)
        .order("name", { ascending: true });
      if (like) {
        query = query.or(`name.ilike.${like},domain.ilike.${like},industry.ilike.${like}`);
      }
      return query;
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  const rows = allData.map((c) => ({
    id: c.id,
    name: c.name ?? "(Unnamed)",
    industry: c.industry ?? "",
    domain: c.domain ?? "",
    status: c.status ?? "",
  }));
  return NextResponse.json({ rows, total: rows.length });
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
