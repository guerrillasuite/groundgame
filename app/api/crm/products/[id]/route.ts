import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

const PATCHABLE = [
  "name", "sku", "description",
  "retail_cents", "materials_cents", "packaging_cents", "labor_cents",
  "on_hand", "status",
] as const;

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);

  const { data: product, error } = await sb
    .from("products")
    .select("id, name, sku, description, retail_cents, materials_cents, packaging_cents, labor_cents, on_hand, status, photo_url")
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Count total order_items for this product
  const { count: activeOrderCount } = await sb
    .from("order_items")
    .select("id", { count: "exact", head: true })
    .eq("product_id", id);

  // Fetch recent orders linked to this product (last 20)
  const { data: recentOrdersRaw } = await sb
    .from("order_items")
    .select("id, quantity, unit_price_cents, opportunity_id, opportunities(id, title, stage, created_at)")
    .eq("product_id", id)
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const recentOrders = (recentOrdersRaw ?? []).map((oi: any) => ({
    id: oi.id,
    quantity: oi.quantity,
    unit_price_cents: oi.unit_price_cents,
    opportunity_id: oi.opportunity_id,
    opportunity_title: oi.opportunities?.title ?? null,
    opportunity_stage: oi.opportunities?.stage ?? null,
    created_at: oi.opportunities?.created_at ?? null,
  }));

  return NextResponse.json({ product, activeOrderCount: activeOrderCount ?? 0, recentOrders });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  for (const key of PATCHABLE) {
    if (key in body) patch[key] = body[key];
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { error } = await sb
    .from("products")
    .update(patch)
    .eq("id", id)
    .eq("tenant_id", tenant.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
