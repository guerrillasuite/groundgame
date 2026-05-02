"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ColorFamilyPicker } from "@/app/components/ColorFamilyPicker";
import { getFamilyByKey } from "@/lib/sitrep-colors";

// ── Types ─────────────────────────────────────────────────────────────────────

type Stage = {
  slug: string;
  name: string;
  color: string;
  is_terminal: boolean;
  sort_order: number;
};

type CustomRole = {
  slug: string;
  name: string;
  max: number;
};

type ItemType = {
  id: string;
  name: string;
  slug: string;
  color: string;
  is_system: boolean;
  is_public: boolean;
  sort_order: number;
  stages: Stage[];
  is_mission_type: boolean;
  show_in_kanban: boolean;
  booking_enabled: boolean;
  custom_roles: CustomRole[];
};

type WidgetSettings = {
  show_types:            string[];
  sort_by:               "due_date" | "start_at" | "priority" | "created_at";
  sort_dir:              "asc" | "desc";
  group_by:              "none" | "type" | "status" | "priority";
  max_items:             number;
  widget_view:           "list" | "calendar";
  calendar_default_view: "day" | "week" | "month";
};

const DEFAULT_WIDGET: WidgetSettings = {
  show_types:            [],
  sort_by:               "due_date",
  sort_dir:              "asc",
  group_by:              "none",
  max_items:             10,
  widget_view:           "list",
  calendar_default_view: "week",
};

type BookingType = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  duration_minutes: number;
  buffer_before: number;
  buffer_after: number;
  available_days: number[];
  available_start: string;
  available_end: string;
  timezone: string;
  sitrep_item_type: string;
  confirmation_msg: string | null;
  is_active: boolean;
};

type PublicCalendar = {
  id: string;
  name: string;
  token: string;
  include_type_slugs: string[];
  include_statuses: string[];
  show_day: boolean;
  show_week: boolean;
  show_month: boolean;
  default_view: "day" | "week" | "month";
};

type CalFilterConfig = {
  assignee_filter?:    "me" | "all";
  show_viewer_items?:  boolean;
  item_type_slugs?:   string[];
  stage_slugs?:        string[];
  show_terminal?:      boolean;
  location_city?:      string;
  location_state?:     string;
};

type MyCalView = {
  id:            string;
  name:          string;
  color:         string | null;
  filter_config: CalFilterConfig;
  is_default:    boolean;
  sort_order:    number;
};

type MyCal = {
  id:                  string;
  name:                string;
  color:               string;
  cal_type:            string;
  sources:             { type: string; tenant_id?: string }[];
  user_calendar_views: MyCalView[];
};

type SharedView = {
  share_id:      string;
  role:          "viewer" | "editor";
  view_id:       string;
  view_name:     string;
  view_color:    string | null;
  type_name:     string;
  type_color:    string;
  owner_name:    string;
};

type CalInvite = {
  id:     string;
  email:  string;
  role:   "viewer" | "editor";
  status: "pending" | "accepted" | "declined";
};

type PendingCalInvite = {
  id:         string;
  token:      string;
  role:       "viewer" | "editor";
  view_name:  string;
  view_color: string;
  type_name:  string;
  owner_name: string;
};

// ── Style constants ───────────────────────────────────────────────────────────

const S = {
  surface: "rgb(18 23 33)",
  card:    "rgb(28 36 48)",
  bg:      "rgb(10 13 20)",
  border:  "rgb(43 53 67)",
  text:    "rgb(238 242 246)",
  dim:     "rgb(160 174 192)",
  dimBrt:  "rgb(203 213 225)",
} as const;

const ALL_STATUSES = [
  { key: "open",      label: "Open" },
  { key: "confirmed", label: "Confirmed" },
  { key: "done",      label: "Done" },
];

const ALL_VIEWS = [
  { key: "show_day",   label: "Day" },
  { key: "show_week",  label: "Week" },
  { key: "show_month", label: "Month" },
];

const COLOR_FAMILIES = ["blue", "violet", "teal", "amber", "green", "red", "orange", "pink", "cyan", "indigo", "slate", "emerald"];

// ── OS-style pill toggle ──────────────────────────────────────────────────────

function OsPill({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      style={{
        position: "relative",
        width: 38,
        height: 21,
        borderRadius: 999,
        border: "none",
        cursor: "pointer",
        flexShrink: 0,
        padding: 0,
        background: value
          ? "var(--gg-primary, rgb(99 102 241))"
          : "rgba(255,255,255,.12)",
        boxShadow: value ? "0 0 8px rgba(99,102,241,.5)" : "none",
        transition: "background .15s, box-shadow .15s",
      }}
    >
      <span style={{
        position: "absolute",
        top: 2.5,
        left: value ? 19 : 2.5,
        width: 16,
        height: 16,
        borderRadius: "50%",
        background: "#fff",
        transition: "left .15s",
      }} />
    </button>
  );
}

// ── Stage row (inside type editor) ───────────────────────────────────────────

function StageRow({
  stage,
  isSystem,
  onChange,
  onDelete,
  dragHandleProps,
}: {
  stage: Stage;
  isSystem: boolean;
  onChange: (s: Stage) => void;
  onDelete: () => void;
  dragHandleProps?: React.HTMLAttributes<HTMLSpanElement>;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      background: "rgba(255,255,255,.03)", borderRadius: 8,
      padding: "7px 10px", border: `1px solid ${S.border}`,
    }}>
      <span
        {...dragHandleProps}
        style={{ cursor: "grab", color: S.dim, fontSize: 14, userSelect: "none", flexShrink: 0 }}
      >⠿</span>
      <input
        type="text"
        value={stage.name}
        onChange={(e) => onChange({ ...stage, name: e.target.value })}
        style={{
          flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none",
          color: S.text, fontSize: 13,
        }}
      />
      <select
        value={stage.color}
        onChange={(e) => onChange({ ...stage, color: e.target.value })}
        style={{
          background: S.surface, border: `1px solid ${S.border}`, color: S.dim,
          fontSize: 11, borderRadius: 6, padding: "2px 6px", flexShrink: 0,
        }}
      >
        {COLOR_FAMILIES.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
      <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: S.dim, flexShrink: 0, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={stage.is_terminal}
          onChange={(e) => onChange({ ...stage, is_terminal: e.target.checked })}
          style={{ accentColor: "rgba(99,102,241,.8)" }}
        />
        terminal
      </label>
      {!isSystem && (
        <button
          type="button"
          onClick={onDelete}
          style={{
            padding: "2px 8px", fontSize: 11, borderRadius: 5,
            border: "1px solid rgba(220,38,38,.3)", background: "rgba(220,38,38,.07)",
            color: "#fca5a5", cursor: "pointer", flexShrink: 0,
          }}
        >✕</button>
      )}
    </div>
  );
}

// ── Type editor slide-in ──────────────────────────────────────────────────────

