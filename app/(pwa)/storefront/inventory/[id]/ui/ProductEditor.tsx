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

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(cents: number | null) {
  if (cents == null) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

function toDollars(cents: number | null) {
  return cents != null ? (cents / 100).toFixed(2) : "";
}

function toCents(v: string) {
  return v ? Math.round(parseFloat(v) * 100) : null;
}

// ── Edit Modal ────────────────────────────────────────────────────────────────

const inp: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 8,
  border: "1px solid var(--gg-border, #e5e7eb)", fontSize: 14,
  background: "transparent", color: "inherit", boxSizing: "border-box",
};
const lbl: React.CSSProperties = {
  display: "block", fontSize: 12, fontWeight: 600,
  opacity: 0.6, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em",
};
const secHd: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, textTransform: "uppercase",
  letterSpacing: "0.06em", opacity: 0.45, margin: "4px 0 8px",
};
const divider: React.CSSProperties = {
  height: 1, background: "var(--gg-border, #e5e7eb)", margin: "4px 0",
};
const roVal: React.CSSProperties = {
  padding: "10px 12px", borderRadius: 8, fontSize: 14,
  border: "1px solid var(--gg-border, #e5e7eb)",
  background: "rgba(0,0,0,0.03)", opacity: 0.7,
};

function EditModal({
  product,
  onClose,
  onSaved,
}: {
  product: Product;
  onClose: () => void;
  onSaved: (updated: Product) => void;
}) {
  const [name, setName] = useState(product.name);
  const [sku, setSku] = useState(product.sku ?? "");
  const [description, setDescription] = useState(product.description ?? "");
  const [status, setStatus] = useState<"active" | "inactive">(
    product.status === "inactive" ? "inactive" : "active"
  );
  const [retail, setRetail] = useState(toDollars(product.retail_cents));
  const [materials, setMaterials] = useState(toDollars(product.materials_cents));
  const [packaging, setPackaging] = useState(toDollars(product.packaging_cents));
  const [labor, setLabor] = useState(toDollars(product.labor_cents));
  const [onHand, setOnHand] = useState(String(product.on_hand ?? 0));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Live pricing preview
  const retailCents = toCents(retail);
  const totalCost =
    (toCents(materials) ?? 0) + (toCents(packaging) ?? 0) + (toCents(labor) ?? 0);
  const profit = retailCents != null ? retailCents - totalCost : null;
  const margin =
    retailCents && retailCents > 0 && profit != null
      ? Math.round((profit / retailCents) * 100)
      : null;
  const hasCost = materials || packaging || labor;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setErr("Name is required"); return; }
    setSaving(true); setErr(null);

    const body = {
      name: name.trim(),
      sku: sku.trim() || null,
      description: description.trim() || null,
      status,
      retail_cents: toCents(retail),
      materials_cents: toCents(materials),
      packaging_cents: toCents(packaging),
      labor_cents: toCents(labor),
      on_hand: parseInt(onHand) || 0,
    };

    const res = await fetch(`/api/crm/products/${product.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json();
      setErr(data.error ?? "Save failed");
      setSaving(false);
      return;
    }

    onSaved({ ...product, ...body });
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9000,
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        background: "rgba(0,0,0,0.5)",
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Slide-up sheet */}
      <form
        onSubmit={submit}
        style={{
          width: "min(560px, 100%)",
          maxHeight: "92dvh",
          overflowY: "auto",
          background: "var(--gg-card, #fff)",
          borderRadius: "18px 18px 0 0",
          padding: "20px 20px 36px",
          display: "flex", flexDirection: "column", gap: 16,
          boxShadow: "0 -8px 40px rgba(0,0,0,0.25)",
        }}
      >
        {/* Handle + header */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: "rgba(0,0,0,0.15)" }} />
          <div style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between" }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Edit Product</h2>
            <button type="button" onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", opacity: 0.4, lineHeight: 1 }}>×</button>
          </div>
        </div>

        {/* Identity */}
        <div>
          <p style={secHd}>Identity</p>
          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <label style={lbl}>Name *</label>
              <input autoFocus type="text" value={name} onChange={(e) => setName(e.target.value)} style={inp} />
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
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional…"
                style={{ ...inp, resize: "vertical", lineHeight: 1.5 }}
              />
            </div>
          </div>
        </div>

        <div style={divider} />

        {/* Pricing */}
        <div>
          <p style={secHd}>Pricing</p>
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

          {/* Live cost/profit/margin preview */}
          {(retail || hasCost) && (
            <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {[
                { label: "Total Cost", value: fmt(hasCost ? totalCost : null) },
                {
                  label: "Profit",
                  value: fmt(profit),
                  color: profit != null ? (profit >= 0 ? "#16a34a" : "#dc2626") : undefined,
                },
                {
                  label: "Margin",
                  value: margin != null ? `${margin}%` : "—",
                  color: margin != null ? (margin >= 0 ? "#16a34a" : "#dc2626") : undefined,
                },
              ].map(({ label, value, color }) => (
                <div key={label}>
                  <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 3, fontWeight: 600 }}>{label}</div>
                  <div style={{ ...roVal, color, fontWeight: color ? 700 : undefined, fontSize: 13 }}>{value}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={divider} />

        {/* Inventory */}
        <div>
          <p style={secHd}>Inventory</p>
          <div>
            <label style={lbl}>On Hand (units)</label>
            <input type="number" min={0} value={onHand} onChange={(e) => setOnHand(e.target.value)} style={{ ...inp, maxWidth: 140 }} />
          </div>
        </div>

        {err && <p style={{ color: "#dc2626", fontSize: 13, margin: 0 }}>{err}</p>}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 4 }}>
          <button type="button" onClick={onClose} style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid var(--gg-border, #e5e7eb)", background: "transparent", cursor: "pointer", fontSize: 14, color: "inherit" }}>
            Cancel
          </button>
          <button type="submit" disabled={saving} style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: "var(--gg-primary, #2563eb)", color: "#fff", fontWeight: 700, fontSize: 14, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export default function ProductEditor({
  product: initial,
  activeOrderCount,
}: {
  product: Product;
  activeOrderCount: number;
}) {
  const router = useRouter();
  const [product, setProduct] = useState(initial);
  const [showEdit, setShowEdit] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [toggling, setToggling] = useState(false);

  const backHref =
    product.status === "inactive" ? "/storefront/inventory/inactive" : "/storefront/inventory";

  async function toggleStatus() {
    const next = product.status === "active" ? "inactive" : "active";
    setToggling(true);
    setProduct((p) => ({ ...p, status: next }));
    await fetch(`/api/crm/products/${product.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setToggling(false);
    router.refresh();
  }

  async function duplicate() {
    setDuplicating(true);
    const res = await fetch("/api/crm/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `${product.name} (copy)`,
        sku: product.sku ? `${product.sku}-COPY` : null,
        description: product.description,
        retail_cents: product.retail_cents,
        materials_cents: product.materials_cents,
        packaging_cents: product.packaging_cents,
        labor_cents: product.labor_cents,
        on_hand: product.on_hand ?? 0,
        status: "inactive",
      }),
    });
    const data = await res.json();
    setDuplicating(false);
    if (res.ok) router.push(`/storefront/inventory/${data.id}`);
  }

  async function deleteProduct() {
    setDeleting(true);
    setDeleteErr(null);
    const res = await fetch(`/api/crm/products/${product.id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/storefront/inventory");
    } else {
      const data = await res.json();
      setDeleteErr(data.error ?? "Delete failed");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  // Derived
  const totalCost =
    (product.materials_cents ?? 0) + (product.packaging_cents ?? 0) + (product.labor_cents ?? 0);
  const hasCost = product.materials_cents != null || product.packaging_cents != null || product.labor_cents != null;
  const profit = product.retail_cents != null && hasCost ? product.retail_cents - totalCost : null;
  const margin =
    product.retail_cents && product.retail_cents > 0 && profit != null
      ? Math.round((profit / product.retail_cents) * 100)
      : null;

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

      {/* Name + status row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, lineHeight: 1.2 }}>{product.name}</h1>
          {product.sku && <p style={{ margin: "4px 0 0", fontSize: 13, opacity: 0.55 }}>SKU: {product.sku}</p>}
        </div>
        <button
          type="button"
          onClick={toggleStatus}
          disabled={toggling}
          style={{
            padding: "5px 14px", borderRadius: 20, fontWeight: 700, fontSize: 12,
            cursor: toggling ? "not-allowed" : "pointer", border: "none", flexShrink: 0,
            background: product.status === "active" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.12)",
            color: product.status === "active" ? "#15803d" : "#dc2626",
          }}
        >
          {product.status === "active" ? "Active" : "Inactive"}
        </button>
      </div>

      {/* Description */}
      {product.description && (
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, opacity: 0.75 }}>{product.description}</p>
      )}

      {/* Key stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        {[
          { label: "Price",    value: fmt(product.retail_cents) },
          { label: "On Hand",  value: String(product.on_hand ?? 0) },
          { label: "Orders",   value: String(activeOrderCount) },
        ].map(({ label, value }) => (
          <div key={label} style={{ padding: "12px", borderRadius: 10, border: "1px solid var(--gg-border, #e5e7eb)", textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{value}</div>
            <div style={{ fontSize: 11, opacity: 0.5, marginTop: 2, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Profit breakdown (if any cost data) */}
      {hasCost && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          {[
            { label: "Total Cost", value: fmt(totalCost) },
            { label: "Profit",     value: fmt(profit), color: profit != null ? (profit >= 0 ? "#16a34a" : "#dc2626") : undefined },
            { label: "Margin",     value: margin != null ? `${margin}%` : "—", color: margin != null ? (margin >= 0 ? "#16a34a" : "#dc2626") : undefined },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ padding: "12px", borderRadius: 10, border: "1px solid var(--gg-border, #e5e7eb)", textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 800, color }}>{value}</div>
              <div style={{ fontSize: 11, opacity: 0.5, marginTop: 2, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => setShowEdit(true)}
          style={{
            flex: 1, padding: "11px 20px", borderRadius: 8, fontWeight: 700, fontSize: 15,
            border: "none", background: "var(--gg-primary, #2563eb)", color: "#fff", cursor: "pointer",
          }}
        >
          Edit
        </button>

        <button
          type="button"
          onClick={duplicate}
          disabled={duplicating}
          style={{
            padding: "11px 16px", borderRadius: 8, fontWeight: 600, fontSize: 14,
            border: "1px solid var(--gg-border, #e5e7eb)", background: "transparent",
            cursor: duplicating ? "not-allowed" : "pointer", color: "inherit",
            opacity: duplicating ? 0.6 : 1,
          }}
        >
          {duplicating ? "…" : "Duplicate"}
        </button>

        {!confirmDelete ? (
          <button
            type="button"
            onClick={() => { setConfirmDelete(true); setDeleteErr(null); }}
            style={{
              padding: "11px 16px", borderRadius: 8, fontWeight: 600, fontSize: 14,
              border: "1px solid rgba(239,68,68,0.4)", background: "transparent",
              cursor: "pointer", color: "#dc2626",
            }}
          >
            Delete
          </button>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: "#dc2626", fontWeight: 600 }}>Delete?</span>
            <button
              type="button"
              onClick={deleteProduct}
              disabled={deleting}
              style={{ padding: "10px 14px", borderRadius: 8, fontWeight: 700, fontSize: 13, border: "none", background: "#dc2626", color: "#fff", cursor: deleting ? "not-allowed" : "pointer", opacity: deleting ? 0.6 : 1 }}
            >
              {deleting ? "Deleting…" : "Yes, delete"}
            </button>
            <button
              type="button"
              onClick={() => { setConfirmDelete(false); setDeleteErr(null); }}
              style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid var(--gg-border, #e5e7eb)", background: "transparent", cursor: "pointer", fontSize: 13, color: "inherit" }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {deleteErr && <p style={{ color: "#dc2626", fontSize: 12, margin: 0 }}>{deleteErr}</p>}

      {/* Full edit modal */}
      {showEdit && (
        <EditModal
          product={product}
          onClose={() => setShowEdit(false)}
          onSaved={(updated) => {
            setProduct(updated);
            setShowEdit(false);
            router.refresh();
          }}
        />
      )}
    </section>
  );
}
