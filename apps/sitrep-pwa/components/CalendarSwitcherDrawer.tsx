"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { getFamilyByKey } from "@/lib/sitrep-colors";
import { type CalendarContext, type SitRepView, defaultContext } from "@/lib/sitrep-calendar-filter";

// Legacy re-exports kept for type compatibility during migration
export type CalendarTypeData = never;
export type SharedViewData   = never;

const S = {
  bg:     "rgb(15 19 28)",
  border: "rgba(255,255,255,.07)",
  text:   "rgb(236 240 245)",
  dim:    "rgb(100 116 139)",
  dimBrt: "rgb(148 163 184)",
} as const;

type SquadInfo = { id: string; name: string; color: string; tenantId: string; role: string };
type OrgInfo   = { id: string; name: string };

function IOSToggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        width: "100%", padding: "9px 0",
        background: "none", border: "none", cursor: "pointer", textAlign: "left",
      }}
    >
      <div
        style={{
          position: "relative", width: 38, height: 21, borderRadius: 11, flexShrink: 0,
          background: on ? "var(--gg-primary,#2563eb)" : "rgba(255,255,255,.12)",
          boxShadow: on
            ? "0 0 8px color-mix(in srgb, var(--gg-primary,#2563eb) 45%, transparent)"
            : "inset 0 1px 3px rgba(0,0,0,.4)",
          transition: "background .2s ease, box-shadow .2s ease",
        }}
      >
        <div style={{
          position: "absolute", top: 2, left: on ? 19 : 2, width: 17, height: 17,
          borderRadius: "50%", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,.35)",
          transition: "left .2s ease",
        }} />
      </div>
      <span style={{ fontSize: 14, color: on ? S.dimBrt : S.dim }}>{label}</span>
    </button>
  );
}

interface Props {
  open:             boolean;
  onClose:          () => void;
  views?:           SitRepView[];
  activeViewId?:    string | null;
  onSelectView?:    (id: string) => void;
  squads?:          SquadInfo[];
  orgs?:            OrgInfo[];
  context?:         CalendarContext;
  onContextChange?: (ctx: CalendarContext) => void;
  onViewsChanged?:  () => Promise<void>;
}

