"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_DISPO_CONFIG,
  resolveDispoConfig,
  type DispoItem,
  type DispositionConfig,
} from "@/lib/dispositionConfig";

// ── Styles (matches StagesClient pattern) ────────────────────────────────────

const card: React.CSSProperties = {
  background: "rgba(255,255,255,.04)",
  border: "1px solid rgba(255,255,255,.08)",
  borderRadius: 10,
  padding: "14px 16px",
  color: "rgb(238 242 246)",
};

const INPUT: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,.12)",
  background: "rgba(255,255,255,.05)",
  color: "var(--brand-text, #fff)",
  fontSize: 13,
  boxSizing: "border-box",
};

function btn(color: string, extra?: React.CSSProperties): React.CSSProperties {
  return {
    padding: "7px 14px", borderRadius: 8, border: "none",
    background: color, color: "#fff", fontWeight: 600,
    fontSize: 13, cursor: "pointer", ...extra,
  };
}

// ── Row component ─────────────────────────────────────────────────────────────

function DispoRow({
  item,
  onChange,
}: {
  item: DispoItem;
  onChange: (updated: DispoItem) => void;
}) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "28px 1fr 120px 80px",
      alignItems: "center",
      gap: 10,
      padding: "8px 0",
      borderBottom: "1px solid rgba(255,255,255,.06)",
    }}>
      {/* Color swatch + picker */}
      <div style={{ position: "relative", width: 28, height: 28 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 6,
          background: item.color,
          border: "2px solid rgba(255,255,255,.2)",
          cursor: "pointer",
        }} />
        <input
          type="color"
          value={item.color}
          onChange={(e) => onChange({ ...item, color: e.target.value })}
          style={{
            position: "absolute", inset: 0,
            opacity: 0, width: "100%", height: "100%",
            cursor: "pointer",
          }}
          title="Pick color"
        />
      </div>

      {/* Label */}
      <input
        style={INPUT}
        value={item.label}
        onChange={(e) => onChange({ ...item, label: e.target.value })}
        placeholder={item.key}
      />

      {/* Key badge (read-only) */}
      <span style={{
        fontFamily: "monospace", fontSize: 11,
        opacity: 0.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {item.key}
      </span>

      {/* Enabled toggle */}
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer", justifyContent: "flex-end" }}>
        <input
          type="checkbox"
          checked={item.enabled}
          onChange={(e) => onChange({ ...item, enabled: e.target.checked })}
          style={{ width: 15, height: 15, cursor: "pointer" }}
        />
        <span style={{ opacity: 0.7 }}>On</span>
      </label>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DispositionsClient() {
  const [config, setConfig] = useState<DispositionConfig>(DEFAULT_DISPO_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/crm/settings/dispositions")
      .then((r) => r.json())
      .then((d) => setConfig(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  function updateItem(channel: "doors" | "calls", updated: DispoItem) {
    setConfig((prev) => ({
      ...prev,
      [channel]: prev[channel].map((item) =>
        item.key === updated.key ? updated : item
      ),
    }));
  }

  function resetToDefaults() {
    setConfig(resolveDispoConfig({}));
  }

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/crm/settings/dispositions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div style={{ padding: 24, opacity: 0.5 }}>Loading…</div>;
  }

  const headerRow: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "28px 1fr 120px 80px",
    gap: 10,
    padding: "0 0 8px",
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    opacity: 0.45,
  };

  return (
    <div style={{ padding: "24px 28px", maxWidth: 640 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Disposition Colors</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {saved && <span style={{ color: "#86efac", fontSize: 13 }}>Saved ✓</span>}
          {err && <span style={{ color: "#f87171", fontSize: 13 }}>{err}</span>}
          <button style={btn("rgba(255,255,255,.12)")} onClick={resetToDefaults}>
            Reset to Defaults
          </button>
          <button style={btn("#2563eb")} onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <p style={{ fontSize: 13, opacity: 0.55, marginBottom: 24 }}>
        Choose a color for each disposition result and toggle which ones appear in the field app forms.
      </p>

      {/* Door Dispositions */}
      <div style={{ ...card, marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Door Dispositions</div>
        <div style={headerRow}>
          <span />
          <span>Label</span>
          <span>Key</span>
          <span style={{ textAlign: "right" }}>Enabled</span>
        </div>
        {config.doors.map((item) => (
          <DispoRow
            key={item.key}
            item={item}
            onChange={(updated) => updateItem("doors", updated)}
          />
        ))}
      </div>

      {/* Call Dispositions */}
      <div style={card}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Call Dispositions</div>
        <div style={headerRow}>
          <span />
          <span>Label</span>
          <span>Key</span>
          <span style={{ textAlign: "right" }}>Enabled</span>
        </div>
        {config.calls.map((item) => (
          <DispoRow
            key={item.key}
            item={item}
            onChange={(updated) => updateItem("calls", updated)}
          />
        ))}
      </div>
    </div>
  );
}
