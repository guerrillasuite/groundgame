"use client";

import { useEffect, useState } from "react";
import { STANDARD_FIELDS, type RecordType } from "@/lib/crm/standard-field-overrides";

type Override = { field_key: string; custom_label: string };

const INPUT: React.CSSProperties = {
  fontSize: 13, fontWeight: 600,
  background: "rgba(255,255,255,.08)",
  border: "1px solid rgba(255,255,255,.2)",
  borderRadius: 5, padding: "2px 6px",
  color: "inherit", width: "100%", boxSizing: "border-box",
};

const ROW: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 10,
  padding: "7px 0",
  borderTop: "1px solid rgba(255,255,255,.05)",
};

const BADGE: React.CSSProperties = {
  fontSize: 10, padding: "2px 6px", borderRadius: 4,
  background: "rgba(255,255,255,.08)", opacity: 0.7,
  fontFamily: "monospace", flexShrink: 0,
};

function ghostBtn(extra?: React.CSSProperties): React.CSSProperties {
  return {
    padding: "4px 10px", fontSize: 11, fontWeight: 600,
    borderRadius: 6, border: "none", cursor: "pointer",
    background: "rgba(255,255,255,.08)", color: "inherit",
    flexShrink: 0, ...extra,
  };
}

function FieldRow({
  recordType, scopeKey, field, customLabel, onUpdate,
}: {
  recordType: RecordType;
  scopeKey: string;
  field: { key: string; defaultLabel: string };
  customLabel: string | null;
  onUpdate: (fieldKey: string, newLabel: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(customLabel ?? field.defaultLabel);
  const [saving, setSaving] = useState(false);

  async function commit() {
    const trimmed = value.trim();
    if (!trimmed) { cancel(); return; }
    if (trimmed === (customLabel ?? field.defaultLabel)) { setEditing(false); return; }
    setSaving(true);
    if (trimmed === field.defaultLabel) {
      await fetch("/api/crm/standard-field-overrides", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ record_type: recordType, field_key: field.key, scope_key: scopeKey }),
      });
      onUpdate(field.key, null);
    } else {
      await fetch("/api/crm/standard-field-overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ record_type: recordType, field_key: field.key, scope_key: scopeKey, custom_label: trimmed }),
      });
      onUpdate(field.key, trimmed);
    }
    setSaving(false);
    setEditing(false);
  }

  function cancel() {
    setValue(customLabel ?? field.defaultLabel);
    setEditing(false);
  }

  const isOverridden = customLabel !== null;

  return (
    <div style={ROW}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <input
            autoFocus value={value} disabled={saving}
            onChange={e => setValue(e.target.value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commit(); } if (e.key === "Escape") cancel(); }}
            style={INPUT}
          />
        ) : (
          <span
            style={{ fontSize: 13, fontWeight: 600, cursor: "text" }}
            title="Click to rename"
            onClick={() => { setValue(customLabel ?? field.defaultLabel); setEditing(true); }}
          >
            {customLabel ?? field.defaultLabel}
          </span>
        )}
        {isOverridden && !editing && (
          <span style={{ marginLeft: 8, fontSize: 11, opacity: 0.4 }}>
            (default: {field.defaultLabel})
          </span>
        )}
      </div>
      <span style={BADGE}>{field.key}</span>
      {isOverridden && !editing && (
        <button
          style={ghostBtn({ opacity: 0.45 })}
          onClick={async () => {
            await fetch("/api/crm/standard-field-overrides", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ record_type: recordType, field_key: field.key, scope_key: scopeKey }),
            });
            onUpdate(field.key, null);
            setValue(field.defaultLabel);
          }}
        >
          Reset
        </button>
      )}
    </div>
  );
}

export default function StandardFieldLabels({
  recordType,
  scopeKey = "",
  borderColor,
  dimColor,
}: {
  recordType: RecordType;
  scopeKey?: string;
  borderColor?: string;
  dimColor?: string;
}) {
  const [overrideMap, setOverrideMap] = useState<Map<string, string>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const allFields = STANDARD_FIELDS[recordType] ?? [];
  const coreFields     = allFields.filter(f => !f.advanced);
  const advancedFields = allFields.filter(f => f.advanced);

  useEffect(() => {
    const params = new URLSearchParams({ record_type: recordType, scope_key: scopeKey });
    fetch(`/api/crm/standard-field-overrides?${params}`)
      .then(r => r.json())
      .then((data: Override[]) => {
        setOverrideMap(new Map(data.map(o => [o.field_key, o.custom_label])));
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [recordType, scopeKey]);

  function handleUpdate(fieldKey: string, newLabel: string | null) {
    setOverrideMap(prev => {
      const next = new Map(prev);
      if (newLabel === null) next.delete(fieldKey);
      else next.set(fieldKey, newLabel);
      return next;
    });
  }

  if (allFields.length === 0) return null;

  const sectionStyle: React.CSSProperties = {
    borderTop: `1px solid ${borderColor ?? "rgba(255,255,255,.08)"}`,
    paddingTop: 14,
    marginTop: 4,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 10, fontWeight: 800, letterSpacing: "0.08em",
    textTransform: "uppercase", color: dimColor ?? "rgba(255,255,255,.45)",
    marginBottom: 2,
  };

  return (
    <div style={sectionStyle}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
        <div style={labelStyle}>Field Labels</div>
        <span style={{ fontSize: 11, opacity: 0.35 }}>Click a name to rename</span>
      </div>
      <p style={{ fontSize: 12, opacity: 0.4, margin: "0 0 6px" }}>
        Override what these fields are called in your org.
      </p>

      {!loaded ? (
        <div style={{ fontSize: 12, opacity: 0.4, padding: "6px 0" }}>Loading…</div>
      ) : (
        <>
          {coreFields.map(f => (
            <FieldRow key={f.key} recordType={recordType} scopeKey={scopeKey}
              field={f} customLabel={overrideMap.get(f.key) ?? null} onUpdate={handleUpdate} />
          ))}

          {advancedFields.length > 0 && (
            <>
              <button
                style={ghostBtn({ fontSize: 11, opacity: 0.45, marginTop: 8, padding: "3px 8px" })}
                onClick={() => setShowAdvanced(v => !v)}
              >
                {showAdvanced ? "▲ Hide" : "▼ Show"} {advancedFields.length} advanced fields
              </button>
              {showAdvanced && advancedFields.map(f => (
                <FieldRow key={f.key} recordType={recordType} scopeKey={scopeKey}
                  field={f} customLabel={overrideMap.get(f.key) ?? null} onUpdate={handleUpdate} />
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}
