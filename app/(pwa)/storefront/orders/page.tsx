export const dynamic = "force-dynamic";

import { getServerSupabase } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant";
import Board from "./ui/Board";

type StageRow = { key: string; order_index: number };
type OrderRow = {
  id: string;
  title: string | null;
  stage: string | null;
  amount_cents: number | null;
  items?: { product_id: string | null; quantity: number | null; sku: string | null; name: string | null }[] | null;
};

const FALLBACK_STAGE_KEYS = ["new", "contacted", "qualified", "proposal", "won", "lost"];

export default async function StorefrontOrdersKanbanPage() {
  const sb = getServerSupabase();
  const { id: tenantId } = await getTenant();

  const { data: stagesData } = await sb
    .from("opportunity_stages")
    .select("key,order_index")
    .eq("tenant_id", tenantId)
    .order("order_index", { ascending: true });

  const stages =
    Array.isArray(stagesData) && stagesData.length > 0
      ? (stagesData as StageRow[]).map((s) => s.key)
      : FALLBACK_STAGE_KEYS;

  const { data, error } = await sb.rpc("gg_list_orders_with_items_v1", { p_tenant_id: tenantId });
  if (error) {
    return (
      <section className="stack" style={{ padding: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Orders</h1>
        <p className="text-error" style={{ marginTop: 6 }}>{error.message}</p>
      </section>
    );
  }

  return (
    <section className="stack" style={{ padding: 16 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Orders</h1>
        <p className="text-dim" style={{ marginTop: 4 }}>
          Drag items between stages. Click a card to open details.
        </p>
      </div>
      <Board stages={stages} orders={(data as OrderRow[]) ?? []} tenantId={tenantId} />
    </section>
  );
}
