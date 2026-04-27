import { createClient } from "@supabase/supabase-js";

// ── Design tokens ─────────────────────────────────────────────────────────────
export const S = {
  bg:        "rgb(10 13 20)",
  surface:   "rgb(14 18 28)",
  card:      "rgb(20 25 38)",
  border:    "rgba(255,255,255,.07)",
  text:      "rgb(236 240 245)",
  dim:       "rgb(100 116 139)",
  dimBright: "rgb(148 163 184)",
} as const;

export const card: React.CSSProperties = {
  background: S.card,
  border: `1px solid ${S.border}`,
  borderRadius: 12,
  padding: "20px 22px",
};

export const sectionLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.07em",
  color: S.dim,
  margin: "0 0 16px",
};

// ── Supabase client ───────────────────────────────────────────────────────────
export function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

// ── Stage colors ──────────────────────────────────────────────────────────────
export const STAGE_COLORS = [
  "#6366f1", "#8b5cf6", "#3b82f6", "#06b6d4", "#10b981", "#22c55e",
];
export const STAGE_TERMINAL: Record<string, string> = { won: "#22c55e", lost: "#6b7280" };

export function stageColor(key: string, idx: number, total: number): string {
  if (STAGE_TERMINAL[key]) return STAGE_TERMINAL[key];
  return STAGE_COLORS[Math.floor((idx / Math.max(total - 1, 1)) * (STAGE_COLORS.length - 1))];
}

// ── Helper functions ──────────────────────────────────────────────────────────
export function timeAgo(dateStr: string | null): string {
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

export function fmtCurrency(cents: number): string {
  if (cents === 0) return "";
  const n = cents / 100;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export function isOverdue(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

export function sitrepEffectiveDate(item: any): string | null {
  return item.item_type === "task" ? item.due_date : item.start_at;
}

export function fmtSitrepDate(item: any): string {
  const d = sitrepEffectiveDate(item);
  if (!d) return "—";
  const date = new Date(d);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const tmr = new Date(now); tmr.setDate(now.getDate() + 1);
  const timeStr = item.item_type !== "task"
    ? " · " + date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : "";
  if (isToday) return "Today" + timeStr;
  if (date.toDateString() === tmr.toDateString()) return "Tomorrow" + timeStr;
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) + timeStr;
}

export function groupItems(items: any[], groupBy: string): { label: string; items: any[] }[] | null {
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

// ── Sub-components ────────────────────────────────────────────────────────────
export function ProgressBar({ pct, color = "var(--gg-primary, #2563eb)" }: { pct: number; color?: string }) {
  const clamped = Math.min(100, Math.max(0, pct));
  const fill = pct >= 100 ? "#22c55e" : pct === 0 ? "rgba(255,255,255,.06)" : color;
  return (
    <div style={{ height: 5, borderRadius: 99, background: "rgba(255,255,255,.06)", overflow: "hidden" }}>
      <div style={{
        height: "100%",
        width: `${clamped}%`,
        background: fill,
        borderRadius: 99,
        transition: "width 0.3s ease",
        boxShadow: pct > 0 && pct < 100 ? `0 0 6px ${color}66` : "none",
      }} />
    </div>
  );
}

export function Dot({ color }: { color: string }) {
  return <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />;
}

// ── KPI pools ─────────────────────────────────────────────────────────────────
export const DEFAULT_ADMIN_KPIS = ["stops_today", "open_opps", "pipeline_value", "active_lists", "past_due_sitrep"];
export const DEFAULT_FIELD_KPIS = ["my_stops_today", "my_lists", "my_past_due", "contacts_reached_today", "active_ops"];
