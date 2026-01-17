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
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Inventory</h1>
      <p className="text-dim" style={{ marginTop: 4 }}>Edit on-hand counts and save.</p>
      <InventoryEditor initial={data ?? []} />
    </>
  );
}
