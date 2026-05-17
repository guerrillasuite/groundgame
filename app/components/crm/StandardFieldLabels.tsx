"use client";

import { useEffect, useState } from "react";
import { STANDARD_FIELDS, type RecordType } from "@/lib/crm/standard-field-overrides";

type Override = { field_key: string; custom_label: string | null; hidden?: boolean; sort_order?: number };

const INPUT: React.CSSProperties = {
  fontSize: 13, fontWeight: 600,
  background: "rgba(255,255,255,.08)",
  border: "1px solid rgba(255,255,255,.2)",
  borderRadius: 5, padding: "2px 6px",
  color: "inherit", width: "100%", boxSizing: "border-box",
};

const ROW: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 8,
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

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

function FieldRow({
  recordType, scopeKey, field, customLabel, hidden, onUpdate, onToggleHidden,
}: {
  recordType: RecordType;
  scopeKey: string;
  field: { key: string; defaultLabel: string };
  customLabel: string | null;
  hidden: boolean;
  onUpdate: (fieldKey: string, newLabel: string | null) => void;
  onToggleHidden: (fieldKey: string, hidden: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(customLabel ?? field.defaultLabel);
  const [saving, setSaving] = useState(false);

  async function commit() {
    const trimmed = value.trim();
    if (!trimmed) { cancel(); return; }
    if (trimmed === (customLabel ?? field.defaultLabel)) { setEditing(false); return; }
    setSaving(true);
    if (trimmed === field.defaultLabel && !hidden) {
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

  async function handleToggleHidden() {
    const newHidden = !hidden;
    // If toggling visible and there's no custom label, delete the row entirely
    if (!newHidden && !customLabel) {
      await fetch("/api/crm/standard-field-overrides", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ record_type: recordType, field_key: field.key, scope_key: scopeKey }),
      });
    } else {
      await fetch("/api/crm/standard-field-overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ record_type: recordType, field_key: field.key, scope_key: scopeKey, hidden: newHidden }),
      });
    }
    onToggleHidden(field.key, newHidden);
  }

  const isOverridden = customLabel !== null;

  return (
    <div style={{ ...ROW, opacity: hidden ? 0.45 : 1 }}>
      {/* Eye toggle */}
      <button
        onClick={handleToggleHidden}
        title={hidden ? "Show this field" : "Hide this field"}
        style={{
          background: "none", border: "none", cursor: "pointer", padding: "2px 3px",
          color: hidden ? "rgba(255,255,255,.3)" : "rgba(255,255,255,.6)",
          flexShrink: 0, display: "flex", alignItems: "center",
          transition: "color .15s",
        }}
      >
        <EyeIcon open={!hidden} />
      </button>

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
            style={{ fontSize: 13, fontWeight: 600, cursor: "text", textDecoration: hidden ? "line-through" : "none" }}
            title="Click to rename"
            onClick={() => { if (!hidden) { setValue(customLabel ?? field.defaultLabel); setEditing(true); } }}
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
            if (!hidden) {
              await fetch("/api/crm/standard-field-overrides", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ record_type: recordType, field_key: field.key, scope_key: scopeKey }),
              });
              onUpdate(field.key, null);
              setValue(field.defaultLabel);
            } else {
              // Keep the hidden state, just clear the label
              await fetch("/api/crm/standard-field-overrides", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ record_type: recordType, field_key: field.key, scope_key: scopeKey, custom_label: null }),
              });
              onUpdate(field.key, null);
              setValue(field.defaultLabel);
            }
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
  const [hiddenSet, setHiddenSet] = useState<Set<string>>(new Set());
  const [sortOrderMap, setSortOrderMap] = useState<Map<string, number>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const allFields = STANDARD_FIELDS[recordType] ?? [];
  const advancedFields = allFields.filter(f => f.advanced);

  useEffect(() => {
    const params = new URLSearchParams({ record_type: recordType, scope_key: scopeKey });
    fetch(`/api/crm/standard-field-overrides?${params}`)
      .then(r => r.json())
      .then((data: Override[]) => {
        setOverrideMap(new Map(data.filter(o => o.custom_label).map(o => [o.field_key, o.custom_label!])));
        setHiddenSet(new Set(data.filter(o => o.hidden).map(o => o.field_key)));
        setSortOrderMap(new Map(data.filter(o => o.sort_order != null).map(o => [o.field_key, o.sort_order!])));
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [recordType, scopeKey]);

  // Core fields sorted by stored sort_order (default to index * 10)
  const coreFields = [...allFields.filter(f => !f.advanced)].sort((a, b) => {
    const ao = sortOrderMap.get(a.key) ?? (allFields.findIndex(f => f.key === a.key) * 10);
    const bo = sortOrderMap.get(b.key) ?? (allFields.findIndex(f => f.key === b.key) * 10);
    return ao - bo;
  });

  async function reorderField(fieldKey: string, dir: -1 | 1) {
    const idx = coreFields.findIndex(f => f.key === fieldKey);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= coreFields.length) return;
    const thisKey = coreFields[idx].key;
    const thatKey = coreFields[swapIdx].key;
    const thisOrd = sortOrderMap.get(thisKey) ?? idx * 10;
    const thatOrd = sortOrderMap.get(thatKey) ?? swapIdx * 10;
    // Swap the sort_orders
    setSortOrderMap(prev => { const n = new Map(prev); n.set(thisKey, thatOrd); n.set(thatKey, thisOrd); return n; });
    await Promise.all([
      fetch("/api/crm/standard-field-overrides", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ record_type: recordType, field_key: thisKey, scope_key: scopeKey, sort_order: thatOrd }) }),
      fetch("/api/crm/standard-field-overrides", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ record_type: recordType, field_key: thatKey, scope_key: scopeKey, sort_order: thisOrd }) }),
    ]);
  }

  function handleUpdate(fieldKey: string, newLabel: string | null) {
    setOverrideMap(prev => {
      const next = new Map(prev);
      if (newLabel === null) next.delete(fieldKey);
      else next.set(fieldKey, newLabel);
      return next;
    });
  }

  function handleToggleHidden(fieldKey: string, newHidden: boolean) {
    setHiddenSet(prev => {
      const next = new Set(prev);
      if (newHidden) next.add(fieldKey);
      else next.delete(fieldKey);
      return next;
    });
  }

  if (allFields.length === 0) return null;

  const hiddenCount = [...allFields].filter(f => hiddenSet.has(f.key)).length;

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
        <div style={labelStyle}>
          Field Labels &amp; Order
          {hiddenCount > 0 && (
            <span style={{ marginLeft: 8, fontSize: 10, opacity: 0.5, fontWeight: 400, textTransform: "none" }}>
              ({hiddenCount} hidden)
            </span>
          )}
        </div>
        <span style={{ fontSize: 11, opacity: 0.35 }}>↑/↓ reorder · eye to hide · click name to rename</span>
      </div>
      <p style={{ fontSize: 12, opacity: 0.4, margin: "0 0 6px" }}>
        Drag order controls which fields appear first in the detail view.
      </p>

      {!loaded ? (
        <div style={{ fontSize: 12, opacity: 0.4, padding: "6px 0" }}>Loading…</div>
      ) : (
        <>
          {coreFields.map((f, idx) => (
            <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 1, flexShrink: 0 }}>
                <button onClick={() => reorderField(f.key, -1)} disabled={idx === 0}
                  style={{ ...ghostBtn({ padding: "1px 5px", fontSize: 11, opacity: idx === 0 ? 0.2 : 0.6 }) }}>↑</button>
                <button onClick={() => reorderField(f.key, 1)} disabled={idx === coreFields.length - 1}
                  style={{ ...ghostBtn({ padding: "1px 5px", fontSize: 11, opacity: idx === coreFields.length - 1 ? 0.2 : 0.6 }) }}>↓</button>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <FieldRow recordType={recordType} scopeKey={scopeKey}
                  field={f} customLabel={overrideMap.get(f.key) ?? null}
                  hidden={hiddenSet.has(f.key)}
                  onUpdate={handleUpdate} onToggleHidden={handleToggleHidden} />
              </div>
            </div>
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
                  field={f} customLabel={overrideMap.get(f.key) ?? null}
                  hidden={hiddenSet.has(f.key)}
                  onUpdate={handleUpdate} onToggleHidden={handleToggleHidden} />
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}
