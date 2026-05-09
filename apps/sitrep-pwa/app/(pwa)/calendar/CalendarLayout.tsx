"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { todayStr } from "@/lib/date-utils";
import {
  filterItems,
  defaultContext,
  contextFromView,
  loadActiveViewId,
  saveActiveViewId,
  type CalendarContext,
  type SitRepView,
} from "@/lib/sitrep-calendar-filter";
import DayView from "./DayView";
import WeekView from "./WeekView";
import MonthView from "./MonthView";
import ItemBottomSheet from "@/components/ItemBottomSheet";
import CalendarSwitcherDrawer from "@/components/CalendarSwitcherDrawer";
import type { SitRepItem } from "@/app/(pwa)/list/ListRow";

const S = {
  bg:     "rgb(10 13 20)",
  text:   "rgb(236 240 245)",
  dim:    "rgb(100 116 139)",
  border: "rgba(255,255,255,.07)",
} as const;

type View     = "day" | "week" | "month";
type ItemType = { id: string; name: string; slug: string; color: string; sort_order: number };
type SquadInfo = { id: string; name: string; color: string; tenantId: string; role: string };
type OrgInfo  = { id: string; name: string };

function ViewPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "5px 13px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer",
        border: active
          ? "1px solid color-mix(in srgb, var(--gg-primary, #2563eb) 50%, transparent)"
          : "1px solid rgba(255,255,255,.07)",
        background: active
          ? "color-mix(in srgb, var(--gg-primary, #2563eb) 18%, transparent)"
          : "rgba(255,255,255,.03)",
        color: active
          ? "color-mix(in srgb, var(--gg-primary, #2563eb) 90%, #fff)"
          : S.dim,
        transition: "all .12s",
      }}
    >
      {children}
    </button>
  );
}

interface CalendarLayoutProps {
  initialItems: SitRepItem[];
  types:        ItemType[];
  userId:       string;
  tenantId:     string;
  orgs?:        OrgInfo[];
  views:        SitRepView[];
  squads:       SquadInfo[];
}

