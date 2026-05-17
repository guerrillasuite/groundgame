"use client";

import { useState, useTransition } from "react";
import FieldDefinitionModal from "./FieldDefinitionModal";
import { STANDARD_FIELDS, type FieldOverride, type RecordType } from "@/lib/crm/standard-field-overrides";

// ── Types ─────────────────────────────────────────────────────────────────────

export type FieldDefinition = {
  id: string;
  tenant_id: string;
  record_type: string;
  field_key: string;
  label: string;
  field_type: string;
  options: { value: string; label: string }[];
  contact_type_keys: string[];
  pipeline_type_key: string | null;
  sitrep_type_id: string | null;
  placeholder: string | null;
  help_text: string | null;
  required: boolean;
  sort_order: number;
  is_archived: boolean;
};

export type ContactType = { key: string; label: string };

type Tab = "people" | "companies" | "households" | "locations" | "opportunities" | "sitrep_items";
const TABS: { key: Tab; label: string }[] = [
  { key: "people",        label: "People"       },
  { key: "companies",     label: "Companies"    },
  { key: "households",    label: "Households"   },
  { key: "locations",     label: "Locations"    },
  { key: "opportunities", label: "Opportunities"},
  { key: "sitrep_items",  label: "SitRep"       },
];

const FIELD_TYPE_LABELS: Record<string, string> = {
  text:        "Text",
  textarea:    "Paragraph",
  number:      "Number",
  date:        "Date",
  boolean:     "Yes/No",
  select:      "Select",
  multiselect: "Multi-select",
  email:       "Email",
  phone:       "Phone",
  url:         "URL",
  location:    "Location",
};

const FIELD_TYPE_ICON: Record<string, string> = {
  text:        "T",
  textarea:    "¶",
  number:      "#",
  date:        "📅",
  boolean:     "◑",
  select:      "▾",
  multiselect: "☑",
  email:       "✉",
  phone:       "✆",
  url:         "🔗",
  location:    "📍",
};

// ── Styles ────────────────────────────────────────────────────────────────────

const S = {
  page:    { padding: "20px 24px", maxWidth: 820 } as React.CSSProperties,
  header:  { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 } as React.CSSProperties,
  h1:      { margin: 0, fontSize: 20, fontWeight: 700 } as React.CSSProperties,
  tabBar:  { display: "flex", gap: 2, marginBottom: 20, borderBottom: "1px solid rgba(255,255,255,.08)", paddingBottom: 0 } as React.CSSProperties,
  section: { background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 10, padding: "14px 16px", marginBottom: 14 } as React.CSSProperties,
  sectionHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 } as React.CSSProperties,
  sectionLabel: { fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, opacity: 0.45 },
  fieldRow: { display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid rgba(255,255,255,.05)" } as React.CSSProperties,
  badge:   { fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "rgba(255,255,255,.08)", opacity: 0.7 } as React.CSSProperties,
  btn: (v: "primary" | "ghost" | "danger" | "dashed"): React.CSSProperties => ({
    padding: v === "dashed" ? "8px 14px" : "6px 12px",
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 7,
    border: v === "dashed" ? "1px dashed rgba(255,255,255,.25)" : "none",
    cursor: "pointer",
    background: v === "primary" ? "var(--gg-primary,#2563eb)" : v === "danger" ? "#dc2626" : "rgba(255,255,255,.08)",
    color: "#fff",
    width: v === "dashed" ? "100%" : undefined,
    marginTop: v === "dashed" ? 10 : undefined,
  }),
};

// ── Main component ─────────────────────────────────────────────────────────────

