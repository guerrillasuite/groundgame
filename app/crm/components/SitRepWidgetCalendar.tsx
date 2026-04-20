"use client";

import { useState } from "react";
import Link from "next/link";

type Item = {
  id: string;
  item_type: string;
  title: string;
  status: string | null;
  priority: string | null;
  due_date: string | null;
  start_at: string | null;
};

type View = "day" | "week" | "month";

type Props = {
  items: Item[];
  typeAccents: Record<string, string>;
  defaultView: View;
};

// ── Date helpers ───────────────────────────────────────────────────────────────

function todayStr() { return new Date().toISOString().split("T")[0]; }

function addDays(ds: string, n: number): string {
  const d = new Date(ds + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

function addMonths(ds: string, n: number): string {
  const d = new Date(ds + "T12:00:00");
  d.setMonth(d.getMonth() + n);
  return d.toISOString().split("T")[0];
}

function startOfWeek(ds: string): string {
  const d = new Date(ds + "T12:00:00");
  d.setDate(d.getDate() - d.getDay()); // Sunday = 0
  return d.toISOString().split("T")[0];
}

function getMonthGrid(ds: string): string[] {
  const first = new Date(ds.slice(0, 8) + "01T12:00:00");
  const grid  = new Date(first);
  grid.setDate(grid.getDate() - first.getDay());
  const days: string[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(grid);
    d.setDate(d.getDate() + i);
    days.push(d.toISOString().split("T")[0]);
  }
  return days;
}

function fmtMonthYear(ds: string): string {
  return new Date(ds + "T12:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function fmtWeekRange(ws: string): string {
  const s = new Date(ws + "T12:00:00");
  const e = new Date(addDays(ws, 6) + "T12:00:00");
  return (
    s.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    " – " +
    e.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  );
}

function fmtDayLong(ds: string): string {
  return new Date(ds + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "short", day: "numeric",
  });
}

function effectiveDate(item: Item): string | null {
  return item.item_type === "task" ? item.due_date : item.start_at ?? item.due_date;
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function SitRepWidgetCalendar({ items, typeAccents, defaultView }: Props) {
  const [view, setView]       = useState<View>(defaultView);
  const [curDate, setCurDate] = useState(todayStr());
  const today = todayStr();

  const getAccent   = (item: Item) => typeAccents[item.item_type] ?? "#3b82f6";
  const itemsOnDay  = (ds: string) =>
    items.filter((i) => { const d = effectiveDate(i); return d && d.startsWith(ds); });

  const weekStart = startOfWeek(curDate);

  function stepBack() {
    if (view === "day")   setCurDate(addDays(curDate, -1));
    if (view === "week")  setCurDate(addDays(weekStart, -7));
    if (view === "month") setCurDate(addMonths(curDate, -1));
  }
  function stepForward() {
    if (view === "day")   setCurDate(addDays(curDate, 1));
    if (view === "week")  setCurDate(addDays(weekStart, 7));
    if (view === "month") setCurDate(addMonths(curDate, 1));
  }

  const periodLabel =
    view === "month" ? fmtMonthYear(curDate)
    : view === "week" ? fmtWeekRange(weekStart)
    : fmtDayLong(curDate);

  const navBtn: React.CSSProperties = {
    padding: "3px 8px", borderRadius: 6,
    border: "1px solid var(--gg-border, #e5e7eb)",
    background: "rgba(0,0,0,.03)", color: "var(--gg-text, #111)",
    cursor: "pointer", fontSize: 13, fontWeight: 600, lineHeight: 1.6,
    transition: "background .1s",
  };

  return (
    <div>
      {/* Nav bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 10 }}>
        <button style={navBtn} onClick={stepBack}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(0,0,0,.07)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(0,0,0,.03)"; }}>←</button>
        <button style={{ ...navBtn, fontSize: 11 }} onClick={() => setCurDate(today)}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(0,0,0,.07)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(0,0,0,.03)"; }}>Today</button>

        <span style={{
          flex: 1, textAlign: "center", fontSize: 11, fontWeight: 700,
          color: "var(--gg-text, #111)", whiteSpace: "nowrap",
          overflow: "hidden", textOverflow: "ellipsis", padding: "0 4px",
        }}>{periodLabel}</span>

        <button style={navBtn} onClick={stepForward}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(0,0,0,.07)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(0,0,0,.03)"; }}>→</button>

        {/* View switcher */}
        <div style={{ display: "flex", gap: 2, marginLeft: 4 }}>
          {(["Day", "Week", "Month"] as const).map((label) => {
            const v = label.toLowerCase() as View;
            const active = view === v;
            return (
              <button key={v} onClick={() => setView(v)} style={{
                padding: "3px 8px", borderRadius: 12, fontSize: 10, fontWeight: 700,
                cursor: "pointer", transition: "all .12s ease",
                border: active
                  ? "1px solid color-mix(in srgb, var(--gg-primary, #2563eb) 50%, transparent)"
                  : "1px solid var(--gg-border, #e5e7eb)",
                background: active
                  ? "color-mix(in srgb, var(--gg-primary, #2563eb) 12%, transparent)"
                  : "transparent",
                color: active
                  ? "color-mix(in srgb, var(--gg-primary, #2563eb) 85%, #000)"
                  : "var(--gg-text-dim, #6b7280)",
              }}>{label}</button>
            );
          })}
        </div>
      </div>

      {view === "week"  && <WeekView  weekStart={weekStart} today={today} itemsOnDay={itemsOnDay} getAccent={getAccent} />}
      {view === "day"   && <DayView   day={curDate}         today={today} itemsOnDay={itemsOnDay} getAccent={getAccent} />}
      {view === "month" && <MonthView curDate={curDate}     today={today} itemsOnDay={itemsOnDay} getAccent={getAccent}
                             onDayClick={(d) => { setCurDate(d); setView("day"); }} />}
    </div>
  );
}

// ── Week view ──────────────────────────────────────────────────────────────────

function WeekView({ weekStart, today, itemsOnDay, getAccent }: {
  weekStart: string; today: string;
  itemsOnDay: (d: string) => Item[];
  getAccent:  (i: Item) => string;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
      {days.map((day) => {
        const dayItems = itemsOnDay(day);
        const isToday  = day === today;
        const dayNum   = parseInt(day.split("-")[2]);
        const dayName  = new Date(day + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" });
        return (
          <div key={day} style={{ minHeight: 60 }}>
            {/* Day header */}
            <div style={{
              textAlign: "center", paddingBottom: 4, marginBottom: 4,
              borderBottom: "1px solid var(--gg-border, #e5e7eb)",
            }}>
              <div style={{
                fontSize: 9, fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "0.05em", color: "var(--gg-text-dim, #6b7280)",
              }}>{dayName}</div>
              {isToday ? (
                <div style={{
                  width: 20, height: 20, borderRadius: "50%", margin: "1px auto 0",
                  background: "var(--gg-primary, #2563eb)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 700, color: "#fff",
                }}>{dayNum}</div>
              ) : (
                <div style={{ fontSize: 11, fontWeight: 600, marginTop: 1, color: "var(--gg-text, #111)" }}>
                  {dayNum}
                </div>
              )}
            </div>
            {/* Items */}
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {dayItems.slice(0, 3).map((item) => (
                <Link key={item.id} href={`/crm/sitrep/${item.id}`} title={item.title} style={{
                  display: "block", textDecoration: "none",
                  padding: "2px 3px", borderRadius: 3,
                  fontSize: 9, fontWeight: 600, lineHeight: 1.5,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  color: "var(--gg-text, #111)",
                  background: getAccent(item) + "28",
                  borderLeft: `2px solid ${getAccent(item)}`,
                }}>{item.title}</Link>
              ))}
              {dayItems.length > 3 && (
                <div style={{ fontSize: 9, color: "var(--gg-text-dim, #6b7280)", paddingLeft: 3 }}>
                  +{dayItems.length - 3} more
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Day view ───────────────────────────────────────────────────────────────────

function DayView({ day, today, itemsOnDay, getAccent }: {
  day: string; today: string;
  itemsOnDay: (d: string) => Item[];
  getAccent:  (i: Item) => string;
}) {
  const dayItems = itemsOnDay(day);
  if (dayItems.length === 0) return (
    <p style={{
      fontSize: 12, color: "var(--gg-text-dim, #6b7280)",
      fontStyle: "italic", textAlign: "center", padding: "14px 0", margin: 0,
    }}>
      Nothing scheduled{day === today ? " today" : ""}.
    </p>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {dayItems.map((item) => {
        const accent = getAccent(item);
        const timeStr =
          item.start_at && item.start_at.includes("T") && !item.start_at.endsWith("T00:00:00")
            ? new Date(item.start_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
            : null;
        return (
          <Link key={item.id} href={`/crm/sitrep/${item.id}`} style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "6px 10px", borderRadius: 7, textDecoration: "none",
            color: "var(--gg-text, #111)",
            background: accent + "18",
            borderLeft: `3px solid ${accent}`,
            transition: "background .1s",
          }}
            onMouseEnter={(e) => { e.currentTarget.style.background = accent + "28"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = accent + "18"; }}
          >
            <span style={{
              flex: 1, fontSize: 12, fontWeight: 500,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>{item.title}</span>
            {timeStr && (
              <span style={{ fontSize: 10, color: "var(--gg-text-dim, #6b7280)", flexShrink: 0 }}>
                {timeStr}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

// ── Month view ─────────────────────────────────────────────────────────────────

function MonthView({ curDate, today, itemsOnDay, getAccent, onDayClick }: {
  curDate: string; today: string;
  itemsOnDay:  (d: string) => Item[];
  getAccent:   (i: Item) => string;
  onDayClick:  (d: string) => void;
}) {
  const grid     = getMonthGrid(curDate);
  const curMonth = curDate.slice(0, 7);
  return (
    <div>
      {/* Day name headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 3 }}>
        {["Su","Mo","Tu","We","Th","Fr","Sa"].map((d) => (
          <div key={d} style={{
            textAlign: "center", fontSize: 9, fontWeight: 700,
            color: "var(--gg-text-dim, #6b7280)",
            textTransform: "uppercase", letterSpacing: "0.04em",
          }}>{d}</div>
        ))}
      </div>
      {/* Day cells */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1 }}>
        {grid.map((day) => {
          const dayItems = itemsOnDay(day);
          const isToday  = day === today;
          const inMonth  = day.startsWith(curMonth);
          const dayNum   = parseInt(day.split("-")[2]);
          return (
            <div key={day} onClick={() => onDayClick(day)} style={{
              cursor: "pointer", padding: "3px 2px",
              textAlign: "center", minHeight: 34, borderRadius: 4,
              transition: "background .1s",
            }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(0,0,0,.05)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              {isToday ? (
                <div style={{
                  width: 18, height: 18, borderRadius: "50%", margin: "0 auto 2px",
                  background: "var(--gg-primary, #2563eb)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 9, fontWeight: 700, color: "#fff",
                }}>{dayNum}</div>
              ) : (
                <div style={{
                  fontSize: 10, fontWeight: inMonth ? 600 : 400, marginBottom: 2,
                  color: inMonth ? "var(--gg-text, #111)" : "var(--gg-text-dim, #9ca3af)",
                }}>{dayNum}</div>
              )}
              {/* Colored dots */}
              {dayItems.length > 0 && (
                <div style={{ display: "flex", justifyContent: "center", gap: 1, flexWrap: "wrap" }}>
                  {dayItems.slice(0, 4).map((item) => (
                    <div key={item.id} style={{
                      width: 4, height: 4, borderRadius: "50%",
                      background: getAccent(item),
                    }} />
                  ))}
                  {dayItems.length > 4 && (
                    <div style={{ fontSize: 7, color: "var(--gg-text-dim, #6b7280)", lineHeight: 1 }}>
                      +{dayItems.length - 4}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