function TypeEditorPanel({
  type: initialType,
  onClose,
  onSaved,
}: {
  type: ItemType;
  onClose: () => void;
  onSaved: (updated: ItemType) => void;
}) {
  const [t, setT] = useState<ItemType>({ ...initialType, stages: [...(initialType.stages ?? [])] });
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [err, setErr] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");

  function updateStage(idx: number, updated: Stage) {
    setT((prev) => {
      const stages = [...prev.stages];
      stages[idx] = updated;
      return { ...prev, stages };
    });
  }

  function deleteStage(idx: number) {
    setT((prev) => ({ ...prev, stages: prev.stages.filter((_, i) => i !== idx) }));
  }

  function addStage() {
    const newStage: Stage = {
      slug: `stage_${Date.now()}`,
      name: "New Stage",
      color: t.color,
      is_terminal: false,
      sort_order: t.stages.length,
    };
    setT((prev) => ({ ...prev, stages: [...prev.stages, newStage] }));
  }

  function addRole() {
    const name = newRoleName.trim();
    if (!name) return;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    setT((prev) => ({
      ...prev,
      custom_roles: [...(prev.custom_roles ?? []), { slug, name, max: 1 }],
    }));
    setNewRoleName("");
  }

  function updateRoleMax(idx: number, max: number) {
    setT((prev) => {
      const roles = [...(prev.custom_roles ?? [])];
      roles[idx] = { ...roles[idx], max };
      return { ...prev, custom_roles: roles };
    });
  }

  function deleteRole(idx: number) {
    setT((prev) => ({ ...prev, custom_roles: (prev.custom_roles ?? []).filter((_, i) => i !== idx) }));
  }

  async function handleSave() {
    setSaving(true); setErr("");
    const res = await fetch(`/api/crm/sitrep/types/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name:            t.name,
        color:           t.color,
        is_public:       t.is_public,
        is_mission_type: t.is_mission_type,
        show_in_kanban:  t.show_in_kanban,
        booking_enabled: t.booking_enabled,
        stages:          t.stages.map((s, i) => ({ ...s, sort_order: i })),
        custom_roles:    t.custom_roles ?? [],
      }),
    });
    setSaving(false);
    if (res.ok) {
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2000);
      onSaved(t);
    } else {
      const e = await res.json().catch(() => ({}));
      setErr(e.error ?? "Save failed.");
    }
  }

  const ROW: React.CSSProperties = {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    gap: 12, padding: "10px 0",
  };
  const LABEL: React.CSSProperties = { fontSize: 13, fontWeight: 500, color: S.text };
  const SUB: React.CSSProperties = { fontSize: 11, color: S.dim, marginTop: 1 };

  const panel = (
    <div style={{
      position: "fixed", inset: 0, zIndex: 60,
      display: "flex", justifyContent: "flex-end",
    }}>
      {/* Backdrop */}
      <div
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.5)" }}
        onClick={onClose}
      />
      {/* Panel */}
      <div style={{
        position: "relative", zIndex: 1,
        width: 480, maxWidth: "100vw",
        background: S.card, borderLeft: `1px solid ${S.border}`,
        display: "flex", flexDirection: "column",
        overflowY: "auto",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "18px 20px 14px", borderBottom: `1px solid ${S.border}`,
          position: "sticky", top: 0, background: S.card, zIndex: 2,
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: S.text }}>{t.name}</div>
            <div style={{ fontSize: 11, color: S.dim }}>
              {t.is_system ? "System type" : "Custom type"}
            </div>
          </div>
          <button type="button" onClick={onClose} style={{
            background: "none", border: "none", color: S.dim, fontSize: 18,
            cursor: "pointer", padding: "4px 8px",
          }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px", flex: 1, display: "grid", gap: 0 }}>

          {/* Name */}
          <div style={{ paddingBottom: 16, borderBottom: `1px solid ${S.border}` }}>
            <label style={{ ...LABEL, display: "block", marginBottom: 6 }}>Name</label>
            <input
              type="text"
              value={t.name}
              onChange={(e) => setT((prev) => ({ ...prev, name: e.target.value }))}
              disabled={t.is_system}
              style={{
                width: "100%", padding: "8px 11px", borderRadius: 8,
                background: S.surface, border: `1px solid ${S.border}`,
                color: t.is_system ? S.dim : S.text, fontSize: 14,
                opacity: t.is_system ? 0.6 : 1, boxSizing: "border-box",
              }}
            />
          </div>

          {/* Color */}
          <div style={{ ...ROW, borderBottom: `1px solid ${S.border}` }}>
            <div>
              <div style={LABEL}>Color</div>
            </div>
            <ColorFamilyPicker value={t.color} onChange={(c) => setT((prev) => ({ ...prev, color: c }))} size={28} />
          </div>

          {/* Make Public */}
          <div style={{ ...ROW, borderBottom: `1px solid ${S.border}` }}>
            <div>
              <div style={LABEL}>Make Public</div>
              <div style={SUB}>Enable in embeddable calendars</div>
            </div>
            <OsPill value={t.is_public} onChange={(v) => setT((prev) => ({ ...prev, is_public: v }))} />
          </div>

          {/* Mission Type */}
          <div style={{ ...ROW, borderBottom: `1px solid ${S.border}` }}>
            <div>
              <div style={LABEL}>Mission Type</div>
              <div style={SUB}>Allow sub-items and progress tracking</div>
            </div>
            <OsPill value={t.is_mission_type} onChange={(v) => setT((prev) => ({ ...prev, is_mission_type: v }))} />
          </div>

          {/* Show in Kanban */}
          <div style={{ ...ROW, borderBottom: `1px solid ${S.border}` }}>
            <div>
              <div style={LABEL}>Show in Kanban</div>
              <div style={SUB}>Appear as a row in Kanban view</div>
            </div>
            <OsPill value={t.show_in_kanban} onChange={(v) => setT((prev) => ({ ...prev, show_in_kanban: v }))} />
          </div>

          {/* Booking */}
          <div style={{ ...ROW, borderBottom: `1px solid ${S.border}` }}>
            <div>
              <div style={LABEL}>Enable Booking</div>
              <div style={SUB}>Allow public booking pages for this type</div>
            </div>
            <OsPill value={t.booking_enabled} onChange={(v) => setT((prev) => ({ ...prev, booking_enabled: v }))} />
          </div>

          {/* Stages */}
          <div style={{ paddingTop: 18, paddingBottom: 18, borderBottom: `1px solid ${S.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div>
                <div style={LABEL}>Stages</div>
                <div style={SUB}>Pipeline stages for Kanban columns</div>
              </div>
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              {(t.stages ?? []).map((stage, idx) => (
                <StageRow
                  key={stage.slug + idx}
                  stage={stage}
                  isSystem={false}
                  onChange={(updated) => updateStage(idx, updated)}
                  onDelete={() => deleteStage(idx)}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={addStage}
              style={{
                marginTop: 8, padding: "5px 14px", fontSize: 12, borderRadius: 7,
                border: `1px dashed ${S.border}`, background: "rgba(255,255,255,.03)",
                color: S.dim, cursor: "pointer", width: "100%",
              }}
            >+ Add Stage</button>
          </div>

          {/* Advanced Settings (custom roles) */}
          <div style={{ paddingTop: 14 }}>
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: S.dim, fontSize: 12, fontWeight: 600, padding: 0,
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              <span style={{ transition: "transform .15s", display: "inline-block", transform: showAdvanced ? "rotate(90deg)" : "none" }}>▶</span>
              Advanced Settings
            </button>

            {showAdvanced && (
              <div style={{ marginTop: 14 }}>
                <div style={LABEL}>Custom Roles</div>
                <div style={{ ...SUB, marginBottom: 10 }}>Define named assignee roles per item</div>
                <div style={{ display: "grid", gap: 6, marginBottom: 8 }}>
                  {(t.custom_roles ?? []).map((role, idx) => (
                    <div key={role.slug + idx} style={{
                      display: "flex", alignItems: "center", gap: 8,
                      background: "rgba(255,255,255,.03)", borderRadius: 8,
                      padding: "7px 10px", border: `1px solid ${S.border}`,
                    }}>
                      <span style={{ flex: 1, fontSize: 13, color: S.text }}>{role.name}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                        <span style={{ fontSize: 11, color: S.dim }}>max</span>
                        <input
                          type="number"
                          min={1}
                          max={99}
                          value={role.max}
                          onChange={(e) => updateRoleMax(idx, parseInt(e.target.value) || 1)}
                          style={{
                            width: 40, padding: "2px 6px", borderRadius: 6,
                            background: S.surface, border: `1px solid ${S.border}`,
                            color: S.text, fontSize: 12, textAlign: "center",
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => deleteRole(idx)}
                        style={{
                          padding: "2px 8px", fontSize: 11, borderRadius: 5,
                          border: "1px solid rgba(220,38,38,.3)", background: "rgba(220,38,38,.07)",
                          color: "#fca5a5", cursor: "pointer", flexShrink: 0,
                        }}
                      >✕</button>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    type="text"
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") addRole(); }}
                    placeholder="Role name…"
                    style={{
                      flex: 1, padding: "6px 10px", borderRadius: 7,
                      background: S.surface, border: `1px solid ${S.border}`,
                      color: S.text, fontSize: 13,
                    }}
                  />
                  <button
                    type="button"
                    onClick={addRole}
                    disabled={!newRoleName.trim()}
                    style={{
                      padding: "6px 14px", fontSize: 12, borderRadius: 7,
                      border: `1px solid ${S.border}`, background: "rgba(255,255,255,.06)",
                      color: S.text, cursor: "pointer",
                    }}
                  >Add</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: "14px 20px", borderTop: `1px solid ${S.border}`,
          display: "flex", alignItems: "center", gap: 12,
          background: S.card,
          position: "sticky", bottom: 0,
        }}>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="btn"
            style={{ padding: "8px 22px", fontSize: 13, borderRadius: 8 }}
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
          {savedOk && <span style={{ fontSize: 12, color: "#4ade80", fontWeight: 600 }}>Saved ✓</span>}
          {err && <span style={{ fontSize: 12, color: "#fca5a5" }}>{err}</span>}
        </div>
      </div>
    </div>
  );
  return typeof window !== "undefined" ? createPortal(panel, document.body) : null;
}

// ── Booking page editor ────────────────────────────────────────────────────────

const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const DURATION_PRESETS = [15, 30, 45, 60, 90, 120];
const TIMEZONES = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Phoenix", "America/Anchorage", "Pacific/Honolulu",
  "Europe/London", "Europe/Paris", "Europe/Berlin", "Asia/Tokyo",
  "Australia/Sydney",
];

function BookingPagePanel({
  initial,
  types,
  onClose,
  onSaved,
}: {
  initial: BookingType | null;
  types: ItemType[];
  onClose: () => void;
  onSaved: (bt: BookingType) => void;
}) {
  const blank: BookingType = {
    id: "", title: "", slug: "", description: null, duration_minutes: 30,
    buffer_before: 0, buffer_after: 0, available_days: [1,2,3,4,5],
    available_start: "09:00", available_end: "17:00",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
    sitrep_item_type: "meeting", confirmation_msg: null, is_active: true,
  };
  const [bt, setBt] = useState<BookingType>(initial ?? blank);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [err, setErr] = useState("");
  const [customDuration, setCustomDuration] = useState(!DURATION_PRESETS.includes(bt.duration_minutes));

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const publicUrl = bt.slug ? `${origin}/book/${bt.slug}` : "";

  function toggleDay(d: number) {
    setBt((prev) => ({
      ...prev,
      available_days: prev.available_days.includes(d)
        ? prev.available_days.filter((x) => x !== d)
        : [...prev.available_days, d].sort(),
    }));
  }

  async function handleSave() {
    if (!bt.title.trim()) { setErr("Title is required."); return; }
    setSaving(true); setErr("");
    const method = bt.id ? "PATCH" : "POST";
    const url    = bt.id ? `/api/crm/sitrep/booking-types/${bt.id}` : "/api/crm/sitrep/booking-types";
    const res    = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title:            bt.title.trim(),
        description:      bt.description?.trim() || null,
        duration_minutes: bt.duration_minutes,
        buffer_before:    bt.buffer_before,
        buffer_after:     bt.buffer_after,
        available_days:   bt.available_days,
        available_start:  bt.available_start,
        available_end:    bt.available_end,
        timezone:         bt.timezone,
        sitrep_item_type: bt.sitrep_item_type,
        confirmation_msg: bt.confirmation_msg?.trim() || null,
        is_active:        bt.is_active,
      }),
    });
    setSaving(false);
    if (res.ok) {
      const saved = await res.json();
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2000);
      onSaved({ ...bt, ...saved });
    } else {
      const e = await res.json().catch(() => ({}));
      setErr(e.error ?? "Save failed.");
    }
  }

  const ROW: React.CSSProperties = {
    display: "flex", alignItems: "flex-start", justifyContent: "space-between",
    gap: 12, padding: "12px 0", borderBottom: `1px solid ${S.border}`,
  };
  const LABEL: React.CSSProperties = { fontSize: 13, fontWeight: 500, color: S.text };
  const SUB:   React.CSSProperties = { fontSize: 11, color: S.dim, marginTop: 2 };
  const INPUT: React.CSSProperties = {
    width: "100%", padding: "8px 11px", borderRadius: 8, boxSizing: "border-box",
    background: S.surface, border: `1px solid ${S.border}`, color: S.text, fontSize: 13,
  };

  const panel = (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", justifyContent: "flex-end" }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.5)" }} onClick={onClose} />
      <div style={{
        position: "relative", zIndex: 1, width: 520, maxWidth: "100vw",
        background: S.card, borderLeft: `1px solid ${S.border}`,
        display: "flex", flexDirection: "column", overflowY: "auto",
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "18px 20px 14px", borderBottom: `1px solid ${S.border}`,
          position: "sticky", top: 0, background: S.card, zIndex: 2,
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: S.text }}>
              {bt.id ? "Edit Booking Page" : "New Booking Page"}
            </div>
            {publicUrl && (
              <a href={publicUrl} target="_blank" rel="noopener" style={{ fontSize: 11, color: "#60a5fa", textDecoration: "none" }}>
                {publicUrl}
              </a>
            )}
          </div>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: S.dim, fontSize: 18, cursor: "pointer", padding: "4px 8px" }}>✕</button>
        </div>

        <div style={{ padding: "20px", flex: 1, display: "grid", gap: 0 }}>

          <div style={{ paddingBottom: 14, borderBottom: `1px solid ${S.border}` }}>
            <label style={{ ...LABEL, display: "block", marginBottom: 6 }}>Title *</label>
            <input type="text" value={bt.title} onChange={(e) => setBt((p) => ({ ...p, title: e.target.value }))} style={INPUT} placeholder="e.g. 30-Minute Intro Call" />
          </div>

          <div style={{ paddingTop: 12, paddingBottom: 14, borderBottom: `1px solid ${S.border}` }}>
            <label style={{ ...LABEL, display: "block", marginBottom: 6 }}>Description</label>
            <textarea rows={2} value={bt.description ?? ""} onChange={(e) => setBt((p) => ({ ...p, description: e.target.value || null }))} style={{ ...INPUT, resize: "vertical" }} placeholder="Optional description shown on the booking page…" />
          </div>

          {/* Duration */}
          <div style={{ ...ROW }}>
            <div>
              <div style={LABEL}>Duration</div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {DURATION_PRESETS.map((d) => (
                <button key={d} type="button" onClick={() => { setBt((p) => ({ ...p, duration_minutes: d })); setCustomDuration(false); }} style={{
                  padding: "5px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                  border: `1px solid ${S.border}`, cursor: "pointer",
                  background: !customDuration && bt.duration_minutes === d ? "rgba(99,102,241,.2)" : "rgba(255,255,255,.05)",
                  borderColor: !customDuration && bt.duration_minutes === d ? "rgba(99,102,241,.5)" : S.border,
                  color: !customDuration && bt.duration_minutes === d ? "#a5b4fc" : S.dim,
                }}>{d < 60 ? `${d}m` : `${d/60}h`}</button>
              ))}
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input type="number" min={5} max={480} value={customDuration ? bt.duration_minutes : ""} placeholder="custom" onChange={(e) => { const v = parseInt(e.target.value); if (v > 0) { setBt((p) => ({ ...p, duration_minutes: v })); setCustomDuration(true); } }} style={{ width: 72, padding: "5px 8px", borderRadius: 8, background: S.surface, border: `1px solid ${S.border}`, color: S.text, fontSize: 12, textAlign: "center" }} />
                <span style={{ fontSize: 11, color: S.dim }}>min</span>
              </div>
            </div>
          </div>

          {/* Available days */}
          <div style={{ ...ROW }}>
            <div>
              <div style={LABEL}>Available Days</div>
            </div>
            <div style={{ display: "flex", gap: 5 }}>
              {DAY_LABELS.map((label, i) => (
                <button key={i} type="button" onClick={() => toggleDay(i)} style={{
                  width: 32, height: 32, borderRadius: 8, fontSize: 11, fontWeight: 700,
                  border: `1px solid ${S.border}`, cursor: "pointer",
                  background: bt.available_days.includes(i) ? "rgba(99,102,241,.2)" : "rgba(255,255,255,.05)",
                  borderColor: bt.available_days.includes(i) ? "rgba(99,102,241,.5)" : S.border,
                  color: bt.available_days.includes(i) ? "#a5b4fc" : S.dim,
                }}>{label}</button>
              ))}
            </div>
          </div>

          {/* Time range */}
          <div style={{ ...ROW }}>
            <div>
              <div style={LABEL}>Hours</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="time" value={bt.available_start} onChange={(e) => setBt((p) => ({ ...p, available_start: e.target.value }))} style={{ padding: "5px 8px", borderRadius: 8, background: S.surface, border: `1px solid ${S.border}`, color: S.text, fontSize: 12 }} />
              <span style={{ fontSize: 12, color: S.dim }}>to</span>
              <input type="time" value={bt.available_end} onChange={(e) => setBt((p) => ({ ...p, available_end: e.target.value }))} style={{ padding: "5px 8px", borderRadius: 8, background: S.surface, border: `1px solid ${S.border}`, color: S.text, fontSize: 12 }} />
            </div>
          </div>

          {/* Timezone */}
          <div style={{ ...ROW }}>
            <div>
              <div style={LABEL}>Timezone</div>
            </div>
            <select value={bt.timezone} onChange={(e) => setBt((p) => ({ ...p, timezone: e.target.value }))} style={{ padding: "6px 10px", borderRadius: 8, background: S.surface, border: `1px solid ${S.border}`, color: S.text, fontSize: 12 }}>
              {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </div>

          {/* Buffer */}
          <div style={{ ...ROW }}>
            <div>
              <div style={LABEL}>Buffer</div>
              <div style={SUB}>Padding before/after each booking</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="number" min={0} max={60} value={bt.buffer_before} onChange={(e) => setBt((p) => ({ ...p, buffer_before: parseInt(e.target.value) || 0 }))} style={{ width: 48, padding: "5px 8px", borderRadius: 8, background: S.surface, border: `1px solid ${S.border}`, color: S.text, fontSize: 12, textAlign: "center" }} />
              <span style={{ fontSize: 11, color: S.dim }}>min before /</span>
              <input type="number" min={0} max={60} value={bt.buffer_after} onChange={(e) => setBt((p) => ({ ...p, buffer_after: parseInt(e.target.value) || 0 }))} style={{ width: 48, padding: "5px 8px", borderRadius: 8, background: S.surface, border: `1px solid ${S.border}`, color: S.text, fontSize: 12, textAlign: "center" }} />
              <span style={{ fontSize: 11, color: S.dim }}>min after</span>
            </div>
          </div>

          {/* Item type */}
          <div style={{ ...ROW }}>
            <div>
              <div style={LABEL}>Creates Item Type</div>
              <div style={SUB}>What type of SitRep item is booked</div>
            </div>
            <select value={bt.sitrep_item_type} onChange={(e) => setBt((p) => ({ ...p, sitrep_item_type: e.target.value }))} style={{ padding: "6px 10px", borderRadius: 8, background: S.surface, border: `1px solid ${S.border}`, color: S.text, fontSize: 12 }}>
              {types.filter((t) => t.booking_enabled || ["meeting","event"].includes(t.slug)).map((t) => (
                <option key={t.slug} value={t.slug}>{t.name}</option>
              ))}
            </select>
          </div>

          {/* Confirmation message */}
          <div style={{ paddingTop: 12, paddingBottom: 14, borderBottom: `1px solid ${S.border}` }}>
            <label style={{ ...LABEL, display: "block", marginBottom: 6 }}>Confirmation Message</label>
            <textarea rows={2} value={bt.confirmation_msg ?? ""} onChange={(e) => setBt((p) => ({ ...p, confirmation_msg: e.target.value || null }))} style={{ ...INPUT, resize: "vertical" }} placeholder="Shown after booking + in confirmation email…" />
          </div>

          {/* Active */}
          <div style={{ paddingTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={LABEL}>Active</div>
              <div style={SUB}>Disable to hide the public booking page</div>
            </div>
            <OsPill value={bt.is_active} onChange={(v) => setBt((p) => ({ ...p, is_active: v }))} />
          </div>
        </div>

        <div style={{ padding: "14px 20px", borderTop: `1px solid ${S.border}`, display: "flex", alignItems: "center", gap: 12, background: S.card, position: "sticky", bottom: 0 }}>
          <button type="button" onClick={handleSave} disabled={saving} className="btn" style={{ padding: "8px 22px", fontSize: 13, borderRadius: 8 }}>
            {saving ? "Saving…" : "Save"}
          </button>
          {savedOk && <span style={{ fontSize: 12, color: "#4ade80", fontWeight: 600 }}>Saved ✓</span>}
          {err     && <span style={{ fontSize: 12, color: "#fca5a5" }}>{err}</span>}
        </div>
      </div>
    </div>
  );
  return typeof window !== "undefined" ? createPortal(panel, document.body) : null;
}

// ── Public Calendar Form ───────────────────────────────────────────────────────

function CalendarForm({
  publicTypes,
  onCreated,
}: { publicTypes: ItemType[]; onCreated: (cal: PublicCalendar) => void }) {
  const [name, setName] = useState("");
  const [typeSlugs, setTypeSlugs] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>(["open", "confirmed"]);
  const [showDay, setShowDay]     = useState(true);
  const [showWeek, setShowWeek]   = useState(true);
  const [showMonth, setShowMonth] = useState(true);
  const [defaultView, setDefaultView] = useState<"day"|"week"|"month">("month");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  function toggleSlug(slug: string) {
    setTypeSlugs((prev) => prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]);
  }
  function toggleStatus(key: string) {
    setStatuses((prev) => prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]);
  }

  async function handleSave() {
    if (!name.trim()) { setErr("Name is required."); return; }
    setSaving(true); setErr("");
    const res = await fetch("/api/crm/sitrep/public-calendars", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        include_type_slugs: typeSlugs,
        include_statuses:   statuses,
        show_day:    showDay,
        show_week:   showWeek,
        show_month:  showMonth,
        default_view: defaultView,
      }),
    });
    if (res.ok) {
      const created = await res.json();
      onCreated(created);
      setName(""); setTypeSlugs([]); setStatuses(["open","confirmed"]);
      setShowDay(true); setShowWeek(true); setShowMonth(true); setDefaultView("month");
    } else {
      const e = await res.json().catch(() => ({}));
      setErr(e.error ?? "Failed to create.");
    }
    setSaving(false);
  }

  const TAG: React.CSSProperties = {
    padding: "4px 10px", borderRadius: 16, fontSize: 12, fontWeight: 500,
    cursor: "pointer", border: `1px solid ${S.border}`, transition: "all .1s",
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div>
        <label style={{ fontSize: 12, color: S.dim, display: "block", marginBottom: 4 }}>Calendar Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Public Events"
          style={{
            width: "100%", padding: "9px 12px", borderRadius: 8,
            background: S.surface, border: `1px solid ${S.border}`,
            color: S.text, fontSize: 14, boxSizing: "border-box",
          }}
        />
      </div>

      {publicTypes.length > 0 ? (
        <div>
          <label style={{ fontSize: 12, color: S.dim, display: "block", marginBottom: 6 }}>Include Types</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {publicTypes.map((t) => {
              const sel = typeSlugs.includes(t.slug);
              return (
                <button key={t.slug} type="button" onClick={() => toggleSlug(t.slug)} style={{
                  ...TAG,
                  background: sel ? "rgba(99,102,241,.18)" : "rgba(255,255,255,.04)",
                  borderColor: sel ? "rgba(99,102,241,.5)" : S.border,
                  color: sel ? "#a5b4fc" : S.dim,
                }}>{t.name}</button>
              );
            })}
          </div>
          {typeSlugs.length === 0 && (
            <p style={{ fontSize: 12, color: S.dim, margin: "4px 0 0" }}>All public types will be included if none selected.</p>
          )}
        </div>
      ) : (
        <p style={{ fontSize: 13, color: "rgb(251 191 36)", margin: 0 }}>
          ⚠ No types are marked public yet. Use the type editor to enable.
        </p>
      )}

      <div>
        <label style={{ fontSize: 12, color: S.dim, display: "block", marginBottom: 6 }}>Include Statuses</label>
        <div style={{ display: "flex", gap: 6 }}>
          {ALL_STATUSES.map((s) => {
            const sel = statuses.includes(s.key);
            return (
              <button key={s.key} type="button" onClick={() => toggleStatus(s.key)} style={{
                ...TAG,
                background: sel ? "rgba(255,255,255,.1)" : "rgba(255,255,255,.03)",
                borderColor: sel ? "rgba(255,255,255,.25)" : S.border,
                color: sel ? S.text : S.dim,
              }}>{s.label}</button>
            );
          })}
        </div>
      </div>

      <div>
        <label style={{ fontSize: 12, color: S.dim, display: "block", marginBottom: 6 }}>Available Views</label>
        <div style={{ display: "flex", gap: 6 }}>
          {ALL_VIEWS.map((v) => {
            const key = v.key as "show_day"|"show_week"|"show_month";
            const sel = key === "show_day" ? showDay : key === "show_week" ? showWeek : showMonth;
            const toggle = key === "show_day"
              ? () => setShowDay(!showDay)
              : key === "show_week" ? () => setShowWeek(!showWeek) : () => setShowMonth(!showMonth);
            return (
              <button key={v.key} type="button" onClick={toggle} style={{
                ...TAG,
                background: sel ? "rgba(255,255,255,.1)" : "rgba(255,255,255,.03)",
                borderColor: sel ? "rgba(255,255,255,.25)" : S.border,
                color: sel ? S.text : S.dim,
              }}>{v.label}</button>
            );
          })}
        </div>
      </div>

      <div>
        <label style={{ fontSize: 12, color: S.dim, display: "block", marginBottom: 4 }}>Default View</label>
        <div style={{ display: "flex", gap: 6 }}>
          {(["day","week","month"] as const).map((v) => (
            <button key={v} type="button" onClick={() => setDefaultView(v)} style={{
              ...TAG,
              background: defaultView === v ? "rgba(255,255,255,.1)" : "rgba(255,255,255,.03)",
              borderColor: defaultView === v ? "rgba(255,255,255,.3)" : S.border,
              color: defaultView === v ? S.text : S.dim,
            }}>
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {err && <p style={{ margin: 0, fontSize: 12, color: "rgb(220 38 38)" }}>{err}</p>}
      <div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="btn"
          style={{ padding: "8px 20px", fontSize: 13, borderRadius: 8 }}
        >
          {saving ? "Creating…" : "Create Calendar"}
        </button>
      </div>
    </div>
  );
}

// ── Embed code card ────────────────────────────────────────────────────────────

function CalendarCard({ cal, onDelete }: { cal: PublicCalendar; onDelete: (id: string) => void }) {
  const [copied, setCopied]           = useState(false);
  const [hideTitle, setHideTitle]     = useState(false);
  const [transparent, setTransparent] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const params = new URLSearchParams();
  if (hideTitle)   params.set("hide_title",  "1");
  if (transparent) params.set("transparent", "1");
  const paramStr = params.toString() ? `?${params.toString()}` : "";
  const src      = `${origin}/public/cal/${cal.token}${paramStr}`;
  const iframeId = `ggcal-${cal.token.slice(0, 8)}`;
  const iframeStyle = `border-radius:12px;min-width:300px;display:block${transparent ? ";background:transparent" : ""}`;
  const iframeCode = `<iframe id="${iframeId}" src="${src}" width="100%" height="700" frameborder="0"${transparent ? ' allowtransparency="true"' : ""} style="${iframeStyle}" title="${cal.name}"></iframe>`;
  const resizeScript = `<script>window.addEventListener('message',function(e){if(e.data&&e.data.type==='gg-cal-height'){var f=document.getElementById('${iframeId}');if(f)f.style.height=e.data.height+'px';}});<\/script>`;

  const OPT_BTN = (active: boolean): React.CSSProperties => ({
    padding: "3px 10px", fontSize: 11, borderRadius: 6, fontWeight: 600,
    cursor: "pointer", transition: "all .1s",
    border: active ? "1px solid rgba(99,102,241,.5)" : `1px solid ${S.border}`,
    background: active ? "rgba(99,102,241,.14)" : "rgba(255,255,255,.04)",
    color: active ? "#a5b4fc" : S.dim,
  });

  const [copiedScript, setCopiedScript] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(iframeCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  function handleCopyScript() {
    navigator.clipboard.writeText(resizeScript).then(() => {
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 2000);
    });
  }

  return (
    <div style={{
      background: S.surface, border: `1px solid ${S.border}`, borderRadius: 12, padding: "14px 16px",
      display: "grid", gap: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: S.text }}>{cal.name}</div>
          <div style={{ fontSize: 11, color: S.dim, marginTop: 2 }}>
            {cal.include_type_slugs.length === 0 ? "All types" : cal.include_type_slugs.join(", ")}
            {" · "}
            {cal.include_statuses.join(", ")}
            {" · "}
            {[cal.show_day && "Day", cal.show_week && "Week", cal.show_month && "Month"].filter(Boolean).join("/")}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            if (!confirm(`Delete "${cal.name}"?`)) return;
            fetch(`/api/crm/sitrep/public-calendars/${cal.id}`, { method: "DELETE" })
              .then((r) => { if (r.ok) onDelete(cal.id); });
          }}
          style={{
            padding: "4px 10px", fontSize: 12, borderRadius: 7,
            border: "1px solid rgba(220,38,38,.3)", background: "rgba(220,38,38,.08)",
            color: "#fca5a5", cursor: "pointer", flexShrink: 0, fontWeight: 500,
          }}
        >Delete</button>
      </div>

      <div>
        <div style={{ fontSize: 11, color: S.dim, marginBottom: 6 }}>Embed options</div>
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" onClick={() => setHideTitle((v) => !v)} style={OPT_BTN(hideTitle)}>
            {hideTitle ? "✓ " : ""}Hide title
          </button>
          <button type="button" onClick={() => setTransparent((v) => !v)} style={OPT_BTN(transparent)}>
            {transparent ? "✓ " : ""}Transparent background
          </button>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 11, color: S.dim, marginBottom: 4 }}>Embed code</div>
        <div style={{
          background: "rgba(0,0,0,.3)", borderRadius: 8, padding: "8px 12px",
          fontSize: 11, fontFamily: "monospace", color: "#94a3b8",
          wordBreak: "break-all", border: `1px solid ${S.border}`,
        }}>
          {iframeCode}
        </div>
        <button type="button" onClick={handleCopy} style={{
          marginTop: 8, padding: "5px 14px", fontSize: 12, borderRadius: 7, fontWeight: 600,
          border: `1px solid ${S.border}`, background: "rgba(255,255,255,.06)",
          color: copied ? "#4ade80" : S.text, cursor: "pointer",
        }}>
          {copied ? "Copied ✓" : "Copy iframe code"}
        </button>
      </div>

      <div>
        <div style={{ fontSize: 11, color: S.dim, marginBottom: 4 }}>
          Auto-resize script{" "}
          <span style={{ opacity: 0.6 }}>(paste once per page, after the iframe)</span>
        </div>
        <div style={{
          background: "rgba(0,0,0,.3)", borderRadius: 8, padding: "8px 12px",
          fontSize: 11, fontFamily: "monospace", color: "#94a3b8",
          wordBreak: "break-all", border: `1px solid ${S.border}`,
        }}>
          {resizeScript}
        </div>
        <button type="button" onClick={handleCopyScript} style={{
          marginTop: 6, padding: "5px 14px", fontSize: 12, borderRadius: 7, fontWeight: 600,
          border: `1px solid ${S.border}`, background: "rgba(255,255,255,.06)",
          color: copiedScript ? "#4ade80" : S.text, cursor: "pointer",
        }}>
          {copiedScript ? "Copied ✓" : "Copy script"}
        </button>
      </div>
    </div>
  );
}

