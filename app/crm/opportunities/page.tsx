// app/crm/opportunities/page.tsx
export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import KanbanBoard from "./ui/KanbanBoard";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

export type OppCard = {
  id: string;
  title: string | null;
  amount_cents: number | null;
  source: string | null;
  priority: string | null;
  contact_name: string | null;
  contact_method: string | null;
};

type OppRow = {
  id: string;
  title: string | null;
  stage: string | null;
  amount_cents: number | null;
  source: string | null;
  priority: string | null;
  contact_person_id: string | null;
};

type PersonRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
};

const FALLBACK_STAGE_KEYS = ["new", "contacted", "qualified", "proposal", "won", "lost"];
const FALLBACK_STAGE_LABELS: Record<string, string> = {
  new: "New", contacted: "Contacted", qualified: "Qualified",
  proposal: "Proposal", won: "Won", lost: "Lost",
};

export default async function OpportunitiesPage() {
  const { id: tenantId } = await getTenant();
  const sb = makeSb(tenantId);

  // 1) Load stages
  const { data: stagesData } = await sb
    .from("opportunity_stages")
    .select("key,label,order_index")
    .eq("tenant_id", tenantId)
    .order("order_index", { ascending: true });

  const stageKeys: string[] =
    Array.isArray(stagesData) && stagesData.length > 0
      ? (stagesData as any[]).map((s) => String(s.key))
      : FALLBACK_STAGE_KEYS;

  const stageLabels: Record<string, string> =
    Array.isArray(stagesData) && stagesData.length > 0
      ? Object.fromEntries((stagesData as any[]).map((s) => [String(s.key), String(s.label || s.key)]))
      : FALLBACK_STAGE_LABELS;

  // 2) Load opportunities
  const { data: oppsData } = await sb
    .from("opportunities")
    .select("id,title,stage,amount_cents,source,priority,contact_person_id")
    .eq("tenant_id", tenantId)
    .in("stage", stageKeys);

  const opps: OppRow[] = Array.isArray(oppsData) ? [...(oppsData as OppRow[])] : [];

  // 3) Batch-fetch contact people
  const personIds = [...new Set(opps.map((o) => o.contact_person_id).filter(Boolean))] as string[];
  const personMap = new Map<string, PersonRow>();
  if (personIds.length > 0) {
    const { data: pData } = await sb
      .from("people")
      .select("id,first_name,last_name,phone,email")
      .in("id", personIds);
    if (Array.isArray(pData)) {
      for (const p of pData as PersonRow[]) personMap.set(p.id, p);
    }
  }

  // 4) Build card map
  const itemsByStage: Record<string, OppCard[]> = {};
  for (const k of stageKeys) itemsByStage[k] = [];

  for (const o of opps) {
    const k = o.stage && stageKeys.includes(o.stage) ? o.stage : stageKeys[0];
    const p = o.contact_person_id ? personMap.get(o.contact_person_id) : undefined;
    const contact_name = p
      ? [p.first_name, p.last_name].filter(Boolean).join(" ") || null
      : null;
    const contact_method = p ? (p.phone || p.email || null) : null;
    itemsByStage[k].push({
      id: o.id,
      title: o.title,
      amount_cents: o.amount_cents,
      source: o.source,
      priority: o.priority,
      contact_name,
      contact_method,
    });
  }

  return (
    <section className="stack">
      <div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Opportunities</h1>
        <p className="text-dim" style={{ marginTop: 4 }}>Drag items between stages.</p>
      </div>
      <div className="crm-board-rail">
        <div className="crm-board-inner">
          <KanbanBoard
            stageKeys={stageKeys}
            stageLabels={stageLabels}
            itemsByStage={itemsByStage}
          />
        </div>
      </div>
    </section>
  );
}
