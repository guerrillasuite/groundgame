import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import ProductListClient from "./ui/ProductListClient";

export const dynamic = "force-dynamic";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

export default async function ProductsPage() {
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);

  const [{ data: products, error }, { data: orderItems }] = await Promise.all([
    sb
      .from("products")
      .select("id, name, sku, retail_cents, materials_cents, packaging_cents, labor_cents, on_hand, status, photo_url")
      .eq("tenant_id", tenant.id)
      .order("name", { ascending: true }),
    sb
      .from("order_items")
      .select("product_id")
      .eq("tenant_id", tenant.id),
  ]);

  if (error) {
    return (
      <section style={{ padding: 24 }}>
        <p style={{ color: "#dc2626", fontWeight: 700 }}>Error loading products</p>
        <pre style={{ fontSize: 12, opacity: 0.7 }}>{error.message}</pre>
      </section>
    );
  }

  // Build order count map
  const orderCountMap: Record<string, number> = {};
  (orderItems ?? []).forEach((oi: { product_id: string | null }) => {
    if (oi.product_id) {
      orderCountMap[oi.product_id] = (orderCountMap[oi.product_id] ?? 0) + 1;
    }
  });

  const rows = (products ?? []).map((p) => ({
    id: p.id,
    name: p.name ?? "(Unnamed)",
    sku: p.sku ?? "",
    status: (p.status ?? "active") as "active" | "inactive",
    on_hand: p.on_hand ?? 0,
    retail_cents: p.retail_cents as number | null,
    materials_cents: p.materials_cents as number | null,
    packaging_cents: p.packaging_cents as number | null,
    labor_cents: p.labor_cents as number | null,
    active_orders: orderCountMap[p.id] ?? 0,
    photo_url: p.photo_url as string | null,
  }));

  return <ProductListClient rows={rows} />;
}
