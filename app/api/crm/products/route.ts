import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { requireDirectorApi } from "@/lib/crm-auth";

export const dynamic = "force-dynamic";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

/**
 * GET /api/crm/products
 * Returns active products for the current tenant.
 * Query params:
 *   ?ids=id1,id2,id3  — optional comma-separated product ID filter (curated subset)
 */
export async function GET(req: NextRequest) {
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);

  const idsParam = req.nextUrl.searchParams.get("ids");
  const ids = idsParam ? idsParam.split(",").filter(Boolean) : null;

  let query = sb
    .from("products")
    .select("id, name, sku, on_hand")
    .eq("tenant_id", tenant.id)
    .eq("status", "active")
    .order("name", { ascending: true });

  if (ids && ids.length > 0) {
    query = query.in("id", ids);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

/**
 * POST /api/crm/products
 * Creates a new product for the current tenant.
 * Body: { name, sku?, retail_cents?, materials_cents?, packaging_cents?, labor_cents?, on_hand? }
 */
export async function POST(req: NextRequest) {
  const denied = await requireDirectorApi();
  if (denied) return denied;
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);

  const body = await req.json().catch(() => null);
  if (!body || !body.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const insert: Record<string, unknown> = {
    tenant_id: tenant.id,
    name: body.name.trim(),
    status: "active",
  };

  const optionals = ["sku", "description", "retail_cents", "materials_cents", "packaging_cents", "labor_cents", "on_hand"] as const;
  for (const key of optionals) {
    if (key in body && body[key] != null) insert[key] = body[key];
  }

  const { data, error } = await sb
    .from("products")
    .insert(insert)
    .select("id, name, sku, retail_cents, materials_cents, packaging_cents, labor_cents, on_hand, status")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
