"use client";

import { useEffect, useState, useRef } from "react";

type Tag = { id: string; name: string; created_at: string; contact_count: number };

const inputStyle: React.CSSProperties = {
  padding: "7px 10px",
  borderRadius: 6,
  border: "1px solid var(--gg-border, #e5e7eb)",
  background: "var(--gg-bg, #fff)",
  color: "var(--gg-text, #111)",
  fontSize: 13,
  boxSizing: "border-box" as const,
};
const primaryBtn: React.CSSProperties = {
  padding: "7px 16px", fontSize: 13, fontWeight: 600, borderRadius: 6,
  border: "none", background: "var(--gg-primary, #2563eb)", color: "#fff", cursor: "pointer",
};
const ghostBtn: React.CSSProperties = {
  padding: "5px 12px", fontSize: 12, borderRadius: 5,
  border: "1px solid var(--gg-border, #e5e7eb)",
  background: "var(--gg-bg, #fff)", color: "var(--gg-text, #374151)", cursor: "pointer",
};

export default function TagsClient() {
  const [tags, setTags]             = useState<Tag[]>([]);
  const [loading, setLoading]       = useState(true);
  const [newName, setNewName]       = useState("");
  const [creating, setCreating]     = useState(false);
  const [createError, setCreateError] = useState("");
  const [editId, setEditId]         = useState<string | null>(null);
  const [editName, setEditName]     = useState("");
  const [editError, setEditError]   = useState("");
  const [saving, setSaving]         = useState(false);
  const [deleteId, setDeleteId]     = useState<string | null>(null);
  const [deleting, setDeleting]     = useState(false);
  const editInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/crm/tags");
    const data = await res.json();
    setTags(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (editId) setTimeout(() => editInputRef.current?.focus(), 0);
  }, [editId]);

  async function createTag(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true); setCreateError("");
    const res = await fetch("/api/crm/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    if (res.ok) {
      const tag = await res.json();
      setTags((p) => [...p, tag].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName("");
    } else {
      const d = await res.json();
      setCreateError(d.error ?? "Failed to create tag");
    }
    setCreating(false);
  }

  async function saveEdit(id: string) {
    if (!editName.trim()) return;
    setSaving(true); setEditError("");
    const res = await fetch(`/api/crm/tags/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName.trim() }),
    });
    if (res.ok) {
      const updated = await res.json();
      setTags((p) => p.map((t) => t.id === id ? { ...t, name: updated.name } : t).sort((a, b) => a.name.localeCompare(b.name)));
      setEditId(null); setEditName("");
    } else {
      const d = await res.json();
      setEditError(d.error ?? "Failed to rename tag");
    }
    setSaving(false);
  }

  async function deleteTag(id: string) {
    setDeleting(true);
    await fetch(`/api/crm/tags/${id}`, { method: "DELETE" });
    setTags((p) => p.filter((t) => t.id !== id));
    setDeleteId(null); setDeleting(false);
  }

  return (
    <section className="stack" style={{ maxWidth: 640 }}>
      <div>
        <h1 style={{ margin: 0 }}>Tags</h1>
        <p className="text-dim" style={{ marginTop: 4 }}>
          Create and manage contact tags. Tags can be applied manually or automatically via survey responses.
        </p>
      </div>

      {/* Create */}
      <form onSubmit={createTag} style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
        <input
          value={newName}
          onChange={(e) => { setNewName(e.target.value); setCreateError(""); }}
          placeholder="New tag name…"
          style={{ ...inputStyle, flex: 1, minWidth: 200 }}
          disabled={creating}
        />
        <button type="submit" disabled={creating || !newName.trim()} style={{ ...primaryBtn, opacity: (!newName.trim() || creating) ? 0.5 : 1 }}>
          {creating ? "Adding…" : "Add Tag"}
        </button>
        {createError && <p style={{ width: "100%", margin: 0, fontSize: 12, color: "#dc2626" }}>{createError}</p>}
      </form>

      {/* List */}
      {loading ? (
        <p className="text-dim">Loading…</p>
      ) : tags.length === 0 ? (
        <div style={{ border: "1px dashed var(--gg-border, #e5e7eb)", borderRadius: 8, padding: "40px 24px", textAlign: "center", color: "var(--gg-text-dim, #9ca3af)" }}>
          No tags yet. Add one above.
        </div>
      ) : (
        <div style={{ border: "1px solid var(--gg-border, #e5e7eb)", borderRadius: 8, overflow: "hidden" }}>
          {tags.map((tag, i) => (
            <div key={tag.id} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 16px",
              borderTop: i > 0 ? "1px solid var(--gg-border, #f3f4f6)" : "none",
              background: "var(--gg-bg, #fff)",
            }}>
              {editId === tag.id ? (
                <>
                  <input
                    ref={editInputRef}
                    value={editName}
                    onChange={(e) => { setEditName(e.target.value); setEditError(""); }}
                    onKeyDown={(e) => { if (e.key === "Enter") saveEdit(tag.id); if (e.key === "Escape") { setEditId(null); setEditError(""); } }}
                    style={{ ...inputStyle, flex: 1 }}
                    disabled={saving}
                  />
                  <button onClick={() => saveEdit(tag.id)} disabled={saving || !editName.trim()} style={{ ...primaryBtn, padding: "5px 12px" }}>
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <button onClick={() => { setEditId(null); setEditError(""); }} style={ghostBtn}>Cancel</button>
                  {editError && <span style={{ fontSize: 12, color: "#dc2626" }}>{editError}</span>}
                </>
              ) : (
                <>
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 10px",
                    borderRadius: 9999, fontSize: 13, fontWeight: 500,
                    background: "color-mix(in srgb, var(--gg-primary, #2563eb) 18%, transparent)",
                    color: "var(--gg-primary, #2563eb)",
                    border: "1px solid color-mix(in srgb, var(--gg-primary, #2563eb) 30%, transparent)",
                  }}>
                    {tag.name}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--gg-text-dim, #9ca3af)", marginLeft: 4 }}>
                    {tag.contact_count} contact{tag.contact_count !== 1 ? "s" : ""}
                  </span>
                  <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                    <button onClick={() => { setEditId(tag.id); setEditName(tag.name); }} style={ghostBtn}>Rename</button>
                    <button
                      onClick={() => setDeleteId(tag.id)}
                      style={{ ...ghostBtn, color: "#dc2626", borderColor: "#fca5a5" }}>
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Delete confirm modal */}
      {deleteId && (() => {
        const tag = tags.find((t) => t.id === deleteId);
        if (!tag) return null;
        return (
          <div style={{
            position: "fixed", inset: 0, zIndex: 100,
            background: "rgba(0,0,0,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <div style={{
              background: "var(--gg-bg, #fff)", borderRadius: 10, padding: 24, maxWidth: 400, width: "90%",
              border: "1px solid var(--gg-border, #e5e7eb)", boxShadow: "0 10px 40px rgba(0,0,0,0.15)",
            }}>
              <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>Delete "{tag.name}"?</h3>
              {tag.contact_count > 0 && (
                <p style={{ margin: "0 0 16px", fontSize: 13, color: "#92400e", background: "#fffbeb", padding: "8px 12px", borderRadius: 6 }}>
                  This tag is applied to {tag.contact_count} contact{tag.contact_count !== 1 ? "s" : ""}. Deleting it will remove it from all of them.
                </p>
              )}
              <p style={{ margin: "0 0 20px", fontSize: 13, color: "var(--gg-text-dim, #6b7280)" }}>This action cannot be undone.</p>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => deleteTag(deleteId)} disabled={deleting}
                  style={{ padding: "8px 18px", fontSize: 13, fontWeight: 600, border: "none", borderRadius: 6, background: "#dc2626", color: "#fff", cursor: deleting ? "default" : "pointer", opacity: deleting ? 0.7 : 1 }}>
                  {deleting ? "Deleting…" : "Delete"}
                </button>
                <button onClick={() => setDeleteId(null)} style={ghostBtn}>Cancel</button>
              </div>
            </div>
          </div>
        );
      })()}
    </section>
  );
}
