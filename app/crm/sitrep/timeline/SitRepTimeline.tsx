"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { getFamilyByKey, SYSTEM_TYPE_FAMILIES, COLOR_FAMILIES } from "@/lib/sitrep-colors";
import { SitRepViewToggle } from "../_components/SitRepViewToggle";
import type { SitRepItem, Props } from "../SitRepPanel";

// ── Constants ──────────────────────────────────────────────────────────────────

const ROW_H    = 36;
const HEADER_H = 52;
const LABEL_W  = 224;
const PAD_DAYS = 14;

const ZOOM_LEVELS = [
  { label: "Month", ppd: 12, tickEvery: 7  },
  { label: "2 Wk",  ppd: 28, tickEvery: 3  },
  { label: "Week",  ppd: 60, tickEvery: 1  },
] as const;
type ZoomIdx = 0 | 1 | 2;

// ── Helpers ────────────────────────────────────────────────────────────────────

function todayStr() { return new Date().toISOString().split("T")[0]; }

function addDays(ds: string, n: number): string {
  const d = new Date(ds + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime()) / 86400000
  );
}

function itemStart(item: SitRepItem): string | null {
  return (item.start_at ?? item.due_date)?.split("T")[0] ?? null;
}

function itemEnd(item: SitRepItem): string | null {
  if (item.item_type === "task")
    return item.due_date?.split("T")[0] ?? item.start_at?.split("T")[0] ?? null;
  return (item.end_at ?? item.start_at ?? item.due_date)?.split("T")[0] ?? null;
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function SitRepTimeline({
  initialItems, users, currentUserId, typeColors, typeDefs,
}: Props) {
  const [zoomIdx, setZoomIdx] = useState<ZoomIdx>(0);
  const [scope,   setScope]   = useState<"mine" | "all">("mine");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { ppd, tickEvery } = ZOOM_LEVELS[zoomIdx];
  const today = todayStr();

  const S = {
    bg:        "rgb(10 13 20)",
    card:      "rgb(20 25 38)",
    border:    "rgba(255,255,255,.07)",
    stripe:    "rgba(255,255,255,.018)",
    text:      "rgb(236 240 245)",
    dim:       "rgb(100 116 139)",
    dimBright: "rgb(148 163 184)",
  } as const;

  // ── Filter ────────────────────────────────────────────────────────────────

  let filtered = initialItems.filter(
    (i) => itemStart(i) !== null || itemEnd(i) !== null
  );
  if (scope === "mine") {
    filtered = filtered.filter(
      (i) => i.created_by === currentUserId ||
        i.sitrep_assignments.some((a) => a.user_id === currentUserId)
    );
  }
  filtered = [...filtered].sort((a, b) => {
    const as = itemStart(a) ?? "9999";
    const bs = itemStart(b) ?? "9999";
    return as.localeCompare(bs) || a.title.localeCompare(b.title);
  });

  // ── Date range ────────────────────────────────────────────────────────────

  const allDates = [
    today,
    ...filtered.flatMap((i) => [itemStart(i), itemEnd(i)].filter(Boolean) as string[]),
  ];
  const rawFirst = allDates.reduce((a, b) => (a < b ? a : b));
  const rawLast  = allDates.reduce((a, b) => (a > b ? a : b));
  const rangeStart = addDays(rawFirst, -PAD_DAYS);
  const rangeEnd   = addDays(rawLast,   PAD_DAYS);
  const totalDays  = daysBetween(rangeStart, rangeEnd) + 1;
  const totalWidth = totalDays * ppd;

  function xFor(ds: string) { return daysBetween(rangeStart, ds) * ppd; }
  const todayX = xFor(today);

  // ── Month spans ───────────────────────────────────────────────────────────

  const monthSpans: { label: string; x: number; w: number }[] = [];
  {
    let d = new Date(rangeStart + "T00:00:00");
    let di = 0;
    while (di < totalDays) {
      const label = d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
      const nextM = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const span  = Math.min(
        Math.round((nextM.getTime() - d.getTime()) / 86400000),
        totalDays - di
      );
      monthSpans.push({ label, x: di * ppd, w: span * ppd });
      di += Math.round((nextM.getTime() - d.getTime()) / 86400000);
      d = nextM;
    }
  }

  // ── Tick marks ────────────────────────────────────────────────────────────

  const ticks: { x: number; label: string; isFirst: boolean }[] = [];
  for (let di = 0; di < totalDays; di += tickEvery) {
    const ds = addDays(rangeStart, di);
    const d  = new Date(ds + "T00:00:00");
    const isFirst = d.getDate() <= tickEvery;
    ticks.push({
      x: di * ppd,
      label: isFirst
        ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
        : String(d.getDate()),
      isFirst,
    });
  }

  // ── Pill style ────────────────────────────────────────────────────────────

  const PILL: React.CSSProperties = {
    padding: "5px 13px", borderRadius: 20, fontSize: 12, fontWeight: 600,
    cursor: "pointer", border: "1px solid rgba(255,255,255,.08)",
    background: "rgba(255,255,255,.05)", color: S.dim, transition: "all .1s",
  };

  function scrollToToday() {
    if (!scrollRef.current) return;
    scrollRef.current.scrollLeft = todayX - scrollRef.current.clientWidth / 2 + LABEL_W / 2;
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: S.bg, padding: "24px 24px 60px" }}>
      <div style={{ maxWidth: 1440, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Page header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: S.text }}>SitRep</h1>
            <p style={{ margin: "2px 0 0", fontSize: 13, color: S.dim }}>Timeline</p>
          </div>
          <SitRepViewToggle />
        </div>

        {/* Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {/* Mine / All */}
          <div style={{ display: "flex", gap: 3 }}>
            {(["mine", "all"] as const).map((s) => (
              <button key={s} onClick={() => setScope(s)} style={{
                ...PILL,
                background: scope === s ? "color-mix(in srgb, var(--gg-primary,#2563eb) 18%, transparent)" : "rgba(255,255,255,.05)",
                borderColor: scope === s ? "color-mix(in srgb, var(--gg-primary,#2563eb) 50%, transparent)" : "rgba(255,255,255,.08)",
                color: scope === s ? "color-mix(in srgb, var(--gg-primary,#2563eb) 90%, #fff)" : S.dim,
              }}>
                {s === "mine" ? "Mine" : "All"}
              </button>
            ))}
          </div>

          <div style={{ width: 1, height: 18, background: "rgba(255,255,255,.1)" }} />

          {/* Zoom */}
          <div style={{
            display: "flex", background: "rgba(255,255,255,.06)", borderRadius: 10,
            padding: 3, gap: 2, border: "1px solid rgba(255,255,255,.08)",
          }}>
            {ZOOM_LEVELS.map((z, i) => (
              <button key={z.label} onClick={() => setZoomIdx(i as ZoomIdx)} style={{
                padding: "4px 12px", borderRadius: 7, fontSize: 12, fontWeight: 600,
                cursor: "pointer", border: "none",
                background: zoomIdx === i ? "rgba(255,255,255,.12)" : "transparent",
                color: zoomIdx === i ? S.text : S.dim, transition: "all .1s",
              }}>
                {z.label}
              </button>
            ))}
          </div>

          {/* Today */}
          <button onClick={scrollToToday} style={{
            ...PILL,
            background: "color-mix(in srgb, var(--gg-primary,#2563eb) 14%, transparent)",
            borderColor: "color-mix(in srgb, var(--gg-primary,#2563eb) 40%, transparent)",
            color: "color-mix(in srgb, var(--gg-primary,#2563eb) 90%, #fff)",
          }}>
            Today
          </button>

          <span style={{ marginLeft: "auto", fontSize: 12, color: S.dim }}>
            {filtered.length} item{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Empty state */}
        {filtered.length === 0 && (
          <div style={{
            padding: "64px 0", textAlign: "center", color: S.dim, fontSize: 14,
            border: `1px solid ${S.border}`, borderRadius: 14,
          }}>
            <div style={{ fontSize: 40, opacity: 0.2, marginBottom: 12 }}>◫</div>
            No dated items to show on the timeline.
          </div>
        )}

        {/* Gantt */}
        {filtered.length > 0 && (
          <div
            ref={scrollRef}
            style={{
              overflow: "auto",
              border: `1px solid ${S.border}`,
              borderRadius: 14,
              background: S.card,
              boxShadow: "0 4px 24px rgba(0,0,0,.3)",
              maxHeight: "72vh",
            }}
          >
            <div style={{ minWidth: LABEL_W + totalWidth }}>

              {/* ── Sticky date header ── */}
              <div style={{
                position: "sticky", top: 0, zIndex: 20,
                display: "flex",
                background: S.card,
                borderBottom: `2px solid ${S.border}`,
              }}>
                {/* Corner */}
                <div style={{
                  width: LABEL_W, flexShrink: 0,
                  position: "sticky", left: 0, zIndex: 30,
                  background: S.card,
                  borderRight: `1px solid ${S.border}`,
                  height: HEADER_H,
                }} />

                {/* Header timeline area */}
                <div style={{ width: totalWidth, flexShrink: 0, height: HEADER_H, position: "relative" }}>
                  {/* Month labels */}
                  <div style={{ height: 26, position: "relative", borderBottom: `1px solid ${S.border}` }}>
                    {monthSpans.map((m, i) => (
                      <div key={i} style={{
                        position: "absolute", left: m.x, width: m.w, top: 0, height: 26,
                        display: "flex", alignItems: "center", paddingLeft: 8,
                        fontSize: 11, fontWeight: 700, color: S.text,
                        borderRight: `1px solid ${S.border}`,
                        overflow: "hidden", whiteSpace: "nowrap",
                      }}>
                        {m.w > 28 ? m.label : ""}
                      </div>
                    ))}
                  </div>
                  {/* Day/week tick labels */}
                  <div style={{ height: HEADER_H - 26, position: "relative" }}>
                    {ticks.map((t, i) => (
                      <div key={i} style={{
                        position: "absolute", left: t.x, width: tickEvery * ppd,
                        top: 0, height: HEADER_H - 26,
                        display: "flex", alignItems: "center", paddingLeft: 4,
                        fontSize: 10,
                        fontWeight: t.isFirst ? 700 : 400,
                        color: t.isFirst ? S.dimBright : S.dim,
                        borderRight: `1px solid rgba(255,255,255,.04)`,
                        overflow: "hidden", whiteSpace: "nowrap",
                      }}>
                        {tickEvery * ppd >= 20 ? t.label : ""}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── Item rows ── */}
              {filtered.map((item, idx) => {
                const startDs = itemStart(item);
                const endDs   = itemEnd(item);
                const family  = getFamilyByKey(
                  typeColors?.[item.item_type] ?? SYSTEM_TYPE_FAMILIES[item.item_type] ?? "blue"
                ) ?? COLOR_FAMILIES[0];
                const isMission  = !!(typeDefs?.[item.item_type]?.is_mission_type);
                const isDone     = item.status === "done" || item.status === "cancelled";
                const isPastDue  = !!endDs && endDs < today && !isDone;
                const dow        = startDs ? new Date(startDs + "T00:00:00").getDay() : -1;
                const isWeekend  = dow === 0 || dow === 6;
                const typeLabel  = (typeDefs?.[item.item_type]?.name ?? item.item_type).toUpperCase();

                const barX  = startDs ? xFor(startDs) : null;
                const barW  = startDs && endDs
                  ? Math.max((daysBetween(startDs, endDs) + 1) * ppd, 10)
                  : ppd;

                return (
                  <div key={item.id} style={{
                    display: "flex",
                    height: ROW_H,
                    borderBottom: `1px solid ${S.border}`,
                    background: idx % 2 === 0 ? "transparent" : S.stripe,
                  }}>
                    {/* Sticky label */}
                    <div style={{
                      width: LABEL_W, flexShrink: 0,
                      position: "sticky", left: 0, zIndex: 10,
                      background: idx % 2 === 0 ? S.card : `color-mix(in srgb, ${S.card} 96%, white)`,
                      borderRight: `1px solid ${S.border}`,
                      display: "flex", alignItems: "center", gap: 8, padding: "0 12px",
                    }}>
                      <span style={{
                        width: 8, height: 8, borderRadius: "50%",
                        background: family.shades[2], flexShrink: 0,
                      }} />
                      <span style={{
                        flex: 1,
                        fontSize: isMission ? 12 : 11,
                        fontWeight: isMission ? 700 : 500,
                        color: isDone ? S.dim : S.text,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        textDecoration: isDone ? "line-through" : "none",
                        opacity: isDone ? 0.65 : 1,
                      }}>
                        {item.title}
                      </span>
                      <span style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: "0.05em",
                        padding: "1px 5px", borderRadius: 3, flexShrink: 0,
                        background: `${family.shades[2]}22`, color: family.shades[2],
                      }}>
                        {typeLabel}
                      </span>
                    </div>

                    {/* Timeline cell */}
                    <div style={{ width: totalWidth, flexShrink: 0, position: "relative" }}>
                      {/* Grid lines */}
                      {ticks.map((t, ti) => (
                        <div key={ti} style={{
                          position: "absolute", left: t.x, top: 0, width: 1, height: ROW_H,
                          background: t.isFirst ? "rgba(255,255,255,.07)" : "rgba(255,255,255,.03)",
                          pointerEvents: "none",
                        }} />
                      ))}

                      {/* Weekend shading */}
                      {ppd >= 24 && Array.from({ length: totalDays }, (_, di) => {
                        const ds  = addDays(rangeStart, di);
                        const dow = new Date(ds + "T00:00:00").getDay();
                        if (dow !== 0 && dow !== 6) return null;
                        return (
                          <div key={di} style={{
                            position: "absolute", left: di * ppd, top: 0, width: ppd, height: ROW_H,
                            background: "rgba(255,255,255,.025)", pointerEvents: "none",
                          }} />
                        );
                      })}

                      {/* Today line */}
                      <div style={{
                        position: "absolute", left: todayX + ppd / 2,
                        top: 0, width: 2, height: ROW_H,
                        background: "color-mix(in srgb, var(--gg-primary,#2563eb) 75%, transparent)",
                        pointerEvents: "none", zIndex: 3,
                      }} />

                      {/* Item bar */}
                      {barX !== null && (
                        <Link
                          href={`/crm/sitrep/${item.id}`}
                          title={item.title}
                          style={{
                            position: "absolute",
                            left: barX, top: 5,
                            width: barW, height: ROW_H - 10,
                            background: isDone ? family.shades[1] : family.shades[3],
                            borderRadius: 5,
                            display: "flex", alignItems: "center",
                            paddingLeft: 8, paddingRight: 6,
                            fontSize: isMission ? 12 : 11,
                            fontWeight: isMission ? 800 : 600,
                            color: isDone ? "rgba(255,255,255,.85)" : "#0f172a",
                            textDecoration: "none",
                            overflow: "hidden", whiteSpace: "nowrap",
                            boxShadow: `inset 3px 0 0 0 ${family.shades[2]}, 0 2px 6px rgba(0,0,0,.25)`,
                            opacity: isDone ? 0.55 : isPastDue ? 0.6 : 1,
                            transition: "filter .12s, transform .12s, opacity .15s",
                            zIndex: 2,
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLAnchorElement).style.filter = "brightness(1.12)";
                            (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(-1px)";
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLAnchorElement).style.filter = "";
                            (e.currentTarget as HTMLAnchorElement).style.transform = "";
                          }}
                        >
                          {barW > 36 ? item.title : ""}
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Legend */}
        {filtered.length > 0 && (() => {
          const types = [...new Set(filtered.map((i) => i.item_type))];
          return (
            <div style={{
              display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center",
              padding: "10px 16px", borderRadius: 10,
              background: "rgba(255,255,255,.02)", border: `1px solid ${S.border}`,
            }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.09em", color: S.dim, textTransform: "uppercase" }}>
                Types
              </span>
              {types.map((slug) => {
                const family = getFamilyByKey(typeColors?.[slug] ?? SYSTEM_TYPE_FAMILIES[slug] ?? "blue") ?? COLOR_FAMILIES[0];
                const label = typeDefs?.[slug]?.name ?? slug;
                return (
                  <div key={slug} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{
                      width: 28, height: 12, borderRadius: 3,
                      background: family.shades[3],
                      boxShadow: `inset 3px 0 0 0 ${family.shades[2]}`,
                    }} />
                    <span style={{ fontSize: 11, fontWeight: 500, color: S.dimBright }}>{label}</span>
                  </div>
                );
              })}
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 4 }}>
                <div style={{ width: 2, height: 14, background: "var(--gg-primary,#2563eb)", borderRadius: 1 }} />
                <span style={{ fontSize: 11, color: S.dim }}>Today</span>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
