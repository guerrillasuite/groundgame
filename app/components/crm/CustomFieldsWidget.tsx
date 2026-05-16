"use client";

import { useState, useEffect, useRef } from "react";
import type { FieldDefinition } from "@/app/crm/settings/custom-fields/CustomFieldsPanel";
import type { RecordType } from "@/lib/crm/custom-fields";

// Maps record type to its value-patch API endpoint
function patchUrl(recordType: RecordType, recordId: string): string {
  const col = recordType === "opportunities" || recordType === "sitrep_items" ? "custom-fields" : "custom-data";
  const seg = recordType === "sitrep_items" ? "sitrep/items" : recordType;
  return `/api/crm/${seg}/${recordId}/${col}`;
}

const INPUT: React.CSSProperties = {
  padding: "6px 10px",
  fontSize: 13,
  borderRadius: 7,
  border: "1px solid rgba(255,255,255,.15)",
  background: "rgba(255,255,255,.05)",
  color: "inherit",
  width: "100%",
  boxSizing: "border-box",
};

const LABEL: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  opacity: 0.45,
  marginBottom: 4,
  display: "block",
};

function FieldInput({
  def,
  value,
  onChange,
  onBlur,
}: {
  def: FieldDefinition;
  value: unknown;
  onChange: (v: unknown) => void;
  onBlur: () => void;
}) {
  const str = value != null ? String(value) : "";

  if (def.field_type === "boolean") {
    return (
      <button
        onClick={() => { onChange(!value); setTimeout(onBlur, 0); }}
        style={{
          width: 40, height: 22, borderRadius: 11, border: "none", cursor: "pointer",
          background: value ? "var(--gg-primary,#2563eb)" : "rgba(255,255,255,.15)",
          position: "relative", transition: "background .2s", flexShrink: 0,
        }}
      >
        <span style={{
          position: "absolute", top: 3, left: value ? 21 : 3,
          width: 16, height: 16, borderRadius: "50%",
          background: "#fff", transition: "left .2s",
        }} />
      </button>
    );
  }

  if (def.field_type === "select") {
    return (
      <select
        style={INPUT}
        value={str}
        onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
      >
        <option value="">— Select —</option>
        {(def.options ?? []).map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    );
  }

  if (def.field_type === "multiselect") {
    const selected: string[] = Array.isArray(value) ? value as string[] : (str ? str.split(",") : []);
    function toggle(v: string) {
      const next = selected.includes(v) ? selected.filter(s => s !== v) : [...selected, v];
      onChange(next);
      setTimeout(onBlur, 0);
    }
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {(def.options ?? []).map(opt => (
          <button
            key={opt.value}
            onClick={() => toggle(opt.value)}
            style={{
              padding: "4px 10px", fontSize: 12, borderRadius: 5, cursor: "pointer",
              border: "none",
              background: selected.includes(opt.value) ? "var(--gg-primary,#2563eb)" : "rgba(255,255,255,.08)",
              color: "inherit",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    );
  }

  if (def.field_type === "textarea") {
    return (
      <textarea
        style={{ ...INPUT, minHeight: 64, resize: "vertical" }}
        value={str}
        onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={def.placeholder ?? ""}
      />
    );
  }

  const inputType =
    def.field_type === "number" ? "number" :
    def.field_type === "date"   ? "date"   :
    def.field_type === "email"  ? "email"  :
    def.field_type === "phone"  ? "tel"    :
    def.field_type === "url"    ? "url"    : "text";

  return (
    <input
      style={INPUT}
      type={inputType}
      value={str}
      onChange={e => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={def.placeholder ?? ""}
    />
  );
}

// ── Main widget ───────────────────────────────────────────────────────────────

export default function CustomFieldsWidget({
  recordType,
  recordId,
  pipelineTypeKey,
  sitrepTypeId,
  initialValues,
}: {
  recordType: RecordType;
  recordId: string;
  pipelineTypeKey?: string | null;
  sitrepTypeId?: string | null;
  initialValues?: Record<string, unknown> | null;
}) {
  const [defs, setDefs]     = useState<FieldDefinition[]>([]);
  const [values, setValues] = useState<Record<string, unknown>>(initialValues ?? {});
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved]   = useState<string | null>(null);
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const params = new URLSearchParams({ record_type: recordType });
    if (pipelineTypeKey) params.set("pipeline_type_key", pipelineTypeKey);
    if (sitrepTypeId)    params.set("sitrep_type_id", sitrepTypeId);
    fetch(`/api/crm/custom-fields?${params}`)
      .then(r => r.json())
      .then(d => setDefs(d.definitions ?? []))
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordType, recordId, pipelineTypeKey, sitrepTypeId]);

  function handleChange(key: string, val: unknown) {
    setValues(prev => ({ ...prev, [key]: val }));
  }

  function handleBlur(key: string) {
    clearTimeout(saveTimers.current[key]);
    saveTimers.current[key] = setTimeout(async () => {
      setSaving(key);
      const url = patchUrl(recordType, recordId);
      await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: values[key] ?? null }),
      });
      setSaving(null);
      setSaved(key);
      setTimeout(() => setSaved(k => k === key ? null : k), 1500);
    }, 300);
  }

  if (defs.length === 0) return null;

  return (
    <div style={{
      background: "rgba(255,255,255,.03)",
      border: "1px solid rgba(255,255,255,.08)",
      borderRadius: 10,
      padding: "16px 18px",
    }}>
      <span style={{ fontWeight: 700, fontSize: 15, display: "block", marginBottom: 14 }}>Custom Fields</span>
      <div style={{ display: "grid", gap: 14 }}>
        {defs.map(def => (
          <div key={def.id}>
            <label style={LABEL}>
              {def.label}
              {def.required && <span style={{ marginLeft: 4, color: "#f87171" }}>*</span>}
              {saving === def.field_key && <span style={{ marginLeft: 8, opacity: 0.4 }}>saving…</span>}
              {saved  === def.field_key && <span style={{ marginLeft: 8, color: "#4ade80" }}>saved</span>}
            </label>
            {def.help_text && (
              <p style={{ fontSize: 11, opacity: 0.4, margin: "0 0 4px" }}>{def.help_text}</p>
            )}
            <FieldInput
              def={def}
              value={values[def.field_key]}
              onChange={v => handleChange(def.field_key, v)}
              onBlur={() => handleBlur(def.field_key)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
