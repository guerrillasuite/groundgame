"use client";

import { useState } from "react";
import type { FieldDefinition, ContactType } from "./CustomFieldsPanel";

const FIELD_TYPES = [
  { value: "text",        label: "Text (single line)" },
  { value: "textarea",    label: "Text (paragraph)" },
  { value: "number",      label: "Number" },
  { value: "date",        label: "Date" },
  { value: "boolean",     label: "Yes / No" },
  { value: "select",      label: "Select (single choice)" },
  { value: "multiselect", label: "Multi-select" },
  { value: "email",       label: "Email" },
  { value: "phone",       label: "Phone" },
  { value: "url",         label: "URL" },
];

const INPUT: React.CSSProperties = {
  padding: "8px 10px",
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
  marginBottom: 5,
  display: "block",
};

const BTN = (v: "primary" | "ghost" | "danger" = "ghost"): React.CSSProperties => ({
  padding: "8px 16px",
  fontSize: 13,
  fontWeight: 600,
  borderRadius: 7,
  border: "none",
  cursor: "pointer",
  background: v === "primary" ? "var(--gg-primary,#2563eb)" : v === "danger" ? "#dc2626" : "rgba(255,255,255,.1)",
  color: "#fff",
});

// ── Slugify option label to a stable value ────────────────────────────────────
function slugify(s: string) {
  return s.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "").slice(0, 40) || `opt_${Date.now()}`;
}

