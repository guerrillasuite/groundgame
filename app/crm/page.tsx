export const dynamic = "force-dynamic";

import Link from "next/link";
import { getTenant } from "@/lib/tenant";
import { getCrmUser } from "@/lib/crm-auth";
import { createClient } from "@supabase/supabase-js";
import { resolveDispoConfig, buildColorMap } from "@/lib/dispositionConfig";
import { getFamilyByKey, SYSTEM_TYPE_FAMILIES } from "@/lib/sitrep-colors";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtCurrency(cents: number): string {
  if (cents === 0) return "";
  const n = cents / 100;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  const now = new Date();
  const isOverdue = d < now;
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return "Today";
  const tmr = new Date(now); tmr.setDate(now.getDate() + 1);
  if (d.toDateString() === tmr.toDateString()) return "Tomorrow";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isOverdue(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

function sitrepEffectiveDate(item: any): string | null {
  return item.item_type === "task" ? item.due_date : item.start_at;
}

function fmtSitrepDate(item: any): string {
  const d = sitrepEffectiveDate(item);
  if (!d) return "—";
  const date = new Date(d);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const tmr = new Date(now); tmr.setDate(now.getDate() + 1);
  const timeStr = item.item_type !== "task"
    ? " · " + date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : "";
  if (isToday)                         return "Today" + timeStr;
  if (date.toDateString() === tmr.toDateString()) return "Tomorrow" + timeStr;
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) + timeStr;
}

function sitrepIcon(item: any, overdue: boolean): string {
  if (overdue) return "⚠";
  if (item.status === "in_progress") return "▶";
  if (item.item_type === "task")    return "○";
  return "📅";
}

function sitrepIconColor(item: any, overdue: boolean): string {
  if (overdue)                        return "#ef4444";
  if (item.status === "in_progress") return "#f59e0b";
  return "var(--gg-text-dim, #6b7280)";
}

// ── Stage color by position ───────────────────────────────────────────────────
const STAGE_COLORS = [
  "#6366f1", "#8b5cf6", "#3b82f6", "#06b6d4", "#10b981", "#22c55e",
];
const STAGE_TERMINAL: Record<string, string> = { won: "#22c55e", lost: "#6b7280" };

function stageColor(key: string, idx: number, total: number): string {
  if (STAGE_TERMINAL[key]) return STAGE_TERMINAL[key];
  return STAGE_COLORS[Math.floor((idx / Math.max(total - 1, 1)) * (STAGE_COLORS.length - 1))];
}

function groupItems(items: any[], groupBy: string): { label: string; items: any[] }[] | null {
  if (groupBy === "none") return null;
  const PRIO_ORDER = ["high", "medium", "low", "__none__"];
  const STATUS_ORDER = ["open", "in_progress", "done"];
  const map = new Map<string, any[]>();
  for (const item of items) {
    const key = groupBy === "type"     ? (item.item_type ?? "other")
              : groupBy === "status"   ? (item.status ?? "other")
              : groupBy === "priority" ? (item.priority ?? "__none__")
              : "—";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  const order = groupBy === "priority" ? PRIO_ORDER : groupBy === "status" ? STATUS_ORDER : null;
  const entries = [...map.entries()];
  if (order) entries.sort(([a], [b]) => {
    const ai = order.indexOf(a); const bi = order.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
  return entries.map(([key, grpItems]) => ({
    label: key === "__none__" ? "No Priority"
         : key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " "),
    items: grpItems,
  }));
}

// ── Sub-components ───────────────────────────────────────────────────────────

function ProgressBar({ pct, color = "var(--gg-primary, #2563eb)" }: { pct: number; color?: string }) {
  const clamped = Math.min(100, Math.max(0, pct));
  const fill = pct >= 100 ? "#22c55e" : pct === 0 ? "#e5e7eb" : color;
  return (
    <div style={{ height: 6, borderRadius: 99, background: "var(--gg-border, #e5e7eb)", overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${clamped}%`, background: fill, borderRadius: 99, transition: "width 0.3s" }} />
    </div>
  );
}

function Dot({ color }: { color: string }) {
  return <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />;
}

const card: React.CSSProperties = {
  background: "var(--gg-card, white)",
  border: "1px solid var(--gg-border, #e5e7eb)",
  borderRadius: "var(--radius, 10px)",
  padding: "18px 20px",
};

const sectionLabel: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, textTransform: "uppercase",
  letterSpacing: "0.07em", color: "var(--gg-text-dim, #6b7280)",
  margin: "0 0 14px",
};

// ── ADMIN DASHBOARD ───────────────────────────────────────────────────────────

async function AdminDashboard({ tenantId, tenantName, userName, settings }: { tenantId: string; tenantName: string; userName: string; settings: any }) {
  const sb = makeSb(tenantId);
  const colorMap = buildColorMap(resolveDispoConfig(settings ?? {}));
  const now = new Date().toISOString();

  const wCfg = {
    show_types: (settings?.sitrep_widget?.show_types ?? []) as string[],
    sort_by:    (settings?.sitrep_widget?.sort_by    ?? "due_date") as string,
    sort_dir:   (settings?.sitrep_widget?.sort_dir   ?? "asc")      as string,
    group_by:   (settings?.sitrep_widget?.group_by   ?? "none")     as string,
    max_items:  (settings?.sitrep_widget?.max_items  ?? 10)         as number,
  };
  const wDbSort = wCfg.sort_by === "priority" ? "created_at" : wCfg.sort_by;
  const wAsc    = wCfg.sort_dir === "asc";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let adminSitrepQ: any = sb.from("sitrep_items")
    .select("id, item_type, title, status, priority, due_date, start_at")
    .eq("tenant_id", tenantId)
    .in("status", ["open", "in_progress"])
    .neq("visibility", "private");
  if (wCfg.show_types.length > 0) adminSitrepQ = adminSitrepQ.in("item_type", wCfg.show_types);
  adminSitrepQ = adminSitrepQ.order(wDbSort, { ascending: wAsc, nullsFirst: false }).limit(wCfg.max_items);

  // Parallel fetches
  const [
    { count: peopleCount },
    { count: hhCount },
    { count: openOppCount },
    { count: listCount },
    { count: openSitrepCount },
    { data: stages },
    { data: opps },
    { data: recentLists },
    { data: surveys },
    { data: recentStopsRaw },
    { data: sitrepItemsRaw },
    { data: sitrepTypesRaw },
  ] = await Promise.all([
    sb.from("tenant_people").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId),
    sb.from("households").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId),
    sb.from("opportunities").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId).not("stage", "in", "(won,lost)"),
    sb.from("walklists").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId),
    sb.from("sitrep_items").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId).in("status", ["open", "in_progress"]),
    sb.from("opportunity_stages").select("key, label, order_index").eq("tenant_id", tenantId).order("order_index"),
    sb.from("opportunities").select("stage, amount_cents").eq("tenant_id", tenantId),
    sb.from("walklists").select("id, name, mode").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(10),
    sb.from("surveys").select("id, title").eq("tenant_id", tenantId).eq("active", true).limit(8),
    sb.from("stops").select("id, stop_at, result, person_id, channel, walklist_id").eq("tenant_id", tenantId).order("stop_at", { ascending: false }).limit(20),
    adminSitrepQ,
    sb.from("sitrep_item_types").select("slug, color").eq("tenant_id", tenantId),
  ]);

  const sitrepFamilyMap: Record<string, string[]> = {};
  for (const t of (sitrepTypesRaw ?? []) as any[]) {
    const fam = getFamilyByKey(t.color) ?? getFamilyByKey(SYSTEM_TYPE_FAMILIES[t.slug] ?? "blue")!;
    sitrepFamilyMap[t.slug] = fam.shades as unknown as string[];
  }
  function sitrepShades(item: any): string[] {
    return sitrepFamilyMap[item.item_type]
      ?? (getFamilyByKey(SYSTEM_TYPE_FAMILIES[item.item_type] ?? "blue")!.shades as unknown as string[]);
  }
  function sitrepRowBg(item: any): string { return sitrepShades(item)[3] + "55"; }
  function sitrepAccent(item: any): string { return sitrepShades(item)[2]; }

  let sitrepItems: any[] = [...(sitrepItemsRaw ?? [])];
  if (wCfg.sort_by === "priority") {
    const PRIO: Record<string, number> = { high: 0, medium: 1, low: 2 };
    sitrepItems.sort((a, b) => {
      const pa = PRIO[a.priority] ?? 3;
      const pb = PRIO[b.priority] ?? 3;
      return wCfg.sort_dir === "asc" ? pa - pb : pb - pa;
    });
  }
  const sitrepGroups = groupItems(sitrepItems, wCfg.group_by);

  function renderSitrepRow(item: any) {
    const overdue = isOverdue(sitrepEffectiveDate(item));
    const accent  = sitrepAccent(item);
    return (
      <Link key={item.id} href={`/crm/sitrep/${item.id}`} className="db-sitrep-row" style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "7px 10px", borderRadius: 7, textDecoration: "none",
        color: "#0f172a", background: sitrepRowBg(item),
        boxShadow: `inset 3px 0 0 0 ${accent}, 0 1px 3px rgba(0,0,0,.08)`,
        "--accent": accent,
      } as React.CSSProperties}>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</span>
        <span style={{ fontSize: 11, fontWeight: 700, flexShrink: 0, color: overdue ? "#991b1b" : "#64748b" }}>
          {overdue ? "PAST DUE" : fmtSitrepDate(item)}
        </span>
      </Link>
    );
  }

  const listIds = (recentLists ?? []).map((l: any) => l.id);
  const surveyIds = (surveys ?? []).map((s: any) => s.id);
  const stopPersonIds = [...new Set((recentStopsRaw ?? []).map((s: any) => s.person_id).filter(Boolean))];

  // Secondary fetches (dependent on first batch)
  const [listItemsRaw, listStopsRaw, surveySessionsRaw, stopPeopleRaw] = await Promise.all([
    listIds.length ? sb.from("walklist_items").select("walklist_id").eq("tenant_id", tenantId).in("walklist_id", listIds) : Promise.resolve({ data: [] }),
    listIds.length ? sb.from("stops").select("walklist_id, stop_at").eq("tenant_id", tenantId).in("walklist_id", listIds).order("stop_at", { ascending: false }) : Promise.resolve({ data: [] }),
    surveyIds.length ? sb.from("survey_sessions").select("survey_id, completed_at").in("survey_id", surveyIds) : Promise.resolve({ data: [] }),
    stopPersonIds.length ? sb.from("people").select("id, first_name, last_name").in("id", stopPersonIds.slice(0, 200)) : Promise.resolve({ data: [] }),
  ]);

  // Aggregate list progress
  const itemCounts = new Map<string, number>();
  const stopCounts = new Map<string, number>();
  const lastStopAt = new Map<string, string>();
  for (const r of (listItemsRaw.data ?? []) as any[]) itemCounts.set(r.walklist_id, (itemCounts.get(r.walklist_id) ?? 0) + 1);
  for (const r of (listStopsRaw.data ?? []) as any[]) {
    stopCounts.set(r.walklist_id, (stopCounts.get(r.walklist_id) ?? 0) + 1);
    if (!lastStopAt.has(r.walklist_id)) lastStopAt.set(r.walklist_id, r.stop_at);
  }

  // Aggregate survey progress
  const surveyTotal = new Map<string, number>();
  const surveyCompleted = new Map<string, number>();
  for (const r of (surveySessionsRaw.data ?? []) as any[]) {
    surveyTotal.set(r.survey_id, (surveyTotal.get(r.survey_id) ?? 0) + 1);
    if (r.completed_at) surveyCompleted.set(r.survey_id, (surveyCompleted.get(r.survey_id) ?? 0) + 1);
  }

  // Aggregate opp pipeline
  const stageList = (stages ?? []).length > 0 ? (stages as any[]) : [
    { key: "new", label: "New", order_index: 0 },
    { key: "contacted", label: "Contacted", order_index: 1 },
    { key: "qualified", label: "Qualified", order_index: 2 },
    { key: "proposal", label: "Proposal", order_index: 3 },
    { key: "won", label: "Won", order_index: 4 },
    { key: "lost", label: "Lost", order_index: 5 },
  ];
  const oppByStage = new Map<string, { count: number; amount: number }>();
  for (const o of (opps ?? []) as any[]) {
    const s = oppByStage.get(o.stage) ?? { count: 0, amount: 0 };
    s.count++;
    s.amount += o.amount_cents ?? 0;
    oppByStage.set(o.stage, s);
  }
  const maxOppCount = Math.max(1, ...Array.from(oppByStage.values()).map(v => v.count));

  // Stop person names
  const stopPersonMap = new Map<string, string>();
  for (const p of (stopPeopleRaw.data ?? []) as any[]) {
    stopPersonMap.set(p.id, `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Unknown");
  }

  // Red flags
  const overdueItems = (sitrepItemsRaw ?? []).filter((r: any) => isOverdue(sitrepEffectiveDate(r)));
  const staleLists = (recentLists ?? []).filter((l: any) => !stopCounts.has(l.id));
  const nearlyDoneLists = (recentLists ?? []).filter((l: any) => {
    const total = itemCounts.get(l.id) ?? 0;
    const done = stopCounts.get(l.id) ?? 0;
    return total > 0 && done / total >= 0.9;
  });
  const hasRedFlags = overdueItems.length > 0 || staleLists.length > 0 || nearlyDoneLists.length > 0;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <section className="stack" style={{ maxWidth: 900 }}>
      <style>{`
        .db-kpi:hover { background: var(--gg-bg, #f9fafb) !important; transform: translateY(-1px); }
        .db-list-row:hover { background: var(--gg-bg, #f9fafb) !important; }
        .db-stop-row:hover { background: var(--gg-bg, #f9fafb) !important; }
        .db-reminder-row:hover { background: var(--gg-bg, #f9fafb) !important; }
        .db-kpi { transition: background 0.15s, transform 0.15s; }
        .db-sitrep-row { transition: transform .12s ease, box-shadow .12s ease; }
        .db-sitrep-row:hover { transform: translateY(-1.5px) !important; box-shadow: inset 3px 0 0 0 var(--accent), 0 4px 14px rgba(0,0,0,.12) !important; }
      `}</style>

      {/* Header */}
      <div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>{greeting}{userName ? `, ${userName}` : ""} 👋</h1>
        <p style={{ margin: "4px 0 0", color: "var(--gg-text-dim, #6b7280)", fontSize: 14 }}>
          {tenantName} · {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </p>
      </div>

      {/* KPI Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
        {[
          { label: "People", value: (peopleCount ?? 0).toLocaleString(), href: "/crm/people", color: "#6366f1", icon: "👥" },
          { label: "Households", value: (hhCount ?? 0).toLocaleString(), href: "/crm/households", color: "#8b5cf6", icon: "🏠" },
          { label: "Open Opps", value: (openOppCount ?? 0).toLocaleString(), href: "/crm/opportunities", color: "#f59e0b", icon: "🎯" },
          { label: "Active Lists", value: (listCount ?? 0).toLocaleString(), href: "/crm/lists", color: "#10b981", icon: "📋" },
          { label: "SitRep Items", value: (openSitrepCount ?? 0).toLocaleString(), href: "/crm/sitrep", color: (openSitrepCount ?? 0) > 0 ? "#6366f1" : "#10b981", icon: "📋" },
        ].map(({ label, value, href, color, icon }) => (
          <Link key={href} href={href} className="db-kpi" style={{
            ...card,
            textDecoration: "none",
            color: "inherit",
            borderLeft: `3px solid ${color}`,
            cursor: "pointer",
            display: "block",
          }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>{icon}</div>
            <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1, color: "var(--gg-text, #111)" }}>{value}</div>
            <div style={{ fontSize: 12, color: "var(--gg-text-dim, #6b7280)", marginTop: 4, fontWeight: 500 }}>{label}</div>
          </Link>
        ))}
      </div>

      {/* ⚠ Red Flags */}
      {hasRedFlags && (
        <div style={{ ...card, borderLeft: "3px solid #f59e0b", background: "rgba(245,158,11,0.06)" }}>
          <p style={{ ...sectionLabel, color: "#b45309" }}>⚠ Attention Needed</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {overdueItems.length > 0 && (
              <Link href="/crm/sitrep" style={{ textDecoration: "none", color: "#b45309", fontSize: 13, fontWeight: 600 }}>
                🔴 {overdueItems.length} past-due item{overdueItems.length !== 1 ? "s" : ""} on the board — act now →
              </Link>
            )}
            {staleLists.map((l: any) => (
              <Link key={l.id} href={`/crm/lists/${l.id}`} style={{ textDecoration: "none", color: "#92400e", fontSize: 13 }}>
                📭 "{l.name}" has 0 stops — no one's worked it yet →
              </Link>
            ))}
            {nearlyDoneLists.map((l: any) => {
              const pct = Math.round(((stopCounts.get(l.id) ?? 0) / Math.max(1, itemCounts.get(l.id) ?? 0)) * 100);
              return (
                <Link key={l.id} href={`/crm/lists/${l.id}`} style={{ textDecoration: "none", color: "#065f46", fontSize: 13 }}>
                  🎉 "{l.name}" is {pct}% complete — almost done! →
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Opportunity Pipeline */}
      {stageList.length > 0 && (
        <div style={card}>
          <p style={sectionLabel}>🎯 Opportunity Pipeline</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {stageList.map((stage: any, i: number) => {
              const data = oppByStage.get(stage.key) ?? { count: 0, amount: 0 };
              const pct = (data.count / maxOppCount) * 100;
              const color = stageColor(stage.key, i, stageList.length);
              return (
                <Link key={stage.key} href="/crm/opportunities" style={{ textDecoration: "none", color: "inherit" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 13, color: "var(--gg-text-dim, #6b7280)", width: 110, flexShrink: 0, textAlign: "right" }}>
                      {stage.label}
                    </span>
                    <div style={{ flex: 1, height: 22, borderRadius: 4, background: "var(--gg-border, #e5e7eb)", overflow: "hidden", position: "relative" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 4, minWidth: data.count > 0 ? 4 : 0, transition: "width 0.4s" }} />
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", minWidth: 80 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--gg-text, #111)" }}>{data.count}</span>
                      {data.amount > 0 && <span style={{ fontSize: 11, color: color, fontWeight: 600 }}>{fmtCurrency(data.amount)}</span>}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Active Lists */}
      {(recentLists ?? []).length > 0 && (
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <p style={{ ...sectionLabel, margin: 0 }}>📋 Active Lists</p>
            <Link href="/crm/lists" style={{ fontSize: 12, color: "var(--gg-primary, #2563eb)", textDecoration: "none" }}>View all →</Link>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {(recentLists as any[]).map((list, i) => {
              const total = itemCounts.get(list.id) ?? 0;
              const done = Math.min(stopCounts.get(list.id) ?? 0, total);
              const pct = total > 0 ? (done / total) * 100 : 0;
              const last = lastStopAt.get(list.id);
              return (
                <Link key={list.id} href={`/crm/lists/${list.id}`} className="db-list-row" style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 12px", borderRadius: 7,
                  textDecoration: "none", color: "inherit",
                  borderTop: i > 0 ? "1px solid var(--gg-border, #f3f4f6)" : "none",
                }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                    background: list.mode === "call" ? "rgba(59,130,246,0.12)" : "rgba(16,185,129,0.12)",
                    color: list.mode === "call" ? "#2563eb" : "#059669",
                    flexShrink: 0,
                  }}>
                    {list.mode === "call" ? "📞 CALL" : "🚪 KNOCK"}
                  </span>
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {list.name ?? "(Unnamed)"}
                  </span>
                  <div style={{ width: 120, flexShrink: 0 }}>
                    <ProgressBar pct={pct} />
                  </div>
                  <span style={{ fontSize: 12, color: "var(--gg-text-dim, #6b7280)", flexShrink: 0, minWidth: 52, textAlign: "right" }}>
                    {total > 0 ? `${done}/${total}` : "empty"}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--gg-text-dim, #9ca3af)", flexShrink: 0, minWidth: 60, textAlign: "right" }}>
                    {last ? timeAgo(last) : "—"}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Survey Progress */}
      {(surveys ?? []).length > 0 && (
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <p style={{ ...sectionLabel, margin: 0 }}>📊 Survey Progress</p>
            <Link href="/crm/survey" style={{ fontSize: 12, color: "var(--gg-primary, #2563eb)", textDecoration: "none" }}>View all →</Link>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
            {(surveys as any[]).map((survey) => {
              const total = surveyTotal.get(survey.id) ?? 0;
              const done = surveyCompleted.get(survey.id) ?? 0;
              const pct = total > 0 ? (done / total) * 100 : 0;
              return (
                <Link key={survey.id} href={`/crm/survey/${survey.id}/results`} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
                  <div style={{ padding: "12px 14px", border: "1px solid var(--gg-border, #e5e7eb)", borderRadius: 8 }} className="db-list-row">
                    <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {survey.title}
                    </p>
                    <ProgressBar pct={pct} color="#8b5cf6" />
                    <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--gg-text-dim, #6b7280)" }}>
                      {done} completed · {total} total
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent Activity + Pending Reminders — side by side */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

        {/* Recent Stops */}
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <p style={{ ...sectionLabel, margin: 0 }}>⚡ Recent Activity</p>
            <Link href="/crm/stops" style={{ fontSize: 12, color: "var(--gg-primary, #2563eb)", textDecoration: "none" }}>All stops →</Link>
          </div>
          {(recentStopsRaw ?? []).length === 0
            ? <p style={{ fontSize: 13, color: "var(--gg-text-dim, #9ca3af)", fontStyle: "italic" }}>No stops recorded yet.</p>
            : (
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {(recentStopsRaw as any[]).slice(0, 12).map((stop, i) => {
                  const color = colorMap[stop.result] ?? "#9ca3af";
                  const name = stop.person_id ? (stopPersonMap.get(stop.person_id) ?? "Unknown") : "—";
                  return (
                    <div key={stop.id} className="db-stop-row" style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "7px 8px", borderRadius: 6,
                      borderTop: i > 0 ? "1px solid var(--gg-border, #f3f4f6)" : "none",
                    }}>
                      <Dot color={color} />
                      <span style={{ flex: 1, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                      <span style={{ fontSize: 11, color, fontWeight: 600, flexShrink: 0 }}>{stop.result ?? "—"}</span>
                      <span style={{ fontSize: 10, color: "var(--gg-text-dim, #9ca3af)", flexShrink: 0 }}>{timeAgo(stop.stop_at)}</span>
                    </div>
                  );
                })}
              </div>
            )
          }
        </div>

        {/* SitRep Widget */}
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <p style={{ ...sectionLabel, margin: 0 }}>📋 SitRep</p>
            <Link href="/crm/sitrep" style={{ fontSize: 12, color: "var(--gg-primary, #2563eb)", textDecoration: "none" }}>Full SitRep →</Link>
          </div>
          {sitrepItems.length === 0
            ? <p style={{ fontSize: 13, color: "var(--gg-text-dim, #9ca3af)", fontStyle: "italic" }}>All clear. Nothing on the board.</p>
            : sitrepGroups
              ? sitrepGroups.map(({ label, items: grpItems }) => (
                  <div key={label} style={{ marginBottom: 8 }}>
                    <div style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
                      textTransform: "uppercase", color: "var(--gg-text-dim, #9ca3af)",
                      marginBottom: 4, paddingLeft: 2,
                    }}>{label}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      {grpItems.map(renderSitrepRow)}
                    </div>
                  </div>
                ))
              : (
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {sitrepItems.map(renderSitrepRow)}
                </div>
              )
          }
        </div>
      </div>
    </section>
  );
}

// ── FIELD DASHBOARD ───────────────────────────────────────────────────────────

async function FieldDashboard({ tenantId, userId, userName, settings }: { tenantId: string; userId: string; userName: string; settings: any }) {
  const sb = makeSb(tenantId);
  const colorMap = buildColorMap(resolveDispoConfig(settings ?? {}));
  const now = new Date();
  const yesterday = new Date(now.getTime() - 86400000).toISOString();

  // My assigned walklist IDs
  const { data: assignments } = await sb
    .from("walklist_assignments")
    .select("walklist_id")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId);

  const myListIds = (assignments ?? []).map((a: any) => a.walklist_id).filter(Boolean);

  const wCfg = {
    show_types: (settings?.sitrep_widget?.show_types ?? []) as string[],
    sort_by:    (settings?.sitrep_widget?.sort_by    ?? "due_date") as string,
    sort_dir:   (settings?.sitrep_widget?.sort_dir   ?? "asc")      as string,
    group_by:   (settings?.sitrep_widget?.group_by   ?? "none")     as string,
    max_items:  (settings?.sitrep_widget?.max_items  ?? 10)         as number,
  };
  const wDbSort = wCfg.sort_by === "priority" ? "created_at" : wCfg.sort_by;
  const wAsc    = wCfg.sort_dir === "asc";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fieldSitrepQ: any = sb.from("sitrep_items")
    .select("id, item_type, title, status, priority, due_date, start_at, created_by, sitrep_assignments(user_id)")
    .eq("tenant_id", tenantId)
    .in("status", ["open", "in_progress"]);
  if (wCfg.show_types.length > 0) fieldSitrepQ = fieldSitrepQ.in("item_type", wCfg.show_types);
  fieldSitrepQ = fieldSitrepQ.order(wDbSort, { ascending: wAsc, nullsFirst: false }).limit(Math.min(wCfg.max_items * 5, 60));

  // Parallel fetches
  const [myListsRaw, myItemsRaw, myStopsRaw, mySitrepRaw, myRecentStopsRaw, myTypesRaw] = await Promise.all([
    myListIds.length
      ? sb.from("walklists").select("id, name, mode").in("id", myListIds)
      : Promise.resolve({ data: [] }),
    myListIds.length
      ? sb.from("walklist_items").select("walklist_id").eq("tenant_id", tenantId).in("walklist_id", myListIds)
      : Promise.resolve({ data: [] }),
    myListIds.length
      ? sb.from("stops").select("walklist_id, stop_at").eq("tenant_id", tenantId).in("walklist_id", myListIds).gte("stop_at", yesterday)
      : Promise.resolve({ data: [] }),
    fieldSitrepQ,
    myListIds.length
      ? sb.from("stops").select("id, stop_at, result, person_id, channel").eq("tenant_id", tenantId).in("walklist_id", myListIds).order("stop_at", { ascending: false }).limit(10)
      : Promise.resolve({ data: [] }),
    sb.from("sitrep_item_types").select("slug, color").eq("tenant_id", tenantId),
  ]);

  const myFamilyMap: Record<string, string[]> = {};
  for (const t of (myTypesRaw.data ?? []) as any[]) {
    const fam = getFamilyByKey(t.color) ?? getFamilyByKey(SYSTEM_TYPE_FAMILIES[t.slug] ?? "blue")!;
    myFamilyMap[t.slug] = fam.shades as unknown as string[];
  }
  function myShades(item: any): string[] {
    return myFamilyMap[item.item_type]
      ?? (getFamilyByKey(SYSTEM_TYPE_FAMILIES[item.item_type] ?? "blue")!.shades as unknown as string[]);
  }
  function mySitrepRowBg(item: any): string { return myShades(item)[3] + "55"; }
  function mySitrepAccent(item: any): string { return myShades(item)[2]; }

  // JS post-processing for widget settings (applied after user filter below)
  function applySitrepWidgetCfg(rawItems: any[]): { items: any[]; groups: ReturnType<typeof groupItems> } {
    let items = [...rawItems];
    if (wCfg.sort_by === "priority") {
      const PRIO: Record<string, number> = { high: 0, medium: 1, low: 2 };
      items.sort((a, b) => {
        const pa = PRIO[a.priority] ?? 3;
        const pb = PRIO[b.priority] ?? 3;
        return wCfg.sort_dir === "asc" ? pa - pb : pb - pa;
      });
    }
    items = items.slice(0, wCfg.max_items);
    return { items, groups: groupItems(items, wCfg.group_by) };
  }

  function renderMySitrepRow(item: any) {
    const overdue = isOverdue(sitrepEffectiveDate(item));
    const accent  = mySitrepAccent(item);
    return (
      <Link key={item.id} href={`/crm/sitrep/${item.id}`} className="db-sitrep-row" style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "7px 10px", borderRadius: 7, textDecoration: "none",
        color: "#0f172a", background: mySitrepRowBg(item),
        boxShadow: `inset 3px 0 0 0 ${accent}, 0 1px 3px rgba(0,0,0,.08)`,
        "--accent": accent,
      } as React.CSSProperties}>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</span>
        <span style={{ fontSize: 11, fontWeight: 700, flexShrink: 0, color: overdue ? "#991b1b" : "#64748b" }}>
          {overdue ? "PAST DUE" : fmtSitrepDate(item)}
        </span>
      </Link>
    );
  }

  // Aggregate list progress
  const itemCounts = new Map<string, number>();
  const stopCounts = new Map<string, number>();
  for (const r of (myItemsRaw.data ?? []) as any[]) itemCounts.set(r.walklist_id, (itemCounts.get(r.walklist_id) ?? 0) + 1);
  for (const r of (myStopsRaw.data ?? []) as any[]) stopCounts.set(r.walklist_id, (stopCounts.get(r.walklist_id) ?? 0) + 1);

  // Fetch person names for recent stops
  const stopPersonIds = [...new Set((myRecentStopsRaw.data ?? []).map((s: any) => s.person_id).filter(Boolean))];
  const stopPeopleRaw = stopPersonIds.length
    ? await sb.from("people").select("id, first_name, last_name").in("id", stopPersonIds)
    : { data: [] };
  const stopPersonMap = new Map<string, string>();
  for (const p of (stopPeopleRaw.data ?? []) as any[]) {
    stopPersonMap.set(p.id, `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Unknown");
  }

  // Quick stats
  const myListCount = myListIds.length;
  const myItemsAll = ((mySitrepRaw as any)?.data ?? mySitrepRaw ?? []).filter((item: any) =>
    item.created_by === userId || (item.sitrep_assignments ?? []).some((a: any) => a.user_id === userId)
  );
  const { items: myItems, groups: myGroups } = applySitrepWidgetCfg(myItemsAll);
  const overdueCount = myItemsAll.filter((item: any) => isOverdue(sitrepEffectiveDate(item))).length;

  // Count all stops today (reuse myStopsRaw which is last 24h)
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const stopsToday = (myStopsRaw.data ?? []).filter((s: any) => new Date(s.stop_at) >= todayStart).length;

  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const motivations = ["Time to make some contacts! 🔥", "Every stop counts. 💪", "Let's go! 🚀", "Make it happen. ⚡", "You got this! 🎯"];
  const motiveLine = stopsToday > 0
    ? `You've logged ${stopsToday} stop${stopsToday !== 1 ? "s" : ""} today. Keep it up! 🔥`
    : motivations[Math.floor(Math.random() * motivations.length)];

  return (
    <section className="stack" style={{ maxWidth: 740 }}>
      <style>{`
        .db-kpi:hover { background: var(--gg-bg, #f9fafb) !important; transform: translateY(-1px); }
        .db-list-row:hover { background: var(--gg-bg, #f9fafb) !important; }
        .db-stop-row:hover { background: var(--gg-bg, #f9fafb) !important; }
        .db-reminder-row:hover { background: var(--gg-bg, #f9fafb) !important; }
        .db-kpi { transition: background 0.15s, transform 0.15s; }
        .db-sitrep-row { transition: transform .12s ease, box-shadow .12s ease; }
        .db-sitrep-row:hover { transform: translateY(-1.5px) !important; box-shadow: inset 3px 0 0 0 var(--accent), 0 4px 14px rgba(0,0,0,.12) !important; }
      `}</style>

      {/* Header */}
      <div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>{greeting}{userName ? `, ${userName.split(" ")[0]}` : ""}! 👋</h1>
        <p style={{ margin: "4px 0 0", color: "var(--gg-text-dim, #6b7280)", fontSize: 14 }}>
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} · {motiveLine}
        </p>
      </div>

      {/* Quick Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {[
          { label: "My Lists", value: myListCount, href: "/crm/lists", color: "#10b981", icon: "📋" },
          { label: "Past Due", value: overdueCount, href: "/crm/sitrep", color: overdueCount > 0 ? "#ef4444" : "#10b981", icon: "⚠" },
          { label: "Stops Today", value: stopsToday, href: "/crm/stops", color: "#6366f1", icon: "⚡" },
        ].map(({ label, value, href, color, icon }) => (
          <Link key={href} href={href} className="db-kpi" style={{
            ...card, textDecoration: "none", color: "inherit",
            borderLeft: `3px solid ${color}`, cursor: "pointer", display: "block",
          }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>{icon}</div>
            <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1, color: "var(--gg-text, #111)" }}>{value}</div>
            <div style={{ fontSize: 12, color: "var(--gg-text-dim, #6b7280)", marginTop: 4, fontWeight: 500 }}>{label}</div>
          </Link>
        ))}
      </div>

      {/* My Lists */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <p style={{ ...sectionLabel, margin: 0 }}>📋 My Lists</p>
          <Link href="/crm/lists" style={{ fontSize: 12, color: "var(--gg-primary, #2563eb)", textDecoration: "none" }}>All lists →</Link>
        </div>
        {myListIds.length === 0
          ? <p style={{ fontSize: 14, color: "var(--gg-text-dim, #9ca3af)", fontStyle: "italic" }}>No lists assigned yet — check with your admin 📭</p>
          : (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {(myListsRaw.data as any[] ?? []).map((list, i) => {
                const total = itemCounts.get(list.id) ?? 0;
                const done = Math.min(stopCounts.get(list.id) ?? 0, total);
                const pct = total > 0 ? (done / total) * 100 : 0;
                return (
                  <Link key={list.id} href={`/crm/lists/${list.id}`} className="db-list-row" style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "12px 12px", borderRadius: 7,
                    textDecoration: "none", color: "inherit",
                    borderTop: i > 0 ? "1px solid var(--gg-border, #f3f4f6)" : "none",
                  }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                      background: list.mode === "call" ? "rgba(59,130,246,0.12)" : "rgba(16,185,129,0.12)",
                      color: list.mode === "call" ? "#2563eb" : "#059669", flexShrink: 0,
                    }}>
                      {list.mode === "call" ? "📞" : "🚪"}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{list.name}</p>
                      <ProgressBar pct={pct} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, flexShrink: 0, color: pct >= 100 ? "#22c55e" : "var(--gg-text, #111)" }}>
                      {total > 0 ? `${Math.round(pct)}%` : "—"}
                    </span>
                  </Link>
                );
              })}
            </div>
          )
        }
      </div>

      {/* Reminders + Recent Stops side by side */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

        {/* SitRep Widget */}
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <p style={{ ...sectionLabel, margin: 0 }}>📋 SitRep</p>
            <Link href="/crm/sitrep" style={{ fontSize: 12, color: "var(--gg-primary, #2563eb)", textDecoration: "none" }}>Full SitRep →</Link>
          </div>
          {myItems.length === 0
            ? <p style={{ fontSize: 13, color: "var(--gg-text-dim, #9ca3af)", fontStyle: "italic" }}>All clear. Nothing on the board.</p>
            : myGroups
              ? myGroups.map(({ label, items: grpItems }) => (
                  <div key={label} style={{ marginBottom: 8 }}>
                    <div style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
                      textTransform: "uppercase", color: "var(--gg-text-dim, #9ca3af)",
                      marginBottom: 4, paddingLeft: 2,
                    }}>{label}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      {grpItems.map(renderMySitrepRow)}
                    </div>
                  </div>
                ))
              : (
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {myItems.map(renderMySitrepRow)}
                </div>
              )
          }
        </div>

        {/* Recent Stops */}
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <p style={{ ...sectionLabel, margin: 0 }}>⚡ My Recent Stops</p>
          </div>
          {(myRecentStopsRaw.data ?? []).length === 0
            ? <p style={{ fontSize: 13, color: "var(--gg-text-dim, #9ca3af)", fontStyle: "italic" }}>No stops yet — time to hit the doors! 🚪</p>
            : (myRecentStopsRaw.data as any[]).map((stop, i) => {
                const color = colorMap[stop.result] ?? "#9ca3af";
                const name = stop.person_id ? (stopPersonMap.get(stop.person_id) ?? "Person") : "—";
                const href = stop.person_id ? `/crm/people/${stop.person_id}` : "#";
                return (
                  <Link key={stop.id} href={href} className="db-stop-row" style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "7px 8px",
                    borderRadius: 6, textDecoration: "none", color: "inherit",
                    borderTop: i > 0 ? "1px solid var(--gg-border, #f3f4f6)" : "none",
                  }}>
                    <Dot color={color} />
                    <span style={{ flex: 1, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                    <span style={{ fontSize: 11, color, fontWeight: 600, flexShrink: 0 }}>{stop.result ?? "—"}</span>
                    <span style={{ fontSize: 10, color: "var(--gg-text-dim, #9ca3af)", flexShrink: 0 }}>{timeAgo(stop.stop_at)}</span>
                  </Link>
                );
              })
          }
        </div>
      </div>
    </section>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default async function CrmHome() {
  const [tenant, crmUser] = await Promise.all([getTenant(), getCrmUser()]);
  const tenantName = (tenant.branding as any)?.appName ?? tenant.slug ?? "GroundGame";

  if (!crmUser) {
    return (
      <section className="stack">
        <h1>Welcome to GroundGame</h1>
        <p>Please sign in to continue.</p>
      </section>
    );
  }

  // Fetch the user's display name from auth metadata
  const adminSb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { data: { user: authUser } } = await adminSb.auth.admin.getUserById(crmUser.userId);
  const userName = authUser?.user_metadata?.name ?? authUser?.user_metadata?.full_name ?? authUser?.email?.split("@")[0] ?? "";

  if (crmUser.isAdmin) {
    return <AdminDashboard tenantId={tenant.id} tenantName={tenantName} userName={userName} settings={(tenant as any).settings} />;
  }

  return <FieldDashboard tenantId={tenant.id} userId={crmUser.userId} userName={userName} settings={(tenant as any).settings} />;
}
