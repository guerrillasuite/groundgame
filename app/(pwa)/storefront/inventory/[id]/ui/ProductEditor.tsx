"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Product = {
  id: string;
  name: string;
  sku: string | null;
  description: string | null;
  retail_cents: number | null;
  on_hand: number | null;
  status: string;
  photo_url: string | null;
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 8,
  border: "1px solid var(--gg-border, #e5e7eb)",
  fontSize: 14,
  background: "transparent",
  boxSizing: "border-box",
  color: "inherit",
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  opacity: 0.6,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  display: "block",
  marginBottom: 5,
};

export default function ProductEditor({
  product: initial,
  activeOrderCount,
}: {
  product: Product;
  activeOrderCount: number;
}) {
  const router = useRouter();
  const [product, setProduct] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");

  function set<K extends keyof Product>(key: K, val: Product[K]) {
    setProduct((p) => ({ ...p, [key]: val }));
  }

  async function save(patch: Partial<Product> = {}) {
    setSaving(true);
    setSaveStatus("idle");
    const merged = { ...product, ...patch };
    try {
      const res = await fetch(`/api/crm/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: merged.name,
          sku: merged.sku || null,
          description: merged.description || null,
          retail_cents: merged.retail_cents,
          on_hand: merged.on_hand,
          status: merged.status,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      setProduct(merged);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus() {
    const next = product.status === "active" ? "inactive" : "active";
    set("status", next);
    await save({ status: next });
    router.refresh();
  }

  const backHref = product.status === "inactive" ? "/storefront/inventory/inactive" : "/storefront/inventory";
  const priceDollars = product.retail_cents != null ? (product.retail_cents / 100).toFixed(2) : "";

  return (
    <section className="stack" style={{ padding: 16, maxWidth: 540 }}>
      {/* Back link */}
      <Link href={backHref} style={{ fontSize: 13, opacity: 0.6, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
        ← {product.status === "inactive" ? "Inactive Products" : "Inventory"}
      </Link>

      {/* Photo */}
      <div style={{ width: "100%", aspectRatio: "16/9", borderRadius: 12, overflow: "hidden", background: "var(--gg-border, #e5e7eb)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {product.photo_url ? (
          <img src={product.photo_url} alt={product.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <span style={{ fontSize: 48, opacity: 0.2 }}>📦</span>
        )}
      </div>

      {/* Status + Order Count badges */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          type="button"
          onClick={toggleStatus}
          style={{
            padding: "5px 16px", borderRadius: 20, fontWeight: 700, fontSize: 13, cursor: "pointer", border: "none",
            background: product.status === "active" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.12)",
            color: product.status === "active" ? "#15803d" : "#dc2626",
          }}
        >
          {product.status === "active" ? "Active" : "Inactive"}
        </button>
        <span style={{ fontSize: 13, opacity: 0.55 }}>
          {activeOrderCount} order {activeOrderCount === 1 ? "item" : "items"} placed
        </span>
      </div>

      {/* Editable fields */}
      <div style={{ display: "grid", gap: 14 }}>
        <div>
          <label style={labelStyle}>Product Name</label>
          <input
            type="text"
            value={product.name}
            onChange={(e) => set("name", e.target.value)}
            style={inputStyle}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>SKU</label>
            <input
              type="text"
              value={product.sku ?? ""}
              onChange={(e) => set("sku", e.target.value || null)}
              placeholder="Optional"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Price ($)</label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={priceDollars}
              onChange={(e) => set("retail_cents", e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null)}
              placeholder="0.00"
              style={{ ...inputStyle, textAlign: "right" }}
            />
          </div>
        </div>

        <div>
          <label style={labelStyle}>On Hand</label>
          <input
            type="number"
            min={0}
            value={product.on_hand ?? 0}
            onChange={(e) => set("on_hand", parseInt(e.target.value) || 0)}
            style={{ ...inputStyle, maxWidth: 140 }}
          />
        </div>

        <div>
          <label style={labelStyle}>Description</label>
          <textarea
            rows={4}
            value={product.description ?? ""}
            onChange={(e) => set("description", e.target.value || null)}
            placeholder="Product description…"
            style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
          />
        </div>
      </div>

      {/* Save button */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="button"
          onClick={() => save()}
          disabled={saving}
          style={{
            padding: "9px 24px", borderRadius: 8, fontWeight: 700, fontSize: 14,
            border: "none", cursor: saving ? "not-allowed" : "pointer",
            background: saveStatus === "saved" ? "#22c55e" : saveStatus === "error" ? "#ef4444" : "var(--gg-primary, #2563eb)",
            color: "white",
          }}
        >
          {saving ? "Saving…" : saveStatus === "saved" ? "Saved ✓" : saveStatus === "error" ? "Error — retry" : "Save"}
        </button>
      </div>
    </section>
  );
}