export default function CustomFieldsPanel({
  initialDefinitions,
  contactTypes,
  initialFieldOverrides,
}: {
  initialDefinitions: FieldDefinition[];
  contactTypes: ContactType[];
  initialFieldOverrides: FieldOverride[];
}) {
  const [activeTab, setActiveTab] = useState<Tab>("people");
  const [defs, setDefs] = useState<FieldDefinition[]>(initialDefinitions);
  const [fieldOverrides, setFieldOverrides] = useState<FieldOverride[]>(initialFieldOverrides);
  const [showArchived, setShowArchived] = useState(false);
  const [modal, setModal] = useState<{ open: boolean; editing?: FieldDefinition; defaults?: Partial<FieldDefinition> }>({ open: false });
  const [, start] = useTransition();

  const tabDefs = defs.filter(d => d.record_type === activeTab);
  const visible  = tabDefs.filter(d => showArchived ? true : !d.is_archived);
  const archived = tabDefs.filter(d => d.is_archived);

  function openCreate(defaults?: Partial<FieldDefinition>) {
    setModal({ open: true, defaults: { record_type: activeTab, ...defaults } });
  }
  function openEdit(def: FieldDefinition) {
    setModal({ open: true, editing: def });
  }

  async function handleSave(saved: FieldDefinition) {
    setDefs(prev => {
      const idx = prev.findIndex(d => d.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [...prev, saved];
    });
    setModal({ open: false });
  }

  async function handleRename(def: FieldDefinition, newLabel: string) {
    const res = await fetch(`/api/crm/custom-fields/${def.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: newLabel }),
    });
    if (res.ok) {
      setDefs(prev => prev.map(d => d.id === def.id ? { ...d, label: newLabel } : d));
    }
  }

  async function handleStandardFieldSave(recordType: RecordType, fieldKey: string, customLabel: string) {
    const res = await fetch("/api/crm/standard-field-overrides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ record_type: recordType, field_key: fieldKey, custom_label: customLabel }),
    });
    if (res.ok) {
      const saved = await res.json() as FieldOverride;
      setFieldOverrides(prev => {
        const idx = prev.findIndex(o => o.record_type === recordType && o.field_key === fieldKey);
        if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
        return [...prev, saved];
      });
    }
  }

  async function handleStandardFieldReset(recordType: RecordType, fieldKey: string) {
    await fetch("/api/crm/standard-field-overrides", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ record_type: recordType, field_key: fieldKey }),
    });
    setFieldOverrides(prev => prev.filter(o => !(o.record_type === recordType && o.field_key === fieldKey)));
  }

  async function handleArchive(def: FieldDefinition) {
    const res = await fetch(`/api/crm/custom-fields/${def.id}`, { method: "DELETE" });
    if (res.ok) {
      setDefs(prev => prev.map(d => d.id === def.id ? { ...d, is_archived: true } : d));
    }
  }

  async function handleUnarchive(def: FieldDefinition) {
    const res = await fetch(`/api/crm/custom-fields/${def.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_archived: false }),
    });
    if (res.ok) {
      setDefs(prev => prev.map(d => d.id === def.id ? { ...d, is_archived: false } : d));
    }
  }

  // ── People tab: grouped by contact type ────────────────────────────────────

  function renderPeopleTab() {
    const generalDefs  = visible.filter(d => d.contact_type_keys.length === 0);
    const hasGeneral   = generalDefs.length > 0;
    const typeSections = contactTypes.map(ct => ({
      ct,
      fields: visible.filter(d => d.contact_type_keys.includes(ct.key)),
    })).filter(s => s.fields.length > 0);

    return (
      <>
        {/* General section */}
        <div style={S.section}>
          <div style={S.sectionHeader}>
            <span style={S.sectionLabel}>General <span style={{ opacity: 0.5 }}>({generalDefs.length})</span></span>
            <button style={S.btn("ghost")} onClick={() => openCreate({ contact_type_keys: [] })}>+ Add field</button>
          </div>
          {generalDefs.map(def => <FieldRow key={def.id} def={def} onEdit={openEdit} onArchive={handleArchive} onRename={handleRename} />)}
          {generalDefs.length === 0 && <p style={{ fontSize: 12, opacity: 0.35, margin: "4px 0 0" }}>No general fields yet.</p>}
          <button style={S.btn("dashed")} onClick={() => openCreate({ contact_type_keys: [] })}>+ Add general field</button>
        </div>

        {/* Per-contact-type sections */}
        {typeSections.map(({ ct, fields }) => (
          <div key={ct.key} style={S.section}>
            <div style={S.sectionHeader}>
              <span style={S.sectionLabel}>{ct.label} <span style={{ opacity: 0.5 }}>({fields.length})</span></span>
              <button style={S.btn("ghost")} onClick={() => openCreate({ contact_type_keys: [ct.key] })}>+ Add field</button>
            </div>
            {fields.map(def => <FieldRow key={def.id} def={def} onEdit={openEdit} onArchive={handleArchive} onRename={handleRename} />)}
            <button style={S.btn("dashed")} onClick={() => openCreate({ contact_type_keys: [ct.key] })}>
              + Add field to {ct.label}
            </button>
          </div>
        ))}

        {/* Archived */}
        {archived.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <button
              style={{ ...S.btn("ghost"), fontSize: 11, opacity: 0.5 }}
              onClick={() => setShowArchived(v => !v)}
            >
              {showArchived ? "Hide" : "Show"} {archived.length} archived field{archived.length !== 1 ? "s" : ""}
            </button>
            {showArchived && archived.map(def => (
              <FieldRow key={def.id} def={def} onEdit={openEdit} onArchive={handleArchive} onUnarchive={handleUnarchive} onRename={handleRename} />
            ))}
          </div>
        )}
      </>
    );
  }

  // ── Flat tab (companies / households / locations) ──────────────────────────

  function renderFlatTab() {
    return (
      <div style={S.section}>
        <div style={S.sectionHeader}>
          <span style={S.sectionLabel}>Fields <span style={{ opacity: 0.5 }}>({visible.length})</span></span>
          <button style={S.btn("ghost")} onClick={() => openCreate()}>+ Add field</button>
        </div>
        {visible.map(def => <FieldRow key={def.id} def={def} onEdit={openEdit} onArchive={handleArchive} onRename={handleRename} />)}
        {visible.length === 0 && <p style={{ fontSize: 12, opacity: 0.35, margin: "4px 0 0" }}>No fields yet.</p>}
        <button style={S.btn("dashed")} onClick={() => openCreate()}>+ Add field</button>

        {archived.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <button
              style={{ ...S.btn("ghost"), fontSize: 11, opacity: 0.5 }}
              onClick={() => setShowArchived(v => !v)}
            >
              {showArchived ? "Hide" : "Show"} {archived.length} archived
            </button>
            {showArchived && archived.map(def => (
              <FieldRow key={def.id} def={def} onEdit={openEdit} onArchive={handleArchive} onUnarchive={handleUnarchive} onRename={handleRename} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <h1 style={S.h1}>Custom Fields</h1>
        <button style={S.btn("primary")} onClick={() => openCreate()}>+ Add Field</button>
      </div>

      {/* Tab bar */}
      <div style={S.tabBar}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: activeTab === tab.key ? 700 : 400,
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "inherit",
              borderBottom: activeTab === tab.key ? "2px solid var(--gg-primary,#2563eb)" : "2px solid transparent",
              marginBottom: -1,
              opacity: activeTab === tab.key ? 1 : 0.55,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "people" ? renderPeopleTab() : renderFlatTab()}

      {/* Standard field label overrides */}
      <StandardFieldLabels
        recordType={activeTab}
        overrides={fieldOverrides.filter(o => o.record_type === activeTab)}
        onSave={handleStandardFieldSave}
        onReset={handleStandardFieldReset}
      />

      {/* Modal */}
      {modal.open && (
        <FieldDefinitionModal
          editing={modal.editing}
          defaults={modal.defaults}
          contactTypes={contactTypes}
          onSave={handleSave}
          onClose={() => setModal({ open: false })}
        />
      )}
    </div>
  );
}

// ── StandardFieldLabels ───────────────────────────────────────────────────────

function StandardFieldLabels({
  recordType,
  overrides,
  onSave,
  onReset,
}: {
  recordType: RecordType;
  overrides: FieldOverride[];
  onSave: (recordType: RecordType, fieldKey: string, customLabel: string) => Promise<void>;
  onReset: (recordType: RecordType, fieldKey: string) => Promise<void>;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const allFields = STANDARD_FIELDS[recordType] ?? [];
  if (allFields.length === 0) return null;

  const coreFields     = allFields.filter(f => !f.advanced);
  const advancedFields = allFields.filter(f => f.advanced);
  const om = new Map(overrides.map(o => [o.field_key, o.custom_label]));

  return (
    <div style={{ ...S.section, marginTop: 8 }}>
      <div style={S.sectionHeader}>
        <span style={S.sectionLabel}>Standard Field Labels</span>
        <span style={{ fontSize: 11, opacity: 0.4 }}>Click a label to rename</span>
      </div>
      <p style={{ fontSize: 12, opacity: 0.4, margin: "0 0 10px" }}>
        Rename built-in fields to match your org's terminology.
      </p>

      {coreFields.map(f => (
        <StandardFieldRow key={f.key} recordType={recordType} field={f}
          customLabel={om.get(f.key) ?? null} onSave={onSave} onReset={onReset} />
      ))}

      {advancedFields.length > 0 && (
        <>
          <button
            style={{ ...S.btn("ghost"), fontSize: 11, opacity: 0.5, marginTop: 8 }}
            onClick={() => setShowAdvanced(v => !v)}
          >
            {showAdvanced ? "▲ Hide" : "▼ Show"} {advancedFields.length} advanced fields
          </button>
          {showAdvanced && advancedFields.map(f => (
            <StandardFieldRow key={f.key} recordType={recordType} field={f}
              customLabel={om.get(f.key) ?? null} onSave={onSave} onReset={onReset} />
          ))}
        </>
      )}
    </div>
  );
}

function StandardFieldRow({
  recordType,
  field,
  customLabel,
  onSave,
  onReset,
}: {
  recordType: RecordType;
  field: { key: string; defaultLabel: string };
  customLabel: string | null;
  onSave: (recordType: RecordType, fieldKey: string, customLabel: string) => Promise<void>;
  onReset: (recordType: RecordType, fieldKey: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(customLabel ?? field.defaultLabel);
  const [saving, setSaving] = useState(false);

  async function commit() {
    const trimmed = value.trim();
    if (!trimmed) { cancel(); return; }
    if (trimmed === field.defaultLabel && !customLabel) { setEditing(false); return; }
    if (trimmed === customLabel) { setEditing(false); return; }

    setSaving(true);
    if (trimmed === field.defaultLabel) {
      await onReset(recordType, field.key);
    } else {
      await onSave(recordType, field.key, trimmed);
    }
    setSaving(false);
    setEditing(false);
  }

  function cancel() {
    setValue(customLabel ?? field.defaultLabel);
    setEditing(false);
  }

  const displayLabel = customLabel ?? field.defaultLabel;
  const isOverridden = customLabel !== null;

  return (
    <div style={{ ...S.fieldRow, alignItems: "center" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <input
            autoFocus
            value={value}
            onChange={e => setValue(e.target.value)}
            onBlur={commit}
            onKeyDown={e => {
              if (e.key === "Enter") { e.preventDefault(); commit(); }
              if (e.key === "Escape") cancel();
            }}
            disabled={saving}
            style={{
              fontSize: 13, fontWeight: 600,
              background: "rgba(255,255,255,.08)",
              border: "1px solid rgba(255,255,255,.2)",
              borderRadius: 5, padding: "2px 6px",
              color: "inherit", width: "100%", boxSizing: "border-box" as const,
            }}
          />
        ) : (
          <span
            style={{ fontSize: 13, fontWeight: 600, cursor: "text" }}
            title="Click to rename"
            onClick={() => { setValue(customLabel ?? field.defaultLabel); setEditing(true); }}
          >
            {displayLabel}
          </span>
        )}
        {isOverridden && !editing && (
          <span style={{ marginLeft: 8, fontSize: 11, opacity: 0.45 }}>
            (default: {field.defaultLabel})
          </span>
        )}
      </div>
      <span style={{ ...S.badge, fontFamily: "monospace", fontSize: 10 }}>{field.key}</span>
      {isOverridden && !editing && (
        <button
          style={{ ...S.btn("ghost"), fontSize: 11, opacity: 0.5 }}
          onClick={() => { onReset(recordType, field.key); setValue(field.defaultLabel); }}
        >
          Reset
        </button>
      )}
    </div>
  );
}

// ── FieldRow ──────────────────────────────────────────────────────────────────

function FieldRow({
  def,
  onEdit,
  onArchive,
  onUnarchive,
  onRename,
}: {
  def: FieldDefinition;
  onEdit: (d: FieldDefinition) => void;
  onArchive: (d: FieldDefinition) => void;
  onUnarchive?: (d: FieldDefinition) => void;
  onRename: (d: FieldDefinition, newLabel: string) => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(def.label);
  const [renameSaving, setRenameSaving] = useState(false);

  async function commitRename() {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === def.label) {
      setRenaming(false);
      setRenameValue(def.label);
      return;
    }
    setRenameSaving(true);
    await onRename(def, trimmed);
    setRenameSaving(false);
    setRenaming(false);
  }

  return (
    <div style={{ ...S.fieldRow, opacity: def.is_archived ? 0.45 : 1 }}>
      <span style={{ fontSize: 13, minWidth: 18, textAlign: "center", opacity: 0.5 }}>
        {FIELD_TYPE_ICON[def.field_type] ?? "·"}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {renaming ? (
          <input
            autoFocus
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => {
              if (e.key === "Enter") { e.preventDefault(); commitRename(); }
              if (e.key === "Escape") { setRenaming(false); setRenameValue(def.label); }
            }}
            disabled={renameSaving}
            style={{
              fontSize: 13, fontWeight: 600,
              background: "rgba(255,255,255,.08)",
              border: "1px solid rgba(255,255,255,.2)",
              borderRadius: 5, padding: "2px 6px",
              color: "inherit", width: "100%", boxSizing: "border-box" as const,
            }}
          />
        ) : (
          <span
            style={{ fontSize: 13, fontWeight: 600, cursor: def.is_archived ? "default" : "text" }}
            title={def.is_archived ? undefined : "Click to rename"}
            onClick={() => { if (!def.is_archived) { setRenaming(true); setRenameValue(def.label); } }}
          >
            {def.label}
          </span>
        )}
        {def.is_archived && <span style={{ marginLeft: 8, fontSize: 10, opacity: 0.5 }}>archived</span>}
        {def.help_text && !renaming && (
          <div style={{ fontSize: 11, opacity: 0.45, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {def.help_text}
          </div>
        )}
      </div>
      <span style={S.badge}>{FIELD_TYPE_LABELS[def.field_type] ?? def.field_type}</span>
      {def.required && <span style={{ ...S.badge, color: "#f87171" }}>Required</span>}
      {!def.is_archived && (
        <>
          <button style={S.btn("ghost")} onClick={() => onEdit(def)}>Edit</button>
          {confirming ? (
            <>
              <button style={S.btn("danger")} onClick={() => { onArchive(def); setConfirming(false); }}>Confirm</button>
              <button style={S.btn("ghost")} onClick={() => setConfirming(false)}>Cancel</button>
            </>
          ) : (
            <button style={{ ...S.btn("ghost"), opacity: 0.5 }} onClick={() => setConfirming(true)}>Archive</button>
          )}
        </>
      )}
      {def.is_archived && onUnarchive && (
        <button style={S.btn("ghost")} onClick={() => onUnarchive(def)}>Unarchive</button>
      )}
    </div>
  );
}
