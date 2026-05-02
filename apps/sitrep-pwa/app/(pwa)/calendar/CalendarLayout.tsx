"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { todayStr } from "@/lib/date-utils";
import DayView from "./DayView";
import WeekView from "./WeekView";
import MonthView from "./MonthView";
import ItemBottomSheet from "@/components/ItemBottomSheet";
import type { SitRepItem } from "@/app/(pwa)/list/ListRow";

const S = {
  bg:     "rgb(10 13 20)",
  text:   "rgb(236 240 245)",
  dim:    "rgb(100 116 139)",
  border: "rgba(255,255,255,.07)",
} as const;

type View = "day" | "week" | "month";
type ItemType = { id: string; name: string; slug: string; color: string; sort_order: number };

interface CalendarLayoutProps {
  initialItems: SitRepItem[];
  types: ItemType[];
  userId: string;
  tenantId: string;
}

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

export default function CalendarLayout({ initialItems, types, userId, tenantId }: CalendarLayoutProps) {
  const router     = useRouter();
  const searchParams = useSearchParams();
  const pathname   = usePathname();

  // Detect timezone once on mount
  const [tz, setTz] = useState("UTC");
  useEffect(() => { setTz(Intl.DateTimeFormat().resolvedOptions().timeZone); }, []);

  // Persist last view in localStorage
  const [view, setView] = useState<View>(() => {
    const p = searchParams.get("view") as View | null;
    if (p && ["day", "week", "month"].includes(p)) return p;
    return "day";
  });

  const [cursor, setCursor] = useState(() => searchParams.get("date") ?? todayStr());
  const [items, setItems]   = useState<SitRepItem[]>([...initialItems]);

  // Sheet state for item taps
  const [sheetOpen, setSheetOpen]   = useState(false);
  const [sheetItem, setSheetItem]   = useState<SitRepItem | null>(null);
  const [sheetCreate, setSheetCreate] = useState(false);

  // Sync view to URL
  useEffect(() => {
    const p = new URLSearchParams(searchParams.toString());
    p.set("view", view);
    p.set("date", cursor);
    router.replace(`${pathname}?${p}`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, cursor]);

  // Remember last view in localStorage
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("sitrep_cal_view", view);
  }, [view]);

  function onItemTap(item: SitRepItem) {
    setSheetItem(item);
    setSheetCreate(false);
    setSheetOpen(true);
  }

  function onDayTap(ds: string) {
    // Month → Day navigation
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

  const isToday = cursor === todayStr();

  return (
    <div style={{ minHeight: "100dvh", background: S.bg, display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{
        position: "sticky", top: 0, zIndex: 50, background: S.bg,
        borderBottom: `1px solid ${S.border}`,
        padding: "10px 16px",
        paddingTop: "max(10px, env(safe-area-inset-top))",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          {/* View switcher */}
          <div style={{ display: "flex", gap: 4 }}>
            <ViewPill active={view === "day"}   onClick={() => setView("day")}>Day</ViewPill>
            <ViewPill active={view === "week"}  onClick={() => setView("week")}>Week</ViewPill>
            <ViewPill active={view === "month"} onClick={() => setView("month")}>Month</ViewPill>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {/* Today button — only when not on today */}
            {!isToday && (
              <button
                onClick={() => setCursor(todayStr())}
                style={{
                  fontSize: 11, fontWeight: 600, padding: "5px 10px", borderRadius: 8,
                  border: "1px solid rgba(255,255,255,.1)", background: "rgba(255,255,255,.05)",
                  color: S.dim, cursor: "pointer",
                }}
              >
                Today
              </button>
            )}
            {/* New item */}
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
      <div style={{ flex: 1, overflow: "hidden" }}>
        {view === "day" && (
          <DayView
            items={items}
            types={types}
            cursor={cursor}
            tz={tz}
            onCursorChange={setCursor}
            onItemTap={onItemTap}
          />
        )}
        {view === "week" && (
          <WeekView
            items={items}
            types={types}
            cursor={cursor}
            tz={tz}
            onCursorChange={setCursor}
            onItemTap={onItemTap}
          />
        )}
        {view === "month" && (
          <MonthView
            items={items}
            types={types}
            cursor={cursor}
            tz={tz}
            onCursorChange={onDayTap}
          />
        )}
      </div>

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
