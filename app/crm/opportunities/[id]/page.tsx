// app/crm/opportunities/[id]/page.tsx
export const dynamic = "force-dynamic";

import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import {
  OppFieldEditor,
  OppPeopleSection,
  OppUsersSection,
  OppItemsSection,
} from "./ui/OppDetailClient";
import RemindersSection from "@/app/components/crm/RemindersSection";
import type {
  OppData,
  PersonEntry,
  UserEntry,
  ItemEntry,
  ProductOption,
  TenantUser,
} from "./ui/OppDetailClient";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

type Params = { params: Promise<{ id: string }> };

const PRIORITY_COLOR: Record<string, string> = {
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#6b7280",
};

const SB_URL = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_KEY = () =>
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function sbHeaders() {
  return {
    Authorization: `Bearer ${SB_KEY()}`,
    apikey: SB_KEY(),
    "Content-Type": "application/json",
  };
}

export default async function OpportunityDetail({ params }: Params) {
  const { id: tenantId } = await getTenant();
  const sb = makeSb(tenantId);
  const { id: oppId } = await params;

  // ── 1. Opportunity ──────────────────────────────────────────────────────────
  const { data: oppRaw, error: oppErr } = await sb
    .from("opportunities")
    .select("id,title,stage,amount_cents,description,notes,priority,source,due_at,stop_id,contact_person_id")
    .eq("tenant_id", tenantId)
    .eq("id", oppId)
    .single();

  if (oppErr || !oppRaw) {
    return (
      <section style={{ padding: 24 }}>
        <Link href="/crm/opportunities" style={{ fontSize: 13, opacity: 0.6 }}>← Back</Link>
        <p style={{ marginTop: 16, opacity: 0.6 }}>Opportunity not found.</p>
      </section>
    );
  }

  const opp: OppData = {
    id: oppRaw.id,
    title: oppRaw.title,
    stage: oppRaw.stage,
    amount_cents: oppRaw.amount_cents,
    description: oppRaw.description,
    notes: oppRaw.notes,
    priority: (oppRaw as any).priority ?? null,
    source: (oppRaw as any).source ?? null,
    due_at: (oppRaw as any).due_at ?? null,
  };

  // ── 2. Stages (for the stage dropdown) ─────────────────────────────────────
  const { data: stagesData } = await sb
    .from("opportunity_stages")
    .select("key,label")
    .eq("tenant_id", tenantId)
    .order("order_index", { ascending: true });

  const stages =
    Array.isArray(stagesData) && stagesData.length > 0
      ? stagesData.map((s: any) => ({ key: s.key, label: s.label || s.key }))
      : [
          { key: "new", label: "New" },
          { key: "contacted", label: "Contacted" },
          { key: "qualified", label: "Qualified" },
          { key: "proposal", label: "Proposal" },
          { key: "won", label: "Won" },
          { key: "lost", label: "Lost" },
        ];

  // ── 3. People ───────────────────────────────────────────────────────────────
  // Primary contact
  const people: PersonEntry[] = [];

  if (oppRaw.contact_person_id) {
    const { data: prim } = await sb
      .from("people")
      .select("id,first_name,last_name,phone,email")
      .eq("id", oppRaw.contact_person_id)
      .single();
    if (prim) {
      people.push({
        id: prim.id,
        name: [prim.first_name, prim.last_name].filter(Boolean).join(" ") || prim.email || prim.id,
        phone: prim.phone,
        email: prim.email,
        is_primary: true,
      });
    }
  }

  // Additional people from opportunity_people
  const { data: oppPeople } = await sb
    .from("opportunity_people")
    .select("person_id,role")
    .eq("tenant_id", tenantId)
    .eq("opportunity_id", oppId);

  if (Array.isArray(oppPeople) && oppPeople.length > 0) {
    const extraIds = oppPeople
      .map((x: any) => x.person_id)
      .filter((id: string) => id !== oppRaw.contact_person_id);
    if (extraIds.length > 0) {
      const { data: extras } = await sb
        .from("people")
        .select("id,first_name,last_name,phone,email")
        .in("id", extraIds);
      if (Array.isArray(extras)) {
        for (const p of extras as any[]) {
          people.push({
            id: p.id,
            name: [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email || p.id,
            phone: p.phone,
            email: p.email,
            is_primary: false,
          });
        }
      }
    }
  }

  // ── 4. Assigned users ───────────────────────────────────────────────────────
  const { data: oppUsers } = await sb
    .from("opportunity_users")
    .select("user_id,role")
    .eq("tenant_id", tenantId)
    .eq("opportunity_id", oppId);

  const assignedUserIds = Array.isArray(oppUsers)
    ? (oppUsers as any[]).map((u) => u.user_id as string)
    : [];

  // Fetch display names from auth admin API
  const assignedUsers: UserEntry[] = [];
  if (assignedUserIds.length > 0) {
    const authUsers = await Promise.all(
      assignedUserIds.map(async (uid) => {
        const r = await fetch(`${SB_URL()}/auth/v1/admin/users/${uid}`, { headers: sbHeaders() });
        return r.ok ? r.json() : null;
      })
    );
    for (const au of authUsers) {
      if (!au) continue;
      const match = (oppUsers as any[]).find((u) => u.user_id === au.id);
      assignedUsers.push({
        user_id: au.id,
        display: au.user_metadata?.name || au.user_metadata?.full_name || au.email || au.id,
        role: match?.role ?? "collaborator",
      });
    }
  }

  // Tenant users (for the "add user" dropdown)
  let tenantUsers: TenantUser[] = [];
  try {
    const res = await fetch(
      `${SB_URL()}/rest/v1/user_tenants?tenant_id=eq.${tenantId}&status=in.(active,invited)&select=user_id`,
      { headers: sbHeaders() }
    );
    if (res.ok) {
      const rows: { user_id: string }[] = await res.json();
      const authAll = await Promise.all(
        rows.map(async (r) => {
          const ar = await fetch(`${SB_URL()}/auth/v1/admin/users/${r.user_id}`, { headers: sbHeaders() });
          return ar.ok ? ar.json() : null;
        })
      );
      tenantUsers = authAll
        .filter(Boolean)
        .map((u: any) => ({
          id: u.id,
          display: u.user_metadata?.name || u.user_metadata?.full_name || u.email || u.id,
        }));
    }
  } catch {
    // non-fatal — show no tenant users in dropdown
  }

  // ── 5. Order items ──────────────────────────────────────────────────────────
  const { data: itemsData } = await sb
    .from("order_items")
    .select("id,product_id,quantity,unit_price_cents")
    .eq("tenant_id", tenantId)
    .eq("opportunity_id", oppId);

  const productIds = Array.isArray(itemsData)
    ? [...new Set((itemsData as any[]).map((i) => i.product_id))]
    : [];

  const prodMap = new Map<string, { name: string; sku: string | null }>();
  if (productIds.length > 0) {
    const { data: prods } = await sb
      .from("products")
      .select("id,name,sku")
      .in("id", productIds);
    if (Array.isArray(prods)) {
      for (const p of prods as any[]) prodMap.set(p.id, { name: p.name, sku: p.sku });
    }
  }

  const items: ItemEntry[] = Array.isArray(itemsData)
    ? (itemsData as any[]).map((i) => ({
        id: i.id,
        product_id: i.product_id,
        product_name: prodMap.get(i.product_id)?.name ?? "Unknown",
        sku: prodMap.get(i.product_id)?.sku ?? null,
        quantity: i.quantity,
        unit_price_cents: i.unit_price_cents ?? 0,
      }))
    : [];

  // Active products for the "add item" dropdown
  const { data: prodsData } = await sb
    .from("products")
    .select("id,name,sku,retail_cents")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .order("name");

  const products: ProductOption[] = Array.isArray(prodsData)
    ? (prodsData as any[]).map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        retail_cents: p.retail_cents,
      }))
    : [];

  // ── 6. Originating stop ─────────────────────────────────────────────────────
  type StopRow = { id: string; stop_at: string; channel: string; result: string; notes: string | null };
  let stop: StopRow | null = null;
  if ((oppRaw as any).stop_id) {
    const { data: stopData } = await sb
      .from("stops")
      .select("id,stop_at,channel,result,notes")
      .eq("id", (oppRaw as any).stop_id)
      .single();
    stop = stopData as StopRow | null;
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const totalCents = items.reduce((sum, i) => sum + i.unit_price_cents * i.quantity, 0);

  return (
    <section style={{ padding: "16px 20px", maxWidth: 900 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <Link
          href="/crm/opportunities"
          style={{ fontSize: 13, opacity: 0.5, textDecoration: "none", whiteSpace: "nowrap" }}
        >
          ← Opportunities
        </Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {opp.title ?? "(Untitled)"}
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, opacity: 0.55, textTransform: "capitalize" }}>
              {opp.stage ?? "new"}
            </span>
            {opp.priority && PRIORITY_COLOR[opp.priority] && (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                fontSize: 11, textTransform: "capitalize",
              }}>
                <span style={{
                  width: 7, height: 7, borderRadius: "50%",
                  background: PRIORITY_COLOR[opp.priority],
                  display: "inline-block",
                }} />
                {opp.priority}
              </span>
            )}
            {opp.source && (
              <span style={{ fontSize: 11, opacity: 0.45, textTransform: "capitalize" }}>
                via {opp.source}
              </span>
            )}
            {totalCents > 0 && (
              <span style={{ fontSize: 12, fontWeight: 700 }}>
                ${(totalCents / 100).toLocaleString()}
              </span>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gap: 16 }}>
        {/* Editable details */}
        <OppFieldEditor opp={opp} stages={stages} />

        {/* People */}
        <OppPeopleSection opportunityId={oppId} people={people} />

        {/* Assigned users */}
        <OppUsersSection
          opportunityId={oppId}
          assignedUsers={assignedUsers}
          tenantUsers={tenantUsers}
        />

        {/* Order items */}
        <OppItemsSection
          opportunityId={oppId}
          items={items}
          products={products}
        />

        {/* Reminders */}
        <div style={{
          background: "rgba(255,255,255,.03)",
          border: "1px solid rgba(255,255,255,.08)",
          borderRadius: 10,
          padding: "16px 18px",
        }}>
          <RemindersSection opportunityId={oppId} />
        </div>

        {/* Stops history */}
        {stop && (
          <div style={{
            background: "rgba(255,255,255,.03)",
            border: "1px solid rgba(255,255,255,.08)",
            borderRadius: 10,
            padding: "16px 18px",
          }}>
            <span style={{ fontWeight: 700, fontSize: 15, display: "block", marginBottom: 12 }}>
              Originating Stop
            </span>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 13 }}>
              <span style={{ opacity: 0.6 }}>
                {new Date(stop.stop_at).toLocaleString()}
              </span>
              <span style={{ textTransform: "capitalize", opacity: 0.8 }}>{stop.channel}</span>
              <span style={{ textTransform: "capitalize", fontWeight: 600 }}>
                {stop.result.replace(/_/g, " ")}
              </span>
              {stop.notes && (
                <span style={{ opacity: 0.6 }}>{stop.notes}</span>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
