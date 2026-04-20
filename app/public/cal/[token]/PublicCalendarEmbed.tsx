"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { COLOR_FAMILIES, SYSTEM_TYPE_FAMILIES, getFamilyByKey, type ColorFamily } from "@/lib/sitrep-colors";

type View = "month" | "week" | "day";

type PublicItem = {
  id: string;
  item_type: string;
  title: string;
  status: string | null;
  due_date: string | null;
  start_at: string | null;
  end_at: string | null;
  is_all_day: boolean | null;
  location: string | null;
  location_address: string | null;
  description?: string | null;
};

type CalConfig = {
  name: string;
  show_day: boolean;
  show_week: boolean;
  show_month: boolean;
  default_view: View;
};

// ── Date helpers ───────────────────────────────────────────────────────────────

function todayStr() { return new Date().toISOString().split("T")[0]; }

function effectiveDate(item: PublicItem): string | null {
  if (item.item_type === "task") return item.due_date;
  return item.start_at ?? item.due_date;
}

function hasExplicitTime(s: string | null | undefined): boolean {
  if (!s || !s.includes("T")) return false;
  return !s.split("T")[1].startsWith("00:00");
}

function addDays(ds: string, n: number): string {
  const d = new Date(ds + "T00:00:00"); d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}
function addMonths(ds: string, n: number): string {
  const d = new Date(ds + "T00:00:00"); d.setMonth(d.getMonth() + n);
  return d.toISOString().split("T")[0];
}
function startOfWeek(ds: string): string {
  const d = new Date(ds + "T00:00:00"); d.setDate(d.getDate() - d.getDay());
  return d.toISOString().split("T")[0];
}
function getMonthGrid(ds: string): string[] {
  const first = new Date(ds.slice(0, 8) + "01T00:00:00");
  const grid  = new Date(first);
  grid.setDate(grid.getDate() - first.getDay());
  const days: string[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(grid); d.setDate(d.getDate() + i);
    days.push(d.toISOString().split("T")[0]);
  }
  return days;
}
function fmtMonthYear(ds: string): string {
  return new Date(ds + "T00:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" });
}
function fmtWeekRange(ws: string): string {
  const s = new Date(ws + "T00:00:00"), e = new Date(addDays(ws, 6) + "T00:00:00");
  return s.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " – " +
    e.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtFullDay(ds: string): string {
  return new Date(ds + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}
function fmtTime(s: string): string {
  return new Date(s).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}
function fmtDateLabel(item: PublicItem): string {
  const ed = effectiveDate(item);
  if (!ed) return "";
  const ds = ed.split("T")[0];
  const today = todayStr();
  const tomorrow = addDays(today, 1);
  const prefix = ds === today ? "Today" : ds === tomorrow ? "Tomorrow"
    : new Date(ds + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const time = hasExplicitTime(item.start_at) && !item.is_all_day ? " · " + fmtTime(item.start_at!) : "";
  return prefix + time;
}

// ── Color helpers ──────────────────────────────────────────────────────────────

function getItemFamily(item: PublicItem, typeColors: Record<string, string>): ColorFamily {
  const key = typeColors[item.item_type] ?? SYSTEM_TYPE_FAMILIES[item.item_type] ?? "blue";
  return getFamilyByKey(key) ?? COLOR_FAMILIES[0];
}

// ── Modal ──────────────────────────────────────────────────────────────────────

function PublicModal({ item, typeColors, onClose }: {
  item: PublicItem; typeColors: Record<string, string>; onClose: () => void;
}) {
  const family = getItemFamily(item, typeColors);
  const isDone = item.status === "done";
  const cardBg = isDone ? family.shades[1] : family.shades[3];
  const textColor = isDone ? "#fff" : "#0f172a";
  const dimColor  = isDone ? "rgba(255,255,255,.7)" : "#475569";

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "rgba(0,0,0,.6)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: "min(480px, 100%)",
        background: "rgba(20,25,38,.97)", backdropFilter: "blur(20px)",
        border: "1px solid rgba(255,255,255,.1)",
        borderRadius: 16, overflow: "hidden",
        boxShadow: "0 24px 64px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.06)",
        maxHeight: "90vh", display: "flex", flexDirection: "column",
      }}>
        {/* Color header */}
        <div style={{
          background: cardBg, padding: "18px 20px",
          display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 17, fontWeight: 700, color: textColor,
              textDecoration: isDone ? "line-through" : "none",
            }}>
              {item.title}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "rgba(0,0,0,.15)", border: "none", color: textColor,
            cursor: "pointer", fontSize: 16, padding: "4px 8px", borderRadius: 6, lineHeight: 1,
          }}>✕</button>
        </div>

        {/* Details */}
        <div style={{ padding: "20px", display: "grid", gap: 14, overflowY: "auto" }}>

          {/* Date & time */}
          {effectiveDate(item) && (
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span style={{ fontSize: 16, opacity: 0.45, flexShrink: 0 }}>📅</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0" }}>
                  {fmtDateLabel(item)}
                </div>
                {item.end_at && hasExplicitTime(item.end_at) && !item.is_all_day && (
                  <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 2 }}>
                    Ends {fmtTime(item.end_at)}
                  </div>
                )}
                {item.is_all_day && (
                  <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>All day</div>
                )}
              </div>
            </div>
          )}

          {/* Location */}
          {(item.location || item.location_address) && (
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span style={{ fontSize: 16, opacity: 0.45, flexShrink: 0 }}>📍</span>
              <div>
                {item.location && (
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0" }}>{item.location}</div>
                )}
                {item.location_address && (() => {
                  const addr = item.location_address;
                  const isUrl = /^https?:\/\//i.test(addr);
                  return (
                    <a
                      href={isUrl ? addr : `https://maps.google.com/?q=${encodeURIComponent(addr)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 13, color: "#60a5fa", textDecoration: "underline", wordBreak: "break-all" }}
                    >
                      {addr}
                    </a>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Description */}
          {item.description && (
            <div style={{
              fontSize: 13, color: "#cbd5e1", lineHeight: 1.7,
              background: "rgba(255,255,255,.04)", borderRadius: 8,
              padding: "10px 14px", border: "1px solid rgba(255,255,255,.08)",
              whiteSpace: "pre-wrap",
            }}>
              {item.description}
            </div>
          )}

          {!effectiveDate(item) && !item.location && !item.location_address && !item.description && (
            <div style={{ fontSize: 13, color: "#64748b", textAlign: "center", padding: "8px 0" }}>
              No additional details.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Item pill ──────────────────────────────────────────────────────────────────

function Pill({ item, typeColors, onClick }: {
  item: PublicItem; typeColors: Record<string, string>; onClick: () => void;
}) {
  const family = getItemFamily(item, typeColors);
  const isDone = item.status === "done";
  const time   = hasExplicitTime(item.start_at) && !item.is_all_day ? fmtTime(item.start_at!) + " " : "";
  const accentCol = isDone ? family.shades[0] : family.shades[2];
  const idleShadow  = `inset 2px 0 0 0 ${accentCol}, 0 1px 3px rgba(0,0,0,.2)`;
  const hoverShadow = `inset 2px 0 0 0 ${accentCol}, 0 3px 10px rgba(0,0,0,.3), 0 0 10px ${accentCol}22`;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={item.title}
      style={{
        display: "block", width: "100%", textAlign: "left",
        padding: "3px 7px", borderRadius: 5, fontSize: 11, fontWeight: 600,
        background: isDone ? family.shades[1] : family.shades[3],
        color: isDone ? "#fff" : "#0f172a", border: "none", cursor: "pointer",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        textDecoration: isDone ? "line-through" : "none",
        opacity: isDone ? 0.75 : 1,
        boxShadow: idleShadow,
        transition: "all .12s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = hoverShadow;
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = idleShadow;
        e.currentTarget.style.transform = "";
      }}
    >
      {time}{item.title}
    </button>
  );
}

// ── Main embed component ───────────────────────────────────────────────────────

export default function PublicCalendarEmbed({ token }: { token: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [calConfig, setCalConfig] = useState<CalConfig | null>(null);
  const [items, setItems] = useState<PublicItem[]>([]);
  const [typeColors, setTypeColors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [view, setView]     = useState<View>((searchParams.get("view") as View) ?? "month");
  const [curDate, setCurDate] = useState(searchParams.get("date") ?? todayStr());
  const [modal, setModal]   = useState<PublicItem | null>(null);

  const hideTitle  = searchParams.get("hide_title")  === "1";
  const transparent = searchParams.get("transparent") === "1";

  useEffect(() => {
    fetch(`/api/public/cal/${token}`)
      .then((r) => {
        if (r.status === 404) { setNotFound(true); return null; }
        return r.json();
      })
      .then((d) => {
        if (!d) return;
        setCalConfig(d.calendar);
        setItems(d.items ?? []);
        setTypeColors(d.typeColors ?? {});
        // Apply default view from config if no URL param
        if (!searchParams.get("view") && d.calendar?.default_view) {
          setView(d.calendar.default_view);
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [token]);

  // Report height to parent iframe so it can auto-resize
  useEffect(() => {
    if (typeof window === "undefined" || window.parent === window) return;
    const send = () => window.parent.postMessage(
      { type: "gg-cal-height", height: document.documentElement.scrollHeight },
      "*"
    );
    send();
    const ro = new ResizeObserver(send);
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, [items, view, curDate]);

  function navigate(newView: View, newDate: string) {
    setView(newView); setCurDate(newDate);
    const p = new URLSearchParams({ view: newView, date: newDate });
    router.replace(`?${p.toString()}`, { scroll: false });
  }
  function stepBack() {
    if (view === "month") navigate("month", addMonths(curDate, -1));
    else if (view === "week") navigate("week", addDays(startOfWeek(curDate), -7));
    else navigate("day", addDays(curDate, -1));
  }
  function stepForward() {
    if (view === "month") navigate("month", addMonths(curDate, 1));
    else if (view === "week") navigate("week", addDays(startOfWeek(curDate), 7));
    else navigate("day", addDays(curDate, 1));
  }

  // Build date → items map
  const dateMap = new Map<string, PublicItem[]>();
  for (const item of items) {
    const ed = effectiveDate(item);
    if (!ed) continue;
    const ds = ed.split("T")[0];
    if (!dateMap.has(ds)) dateMap.set(ds, []);
    dateMap.get(ds)!.push(item);
  }
  dateMap.forEach((arr) => arr.sort((a, b) => (effectiveDate(a) ?? "").localeCompare(effectiveDate(b) ?? "")));

  const S_border   = "rgb(43 53 67)";
  const S_text     = "rgb(238 242 246)";
  const S_dim      = "rgb(160 174 192)";
  const S_surface  = "rgb(18 23 33)";
  const S_card     = "rgb(28 36 48)";

  const periodLabel = view === "month"
    ? fmtMonthYear(curDate)
    : view === "week" ? fmtWeekRange(startOfWeek(curDate))
    : fmtFullDay(curDate);

  const availableViews: View[] = !calConfig ? ["month"] : [
    ...(calConfig.show_day   ? ["day"]   as const : []),
    ...(calConfig.show_week  ? ["week"]  as const : []),
    ...(calConfig.show_month ? ["month"] as const : []),
  ];

  if (loading) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgb(12 16 24)", color: S_dim, fontFamily: "system-ui, sans-serif", fontSize: 14,
      }}>
        Loading calendar…
      </div>
    );
  }

  if (notFound) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        background: "rgb(12 16 24)", color: S_dim, fontFamily: "system-ui, sans-serif",
        gap: 8,
      }}>
        <div style={{ fontSize: 36, opacity: 0.25 }}>◫</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: S_text }}>Calendar not found</div>
        <div style={{ fontSize: 13 }}>This calendar link may have been removed or expired.</div>
      </div>
    );
  }

  const today = todayStr();
  const MAX_PILLS = 3;

  return (
    <>
    <style>{`html,body{height:auto!important;overflow:auto!important;}`}</style>
    <div style={{
      background: transparent ? "transparent" : "rgb(12 16 24)",
      fontFamily: "system-ui, -apple-system, sans-serif", color: S_text,
      padding: "20px 20px", boxSizing: "border-box",
    }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>

        {/* Header */}
        {!hideTitle && (
          <div style={{ marginBottom: 20 }}>
            <h1 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 700, color: S_text }}>
              {calConfig?.name}
            </h1>
          </div>
        )}

        {/* Controls */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
          <button onClick={stepBack} style={navBtnStyle(S_border, S_text)}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,.09)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,.05)"; e.currentTarget.style.transform = ""; }}>←</button>
          <div style={{ flex: 1, fontWeight: 700, fontSize: 15, color: S_text, textAlign: "center", minWidth: 160 }}>
            {periodLabel}
          </div>
          <button onClick={stepForward} style={navBtnStyle(S_border, S_text)}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,.09)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,.05)"; e.currentTarget.style.transform = ""; }}>→</button>
          <button onClick={() => navigate(view, today)} style={{
            padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
            border: "1px solid color-mix(in srgb, var(--gg-primary, #2563eb) 40%, transparent)",
            background: "color-mix(in srgb, var(--gg-primary, #2563eb) 14%, transparent)",
            color: "color-mix(in srgb, var(--gg-primary, #2563eb) 85%, #fff)",
            backdropFilter: "blur(8px)", transition: "transform .12s ease, box-shadow .12s ease",
          }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,.3)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; }}>
            Today
          </button>
          {availableViews.length > 1 && (
            <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: `1px solid ${S_border}`, backdropFilter: "blur(8px)" }}>
              {availableViews.map((v) => (
                <button key={v} onClick={() => navigate(v, curDate)} style={{
                  padding: "6px 13px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                  background: view === v
                    ? "color-mix(in srgb, var(--gg-primary, #2563eb) 16%, transparent)"
                    : "rgba(255,255,255,.03)",
                  color: view === v
                    ? "color-mix(in srgb, var(--gg-primary, #2563eb) 90%, #fff)"
                    : S_dim,
                  border: "none", borderLeft: v !== availableViews[0] ? `1px solid ${S_border}` : "none",
                  transition: "background .15s ease, color .15s ease",
                }}>
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Calendar body */}
        <div style={{
          background: S_card, border: `1px solid ${S_border}`,
          borderRadius: 14, padding: 16,
        }}>
          {/* Month view */}
          {view === "month" && (() => {
            const grid = getMonthGrid(curDate);
            const curMonth = curDate.slice(0, 7);
            const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
            return (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 2 }}>
                  {DOW.map((d) => (
                    <div key={d} style={{
                      textAlign: "center", fontSize: 10, fontWeight: 700,
                      color: S_dim, textTransform: "uppercase", padding: "6px 0",
                    }}>{d}</div>
                  ))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
                  {grid.map((ds) => {
                    const isToday = ds === today;
                    const inMonth = ds.startsWith(curMonth);
                    const dayItems = dateMap.get(ds) ?? [];
                    const visible  = dayItems.slice(0, MAX_PILLS);
                    const overflow = dayItems.length - MAX_PILLS;
                    return (
                      <div key={ds} style={{
                        minHeight: 80, padding: "5px 4px",
                        background: isToday
                          ? "color-mix(in srgb, var(--gg-primary, #2563eb) 10%, transparent)"
                          : inMonth ? S_surface : "rgba(255,255,255,.01)",
                        border: isToday
                          ? "1px solid color-mix(in srgb, var(--gg-primary, #2563eb) 30%, transparent)"
                          : `1px solid ${S_border}`,
                        boxShadow: isToday ? "inset 0 0 18px color-mix(in srgb, var(--gg-primary, #2563eb) 8%, transparent)" : "none",
                        borderRadius: 7,
                        transition: "transform .12s ease, box-shadow .12s ease",
                      }}>
                        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 3 }}>
                          {isToday ? (
                            <div style={{
                              width: 22, height: 22, borderRadius: "50%",
                              background: "var(--gg-primary, #2563eb)",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 11, fontWeight: 800, color: "#fff",
                              boxShadow: "0 0 8px color-mix(in srgb, var(--gg-primary, #2563eb) 55%, transparent)",
                            }}>
                              {parseInt(ds.split("-")[2], 10)}
                            </div>
                          ) : (
                            <span style={{
                              fontSize: 11, fontWeight: inMonth ? 500 : 400,
                              color: inMonth ? S_text : S_dim,
                            }}>
                              {parseInt(ds.split("-")[2], 10)}
                            </span>
                          )}
                        </div>
                        <div style={{ display: "grid", gap: 2 }}>
                          {visible.map((item) => (
                            <Pill key={item.id} item={item} typeColors={typeColors} onClick={() => setModal(item)} />
                          ))}
                          {overflow > 0 && (
                            <button onClick={() => navigate("day", ds)} style={{
                              fontSize: 10, fontWeight: 600, color: S_dim,
                              background: "none", border: "none", cursor: "pointer",
                              padding: "1px 4px", textAlign: "left",
                            }}>+{overflow} more</button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Week view */}
          {view === "week" && (() => {
            const ws   = startOfWeek(curDate);
            const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
            return (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
                {days.map((ds) => {
                  const isToday  = ds === today;
                  const dayItems = dateMap.get(ds) ?? [];
                  const d        = new Date(ds + "T00:00:00");
                  return (
                    <div key={ds} style={{
                      background: isToday
                        ? "color-mix(in srgb, var(--gg-primary, #2563eb) 8%, transparent)"
                        : S_surface,
                      border: isToday
                        ? "1px solid color-mix(in srgb, var(--gg-primary, #2563eb) 35%, transparent)"
                        : `1px solid ${S_border}`,
                      borderRadius: 9, padding: "8px 6px", minHeight: 160,
                    }}>
                      <div style={{ textAlign: "center", marginBottom: 8 }}>
                        <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em", color: S_dim, marginBottom: 4 }}>
                          {d.toLocaleDateString("en-US", { weekday: "short" })}
                        </div>
                        {isToday ? (
                          <div style={{
                            width: 26, height: 26, borderRadius: "50%",
                            background: "var(--gg-primary, #2563eb)",
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            fontSize: 13, fontWeight: 800, color: "#fff",
                            boxShadow: "0 0 10px color-mix(in srgb, var(--gg-primary, #2563eb) 55%, transparent)",
                          }}>
                            {d.getDate()}
                          </div>
                        ) : (
                          <div style={{ fontSize: 15, fontWeight: 700, color: S_text }}>
                            {d.getDate()}
                          </div>
                        )}
                      </div>
                      <div style={{ display: "grid", gap: 3 }}>
                        {dayItems.map((item) => (
                          <Pill key={item.id} item={item} typeColors={typeColors} onClick={() => setModal(item)} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Day view */}
          {view === "day" && (() => {
            const dayItems = dateMap.get(curDate) ?? [];
            return dayItems.length === 0 ? (
              <div style={{ padding: "48px 0", textAlign: "center", color: S_dim, fontSize: 14 }}>
                <div style={{ fontSize: 28, opacity: 0.2, marginBottom: 10 }}>◷</div>
                Nothing scheduled.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 6 }}>
                {dayItems.map((item) => {
                  const family = getItemFamily(item, typeColors);
                  const isDone = item.status === "done";
                  const accentCol = family.shades[2] ?? family.shades[1] ?? "#2563eb";
                  const time   = hasExplicitTime(item.start_at) && !item.is_all_day ? fmtTime(item.start_at!) : null;
                  const idleShadow = `inset 3px 0 0 0 ${accentCol}, 0 2px 8px rgba(0,0,0,.2)`;
                  const hoverShadow = `inset 3px 0 0 0 ${accentCol}, 0 6px 20px rgba(0,0,0,.35), 0 0 0 1px ${accentCol}22`;
                  return (
                    <div key={item.id} onClick={() => setModal(item)} style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "11px 14px", borderRadius: 10, cursor: "pointer",
                      background: "rgba(255,255,255,.04)",
                      border: "1px solid rgba(255,255,255,.07)",
                      boxShadow: idleShadow,
                      opacity: isDone ? 0.6 : 1,
                      transition: "transform .12s ease, box-shadow .12s ease",
                    }}
                      onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = hoverShadow; }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = idleShadow; }}
                    >
                      {time && (
                        <span style={{ fontSize: 11, fontWeight: 600, color: S_dim, minWidth: 52, textAlign: "right", flexShrink: 0 }}>
                          {time}
                        </span>
                      )}
                      <span style={{
                        flex: 1, fontSize: 14, fontWeight: 500,
                        color: S_text,
                        textDecoration: isDone ? "line-through" : "none",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {item.title}
                      </span>
                      {item.location && (
                        <span style={{ fontSize: 11, color: S_dim, flexShrink: 0 }}>
                          📍 {item.location}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {/* Color key */}
        {(() => {
          const entries = Object.keys(typeColors).length > 0
            ? Object.entries(typeColors)
            : [...new Set(items.map((i) => i.item_type))].map((slug) => [slug, "blue"] as [string, string]);
          if (entries.length === 0) return null;
          return (
            <div style={{
              display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center",
              padding: "10px 16px", borderRadius: 10, marginTop: 12,
              background: "rgba(255,255,255,.02)", border: `1px solid ${S_border}`,
            }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.09em", color: S_dim, textTransform: "uppercase" }}>
                Types
              </span>
              {entries.map(([slug, colorKey]) => {
                const family = getFamilyByKey(colorKey) ?? COLOR_FAMILIES[0];
                const label = slug === "task" ? "Tasks" : slug === "event" ? "Events" : slug === "meeting" ? "Meetings"
                  : slug.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
                return (
                  <div key={slug} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{
                      width: 32, height: 14, borderRadius: 4,
                      background: family.shades[3],
                      boxShadow: `inset 3px 0 0 0 ${family.shades[2]}`,
                    }} />
                    <span style={{ fontSize: 11, fontWeight: 500, color: S_dim }}>{label}</span>
                  </div>
                );
              })}
            </div>
          );
        })()}

      </div>

      {modal && (
        <PublicModal item={modal} typeColors={typeColors} onClose={() => setModal(null)} />
      )}
    </div>
    </>
  );
}

function navBtnStyle(border: string, color: string): React.CSSProperties {
  return {
    padding: "6px 12px", borderRadius: 8,
    border: "1px solid rgba(255,255,255,.09)",
    background: "rgba(255,255,255,.05)", backdropFilter: "blur(8px)",
    boxShadow: "0 2px 8px rgba(0,0,0,.25), inset 0 1px 0 rgba(255,255,255,.06)",
    color, cursor: "pointer", fontSize: 13,
    transition: "transform .12s ease, box-shadow .12s ease, background .12s ease",
  };
}
