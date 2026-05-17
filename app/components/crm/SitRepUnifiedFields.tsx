"use client";

import { useState, useEffect } from "react";
import { STANDARD_FIELDS } from "@/lib/crm/standard-field-overrides";
import FieldDefinitionModal from "@/app/crm/settings/custom-fields/FieldDefinitionModal";
import type { FieldDefinition } from "@/app/crm/settings/custom-fields/CustomFieldsPanel";

// Standard sitrep_items fields that appear in the detail body (not structural ones like title/status/item_type)
const SITREP_BODY_FIELDS = STANDARD_FIELDS.sitrep_items.filter(f =>
  !["title", "status", "item_type"].includes(f.key)
);

type StdOverride = { field_key: string; custom_label: string | null; hidden: boolean; display_scope: string; sort_order: number | null };

type Row =
  | { kind: "std"; key: string; defaultLabel: string; advanced: boolean; sortOrder: number; label: string; hidden: boolean; scope: string }
  | { kind: "cf";  def: FieldDefinition; sortOrder: number };

const BTN: React.CSSProperties = {
  padding: "2px 5px", fontSize: 11, fontWeight: 600, borderRadius: 5,
  border: "none", background: "rgba(255,255,255,.07)", color: "inherit",
  cursor: "pointer", lineHeight: 1.3, flexShrink: 0,
};

const FIELD_TYPE_ICON: Record<string, string> = {
  text: "T", textarea: "¶", number: "#", date: "📅",
  boolean: "◑", select: "▾", multiselect: "☑", email: "✉", phone: "✆", url: "🔗", location: "📍",
};

