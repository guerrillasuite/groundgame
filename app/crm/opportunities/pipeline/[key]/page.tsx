export const dynamic = "force-dynamic";

import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import KanbanBoard from "../../ui/KanbanBoard";
import CreateOpportunityButton from "../../CreateOpportunityButton";
import type { OppCard } from "../../page";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

type Params = { params: { key: string } };

export default async function PipelinePage({ params }: Params) {
  const contactTypeKey = params.key;
  const { id: tenantId } = await getTenant();
  const sb = makeSb(tenantId);

  // 1) Load the contact type label
  const { data: ctRow } = await sb
    .from("tenant_contact_types")
    .select("key, label")
    .eq("tenant_id", tenantId)
    .eq("key", contactTypeKey)
    .maybeSingle();

  const ctLabel = (ctRow as any)?.label ?? contactTypeKey;

  // 2) Load this contact type's stages
  const { data: stagesData } = await sb
    .from("opportunity_stages")
    .select("key, label, order_index")
    .eq("tenant_id", tenantId)
    .eq("contact_type_key", contactTypeKey)
    .order("order_index", { ascending: true });

  const stages: { key: string; label: string; order_index: number }[] =
    Array.isArray(stagesData) ? [...stagesData] : [];

  if (stages.length === 0) {
    return (
      <section className="stack" style={{ maxWidth: 600 }}>
        <Link href="/crm/opportunities" style={{ fontSize: 13, color: "var(--gg-text-dim, #6b7280)", textDecoration: "none" }}>
          ← Opportunities
        </Link>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{ctLabel}</h1>
        <p style={{ opacity: 0.5 }}>
          No pipeline stages configured for this contact type.{" "}
          <Link href="/crm/settings/contact-types" style={{ color: "var(--gg-primary, #2563eb)" }}>
            Configure stages →
          </Link>
        </p>
      </section>
    );
  }

  const stageKeys = stages.map((s) => s.key);
  const stageLabels = Object.fromEntries(stages.map((s) => [s.key, s.label]));

  // 3) Load opportunities for this contact type
  const { data: oppsData } = await sb
    .from("opportunities")
    .select("id, title, stage, amount_cents, source, priority, contact_person_id")
    .eq("tenant_id", tenantId)
    .eq("pipeline", contactTypeKey);

  const opps: { id: string; title: string | null; stage: string | null; amount_cents: number | null; source: string | null; priority: string | null; contact_person_id: string | null }[] =
    Array.isArray(oppsData) ? [...oppsData] : [];

  // 4) Batch-fetch contact people
  const personIds = [...new Set(opps.map((o) => o.contact_person_id).filter(Boolean))] as string[];
  const personMap = new Map<string, { first_name: string | null; last_name: string | null; phone: string | null; email: string | null }>();
  if (personIds.length > 0) {
    const { data: pData } = await sb
      .from("people")
      .select("id, first_name, last_name, phone, email")
      .in("id", personIds);
    if (Array.isArray(pData)) {
      for (const p of pData as any[]) personMap.set(p.id, p);
    }
  }

  // 5) Build card map
  const itemsByStage: Record<string, OppCard[]> = {};
  for (const k of stageKeys) itemsByStage[k] = [];

  for (const o of opps) {
    const stageKey = o.stage && stageKeys.includes(o.stage) ? o.stage : stageKeys[0];
    const p = o.contact_person_id ? personMap.get(o.contact_person_id) : undefined;
    const contact_name = p ? [p.first_name, p.last_name].filter(Boolean).join(" ") || null : null;
    const contact_method = p ? (p.phone || p.email || null) : null;
    itemsByStage[stageKey].push({
      id: o.id,
      title: o.title,
      amount_cents: o.amount_cents,
      source: o.source,
      priority: o.priority,
      contact_name,
      contact_method,
    });
  }

  const totalOpps = opps.length;

  return (
    <section className="stack">
      <Link href="/crm/opportunities" style={{ fontSize: 13, color: "var(--gg-text-dim, #6b7280)", textDecoration: "none" }}>
        ← All Pipelines
      </Link>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{ctLabel}</h1>
          <p className="text-dim" style={{ marginTop: 4 }}>
            {totalOpps} opportunit{totalOpps !== 1 ? "ies" : "y"} · {stages.length} stage{stages.length !== 1 ? "s" : ""}
          </p>
        </div>
        <CreateOpportunityButton />
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
