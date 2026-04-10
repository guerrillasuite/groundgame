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
  materials_cents: number | null;
  packaging_cents: number | null;
  labor_cents: number | null;
  on_hand: number | null;
  status: string;
  photo_url: string | null;
};

type OrderLine = {
  id: string;
  quantity: number;
  unit_price_cents: number | null;
  opportunity_id: string;
  opportunity_title: string | null;
  opportunity_stage: string | null;
  created_at: string | null;
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

const readonlyStyle: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: 8,
  border: "1px solid var(--gg-border, #e5e7eb)",
  fontSize: 14,
  background: "rgba(0,0,0,0.03)",
  opacity: 0.7,
};

function fmt(cents: number | null) {
  if (cents == null) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

function toDollars(cents: number | null) {
  if (cents == null) return "";
  return (cents / 100).toFixed(2);
}

function DollarsInput({
  value,
  onChange,
  placeholder = "0.00",
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="number"
      min={0}
      step={0.01}
      value={toDollars(value)}
      onChange={(e) =>
        onChange(e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null)
      }
      placeholder={placeholder}
      style={{ ...inputStyle, textAlign: "right" }}
    />
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function ProductCrmPanel({
  product: initial,
  reservedQty,
  recentOrders,
}: {
  product: Product;
  reservedQty: number;
  recentOrders: OrderLine[];
}) {
  const router = useRouter();
  const [p, setP] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [duplicating, setDuplicating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function set<K extends keyof Product>(key: K, val: Product[K]) {
    setP((prev) => ({ ...prev, [key]: val }));
  }

  // Derived pricing
  const cost =
    p.materials_cents != null || p.packaging_cents != null || p.labor_cents != null
      ? (p.materials_cents ?? 0) + (p.packaging_cents ?? 0) + (p.labor_cents ?? 0)
      : null;
  const profit = p.retail_cents != null && cost != null ? p.retail_cents - cost : null;
  const margin =
    p.retail_cents != null && p.retail_cents > 0 && profit != null
      ? Math.round((profit / p.retail_cents) * 100)
      : null;

  const available = (p.on_hand ?? 0) - reservedQty;

  async function save(patch: Partial<Product> = {}) {
    setSaving(true);
    setSaveStatus("idle");
    const merged = { ...p, ...patch };
    try {
      const res = await fetch(`/api/crm/products/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: merged.name,
          sku: merged.sku || null,
          description: merged.description || null,
          retail_cents: merged.retail_cents,
          materials_cents: merged.materials_cents,
          packaging_cents: merged.packaging_cents,
          labor_cents: merged.labor_cents,
          on_hand: merged.on_hand,
          status: merged.status,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      setP(merged);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  }

  async function duplicate() {
    setDuplicating(true);
    const res = await fetch("/api/crm/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `${p.name} (copy)`,
        sku: p.sku ? `${p.sku}-COPY` : null,
        description: p.description,
        retail_cents: p.retail_cents,
        materials_cents: p.materials_cents,
        packaging_cents: p.packaging_cents,
        labor_cents: p.labor_cents,
        on_hand: p.on_hand ?? 0,
        status: "inactive", // copies start inactive so they don't accidentally appear live
      }),
    });
    const data = await res.json();
    setDuplicating(false);
    if (res.ok) router.push(`/crm/products/${data.id}`);
  }

  async function deleteProduct() {
    setDeleting(true);
    setDeleteErr(null);
    const res = await fetch(`/api/crm/products/${p.id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/crm/products");
    } else {
      const data = await res.json();
      setDeleteErr(data.error ?? "Delete failed");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  async function toggleStatus() {
    const next = p.status === "active" ? "inactive" : "active";
    set("status", next);
    await save({ status: next });
    router.refresh();
  }

  return (
    <section style={{ padding: "20px 24px", maxWidth: 900 }}>
      {/* Back + header */}
      <div style={{ marginBottom: 16 }}>
        <Link
          href="/crm/products"
          style={{ fontSize: 13, opacity: 0.55, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}
        >
          ← Products
        </Link>
        <h1 style={{ margin: "6px 0 0", fontSize: 22, fontWeight: 800 }}>{p.name || "Product"}</h1>
      </div>

      {/* Status toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
        <button
          type="button"
          onClick={toggleStatus}
          style={{
            padding: "5px 18px", borderRadius: 20, fontWeight: 700, fontSize: 13, cursor: "pointer", border: "none",
            background: p.status === "active" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.12)",
            color: p.status === "active" ? "#15803d" : "#dc2626",
          }}
        >
          {p.status === "active" ? "Active" : "Inactive"}
        </button>
        <span style={{ fontSize: 13, opacity: 0.5 }}>
          {reservedQty} {reservedQty === 1 ? "unit" : "units"} in open orders
        </span>
      </div>

      {/* Two-column grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, alignItems: "start" }}>

        {/* ── Left: Identity ─────────────────────────────────── */}
        <div style={{ display: "grid", gap: 16 }}>
          {/* Photo */}
          <div style={{ width: "100%", aspectRatio: "16/9", borderRadius: 12, overflow: "hidden", background: "var(--gg-border, #e5e7eb)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {p.photo_url ? (
              <img src={p.photo_url} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <span style={{ fontSize: 52, opacity: 0.2 }}>📦</span>
            )}
          </div>

          <div>
            <label style={labelStyle}>Product Name</label>
            <input
              type="text"
              value={p.name}
              onChange={(e) => set("name", e.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>SKU</label>
            <input
              type="text"
              value={p.sku ?? ""}
              onChange={(e) => set("sku", e.target.value || null)}
              placeholder="Optional"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Description</label>
            <textarea
              rows={5}
              value={p.description ?? ""}
              onChange={(e) => set("description", e.target.value || null)}
              placeholder="Product description…"
              style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
            />
          </div>
        </div>

        {/* ── Right: Pricing + Inventory ─────────────────────── */}
        <div style={{ display: "grid", gap: 16 }}>

          {/* Pricing section */}
          <div style={{ padding: 16, borderRadius: 12, border: "1px solid var(--gg-border, #e5e7eb)", display: "grid", gap: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Pricing</div>

            <div>
              <label style={labelStyle}>Retail Price ($)</label>
              <DollarsInput value={p.retail_cents} onChange={(v) => set("retail_cents", v)} />
            </div>

            <div style={{ height: 1, background: "var(--gg-border, #e5e7eb)" }} />

            <div>
              <label style={labelStyle}>Materials Cost ($)</label>
              <DollarsInput value={p.materials_cents} onChange={(v) => set("materials_cents", v)} placeholder="0.00" />
            </div>
            <div>
              <label style={labelStyle}>Packaging Cost ($)</label>
              <DollarsInput value={p.packaging_cents} onChange={(v) => set("packaging_cents", v)} placeholder="0.00" />
            </div>
            <div>
              <label style={labelStyle}>Labor Cost ($)</label>
              <DollarsInput value={p.labor_cents} onChange={(v) => set("labor_cents", v)} placeholder="0.00" />
            </div>

            <div style={{ height: 1, background: "var(--gg-border, #e5e7eb)" }} />

            {/* Computed */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <div>
                <label style={labelStyle}>Total Cost</label>
                <div style={readonlyStyle}>{fmt(cost)}</div>
              </div>
              <div>
                <label style={labelStyle}>Profit</label>
                <div style={{
                  ...readonlyStyle,
                  color: profit == null ? undefined : profit >= 0 ? "#16a34a" : "#dc2626",
                  fontWeight: profit != null ? 700 : undefined,
                }}>
                  {fmt(profit)}
                </div>
              </div>
              <div>
                <label style={labelStyle}>Margin</label>
                <div style={{
                  ...readonlyStyle,
                  color: margin == null ? undefined : margin >= 0 ? "#16a34a" : "#dc2626",
                  fontWeight: margin != null ? 700 : undefined,
                }}>
                  {margin == null ? "—" : `${margin}%`}
                </div>
              </div>
            </div>
          </div>

          {/* Inventory section */}
          <div style={{ padding: 16, borderRadius: 12, border: "1px solid var(--gg-border, #e5e7eb)", display: "grid", gap: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Inventory</div>

            <div>
              <label style={labelStyle}>On Hand</label>
              <input
                type="number"
                min={0}
                value={p.on_hand ?? 0}
                onChange={(e) => set("on_hand", parseInt(e.target.value) || 0)}
                style={{ ...inputStyle, maxWidth: 140 }}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={labelStyle}>Reserved</label>
                <div style={readonlyStyle}>{reservedQty}</div>
              </div>
              <div>
                <label style={labelStyle}>Available</label>
                <div style={{
                  ...readonlyStyle,
                  color: available < 0 ? "#dc2626" : undefined,
                  fontWeight: available < 0 ? 700 : undefined,
                }}>
                  {available}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 24, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => save()}
          disabled={saving}
          style={{
            padding: "10px 28px", borderRadius: 8, fontWeight: 700, fontSize: 14,
            border: "none", cursor: saving ? "not-allowed" : "pointer",
            background:
              saveStatus === "saved" ? "#22c55e" :
              saveStatus === "error" ? "#ef4444" :
              "var(--gg-primary, #2563eb)",
            color: "white",
          }}
        >
          {saving ? "Saving…" : saveStatus === "saved" ? "Saved ✓" : saveStatus === "error" ? "Error — retry" : "Save Changes"}
        </button>

        <button
          type="button"
          onClick={duplicate}
          disabled={duplicating}
          style={{
            padding: "10px 20px", borderRadius: 8, fontWeight: 600, fontSize: 14,
            border: "1px solid var(--gg-border, #e5e7eb)", background: "transparent",
            cursor: duplicating ? "not-allowed" : "pointer", color: "inherit",
            opacity: duplicating ? 0.6 : 1,
          }}
        >
          {duplicating ? "Duplicating…" : "Duplicate"}
        </button>

        <div style={{ marginLeft: "auto" }}>
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => { setConfirmDelete(true); setDeleteErr(null); }}
              style={{
                padding: "10px 20px", borderRadius: 8, fontWeight: 600, fontSize: 14,
                border: "1px solid rgba(239,68,68,0.4)", background: "transparent",
                cursor: "pointer", color: "#dc2626",
              }}
            >
              Delete
            </button>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, color: "#dc2626", fontWeight: 600 }}>Delete this product?</span>
              <button
                type="button"
                onClick={deleteProduct}
                disabled={deleting}
                style={{
                  padding: "8px 16px", borderRadius: 8, fontWeight: 700, fontSize: 13,
                  border: "none", background: "#dc2626", color: "#fff",
                  cursor: deleting ? "not-allowed" : "pointer", opacity: deleting ? 0.6 : 1,
                }}
              >
                {deleting ? "Deleting…" : "Yes, delete"}
              </button>
              <button
                type="button"
                onClick={() => { setConfirmDelete(false); setDeleteErr(null); }}
                style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--gg-border, #e5e7eb)", background: "transparent", cursor: "pointer", fontSize: 13, color: "inherit" }}
              >
                Cancel
              </button>
            </div>
          )}
          {deleteErr && <p style={{ color: "#dc2626", fontSize: 12, margin: "6px 0 0" }}>{deleteErr}</p>}
        </div>
      </div>

      {/* Active Orders */}
      <div style={{ marginTop: 36 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>
          Order History ({recentOrders.length}{recentOrders.length === 20 ? "+" : ""})
        </h2>

        {recentOrders.length === 0 ? (
          <p style={{ opacity: 0.5, fontSize: 14 }}>No orders for this product yet.</p>
        ) : (
          <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid var(--gg-border, #e5e7eb)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "rgba(0,0,0,0.03)" }}>
                  {["Order", "Stage", "Qty", "Unit Price", "Line Total"].map((h) => (
                    <th key={h} style={{ padding: "10px 12px", fontSize: 12, fontWeight: 700, textAlign: "left", opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((o) => {
                  const lineTotal = o.unit_price_cents != null ? o.unit_price_cents * o.quantity : null;
                  return (
                    <tr key={o.id} style={{ borderTop: "1px solid var(--gg-border, #e5e7eb)" }}>
                      <td style={{ padding: "10px 12px", fontSize: 14 }}>
                        <Link
                          href={`/crm/opportunities/${o.opportunity_id}`}
                          style={{ color: "var(--gg-primary, #2563eb)", textDecoration: "none", fontWeight: 600 }}
                        >
                          {o.opportunity_title || "Untitled Order"}
                        </Link>
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 13, opacity: 0.65 }}>
                        {o.opportunity_stage ? capitalize(o.opportunity_stage) : "—"}
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 14, textAlign: "right" }}>
                        {o.quantity}
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 14, textAlign: "right" }}>
                        {fmt(o.unit_price_cents)}
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 14, textAlign: "right", fontWeight: 600 }}>
                        {fmt(lineTotal)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
