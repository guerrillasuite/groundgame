export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import Board from "./ui/Board";

type StageRow = { key: string; label: string | null; order_index: number; contact_type_key: string | null };
type OrderRow = {
  id: string;
  title: string | null;
  stage: string | null;
  amount_cents: number | null;
  items?: { product_id: string | null; quantity: number | null; sku: string | null; name: string | null }[] | null;
};

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

export default async function StorefrontOrdersKanbanPage() {
  const { id: tenantId } = await getTenant();
  const sb = makeSb(tenantId);

  // Parallel fetch: tenant settings, stages (with contact_type_key), opportunity ct keys, orders
  const [
    { data: tenantData },
    { data: stagesData },
    { data: oppCtData },
    { data: ordersData, error: ordersError },
  ] = await Promise.all([
    sb.from("tenants").select("settings").eq("id", tenantId).single(),
    sb.from("opportunity_stages")
      .select("key, label, order_index, contact_type_key")
      .eq("tenant_id", tenantId)
      .order("order_index", { ascending: true }),
    sb.from("opportunities")
      .select("id, contact_type")
      .eq("tenant_id", tenantId),
    sb.rpc("gg_list_orders_with_items_v1", { p_tenant_id: tenantId }),
  ]);

  // Parse visibility settings
  const settings = (tenantData?.settings as Record<string, unknown>) ?? {};
  const hiddenContactTypes = (settings.hiddenContactTypes as string[] | undefined) ?? [];
  const hiddenStagesMap = (settings.hiddenStages as Record<string, string[]> | undefined) ?? {};

  // Build contact_type lookup by opportunity id
  const ctKeyById: Record<string, string | null> = {};
  for (const opp of (oppCtData ?? []) as { id: string; contact_type: string | null }[]) {
    ctKeyById[opp.id] = opp.contact_type ?? null;
  }

  // Filter stages: remove entire stage column if its pipeline or stage is hidden
  const allStages = (stagesData as StageRow[] | null) ?? [];
  const visibleStages = allStages
    .filter((s) => {
      const ctKey = s.contact_type_key ?? "__uncategorized__";
      if (hiddenContactTypes.includes(ctKey)) return false;
      const hiddenForCt = hiddenStagesMap[ctKey] ?? [];
      if (hiddenForCt.includes(s.key)) return false;
      return true;
    })
    .map((s) => ({ key: s.key, label: s.label?.trim() || capitalize(s.key) }));

  const stages = visibleStages.length > 0 ? visibleStages : [
    { key: "new", label: "New" },
    { key: "contacted", label: "Contacted" },
    { key: "qualified", label: "Qualified" },
    { key: "proposal", label: "Proposal" },
    { key: "won", label: "Won" },
    { key: "lost", label: "Lost" },
  ];

  if (ordersError) {
    return (
      <section className="stack" style={{ padding: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Orders</h1>
        <p className="text-error" style={{ marginTop: 6 }}>{ordersError.message}</p>
      </section>
    );
  }

  // Filter orders: remove orders whose contact type (or uncategorized) is hidden
  const allOrders = (ordersData as OrderRow[]) ?? [];
  const visibleOrders = allOrders.filter((o) => {
    const ctKey = ctKeyById[o.id] ?? null;
    const effectiveCtKey = ctKey ?? "__uncategorized__";
    return !hiddenContactTypes.includes(effectiveCtKey);
  });

  return (
    <section className="stack" style={{ padding: 16 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Orders</h1>
        <p className="text-dim" style={{ marginTop: 4 }}>
          Drag items between stages. Tap a card to open details.
        </p>
      </div>
      <Board stages={stages} orders={visibleOrders} tenantId={tenantId} />
    </section>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
