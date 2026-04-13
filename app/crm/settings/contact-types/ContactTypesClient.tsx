"use client";

import { useEffect, useState, useCallback } from "react";
import { STAGE_PRESETS, StagePreset, StageDefinition } from "@/lib/opportunityPresets";

type Stage = { key: string; label: string; order_index: number };
type ContactType = { key: string; label: string; order_index: number; stages: Stage[] };

// ── Styles ────────────────────────────────────────────────────────────────────

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
    padding: "7px 14px",
    borderRadius: 8,
    border: "none",
    background: color,
    color: "#fff",
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
    ...extra,
  };
}

// ── Slug helper ───────────────────────────────────────────────────────────────

function slugify(label: string, suffix: number | string): string {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "type";
  return `${base}_${suffix}`;
}

function slugifyStage(label: string, suffix: number): string {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "stage";
  return `${base}_${suffix}`;
}

// ── Inline stage editor ───────────────────────────────────────────────────────

function StageEditor({
  stages,
  onChange,
}: {
  stages: Stage[];
  onChange: (stages: Stage[]) => void;
}) {
  function reorder(idx: number, dir: -1 | 1) {
    const ni = idx + dir;
    if (ni < 0 || ni >= stages.length) return;
    const next = [...stages];
    [next[idx], next[ni]] = [next[ni], next[idx]];
    onChange(next.map((s, i) => ({ ...s, order_index: i })));
  }

  function changeLabel(idx: number, label: string) {
    onChange(stages.map((s, i) => (i === idx ? { ...s, label } : s)));
  }

  function del(idx: number) {
    if (stages.length <= 1) return;
    onChange(stages.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order_index: i })));
  }

  function add() {
    const label = "New Stage";
    onChange([...stages, { key: slugifyStage(label, stages.length), label, order_index: stages.length }]);
  }

  return (
    <div style={{ display: "grid", gap: 5, marginTop: 10 }}>
      {/* Preset picker */}
      <div style={{ marginBottom: 6 }}>
        <span style={{ fontSize: 11, opacity: 0.5, marginRight: 8 }}>Apply preset:</span>
        <div style={{ display: "inline-flex", flexWrap: "wrap", gap: 4 }}>
          {STAGE_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => onChange(p.stages.map((s, i) => ({ ...s, order_index: i })))}
              style={{
                fontSize: 11, padding: "2px 8px", borderRadius: 4,
                border: "1px solid rgba(255,255,255,.18)",
                background: "rgba(255,255,255,.06)", color: "rgba(255,255,255,.7)",
                cursor: "pointer",
              }}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {stages.map((s, idx) => (
        <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 1, flexShrink: 0 }}>
            <button
              onClick={() => reorder(idx, -1)} disabled={idx === 0}
              style={{ background: "none", border: "none", cursor: idx === 0 ? "default" : "pointer", opacity: idx === 0 ? 0.2 : 0.5, fontSize: 10, padding: "1px 3px", color: "#fff", lineHeight: 1 }}
            >▲</button>
            <button
              onClick={() => reorder(idx, 1)} disabled={idx === stages.length - 1}
              style={{ background: "none", border: "none", cursor: idx === stages.length - 1 ? "default" : "pointer", opacity: idx === stages.length - 1 ? 0.2 : 0.5, fontSize: 10, padding: "1px 3px", color: "#fff", lineHeight: 1 }}
            >▼</button>
          </div>
          <input
            type="text" value={s.label}
            onChange={(e) => changeLabel(idx, e.target.value)}
            style={{ ...INPUT, flex: 1, padding: "6px 8px" }}
          />
          <span style={{ fontSize: 10, opacity: 0.25, fontFamily: "monospace", flexShrink: 0 }}>{s.key}</span>
          <button
            onClick={() => del(idx)} disabled={stages.length <= 1}
            style={{ background: "none", border: "none", cursor: stages.length <= 1 ? "default" : "pointer", opacity: stages.length <= 1 ? 0.2 : 0.5, color: "#f87171", fontSize: 15, padding: "0 3px", flexShrink: 0 }}
          >×</button>
        </div>
      ))}

      <button
        onClick={add}
        style={{ ...card, padding: "7px 12px", cursor: "pointer", border: "1px dashed rgba(255,255,255,.15)", background: "transparent", color: "rgba(255,255,255,.45)", fontSize: 12, textAlign: "left" }}
      >
        + Add Stage
      </button>
    </div>
  );
}

// ── Contact type row ──────────────────────────────────────────────────────────

