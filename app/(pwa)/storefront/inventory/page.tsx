import Link from "next/link";
import { getServerSupabase } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant";
import InventoryEditor from "./ui/InventoryEditor";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const sb = getServerSupabase();
  const { id: tenantId } = await getTenant();

  const { data, error } = await sb.rpc("gg_list_inventory_v1", {
    p_tenant_id: tenantId,
  });
  if (error) return <p style={{ color: "var(--red-10)" }}>Error: {error.message}</p>;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Inventory</h1>
        <Link
          href="/storefront/inventory/inactive"
          style={{ fontSize: 13, padding: "6px 14px", borderRadius: 8, border: "1px solid var(--gg-border, #e5e7eb)", textDecoration: "none", color: "inherit", opacity: 0.7, fontWeight: 500 }}
        >
          Inactive Products
        </Link>
      </div>
      <p className="text-dim" style={{ marginTop: 4 }}>Edit on-hand counts. Click a product name to view its profile.</p>
      <InventoryEditor initial={data ?? []} />
    </>
  );
}
