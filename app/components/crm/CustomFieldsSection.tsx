"use client";

import { useState, useEffect } from "react";
import FieldDefinitionModal from "@/app/crm/settings/custom-fields/FieldDefinitionModal";
import type { FieldDefinition, ContactType } from "@/app/crm/settings/custom-fields/CustomFieldsPanel";

const FIELD_TYPE_ICON: Record<string, string> = {
  text: "T", textarea: "¶", number: "#", date: "📅",
  boolean: "◑", select: "▾", multiselect: "☑", email: "✉", phone: "✆", url: "🔗",
};

const FIELD_TYPE_LABELS: Record<string, string> = {
  text: "Text", textarea: "Paragraph", number: "Number", date: "Date",
  boolean: "Yes/No", select: "Select", multiselect: "Multi-select",
  email: "Email", phone: "Phone", url: "URL",
};

/**
 * Reusable custom fields section for type editors (pipeline + SitRep).
 * Fetches definitions for the given scope and allows inline create/edit/archive.
 */
export default function CustomFieldsSection({
  recordType,
  pipelineTypeKey,
  sitrepTypeId,
  borderColor = "rgba(255,255,255,.08)",
  dimColor    = "rgba(255,255,255,.4)",
}: {
  recordType: "opportunities" | "sitrep_items";
  pipelineTypeKey?: string;
  sitrepTypeId?: string;
  borderColor?: string;
  dimColor?: string;
}) {
  const [defs, setDefs] = useState<FieldDefinition[]>([]);
  const [modal, setModal] = useState<{ open: boolean; editing?: FieldDefinition }>({ open: false });
  const [loading, setLoading] = useState(true);

  const params = new URLSearchParams({ record_type: recordType });
  if (pipelineTypeKey) params.set("pipeline_type_key", pipelineTypeKey);
  if (sitrepTypeId)    params.set("sitrep_type_id", sitrepTypeId);

  useEffect(() => {
    fetch(`/api/crm/custom-fields?${params}`)
      .then(r => r.json())
      .then(d => { setDefs(d.definitions ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordType, pipelineTypeKey, sitrepTypeId]);

  function handleSaved(saved: FieldDefinition) {
    setDefs(prev => {
      const idx = prev.findIndex(d => d.id === saved.id);
      if (idx >= 0) { const n = [...prev]; n[idx] = saved; return n; }
      return [...prev, saved];
    });
    setModal({ open: false });
  }

  async function archive(def: FieldDefinition) {
    await fetch(`/api/crm/custom-fields/${def.id}`, { method: "DELETE" });
    setDefs(prev => prev.filter(d => d.id !== def.id));
  }

  const visible = defs.filter(d => !d.is_archived);

  return (
    <>
      <div style={{ paddingTop: 18, paddingBottom: 4 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: dimColor }}>
              Custom Fields
            </div>
            <div style={{ fontSize: 11, color: dimColor, marginTop: 2 }}>
              Type-specific fields shown on records in this type
            </div>
          </div>
          <button
            onClick={() => setModal({ open: true })}
            style={{
              padding: "5px 12px", fontSize: 12, fontWeight: 600, borderRadius: 7,
              border: "none", background: "rgba(255,255,255,.1)", color: "inherit", cursor: "pointer",
            }}
          >
            + Add Field
          </button>
        </div>

        {loading && <p style={{ fontSize: 12, opacity: 0.35, margin: "4px 0" }}>Loading…</p>}

        {!loading && visible.length === 0 && (
          <p style={{ fontSize: 12, color: dimColor, margin: "4px 0 10px" }}>No custom fields yet.</p>
        )}

        <div style={{ display: "grid", gap: 1 }}>
          {visible.map(def => (
            <div key={def.id} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "8px 0", borderTop: `1px solid ${borderColor}`,
            }}>
              <span style={{ fontSize: 12, minWidth: 16, textAlign: "center", opacity: 0.5 }}>
                {FIELD_TYPE_ICON[def.field_type] ?? "·"}
              </span>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{def.label}</span>
                <span style={{ marginLeft: 8, fontSize: 10, opacity: 0.4 }}>
                  {FIELD_TYPE_LABELS[def.field_type] ?? def.field_type}
                </span>
                {def.required && (
                  <span style={{ marginLeft: 6, fontSize: 10, color: "#f87171" }}>required</span>
                )}
              </div>
              <button
                onClick={() => setModal({ open: true, editing: def })}
                style={{ padding: "3px 10px", fontSize: 11, borderRadius: 6, border: "none", background: "rgba(255,255,255,.08)", color: "inherit", cursor: "pointer" }}
              >
                Edit
              </button>
              <button
                onClick={() => archive(def)}
                style={{ padding: "3px 10px", fontSize: 11, borderRadius: 6, border: "none", background: "rgba(255,255,255,.04)", color: "inherit", cursor: "pointer", opacity: 0.5 }}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={() => setModal({ open: true })}
          style={{
            marginTop: 10, padding: "7px 14px", fontSize: 12, borderRadius: 7,
            border: `1px dashed ${borderColor}`, background: "rgba(255,255,255,.02)",
            color: dimColor, cursor: "pointer", width: "100%",
          }}
        >
          + Add Custom Field
        </button>
      </div>

      {modal.open && (
        <FieldDefinitionModal
          editing={modal.editing}
          defaults={{
            record_type: recordType,
            pipeline_type_key: pipelineTypeKey ?? null,
            sitrep_type_id: sitrepTypeId ?? null,
          }}
          contactTypes={[]}
          onSave={handleSaved}
          onClose={() => setModal({ open: false })}
        />
      )}
    </>
  );
}
