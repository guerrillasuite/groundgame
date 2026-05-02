"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import ListRow, { SitRepItem } from "./ListRow";
import ItemBottomSheet from "@/components/ItemBottomSheet";
import RescheduleSheet from "@/components/RescheduleSheet";
import { todayStr, addDays, localDateStr, effectiveDate } from "@/lib/date-utils";

const S = {
  bg:     "rgb(10 13 20)",
  text:   "rgb(236 240 245)",
  dim:    "rgb(100 116 139)",
  border: "rgba(255,255,255,.07)",
} as const;

type ItemType = { id: string; name: string; slug: string; color: string; sort_order: number };

interface ListPanelProps {
  userId: string;
  tenantId: string;
  initialTypes: ItemType[];
}

type Group = {
  key: string;
  label: string;
  color?: string;
  items: SitRepItem[];
  defaultCollapsed?: boolean;
};

function groupItems(items: SitRepItem[]): Group[] {
  const today    = todayStr();
  const tomorrow = addDays(today, 1);
  const weekEnd  = addDays(today, 7);

  const buckets: Record<string, SitRepItem[]> = {
    overdue: [], today: [], tomorrow: [], week: [],
    later: [], nodate: [], done: [], cancelled: [],
  };

  for (const item of items) {
    if (item.status === "done")      { buckets.done.push(item); continue; }
    if (item.status === "cancelled") { buckets.cancelled.push(item); continue; }
    const ed = effectiveDate(item);
    if (!ed) { buckets.nodate.push(item); continue; }
    // Use local date extraction so we compare in user's timezone
    const ds = ed.includes("T") ? localDateStr(ed) : ed;
    if (ds < today)      { buckets.overdue.push(item); continue; }
    if (ds === today)    { buckets.today.push(item); continue; }
    if (ds === tomorrow) { buckets.tomorrow.push(item); continue; }
    if (ds <= weekEnd)   { buckets.week.push(item); continue; }
    buckets.later.push(item);
  }

  const muted = S.dim;
  const result: Group[] = [];
  if (buckets.overdue.length)   result.push({ key: "overdue",   label: "Overdue",   color: "#ef4444",           items: buckets.overdue });
  if (buckets.today.length)     result.push({ key: "today",     label: "Today",     color: "rgb(245 158 11)",   items: buckets.today });
  if (buckets.tomorrow.length)  result.push({ key: "tomorrow",  label: "Tomorrow",  color: muted,               items: buckets.tomorrow });
  if (buckets.week.length)      result.push({ key: "week",      label: "This Week", color: muted,               items: buckets.week });
  if (buckets.later.length)     result.push({ key: "later",     label: "Later",     color: muted,               items: buckets.later });
  if (buckets.nodate.length)    result.push({ key: "nodate",    label: "No Date",   color: muted,               items: buckets.nodate });
  if (buckets.done.length)      result.push({ key: "done",      label: "Done",      color: "rgb(34 197 94)",    items: buckets.done,      defaultCollapsed: true });
  if (buckets.cancelled.length) result.push({ key: "cancelled", label: "Cancelled", color: muted,               items: buckets.cancelled, defaultCollapsed: true });
  return result;
}