export default function CalendarLayout({
  initialItems, types, userId, tenantId, orgs = [], views: initialViews, squads,
}: CalendarLayoutProps) {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const pathname     = usePathname();

  const [tz, setTz] = useState("UTC");
  useEffect(() => { setTz(Intl.DateTimeFormat().resolvedOptions().timeZone); }, []);

  const [view, setView] = useState<View>(() => {
    const p = searchParams.get("view") as View | null;
    if (p && ["day", "week", "month"].includes(p)) return p;
    return "day";
  });

  const [cursor, setCursor] = useState(() => searchParams.get("date") ?? todayStr());
  const [items, setItems]   = useState<SitRepItem[]>([...initialItems]);

  // Views / filter state
  const [views,         setViews]         = useState<SitRepView[]>(initialViews);
  const [activeViewId,  setActiveViewId]  = useState<string | null>(null);
  const [context,       setContext]       = useState<CalendarContext>(() =>
    defaultContext(
      orgs.length > 0 ? orgs.map((o) => o.id) : (tenantId ? [tenantId] : []),
      squads.map((s) => s.id)
    )
  );
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Sheet state
  const [sheetOpen,   setSheetOpen]   = useState(false);
  const [sheetItem,   setSheetItem]   = useState<SitRepItem | null>(null);
  const [sheetCreate, setSheetCreate] = useState(false);

  // Init active view from localStorage or first default
  useEffect(() => {
    const savedId = loadActiveViewId();
    const v =
      views.find((x) => x.id === savedId) ??
      views.find((x) => x.is_default) ??
      views[0];
    if (v) {
      setActiveViewId(v.id);
      setContext(contextFromView(v));
      saveActiveViewId(v.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync view/cursor to URL
  useEffect(() => {
    const p = new URLSearchParams(searchParams.toString());
    p.set("view", view);
    p.set("date", cursor);
    router.replace(`${pathname}?${p}`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, cursor]);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("sitrep_cal_view", view);
  }, [view]);

  function selectView(id: string) {
    const v = views.find((x) => x.id === id);
    if (!v) return;
    setActiveViewId(id);
    setContext(contextFromView(v));
    saveActiveViewId(id);
  }

  // Immediate filter update + fire-and-forget save
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

  function onItemTap(item: SitRepItem) {
    setSheetItem(item);
    setSheetCreate(false);
    setSheetOpen(true);
  }

  function onDayTap(ds: string) {
    setCursor(ds);
    setView("day");
  }

  function onSheetSaved(updated: SitRepItem) {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.id === updated.id);
      if (idx >= 0) { const n = [...prev]; n[idx] = updated; return n; }
      return [updated, ...prev];
    });
    setSheetOpen(false);
  }

  function onSheetDeleted(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setSheetOpen(false);
  }

  const [overlayItems, setOverlayItems] = useState<SitRepItem[]>([]);
  useEffect(() => {
    const ids = context.favoriteIds ?? [];
    if (ids.length === 0) { setOverlayItems([]); return; }
    fetch(`/api/sitrep/favorites/items?userIds=${ids.join(",")}`)
      .then((r) => r.ok ? r.json() : [])
      .then((data: any[]) => {
        setOverlayItems(
          (Array.isArray(data) ? data : []).map((item) => ({
            ...item,
            _is_overlay: true,
            sitrep_assignments: item.sitrep_assignments ?? [],
          }))
        );
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(context.favoriteIds)]);

  const isToday       = cursor === todayStr();
  const displayItems  = [
    ...filterItems(items as any[], userId, context) as SitRepItem[],
    ...overlayItems,
  ];
  const hiddenCount   = items.length - (displayItems.length - overlayItems.length);

  return (
    <div style={{ height: "100dvh", background: S.bg, display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{
        position: "sticky", top: 0, zIndex: 50, background: S.bg,
        borderBottom: `1px solid ${S.border}`,
        padding: "10px 16px",
        paddingTop: "max(10px, env(safe-area-inset-top))",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              onClick={() => setDrawerOpen(true)}
              title="My Calendars"
              style={{
                background: "none", border: "none", color: S.dim,
                fontSize: 18, cursor: "pointer", padding: "4px 6px",
                lineHeight: 1, display: "flex", alignItems: "center",
              }}
            >
              ☰
              {hiddenCount > 0 && (
                <span style={{
                  marginLeft: 3, fontSize: 9, fontWeight: 700,
                  background: "var(--gg-primary,#2563eb)", color: "#fff",
                  borderRadius: 8, padding: "1px 5px",
                }}>
                  {hiddenCount}
                </span>
              )}
            </button>
            <ViewPill active={view === "day"}   onClick={() => setView("day")}>Day</ViewPill>
            <ViewPill active={view === "week"}  onClick={() => setView("week")}>Week</ViewPill>
            <ViewPill active={view === "month"} onClick={() => setView("month")}>Month</ViewPill>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {!isToday && (
              <button
                onClick={() => setCursor(todayStr())}
                style={{
                  fontSize: 11, fontWeight: 600, padding: "5px 10px", borderRadius: 8,
                  border: "1px solid rgba(255,255,255,.1)", background: "rgba(255,255,255,.05)",
                  color: S.dim, cursor: "pointer",
                }}
              >Today</button>
            )}
            <button
              onClick={() => { setSheetItem(null); setSheetCreate(true); setSheetOpen(true); }}
              style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "6px 12px", borderRadius: 8,
                border: "1px solid rgba(255,255,255,.1)",
                background: "color-mix(in srgb, var(--gg-primary, #2563eb) 18%, transparent)",
                color: "color-mix(in srgb, var(--gg-primary, #2563eb) 90%, #fff)",
                fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              New
            </button>
          </div>
        </div>
      </div>

      {/* Active view */}
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {view === "day"   && <DayView   items={displayItems} types={types} cursor={cursor} tz={tz} onCursorChange={setCursor} onItemTap={onItemTap} />}
        {view === "week"  && <WeekView  items={displayItems} types={types} cursor={cursor} tz={tz} onCursorChange={setCursor} onItemTap={onItemTap} />}
        {view === "month" && <MonthView items={displayItems} types={types} cursor={cursor} tz={tz} onCursorChange={onDayTap} />}
      </div>

      <CalendarSwitcherDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        views={views}
        activeViewId={activeViewId}
        onSelectView={selectView}
        squads={squads}
        orgs={orgs.length > 0 ? orgs : (tenantId ? [{ id: tenantId, name: "Work" }] : [])}
        context={context}
        onContextChange={handleContextChange}
        onViewsChanged={handleViewsChanged}
      />

      <ItemBottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        item={sheetItem}
        createMode={sheetCreate}
        types={types}
        tenantId={tenantId}
        userId={userId}
        tz={tz}
        onSaved={onSheetSaved}
        onDeleted={onSheetDeleted}
        onExpandItem={(id) => { setSheetOpen(false); router.push(`/item/${id}`); }}
      />
    </div>
  );
}
