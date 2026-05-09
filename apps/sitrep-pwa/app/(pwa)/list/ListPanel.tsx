"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import ListRow, { SitRepItem, isItemOverdue } from "./ListRow";
import ItemBottomSheet from "@/components/ItemBottomSheet";
import RescheduleSheet from "@/components/RescheduleSheet";
import CalendarSwitcherDrawer from "@/components/CalendarSwitcherDrawer";
import { todayStr, addDays, localDateStr, effectiveDate } from "@/lib/date-utils";
import {
  filterItems,
  defaultContext,
  contextFromView,
  loadActiveViewId,
  saveActiveViewId,
  type CalendarContext,
  type SitRepView,
} from "@/lib/sitrep-calendar-filter";

const S = {
  bg:        "rgb(10 13 20)",
  surface:   "rgb(14 18 28)",
  text:      "rgb(236 240 245)",
  dim:       "rgb(100 116 139)",
  dimBright: "rgb(148 163 184)",
  border:    "rgba(255,255,255,.07)",
} as const;

type ItemType  = { id: string; name: string; slug: string; color: string; sort_order: number };
type SquadInfo = { id: string; name: string; color: string; tenantId: string; role: string };
type OrgInfo   = { id: string; name: string };

interface ListPanelProps {
  userId: string;
  tenantId: string;
  initialTypes: ItemType[];
  initialOrgs?: OrgInfo[];
}

type Group = {
  key: string;
  label: string;
  color: string;
  items: SitRepItem[];
};

function groupItems(items: SitRepItem[]): Group[] {
  const today    = todayStr();
  const tomorrow = addDays(today, 1);
  const weekEnd  = addDays(today, 7);
  const muted    = S.dim;

  const buckets: Record<string, SitRepItem[]> = {
    overdue: [], today: [], tomorrow: [], week: [],
    later: [], nodate: [], done: [], cancelled: [],
  };

  for (const item of items) {
    if (item.status === "done")      { buckets.done.push(item); continue; }
    if (item.status === "cancelled") { buckets.cancelled.push(item); continue; }
    const ed = effectiveDate(item);
    if (!ed) { buckets.nodate.push(item); continue; }
    const ds = ed.includes("T") ? localDateStr(ed) : ed;
    if (ds < today)      { buckets.overdue.push(item); continue; }
    if (ds === today)    { buckets.today.push(item); continue; }
    if (ds === tomorrow) { buckets.tomorrow.push(item); continue; }
    if (ds <= weekEnd)   { buckets.week.push(item); continue; }
    buckets.later.push(item);
  }

  const result: Group[] = [];
  if (buckets.overdue.length)   result.push({ key: "overdue",   label: "Overdue",   color: "rgb(239 68 68)",  items: buckets.overdue });
  if (buckets.today.length)     result.push({ key: "today",     label: "Today",     color: "rgb(245 158 11)", items: buckets.today });
  if (buckets.tomorrow.length)  result.push({ key: "tomorrow",  label: "Tomorrow",  color: muted,             items: buckets.tomorrow });
  if (buckets.week.length)      result.push({ key: "week",      label: "This Week", color: muted,             items: buckets.week });
  if (buckets.later.length)     result.push({ key: "later",     label: "Later",     color: muted,             items: buckets.later });
  if (buckets.nodate.length)    result.push({ key: "nodate",    label: "No Date",   color: muted,             items: buckets.nodate });
  if (buckets.done.length)      result.push({ key: "done",      label: "Done",      color: "rgb(34 197 94)",  items: buckets.done });
  if (buckets.cancelled.length) result.push({ key: "cancelled", label: "Cancelled", color: muted,             items: buckets.cancelled });
  return result;
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "5px 13px",
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
        whiteSpace: "nowrap",
        flexShrink: 0,
        transition: "transform .12s ease, box-shadow .12s ease",
        transform: !active && hovered ? "translateY(-1px)" : "",
        border: active
          ? "1px solid color-mix(in srgb, var(--gg-primary, #2563eb) 50%, transparent)"
          : "1px solid rgba(255,255,255,.07)",
        background: active
          ? "color-mix(in srgb, var(--gg-primary, #2563eb) 18%, transparent)"
          : "rgba(255,255,255,.03)",
        color: active
          ? "color-mix(in srgb, var(--gg-primary, #2563eb) 90%, #fff)"
          : S.dim,
        boxShadow: active
          ? "0 0 12px color-mix(in srgb, var(--gg-primary, #2563eb) 22%, transparent), 0 2px 6px rgba(0,0,0,.22)"
          : hovered
            ? "0 4px 12px rgba(0,0,0,.32)"
            : "0 1px 4px rgba(0,0,0,.18)",
      }}
    >
      {children}
    </button>
  );
}

function SearchBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "9px 12px",
        background: "rgba(255,255,255,.04)",
        border: focused
          ? "1px solid color-mix(in srgb, var(--gg-primary,#2563eb) 55%, transparent)"
          : "1px solid rgba(255,255,255,.09)",
        borderRadius: 12,
        transition: "border-color .15s, box-shadow .15s",
        boxShadow: focused
          ? "0 0 0 3px color-mix(in srgb, var(--gg-primary,#2563eb) 14%, transparent)"
          : "0 2px 8px rgba(0,0,0,.2)",
      }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke={S.dim}
        strokeWidth="2"
        strokeLinecap="round"
        style={{ flexShrink: 0 }}
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search items…"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          flex: 1,
          background: "none",
          border: "none",
          outline: "none",
          color: S.text,
          fontSize: 13,
        }}
      />
      {value && (
        <button
          onClick={() => onChange("")}
          style={{
            background: "none",
            border: "none",
            color: S.dim,
            cursor: "pointer",
            padding: 0,
            fontSize: 16,
            lineHeight: 1,
            display: "flex",
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}

export default function ListPanel({ userId, tenantId, initialTypes, initialOrgs = [] }: ListPanelProps) {
  const router = useRouter();

  const [tz, setTz] = useState("UTC");
  useEffect(() => { setTz(Intl.DateTimeFormat().resolvedOptions().timeZone); }, []);

  const [items, setItems]           = useState<SitRepItem[]>([]);
  const [loading, setLoading]       = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set(["done", "cancelled"]),
  );
  const [completing, setCompleting] = useState<Set<string>>(new Set());

  // Filters
  const [search, setSearch]               = useState("");
  const [scopeFilter, setScopeFilter]     = useState<"mine" | "all">("mine");
  const [typeFilter, setTypeFilter]       = useState("all");
  const [statusFilter, setStatusFilter]   = useState<"active" | "done" | "all">("active");

  // Calendar switcher
  const [views,        setViews]        = useState<SitRepView[]>([]);
  const [squads,       setSquads]       = useState<SquadInfo[]>([]);
  const [orgs,         setOrgs]         = useState<OrgInfo[]>(initialOrgs);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [context,      setContext]      = useState<CalendarContext>(() =>
    defaultContext(
      initialOrgs.length > 0 ? initialOrgs.map((o) => o.id) : (tenantId ? [tenantId] : []),
      []
    )
  );
  const [drawerOpen,          setDrawerOpen]          = useState(false);
  const [pendingInviteCount,  setPendingInviteCount]  = useState(0);

  // Sheet state
  const [sheetOpen,   setSheetOpen]   = useState(false);
  const [sheetItem,   setSheetItem]   = useState<SitRepItem | null>(null);
  const [sheetCreate, setSheetCreate] = useState(false);
  const [rescheduleItem, setRescheduleItem] = useState<SitRepItem | null>(null);

  const typeMap = Object.fromEntries(initialTypes.map((t) => [t.slug, t]));

  // Load views + squads, then init context from saved active view
  useEffect(() => {
    Promise.all([
      fetch("/api/sitrep/views").then((r) => r.ok ? r.json() : []),
      fetch("/api/sitrep/squads").then((r) => r.ok ? r.json() : []),
    ]).then(([viewData, squadData]: [SitRepView[], any[]]) => {
      setViews(viewData);
      const mappedSquads: SquadInfo[] = squadData.map((s: any) => ({
        id:       s.id,
        name:     s.name,
        color:    s.color ?? "blue",
        tenantId: s.org_id ?? tenantId,
        role:     s.role ?? "member",
      }));
      setSquads(mappedSquads);

      const savedId = loadActiveViewId();
      const active =
        viewData.find((v) => v.id === savedId) ??
        viewData.find((v) => v.is_default) ??
        viewData[0];
      if (active) {
        setActiveViewId(active.id);
        setContext(contextFromView(active));
        saveActiveViewId(active.id);
      }
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sitrep/items");
      if (res.ok) {
        const data = await res.json();
        setItems(Array.isArray(data) ? [...data] : []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  function selectView(id: string) {
    const v = views.find((x) => x.id === id);
    if (!v) return;
    setActiveViewId(id);
    setContext(contextFromView(v));
    saveActiveViewId(id);
  }

  function handleContextChange(next: CalendarContext) {
    setContext(next);
    if (!activeViewId) return;
    fetch(`/api/sitrep/views/${activeViewId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        toggle_state: {
          org_ids:      next.orgIds,
          squad_ids:    next.squadIds,
          personal:     next.personalOn,
          favorite_ids: next.favoriteIds,
          filters:      next.filters,
        },
      }),
    }).catch(() => {});
  }

  async function handleViewsChanged() {
    const res = await fetch("/api/sitrep/views");
    if (!res.ok) return;
    const data: SitRepView[] = await res.json();
    setViews(data);
    const active = data.find((v) => v.id === activeViewId);
    if (active) setContext(contextFromView(active));
  }

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
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, status: "done" } : i)),
      );
    } catch { /* ignore */ }
    setTimeout(
      () =>
        setCompleting((p) => {
          const n = new Set(p);
          n.delete(item.id);
          return n;
        }),
      400,
    );
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
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, due_date: newDate } : i)),
      );
    } catch { /* ignore */ }
    setRescheduleItem(null);
  }

  const [overlayItems, setOverlayItems] = useState<SitRepItem[]>([]);
  useEffect(() => {
    const ids = context.favoriteIds ?? [];
    if (ids.length === 0) { setOverlayItems([]); return; }
    fetch(`/api/sitrep/favorites/items?userIds=${ids.join(",")}`)
      .then((r) => r.ok ? r.json() : [])
      .then((data: any[]) => {
        setOverlayItems(
          (Array.isArray(data) ? data : []).map((item: any) => ({
            ...item, _is_overlay: true,
            sitrep_assignments: item.sitrep_assignments ?? [],
          }))
        );
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(context.favoriteIds)]);

  // Apply calendar visibility filter first, dedup overlay items already visible via membership
  const filteredItems = filterItems(items as any[], userId, context) as SitRepItem[];
  const filteredIds   = new Set(filteredItems.map((i) => i.id));
  const calFiltered   = [...filteredItems, ...overlayItems.filter((o) => !filteredIds.has(o.id))];
  const hiddenCount   = items.length - filteredItems.length;

  // Compute stats from unfiltered (calendar-visible) items
  const openCount    = calFiltered.filter((i) => i.status !== "done" && i.status !== "cancelled").length;
  const overdueCount = calFiltered.filter((i) => isItemOverdue(i)).length;

  // Apply search + scope + type + status filters
  let filtered = calFiltered;
  if (scopeFilter === "mine") {
    filtered = filtered.filter((i) => {
      if ((i as any)._is_overlay) return false;
      if ((i.sitrep_assignments ?? []).some((a) => a.user_id === userId)) return true;
      if (i.created_by !== userId) return false;
      const vis = (i as any).visibility ?? "team";
      return vis === "private" || vis === "assignee_only" || (!(i as any).tenant_id && !(i as any).squad_id);
    });
  }
  if (typeFilter !== "all") {
    filtered = filtered.filter((i) => i.item_type === typeFilter);
  }
  if (statusFilter === "active") {
    filtered = filtered.filter((i) => i.status !== "done" && i.status !== "cancelled");
  } else if (statusFilter === "done") {
    filtered = filtered.filter((i) => i.status === "done");
  }
  if (search.trim()) {
    const q = search.toLowerCase();
    filtered = filtered.filter((i) => i.title.toLowerCase().includes(q));
  }

  const groups = groupItems(filtered);

  return (
    <div style={{ minHeight: "100dvh", background: S.bg }}>
      {/* Sticky header */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          background: S.bg,
          borderBottom: `1px solid ${S.border}`,
          padding: "12px 16px",
          paddingTop: "max(12px, env(safe-area-inset-top))",
          flexShrink: 0,
        }}
      >
        {/* Title row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* Hamburger */}
            <button
              onClick={() => setDrawerOpen(true)}
              title="My Calendars"
              style={{
                background: "none",
                border: "none",
                color: S.dim,
                cursor: "pointer",
                padding: "4px 6px",
                display: "flex",
                alignItems: "center",
                position: "relative",
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
              {(pendingInviteCount > 0 || hiddenCount > 0) && (
                <span
                  style={{
                    position: "absolute",
                    top: 1,
                    right: 1,
                    fontSize: 8,
                    fontWeight: 700,
                    background: pendingInviteCount > 0 ? "#f59e0b" : "var(--gg-primary,#2563eb)",
                    color: "#fff",
                    borderRadius: 8,
                    padding: "0 4px",
                    lineHeight: "14px",
                  }}
                >
                  {pendingInviteCount > 0 ? pendingInviteCount : hiddenCount}
                </span>
              )}
            </button>

            {/* Title + stats */}
            <div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                  color: S.text,
                }}
              >
                SitRep
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "baseline",
                  marginTop: 1,
                }}
              >
                <span style={{ fontSize: 11, color: S.dimBright }}>
                  <span
                    style={{
                      fontWeight: 800,
                      fontSize: 15,
                      color: S.text,
                      marginRight: 2,
                    }}
                  >
                    {openCount}
                  </span>
                  open
                </span>
                {overdueCount > 0 && (
                  <span style={{ fontSize: 11, color: "rgba(239,68,68,.7)" }}>
                    <span
                      style={{
                        fontWeight: 800,
                        fontSize: 14,
                        color: "rgb(252 165 165)",
                        marginRight: 2,
                      }}
                    >
                      {overdueCount}
                    </span>
                    overdue
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Settings */}
          <button
            onClick={() => router.push("/settings")}
            title="Settings"
            style={{
              background: "none", border: "none", color: S.dim,
              cursor: "pointer", padding: "4px 6px", display: "flex", alignItems: "center",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>

          {/* New button */}
          <button
            onClick={openCreate}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "7px 14px",
              borderRadius: 10,
              background:
                "linear-gradient(135deg, var(--gg-primary,#2563eb), color-mix(in srgb, var(--gg-primary,#2563eb) 68%, #7c3aed))",
              boxShadow:
                "0 2px 14px color-mix(in srgb, var(--gg-primary,#2563eb) 42%, transparent), inset 0 1px 0 rgba(255,255,255,.18)",
              border: "none",
              color: "#fff",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New
          </button>
        </div>

        {/* Search */}
        <SearchBar value={search} onChange={setSearch} />

        {/* Filter pills */}
        <div
          style={{
            display: "flex",
            gap: 4,
            marginTop: 8,
            overflowX: "auto",
            paddingBottom: 2,
            scrollbarWidth: "none",
          }}
        >
          <FilterPill active={scopeFilter === "mine"} onClick={() => setScopeFilter("mine")}>
            Mine
          </FilterPill>
          <FilterPill active={scopeFilter === "all"} onClick={() => setScopeFilter("all")}>
            All
          </FilterPill>

          {/* Divider */}
          <div
            style={{
              width: 1,
              height: 18,
              background: "rgba(255,255,255,.1)",
              margin: "0 2px",
              flexShrink: 0,
              alignSelf: "center",
            }}
          />

          <FilterPill active={typeFilter === "all"} onClick={() => setTypeFilter("all")}>
            All Types
          </FilterPill>
          {initialTypes.map((t) => (
            <FilterPill
              key={t.slug}
              active={typeFilter === t.slug}
              onClick={() => setTypeFilter(t.slug)}
            >
              {t.name}
            </FilterPill>
          ))}

          {/* Divider */}
          <div
            style={{
              width: 1,
              height: 18,
              background: "rgba(255,255,255,.1)",
              margin: "0 2px",
              flexShrink: 0,
              alignSelf: "center",
            }}
          />

          <FilterPill active={statusFilter === "active"} onClick={() => setStatusFilter("active")}>
            Active
          </FilterPill>
          <FilterPill active={statusFilter === "done"} onClick={() => setStatusFilter("done")}>
            Done
          </FilterPill>
          <FilterPill active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
            All
          </FilterPill>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "8px 12px 24px" }}>
        {loading && items.length === 0 && (
          <div
            style={{
              padding: 32,
              textAlign: "center",
              color: S.dim,
              fontSize: 14,
            }}
          >
            Loading…
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div
            style={{
              padding: "64px 24px",
              textAlign: "center",
              color: S.dim,
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.22 }}>
              ✓
            </div>
            <div
              style={{
                fontWeight: 800,
                fontSize: 15,
                color: S.text,
                marginBottom: 6,
              }}
            >
              {search.trim() ? "No matches" : hiddenCount > 0 ? "All filtered" : "All clear."}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.6 }}>
              {search.trim()
                ? `No items match "${search}".`
                : hiddenCount > 0
                  ? "Tap ☰ to adjust your calendar filters."
                  : "Tap + New to add something."}
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {groups.map((group) => {
            const collapsed = collapsedGroups.has(group.key);
            return (
              <div key={group.key}>
                {/* Group header */}
                <div
                  onClick={() => toggleGroup(group.key)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 6,
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "2px 10px 2px 7px",
                      borderRadius: 20,
                      flexShrink: 0,
                      background: `${group.color}12`,
                      border: `1px solid ${group.color}30`,
                    }}
                  >
                    <span
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: "50%",
                        background: group.color,
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        letterSpacing: "0.09em",
                        color: group.color,
                        textTransform: "uppercase",
                      }}
                    >
                      {group.label}
                    </span>
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        color: group.color,
                        background: `${group.color}1f`,
                        borderRadius: 10,
                        padding: "1px 5px",
                      }}
                    >
                      {group.items.length}
                    </span>
                  </div>

                  {/* Fade line */}
                  <div
                    style={{
                      flex: 1,
                      height: 1,
                      background: `linear-gradient(to right, ${group.color}35, transparent)`,
                    }}
                  />

                  {/* Chevron */}
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={S.dim}
                    strokeWidth="2"
                    strokeLinecap="round"
                    style={{
                      transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
                      transition: "transform .2s",
                      flexShrink: 0,
                    }}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>

                {/* Items grid */}
                {!collapsed && (
                  <div style={{ display: "grid", gap: 4 }}>
                    {group.items.map((item) => {
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
                )}
              </div>
            );
          })}
        </div>
      </div>

      <CalendarSwitcherDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        views={views}
        activeViewId={activeViewId}
        onSelectView={selectView}
        squads={squads}
        orgs={orgs}
        context={context}
        onContextChange={handleContextChange}
        onViewsChanged={handleViewsChanged}
        onPendingCountChange={setPendingInviteCount}
      />

      <ItemBottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        item={sheetItem}
        createMode={sheetCreate}
        types={initialTypes}
        squads={squads.map((s) => ({ id: s.id, name: s.name, color: s.color, tenantId: s.tenantId }))}
        orgs={orgs}
        tenantId={tenantId}
        userId={userId}
        tz={tz}
        onSaved={onSheetSaved}
        onDeleted={onSheetDeleted}
        onExpandItem={(id) => {
          setSheetOpen(false);
          router.push(`/item/${id}`);
        }}
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
