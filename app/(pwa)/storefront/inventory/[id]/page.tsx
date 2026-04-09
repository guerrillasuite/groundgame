import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { notFound } from "next/navigation";
import ProductEditor from "./ui/ProductEditor";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

export default async function ProductProfilePage({ params }: Ctx) {
  const { id } = await params;
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);

  const { data: product, error: productError } = await sb
    .from("products")
    .select("id, name, sku, description, retail_cents, on_hand, status, photo_url")
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  if (productError) {
    // Likely a missing column — tell the developer what SQL to run
    return (
      <div style={{ padding: 24, maxWidth: 540 }}>
        <p style={{ fontWeight: 700, color: "#dc2626" }}>Database error loading product</p>
        <pre style={{ fontSize: 12, opacity: 0.7, whiteSpace: "pre-wrap" }}>{productError.message}</pre>
        <p style={{ fontSize: 13, marginTop: 12 }}>
          Run this in your Supabase SQL editor to add the missing columns:
        </p>
        <pre style={{ fontSize: 12, background: "rgba(0,0,0,0.06)", padding: 12, borderRadius: 8, whiteSpace: "pre-wrap" }}>{`ALTER TABLE products
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS retail_cents INTEGER,
  ADD COLUMN IF NOT EXISTS photo_url TEXT;`}</pre>
      </div>
    );
  }

  if (!product) notFound();

  const { count: activeOrderCount } = await sb
    .from("order_items")
    .select("id", { count: "exact", head: true })
    .eq("product_id", id);

  return (
    <ProductEditor
      product={product}
      activeOrderCount={activeOrderCount ?? 0}
    />
  );
}
