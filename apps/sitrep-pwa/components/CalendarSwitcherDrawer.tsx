"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { getFamilyByKey } from "@/lib/sitrep-colors";
import type { CalendarTypeData, SharedViewData } from "@/lib/calendar-filter";

// Re-export so consumers can import from one place
export type { CalendarTypeData, SharedViewData };

const S = {
  bg:     "rgb(15 19 28)",
  border: "rgba(255,255,255,.07)",
  text:   "rgb(236 240 245)",
  dim:    "rgb(100 116 139)",
  dimBrt: "rgb(148 163 184)",
} as const;

function IOSToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      style={{
        position: "relative",
        width: 38,
        height: 21,
        borderRadius: 11,
        flexShrink: 0,
        background: on ? "var(--gg-primary,#2563eb)" : "rgba(255,255,255,.12)",
        boxShadow: on
          ? "0 0 8px color-mix(in srgb, var(--gg-primary,#2563eb) 45%, transparent)"
          : "inset 0 1px 3px rgba(0,0,0,.4)",
        transition: "background .2s ease, box-shadow .2s ease",
        border: "none",
        cursor: "pointer",
        padding: 0,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 2,
          left: on ? 19 : 2,
          width: 17,
          height: 17,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 1px 4px rgba(0,0,0,.35)",
          transition: "left .2s ease",
        }}
      />
    </button>
  );
}

interface Props {
  open:           boolean;
  onClose:        () => void;
  calendarTypes:  CalendarTypeData[];
  visibleTypeIds: Set<string>;
  onToggleType:   (id: string) => void;
  onTypesChanged: () => void;
  // Shared views — managed externally so CalendarLayout can filter by them
  sharedViews:    SharedViewData[];
  onSharedViewsLoaded: (views: SharedViewData[]) => void;
}

const TYPE_ICON: Record<string, string> = {
  work: "🏢", family: "🏠", personal: "👤", custom: "📅",
};

