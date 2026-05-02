"use client";

import { useRef } from "react";
import {
  todayStr, addDays, localDateStr, effectiveDate, fmtItemDate,
} from "@/lib/date-utils";
import { getFamilyByKey } from "@/lib/sitrep-colors";
import type { SitRepItem } from "@/app/(pwa)/list/ListRow";

const S = {
  text:   "rgb(236 240 245)",
  dim:    "rgb(100 116 139)",
  border: "rgba(255,255,255,.07)",
} as const;

type ItemType = { id: string; name: string; slug: string; color: string };

interface WeekViewProps {
  items: SitRepItem[];
  types: ItemType[];
  cursor: string;     // any day within the week
  tz: string;
  onCursorChange: (ds: string) => void;
  onItemTap: (item: SitRepItem) => void;
}

function startOfWeek(ds: string): string {
  const d = new Date(ds + "T00:00:00");
  d.setDate(d.getDate() - d.getDay()); // Sunday = 0
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fmtWeekRange(ws: string): string {
  const s = new Date(ws + "T00:00:00");
  const e = new Date(addDays(ws, 6) + "T00:00:00");
  return (
    s.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    " – " +
    e.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  );
}

function fmtDayHeader(ds: string): string {
  const d = new Date(ds + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase();
}

export default function WeekView({ items, types, cursor, tz, onCursorChange, onItemTap }: WeekViewProps) {
  const ws      = startOfWeek(cursor);
  const today   = todayStr();
  const typeMap = Object.fromEntries(types.map((t) => [t.slug, t]));

  // Build 7-day array
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));

  // Touch swipe to navigate weeks
  const touchStartX = useRef(0);
  function onTouchStart(e: React.TouchEvent) { touchStartX.current = e.touches[0].clientX; }
  function onTouchEnd(e: React.TouchEvent) {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 60) onCursorChange(addDays(ws, dx < 0 ? 7 : -7));
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Week nav header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 16px", borderBottom: `1px solid ${S.border}`, flexShrink: 0,
      }}>
        <button onClick={() => onCursorChange(addDays(ws, -7))}
          style={{ background: "none", border: "none", color: S.dim, fontSize: 20, cursor: "pointer", padding: "4px 8px" }}>‹</button>
        <span style={{ fontSize: 13, fontWeight: 600, color: S.text }}>
          {fmtWeekRange(ws)}
        </span>
        <button onClick={() => onCursorChange(addDays(ws, 7))}
          style={{ background: "none", border: "none", color: S.dim, fontSize: 20, cursor: "pointer", padding: "4px 8px" }}>›</button>
      </div>

      {/* Day list — scrollable */}
      <div
        className="scroll-area"
        style={{ flex: 1, overflowY: "auto" }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {days.map((ds) => {
          const isToday = ds === today;
          const dayItems = items.filter((item) => {
            const ed = effectiveDate(item);
            if (!ed) return false;
            return (ed.includes("T") ? localDateStr(ed) : ed) === ds;
          });

          return (
            <div key={ds}>
              {/* Day header */}
              <div style={{
                padding: "10px 16px 4px",
                display: "flex", alignItems: "center", gap: 8,
              }}>
                <div style={{
                  display: "inline-flex", alignItems: "center",
                  padding: "3px 10px", borderRadius: 20,
                  background: isToday
                    ? "color-mix(in srgb, var(--gg-primary, #2563eb) 12%, transparent)"
                    : "transparent",
                }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
                    color: isToday ? "var(--gg-primary,#2563eb)" : S.dim,
                  }}>
                    {fmtDayHeader(ds)}
                  </span>
                </div>
              </div>

              {/* Items for this day */}
              {dayItems.length === 0 ? (
                <div style={{ padding: "4px 16px 10px", fontSize: 12, color: S.dim, fontStyle: "italic" }}>
                  Nothing scheduled
                </div>
              ) : (
                dayItems.map((item) => {
                  const t = typeMap[item.item_type];
                  const family = getFamilyByKey(t?.color ?? "blue");
                  const accent = family?.shades[2] ?? "#3b82f6";
                  const dateLabel = fmtItemDate(item, tz);
                  return (
                    <button
                      key={item.id}
                      onClick={() => onItemTap(item)}
                      style={{
                        display: "flex", alignItems: "center", gap: 12,
                        width: "100%", padding: "10px 16px",
                        background: "none", border: "none",
                        borderBottom: `1px solid ${S.border}`,
                        cursor: "pointer",
                        boxShadow: `inset 3px 0 0 0 ${accent}`,
                        textAlign: "left",
                        minHeight: 44,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 14, fontWeight: 500, color: S.text,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {item.title}
                        </div>
                        {dateLabel && (
                          <div style={{ fontSize: 11, color: S.dim, marginTop: 2 }}>
                            {dateLabel}
                          </div>
                        )}
                      </div>
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 5,
                        background: `${accent}33`, color: accent, flexShrink: 0,
                      }}>
                        {t?.name?.toUpperCase() ?? item.item_type.toUpperCase()}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
