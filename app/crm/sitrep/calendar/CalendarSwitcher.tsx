"use client";

import { useState } from "react";
import { getFamilyByKey } from "@/lib/sitrep-colors";

const S = {
  bg:      "rgb(15 19 28)",
  border:  "rgba(255,255,255,.07)",
  text:    "rgb(236 240 245)",
  dim:     "rgb(100 116 139)",
  dimBrt:  "rgb(148 163 184)",
  card:    "rgb(22 28 40)",
} as const;

export type CalendarView = {
  id:            string;
  name:          string;
  color:         string | null;
  filter_config: Record<string, unknown>;
  is_default:    boolean;
  sort_order:    number;
};

export type CalendarTypeData = {
  id:         string;
  name:       string;
  color:      string;
  cal_type:   "work" | "family" | "personal" | "custom";
  sources:    { type: string; tenant_id?: string }[];
  user_calendar_views: CalendarView[];
};

// Eye toggle button
function EyeToggle({ visible, onToggle }: { visible: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      title={visible ? "Hide" : "Show"}
      style={{
        background: "none", border: "none", cursor: "pointer",
        padding: "3px 5px", borderRadius: 5, color: visible ? S.dimBrt : S.dim,
        fontSize: 14, lineHeight: 1, flexShrink: 0,
        opacity: visible ? 1 : 0.4,
      }}
    >
      {visible ? "◉" : "○"}
    </button>
  );
}

// Invite share slide-in
function SharePanel({ view, onClose }: { view: CalendarView; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole]   = useState<"viewer" | "editor">("viewer");
  const [sending, setSending] = useState(false);
  const [sent, setSent]   = useState(false);
  const [err, setErr]     = useState("");

  async function handleInvite() {
    if (!email.trim()) return;
    setSending(true); setErr("");
    const res = await fetch(`/api/user/calendar-views/${view.id}/shares`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), role }),
    });
    setSending(false);
    if (res.ok) { setSent(true); setEmail(""); }
    else { const e = await res.json().catch(() => ({})); setErr(e.error ?? "Failed"); }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 70, display: "flex", justifyContent: "flex-end",
    }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.5)" }} onClick={onClose} />
      <div style={{
        position: "relative", zIndex: 1, width: 360, maxWidth: "100vw",
        background: S.card, borderLeft: `1px solid ${S.border}`,
        padding: 24, display: "flex", flexDirection: "column", gap: 16,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: S.text }}>Share "{view.name}"</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: S.dim, fontSize: 18, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <label style={{ fontSize: 12, color: S.dim, fontWeight: 600 }}>Invite by email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleInvite(); }}
            placeholder="colleague@example.com"
            style={{
              padding: "9px 12px", borderRadius: 9, background: S.bg,
              border: `1px solid ${S.border}`, color: S.text, fontSize: 13,
            }}
          />
          <div style={{ display: "flex", gap: 6 }}>
            {(["viewer", "editor"] as const).map((r) => (
              <button key={r} type="button" onClick={() => setRole(r)} style={{
                flex: 1, padding: "7px 0", borderRadius: 8, fontSize: 12, fontWeight: 600,
                border: `1px solid ${S.border}`, cursor: "pointer",
                background: role === r ? "rgba(99,102,241,.2)" : "rgba(255,255,255,.04)",
                borderColor: role === r ? "rgba(99,102,241,.5)" : S.border,
                color: role === r ? "#a5b4fc" : S.dim,
              }}>
                {r.charAt(0).toUpperCase() + r.slice(1)}
              </button>
            ))}
          </div>
          {err  && <p style={{ margin: 0, fontSize: 12, color: "#fca5a5" }}>{err}</p>}
          {sent && <p style={{ margin: 0, fontSize: 12, color: "#4ade80" }}>Invite sent ✓</p>}
          <button
            onClick={handleInvite}
            disabled={sending || !email.trim()}
            className="btn"
            style={{ padding: "8px 0", fontSize: 13, borderRadius: 8 }}
          >
            {sending ? "Sending…" : "Send Invite"}
          </button>
        </div>

        <p style={{ margin: 0, fontSize: 11, color: S.dim, lineHeight: 1.5 }}>
          <strong style={{ color: S.dimBrt }}>Viewer</strong> — can see events you can see.<br/>
          <strong style={{ color: S.dimBrt }}>Editor</strong> — can also add events and assign you.
        </p>
      </div>
    </div>
  );
}

// ── Main CalendarSwitcher ──────────────────────────────────────────────────────