export default function CalendarSwitcherDrawer({
  open, onClose,
  views = [],
  activeViewId = null,
  onSelectView = () => {},
  squads = [],
  orgs = [],
  context: contextProp,
  onContextChange = () => {},
  onViewsChanged = async () => {},
}: Props) {
  const ctx = contextProp ?? defaultContext(orgs.map((o) => o.id), squads.map((s) => s.id));
  const [mounted,  setMounted]  = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName,  setNewName]  = useState("");
  const [busy,     setBusy]     = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName,  setEditName]  = useState("");

  useEffect(() => { setMounted(true); }, []);

  function toggleOrg(orgId: string) {
    const ids = ctx.orgIds;
    const next = ids.includes(orgId)
      ? ids.filter((id) => id !== orgId)
      : [...ids, orgId];
    onContextChange({ ...ctx, orgIds: next });
  }

  function togglePersonal() {
    onContextChange({ ...ctx, personalOn: !ctx.personalOn });
  }

  function toggleSquad(squadId: string) {
    const ids = ctx.squadIds;
    const next = ids.includes(squadId)
      ? ids.filter((id) => id !== squadId)
      : [...ids, squadId];
    onContextChange({ ...ctx, squadIds: next });
  }

  async function handleCreate() {
    const trimmed = newName.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    const res = await fetch("/api/sitrep/views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: trimmed,
        toggle_state: {
          org_ids:      ctx.orgIds,
          squad_ids:    ctx.squadIds,
          personal:     ctx.personalOn,
          favorite_ids: ctx.favoriteIds,
          filters:      ctx.filters,
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

  async function handleRename(viewId: string) {
    const trimmed = editName.trim();
    if (!trimmed) { setEditingId(null); return; }
    await fetch(`/api/sitrep/views/${viewId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    setEditingId(null);
    await onViewsChanged();
  }

  async function handleDelete(viewId: string, viewName: string) {
    if (!confirm(`Delete view "${viewName}"?`)) return;
    await fetch(`/api/sitrep/views/${viewId}`, { method: "DELETE" });
    await onViewsChanged();
    if (viewId === activeViewId) {
      const remaining = views.filter((v) => v.id !== viewId);
      if (remaining[0]) onSelectView(remaining[0].id);
    }
  }

  if (!mounted) return null;

  const drawer = (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      pointerEvents: open ? "auto" : "none",
      display: "flex",
    }}>
      {/* Backdrop */}
      <div
        style={{
          position: "absolute", inset: 0, background: "rgba(0,0,0,.6)",
          opacity: open ? 1 : 0, transition: "opacity .2s",
        }}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div style={{
        position: "relative", zIndex: 1,
        width: 280, maxWidth: "85vw",
        height: "100%",
        background: S.bg,
        borderRight: `1px solid ${S.border}`,
        display: "flex", flexDirection: "column",
        transform: open ? "translateX(0)" : "translateX(-100%)",
        transition: "transform .22s cubic-bezier(.4,0,.2,1)",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 14px",
          paddingTop: "max(16px, env(safe-area-inset-top))",
          borderBottom: `1px solid ${S.border}`,
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: S.text, letterSpacing: "0.02em" }}>
            My Calendars
          </span>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: S.dim, fontSize: 18, cursor: "pointer", padding: "2px 6px" }}
          >✕</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", paddingBottom: 24 }}>

          {/* Views */}
          <div style={{
            padding: "12px 14px 6px",
            fontSize: 10, fontWeight: 700, color: S.dim,
            letterSpacing: "0.07em", textTransform: "uppercase",
          }}>Views</div>

          {views.map((view) => (
            <div key={view.id} style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "7px 14px",
              background: view.id === activeViewId ? "rgba(255,255,255,.06)" : "transparent",
            }}>
              {editingId === view.id ? (
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={() => handleRename(view.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRename(view.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  style={{
                    flex: 1, padding: "4px 8px", borderRadius: 6, fontSize: 13,
                    background: "rgba(255,255,255,.08)", border: `1px solid ${S.border}`,
                    color: S.text, outline: "none",
                  }}
                />
              ) : (
                <span
                  onClick={() => { onSelectView(view.id); onClose(); }}
                  style={{
                    flex: 1, fontSize: 13, cursor: "pointer",
                    color: view.id === activeViewId ? S.text : S.dim,
                    fontWeight: view.id === activeViewId ? 600 : 400,
                  }}
                >
                  {view.name}
                </span>
              )}
              <button
                onClick={() => { setEditingId(view.id); setEditName(view.name); }}
                style={{ background: "none", border: "none", color: S.dim, fontSize: 12, cursor: "pointer", padding: "2px 4px", opacity: 0.7 }}
              >✎</button>
              {!view.is_default && (
                <button
                  onClick={() => handleDelete(view.id, view.name)}
                  style={{ background: "none", border: "none", color: S.dim, fontSize: 12, cursor: "pointer", padding: "2px 4px", opacity: 0.5 }}
                >✕</button>
              )}
            </div>
          ))}

          {creating ? (
            <div style={{ padding: "6px 14px", display: "flex", gap: 6 }}>
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                  if (e.key === "Escape") { setCreating(false); setNewName(""); }
                }}
                placeholder="View name…"
                style={{
                  flex: 1, padding: "6px 10px", borderRadius: 7, fontSize: 13,
                  background: "rgba(255,255,255,.08)", border: `1px solid ${S.border}`,
                  color: S.text, outline: "none",
                }}
              />
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || busy}
                style={{
                  padding: "6px 12px", borderRadius: 7, fontSize: 12, fontWeight: 700,
                  border: "none", background: "var(--gg-primary,#2563eb)", color: "#fff",
                  cursor: "pointer", opacity: !newName.trim() || busy ? 0.6 : 1,
                }}
              >{busy ? "…" : "Add"}</button>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              style={{
                margin: "4px 14px", padding: "7px 0",
                width: "calc(100% - 28px)",
                fontSize: 12, fontWeight: 600,
                background: "none", border: `1px dashed ${S.border}`, borderRadius: 8,
                color: S.dim, cursor: "pointer",
              }}
            >+ New View</button>
          )}

          <div style={{ height: 1, background: S.border, margin: "12px 14px 6px" }} />

          {/* Work / Org toggles */}
          {orgs.length > 0 && (
            <>
              <div style={{
                padding: "4px 14px 4px",
                fontSize: 10, fontWeight: 700, color: S.dim,
                letterSpacing: "0.07em", textTransform: "uppercase",
              }}>Work</div>
              <div style={{ padding: "0 14px" }}>
                {orgs.length === 1 ? (
                  <IOSToggle
                    on={ctx.orgIds.includes(orgs[0].id)}
                    onToggle={() => toggleOrg(orgs[0].id)}
                    label={orgs[0].name}
                  />
                ) : (
                  orgs.map((org) => (
                    <IOSToggle
                      key={org.id}
                      on={ctx.orgIds.includes(org.id)}
                      onToggle={() => toggleOrg(org.id)}
                      label={org.name}
                    />
                  ))
                )}
              </div>
            </>
          )}

          {/* Personal toggle */}
          <div style={{ padding: "0 14px" }}>
            <IOSToggle on={ctx.personalOn} onToggle={togglePersonal} label="Personal" />
          </div>

          {squads.length > 0 && (
            <>
              <div style={{
                padding: "8px 14px 4px",
                fontSize: 10, fontWeight: 700, color: S.dim,
                letterSpacing: "0.07em", textTransform: "uppercase",
              }}>Squads</div>
              <div style={{ padding: "0 14px" }}>
                {squads.map((sq) => {
                  const dot = getFamilyByKey(sq.color)?.shades[3] ?? "#818cf8";
                  const isOn = ctx.squadIds.includes(sq.id);
                  return (
                    <button
                      key={sq.id}
                      type="button"
                      onClick={() => toggleSquad(sq.id)}
                      style={{
                        display: "flex", alignItems: "center", gap: 10,
                        width: "100%", padding: "9px 0",
                        background: "none", border: "none", cursor: "pointer", textAlign: "left",
                      }}
                    >
                      <div style={{
                        position: "relative", width: 38, height: 21, borderRadius: 11, flexShrink: 0,
                        background: isOn ? "var(--gg-primary,#2563eb)" : "rgba(255,255,255,.12)",
                        transition: "background .2s ease",
                      }}>
                        <div style={{
                          position: "absolute", top: 2, left: isOn ? 19 : 2, width: 17, height: 17,
                          borderRadius: "50%", background: "#fff",
                          transition: "left .2s ease",
                        }} />
                      </div>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: dot, flexShrink: 0 }} />
                      <span style={{ fontSize: 14, color: isOn ? S.dimBrt : S.dim }}>{sq.name}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(drawer, document.body);
}
