"use client";

import { useRef } from "react";
import {
  todayStr, addDays, localDateStr, effectiveDate,
  hasExplicitTime, fmtTime,
} from "@/lib/date-utils";
import { getFamilyByKey } from "@/lib/sitrep-colors";
import type { SitRepItem } from "@/app/(pwa)/list/ListRow";

const S = {
  text:   "rgb(236 240 245)",
  dim:    "rgb(100 116 139)",
  border: "rgba(255,255,255,.07)",
} as const;

const HOUR_HEIGHT = 60; // px per hour
const START_HOUR  = 0;
const END_HOUR    = 24;
const TOTAL_H     = (END_HOUR - START_HOUR) * HOUR_HEIGHT;

type ItemType = { id: string; name: string; slug: string; color: string };

interface DayViewProps {
  items: SitRepItem[];
  types: ItemType[];
  cursor: string;
  tz: string;
  onCursorChange: (ds: string) => void;
  onItemTap: (item: SitRepItem) => void;
}

function hourLabel(h: number): string {
  if (h === 0)  return "12 AM";
  if (h < 12)   return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

function fmtDayHeader(ds: string): string {
  return new Date(ds + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
}

function getCurrentMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

interface PlacedEvent {
  item: SitRepItem;
  top: number;
  height: number;
  col: number;
  cols: number;
}

function placeEvents(timedItems: SitRepItem[]): PlacedEvent[] {
  // Sort by start time
  const sorted = [...timedItems].sort((a, b) => {
    const ta = new Date((a as any).start_at ?? a.due_date!).getTime();
    const tb = new Date((b as any).start_at ?? b.due_date!).getTime();
    return ta - tb;
  });

  const placed: PlacedEvent[] = sorted.map((item) => {
    const start = new Date((item as any).start_at ?? item.due_date!);
    const end   = (item as any).end_at ? new Date((item as any).end_at) : new Date(start.getTime() + 60 * 60 * 1000);
    const startMin = (start.getHours() - START_HOUR) * 60 + start.getMinutes();
    const endMin   = (end.getHours()   - START_HOUR) * 60 + end.getMinutes();
    const top    = (startMin / 60) * HOUR_HEIGHT;
    const height = Math.max((Math.max(endMin - startMin, 30) / 60) * HOUR_HEIGHT, 24);
    return { item, top, height, col: 0, cols: 1 };
  });

  // Simple overlap detection — assign columns
  for (let i = 0; i < placed.length; i++) {
    const a = placed[i];
    const overlapping = placed.filter((b, j) => {
      if (j >= i) return false;
      return a.top < b.top + b.height && a.top + a.height > b.top;
    });
    a.col  = overlapping.length > 0 ? Math.max(...overlapping.map((b) => b.col)) + 1 : 0;
    a.cols = Math.max(a.col + 1, ...overlapping.map((b) => b.cols));
  }
  // Second pass: unify cols across overlap groups
  for (let i = placed.length - 1; i >= 0; i--) {
    const a = placed[i];
    placed.forEach((b) => {
      if (b !== a && b.top < a.top + a.height && b.top + a.height > a.top) {
        const maxCols = Math.max(a.cols, b.cols);
        a.cols = maxCols;
        b.cols = maxCols;
      }
    });
  }

  return placed;
}

export default function DayView({ items, types, cursor, tz, onCursorChange, onItemTap }: DayViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const today     = todayStr();
  const isToday   = cursor === today;
  const nowMinutes = getCurrentMinutes();
  const nowTop     = ((nowMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT;

  const typeMap = Object.fromEntries(types.map((t) => [t.slug, t]));

  // Partition items for this day
  const dayItems = items.filter((item) => {
    const ed = effectiveDate(item);
    if (!ed) return false;
    const ds = ed.includes("T") ? localDateStr(ed) : ed;
    return ds === cursor;
  });

  const allDayItems  = dayItems.filter((i) => (i as any).is_all_day || !hasExplicitTime((i as any).start_at ?? i.due_date));
  const timedItems   = dayItems.filter((i) => !((i as any).is_all_day) && hasExplicitTime((i as any).start_at ?? i.due_date));
  const placed       = placeEvents(timedItems);

  // Touch swipe to navigate days
  const touchStartX = useRef(0);
  function onTouchStart(e: React.TouchEvent) { touchStartX.current = e.touches[0].clientX; }
  function onTouchEnd(e: React.TouchEvent) {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 60) onCursorChange(addDays(cursor, dx < 0 ? 1 : -1));
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Day nav header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 16px", borderBottom: `1px solid ${S.border}`, flexShrink: 0,
      }}>
        <button onClick={() => onCursorChange(addDays(cursor, -1))}
          style={{ background: "none", border: "none", color: S.dim, fontSize: 20, cursor: "pointer", padding: "4px 8px" }}>‹</button>
        <span style={{ fontSize: 14, fontWeight: 600, color: isToday ? "var(--gg-primary,#2563eb)" : S.text }}>
          {fmtDayHeader(cursor)}
        </span>
        <button onClick={() => onCursorChange(addDays(cursor, 1))}
          style={{ background: "none", border: "none", color: S.dim, fontSize: 20, cursor: "pointer", padding: "4px 8px" }}>›</button>
      </div>

      {/* All-day strip */}
      {allDayItems.length > 0 && (
        <div style={{
          padding: "6px 16px", borderBottom: `1px solid ${S.border}`,
          display: "flex", gap: 6, flexWrap: "wrap", flexShrink: 0,
        }}>
          {allDayItems.map((item) => {
            const t = typeMap[item.item_type];
            const family = getFamilyByKey(t?.color ?? "blue");
            const accent = family?.shades[2] ?? "#3b82f6";
            return (
              <button
                key={item.id}
                onClick={() => onItemTap(item)}
                style={{
                  padding: "3px 10px", borderRadius: 6, fontSize: 12, fontWeight: 500,
                  background: `${accent}22`, border: `1px solid ${accent}44`,
                  color: accent, cursor: "pointer",
                }}
              >
                {item.title}
              </button>
            );
          })}
        </div>
      )}

      {/* Scrollable time grid */}
      <div
        ref={scrollRef}
        className="scroll-area"
        style={{ flex: 1, overflowY: "auto", position: "relative" }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div style={{ position: "relative", height: TOTAL_H, paddingLeft: 52 }}>
          {/* Hour lines + labels */}
          {Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => {
            const h = START_HOUR + i;
            return (
              <div key={h} style={{
                position: "absolute",
                top: i * HOUR_HEIGHT,
                left: 0,
                right: 0,
                display: "flex",
                alignItems: "flex-start",
                pointerEvents: "none",
              }}>
                <span style={{
                  width: 44, flexShrink: 0, textAlign: "right", paddingRight: 8,
                  fontSize: 10, color: S.dim, lineHeight: "1",
                  transform: "translateY(-6px)",
                }}>
                  {h < END_HOUR ? hourLabel(h) : ""}
                </span>
                <div style={{ flex: 1, height: 1, background: S.border }} />
              </div>
            );
          })}

          {/* Current time indicator */}
          {isToday && (
            <div style={{
              position: "absolute",
              top: nowTop,
              left: 52,
              right: 0,
              height: 2,
              background: "var(--gg-primary,#2563eb)",
              zIndex: 10,
              pointerEvents: "none",
            }}>
              <div style={{
                position: "absolute",
                left: -4,
                top: -4,
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: "var(--gg-primary,#2563eb)",
              }} />
            </div>
          )}

          {/* Timed events */}
          {placed.map(({ item, top, height, col, cols }) => {
            const t = typeMap[item.item_type];
            const family = getFamilyByKey(t?.color ?? "blue");
            const accent = family?.shades[2] ?? "#3b82f6";
            // 52px = time label column width; events must not overlap it
            const colW   = `calc((100% - 52px - 4px) / ${cols})`;
            const left   = `calc(52px + ${col} * (100% - 52px - 4px) / ${cols})`;
            const startStr = (item as any).start_at ?? item.due_date!;
            return (
              <button
                key={item.id}
                onClick={() => onItemTap(item)}
                style={{
                  position: "absolute",
                  top,
                  height,
                  left,
                  width: colW,
                  background: `${accent}22`,
                  borderLeft: `3px solid ${accent}`,
                  borderRadius: "0 6px 6px 0",
                  padding: "3px 6px",
                  cursor: "pointer",
                  overflow: "hidden",
                  textAlign: "left",
                  borderLeft: `3px solid ${accent}`,
                  borderTop: "none", borderRight: "none", borderBottom: "none",
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 600, color: accent, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.title}
                </div>
                <div style={{ fontSize: 10, color: S.dim }}>
                  {fmtTime(startStr, tz)}
                </div>
              </button>
            );
          })}

          {/* Empty state */}
          {dayItems.length === 0 && (
            <div style={{
              position: "absolute",
              top: "30%",
              left: 0, right: 0,
              textAlign: "center",
              color: S.dim, fontSize: 13,
              pointerEvents: "none",
            }}>
              Nothing scheduled. Tap + to add something.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
