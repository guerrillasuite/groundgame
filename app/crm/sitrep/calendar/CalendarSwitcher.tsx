"use client";

import { useState } from "react";
import { type CalendarContext, type SitRepView } from "@/lib/sitrep-calendar-filter";
import { getFamilyByKey } from "@/lib/sitrep-colors";

// Re-exported for CalendarLayout legacy compatibility
export type CalendarTypeData = never;
export type SharedViewData   = never;

const S = {
  bg:     "rgb(10 13 20)",
  panel:  "rgb(15 19 28)",
  border: "rgba(255,255,255,.07)",
  text:   "rgb(236 240 245)",
  dim:    "rgb(100 116 139)",
  brt:    "rgb(148 163 184)",
  card:   "rgb(22 28 40)",
} as const;

type SquadInfo = { id: string; name: string; color: string; tenantId: string; role: string };

function Toggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        width: "100%", padding: "5px 0",
        background: "none", border: "none", cursor: "pointer",
        textAlign: "left",
      }}
    >
      <span style={{
        width: 28, height: 15, borderRadius: 8, flexShrink: 0, position: "relative",
        background: on ? "rgba(99,102,241,.7)" : "rgba(255,255,255,.1)",
        transition: "background .12s",
      }}>
        <span style={{
          position: "absolute", top: 2, left: on ? 15 : 2, width: 11, height: 11,
          borderRadius: "50%", background: on ? "#fff" : "rgba(255,255,255,.5)",
          transition: "left .12s",
        }} />
      </span>
      <span style={{ fontSize: 12, color: on ? S.brt : S.dim }}>{label}</span>
    </button>
  );
}

function ViewRow({
  view,
  active,
  onSelect,
  onRename,
  onDelete,
}: {
  view:     SitRepView;
  active:   boolean;
  onSelect: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName]       = useState(view.name);

  function commit() {
    const trimmed = name.trim();
    if (trimmed && trimmed !== view.name) onRename(trimmed);
    setEditing(false);
  }

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      padding: "5px 10px",
      background: active ? "rgba(255,255,255,.07)" : "transparent",
      borderRadius: 7,
      margin: "1px 6px",
    }}>
      {editing ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setName(view.name); setEditing(false); } }}
          style={{
            flex: 1, padding: "2px 6px", borderRadius: 5, fontSize: 12,
            background: S.card, border: `1px solid ${S.border}`, color: S.text,
          }}
        />
      ) : (
        <span
          onClick={onSelect}
          style={{ flex: 1, fontSize: 12, color: active ? S.text : S.dim, cursor: "pointer", userSelect: "none" }}
        >
          {view.name}
        </span>
      )}
      <button
        onClick={() => setEditing((v) => !v)}
        title="Rename"
        style={{ background: "none", border: "none", cursor: "pointer", color: S.dim, fontSize: 11, padding: "2px 4px", opacity: 0.7, flexShrink: 0 }}
      >✎</button>
      {!view.is_default && (
        <button
          onClick={onDelete}
          title="Delete"
          style={{ background: "none", border: "none", cursor: "pointer", color: S.dim, fontSize: 11, padding: "2px 4px", opacity: 0.5, flexShrink: 0 }}
        >✕</button>
      )}
    </div>
  );
}