export default function ListPanel({ userId, tenantId, initialTypes }: ListPanelProps) {
  const router = useRouter();

  // Detect browser timezone once on mount
  const [tz, setTz] = useState("UTC");
  useEffect(() => { setTz(Intl.DateTimeFormat().resolvedOptions().timeZone); }, []);

  const [items, setItems]             = useState<SitRepItem[]>([]);
  const [loading, setLoading]         = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set(["done", "cancelled"]));
  const [completing, setCompleting]   = useState<Set<string>>(new Set());

  // Sheet state
  const [sheetOpen, setSheetOpen]     = useState(false);
  const [sheetItem, setSheetItem]     = useState<SitRepItem | null>(null);
  const [sheetCreate, setSheetCreate] = useState(false);
  const [rescheduleItem, setRescheduleItem] = useState<SitRepItem | null>(null);

  const typeMap = Object.fromEntries(initialTypes.map((t) => [t.slug, t]));

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sitrep/items?tenantId=${tenantId}`);
      if (res.ok) {
        const data = await res.json();
        setItems(Array.isArray(data) ? [...data] : []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  async function handleComplete(item: SitRepItem) {
    if (item.status === "done") return;
    setCompleting((p) => new Set(p).add(item.id));
    try {
      await fetch(`/api/sitrep/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "done", tenantId }),
      });
      setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, status: "done" } : i));
    } catch { /* ignore */ }
    setTimeout(() => setCompleting((p) => { const n = new Set(p); n.delete(item.id); return n; }), 400);
  }

  function openItem(item: SitRepItem) {
    setSheetItem(item);
    setSheetCreate(false);
    setSheetOpen(true);
  }

  function openCreate() {
    setSheetItem(null);
    setSheetCreate(true);
    setSheetOpen(true);
  }

  function onSheetSaved(updated: SitRepItem) {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.id === updated.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = updated;
        return next;
      }
      return [updated, ...prev];
    });
    setSheetOpen(false);
  }

  function onSheetDeleted(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setSheetOpen(false);
  }

  async function onRescheduled(id: string, newDate: string) {
    try {
      await fetch(`/api/sitrep/items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ due_date: newDate, tenantId }),
      });
      setItems((prev) => prev.map((i) => i.id === id ? { ...i, due_date: newDate } : i));
    } catch { /* ignore */ }
    setRescheduleItem(null);
  }

  const groups = groupItems(items);

  return (
    <div style={{ minHeight: "100dvh", background: S.bg }}>
      {/* Sticky header */}
      <div style={{
        position: "sticky", top: 0, zIndex: 50,
        background: S.bg,
        borderBottom: `1px solid ${S.border}`,
        padding: "12px 16px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        paddingTop: "max(12px, env(safe-area-inset-top))",
      }}>
        <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em", color: S.text }}>
          SitRep
        </span>
        <button
          onClick={openCreate}
          style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "6px 12px", borderRadius: 8,
            border: "1px solid rgba(255,255,255,.1)",
            background: "color-mix(in srgb, var(--gg-primary, #2563eb) 18%, transparent)",
            color: "color-mix(in srgb, var(--gg-primary, #2563eb) 90%, #fff)",
            fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New
        </button>
      </div>

      {/* Body */}
      <div>
        {loading && items.length === 0 && (
          <div style={{ padding: 32, textAlign: "center", color: S.dim, fontSize: 14 }}>
            Loading…
          </div>
        )}

        {!loading && items.length === 0 && (
          <div style={{ padding: "64px 24px", textAlign: "center", color: S.dim }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: S.text, marginBottom: 6 }}>Nothing here yet</div>
            <div style={{ fontSize: 14 }}>Tap <strong>+ New</strong> to add something.</div>
          </div>
        )}

        {groups.map((group) => {
          const collapsed = collapsedGroups.has(group.key);
          return (
            <div key={group.key}>
              <div
                onClick={() => toggleGroup(group.key)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "10px 16px 6px", cursor: "pointer",
                }}
              >
                <span style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
                  textTransform: "uppercase", color: group.color ?? S.dim,
                }}>
                  {group.label}{collapsed ? ` (${group.items.length})` : ""}
                </span>
                <svg
                  width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke={S.dim} strokeWidth="2" strokeLinecap="round"
                  style={{ transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform .2s" }}
                >
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </div>

              {!collapsed && group.items.map((item) => {
                const t = typeMap[item.item_type];
                return (
                  <ListRow
                    key={item.id}
                    item={item}
                    typeColor={t?.color}
                    typeName={t?.name}
                    tz={tz}
                    onTap={() => openItem(item)}
                    onComplete={() => handleComplete(item)}
                    onReschedule={() => setRescheduleItem(item)}
                    completing={completing.has(item.id)}
                  />
                );
              })}
            </div>
          );
        })}
      </div>

      <ItemBottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        item={sheetItem}
        createMode={sheetCreate}
        types={initialTypes}
        tenantId={tenantId}
        userId={userId}
        tz={tz}
        onSaved={onSheetSaved}
        onDeleted={onSheetDeleted}
        onExpandItem={(id) => { setSheetOpen(false); router.push(`/item/${id}`); }}
      />

      <RescheduleSheet
        open={!!rescheduleItem}
        item={rescheduleItem}
        onClose={() => setRescheduleItem(null)}
        onRescheduled={onRescheduled}
      />
    </div>
  );
}
