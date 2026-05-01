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

// ── Style constants ───────────────────────────────────────────────────────────

const S = {
  surface: "rgb(18 23 33)",
  card:    "rgb(28 36 48)",
  border:  "rgb(43 53 67)",
  text:    "rgb(238 242 246)",
  dim:     "rgb(160 174 192)",
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

// ── Main Panel ────────────────────────────────────────────────────────────────

export default function SitRepSettingsPanel() {
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

        {/* Item Types card */}
        <div style={{
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
        </div>

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

        {/* Public Calendars card */}
        <div style={{
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
        </div>

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
    </>
  );
}
