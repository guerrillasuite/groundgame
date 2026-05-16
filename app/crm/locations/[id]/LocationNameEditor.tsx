"use client";

import { useState, useRef } from "react";

type Props = {
  locId: string;
  initialPlaceName: string | null;
  initialNotes: string | null;
};

async function patchLocation(locId: string, patch: Record<string, unknown>) {
  const res = await fetch(`/api/crm/locations/${locId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return res.ok;
}

export default function LocationNameEditor({ locId, initialPlaceName, initialNotes }: Props) {
  const [placeName, setPlaceName] = useState(initialPlaceName ?? "");
  const [notes,     setNotes]     = useState(initialNotes ?? "");
  const [editing,   setEditing]   = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState("");
  const savedPlaceName = useRef(initialPlaceName ?? "");
  const savedNotes     = useRef(initialNotes ?? "");

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 10px", borderRadius: 7,
    border: "1px solid var(--gg-border, #e5e7eb)",
    fontSize: 14, color: "var(--gg-text, #111827)",
    background: "var(--gg-bg, #fff)", outline: "none",
  };

  async function handleSave() {
    setSaving(true);
    setError("");
    const ok = await patchLocation(locId, {
      place_name: placeName.trim() || null,
      notes: notes.trim() || null,
    });
    setSaving(false);
    if (!ok) { setError("Failed to save."); return; }
    savedPlaceName.current = placeName.trim();
    savedNotes.current     = notes.trim();
    setEditing(false);
  }

  function handleCancel() {
    setPlaceName(savedPlaceName.current);
    setNotes(savedNotes.current);
    setEditing(false);
    setError("");
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, textTransform: "uppercase",
    letterSpacing: "0.06em", color: "var(--gg-text-dim, #6b7280)",
    marginBottom: 4, display: "block",
  };

  if (!editing) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            {savedPlaceName.current ? (
              <p style={{ margin: 0, fontSize: 14, color: "var(--gg-text, #111827)", fontWeight: 500 }}>
                {savedPlaceName.current}
              </p>
            ) : (
              <p style={{ margin: 0, fontSize: 13, color: "var(--gg-text-dim, #9ca3af)", fontStyle: "italic" }}>
                No name set
              </p>
            )}
            {savedNotes.current && (
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--gg-text-dim, #6b7280)", whiteSpace: "pre-wrap" }}>
                {savedNotes.current}
              </p>
            )}
          </div>
          <button
            onClick={() => setEditing(true)}
            style={{
              padding: "5px 12px", borderRadius: 6, fontSize: 12, fontWeight: 500,
              background: "transparent", border: "1px solid var(--gg-border, #e5e7eb)",
              color: "var(--gg-text-dim, #6b7280)", cursor: "pointer", flexShrink: 0,
            }}
          >
            Edit
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <label style={labelStyle}>Name / Place Name</label>
        <input
          type="text"
          value={placeName}
          onChange={(e) => setPlaceName(e.target.value)}
          placeholder="e.g. City Hall, The Venue"
          style={inputStyle}
          autoFocus
        />
      </div>
      <div>
        <label style={labelStyle}>Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Internal notes about this location"
          rows={3}
          style={{ ...inputStyle, resize: "vertical" }}
        />
      </div>
      {error && <p style={{ margin: 0, fontSize: 12, color: "#dc2626" }}>{error}</p>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={handleCancel} style={{
          padding: "6px 14px", borderRadius: 6, fontSize: 13, fontWeight: 500,
          background: "transparent", border: "1px solid var(--gg-border, #e5e7eb)",
          color: "var(--gg-text-dim, #6b7280)", cursor: "pointer",
        }}>
          Cancel
        </button>
        <button onClick={handleSave} disabled={saving} style={{
          padding: "6px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600,
          background: "var(--gg-primary, #2563eb)", border: "none",
          color: "#fff", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1,
        }}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