function ContactTypeRow({
  ct,
  idx,
  total,
  onChange,
  onReorder,
  onDelete,
}: {
  ct: ContactType;
  idx: number;
  total: number;
  onChange: (ct: ContactType) => void;
  onReorder: (idx: number, dir: -1 | 1) => void;
  onDelete: (idx: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{ ...card, padding: "12px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {/* Reorder */}
        <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
          <button onClick={() => onReorder(idx, -1)} disabled={idx === 0} style={{ background: "none", border: "none", cursor: idx === 0 ? "default" : "pointer", opacity: idx === 0 ? 0.2 : 0.6, fontSize: 11, padding: "1px 4px", color: "#fff", lineHeight: 1 }}>▲</button>
          <button onClick={() => onReorder(idx, 1)} disabled={idx === total - 1} style={{ background: "none", border: "none", cursor: idx === total - 1 ? "default" : "pointer", opacity: idx === total - 1 ? 0.2 : 0.6, fontSize: 11, padding: "1px 4px", color: "#fff", lineHeight: 1 }}>▼</button>
        </div>

        {/* Label */}
        <input
          type="text"
          value={ct.label}
          onChange={(e) => onChange({ ...ct, label: e.target.value })}
          placeholder="Type label (e.g. Donor)"
          style={{ ...INPUT, flex: 1 }}
        />

        {/* Key */}
        <span style={{ fontSize: 10, opacity: 0.3, fontFamily: "monospace", flexShrink: 0 }}>{ct.key}</span>

        {/* Stage count summary */}
        <span style={{ fontSize: 11, opacity: 0.45, flexShrink: 0, whiteSpace: "nowrap" }}>
          {ct.stages.length} stage{ct.stages.length !== 1 ? "s" : ""}
        </span>

        {/* Expand/collapse stages */}
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{ background: "none", border: "1px solid rgba(255,255,255,.15)", borderRadius: 6, cursor: "pointer", color: "rgba(255,255,255,.6)", fontSize: 11, padding: "3px 8px", flexShrink: 0 }}
        >
          {expanded ? "▲ Stages" : "▼ Stages"}
        </button>

        {/* Delete */}
        <button
          onClick={() => onDelete(idx)}
          style={{ background: "none", border: "none", cursor: "pointer", opacity: 0.5, color: "#f87171", fontSize: 18, padding: "0 4px", flexShrink: 0 }}
          title="Remove contact type"
        >×</button>
      </div>

      {expanded && (
        <StageEditor
          stages={ct.stages}
          onChange={(stages) => onChange({ ...ct, stages })}
        />
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ContactTypesClient() {
  const [types, setTypes] = useState<ContactType[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchTypes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/crm/settings/contact-types");
      if (res.ok) setTypes(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTypes(); }, [fetchTypes]);

  function handleChange(idx: number, ct: ContactType) {
    setTypes((prev) => prev.map((t, i) => (i === idx ? ct : t)));
  }

  function handleReorder(idx: number, dir: -1 | 1) {
    const ni = idx + dir;
    if (ni < 0 || ni >= types.length) return;
    const next = [...types];
    [next[idx], next[ni]] = [next[ni], next[idx]];
    setTypes(next.map((t, i) => ({ ...t, order_index: i })));
  }

  function handleDelete(idx: number) {
    setTypes((prev) => prev.filter((_, i) => i !== idx).map((t, i) => ({ ...t, order_index: i })));
  }

  function handleAdd() {
    const label = "New Type";
    const key = slugify(label, types.length);
    setTypes((prev) => [
      ...prev,
      { key, label, order_index: prev.length, stages: [] },
    ]);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/crm/settings/contact-types", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactTypes: types.map((t, i) => ({
            ...t,
            order_index: i,
            stages: t.stages.map((s, j) => ({ ...s, order_index: j })),
          })),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Failed to save");
      }
      setSuccessMsg("Saved");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (e: any) {
      setError(e.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section style={{ padding: 16, maxWidth: 760, margin: "0 auto", color: "rgb(238 242 246)" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Pipelines</h1>
      <p style={{ margin: "0 0 20px", fontSize: 13, opacity: 0.7 }}>
        Each pipeline represents a category of contact — e.g. Customer, Donor, Volunteer. Opportunities are assigned to a pipeline based on who they are linked to. Each pipeline has its own set of stages that track where an opportunity is in that process.
      </p>

      {loading ? (
        <p style={{ opacity: 0.4, fontSize: 13 }}>Loading…</p>
      ) : (
        <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
          {types.length === 0 && (
            <p style={{ opacity: 0.4, fontSize: 13 }}>No pipelines configured yet. Add one below.</p>
          )}
          {types.map((ct, idx) => (
            <ContactTypeRow
              key={ct.key}
              ct={ct}
              idx={idx}
              total={types.length}
              onChange={(updated) => handleChange(idx, updated)}
              onReorder={handleReorder}
              onDelete={handleDelete}
            />
          ))}
          <button
            onClick={handleAdd}
            style={{ ...card, padding: "10px 14px", cursor: "pointer", border: "1px dashed rgba(255,255,255,.15)", background: "transparent", color: "rgba(255,255,255,.5)", fontSize: 13, textAlign: "left" }}
          >
            + Add Pipeline
          </button>
        </div>
      )}

      {error && <p style={{ color: "#f87171", fontSize: 13, marginBottom: 12 }}>{error}</p>}
      {successMsg && <p style={{ color: "#86efac", fontSize: 13, marginBottom: 12 }}>{successMsg}</p>}

      <button
        onClick={handleSave}
        disabled={saving || loading}
        style={btn("var(--gg-primary, #2563eb)", { opacity: saving || loading ? 0.6 : 1 })}
      >
        {saving ? "Saving…" : "Save Pipelines"}
      </button>
    </section>
  );
}