// ── Calendar View Editor slide-in ─────────────────────────────────────────────

function CalendarViewEditor({
  view, typeId, types, onSaved, onCreated, onDeleted, onClose,
}: {
  view:       MyCalView | null;
  typeId:     string;
  types:      ItemType[];
  onSaved:    (v: MyCalView) => void;
  onCreated:  (v: MyCalView) => void;
  onDeleted:  (viewId: string) => void;
  onClose:    () => void;
}) {
  const isNew = view === null;

  const [name,    setName]    = useState(view?.name ?? "");
  const [color,   setColor]   = useState(view?.color ?? null);
  const [fc, setFc] = useState<CalFilterConfig>(view?.filter_config ?? { assignee_filter: "me" });
  const [saving,  setSaving]  = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err,     setErr]     = useState("");

  const [invites,       setInvites]       = useState<CalInvite[]>([]);
  const [inviteEmail,   setInviteEmail]   = useState("");
  const [inviteRole,    setInviteRole]    = useState<"viewer" | "editor">("viewer");
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteErr,     setInviteErr]     = useState("");
  const [inviteSent,    setInviteSent]    = useState(false);

  useEffect(() => {
    if (!view) return;
    fetch(`/api/user/calendar-views/${view.id}/shares`)
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setInvites(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [view?.id]);

  // Stages available given current type filter
  const visibleStages = (() => {
    const src = fc.item_type_slugs?.length
      ? types.filter((t) => fc.item_type_slugs!.includes(t.slug))
      : types;
    const seen = new Set<string>();
    const out: Stage[] = [];
    for (const t of src) {
      for (const s of t.stages ?? []) {
        if (!seen.has(s.slug)) { seen.add(s.slug); out.push(s); }
      }
    }
    return fc.show_terminal ? out : out.filter((s) => !s.is_terminal);
  })();

  function toggleSlug(key: "item_type_slugs" | "stage_slugs", slug: string) {
    setFc((prev) => {
      const cur = prev[key] ?? [];
      return { ...prev, [key]: cur.includes(slug) ? cur.filter((s) => s !== slug) : [...cur, slug] };
    });
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true); setErr("");
    try {
      if (isNew) {
        const res = await fetch(`/api/user/calendar-types/${typeId}/views`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), color, filter_config: fc }),
        });
        const json = await res.json();
        if (!res.ok) { setErr(json.error ?? "Failed"); return; }
        onCreated(json);
      } else {
        const res = await fetch(`/api/user/calendar-views/${view!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), color, filter_config: fc }),
        });
        const json = await res.json();
        if (!res.ok) { setErr(json.error ?? "Failed"); return; }
        onSaved(json);
      }
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!view || !confirm(`Delete view "${view.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    const res = await fetch(`/api/user/calendar-views/${view.id}`, { method: "DELETE" });
    setDeleting(false);
    if (res.ok) onDeleted(view.id);
  }

  async function handleInvite() {
    if (!view || !inviteEmail.trim()) return;
    setInviteSending(true); setInviteErr(""); setInviteSent(false);
    const res = await fetch(`/api/user/calendar-views/${view.id}/shares`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
    });
    setInviteSending(false);
    if (res.ok) {
      setInviteSent(true); setInviteEmail("");
      const newInv = await res.json().catch(() => null);
      if (newInv) setInvites((prev) => [...prev, newInv]);
    } else {
      const e = await res.json().catch(() => ({}));
      setInviteErr(e.error ?? "Failed");
    }
  }

  const PillBtn = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
    <button type="button" onClick={onClick} style={{
      padding: "4px 13px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer",
      border: `1px solid ${active ? "rgba(99,102,241,.5)" : S.border}`,
      background: active ? "rgba(99,102,241,.15)" : "rgba(255,255,255,.04)",
      color: active ? "#a5b4fc" : S.dim, transition: "all .1s",
    }}>{label}</button>
  );

  const Label = ({ children }: { children: React.ReactNode }) => (
    <div style={{ fontSize: 11, fontWeight: 700, color: S.dim, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>
      {children}
    </div>
  );

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", justifyContent: "flex-end" }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.55)" }} onClick={onClose} />
      <div style={{
        position: "relative", zIndex: 1, width: 520, maxWidth: "100vw",
        background: S.card, borderLeft: `1px solid ${S.border}`,
        display: "flex", flexDirection: "column", overflowY: "auto",
      }}>
        {/* Header */}
        <div style={{ padding: "20px 24px 16px", borderBottom: `1px solid ${S.border}`, display: "flex", alignItems: "center", gap: 12 }}>
          <ColorFamilyPicker value={color ?? "blue"} onChange={(c) => setColor(c)} size={28} />
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="View name…"
            style={{
              flex: 1, background: "transparent", border: "none", outline: "none",
              color: S.text, fontSize: 18, fontWeight: 700,
            }}
          />
          <button onClick={onClose} style={{ background: "none", border: "none", color: S.dim, fontSize: 20, cursor: "pointer", lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ flex: 1, padding: "20px 24px", display: "flex", flexDirection: "column", gap: 24, overflowY: "auto" }}>

          {/* ── Filters ── */}
          <div>
            <Label>Filters</Label>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

              {/* Assignee */}
              <div>
                <div style={{ fontSize: 13, color: S.dimBrt, fontWeight: 600, marginBottom: 8 }}>Show items assigned to</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <PillBtn label="Me only"  active={!fc.assignee_filter || fc.assignee_filter === "me"} onClick={() => setFc((p) => ({ ...p, assignee_filter: "me" }))} />
                  <PillBtn label="Everyone" active={fc.assignee_filter === "all"} onClick={() => setFc((p) => ({ ...p, assignee_filter: "all" }))} />
                </div>
              </div>

              {/* Viewer items */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, color: S.dimBrt }}>Include events I can see but am not assigned to</span>
                <button
                  type="button"
                  onClick={() => setFc((p) => ({ ...p, show_viewer_items: !p.show_viewer_items }))}
                  style={{
                    width: 38, height: 21, borderRadius: 21, border: "none", cursor: "pointer", flexShrink: 0,
                    background: fc.show_viewer_items ? "var(--gg-primary,#2563eb)" : "rgba(255,255,255,.12)",
                    position: "relative", transition: "background .15s",
                  }}
                >
                  <span style={{
                    position: "absolute", top: 3, left: fc.show_viewer_items ? 19 : 3,
                    width: 15, height: 15, borderRadius: "50%", background: "#fff", transition: "left .15s",
                  }} />
                </button>
              </div>

              {/* Item types */}
              {types.length > 0 && (
                <div>
                  <div style={{ fontSize: 13, color: S.dimBrt, fontWeight: 600, marginBottom: 8 }}>
                    Item Types <span style={{ fontSize: 11, color: S.dim, fontWeight: 400 }}>(empty = all)</span>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {types.map((t) => (
                      <PillBtn
                        key={t.slug}
                        label={t.name}
                        active={(fc.item_type_slugs ?? []).includes(t.slug)}
                        onClick={() => toggleSlug("item_type_slugs", t.slug)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Stages */}
              {visibleStages.length > 0 && (
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 13, color: S.dimBrt, fontWeight: 600 }}>
                      Stages <span style={{ fontSize: 11, color: S.dim, fontWeight: 400 }}>(empty = all active)</span>
                    </span>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: S.dim, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={!!fc.show_terminal}
                        onChange={(e) => setFc((p) => ({ ...p, show_terminal: e.target.checked, stage_slugs: [] }))}
                        style={{ accentColor: "var(--gg-primary,#2563eb)" }}
                      />
                      Include completed
                    </label>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {visibleStages.map((s) => (
                      <PillBtn
                        key={s.slug}
                        label={s.name}
                        active={(fc.stage_slugs ?? []).includes(s.slug)}
                        onClick={() => toggleSlug("stage_slugs", s.slug)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Location */}
              <div>
                <div style={{ fontSize: 13, color: S.dimBrt, fontWeight: 600, marginBottom: 8 }}>Location filter</div>
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, color: S.dim, display: "block", marginBottom: 4 }}>City</label>
                    <input
                      type="text"
                      value={fc.location_city ?? ""}
                      onChange={(e) => setFc((p) => ({ ...p, location_city: e.target.value }))}
                      placeholder="Any city"
                      style={{
                        width: "100%", padding: "8px 11px", borderRadius: 9, boxSizing: "border-box",
                        background: S.bg, border: `1px solid ${S.border}`, color: S.text, fontSize: 13,
                      }}
                    />
                  </div>
                  <div style={{ width: 100 }}>
                    <label style={{ fontSize: 11, color: S.dim, display: "block", marginBottom: 4 }}>State</label>
                    <input
                      type="text"
                      value={fc.location_state ?? ""}
                      onChange={(e) => setFc((p) => ({ ...p, location_state: e.target.value.toUpperCase().slice(0, 2) }))}
                      placeholder="TX"
                      maxLength={2}
                      style={{
                        width: "100%", padding: "8px 11px", borderRadius: 9, boxSizing: "border-box",
                        background: S.bg, border: `1px solid ${S.border}`, color: S.text, fontSize: 13, textTransform: "uppercase",
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Share / Invite ── (existing views only) */}
          {!isNew && (
            <div>
              <Label>Share this view</Label>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleInvite(); }}
                    placeholder="colleague@example.com"
                    style={{
                      flex: 1, padding: "8px 12px", borderRadius: 9,
                      background: S.bg, border: `1px solid ${S.border}`, color: S.text, fontSize: 13,
                    }}
                  />
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as any)}
                    style={{ padding: "8px 10px", borderRadius: 9, background: S.bg, border: `1px solid ${S.border}`, color: S.dim, fontSize: 12 }}
                  >
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleInvite}
                    disabled={inviteSending || !inviteEmail.trim()}
                    className="btn"
                    style={{ padding: "8px 16px", fontSize: 13, borderRadius: 9, flexShrink: 0 }}
                  >
                    {inviteSending ? "…" : "Invite"}
                  </button>
                </div>
                {inviteErr  && <p style={{ margin: 0, fontSize: 12, color: "#fca5a5" }}>{inviteErr}</p>}
                {inviteSent && <p style={{ margin: 0, fontSize: 12, color: "#4ade80" }}>Invite sent — they'll get an email with an accept link ✓</p>}

                <p style={{ margin: 0, fontSize: 11, color: S.dim, lineHeight: 1.5 }}>
                  <strong style={{ color: S.dimBrt }}>Viewer</strong> — sees what this filter returns, can't modify.<br />
                  <strong style={{ color: S.dimBrt }}>Editor</strong> — can also add items and assign you to them.
                </p>

                {invites.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ fontSize: 11, color: S.dim, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>Shared with</div>
                    {invites.map((inv) => (
                      <div key={inv.id} style={{
                        display: "flex", alignItems: "center", gap: 10,
                        background: S.surface, border: `1px solid ${S.border}`, borderRadius: 9, padding: "8px 12px",
                      }}>
                        <span style={{ flex: 1, fontSize: 13, color: S.text }}>{inv.email}</span>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
                          background: inv.role === "editor" ? "rgba(99,102,241,.12)" : "rgba(255,255,255,.07)",
                          color: inv.role === "editor" ? "#a5b4fc" : S.dim,
                        }}>{inv.role.toUpperCase()}</span>
                        <span style={{
                          fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 4,
                          background: inv.status === "accepted" ? "rgba(16,185,129,.1)" : "rgba(255,255,255,.05)",
                          color: inv.status === "accepted" ? "#6ee7b7" : S.dim,
                        }}>{inv.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {err && <p style={{ margin: 0, fontSize: 13, color: "#fca5a5" }}>{err}</p>}
        </div>

        {/* Footer */}
        <div style={{
          padding: "16px 24px", borderTop: `1px solid ${S.border}`,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          {!isNew && !view?.is_default && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              style={{
                padding: "8px 16px", fontSize: 13, borderRadius: 9, cursor: "pointer",
                border: "1px solid rgba(220,38,38,.3)", background: "rgba(220,38,38,.08)",
                color: "#fca5a5",
              }}
            >{deleting ? "Deleting…" : "Delete View"}</button>
          )}
          <div style={{ flex: 1 }} />
          <button type="button" onClick={onClose} style={{
            padding: "8px 18px", fontSize: 13, borderRadius: 9, cursor: "pointer",
            border: `1px solid ${S.border}`, background: "none", color: S.dim,
          }}>Cancel</button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="btn"
            style={{ padding: "8px 22px", fontSize: 13, borderRadius: 9 }}
          >{saving ? "Saving…" : isNew ? "Create View" : "Save"}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────

export default function SitRepSettingsPanel({ isDirector = true }: { isDirector?: boolean }) {
  const [types, setTypes] = useState<ItemType[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingType, setEditingType] = useState<ItemType | null>(null);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("blue");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");

  const [bookingTypes, setBookingTypes] = useState<BookingType[]>([]);
  const [bookingLoading, setBookingLoading] = useState(true);
  const [editingBooking, setEditingBooking] = useState<BookingType | "new" | null>(null);

  const [myCals,          setMyCals]          = useState<MyCal[]>([]);
  const [myCalsLoading,   setMyCalsLoading]   = useState(true);
  const [sharedViews,     setSharedViews]     = useState<SharedView[]>([]);
  const [pendingInvites,  setPendingInvites]  = useState<PendingCalInvite[]>([]);
  const [inviteBusy,      setInviteBusy]      = useState<string | null>(null);
  const [editingCalView, setEditingCalView] = useState<{ view: MyCalView | null; typeId: string } | null>(null);
  const [calTypeExpanded, setCalTypeExpanded] = useState<Set<string>>(new Set());

  const [calendars, setCalendars] = useState<PublicCalendar[]>([]);
  const [calsLoading, setCalsLoading] = useState(true);

  const [widget, setWidget] = useState<WidgetSettings>(DEFAULT_WIDGET);
  const [widgetLoading, setWidgetLoading] = useState(true);
  const [widgetSaving, setWidgetSaving] = useState(false);
  const [widgetSaved, setWidgetSaved] = useState(false);

  useEffect(() => {
    fetch("/api/crm/sitrep/types")
      .then((r) => r.json())
      .then((data) => setTypes(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));

    fetch("/api/crm/sitrep/booking-types")
      .then((r) => r.json())
      .then((data) => setBookingTypes(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setBookingLoading(false));

    fetch("/api/user/calendar-types")
      .then((r) => r.json())
      .then((data) => setMyCals(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setMyCalsLoading(false));

    fetch("/api/user/calendar-views/shared")
      .then((r) => r.json())
      .then((data) => setSharedViews(Array.isArray(data) ? data : []))
      .catch(() => {});

    fetch("/api/user/calendar-invites")
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setPendingInvites(Array.isArray(data) ? data : []))
      .catch(() => {});

    fetch("/api/crm/sitrep/public-calendars")
      .then((r) => r.json())
      .then((data) => setCalendars(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setCalsLoading(false));

    fetch("/api/crm/sitrep/widget-settings")
      .then((r) => r.json())
      .then((data) => setWidget({ ...DEFAULT_WIDGET, ...data }))
      .catch(() => {})
      .finally(() => setWidgetLoading(false));
  }, []);

  async function handlePendingInviteAction(invite: PendingCalInvite, action: "accept" | "decline") {
    setInviteBusy(invite.id);
    try {
      const res = await fetch(`/api/calendar-invite/${invite.token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        setPendingInvites((prev) => prev.filter((i) => i.id !== invite.id));
        if (action === "accept") {
          // Refresh shared views so it appears immediately
          fetch("/api/user/calendar-views/shared")
            .then((r) => r.json())
            .then((d) => setSharedViews(Array.isArray(d) ? d : []))
            .catch(() => {});
        }
      }
    } finally {
      setInviteBusy(null);
    }
  }

  async function saveWidget() {
    setWidgetSaving(true);
    await fetch("/api/crm/sitrep/widget-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(widget),
    });
    setWidgetSaving(false);
    setWidgetSaved(true);
    setTimeout(() => setWidgetSaved(false), 2000);
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/crm/sitrep/types/${id}`, { method: "DELETE" });
    if (res.ok) {
      setTypes((prev) => prev.filter((t) => t.id !== id));
      if (editingType?.id === id) setEditingType(null);
    }
  }

  async function handleAdd() {
    if (!newName.trim() || adding) return;
    setAdding(true); setAddError("");
    const res = await fetch("/api/crm/sitrep/types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), color: newColor }),
    });
    if (res.ok) {
      const created = await res.json();
      setTypes((prev) => [...prev, created]);
      setNewName(""); setNewColor("blue");
    } else {
      const err = await res.json().catch(() => ({}));
      setAddError(err.error ?? "Failed to add type.");
    }
    setAdding(false);
  }

  const publicTypes = types.filter((t) => t.is_public);

  const TAG: React.CSSProperties = {
    padding: "4px 10px", borderRadius: 16, fontSize: 12, fontWeight: 500,
    cursor: "pointer", border: `1px solid ${S.border}`, transition: "all .1s",
  };

  return (
    <>
      <div className="stack" style={{ maxWidth: 680 }}>

        {/* Breadcrumb + title */}
        <div>
          <div style={{ fontSize: 12, color: S.dim, marginBottom: 6 }}>
            <Link href="/crm/settings" style={{ color: S.dim, textDecoration: "none" }}>Settings</Link>
            {" / SitRep"}
          </div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>SitRep Settings</h1>
        </div>

        {/* Item Types card — Director only */}
        {isDirector && <div style={{
          background: S.card, border: `1px solid ${S.border}`,
          borderRadius: 16, padding: 24, display: "grid", gap: 20,
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Item Types</h2>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: S.dim }}>
              Click a type to configure its stages, flags, and roles.
            </p>
          </div>

          {loading ? (
            <div style={{ fontSize: 13, color: S.dim }}>Loading…</div>
          ) : (
            <div style={{ display: "grid", gap: 6 }}>
              {types.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setEditingType(t)}
                  style={{
                    background: S.surface, border: `1px solid ${S.border}`, borderRadius: 12,
                    display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                    cursor: "pointer", textAlign: "left", width: "100%",
                  }}
                >
                  <span style={{
                    width: 12, height: 12, borderRadius: "50%", flexShrink: 0,
                    background: getFamilyByKey(t.color)?.shades[2] ?? "rgb(99 102 241)",
                  }} />
                  <span style={{ fontSize: 14, fontWeight: 500, flex: 1, color: S.text }}>{t.name}</span>
                  {t.is_mission_type && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
                      borderRadius: 4, padding: "2px 7px", flexShrink: 0,
                      background: "rgba(16 185 129 / .12)", color: "#6ee7b7",
                    }}>MISSION</span>
                  )}
                  <span style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
                    borderRadius: 4, padding: "2px 8px", flexShrink: 0,
                    background: t.is_system ? "rgba(255,255,255,.06)" : "rgba(99,102,241,.12)",
                    color: t.is_system ? S.dim : "#a5b4fc",
                  }}>
                    {t.is_system ? "SYSTEM" : "CUSTOM"}
                  </span>
                  <span style={{ fontSize: 11, color: S.dim, flexShrink: 0 }}>{(t.stages ?? []).length} stages →</span>
                  {!t.is_system && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleDelete(t.id, t.name); }}
                      style={{
                        padding: "3px 8px", fontSize: 11, borderRadius: 5, fontWeight: 500,
                        border: "1px solid rgba(220,38,38,.3)", background: "rgba(220,38,38,.08)",
                        color: "#fca5a5", cursor: "pointer", flexShrink: 0,
                      }}
                    >Delete</button>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Add new type */}
          <div>
            <div style={{
              fontSize: 10, fontWeight: 800, letterSpacing: "0.1em",
              color: S.dim, textTransform: "uppercase", marginBottom: 8,
            }}>
              Add Custom Type
            </div>
            <div style={{
              background: S.surface, border: `1px dashed ${S.border}`, borderRadius: 12,
              display: "flex", gap: 10, alignItems: "center", padding: "10px 14px",
            }}>
              <ColorFamilyPicker value={newColor} onChange={setNewColor} size={28} />
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
                placeholder="Type name…"
                style={{
                  flex: 1, background: "transparent", border: "none", outline: "none",
                  color: S.text, fontSize: 14, minWidth: 0,
                }}
              />
              <button
                type="button"
                onClick={handleAdd}
                disabled={!newName.trim() || adding}
                className="btn"
                style={{ padding: "6px 16px", fontSize: 13, borderRadius: 8, flexShrink: 0 }}
              >
                {adding ? "Adding…" : "+ Add"}
              </button>
            </div>
            {addError && (
              <p style={{ margin: "6px 0 0", fontSize: 12, color: "rgb(220 38 38)" }}>{addError}</p>
            )}
          </div>
        </div>}

        {/* My Booking Pages card */}
        <div style={{
          background: S.card, border: `1px solid ${S.border}`,
          borderRadius: 16, padding: 24, display: "grid", gap: 20,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>My Booking Pages</h2>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: S.dim }}>
                Public scheduling pages for your availability — like Calendly, built in.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEditingBooking("new")}
              className="btn"
              style={{ padding: "7px 16px", fontSize: 13, borderRadius: 8, flexShrink: 0 }}
            >+ New Page</button>
          </div>

          {bookingLoading ? (
            <div style={{ fontSize: 13, color: S.dim }}>Loading…</div>
          ) : bookingTypes.length === 0 ? (
            <div style={{
              background: S.surface, border: `1px dashed ${S.border}`, borderRadius: 12,
              padding: "28px 20px", textAlign: "center",
            }}>
              <p style={{ margin: "0 0 6px", fontSize: 14, color: S.dim }}>No booking pages yet.</p>
              <p style={{ margin: 0, fontSize: 12, color: S.dim }}>
                Create one and share the link — anyone can book time on your calendar.
              </p>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {bookingTypes.map((bt) => {
                const origin = typeof window !== "undefined" ? window.location.origin : "";
                const url = `${origin}/book/${bt.slug}`;
                const dur = bt.duration_minutes < 60 ? `${bt.duration_minutes}m` : `${bt.duration_minutes / 60}h`;
                return (
                  <div key={bt.id} style={{
                    background: S.surface, border: `1px solid ${S.border}`, borderRadius: 12,
                    padding: "12px 16px", display: "flex", alignItems: "center", gap: 12,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: S.text }}>{bt.title}</span>
                        {!bt.is_active && (
                          <span style={{ fontSize: 10, fontWeight: 700, background: "rgba(255,255,255,.07)", color: S.dim, borderRadius: 4, padding: "1px 6px" }}>INACTIVE</span>
                        )}
                      </div>
                      <a href={url} target="_blank" rel="noopener" style={{ fontSize: 11, color: "#60a5fa", textDecoration: "none" }}>
                        /book/{bt.slug}
                      </a>
                      <div style={{ fontSize: 11, color: S.dim, marginTop: 2 }}>
                        {dur} · {bt.sitrep_item_type} · {bt.timezone}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={() => { navigator.clipboard.writeText(url); }}
                        title="Copy link"
                        style={{
                          padding: "5px 10px", fontSize: 12, borderRadius: 7,
                          border: `1px solid ${S.border}`, background: "rgba(255,255,255,.05)",
                          color: S.dim, cursor: "pointer",
                        }}
                      >Copy link</button>
                      <button
                        type="button"
                        onClick={() => setEditingBooking(bt)}
                        style={{
                          padding: "5px 12px", fontSize: 12, borderRadius: 7,
                          border: `1px solid ${S.border}`, background: "rgba(255,255,255,.05)",
                          color: S.text, cursor: "pointer",
                        }}
                      >Edit</button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!confirm(`Delete "${bt.title}"?`)) return;
                          const res = await fetch(`/api/crm/sitrep/booking-types/${bt.id}`, { method: "DELETE" });
                          if (res.ok) setBookingTypes((prev) => prev.filter((b) => b.id !== bt.id));
                        }}
                        style={{
                          padding: "5px 10px", fontSize: 12, borderRadius: 7,
                          border: "1px solid rgba(220,38,38,.3)", background: "rgba(220,38,38,.07)",
                          color: "#fca5a5", cursor: "pointer",
                        }}
                      >Delete</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* My Calendars card */}
        <div style={{
          background: S.card, border: `1px solid ${S.border}`,
          borderRadius: 16, padding: 24, display: "grid", gap: 20,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>My Calendars</h2>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: S.dim }}>
                Configure views, filters, and sharing for each of your calendars.
              </p>
            </div>
            <button
              type="button"
              onClick={async () => {
                const name = prompt("Calendar name:");
                if (!name?.trim()) return;
                const res = await fetch("/api/user/calendar-types", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ name: name.trim(), color: "blue", cal_type: "custom" }),
                });
                if (res.ok) {
                  const created = await res.json();
                  setMyCals((prev) => [...prev, created]);
                }
              }}
              className="btn"
              style={{ padding: "7px 16px", fontSize: 13, borderRadius: 8, flexShrink: 0 }}
            >+ Add Calendar</button>
          </div>

          {myCalsLoading ? (
            <div style={{ fontSize: 13, color: S.dim }}>Loading…</div>
          ) : myCals.length === 0 ? (
            <div style={{ background: S.surface, border: `1px dashed ${S.border}`, borderRadius: 12, padding: "20px", textAlign: "center" }}>
              <p style={{ margin: 0, fontSize: 13, color: S.dim }}>No calendars yet. Your Work and Personal calendars are created the first time you visit the Calendar page.</p>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {myCals.map((cal) => {
                const dot = getFamilyByKey(cal.color)?.shades[2] ?? "#818cf8";
                const expanded = calTypeExpanded.has(cal.id);
                const views = cal.user_calendar_views ?? [];
                return (
                  <div key={cal.id} style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 12, overflow: "hidden" }}>
                    {/* Type header row */}
                    <div
                      onClick={() => setCalTypeExpanded((p) => { const n = new Set(p); n.has(cal.id) ? n.delete(cal.id) : n.add(cal.id); return n; })}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", cursor: "pointer" }}
                    >
                      <span style={{ fontSize: 11, color: S.dim }}>{expanded ? "▼" : "▶"}</span>
                      <span style={{ width: 11, height: 11, borderRadius: "50%", background: dot, flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: S.text }}>{cal.name}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", padding: "2px 7px", borderRadius: 4, background: "rgba(255,255,255,.07)", color: S.dim }}>
                        {cal.cal_type.toUpperCase()}
                      </span>
                      <span style={{ fontSize: 12, color: S.dim }}>{views.length} view{views.length !== 1 ? "s" : ""}</span>
                    </div>

                    {/* Views list */}
                    {expanded && (
                      <div style={{ borderTop: `1px solid ${S.border}`, padding: "8px 0" }}>
                        {views.sort((a, b) => a.sort_order - b.sort_order).map((view) => (
                          <div key={view.id} style={{
                            display: "flex", alignItems: "center", gap: 10,
                            padding: "7px 16px 7px 36px",
                          }}>
                            <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot, flexShrink: 0 }} />
                            <span style={{ flex: 1, fontSize: 13, color: S.dim }}>{view.name}</span>
                            {view.is_default && (
                              <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: "rgba(255,255,255,.06)", color: S.dim }}>DEFAULT</span>
                            )}
                            {/* Show active filters as badges */}
                            {(view.filter_config?.item_type_slugs ?? []).length > 0 && (
                              <span style={{ fontSize: 10, color: "#a5b4fc", background: "rgba(99,102,241,.1)", borderRadius: 4, padding: "1px 6px" }}>
                                {(view.filter_config.item_type_slugs as string[]).length} type{(view.filter_config.item_type_slugs as string[]).length !== 1 ? "s" : ""}
                              </span>
                            )}
                            {view.filter_config?.location_city && (
                              <span style={{ fontSize: 10, color: "#6ee7b7", background: "rgba(16,185,129,.1)", borderRadius: 4, padding: "1px 6px" }}>
                                {view.filter_config.location_city as string}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => setEditingCalView({ view, typeId: cal.id })}
                              style={{
                                padding: "4px 12px", fontSize: 12, borderRadius: 7, cursor: "pointer",
                                border: `1px solid ${S.border}`, background: "rgba(255,255,255,.05)", color: S.text,
                              }}
                            >Configure</button>
                          </div>
                        ))}
                        <div style={{ padding: "6px 16px 4px 36px" }}>
                          <button
                            type="button"
                            onClick={() => setEditingCalView({ view: null, typeId: cal.id })}
                            style={{
                              fontSize: 12, color: S.dim, background: "none",
                              border: "none", cursor: "pointer", padding: "2px 0",
                            }}
                          >+ Add view to this calendar</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Pending invites */}
          {pendingInvites.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "rgb(251 191 36)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10 }}>
                Pending Invites · {pendingInvites.length}
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {pendingInvites.map((inv) => {
                  const dot  = getFamilyByKey(inv.view_color)?.shades[2] ?? "#818cf8";
                  const busy = inviteBusy === inv.id;
                  return (
                    <div key={inv.id} style={{
                      background: "rgba(251,191,36,.05)", border: "1px solid rgba(251,191,36,.15)",
                      borderRadius: 10, padding: "12px 14px",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                        <span style={{ width: 9, height: 9, borderRadius: "50%", background: dot, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: S.text }}>{inv.view_name}</div>
                          <div style={{ fontSize: 11, color: S.dim, marginTop: 1 }}>
                            {inv.type_name} · from {inv.owner_name}
                          </div>
                        </div>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
                          background: inv.role === "editor" ? "rgba(99,102,241,.12)" : "rgba(255,255,255,.07)",
                          color: inv.role === "editor" ? "#a5b4fc" : S.dim,
                        }}>{inv.role.toUpperCase()}</span>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          onClick={() => handlePendingInviteAction(inv, "accept")}
                          disabled={busy}
                          className="btn"
                          style={{ flex: 1, padding: "7px 0", fontSize: 12, borderRadius: 8, opacity: busy ? 0.6 : 1 }}
                        >{busy ? "…" : "Accept"}</button>
                        <button
                          onClick={() => handlePendingInviteAction(inv, "decline")}
                          disabled={busy}
                          style={{
                            padding: "7px 12px", fontSize: 12, fontWeight: 600, borderRadius: 8,
                            border: `1px solid ${S.border}`, background: "none", color: S.dim,
                            cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.6 : 1,
                          }}
                        >Decline</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Shared with you */}
          {sharedViews.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: S.dim, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10 }}>
                Shared with you
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                {sharedViews.map((sv) => {
                  const dot = getFamilyByKey(sv.type_color)?.shades[2] ?? "#818cf8";
                  return (
                    <div key={sv.share_id} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      background: S.surface, border: `1px solid ${S.border}`, borderRadius: 10, padding: "10px 14px",
                    }}>
                      <span style={{ width: 9, height: 9, borderRadius: "50%", background: dot, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: S.text }}>{sv.view_name}</div>
                        <div style={{ fontSize: 11, color: S.dim, marginTop: 1 }}>
                          {sv.type_name} · from {sv.owner_name}
                        </div>
                      </div>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
                        background: sv.role === "editor" ? "rgba(99,102,241,.12)" : "rgba(255,255,255,.07)",
                        color: sv.role === "editor" ? "#a5b4fc" : S.dim,
                      }}>{sv.role.toUpperCase()}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Public Calendars card — Director only */}
        {isDirector && <div style={{
          background: S.card, border: `1px solid ${S.border}`,
          borderRadius: 16, padding: 24, display: "grid", gap: 24,
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Public Calendars</h2>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: S.dim }}>
              Create shareable, embeddable calendars. Only items visible to "Team" and types marked Public are shown.
            </p>
          </div>

          {calsLoading ? (
            <div style={{ fontSize: 13, color: S.dim }}>Loading…</div>
          ) : calendars.length > 0 ? (
            <div style={{ display: "grid", gap: 10 }}>
              {calendars.map((cal) => (
                <CalendarCard
                  key={cal.id}
                  cal={cal}
                  onDelete={(id) => setCalendars((prev) => prev.filter((c) => c.id !== id))}
                />
              ))}
            </div>
          ) : null}

          <div>
            <div style={{
              fontSize: 10, fontWeight: 800, letterSpacing: "0.1em",
              color: S.dim, textTransform: "uppercase", marginBottom: 14,
            }}>
              New Public Calendar
            </div>
            <CalendarForm
              publicTypes={publicTypes}
              onCreated={(cal) => setCalendars((prev) => [...prev, cal])}
            />
          </div>
        </div>}

        {/* Dashboard Widget card */}
        <div style={{
          background: S.card, border: `1px solid ${S.border}`,
          borderRadius: 16, padding: 24, display: "grid", gap: 24,
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Dashboard Widget</h2>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: S.dim }}>
              Configure which items appear on the CRM dashboard and how they're sorted.
            </p>
          </div>

          {widgetLoading ? (
            <div style={{ fontSize: 13, color: S.dim }}>Loading…</div>
          ) : (
            <div style={{ display: "grid", gap: 20 }}>

              <div>
                <label style={{ fontSize: 12, color: S.dim, display: "block", marginBottom: 6, fontWeight: 600 }}>View Mode</label>
                <div style={{ display: "flex", gap: 6 }}>
                  {([
                    { key: "list",     label: "📋 List" },
                    { key: "calendar", label: "📅 Calendar" },
                  ] as const).map(({ key, label }) => {
                    const sel = widget.widget_view === key;
                    return (
                      <button key={key} type="button" onClick={() => setWidget((w) => ({ ...w, widget_view: key }))} style={{
                        ...TAG,
                        background: sel ? "rgba(99,102,241,.14)" : "rgba(255,255,255,.04)",
                        borderColor: sel ? "rgba(99,102,241,.5)" : S.border,
                        color: sel ? "#a5b4fc" : S.dim,
                      }}>{label}</button>
                    );
                  })}
                </div>
              </div>

              {widget.widget_view === "calendar" && (
                <div>
                  <label style={{ fontSize: 12, color: S.dim, display: "block", marginBottom: 6, fontWeight: 600 }}>Calendar Default View</label>
                  <div style={{ display: "flex", gap: 6 }}>
                    {(["day", "week", "month"] as const).map((v) => {
                      const sel = widget.calendar_default_view === v;
                      return (
                        <button key={v} type="button" onClick={() => setWidget((w) => ({ ...w, calendar_default_view: v }))} style={{
                          ...TAG,
                          background: sel ? "rgba(255,255,255,.12)" : "rgba(255,255,255,.04)",
                          borderColor: sel ? "rgba(255,255,255,.3)" : S.border,
                          color: sel ? S.text : S.dim,
                        }}>{v.charAt(0).toUpperCase() + v.slice(1)}</button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <label style={{ fontSize: 12, color: S.dim, display: "block", marginBottom: 6, fontWeight: 600 }}>Show Types</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {types.map((t) => {
                    const sel = widget.show_types.includes(t.slug);
                    return (
                      <button key={t.slug} type="button" onClick={() => setWidget((w) => ({
                        ...w,
                        show_types: sel ? w.show_types.filter((s) => s !== t.slug) : [...w.show_types, t.slug],
                      }))} style={{
                        ...TAG,
                        background: sel ? "rgba(99,102,241,.14)" : "rgba(255,255,255,.04)",
                        borderColor: sel ? "rgba(99,102,241,.5)" : S.border,
                        color: sel ? "#a5b4fc" : S.dim,
                      }}>{t.name}</button>
                    );
                  })}
                </div>
                {widget.show_types.length === 0 && (
                  <p style={{ fontSize: 12, color: S.dim, margin: "4px 0 0" }}>All types shown when none selected.</p>
                )}
              </div>

              <div>
                <label style={{ fontSize: 12, color: S.dim, display: "block", marginBottom: 6, fontWeight: 600 }}>Sort By</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {([
                    { key: "due_date",   label: "Due Date" },
                    { key: "start_at",   label: "Start At" },
                    { key: "priority",   label: "Priority" },
                    { key: "created_at", label: "Created" },
                  ] as const).map(({ key, label }) => {
                    const sel = widget.sort_by === key;
                    return (
                      <button key={key} type="button" onClick={() => setWidget((w) => ({ ...w, sort_by: key }))} style={{
                        ...TAG,
                        background: sel ? "rgba(255,255,255,.12)" : "rgba(255,255,255,.04)",
                        borderColor: sel ? "rgba(255,255,255,.3)" : S.border,
                        color: sel ? S.text : S.dim,
                      }}>{label}</button>
                    );
                  })}
                  <div style={{ display: "flex", gap: 4, marginLeft: 8 }}>
                    {(["asc", "desc"] as const).map((dir) => {
                      const sel = widget.sort_dir === dir;
                      return (
                        <button key={dir} type="button" onClick={() => setWidget((w) => ({ ...w, sort_dir: dir }))} style={{
                          ...TAG,
                          background: sel ? "rgba(255,255,255,.12)" : "rgba(255,255,255,.04)",
                          borderColor: sel ? "rgba(255,255,255,.3)" : S.border,
                          color: sel ? S.text : S.dim,
                        }}>{dir === "asc" ? "↑ Asc" : "↓ Desc"}</button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, color: S.dim, display: "block", marginBottom: 6, fontWeight: 600 }}>Group By</label>
                <div style={{ display: "flex", gap: 6 }}>
                  {([
                    { key: "none",     label: "None" },
                    { key: "type",     label: "Type" },
                    { key: "status",   label: "Status" },
                    { key: "priority", label: "Priority" },
                  ] as const).map(({ key, label }) => {
                    const sel = widget.group_by === key;
                    return (
                      <button key={key} type="button" onClick={() => setWidget((w) => ({ ...w, group_by: key }))} style={{
                        ...TAG,
                        background: sel ? "rgba(255,255,255,.12)" : "rgba(255,255,255,.04)",
                        borderColor: sel ? "rgba(255,255,255,.3)" : S.border,
                        color: sel ? S.text : S.dim,
                      }}>{label}</button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, color: S.dim, display: "block", marginBottom: 6, fontWeight: 600 }}>Max Items</label>
                <div style={{ display: "flex", gap: 6 }}>
                  {[5, 8, 10, 15, 20].map((n) => {
                    const sel = widget.max_items === n;
                    return (
                      <button key={n} type="button" onClick={() => setWidget((w) => ({ ...w, max_items: n }))} style={{
                        ...TAG,
                        background: sel ? "rgba(255,255,255,.12)" : "rgba(255,255,255,.04)",
                        borderColor: sel ? "rgba(255,255,255,.3)" : S.border,
                        color: sel ? S.text : S.dim,
                      }}>{n}</button>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button
                  type="button"
                  onClick={saveWidget}
                  disabled={widgetSaving}
                  className="btn"
                  style={{ padding: "8px 20px", fontSize: 13, borderRadius: 8 }}
                >
                  {widgetSaving ? "Saving…" : "Save Widget Settings"}
                </button>
                {widgetSaved && <span style={{ fontSize: 12, color: "#4ade80", fontWeight: 600 }}>Saved ✓</span>}
              </div>
            </div>
          )}
        </div>

        {/* Automations card — coming soon */}
        <div style={{
          background: S.card, border: `1px solid ${S.border}`,
          borderRadius: 16, padding: 24, display: "grid", gap: 16,
          opacity: 0.7,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Automations</h2>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: S.dim }}>
                Trigger actions automatically based on item changes. Coming in the next release.
              </p>
            </div>
            <span style={{
              marginLeft: "auto", fontSize: 10, fontWeight: 800, letterSpacing: "0.1em",
              borderRadius: 6, padding: "3px 9px", flexShrink: 0,
              background: "rgba(251,191,36,.12)", color: "rgb(251 191 36)",
              border: "1px solid rgba(251,191,36,.2)",
            }}>SOON</span>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            {[
              { trigger: "Status changes to Done", action: "Notify assignees by email" },
              { trigger: "Due date is tomorrow", action: "Send reminder to owner" },
              { trigger: "Item created in type Meeting", action: "Assign to calendar automatically" },
              { trigger: "Booking confirmed", action: "Create sub-task for prep work" },
            ].map((rule, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 10,
                background: S.surface, border: `1px solid ${S.border}`,
                borderRadius: 10, padding: "10px 14px",
                opacity: 0.6,
              }}>
                <div style={{
                  fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, flexShrink: 0,
                  background: "rgba(99,102,241,.12)", color: "#a5b4fc",
                }}>WHEN</div>
                <span style={{ fontSize: 13, color: S.text, flex: 1 }}>{rule.trigger}</span>
                <div style={{
                  fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, flexShrink: 0,
                  background: "rgba(16,185,129,.12)", color: "#6ee7b7",
                }}>THEN</div>
                <span style={{ fontSize: 13, color: S.dim }}>{rule.action}</span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Type editor slide-in */}
      {editingType && (
        <TypeEditorPanel
          type={editingType}
          onClose={() => setEditingType(null)}
          onSaved={(updated) => {
            setTypes((prev) => prev.map((t) => t.id === updated.id ? updated : t));
            setEditingType(null);
          }}
        />
      )}

      {/* Booking page editor slide-in */}
      {editingBooking && (
        <BookingPagePanel
          initial={editingBooking === "new" ? null : editingBooking}
          types={types}
          onClose={() => setEditingBooking(null)}
          onSaved={(saved) => {
            setBookingTypes((prev) => {
              const exists = prev.find((b) => b.id === saved.id);
              return exists ? prev.map((b) => b.id === saved.id ? saved : b) : [...prev, saved];
            });
            setEditingBooking(null);
          }}
        />
      )}

      {/* Calendar view editor slide-in */}
      {editingCalView && (
        <CalendarViewEditor
          view={editingCalView.view}
          typeId={editingCalView.typeId}
          types={types}
          onClose={() => setEditingCalView(null)}
          onSaved={(updated) => {
            setMyCals((prev) => prev.map((cal) =>
              cal.id === editingCalView.typeId
                ? { ...cal, user_calendar_views: cal.user_calendar_views.map((v) => v.id === updated.id ? updated : v) }
                : cal
            ));
            setEditingCalView(null);
          }}
          onCreated={(created) => {
            setMyCals((prev) => prev.map((cal) =>
              cal.id === editingCalView.typeId
                ? { ...cal, user_calendar_views: [...cal.user_calendar_views, created] }
                : cal
            ));
            setEditingCalView(null);
          }}
          onDeleted={(viewId) => {
            setMyCals((prev) => prev.map((cal) =>
              cal.id === editingCalView.typeId
                ? { ...cal, user_calendar_views: cal.user_calendar_views.filter((v) => v.id !== viewId) }
                : cal
            ));
            setEditingCalView(null);
          }}
        />
      )}
    </>
  );
}
