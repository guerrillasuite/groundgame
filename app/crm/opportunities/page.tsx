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
  pipeline: string | null;
  amount_cents: number | null;
  source: string | null;
  priority: string | null;
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

  // 1) Load contact types, stages, opps, and opportunity_people in parallel
  const [
    { data: ctData },
    { data: stagesData },
    { data: oppsData },
    { data: oppPeopleData },
  ] = await Promise.all([
    sb.from("tenant_contact_types")
      .select("key, label, order_index")
      .eq("tenant_id", tenantId)
      .order("order_index", { ascending: true }),
    sb.from("opportunity_stages")
      .select("key, label, order_index, contact_type_key")
      .eq("tenant_id", tenantId)
      .order("order_index", { ascending: true }),
    sb.from("opportunities")
      .select("id, title, stage, pipeline, amount_cents, source, priority")
      .eq("tenant_id", tenantId),
    sb.from("opportunity_people")
      .select("opportunity_id, person_id, is_primary")
      .eq("tenant_id", tenantId),
  ]);

  const contactTypes: ContactTypeRow[] = Array.isArray(ctData) ? [...(ctData as ContactTypeRow[])] : [];
  const allStages: StageRow[] = Array.isArray(stagesData) ? [...(stagesData as StageRow[])] : [];
  const opps: OppRow[] = Array.isArray(oppsData) ? [...(oppsData as OppRow[])] : [];

  // 2) Build primary person map from opportunity_people
  type OppPersonRow = { opportunity_id: string; person_id: string; is_primary: boolean };
  const oppPeople = (Array.isArray(oppPeopleData) ? oppPeopleData : []) as OppPersonRow[];

  // Group by opp, prefer is_primary row, fall back to first
  const primaryPersonByOpp = new Map<string, string>();
  const byOpp = new Map<string, OppPersonRow[]>();
  for (const row of oppPeople) {
    if (!byOpp.has(row.opportunity_id)) byOpp.set(row.opportunity_id, []);
    byOpp.get(row.opportunity_id)!.push(row);
  }
  for (const [oppId, rows] of byOpp) {
    const primary = rows.find((r) => r.is_primary) ?? rows[0];
    if (primary) primaryPersonByOpp.set(oppId, primary.person_id);
  }

  // 3) Batch-fetch people for contact names
  const personIds = [...new Set(primaryPersonByOpp.values())];
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

  // Group stages by contact_type_key
  const stagesByType: Record<string, StageRow[]> = {};
  for (const s of allStages) {
    const k = s.contact_type_key ?? "__uncategorized__";
    if (!stagesByType[k]) stagesByType[k] = [];
    stagesByType[k].push(s);
  }

  // Helper: build OppCard from OppRow
  function toCard(o: OppRow, validStageKeys: string[], fallbackKey: string): [string, OppCard] {
    const stageKey = o.stage && validStageKeys.includes(o.stage) ? o.stage : fallbackKey;
    const pId = primaryPersonByOpp.get(o.id);
    const p = pId ? personMap.get(pId) : undefined;
    const contact_name = p ? [p.first_name, p.last_name].filter(Boolean).join(" ") || null : null;
    const contact_method = p ? (p.phone || p.email || null) : null;
    return [stageKey, { id: o.id, title: o.title, amount_cents: o.amount_cents, source: o.source, priority: o.priority, contact_name, contact_method }];
  }

  // 4) Build sections — one per contact type
  type Section = {
    key: string;
    label: string;
    stageKeys: string[];
    stageLabels: Record<string, string>;
    itemsByStage: Record<string, OppCard[]>;
  };

  const sections: Section[] = [];
  const configuredTypeKeys = new Set(contactTypes.map((ct) => ct.key));

  for (const ct of contactTypes) {
    const ctStages = stagesByType[ct.key] ?? [];
    const stageKeys = ctStages.length > 0 ? ctStages.map((s) => s.key) : FALLBACK_STAGE_KEYS;
    const stageLabels = ctStages.length > 0
      ? Object.fromEntries(ctStages.map((s) => [s.key, s.label]))
      : FALLBACK_STAGE_LABELS;
    const itemsByStage: Record<string, OppCard[]> = {};
    for (const k of stageKeys) itemsByStage[k] = [];

    const ctOpps = opps.filter((o) => o.pipeline === ct.key);
    for (const o of ctOpps) {
      const [sk, card] = toCard(o, stageKeys, stageKeys[0]);
      itemsByStage[sk].push(card);
    }

    sections.push({ key: ct.key, label: ct.label, stageKeys, stageLabels, itemsByStage });
  }

  // 5) Uncategorized: opps with no pipeline or an unrecognised pipeline
  const uncatStages = stagesByType["__uncategorized__"] ?? [];
  const uncatStageKeys = uncatStages.length > 0 ? uncatStages.map((s) => s.key) : FALLBACK_STAGE_KEYS;
  const uncatStageLabels = uncatStages.length > 0
    ? Object.fromEntries(uncatStages.map((s) => [s.key, s.label]))
    : FALLBACK_STAGE_LABELS;

  const uncatOpps = opps.filter((o) => !o.pipeline || !configuredTypeKeys.has(o.pipeline));

  const uncatItemsByStage: Record<string, OppCard[]> = {};
  for (const k of uncatStageKeys) uncatItemsByStage[k] = [];
  for (const o of uncatOpps) {
    const [sk, card] = toCard(o, uncatStageKeys, uncatStageKeys[0]);
    uncatItemsByStage[sk].push(card);
  }

  if (uncatOpps.length > 0 || sections.length === 0) {
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
