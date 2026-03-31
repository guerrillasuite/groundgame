// app/crm/opportunities/page.tsx
export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import Link from "next/link";
import KanbanBoard from "./ui/KanbanBoard";
import CreateOpportunityButton from "./CreateOpportunityButton";

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
  contact_type: string | null;
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

type ContactTypeRow = {
  key: string;
  label: string;
  order_index: number;
};

type StageRow = {
  key: string;
  label: string;
  order_index: number;
  contact_type_key: string | null;
};

const FALLBACK_STAGE_KEYS = ["new", "contacted", "qualified", "proposal", "won", "lost"];
const FALLBACK_STAGE_LABELS: Record<string, string> = {
  new: "New", contacted: "Contacted", qualified: "Qualified",
  proposal: "Proposal", won: "Won", lost: "Lost",
};

export default async function OpportunitiesPage() {
  const { id: tenantId } = await getTenant();
  const sb = makeSb(tenantId);

  // 1) Load contact types
  const { data: ctData } = await sb
    .from("tenant_contact_types")
    .select("key, label, order_index")
    .eq("tenant_id", tenantId)
    .order("order_index", { ascending: true });

  const contactTypes: ContactTypeRow[] = Array.isArray(ctData) ? [...(ctData as ContactTypeRow[])] : [];

  // 2) Load all stages
  const { data: stagesData } = await sb
    .from("opportunity_stages")
    .select("key, label, order_index, contact_type_key")
    .eq("tenant_id", tenantId)
    .order("order_index", { ascending: true });

  const allStages: StageRow[] = Array.isArray(stagesData) ? [...(stagesData as StageRow[])] : [];

  // Group stages by contact_type_key
  const stagesByType: Record<string, StageRow[]> = {};
  for (const s of allStages) {
    const k = s.contact_type_key ?? "__uncategorized__";
    if (!stagesByType[k]) stagesByType[k] = [];
    stagesByType[k].push(s);
  }

  // 3) Load all opportunities
  const { data: oppsData } = await sb
    .from("opportunities")
    .select("id, title, stage, contact_type, amount_cents, source, priority, contact_person_id")
    .eq("tenant_id", tenantId);

  const opps: OppRow[] = Array.isArray(oppsData) ? [...(oppsData as OppRow[])] : [];

  // 4) Batch-fetch contact people
  const personIds = [...new Set(opps.map((o) => o.contact_person_id).filter(Boolean))] as string[];
  const personMap = new Map<string, PersonRow>();
  if (personIds.length > 0) {
    const { data: pData } = await sb
      .from("people")
      .select("id, first_name, last_name, phone, email")
      .in("id", personIds);
    if (Array.isArray(pData)) {
      for (const p of pData as PersonRow[]) personMap.set(p.id, p);
    }
  }

  // Helper: build OppCard from OppRow
  function toCard(o: OppRow, validStageKeys: string[], fallbackKey: string): [string, OppCard] {
    const stageKey = o.stage && validStageKeys.includes(o.stage) ? o.stage : fallbackKey;
    const p = o.contact_person_id ? personMap.get(o.contact_person_id) : undefined;
    const contact_name = p ? [p.first_name, p.last_name].filter(Boolean).join(" ") || null : null;
    const contact_method = p ? (p.phone || p.email || null) : null;
    return [stageKey, { id: o.id, title: o.title, amount_cents: o.amount_cents, source: o.source, priority: o.priority, contact_name, contact_method }];
  }

  // 5) Build sections
  type Section = {
    key: string;
    label: string;
    stageKeys: string[];
    stageLabels: Record<string, string>;
    itemsByStage: Record<string, OppCard[]>;
  };

  const sections: Section[] = [];

  // One section per configured contact type
  for (const ct of contactTypes) {
    const ctStages = stagesByType[ct.key] ?? [];
    const stageKeys = ctStages.map((s) => s.key);
    if (stageKeys.length === 0) continue; // skip types with no pipeline yet

    const stageLabels = Object.fromEntries(ctStages.map((s) => [s.key, s.label]));
    const itemsByStage: Record<string, OppCard[]> = {};
    for (const k of stageKeys) itemsByStage[k] = [];

    const ctOpps = opps.filter((o) => o.contact_type === ct.key);
    for (const o of ctOpps) {
      const [sk, card] = toCard(o, stageKeys, stageKeys[0]);
      itemsByStage[sk].push(card);
    }

    sections.push({ key: ct.key, label: ct.label, stageKeys, stageLabels, itemsByStage });
  }

  // Uncategorized section: opps with no contact_type, using untagged stages or fallback
  const uncatStages = stagesByType["__uncategorized__"] ?? [];
  const uncatStageKeys = uncatStages.length > 0 ? uncatStages.map((s) => s.key) : FALLBACK_STAGE_KEYS;
  const uncatStageLabels = uncatStages.length > 0
    ? Object.fromEntries(uncatStages.map((s) => [s.key, s.label]))
    : FALLBACK_STAGE_LABELS;

  const configuredTypeKeys = new Set(contactTypes.map((ct) => ct.key));
  const uncatOpps = opps.filter((o) => !o.contact_type || !configuredTypeKeys.has(o.contact_type));

  const uncatItemsByStage: Record<string, OppCard[]> = {};
  for (const k of uncatStageKeys) uncatItemsByStage[k] = [];
  for (const o of uncatOpps) {
    const [sk, card] = toCard(o, uncatStageKeys, uncatStageKeys[0]);
    uncatItemsByStage[sk].push(card);
  }

  const hasUncatOpps = uncatOpps.length > 0;
  // Show uncategorized section if there are opps or no contact types configured yet
  if (hasUncatOpps || sections.length === 0) {
    sections.push({
      key: "__uncategorized__",
      label: contactTypes.length > 0 ? "Uncategorized" : "All Opportunities",
      stageKeys: uncatStageKeys,
      stageLabels: uncatStageLabels,
      itemsByStage: uncatItemsByStage,
    });
  }

  const totalOpps = opps.length;

  return (
    <section className="stack">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Opportunities</h1>
          <p className="text-dim" style={{ marginTop: 4 }}>
            {totalOpps} total · {sections.length} pipeline{sections.length !== 1 ? "s" : ""}
            {contactTypes.length === 0 && (
              <> · <a href="/crm/settings/contact-types" style={{ color: "var(--gg-primary, #2563eb)" }}>Configure contact types</a> to set up pipelines</>
            )}
          </p>
        </div>
        <CreateOpportunityButton />
      </div>

      <div style={{ display: "grid", gap: 32 }}>
        {sections.map((section) => (
          <div key={section.key}>
            <div style={{ marginBottom: 10, display: "flex", alignItems: "baseline", gap: 10 }}>
              {section.key !== "__uncategorized__" ? (
                <Link
                  href={`/crm/opportunities/pipeline/${section.key}`}
                  style={{ margin: 0, fontSize: 15, fontWeight: 700, textDecoration: "none", color: "inherit" }}
                >
                  {section.label} →
                </Link>
              ) : (
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{section.label}</h2>
              )}
              <span style={{ fontSize: 12, opacity: 0.4 }}>
                {Object.values(section.itemsByStage).flat().length} opportunities
              </span>
            </div>
            <div className="crm-board-rail">
              <div className="crm-board-inner">
                <KanbanBoard
                  stageKeys={section.stageKeys}
                  stageLabels={section.stageLabels}
                  itemsByStage={section.itemsByStage}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