export default function CalendarSwitcher({
  views,
  activeViewId,
  onSelectView,
  squads,
  tenantId,
  context,
  onContextChange,
  onViewsChanged,
}: {
  views:            SitRepView[];
  activeViewId:     string | null;
  onSelectView:     (id: string) => void;
  squads:           SquadInfo[];
  tenantId:         string;
  context:          CalendarContext;
  onContextChange:  (ctx: CalendarContext) => void;
  onViewsChanged:   () => Promise<void>;
}) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName]   = useState("");
  const [busy, setBusy]         = useState(false);

  function toggleOrg() {
    const ids = context.orgIds;
    const next = ids.includes(tenantId)
      ? ids.filter((id) => id !== tenantId)
      : [...ids, tenantId];
    onContextChange({ ...context, orgIds: next });
  }

  function togglePersonal() {
    onContextChange({ ...context, personalOn: !context.personalOn });
  }

  function toggleSquad(squadId: string) {
    const ids = context.squadIds;
    const next = ids.includes(squadId)
      ? ids.filter((id) => id !== squadId)
      : [...ids, squadId];
    onContextChange({ ...context, squadIds: next });
  }

  async function handleCreate() {
    const trimmed = newName.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    const res = await fetch("/api/crm/sitrep/views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name:        trimmed,
        toggle_state: {
          org_ids:      context.orgIds,
          squad_ids:    context.squadIds,
          personal:     context.personalOn,
          favorite_ids: context.favoriteIds,
          filters:      context.filters,
        },
        is_default: false,
        sort_order: views.length,
      }),
    });
    setBusy(false);
    if (res.ok) {
      setCreating(false);
      setNewName("");
      const data = await res.json();
      await onViewsChanged();
      if (data.id) onSelectView(data.id);
    }
  }

  async function handleRename(viewId: string, name: string) {
    await fetch(`/api/crm/sitrep/views/${viewId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    await onViewsChanged();
  }

  async function handleDelete(viewId: string) {
    if (!confirm("Delete this view?")) return;
    await fetch(`/api/crm/sitrep/views/${viewId}`, { method: "DELETE" });
    await onViewsChanged();
    // If deleted view was active, select first remaining
    if (viewId === activeViewId) {
      const remaining = views.filter((v) => v.id !== viewId);
      if (remaining[0]) onSelectView(remaining[0].id);
    }
  }

  const workOn  = context.orgIds.includes(tenantId);

  return (
    <div style={{
      width: 220, flexShrink: 0,
      borderRight: `1px solid ${S.border}`,
      display: "flex", flexDirection: "column",
      overflowY: "auto",
      paddingBottom: 24,
      background: S.panel,
    }}>

      {/* Views */}
      <div style={{
        padding: "10px 12px 4px",
        fontSize: 10, fontWeight: 700, color: S.dim,
        letterSpacing: "0.07em", textTransform: "uppercase",
      }}>Views</div>

      {views.map((view) => (
        <ViewRow
          key={view.id}
          view={view}
          active={view.id === activeViewId}
          onSelect={() => onSelectView(view.id)}
          onRename={(name) => handleRename(view.id, name)}
          onDelete={() => handleDelete(view.id)}
        />
      ))}

      {creating ? (
        <div style={{ padding: "6px 12px", display: "flex", gap: 5 }}>
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") { setCreating(false); setNewName(""); } }}
            placeholder="View name…"
            style={{ flex: 1, padding: "4px 8px", borderRadius: 6, fontSize: 11, background: S.card, border: `1px solid ${S.border}`, color: S.text }}
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim() || busy}
            style={{ padding: "4px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, border: "none", background: "var(--gg-primary,#2563eb)", color: "#fff", cursor: "pointer" }}
          >{busy ? "…" : "Add"}</button>
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          style={{
            margin: "4px 12px", padding: "4px 0",
            fontSize: 11, fontWeight: 600,
            background: "none", border: `1px dashed ${S.border}`, borderRadius: 6,
            color: S.dim, cursor: "pointer",
          }}
        >+ New View</button>
      )}

      <div style={{ height: 1, background: S.border, margin: "10px 12px 6px" }} />

      {/* Toggles — what the active view shows */}
      <div style={{
        padding: "0 12px 4px",
        fontSize: 10, fontWeight: 700, color: S.dim,
        letterSpacing: "0.07em", textTransform: "uppercase",
      }}>Show in View</div>

      <div style={{ padding: "2px 12px" }}>
        <Toggle on={workOn}              onToggle={toggleOrg}     label="Work" />
        <Toggle on={context.personalOn}  onToggle={togglePersonal} label="Personal" />
      </div>

      {squads.length > 0 && (
        <>
          <div style={{
            padding: "8px 12px 4px",
            fontSize: 10, fontWeight: 700, color: S.dim,
            letterSpacing: "0.07em", textTransform: "uppercase",
          }}>Squads</div>
          <div style={{ padding: "2px 12px" }}>
            {squads.map((sq) => {
              const dot = getFamilyByKey(sq.color)?.shades[3] ?? "#818cf8";
              return (
                <button
                  key={sq.id}
                  type="button"
                  onClick={() => toggleSquad(sq.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    width: "100%", padding: "5px 0",
                    background: "none", border: "none", cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <span style={{
                    width: 28, height: 15, borderRadius: 8, flexShrink: 0, position: "relative",
                    background: context.squadIds.includes(sq.id) ? "rgba(99,102,241,.7)" : "rgba(255,255,255,.1)",
                    transition: "background .12s",
                  }}>
                    <span style={{
                      position: "absolute", top: 2,
                      left: context.squadIds.includes(sq.id) ? 15 : 2,
                      width: 11, height: 11,
                      borderRadius: "50%",
                      background: context.squadIds.includes(sq.id) ? "#fff" : "rgba(255,255,255,.5)",
                      transition: "left .12s",
                    }} />
                  </span>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: context.squadIds.includes(sq.id) ? S.brt : S.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {sq.name}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