export default function CalendarSwitcher({
  calendarTypes,
  visibleTypeIds,
  onToggleType,
  onTypesChanged,
}: {
  calendarTypes:  CalendarTypeData[];
  visibleTypeIds: Set<string>;
  onToggleType:   (typeId: string) => void;
  onTypesChanged: () => void;
}) {
  const [collapsed, setCollapsed]   = useState<Set<string>>(new Set());
  const [sharingView, setSharingView] = useState<CalendarView | null>(null);
  const [adding, setAdding]         = useState(false);
  const [newName, setNewName]       = useState("");
  const [newType, setNewType]       = useState<"work" | "personal" | "family" | "custom">("custom");
  const [newColor, setNewColor]     = useState("blue");
  const [addErr, setAddErr]         = useState("");
  const [addBusy, setAddBusy]       = useState(false);

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
    const res = await fetch("/api/user/calendar-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), color: newColor, cal_type: newType }),
    });
    setAddBusy(false);
    if (res.ok) { setAdding(false); setNewName(""); onTypesChanged(); }
    else { const e = await res.json().catch(() => ({})); setAddErr(e.error ?? "Failed"); }
  }

  async function handleDeleteType(typeId: string, typeName: string) {
    if (!confirm(`Remove "${typeName}" from your calendars?`)) return;
    const res = await fetch(`/api/user/calendar-types/${typeId}`, { method: "DELETE" });
    if (res.ok) onTypesChanged();
  }

  const TYPE_ICON: Record<string, string> = {
    work: "🏢", family: "🏠", personal: "👤", custom: "📅",
  };

  return (
    <div style={{
      width: 220, flexShrink: 0, borderRight: `1px solid ${S.border}`,
      display: "flex", flexDirection: "column", gap: 0, overflowY: "auto",
      paddingBottom: 24,
    }}>
      {calendarTypes.map((ct) => {
        const isCollapsed = collapsed.has(ct.id);
        const isVisible   = visibleTypeIds.has(ct.id);
        const dot = getFamilyByKey(ct.color)?.shades[3] ?? "#818cf8";

        return (
          <div key={ct.id}>
            {/* Type header */}
            <div style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "10px 14px 8px", cursor: "pointer",
            }}
              onClick={() => toggleCollapse(ct.id)}
            >
              <span style={{ fontSize: 12, color: S.dim, lineHeight: 1, flexShrink: 0 }}>
                {isCollapsed ? "▶" : "▼"}
              </span>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: dot, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: S.dimBrt, letterSpacing: "0.04em", textTransform: "uppercase", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {ct.name}
              </span>
              <EyeToggle visible={isVisible} onToggle={() => onToggleType(ct.id)} />
            </div>

            {/* Views list */}
            {!isCollapsed && (
              <div style={{ paddingBottom: 4 }}>
                {(ct.user_calendar_views ?? [])
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((view) => {
                    const viewDot = view.color
                      ? getFamilyByKey(view.color)?.shades[3] ?? dot
                      : dot;
                    return (
                      <div key={view.id} style={{
                        display: "flex", alignItems: "center", gap: 7,
                        padding: "5px 14px 5px 30px",
                      }}>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: viewDot, flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: 12, color: S.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {view.name}
                        </span>
                        <button
                          title="Share this view"
                          onClick={(e) => { e.stopPropagation(); setSharingView(view); }}
                          style={{ background: "none", border: "none", cursor: "pointer", color: S.dim, fontSize: 12, padding: "2px 4px", lineHeight: 1, opacity: 0.6, flexShrink: 0 }}
                        >↗</button>
                      </div>
                    );
                  })
                }
                <button
                  onClick={() => handleDeleteType(ct.id, ct.name)}
                  style={{
                    display: "none", // hidden for now — accessible via type context menu
                  }}
                />
              </div>
            )}

            <div style={{ height: 1, background: S.border, margin: "2px 14px" }} />
          </div>
        );
      })}

      {/* Add calendar type */}
      <div style={{ padding: "10px 14px" }}>
        {!adding ? (
          <button
            onClick={() => setAdding(true)}
            style={{
              width: "100%", padding: "6px 0", fontSize: 12, fontWeight: 600,
              background: "none", border: `1px dashed ${S.border}`, borderRadius: 8,
              color: S.dim, cursor: "pointer", textAlign: "center",
            }}
          >+ Add Calendar</button>
        ) : (
          <div style={{ display: "grid", gap: 7 }}>
            <input
              autoFocus
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAddType(); if (e.key === "Escape") setAdding(false); }}
              placeholder="Calendar name…"
              style={{ padding: "6px 9px", borderRadius: 7, background: S.bg, border: `1px solid ${S.border}`, color: S.text, fontSize: 12 }}
            />
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as any)}
              style={{ padding: "5px 8px", borderRadius: 7, background: S.bg, border: `1px solid ${S.border}`, color: S.dim, fontSize: 11 }}
            >
              {(["work","family","personal","custom"] as const).map((t) => (
                <option key={t} value={t}>{TYPE_ICON[t]} {t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
            {addErr && <p style={{ margin: 0, fontSize: 11, color: "#fca5a5" }}>{addErr}</p>}
            <div style={{ display: "flex", gap: 5 }}>
              <button onClick={handleAddType} disabled={!newName.trim() || addBusy} style={{ flex: 1, padding: "5px 0", borderRadius: 7, fontSize: 11, fontWeight: 700, border: "none", background: "var(--gg-primary,#2563eb)", color: "#fff", cursor: "pointer" }}>
                {addBusy ? "…" : "Add"}
              </button>
              <button onClick={() => { setAdding(false); setNewName(""); setAddErr(""); }} style={{ padding: "5px 10px", borderRadius: 7, fontSize: 11, border: `1px solid ${S.border}`, background: "none", color: S.dim, cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {sharingView && (
        <SharePanel view={sharingView} onClose={() => setSharingView(null)} />
      )}
    </div>
  );
}
