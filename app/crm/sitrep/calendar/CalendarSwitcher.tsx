"use client";

import { useState, useEffect } from "react";
import { type CalendarContext, type SitRepView } from "@/lib/sitrep-calendar-filter";
import { getFamilyByKey } from "@/lib/sitrep-colors";

// Legacy compat re-exports
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

const COMMON_STATUSES = [
  { slug: "open",        name: "Open"        },
  { slug: "in_progress", name: "In Progress" },
  { slug: "confirmed",   name: "Confirmed"   },
  { slug: "done",        name: "Done"        },
  { slug: "cancelled",   name: "Cancelled"   },
];

type SquadInfo    = { id: string; name: string; color: string; tenantId: string; role: string };
type OrgInfo      = { id: string; name: string };
type TypeInfo     = { slug: string; name: string; color: string };
type FavoriteInfo = { id: string | null; favorite_user_id: string; detail_level: "busy" | "basic" | "full"; name?: string };

function Toggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button type="button" onClick={onToggle} style={{
      display: "flex", alignItems: "center", gap: 8,
      width: "100%", padding: "5px 0",
      background: "none", border: "none", cursor: "pointer", textAlign: "left",
    }}>
      <span style={{
        width: 28, height: 15, borderRadius: 8, flexShrink: 0, position: "relative",
        background: on ? "rgba(99,102,241,.7)" : "rgba(255,255,255,.1)",
        transition: "background .12s",
      }}>
        <span style={{
          position: "absolute", top: 2, left: on ? 15 : 2,
          width: 11, height: 11, borderRadius: "50%",
          background: on ? "#fff" : "rgba(255,255,255,.5)",
          transition: "left .12s",
        }} />
      </span>
      <span style={{ fontSize: 12, color: on ? S.brt : S.dim }}>{label}</span>
    </button>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: "8px 12px 4px",
      fontSize: 10, fontWeight: 700, color: S.dim,
      letterSpacing: "0.07em", textTransform: "uppercase",
    }}>{children}</div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: S.border, margin: "6px 12px" }} />;
}

function Pill({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} type="button" style={{
      padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 600,
      border: `1px solid ${on ? "rgba(99,102,241,.4)" : S.border}`,
      background: on ? "rgba(99,102,241,.15)" : "transparent",
      color: on ? "#a5b4fc" : S.dim, cursor: "pointer",
    }}>{label}</button>
  );
}

function ViewRow({ view, active, onSelect, onRename, onDelete }: {
  view: SitRepView; active: boolean;
  onSelect: () => void; onRename: (name: string) => void; onDelete: () => void;
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
      borderRadius: 7, margin: "1px 6px",
    }}>
      {editing ? (
        <input
          autoFocus value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") { setName(view.name); setEditing(false); }
          }}
          style={{ flex: 1, padding: "2px 6px", borderRadius: 5, fontSize: 12, background: S.card, border: `1px solid ${S.border}`, color: S.text }}
        />
      ) : (
        <span onClick={onSelect} style={{ flex: 1, fontSize: 12, color: active ? S.text : S.dim, cursor: "pointer", userSelect: "none" }}>
          {view.name}
        </span>
      )}
      <button onClick={() => setEditing((v) => !v)} title="Rename"
        style={{ background: "none", border: "none", cursor: "pointer", color: S.dim, fontSize: 11, padding: "2px 4px", opacity: 0.7, flexShrink: 0 }}>✎</button>
      {!view.is_default && (
        <button onClick={onDelete} title="Delete"
          style={{ background: "none", border: "none", cursor: "pointer", color: S.dim, fontSize: 11, padding: "2px 4px", opacity: 0.5, flexShrink: 0 }}>✕</button>
      )}
    </div>
  );
}

