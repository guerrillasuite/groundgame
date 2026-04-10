"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const inp: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 8,
  border: "1px solid var(--gg-border, #e5e7eb)", fontSize: 14,
  background: "transparent", color: "inherit", boxSizing: "border-box",
};
const lbl: React.CSSProperties = {
  display: "block", fontSize: 12, fontWeight: 600,
  opacity: 0.6, marginBottom: 4,
};
const sec: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, textTransform: "uppercase",
  letterSpacing: "0.06em", opacity: 0.45, margin: "4px 0 6px",
};

function toCents(v: string) {
  return v ? Math.round(parseFloat(v) * 100) : null;
}

function Modal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [description, setDescription] = useState("");
  const [retail, setRetail] = useState("");
  const [materials, setMaterials] = useState("");
  const [packaging, setPackaging] = useState("");
  const [labor, setLabor] = useState("");
  const [onHand, setOnHand] = useState("0");
  const [status, setStatus] = useState<"active" | "inactive">("active");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setErr("Name is required"); return; }
    setSaving(true); setErr(null);
    const res = await fetch("/api/crm/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        sku: sku.trim() || null,
        description: description.trim() || null,
        retail_cents: toCents(retail),
        materials_cents: toCents(materials),
        packaging_cents: toCents(packaging),
        labor_cents: toCents(labor),
        on_hand: parseInt(onHand) || 0,
        status,
      }),
    });
    const data = await res.json();
    if (!res.ok) { setErr(data.error ?? "Create failed"); setSaving(false); return; }
    onCreated();
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.55)", overflowY: "auto", padding: "20px 0" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <form
        onSubmit={submit}
        style={{
          background: "var(--gg-card, #fff)", borderRadius: 14, padding: 20,
          width: "min(480px, 96vw)", display: "flex", flexDirection: "column", gap: 14,
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)", margin: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>New Product</h2>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", opacity: 0.4, lineHeight: 1 }}>×</button>
        </div>

        {/* Identity */}
        <div>
          <p style={sec}>Identity</p>
          <div style={{ display: "grid", gap: 10 }}>
            <div>
              <label style={lbl}>Name *</label>
              <input autoFocus type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Product name" style={inp} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={lbl}>SKU</label>
                <input type="text" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Optional" style={inp} />
              </div>
              <div>
                <label style={lbl}>Status</label>
                <select value={status} onChange={(e) => setStatus(e.target.value as "active" | "inactive")} style={inp}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
            <div>
              <label style={lbl}>Description</label>
              <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional…" style={{ ...inp, resize: "vertical", lineHeight: 1.5 }} />
            </div>
          </div>
        </div>

        {/* Pricing */}
        <div>
          <p style={sec}>Pricing</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={lbl}>Retail Price ($)</label>
              <input type="number" min={0} step={0.01} value={retail} onChange={(e) => setRetail(e.target.value)} placeholder="0.00" style={{ ...inp, textAlign: "right" }} />
            </div>
            <div>
              <label style={lbl}>Materials Cost ($)</label>
              <input type="number" min={0} step={0.01} value={materials} onChange={(e) => setMaterials(e.target.value)} placeholder="0.00" style={{ ...inp, textAlign: "right" }} />
            </div>
            <div>
              <label style={lbl}>Packaging Cost ($)</label>
              <input type="number" min={0} step={0.01} value={packaging} onChange={(e) => setPackaging(e.target.value)} placeholder="0.00" style={{ ...inp, textAlign: "right" }} />
            </div>
            <div>
              <label style={lbl}>Labor Cost ($)</label>
              <input type="number" min={0} step={0.01} value={labor} onChange={(e) => setLabor(e.target.value)} placeholder="0.00" style={{ ...inp, textAlign: "right" }} />
            </div>
          </div>
        </div>

        {/* Inventory */}
        <div>
          <p style={sec}>Inventory</p>
          <div>
            <label style={lbl}>On Hand (units)</label>
            <input type="number" min={0} value={onHand} onChange={(e) => setOnHand(e.target.value)} style={{ ...inp, maxWidth: 130 }} />
          </div>
        </div>

        {err && <p style={{ color: "#dc2626", fontSize: 13, margin: 0 }}>{err}</p>}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid var(--gg-border, #e5e7eb)", background: "transparent", cursor: "pointer", fontSize: 14, color: "inherit" }}>
            Cancel
          </button>
          <button type="submit" disabled={saving} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: "var(--gg-primary, #2563eb)", color: "var(--on-primary, #fff)", fontWeight: 700, fontSize: 14, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}>
            {saving ? "Creating…" : "Add Product"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function AddProductButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          fontSize: 13, padding: "6px 14px", borderRadius: 8,
          border: "none", background: "var(--gg-primary, #2563eb)",
          color: "#fff", fontWeight: 700, cursor: "pointer",
        }}
      >
        + Add Product
      </button>
      {open && (
        <Modal
          onClose={() => setOpen(false)}
          onCreated={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
