import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import InventoryEditor from "./ui/InventoryEditor";
import AddProductButton from "./ui/AddProductButton";

export const dynamic = "force-dynamic";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

export default async function InventoryPage() {
  const { id: tenantId } = await getTenant();
  const sb = makeSb(tenantId);

  const [{ data: products, error }, { data: orderItems }] = await Promise.all([
    sb
      .from("products")
      .select("id, name, sku, on_hand, retail_cents, status")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .order("name", { ascending: true }),
    sb
      .from("order_items")
      .select("product_id")
      .eq("tenant_id", tenantId),
  ]);

  if (error) return <p style={{ color: "var(--red-10)" }}>Error: {error.message}</p>;

  // Build reserved count map
  const reservedMap: Record<string, number> = {};
  for (const oi of orderItems ?? []) {
    reservedMap[oi.product_id] = (reservedMap[oi.product_id] ?? 0) + 1;
  }

  const rows = (products ?? []).map((p) => ({
    ...p,
    reserved_qty: reservedMap[p.id] ?? 0,
  }));

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Inventory</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <AddProductButton />
          <Link
            href="/storefront/inventory/inactive"
            style={{ fontSize: 13, padding: "6px 14px", borderRadius: 8, border: "1px solid var(--gg-border, #e5e7eb)", textDecoration: "none", color: "inherit", opacity: 0.7, fontWeight: 500 }}
          >
            Inactive
          </Link>
        </div>
      </div>
      <p className="text-dim" style={{ marginTop: 4 }}>Edit on-hand counts. Click a product name to view its profile.</p>
      <InventoryEditor initial={rows} />
    </>
  );
}