export default function SitRepUnifiedFields({
  sitrepTypeId,
  scopeKey,
  borderColor = "rgba(255,255,255,.08)",
  dimColor    = "rgba(255,255,255,.4)",
}: {
  sitrepTypeId: string;
  scopeKey: string;
  borderColor?: string;
  dimColor?: string;
}) {
  const [stdOverrides, setStdOverrides] = useState<Map<string, StdOverride>>(new Map());
  const [cfDefs, setCfDefs]             = useState<FieldDefinition[]>([]);
  const [loaded, setLoaded]             = useState(false);
  const [modal, setModal]               = useState<{ open: boolean; editing?: FieldDefinition }>({ open: false });
  // Per-field inline rename state for standard fields
  const [renaming, setRenaming]         = useState<{ key: string; value: string } | null>(null);

  // Effective sort_order for a standard field (default: array index * 10)
  function stdSortOrder(key: string): number {
    const stored = stdOverrides.get(key)?.sort_order;
    if (stored != null) return stored;
    const idx = SITREP_BODY_FIELDS.findIndex(f => f.key === key);
    return idx >= 0 ? idx * 10 : 999;
  }

  useEffect(() => {
    Promise.all([
      fetch(`/api/crm/standard-field-overrides?record_type=sitrep_items&scope_key=${encodeURIComponent(scopeKey)}`).then(r => r.json()),
      fetch(`/api/crm/custom-fields?record_type=sitrep_items&sitrep_type_id=${encodeURIComponent(sitrepTypeId)}`).then(r => r.json()),
    ]).then(([overrides, cfRes]) => {
      const omap = new Map<string, StdOverride>();
      for (const o of (Array.isArray(overrides) ? overrides : [])) {
        omap.set(o.field_key, { field_key: o.field_key, custom_label: o.custom_label ?? null, hidden: !!o.hidden, display_scope: o.display_scope ?? "snapshot", sort_order: o.sort_order ?? null });
      }
      setStdOverrides(omap);
      const defs: FieldDefinition[] = (cfRes?.definitions ?? (Array.isArray(cfRes) ? cfRes : []));
      setCfDefs(defs.filter((d: any) => !d.is_archived));
      setLoaded(false); // trigger re-render below
    }).catch(() => {}).finally(() => setLoaded(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sitrepTypeId, scopeKey]);

  // Build unified sorted rows
  const visibleBodyFields = SITREP_BODY_FIELDS;
  const stdRows: Row[] = visibleBodyFields.map(f => ({
    kind: "std",
    key: f.key,
    defaultLabel: f.defaultLabel,
    advanced: f.advanced ?? false,
    sortOrder: stdSortOrder(f.key),
    label: stdOverrides.get(f.key)?.custom_label ?? f.defaultLabel,
    hidden: stdOverrides.get(f.key)?.hidden ?? false,
    scope: stdOverrides.get(f.key)?.display_scope ?? "snapshot",
  }));
  const cfRows: Row[] = cfDefs.map(def => ({ kind: "cf", def, sortOrder: def.sort_order ?? 999 }));
  const allRows: Row[] = [...stdRows, ...cfRows].sort((a, b) => a.sortOrder - b.sortOrder);

  // Reorder: swap the two rows, then renormalize all sort_orders to idx*10.
  // Persists only rows whose sort_order actually changes, so repeated moves of
  // already-ordered rows are cheap (2 writes). First-time moves normalize all
  // collisions (multiple rows at default 999) in one shot.
  async function reorder(idx: number, dir: -1 | 1) {
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= allRows.length) return;

    // New order after swap
    const newOrder = [...allRows];
    [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];

    // Compute changes: position i → sort_order i*10
    const changes = newOrder
      .map((row, i) => ({ row, newOrd: i * 10 }))
      .filter(({ row, newOrd }) => row.sortOrder !== newOrd);

    // Optimistic update
    setStdOverrides(prev => {
      const n = new Map(prev);
      for (const { row, newOrd } of changes) {
        if (row.kind !== "std") continue;
        const cur = prev.get(row.key);
        n.set(row.key, { ...(cur ?? { field_key: row.key, custom_label: null, hidden: false, display_scope: "snapshot" }), sort_order: newOrd });
      }
      return n;
    });
    setCfDefs(prev => {
      const upd = new Map(changes.filter(c => c.row.kind === "cf").map(c => [(c.row as Row & { kind: "cf" }).def.id, c.newOrd]));
      return prev.map(d => upd.has(d.id) ? { ...d, sort_order: upd.get(d.id)! } : d);
    });

    // Persist only changed rows
    await Promise.all(changes.map(({ row, newOrd }) =>
      row.kind === "std"
        ? fetch("/api/crm/standard-field-overrides", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ record_type: "sitrep_items", field_key: row.key, scope_key: scopeKey, sort_order: newOrd }) })
        : fetch(`/api/crm/custom-fields/${(row as Row & { kind: "cf" }).def.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sort_order: newOrd }) })
    ));
  }

  async function toggleScope(row: Row) {
    const cur = row.kind === "std" ? row.scope : (row.def as any).display_scope ?? "detail";
    const next = cur === "snapshot" ? "detail" : "snapshot";
    if (row.kind === "std") {
      setStdOverrides(prev => { const n = new Map(prev); const existing = prev.get(row.key); n.set(row.key, { ...(existing ?? { field_key: row.key, custom_label: null, hidden: false, sort_order: null }), display_scope: next }); return n; });
      await fetch("/api/crm/standard-field-overrides", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ record_type: "sitrep_items", field_key: row.key, scope_key: scopeKey, display_scope: next }) });
    } else {
      setCfDefs(prev => prev.map(d => d.id === row.def.id ? { ...d, display_scope: next } as FieldDefinition : d));
      await fetch(`/api/crm/custom-fields/${row.def.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ display_scope: next }) });
    }
  }

  async function toggleHidden(row: Row & { kind: "std" }) {
    const newHidden = !row.hidden;
    setStdOverrides(prev => { const n = new Map(prev); const existing = prev.get(row.key); n.set(row.key, { ...(existing ?? { field_key: row.key, custom_label: null, display_scope: "snapshot", sort_order: null }), hidden: newHidden }); return n; });
    await fetch("/api/crm/standard-field-overrides", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ record_type: "sitrep_items", field_key: row.key, scope_key: scopeKey, hidden: newHidden }) });
  }

  async function commitRename(key: string, value: string, defaultLabel: string) {
    const trimmed = value.trim() || defaultLabel;
    setStdOverrides(prev => { const n = new Map(prev); const existing = prev.get(key); n.set(key, { ...(existing ?? { field_key: key, hidden: false, display_scope: "snapshot", sort_order: null }), custom_label: trimmed === defaultLabel ? null : trimmed }); return n; });
    setRenaming(null);
    if (trimmed !== defaultLabel) {
      await fetch("/api/crm/standard-field-overrides", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ record_type: "sitrep_items", field_key: key, scope_key: scopeKey, custom_label: trimmed }) });
    }
  }

  function handleCfSaved(saved: FieldDefinition) {
    setCfDefs(prev => { const idx = prev.findIndex(d => d.id === saved.id); if (idx >= 0) { const n = [...prev]; n[idx] = saved; return n; } return [...prev, saved]; });
    setModal({ open: false });
  }

  async function archiveCf(def: FieldDefinition) {
    await fetch(`/api/crm/custom-fields/${def.id}`, { method: "DELETE" });
    setCfDefs(prev => prev.filter(d => d.id !== def.id));
  }

  const isSnapshot = (row: Row) => row.kind === "std" ? row.scope === "snapshot" : ((row.def as any).display_scope ?? "detail") === "snapshot";

  return (
    <div style={{ paddingTop: 18, paddingBottom: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: dimColor }}>
            Fields &amp; Order
          </div>
          <div style={{ fontSize: 11, color: dimColor, marginTop: 2 }}>
            ↑/↓ to reorder · eye to hide · click name to rename · scope pill controls summary vs detail
          </div>
        </div>
        <button
          onClick={() => setModal({ open: true })}
          style={{ padding: "5px 12px", fontSize: 12, fontWeight: 600, borderRadius: 7, border: "none", background: "rgba(255,255,255,.1)", color: "inherit", cursor: "pointer" }}
        >
          + Add Field
        </button>
      </div>

      {!loaded && <p style={{ fontSize: 12, opacity: 0.35, margin: "4px 0" }}>Loading…</p>}

      {loaded && allRows.map((row, idx) => {
        const snap = isSnapshot(row);
        return (
          <div key={row.kind === "std" ? `std:${row.key}` : `cf:${row.def.id}`}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 0", borderTop: `1px solid ${borderColor}` }}>

            {/* ↑/↓ */}
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <button onClick={() => reorder(idx, -1)} disabled={idx === 0}
                style={{ ...BTN, opacity: idx === 0 ? 0.2 : 0.6 }}>↑</button>
              <button onClick={() => reorder(idx, 1)} disabled={idx === allRows.length - 1}
                style={{ ...BTN, opacity: idx === allRows.length - 1 ? 0.2 : 0.6 }}>↓</button>
            </div>

            {/* Field type icon */}
            <span style={{ fontSize: 11, minWidth: 14, textAlign: "center", opacity: 0.45, flexShrink: 0 }}>
              {row.kind === "cf" ? (FIELD_TYPE_ICON[(row.def as any).field_type] ?? "·") : "⊙"}
            </span>

            {/* Label */}
            <div style={{ flex: 1, minWidth: 0, opacity: row.kind === "std" && row.hidden ? 0.35 : 1 }}>
              {row.kind === "std" && renaming?.key === row.key ? (
                <input
                  autoFocus
                  value={renaming.value}
                  onChange={e => setRenaming({ key: row.key, value: e.target.value })}
                  onBlur={() => commitRename(row.key, renaming.value, row.defaultLabel)}
                  onKeyDown={e => { if (e.key === "Enter") commitRename(row.key, renaming.value, row.defaultLabel); if (e.key === "Escape") setRenaming(null); }}
                  style={{ fontSize: 13, fontWeight: 600, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.2)", borderRadius: 5, padding: "2px 6px", color: "inherit", width: "100%", boxSizing: "border-box" }}
                />
              ) : (
                <span
                  style={{ fontSize: 13, fontWeight: 600, cursor: row.kind === "std" ? "text" : "default", textDecoration: row.kind === "std" && row.hidden ? "line-through" : "none" }}
                  title={row.kind === "std" ? "Click to rename" : undefined}
                  onClick={() => { if (row.kind === "std") setRenaming({ key: row.key, value: row.label }); }}
                >
                  {row.kind === "std" ? row.label : (row.def as any).label}
                </span>
              )}
              {row.kind === "std" && row.label !== row.defaultLabel && renaming?.key !== row.key && (
                <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.35 }}>(default: {row.defaultLabel})</span>
              )}
              {row.kind === "cf" && (
                <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.35 }}>{FIELD_TYPE_ICON[(row.def as any).field_type] ?? ""} {(row.def as any).field_type}</span>
              )}
            </div>

            {/* Scope pill */}
            <button
              title={snap ? "Shown in summary card — click for detail only" : "Detail only — click to show in summary"}
              onClick={() => toggleScope(row)}
              style={{ padding: "3px 8px", fontSize: 10, fontWeight: 600, borderRadius: 20, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, border: snap ? "1px solid rgba(99,102,241,.5)" : `1px solid ${borderColor}`, background: snap ? "rgba(99,102,241,.15)" : "rgba(255,255,255,.04)", color: snap ? "#a5b4fc" : dimColor }}
            >
              {snap ? "Summary" : "Detail only"}
            </button>

            {/* Standard: eye toggle */}
            {row.kind === "std" && (
              <button
                onClick={() => toggleHidden(row as Row & { kind: "std" })}
                title={row.hidden ? "Show field" : "Hide field"}
                style={{ ...BTN, padding: "3px 6px", color: row.hidden ? "rgba(255,255,255,.25)" : "inherit" }}
              >
                {row.hidden ? "👁‍🗨" : "👁"}
              </button>
            )}

            {/* Custom: edit + archive */}
            {row.kind === "cf" && (
              <>
                <button onClick={() => setModal({ open: true, editing: row.def })} style={{ ...BTN, padding: "3px 8px" }}>Edit</button>
                <button onClick={() => archiveCf(row.def)} style={{ ...BTN, padding: "3px 8px", opacity: 0.4 }}>×</button>
              </>
            )}
          </div>
        );
      })}

      <button
        onClick={() => setModal({ open: true })}
        style={{ display: "block", marginTop: 10, padding: "7px 14px", fontSize: 12, borderRadius: 7, border: `1px dashed ${borderColor}`, background: "rgba(255,255,255,.02)", color: dimColor, cursor: "pointer", width: "100%" }}
      >
        + Add Custom Field
      </button>

      {modal.open && (
        <FieldDefinitionModal
          editing={modal.editing}
          defaults={{ record_type: "sitrep_items", pipeline_type_key: null, sitrep_type_id: sitrepTypeId }}
          contactTypes={[]}
          onSave={handleCfSaved}
          onClose={() => setModal({ open: false })}
        />
      )}
    </div>
  );
}