export default function CalendarSwitcherDrawer({
  open, onClose, calendarTypes, visibleTypeIds, onToggleType, onTypesChanged,
  sharedViews, onSharedViewsLoaded,
}: Props) {
  const [mounted,   setMounted]   = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [adding,    setAdding]    = useState(false);
  const [newName,   setNewName]   = useState("");
  const [newType,   setNewType]   = useState<"work" | "personal" | "family" | "custom">("custom");
  const [addErr,    setAddErr]    = useState("");
  const [addBusy,   setAddBusy]   = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Fetch shared views once on mount
  useEffect(() => {
    fetch("/api/sitrep/calendar-views/shared")
      .then((r) => r.ok ? r.json() : [])
      .then((data: SharedViewData[]) => {
        if (Array.isArray(data)) onSharedViewsLoaded(data);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleAddType() {
    if (!newName.trim() || addBusy) return;
    setAddBusy(true); setAddErr("");
    const res = await fetch("/api/sitrep/calendar-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), cal_type: newType }),
    });
    setAddBusy(false);
    if (res.ok) {
      setAdding(false); setNewName(""); onTypesChanged();
    } else {
      const e = await res.json().catch(() => ({}));
      setAddErr(e.error ?? "Failed");
    }
  }

  if (!mounted) return null;

  const drawer = (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      pointerEvents: open ? "auto" : "none",
      display: "flex",
    }}>
      {/* Backdrop */}
      <div
        style={{
          position: "absolute", inset: 0, background: "rgba(0,0,0,.6)",
          opacity: open ? 1 : 0,
          transition: "opacity .2s",
        }}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div style={{
        position: "relative", zIndex: 1,
        width: 280, maxWidth: "85vw",
        height: "100%",
        background: S.bg,
        borderRight: `1px solid ${S.border}`,
        display: "flex", flexDirection: "column",
        transform: open ? "translateX(0)" : "translateX(-100%)",
        transition: "transform .22s cubic-bezier(.4,0,.2,1)",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 14px",
          paddingTop: "max(16px, env(safe-area-inset-top))",
          borderBottom: `1px solid ${S.border}`,
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: S.text, letterSpacing: "0.02em" }}>
            My Calendars
          </span>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: S.dim, fontSize: 18, cursor: "pointer", padding: "2px 6px" }}
          >✕</button>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: "auto", paddingBottom: 24 }}>

          {/* ── Own calendar types ── */}
          {calendarTypes.length === 0 && sharedViews.length === 0 && (
            <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 12, color: S.dim, fontStyle: "italic" }}>
              No calendars yet.
            </div>
          )}

          {calendarTypes.map((ct) => {
            const isCollapsed = collapsed.has(ct.id);
            const isVisible   = visibleTypeIds.has(ct.id);
            const dot = getFamilyByKey(ct.color)?.shades[3] ?? "#818cf8";

            return (
              <div key={ct.id}>
                <div
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "11px 14px 9px", cursor: "pointer",
                  }}
                  onClick={() => toggleCollapse(ct.id)}
                >
                  <span style={{ fontSize: 10, color: S.dim, lineHeight: 1, flexShrink: 0 }}>
                    {isCollapsed ? "▶" : "▼"}
                  </span>
                  <span style={{ width: 9, height: 9, borderRadius: "50%", background: dot, flexShrink: 0 }} />
                  <span style={{
                    flex: 1, fontSize: 12, fontWeight: 700, color: S.dimBrt,
                    letterSpacing: "0.05em", textTransform: "uppercase",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {ct.name}
                  </span>
                  <IOSToggle on={isVisible} onToggle={() => onToggleType(ct.id)} />
                </div>

                {!isCollapsed && (ct.user_calendar_views ?? []).length > 0 && (
                  <div style={{ paddingBottom: 4 }}>
                    {[...(ct.user_calendar_views ?? [])]
                      .sort((a, b) => a.sort_order - b.sort_order)
                      .map((view) => {
                        const vDot = view.color
                          ? (getFamilyByKey(view.color)?.shades[3] ?? dot)
                          : dot;
                        return (
                          <div key={view.id} style={{
                            display: "flex", alignItems: "center", gap: 7,
                            padding: "5px 14px 5px 36px",
                          }}>
                            <span style={{ width: 7, height: 7, borderRadius: "50%", background: vDot, flexShrink: 0 }} />
                            <span style={{
                              flex: 1, fontSize: 12, color: S.dim,
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}>
                              {view.name}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                )}

                <div style={{ height: 1, background: S.border, margin: "2px 14px" }} />
              </div>
            );
          })}

          {/* ── Shared with me ── */}
          {sharedViews.length > 0 && (
            <div>
              <div style={{
                padding: "10px 14px 6px",
                fontSize: 10, fontWeight: 700, color: S.dim,
                letterSpacing: "0.07em", textTransform: "uppercase",
              }}>
                Shared with me
              </div>

              {sharedViews.map((sv) => {
                const dot = getFamilyByKey(sv.type_color)?.shades[3] ?? "#818cf8";
                const vDot = sv.view_color
                  ? (getFamilyByKey(sv.view_color)?.shades[3] ?? dot)
                  : dot;
                const isVisible = visibleTypeIds.has(sv.view_id);
                return (
                  <div key={sv.share_id} style={{
                    display: "flex", alignItems: "center", gap: 7,
                    padding: "7px 14px",
                  }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: vDot, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 12, color: S.dimBrt, fontWeight: 500,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {sv.view_name}
                      </div>
                      <div style={{ fontSize: 10, color: S.dim, marginTop: 1 }}>
                        {sv.type_name} · {sv.owner_name}
                      </div>
                    </div>
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3, flexShrink: 0,
                      background: sv.role === "editor" ? "rgba(99,102,241,.15)" : "rgba(255,255,255,.06)",
                      color: sv.role === "editor" ? "#a5b4fc" : S.dim,
                    }}>
                      {sv.role === "editor" ? "ED" : "VW"}
                    </span>
                    <IOSToggle on={isVisible} onToggle={() => onToggleType(sv.view_id)} />
                  </div>
                );
              })}

              <div style={{ height: 1, background: S.border, margin: "6px 14px" }} />
            </div>
          )}

          {/* ── Add calendar ── */}
          <div style={{ padding: "12px 14px" }}>
            {!adding ? (
              <button
                onClick={() => setAdding(true)}
                style={{
                  width: "100%", padding: "8px 0", fontSize: 12, fontWeight: 600,
                  background: "none", border: `1px dashed ${S.border}`,
                  borderRadius: 8, color: S.dim, cursor: "pointer", textAlign: "center",
                }}
              >+ Add Calendar</button>
            ) : (
              <div style={{ display: "grid", gap: 7 }}>
                <input
                  autoFocus
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddType();
                    if (e.key === "Escape") { setAdding(false); setNewName(""); }
                  }}
                  placeholder="Calendar name…"
                  style={{
                    padding: "8px 10px", borderRadius: 7,
                    background: "rgb(10 13 20)", border: `1px solid ${S.border}`,
                    color: S.text, fontSize: 13, outline: "none",
                  }}
                />
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as typeof newType)}
                  style={{
                    padding: "6px 9px", borderRadius: 7,
                    background: "rgb(10 13 20)", border: `1px solid ${S.border}`,
                    color: S.dim, fontSize: 12,
                  }}
                >
                  {(["work", "family", "personal", "custom"] as const).map((t) => (
                    <option key={t} value={t}>
                      {TYPE_ICON[t]} {t.charAt(0).toUpperCase() + t.slice(1)}
                    </option>
                  ))}
                </select>
                {addErr && <p style={{ margin: 0, fontSize: 11, color: "#fca5a5" }}>{addErr}</p>}
                <div style={{ display: "flex", gap: 5 }}>
                  <button
                    onClick={handleAddType}
                    disabled={!newName.trim() || addBusy}
                    style={{
                      flex: 1, padding: "7px 0", borderRadius: 7, fontSize: 12, fontWeight: 700,
                      border: "none", background: "var(--gg-primary,#2563eb)", color: "#fff",
                      cursor: !newName.trim() || addBusy ? "not-allowed" : "pointer",
                      opacity: !newName.trim() || addBusy ? 0.6 : 1,
                    }}
                  >{addBusy ? "…" : "Add"}</button>
                  <button
                    onClick={() => { setAdding(false); setNewName(""); setAddErr(""); }}
                    style={{
                      padding: "7px 12px", borderRadius: 7, fontSize: 12,
                      border: `1px solid ${S.border}`, background: "none",
                      color: S.dim, cursor: "pointer",
                    }}
                  >Cancel</button>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );

  return createPortal(drawer, document.body);
}
