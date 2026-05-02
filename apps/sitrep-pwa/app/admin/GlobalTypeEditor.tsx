"use client";

import { useState } from "react";
import { COLOR_FAMILIES } from "@/lib/sitrep-colors";

const S = {
  card:   "rgb(20 25 38)",
  border: "rgba(255,255,255,.07)",
  text:   "rgb(236 240 245)",
  dim:    "rgb(100 116 139)",
} as const;

const inputStyle: React.CSSProperties = {
  padding: "8px 11px", borderRadius: 8,
  background: "rgba(255,255,255,.05)",
  border: "1px solid rgba(255,255,255,.1)",
  color: S.text, fontSize: 13, outline: "none",
};

export type GlobalTemplate = {
  id: string;
  name: string;
  slug: string;
  color: string;
  icon: string | null;
  is_mission_type: boolean;
  show_in_kanban: boolean;
  booking_enabled: boolean;
  stages: any[];
  sort_order: number;
  is_active: boolean;
};

interface Props {
  template: GlobalTemplate;
  onSaved: (updated: GlobalTemplate) => void;
  onCancel: () => void;
}

export default function GlobalTypeEditor({ template, onSaved, onCancel }: Props) {
  const [name, setName]               = useState(template.name);
  const [color, setColor]             = useState(template.color);
  const [icon, setIcon]               = useState(template.icon ?? "");
  const [isMission, setIsMission]     = useState(template.is_mission_type);
  const [showKanban, setShowKanban]   = useState(template.show_in_kanban);
  const [booking, setBooking]         = useState(template.booking_enabled);
  const [isActive, setIsActive]       = useState(template.is_active);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState("");

  const family = COLOR_FAMILIES.find((f) => f.key === color);
  const accent = family?.shades[2] ?? "#3b82f6";

  async function handleSave() {
    if (!name.trim()) { setError("Name is required"); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/global-types/${template.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), color, icon: icon || null, is_mission_type: isMission, show_in_kanban: showKanban, booking_enabled: booking, is_active: isActive }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? "Save failed"); setSaving(false); return; }
      const updated = await res.json();
      onSaved(updated);
    } catch { setError("Network error"); }
    setSaving(false);
  }

  function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
    return (
      <div onClick={onToggle} style={{
        width: 38, height: 21, borderRadius: 11, position: "relative", flexShrink: 0, cursor: "pointer",
        background: on ? "var(--gg-primary,#2563eb)" : "rgba(255,255,255,.12)",
        transition: "background .2s",
      }}>
        <div style={{
          position: "absolute", top: 2, left: on ? 19 : 2, width: 17, height: 17, borderRadius: "50%",
          background: "#fff", transition: "left .2s",
        }} />
      </div>
    );
  }

  return (
    <div style={{
      background: S.card, border: `1px solid ${S.border}`,
      borderLeft: `3px solid ${accent}`,
      borderRadius: 12, padding: 20,
      display: "flex", flexDirection: "column", gap: 14,
    }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: S.dim, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} style={{ ...inputStyle, width: "100%" }} />
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: S.dim, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>Icon (emoji)</label>
          <input type="text" value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="📋" style={{ ...inputStyle, width: "100%" }} />
        </div>
      </div>

      {/* Color picker */}
      <div>
        <label style={{ fontSize: 11, fontWeight: 700, color: S.dim, display: "block", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Color</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {COLOR_FAMILIES.map((f) => (
            <button
              key={f.key}
              onClick={() => setColor(f.key)}
              title={f.name}
              style={{
                width: 28, height: 28, borderRadius: "50%", border: "none", cursor: "pointer",
                background: f.shades[2],
                outline: color === f.key ? `3px solid ${f.shades[2]}` : "none",
                outlineOffset: 2,
              }}
            />
          ))}
        </div>
      </div>

      {/* Toggles */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {[
          { label: "Mission type", value: isMission, toggle: () => setIsMission(!isMission) },
          { label: "Show in kanban", value: showKanban, toggle: () => setShowKanban(!showKanban) },
          { label: "Booking enabled", value: booking, toggle: () => setBooking(!booking) },
          { label: "Active (seeded to new tenants)", value: isActive, toggle: () => setIsActive(!isActive) },
        ].map(({ label, value, toggle }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, color: S.text }}>{label}</span>
            <Toggle on={value} onToggle={toggle} />
          </div>
        ))}
      </div>

      {error && <div style={{ fontSize: 12, color: "#fca5a5" }}>{error}</div>}

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onCancel} style={{
          flex: 1, padding: "9px 0", borderRadius: 8,
          border: `1px solid ${S.border}`, background: "rgba(255,255,255,.04)",
          color: S.dim, fontSize: 13, fontWeight: 600, cursor: "pointer",
        }}>Cancel</button>
        <button onClick={handleSave} disabled={saving} style={{
          flex: 2, padding: "9px 0", borderRadius: 8, border: "none",
          background: "var(--gg-primary,#2563eb)", color: "#fff",
          fontSize: 13, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer",
          opacity: saving ? 0.7 : 1,
        }}>{saving ? "Saving…" : "Save"}</button>
      </div>
    </div>
  );
}
