"use client";

import { useState } from "react";
import { getFamilyByKey } from "@/lib/sitrep-colors";
import GlobalTypeEditor, { type GlobalTemplate } from "./GlobalTypeEditor";

const S = {
  bg:     "rgb(10 13 20)",
  card:   "rgb(20 25 38)",
  border: "rgba(255,255,255,.07)",
  text:   "rgb(236 240 245)",
  dim:    "rgb(100 116 139)",
} as const;

interface Props { initialTemplates: GlobalTemplate[] }

export default function AdminPanel({ initialTemplates }: Props) {
  const [templates, setTemplates] = useState<GlobalTemplate[]>(initialTemplates);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding]       = useState(false);
  const [newName, setNewName]     = useState("");
  const [newColor, setNewColor]   = useState("blue");
  const [createErr, setCreateErr] = useState("");
  const [creating, setCreating]   = useState(false);
  const [deleteId, setDeleteId]   = useState<string | null>(null);
  const [deleting, setDeleting]   = useState(false);

  function onSaved(updated: GlobalTemplate) {
    setTemplates((p) => p.map((t) => t.id === updated.id ? updated : t));
    setEditingId(null);
  }

  async function handleCreate() {
    if (!newName.trim()) { setCreateErr("Name required"); return; }
    setCreating(true); setCreateErr("");
    const res = await fetch("/api/admin/global-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), color: newColor }),
    });
    const data = await res.json();
    if (!res.ok) { setCreateErr(data.error ?? "Failed"); setCreating(false); return; }
    setTemplates((p) => [...p, data]);
    setNewName(""); setAdding(false);
    setCreating(false);
  }

  async function handleDelete(id: string) {
    if (deleteId !== id) { setDeleteId(id); return; }
    setDeleting(true);
    const res = await fetch(`/api/admin/global-types/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) { alert(data.error ?? "Failed to delete"); setDeleting(false); setDeleteId(null); return; }
    if (data.soft) {
      // Soft-deleted system type: mark inactive in state
      setTemplates((p) => p.map((t) => t.id === id ? { ...t, is_active: false } : t));
    } else {
      setTemplates((p) => p.filter((t) => t.id !== id));
    }
    setDeleteId(null); setDeleting(false);
  }

  return (
    <div style={{ minHeight: "100dvh", background: S.bg, padding: "32px 24px", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: S.dim, marginBottom: 6 }}>
            GuerrillaSuite Internal — Not for tenants
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: S.text, margin: 0, letterSpacing: "-0.02em" }}>
            SitRep Admin
          </h1>
        </div>

        {/* Section */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: S.text, margin: "0 0 4px" }}>Global Type Templates</h2>
              <p style={{ fontSize: 13, color: S.dim, margin: 0 }}>
                Seeded to every new tenant when they first open SitRep. Existing tenants are not affected.
              </p>
            </div>
            <button
              onClick={() => setAdding(true)}
              style={{
                flexShrink: 0, padding: "8px 16px", borderRadius: 8, border: "none",
                background: "var(--gg-primary,#2563eb)", color: "#fff",
                fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
            >
              + Add Template
            </button>
          </div>

          {/* New template form */}
          {adding && (
            <div style={{
              background: S.card, border: `1px solid ${S.border}`, borderRadius: 12,
              padding: 16, marginBottom: 12, display: "flex", gap: 10, alignItems: "flex-end",
            }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: S.dim, display: "block", marginBottom: 5, textTransform: "uppercase" }}>Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  placeholder="e.g. Campaign"
                  style={{ padding: "8px 11px", borderRadius: 8, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)", color: S.text, fontSize: 13, outline: "none", width: "100%" }}
                  autoFocus
                />
                {createErr && <div style={{ fontSize: 11, color: "#fca5a5", marginTop: 4 }}>{createErr}</div>}
              </div>
              <button onClick={handleCreate} disabled={creating} style={{
                padding: "9px 16px", borderRadius: 8, border: "none",
                background: "var(--gg-primary,#2563eb)", color: "#fff",
                fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0,
              }}>{creating ? "Creating…" : "Create"}</button>
              <button onClick={() => { setAdding(false); setCreateErr(""); }} style={{
                padding: "9px 14px", borderRadius: 8, border: `1px solid ${S.border}`, background: "rgba(255,255,255,.04)",
                color: S.dim, fontSize: 13, cursor: "pointer", flexShrink: 0,
              }}>Cancel</button>
            </div>
          )}

          {/* Template table */}
          <div style={{ background: S.card, border: `1px solid ${S.border}`, borderRadius: 12, overflow: "hidden" }}>
            {templates.map((t, idx) => {
              const family = getFamilyByKey(t.color);
              const accent = family?.shades[2] ?? "#3b82f6";
              const isEditing = editingId === t.id;
              const isSystem  = ["task", "event", "meeting"].includes(t.slug);

              return (
                <div key={t.id}>
                  {idx > 0 && <div style={{ height: 1, background: S.border }} />}
                  {isEditing ? (
                    <div style={{ padding: 12 }}>
                      <GlobalTypeEditor template={t} onSaved={onSaved} onCancel={() => setEditingId(null)} />
                    </div>
                  ) : (
                    <div style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
                      opacity: t.is_active ? 1 : 0.45,
                    }}>
                      {/* Color dot */}
                      <div style={{ width: 10, height: 10, borderRadius: "50%", background: accent, flexShrink: 0 }} />

                      {/* Name + slug */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 600, color: S.text }}>{t.name}</span>
                          {!t.is_active && (
                            <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: "rgba(255,255,255,.08)", color: S.dim, letterSpacing: "0.05em" }}>
                              INACTIVE
                            </span>
                          )}
                          {isSystem && (
                            <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: `${accent}22`, color: accent, letterSpacing: "0.05em" }}>
                              SYSTEM
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: S.dim, marginTop: 2 }}>
                          {t.slug} · {t.color} ·{" "}
                          {[t.show_in_kanban && "kanban", t.is_mission_type && "mission", t.booking_enabled && "booking"].filter(Boolean).join(" · ") || "—"}
                        </div>
                      </div>

                      {/* Actions */}
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          onClick={() => setEditingId(t.id)}
                          style={{
                            padding: "5px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                            border: `1px solid ${S.border}`, background: "rgba(255,255,255,.05)",
                            color: S.dim, cursor: "pointer",
                          }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(t.id)}
                          disabled={deleting && deleteId === t.id}
                          style={{
                            padding: "5px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                            border: deleteId === t.id ? "1px solid rgba(239,68,68,.4)" : "1px solid rgba(239,68,68,.2)",
                            background: deleteId === t.id ? "rgba(239,68,68,.15)" : "rgba(239,68,68,.06)",
                            color: "#fca5a5", cursor: "pointer",
                          }}
                        >
                          {deleteId === t.id ? (deleting ? "…" : "Confirm") : isSystem ? "Deactivate" : "Delete"}
                        </button>
                        {deleteId === t.id && (
                          <button
                            onClick={() => setDeleteId(null)}
                            style={{
                              padding: "5px 10px", borderRadius: 6, fontSize: 12,
                              border: `1px solid ${S.border}`, background: "rgba(255,255,255,.04)",
                              color: S.dim, cursor: "pointer",
                            }}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {templates.length === 0 && (
              <div style={{ padding: 24, textAlign: "center", color: S.dim, fontSize: 14 }}>
                No templates yet. Click + Add Template to create one.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
