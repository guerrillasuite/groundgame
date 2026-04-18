"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ColorFamilyPicker } from "@/app/components/ColorFamilyPicker";

type ItemType = {
  id: string;
  name: string;
  slug: string;
  color: string;
  is_system: boolean;
  is_public: boolean;
};

const S = {
  surface: "rgb(18 23 33)",
  card:    "rgb(28 36 48)",
  border:  "rgb(43 53 67)",
  text:    "rgb(238 242 246)",
  dim:     "rgb(160 174 192)",
} as const;

function MakePublicBtn() {
  return (
    <button
      type="button"
      disabled
      title="Public sharing — coming soon"
      style={{
        padding: "4px 12px", fontSize: 12, borderRadius: 7, fontWeight: 500,
        border: `1px solid ${S.border}`, background: "rgba(255,255,255,.03)",
        color: S.dim, cursor: "not-allowed", opacity: 0.45, flexShrink: 0,
      }}
    >
      Make Public
    </button>
  );
}

export default function SitRepSettingsPanel() {
  const [types, setTypes] = useState<ItemType[]>([]);
  const [loading, setLoading] = useState(true);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("blue");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");

  useEffect(() => {
    fetch("/api/crm/sitrep/types")
      .then((r) => r.json())
      .then((data) => setTypes(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleColorChange(id: string, color: string) {
    setTypes((prev) => prev.map((t) => (t.id === id ? { ...t, color } : t)));
    await fetch(`/api/crm/sitrep/types/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ color }),
    });
    setSavedId(id);
    setTimeout(() => setSavedId((cur) => (cur === id ? null : cur)), 2000);
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/crm/sitrep/types/${id}`, { method: "DELETE" });
    if (res.ok) setTypes((prev) => prev.filter((t) => t.id !== id));
  }

  async function handleAdd() {
    if (!newName.trim() || adding) return;
    setAdding(true);
    setAddError("");
    const res = await fetch("/api/crm/sitrep/types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), color: newColor }),
    });
    if (res.ok) {
      const created = await res.json();
      setTypes((prev) => [...prev, created]);
      setNewName("");
      setNewColor("blue");
    } else {
      const err = await res.json().catch(() => ({}));
      setAddError(err.error ?? "Failed to add type.");
    }
    setAdding(false);
  }

  function TypeRow({ t }: { t: ItemType }) {
    return (
      <div style={{
        background: S.surface,
        border: `1px solid ${S.border}`,
        borderRadius: 12,
        display: "flex", alignItems: "center", gap: 12,
        padding: "10px 14px",
      }}>
        <ColorFamilyPicker
          value={t.color}
          onChange={(key) => handleColorChange(t.id, key)}
          size={28}
        />

        <span style={{ fontSize: 14, fontWeight: 500, flex: 1, color: S.text }}>{t.name}</span>

        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
          borderRadius: 4, padding: "2px 8px", flexShrink: 0,
          background: t.is_system ? "rgba(255,255,255,.06)" : "rgba(99,102,241,.12)",
          color: t.is_system ? S.dim : "#a5b4fc",
        }}>
          {t.is_system ? "SYSTEM" : "CUSTOM"}
        </span>

        {savedId === t.id && (
          <span style={{ fontSize: 11, color: "#4ade80", fontWeight: 600, flexShrink: 0 }}>Saved ✓</span>
        )}

        <MakePublicBtn />

        {!t.is_system && (
          <button
            type="button"
            onClick={() => handleDelete(t.id, t.name)}
            style={{
              padding: "4px 10px", fontSize: 12, borderRadius: 7, fontWeight: 500,
              border: "1px solid rgba(220,38,38,.3)", background: "rgba(220,38,38,.08)",
              color: "#fca5a5", cursor: "pointer", flexShrink: 0,
            }}
          >
            Delete
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="stack" style={{ maxWidth: 680 }}>

      {/* Breadcrumb + title */}
      <div>
        <div style={{ fontSize: 12, color: S.dim, marginBottom: 6 }}>
          <Link href="/crm/settings" style={{ color: S.dim, textDecoration: "none" }}>Settings</Link>
          {" / SitRep"}
        </div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>SitRep Settings</h1>
      </div>

      {/* Item Types card */}
      <div style={{
        background: S.card, border: `1px solid ${S.border}`,
        borderRadius: 16, padding: 24, display: "grid", gap: 20,
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Item Types</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: S.dim }}>
            Click the color circle on any type to pick a new color family. Light half = active items; dark half = completed.
          </p>
        </div>

        {loading ? (
          <div style={{ fontSize: 13, color: S.dim }}>Loading…</div>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {types.map((t) => <TypeRow key={t.id} t={t} />)}
          </div>
        )}

        {/* Add new type */}
        <div>
          <div style={{
            fontSize: 10, fontWeight: 800, letterSpacing: "0.1em",
            color: S.dim, textTransform: "uppercase", marginBottom: 8,
          }}>
            Add Custom Type
          </div>
          <div style={{
            background: S.surface, border: `1px dashed ${S.border}`, borderRadius: 12,
            display: "flex", gap: 10, alignItems: "center", padding: "10px 14px",
          }}>
            <ColorFamilyPicker value={newColor} onChange={setNewColor} size={28} />
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
              placeholder="Type name…"
              style={{
                flex: 1, background: "transparent", border: "none", outline: "none",
                color: S.text, fontSize: 14, minWidth: 0,
              }}
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={!newName.trim() || adding}
              className="btn"
              style={{ padding: "6px 16px", fontSize: 13, borderRadius: 8, flexShrink: 0 }}
            >
              {adding ? "Adding…" : "+ Add"}
            </button>
          </div>
          {addError && (
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "rgb(220 38 38)" }}>{addError}</p>
          )}
        </div>
      </div>
    </div>
  );
}