export default function FieldDefinitionModal({
  editing,
  defaults,
  contactTypes,
  onSave,
  onClose,
}: {
  editing?: FieldDefinition;
  defaults?: Partial<FieldDefinition>;
  contactTypes: ContactType[];
  onSave: (def: FieldDefinition) => void;
  onClose: () => void;
}) {
  const isNew = !editing;
  const recordType = editing?.record_type ?? defaults?.record_type ?? "people";

  const [label, setLabel]         = useState(editing?.label ?? "");
  const [fieldType, setFieldType] = useState(editing?.field_type ?? "text");
  const [required, setRequired]   = useState(editing?.required ?? false);
  const [placeholder, setPlaceholder] = useState(editing?.placeholder ?? "");
  const [helpText, setHelpText]   = useState(editing?.help_text ?? "");
  const [options, setOptions]     = useState<{ value: string; label: string }[]>(editing?.options ?? []);
  const [optionInput, setOptionInput] = useState("");
  const [ctKeys, setCtKeys]       = useState<string[]>(
    editing?.contact_type_keys ?? defaults?.contact_type_keys ?? []
  );
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState("");

  const showOptions = fieldType === "select" || fieldType === "multiselect";
  const showCtKeys  = recordType === "people";

  function addOption() {
    const trimmed = optionInput.trim();
    if (!trimmed) return;
    setOptions(prev => [...prev, { value: slugify(trimmed), label: trimmed }]);
    setOptionInput("");
  }

  function removeOption(idx: number) {
    setOptions(prev => prev.filter((_, i) => i !== idx));
  }

  function toggleCtKey(key: string) {
    setCtKeys(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  }

  async function handleSave() {
    if (!label.trim()) { setError("Label is required"); return; }
    setSaving(true);
    setError("");

    const body: Record<string, unknown> = {
      label:             label.trim(),
      field_type:        fieldType,
      options:           showOptions ? options : [],
      contact_type_keys: showCtKeys ? ctKeys : [],
      required,
      placeholder:       placeholder.trim() || null,
      help_text:         helpText.trim() || null,
    };

    if (isNew) {
      body.record_type = recordType;
      if (defaults?.pipeline_type_key) body.pipeline_type_key = defaults.pipeline_type_key;
      if (defaults?.sitrep_type_id)    body.sitrep_type_id    = defaults.sitrep_type_id;
    }

    const url = isNew ? "/api/crm/custom-fields" : `/api/crm/custom-fields/${editing!.id}`;
    const method = isNew ? "POST" : "PATCH";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Failed to save");
      setSaving(false);
      return;
    }

    onSave(json.definition);
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,.6)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: "rgba(14,18,30,.97)",
        border: "1px solid rgba(255,255,255,.1)",
        borderRadius: 14,
        padding: 24,
        width: "100%",
        maxWidth: 520,
        maxHeight: "90vh",
        overflowY: "auto",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
            {isNew ? "Add Custom Field" : "Edit Custom Field"}
          </h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "inherit", fontSize: 20, cursor: "pointer", opacity: 0.5 }}>×</button>
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          {/* Label */}
          <div>
            <label style={LABEL}>Label *</label>
            <input
              style={INPUT}
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="e.g. Ask Amount"
              autoFocus
            />
          </div>

          {/* Field type */}
          <div>
            <label style={LABEL}>Field Type *</label>
            <select style={INPUT} value={fieldType} onChange={e => setFieldType(e.target.value)}>
              {FIELD_TYPES.map(ft => (
                <option key={ft.value} value={ft.value}>{ft.label}</option>
              ))}
            </select>
          </div>

          {/* Options (select/multiselect only) */}
          {showOptions && (
            <div>
              <label style={LABEL}>Options</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                {options.map((opt, i) => (
                  <span key={i} style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    background: "rgba(255,255,255,.08)", borderRadius: 5, padding: "4px 8px", fontSize: 12,
                  }}>
                    {opt.label}
                    <button
                      onClick={() => removeOption(i)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", opacity: 0.5, padding: 0, lineHeight: 1 }}
                    >×</button>
                  </span>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  style={{ ...INPUT, flex: 1 }}
                  value={optionInput}
                  onChange={e => setOptionInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addOption())}
                  placeholder="Type option and press Enter…"
                />
                <button style={BTN("ghost")} onClick={addOption}>Add</button>
              </div>
            </div>
          )}

          {/* Shown for (People only) */}
          {showCtKeys && (
            <div>
              <label style={LABEL}>Shown For</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={ctKeys.length === 0}
                    onChange={() => setCtKeys([])}
                  />
                  General (all people)
                </label>
                {contactTypes.map(ct => (
                  <label key={ct.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={ctKeys.includes(ct.key)}
                      onChange={() => {
                        toggleCtKey(ct.key);
                      }}
                    />
                    {ct.label}
                  </label>
                ))}
              </div>
              <p style={{ fontSize: 11, opacity: 0.4, margin: "6px 0 0" }}>
                General = shows for all people. Select specific types to scope the field.
              </p>
            </div>
          )}

          {/* Required */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <label style={{ ...LABEL, margin: 0 }}>Required</label>
            <button
              onClick={() => setRequired(v => !v)}
              style={{
                width: 40, height: 22, borderRadius: 11, border: "none", cursor: "pointer",
                background: required ? "var(--gg-primary,#2563eb)" : "rgba(255,255,255,.15)",
                position: "relative", transition: "background .2s",
              }}
            >
              <span style={{
                position: "absolute", top: 3, left: required ? 21 : 3,
                width: 16, height: 16, borderRadius: "50%",
                background: "#fff", transition: "left .2s",
              }} />
            </button>
          </div>

          {/* Help text */}
          <div>
            <label style={LABEL}>Help Text</label>
            <input
              style={INPUT}
              value={helpText}
              onChange={e => setHelpText(e.target.value)}
              placeholder="Short hint shown below the field…"
            />
          </div>

          {/* Placeholder */}
          <div>
            <label style={LABEL}>Placeholder</label>
            <input
              style={INPUT}
              value={placeholder}
              onChange={e => setPlaceholder(e.target.value)}
              placeholder="Shown inside the input when empty…"
            />
          </div>

          {error && <p style={{ margin: 0, fontSize: 13, color: "#f87171" }}>{error}</p>}

          {/* Actions */}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
            <button style={BTN("ghost")} onClick={onClose}>Cancel</button>
            <button style={BTN("primary")} onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : isNew ? "Create Field" : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