export default function CalendarSwitcher({
  views,
  activeViewId,
  onSelectView,
  squads,
  orgs,
  allTypes,
  context,
  onContextChange,
  onViewsChanged,
}: {
  views:           SitRepView[];
  activeViewId:    string | null;
  onSelectView:    (id: string) => void;
  squads:          SquadInfo[];
  orgs:            OrgInfo[];
  allTypes:        TypeInfo[];
  context:         CalendarContext;
  onContextChange: (ctx: CalendarContext) => void;
  onViewsChanged:  () => Promise<void>;
}) {
  const [creating, setCreating]       = useState(false);
  const [newName, setNewName]         = useState("");
  const [busy, setBusy]               = useState(false);
  const [favorites, setFavorites]     = useState<FavoriteInfo[]>([]);
  const [addFavEmail, setAddFavEmail] = useState("");
  const [addFavBusy, setAddFavBusy]   = useState(false);
  const [addFavErr, setAddFavErr]     = useState("");

  useEffect(() => {
    fetch("/api/crm/sitrep/favorites")
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setFavorites(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  // ── Toggles ────────────────────────────────────────────────────────────────

  function toggleOrg(orgId: string) {
    const next = context.orgIds.includes(orgId)
      ? context.orgIds.filter((id) => id !== orgId)
      : [...context.orgIds, orgId];
    onContextChange({ ...context, orgIds: next });
  }

  function togglePersonal() {
    onContextChange({ ...context, personalOn: !context.personalOn });
  }

  function toggleSquad(squadId: string) {
    const next = context.squadIds.includes(squadId)
      ? context.squadIds.filter((id) => id !== squadId)
      : [...context.squadIds, squadId];
    onContextChange({ ...context, squadIds: next });
  }

  function toggleFavorite(favUserId: string) {
    const next = context.favoriteIds.includes(favUserId)
      ? context.favoriteIds.filter((id) => id !== favUserId)
      : [...context.favoriteIds, favUserId];
    onContextChange({ ...context, favoriteIds: next });
  }

  function toggleItemType(slug: string) {
    const cur = context.filters.item_types;
    const allSlugs = allTypes.map((t) => t.slug);
    let next: string[];
    if (cur.length === 0) {
      next = allSlugs.filter((s) => s !== slug);
    } else if (cur.includes(slug)) {
      next = cur.filter((s) => s !== slug);
      if (next.length === 0 || allSlugs.every((s) => next.includes(s))) next = [];
    } else {
      next = [...cur, slug];
      if (allSlugs.every((s) => next.includes(s))) next = [];
    }
    onContextChange({ ...context, filters: { ...context.filters, item_types: next } });
  }

  function toggleStatus(slug: string) {
    const cur = context.filters.statuses;
    const allSlugs = COMMON_STATUSES.map((s) => s.slug);
    let next: string[];
    if (cur.length === 0) {
      next = allSlugs.filter((s) => s !== slug);
    } else if (cur.includes(slug)) {
      next = cur.filter((s) => s !== slug);
      if (next.length === 0 || allSlugs.every((s) => next.includes(s))) next = [];
    } else {
      next = [...cur, slug];
      if (allSlugs.every((s) => next.includes(s))) next = [];
    }
    onContextChange({ ...context, filters: { ...context.filters, statuses: next } });
  }

  function toggleShowCompleted() {
    onContextChange({ ...context, filters: { ...context.filters, show_completed: !context.filters.show_completed } });
  }

  // ── View CRUD ──────────────────────────────────────────────────────────────

  async function handleCreate() {
    const trimmed = newName.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    const res = await fetch("/api/crm/sitrep/views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: trimmed,
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
      setCreating(false); setNewName("");
      const data = await res.json();
      await onViewsChanged();
      if (data.id) onSelectView(data.id);
    }
  }

  async function handleRename(viewId: string, name: string) {
    await fetch(`/api/crm/sitrep/views/${viewId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }),
    });
    await onViewsChanged();
  }

  async function handleDelete(viewId: string) {
    if (!confirm("Delete this view?")) return;
    await fetch(`/api/crm/sitrep/views/${viewId}`, { method: "DELETE" });
    await onViewsChanged();
    if (viewId === activeViewId) {
      const remaining = views.filter((v) => v.id !== viewId);
      if (remaining[0]) onSelectView(remaining[0].id);
    }
  }

  // ── Favorites CRUD ─────────────────────────────────────────────────────────

  async function handleAddFavorite() {
    const email = addFavEmail.trim();
    if (!email || addFavBusy) return;
    setAddFavBusy(true);
    setAddFavErr("");
    const res = await fetch("/api/crm/sitrep/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, detail_level: "busy" }),
    });
    const json = await res.json().catch(() => ({}));
    setAddFavBusy(false);
    if (res.ok) {
      setAddFavEmail("");
      const refetch = await fetch("/api/crm/sitrep/favorites");
      if (refetch.ok) setFavorites(await refetch.json());
    } else {
      setAddFavErr(json.error ?? "User not found");
    }
  }

  async function handleRemoveFavorite(favId: string | null, favUserId: string) {
    if (favId) await fetch(`/api/crm/sitrep/favorites/${favId}`, { method: "DELETE" });
    setFavorites((p) => p.filter((f) => f.favorite_user_id !== favUserId));
    onContextChange({ ...context, favoriteIds: context.favoriteIds.filter((id) => id !== favUserId) });
  }

  async function handleFavDetailLevel(favId: string | null, favUserId: string, level: "busy" | "basic" | "full") {
    if (!favId) {
      // Implicit contact — create the row on first explicit config change
      const res = await fetch("/api/crm/sitrep/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favorite_user_id: favUserId, detail_level: level }),
      });
      if (res.ok) {
        const data = await res.json();
        setFavorites((p) => p.map((f) => f.favorite_user_id === favUserId ? { ...f, id: data.id, detail_level: level } : f));
      }
      return;
    }
    await fetch(`/api/crm/sitrep/favorites/${favId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ detail_level: level }),
    });
    setFavorites((p) => p.map((f) => f.id === favId ? { ...f, detail_level: level } : f));
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{
      width: 220, flexShrink: 0,
      borderRight: `1px solid ${S.border}`,
      display: "flex", flexDirection: "column",
      overflowY: "auto", paddingBottom: 32,
      background: S.panel,
    }}>

      {/* ── Views ── */}
      <Label>Views</Label>
      {views.map((view) => (
        <ViewRow
          key={view.id} view={view} active={view.id === activeViewId}
          onSelect={() => onSelectView(view.id)}
          onRename={(name) => handleRename(view.id, name)}
          onDelete={() => handleDelete(view.id)}
        />
      ))}
      {creating ? (
        <div style={{ padding: "6px 12px", display: "flex", gap: 5 }}>
          <input
            autoFocus value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") { setCreating(false); setNewName(""); }
            }}
            placeholder="View name…"
            style={{ flex: 1, padding: "4px 8px", borderRadius: 6, fontSize: 11, background: S.card, border: `1px solid ${S.border}`, color: S.text }}
          />
          <button onClick={handleCreate} disabled={!newName.trim() || busy}
            style={{ padding: "4px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, border: "none", background: "var(--gg-primary,#2563eb)", color: "#fff", cursor: "pointer" }}>
            {busy ? "…" : "Add"}
          </button>
        </div>
      ) : (
        <button onClick={() => setCreating(true)} style={{
          margin: "4px 12px", padding: "4px 0", fontSize: 11, fontWeight: 600,
          background: "none", border: `1px dashed ${S.border}`, borderRadius: 6, color: S.dim, cursor: "pointer",
        }}>+ New View</button>
      )}

      <Divider />

      {/* ── Work (per-org sub-toggles) ── */}
      <Label>Work</Label>
      <div style={{ padding: "2px 12px" }}>
        {orgs.map((org) => (
          <Toggle key={org.id} on={context.orgIds.includes(org.id)} onToggle={() => toggleOrg(org.id)} label={org.name} />
        ))}
      </div>

      <Divider />

      {/* ── Personal ── */}
      <div style={{ padding: "2px 12px" }}>
        <Toggle on={context.personalOn} onToggle={togglePersonal} label="Personal" />
      </div>

      {/* ── Squads ── */}
      {squads.length > 0 && (
        <>
          <Divider />
          <Label>Squads</Label>
          <div style={{ padding: "2px 12px" }}>
            {squads.map((sq) => {
              const dot = getFamilyByKey(sq.color)?.shades[3] ?? "#818cf8";
              const on  = context.squadIds.includes(sq.id);
              return (
                <button key={sq.id} type="button" onClick={() => toggleSquad(sq.id)} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  width: "100%", padding: "5px 0",
                  background: "none", border: "none", cursor: "pointer", textAlign: "left",
                }}>
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
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: on ? S.brt : S.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {sq.name}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* ── Favorites ── */}
      <Divider />
      <Label>Favorites</Label>
      <div style={{ padding: "2px 12px" }}>
        {favorites.map((fav) => {
          const on = context.favoriteIds.includes(fav.favorite_user_id);
          return (
            <div key={fav.id ?? fav.favorite_user_id} style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 0" }}>
              <span
                onClick={() => toggleFavorite(fav.favorite_user_id)}
                style={{
                  width: 28, height: 15, borderRadius: 8, flexShrink: 0, position: "relative", cursor: "pointer",
                  background: on ? "rgba(99,102,241,.7)" : "rgba(255,255,255,.1)",
                  transition: "background .12s",
                }}
              >
                <span style={{
                  position: "absolute", top: 2, left: on ? 15 : 2, width: 11, height: 11,
                  borderRadius: "50%", background: on ? "#fff" : "rgba(255,255,255,.5)",
                  transition: "left .12s",
                }} />
              </span>
              <span style={{ flex: 1, fontSize: 11, color: S.brt, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {fav.name ?? fav.favorite_user_id.slice(0, 8)}
              </span>
              <select
                value={fav.detail_level}
                onChange={(e) => handleFavDetailLevel(fav.id, fav.favorite_user_id, e.target.value as "busy" | "basic" | "full")}
                style={{ fontSize: 10, padding: "1px 3px", borderRadius: 4, background: S.card, border: `1px solid ${S.border}`, color: S.dim, flexShrink: 0 }}
              >
                <option value="busy">Busy</option>
                <option value="basic">Basic</option>
                <option value="full">Full</option>
              </select>
              <button
                onClick={() => handleRemoveFavorite(fav.id, fav.favorite_user_id)}
                style={{ background: "none", border: "none", cursor: "pointer", color: S.dim, fontSize: 11, padding: "1px 3px", opacity: 0.5, flexShrink: 0 }}
              >✕</button>
            </div>
          );
        })}
        <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
          <input
            type="email" value={addFavEmail}
            onChange={(e) => { setAddFavEmail(e.target.value); setAddFavErr(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") handleAddFavorite(); }}
            placeholder="+ Add by email"
            style={{ flex: 1, padding: "4px 6px", borderRadius: 5, fontSize: 11, background: S.card, border: `1px solid ${S.border}`, color: S.text, minWidth: 0 }}
          />
          {addFavEmail.trim() && (
            <button onClick={handleAddFavorite} disabled={addFavBusy} style={{
              padding: "4px 7px", borderRadius: 5, fontSize: 10, fontWeight: 600,
              border: "none", background: "var(--gg-primary,#2563eb)", color: "#fff", cursor: "pointer",
            }}>{addFavBusy ? "…" : "Add"}</button>
          )}
        </div>
        {addFavErr && <p style={{ margin: "4px 0 0", fontSize: 11, color: "#fca5a5" }}>{addFavErr}</p>}
      </div>

      {/* ── Filters ── */}
      <Divider />
      <Label>Filters</Label>
      <div style={{ padding: "2px 12px 6px" }}>
        <div style={{ fontSize: 10, color: S.dim, marginBottom: 5 }}>Item types</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginBottom: 10 }}>
          {allTypes.map((t) => {
            const on = context.filters.item_types.length === 0 || context.filters.item_types.includes(t.slug);
            return <Pill key={t.slug} on={on} onClick={() => toggleItemType(t.slug)} label={t.name} />;
          })}
        </div>

        <div style={{ fontSize: 10, color: S.dim, marginBottom: 5 }}>Status</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginBottom: 10 }}>
          {COMMON_STATUSES.map((s) => {
            const on = context.filters.statuses.length === 0 || context.filters.statuses.includes(s.slug);
            return <Pill key={s.slug} on={on} onClick={() => toggleStatus(s.slug)} label={s.name} />;
          })}
        </div>

        <Toggle
          on={!context.filters.show_completed}
          onToggle={toggleShowCompleted}
          label="Hide completed"
        />
      </div>
    </div>
  );
}
