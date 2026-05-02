"use client";

import { useRef } from "react";
import { todayStr, addDays, localDateStr, effectiveDate } from "@/lib/date-utils";
import { getFamilyByKey } from "@/lib/sitrep-colors";
import type { SitRepItem } from "@/app/(pwa)/list/ListRow";

const S = {
  text:   "rgb(236 240 245)",
  dim:    "rgb(100 116 139)",
  border: "rgba(255,255,255,.07)",
} as const;

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_DOTS = 7;

type ItemType = { id: string; name: string; slug: string; color: string };

interface MonthViewProps {
  items: SitRepItem[];
  types: ItemType[];
  cursor: string;
  tz: string;
  onCursorChange: (ds: string) => void;
}

function startOfMonth(ds: string): string {
  return ds.slice(0, 8) + "01";
}

function addMonths(ds: string, n: number): string {
  const d = new Date(ds.slice(0, 8) + "01T00:00:00");
  d.setMonth(d.getMonth() + n);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
}

function getMonthGrid(ds: string): string[] {
  const first = new Date(ds.slice(0, 8) + "01T00:00:00");
  const grid  = new Date(first);
  grid.setDate(grid.getDate() - first.getDay());
  const days: string[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(grid);
    d.setDate(d.getDate() + i);
    const pad = (x: number) => String(x).padStart(2, "0");
    days.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  }
  return days;
}

function fmtMonthYear(ds: string): string {
  return new Date(ds.slice(0, 8) + "01T00:00:00").toLocaleDateString("en-US", {
    month: "long", year: "numeric",
  });
}

export default function MonthView({ items, types, cursor, tz, onCursorChange }: MonthViewProps) {
  const today    = todayStr();
  const monthDs  = startOfMonth(cursor);
  const grid     = getMonthGrid(monthDs);
  const curMonth = monthDs.slice(0, 7);
  const typeMap  = Object.fromEntries(types.map((t) => [t.slug, t]));

  // Build date → items map (local date key)
  const itemsByDate = new Map<string, SitRepItem[]>();
  for (const item of items) {
    const ed = effectiveDate(item);
    if (!ed) continue;
    const ds = ed.includes("T") ? localDateStr(ed) : ed;
    if (!itemsByDate.has(ds)) itemsByDate.set(ds, []);
    itemsByDate.get(ds)!.push(item);
  }

  // Touch swipe for month navigation
  const touchStartX = useRef(0);
  function onTouchStart(e: React.TouchEvent) { touchStartX.current = e.touches[0].clientX; }
  function onTouchEnd(e: React.TouchEvent) {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 60) {
      onCursorChange(addMonths(monthDs, dx < 0 ? 1 : -1));
    }
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Month nav header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 16px", borderBottom: `1px solid ${S.border}`, flexShrink: 0,
      }}>
        <button
          onClick={() => onCursorChange(addMonths(monthDs, -1))}
          style={{ background: "none", border: "none", color: S.dim, fontSize: 20, cursor: "pointer", padding: "4px 8px" }}
        >‹</button>
        <span style={{ fontSize: 15, fontWeight: 700, color: S.text }}>
          {fmtMonthYear(monthDs)}
        </span>
        <button
          onClick={() => onCursorChange(addMonths(monthDs, 1))}
          style={{ background: "none", border: "none", color: S.dim, fontSize: 20, cursor: "pointer", padding: "4px 8px" }}
        >›</button>
      </div>

      {/* Day-of-week labels */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(7, 1fr)",
        padding: "6px 4px 2px", flexShrink: 0,
      }}>
        {DAYS_OF_WEEK.map((d) => (
          <div key={d} style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: S.dim, letterSpacing: "0.05em" }}>
            {d}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gridTemplateRows: "repeat(6, 1fr)",
          flex: 1,
          padding: "0 4px 4px",
          gap: 2,
          overflow: "hidden",
        }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {grid.map((ds) => {
          const isToday     = ds === today;
          const isThisMonth = ds.slice(0, 7) === curMonth;
          const dayItems    = itemsByDate.get(ds) ?? [];
          const dotsToShow  = dayItems.slice(0, MAX_DOTS);
          const overflow    = dayItems.length > MAX_DOTS ? dayItems.length - (MAX_DOTS - 1) : 0;

          return (
            <button
              key={ds}
              onClick={() => onCursorChange(ds)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                padding: "4px 2px",
                borderRadius: 8,
                background: "none",
                border: "none",
                cursor: "pointer",
                opacity: isThisMonth ? 1 : 0.35,
                minHeight: 0,
              }}
            >
              {/* Date number */}
              <div style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: isToday
                  ? "var(--gg-primary,#2563eb)"
                  : "transparent",
                fontSize: 12,
                fontWeight: isToday ? 700 : 400,
                color: isToday ? "#fff" : isThisMonth ? S.text : S.dim,
                flexShrink: 0,
              }}>
                {parseInt(ds.slice(8), 10)}
              </div>

              {/* Dots */}
              {dayItems.length > 0 && (
                <div style={{ display: "flex", gap: 2, flexWrap: "wrap", justifyContent: "center", marginTop: 2 }}>
                  {overflow > 0 ? (
                    <>
                      {dotsToShow.slice(0, MAX_DOTS - 1).map((item, i) => {
                        const t      = typeMap[item.item_type];
                        const family = getFamilyByKey(t?.color ?? "blue");
                        const color  = family?.shades[2] ?? "#3b82f6";
                        return (
                          <div key={item.id} style={{
                            width: 5, height: 5, borderRadius: "50%", background: color, flexShrink: 0,
                          }} />
                        );
                      })}
                      <span style={{ fontSize: 9, color: S.dim, lineHeight: "5px" }}>+{overflow}</span>
                    </>
                  ) : (
                    dotsToShow.map((item) => {
                      const t      = typeMap[item.item_type];
                      const family = getFamilyByKey(t?.color ?? "blue");
                      const color  = family?.shades[2] ?? "#3b82f6";
                      return (
                        <div key={item.id} style={{
                          width: 5, height: 5, borderRadius: "50%", background: color, flexShrink: 0,
                        }} />
                      );
                    })
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
