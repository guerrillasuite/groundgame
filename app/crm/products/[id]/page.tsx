import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { notFound } from "next/navigation";
import ProductCrmPanel from "./ui/ProductCrmPanel";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

export default async function ProductCrmDetailPage({ params }: Ctx) {
  const { id } = await params;
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);

  const [
    { data: product, error: productError },
    { count: reservedQty },
    { data: ordersRaw },
  ] = await Promise.all([
    sb
      .from("products")
      .select("id, name, sku, description, retail_cents, materials_cents, packaging_cents, labor_cents, on_hand, status, photo_url")
      .eq("id", id)
      .eq("tenant_id", tenant.id)
      .maybeSingle(),
    sb
      .from("order_items")
      .select("id", { count: "exact", head: true })
      .eq("product_id", id)
      .eq("tenant_id", tenant.id),
    sb
      .from("order_items")
      .select("id, quantity, unit_price_cents, opportunity_id, opportunities(id, title, stage, created_at)")
      .eq("product_id", id)
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (productError) {
    return (
      <section style={{ padding: 24, maxWidth: 600 }}>
        <p style={{ fontWeight: 700, color: "#dc2626" }}>Database error</p>
        <pre style={{ fontSize: 12, opacity: 0.7, whiteSpace: "pre-wrap" }}>{productError.message}</pre>
        <p style={{ fontSize: 13, marginTop: 12 }}>
          If columns are missing, run in Supabase SQL Editor:
        </p>
        <pre style={{ fontSize: 12, background: "rgba(0,0,0,0.06)", padding: 12, borderRadius: 8 }}>{`ALTER TABLE products
  ADD COLUMN IF NOT EXISTS materials_cents INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS packaging_cents INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS labor_cents     INTEGER DEFAULT NULL;`}</pre>
      </section>
    );
  }

  if (!product) notFound();

  const recentOrders = (ordersRaw ?? []).map((oi: any) => ({
    id: oi.id,
    quantity: oi.quantity as number,
    unit_price_cents: oi.unit_price_cents as number | null,
    opportunity_id: oi.opportunity_id as string,
    opportunity_title: oi.opportunities?.title ?? null,
    opportunity_stage: oi.opportunities?.stage ?? null,
    created_at: oi.opportunities?.created_at ?? null,
  }));

  return (
    <ProductCrmPanel
      product={{
        id: product.id,
        name: product.name,
        sku: product.sku,
        description: product.description,
        retail_cents: product.retail_cents,
        materials_cents: product.materials_cents,
        packaging_cents: product.packaging_cents,
        labor_cents: product.labor_cents,
        on_hand: product.on_hand,
        status: product.status,
        photo_url: product.photo_url,
      }}
      reservedQty={reservedQty ?? 0}
      recentOrders={recentOrders}
    />
  );
}
