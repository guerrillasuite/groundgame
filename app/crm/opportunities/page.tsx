// app/crm/opportunities/page.tsx
export const dynamic = "force-dynamic";

import { getServerSupabase } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant";
import KanbanBoard from "./ui/KanbanBoard";

type StageRow = { key: string; label: string; order_index: number };
type OppRow = { id: string; title: string | null; stage: string | null; amount_cents: number | null };

const FALLBACK_STAGE_KEYS = ["new", "contacted", "qualified", "proposal", "won", "lost"];

export default async function OpportunitiesPage() {
  const sb = getServerSupabase();
  const { id: tenantId } = await getTenant();

  // 1) Load stage dictionary (keys only, ordered). Fallback to a default set if empty.
  const { data: stagesData, error: stagesErr } = await sb
    .from("opportunity_stages")
    .select("key,order_index")
    .eq("tenant_id", tenantId)
    .order("order_index", { ascending: true });

  const stageKeys: string[] =
    Array.isArray(stagesData) && stagesData.length > 0
      ? (stagesData as StageRow[]).map((s) => s.key)
      : FALLBACK_STAGE_KEYS;

  // 2) Load opportunities in those stages
  const { data: oppsData, error: oppsErr } = await sb
    .from("opportunities")
    .select("id,title,stage,amount_cents")
    .eq("tenant_id", tenantId)
    .in("stage", stageKeys);

  // Be defensive: always build a complete map with empty arrays
  const itemsByStage: Record<string, { id: string; title: string | null; amount_cents: number | null }[]> = {};
  for (const k of stageKeys) itemsByStage[k] = [];

  if (Array.isArray(oppsData)) {
    for (const o of oppsData as OppRow[]) {
      const k = o.stage && stageKeys.includes(o.stage) ? o.stage : stageKeys[0];
      itemsByStage[k].push({ id: o.id, title: o.title, amount_cents: o.amount_cents });
    }
  }

  // in app/crm/opportunities/page.tsx
  return (
    <section className="stack" /* style={{ padding: 16 }} is fine; NO margin-top here */>
      <div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Opportunities</h1>
        <p className="text-dim" style={{ marginTop: 4 }}>Drag items between stages.</p>
      </div>
      <div className="crm-board-rail">
        <div className="crm-board-inner">
          <KanbanBoard stages={stageKeys} itemsByStage={itemsByStage} />
        </div>
      </div>
    </section>
  );
}
