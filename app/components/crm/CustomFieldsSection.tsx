"use client";

import { useState, useEffect } from "react";
import FieldDefinitionModal from "@/app/crm/settings/custom-fields/FieldDefinitionModal";
import type { FieldDefinition, ContactType } from "@/app/crm/settings/custom-fields/CustomFieldsPanel";

type Def = FieldDefinition & { display_scope?: string };

const FIELD_TYPE_ICON: Record<string, string> = {
  text: "T", textarea: "¶", number: "#", date: "📅",
  boolean: "◑", select: "▾", multiselect: "☑", email: "✉", phone: "✆", url: "🔗",
};

const FIELD_TYPE_LABELS: Record<string, string> = {
  text: "Text", textarea: "Paragraph", number: "Number", date: "Date",
  boolean: "Yes/No", select: "Select", multiselect: "Multi-select",
  email: "Email", phone: "Phone", url: "URL",
};

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
  const [defs, setDefs] = useState<Def[]>([]);
  const [modal, setModal] = useState<{ open: boolean; editing?: Def }>({ open: false });
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

  function handleSaved(saved: Def) {
    setDefs(prev => {
      const idx = prev.findIndex(d => d.id === saved.id);
      if (idx >= 0) { const n = [...prev]; n[idx] = saved as Def; return n; }
      return [...prev, saved as Def];
    });
    setModal({ open: false });
  }

  async function archive(def: Def) {
    await fetch(`/api/crm/custom-fields/${def.id}`, { method: "DELETE" });
    setDefs(prev => prev.filter(d => d.id !== def.id));
  }

  async function patchScope(def: Def, newScope: string) {
    setDefs(prev => prev.map(d => d.id === def.id ? { ...d, display_scope: newScope } : d));
    await fetch(`/api/crm/custom-fields/${def.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_scope: newScope }),
    });
  }

  async function reorder(zone: Def[], fromIdx: number, toIdx: number, allDefs: Def[]) {
    const reordered = [...zone];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    // Rebuild the full list preserving the other zone
    const otherZone = allDefs.filter(d => d.display_scope !== zone[0]?.display_scope);
    setDefs([...otherZone, ...reordered]);
    await fetch(`/api/crm/custom-fields/${moved.id}/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: reordered.map(d => d.id) }),
    });
  }

  const visible = defs.filter(d => !d.is_archived);
  const snapshotDefs = visible.filter(d => d.display_scope === "snapshot");
  const detailDefs   = visible.filter(d => d.display_scope !== "snapshot"); // default 'detail'

  const btnStyle: React.CSSProperties = {
    padding: "2px 5px", fontSize: 11, borderRadius: 5,
    border: "none", background: "rgba(255,255,255,.07)", color: "inherit",
    cursor: "pointer", lineHeight: 1.3,
  };

  function renderField(def: Def, zone: Def[], idx: number) {
    const isSnapshot = def.display_scope === "snapshot";
    return (
      <div key={def.id} style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 0", borderTop: `1px solid ${borderColor}`,
      }}>
        {/* Reorder arrows */}
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <button
            title="Move up"
            onClick={() => {
              if (idx > 0) {
                reorder(zone, idx, idx - 1, visible);
              } else if (isSnapshot) {
                // Already at top of snapshot — nowhere to go
              } else {
                // Top of detail zone → promote to snapshot
                patchScope(def, "snapshot");
              }
            }}
            style={{ ...btnStyle, opacity: (idx === 0 && !isSnapshot) || idx > 0 ? 1 : 0.3 }}
          >↑</button>
          <button
            title="Move down"
            onClick={() => {
              if (idx < zone.length - 1) {
                reorder(zone, idx, idx + 1, visible);
              } else if (!isSnapshot) {
                // Already at bottom of detail — nowhere to go
              } else {
                // Bottom of snapshot zone → demote to detail
                patchScope(def, "detail");
              }
            }}
            style={{ ...btnStyle, opacity: (idx === zone.length - 1 && isSnapshot) || idx < zone.length - 1 ? 1 : 0.3 }}
          >↓</button>
        </div>

        {/* Type icon */}
        <span style={{ fontSize: 12, minWidth: 16, textAlign: "center", opacity: 0.5 }}>
          {FIELD_TYPE_ICON[def.field_type] ?? "·"}
        </span>

        {/* Label + type */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{def.label}</span>
          <span style={{ marginLeft: 8, fontSize: 10, opacity: 0.4 }}>
            {FIELD_TYPE_LABELS[def.field_type] ?? def.field_type}
          </span>
          {def.required && (
            <span style={{ marginLeft: 6, fontSize: 10, color: "#f87171" }}>required</span>
          )}
        </div>

        {/* Scope toggle pill */}
        <button
          title={isSnapshot ? "Shown in summary card — click to move to detail only" : "Detail only — click to show in summary card"}
          onClick={() => patchScope(def, isSnapshot ? "detail" : "snapshot")}
          style={{
            padding: "3px 8px", fontSize: 10, fontWeight: 600, borderRadius: 20,
            border: isSnapshot ? "1px solid rgba(99,102,241,.5)" : `1px solid ${borderColor}`,
            background: isSnapshot ? "rgba(99,102,241,.15)" : "rgba(255,255,255,.04)",
            color: isSnapshot ? "#a5b4fc" : dimColor,
            cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
          }}
        >
          {isSnapshot ? "Summary" : "Detail only"}
        </button>

        <button
          onClick={() => setModal({ open: true, editing: def })}
          style={{ ...btnStyle, padding: "3px 10px" }}
        >
          Edit
        </button>
        <button
          onClick={() => archive(def)}
          style={{ ...btnStyle, padding: "3px 10px", opacity: 0.4 }}
        >
          ×
        </button>
      </div>
    );
  }

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

        {/* Snapshot zone */}
        {snapshotDefs.length > 0 && (
          <div style={{ display: "grid", gap: 1 }}>
            {snapshotDefs.map((def, idx) => renderField(def, snapshotDefs, idx))}
          </div>
        )}

        {/* Separator */}
        {visible.length > 0 && (
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            margin: "10px 0",
          }}>
            <div style={{ flex: 1, height: 1, borderTop: `1px dashed ${borderColor}` }} />
            <span style={{ fontSize: 10, fontWeight: 600, color: dimColor, whiteSpace: "nowrap", letterSpacing: "0.05em" }}>
              ↑ Summary card &nbsp;·&nbsp; Detail view only below ↓
            </span>
            <div style={{ flex: 1, height: 1, borderTop: `1px dashed ${borderColor}` }} />
          </div>
        )}

        {/* Detail zone */}
        {detailDefs.length > 0 && (
          <div style={{ display: "grid", gap: 1 }}>
            {detailDefs.map((def, idx) => renderField(def, detailDefs, idx))}
          </div>
        )}

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
