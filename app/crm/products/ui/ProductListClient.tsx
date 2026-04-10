"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type ProductRow = {
  id: string;
  name: string;
  sku: string;
  status: "active" | "inactive";
  on_hand: number;
  retail_cents: number | null;
  materials_cents: number | null;
  packaging_cents: number | null;
  labor_cents: number | null;
  active_orders: number;
  photo_url: string | null;
};

// Derived for display + sorting
type DerivedRow = ProductRow & {
  cost_cents: number | null;
  profit_cents: number | null;
  margin_pct: number | null;
};

function derive(r: ProductRow): DerivedRow {
  const cost =
    r.materials_cents != null || r.packaging_cents != null || r.labor_cents != null
      ? (r.materials_cents ?? 0) + (r.packaging_cents ?? 0) + (r.labor_cents ?? 0)
      : null;
  const profit = r.retail_cents != null && cost != null ? r.retail_cents - cost : null;
  const margin =
    r.retail_cents != null && r.retail_cents > 0 && profit != null
      ? Math.round((profit / r.retail_cents) * 100)
      : null;
  return { ...r, cost_cents: cost, profit_cents: profit, margin_pct: margin };
}

function fmt(cents: number | null, fallback = "—") {
  if (cents == null) return fallback;
  return `$${(cents / 100).toFixed(2)}`;
}

function fmtPct(pct: number | null) {
  if (pct == null) return "—";
  return `${pct}%`;
}

type SortKey = keyof DerivedRow;

const COLUMNS: { key: SortKey; label: string; width?: number; align?: "right" }[] = [
  { key: "name",        label: "Name",          width: 220 },
  { key: "sku",         label: "SKU",           width: 110 },
  { key: "retail_cents",label: "Price",         width: 90,  align: "right" },
  { key: "cost_cents",  label: "Cost",          width: 90,  align: "right" },
  { key: "profit_cents",label: "Profit",        width: 90,  align: "right" },
  { key: "margin_pct",  label: "Margin",        width: 80,  align: "right" },
  { key: "on_hand",     label: "On Hand",       width: 90,  align: "right" },
  { key: "active_orders",label: "Orders",       width: 80,  align: "right" },
  { key: "status",      label: "Status",        width: 100 },
];

function SortArrow({ dir }: { dir: "asc" | "desc" }) {
  return (
    <svg
      aria-hidden
      width={10} height={10}
      viewBox="0 0 24 24"
      style={{ marginLeft: 4, transform: dir === "asc" ? "rotate(180deg)" : undefined }}
    >
      <path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Shared styles for modal fields ───────────────────────────────────────────

const mInput: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 8,
  border: "1px solid var(--gg-border, #e5e7eb)", fontSize: 14,
  background: "transparent", color: "inherit", boxSizing: "border-box",
};
const mLabel: React.CSSProperties = {
  display: "block", fontSize: 12, opacity: 0.6, marginBottom: 4, fontWeight: 600,
};
const mSection: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, textTransform: "uppercase",
  letterSpacing: "0.06em", opacity: 0.45, marginBottom: 2,
};

// ── Create Product Modal ──────────────────────────────────────────────────────

function CreateModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
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

  function toCents(v: string) {
    return v ? Math.round(parseFloat(v) * 100) : null;
  }

  // Computed cost preview
  const totalCost =
    (toCents(materials) ?? 0) + (toCents(packaging) ?? 0) + (toCents(labor) ?? 0);
  const retailCents = toCents(retail);
  const profit = retailCents != null ? retailCents - totalCost : null;
  const margin = retailCents && retailCents > 0 && profit != null
    ? Math.round((profit / retailCents) * 100) : null;

  function fmtPreview(cents: number | null) {
    if (cents == null) return "—";
    return `$${(cents / 100).toFixed(2)}`;
  }

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
    onCreated(data.id);
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.55)", overflowY: "auto", padding: "20px 0" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <form
        onSubmit={submit}
        style={{
          background: "var(--gg-card, #fff)", borderRadius: 14,
          padding: 24, width: "min(560px, 96vw)",
          display: "flex", flexDirection: "column", gap: 16,
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          margin: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>New Product</h2>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", opacity: 0.4, lineHeight: 1, padding: 4 }}>×</button>
        </div>

        {/* Identity */}
        <div>
          <p style={mSection}>Identity</p>
          <div style={{ display: "grid", gap: 10 }}>
            <div>
              <label style={mLabel}>Name *</label>
              <input autoFocus type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Product name" style={mInput} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={mLabel}>SKU</label>
                <input type="text" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Optional" style={mInput} />
              </div>
              <div>
                <label style={mLabel}>Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as "active" | "inactive")}
                  style={mInput}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
            <div>
              <label style={mLabel}>Description</label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional product description…"
                style={{ ...mInput, resize: "vertical", lineHeight: 1.5 }}
              />
            </div>
          </div>
        </div>

        {/* Pricing */}
        <div>
          <p style={mSection}>Pricing</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={mLabel}>Retail Price ($)</label>
              <input type="number" min={0} step={0.01} value={retail} onChange={(e) => setRetail(e.target.value)} placeholder="0.00" style={{ ...mInput, textAlign: "right" }} />
            </div>
            <div>
              <label style={mLabel}>Materials Cost ($)</label>
              <input type="number" min={0} step={0.01} value={materials} onChange={(e) => setMaterials(e.target.value)} placeholder="0.00" style={{ ...mInput, textAlign: "right" }} />
            </div>
            <div>
              <label style={mLabel}>Packaging Cost ($)</label>
              <input type="number" min={0} step={0.01} value={packaging} onChange={(e) => setPackaging(e.target.value)} placeholder="0.00" style={{ ...mInput, textAlign: "right" }} />
            </div>
            <div>
              <label style={mLabel}>Labor Cost ($)</label>
              <input type="number" min={0} step={0.01} value={labor} onChange={(e) => setLabor(e.target.value)} placeholder="0.00" style={{ ...mInput, textAlign: "right" }} />
            </div>
          </div>
          {/* Computed preview */}
          {(retail || materials || packaging || labor) && (
            <div style={{ marginTop: 8, display: "flex", gap: 16, fontSize: 12, opacity: 0.7 }}>
              <span>Cost: {fmtPreview(totalCost || null)}</span>
              <span>Profit: <span style={{ color: profit != null ? (profit >= 0 ? "#16a34a" : "#dc2626") : undefined, fontWeight: 600 }}>{fmtPreview(profit)}</span></span>
              <span>Margin: <span style={{ color: margin != null ? (margin >= 0 ? "#16a34a" : "#dc2626") : undefined, fontWeight: 600 }}>{margin != null ? `${margin}%` : "—"}</span></span>
            </div>
          )}
        </div>

        {/* Inventory */}
        <div>
          <p style={mSection}>Inventory</p>
          <div>
            <label style={mLabel}>On Hand (units)</label>
            <input type="number" min={0} value={onHand} onChange={(e) => setOnHand(e.target.value)} style={{ ...mInput, maxWidth: 140 }} />
          </div>
        </div>

        {err && <p style={{ color: "#dc2626", fontSize: 13, margin: 0 }}>{err}</p>}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 4 }}>
          <button type="button" onClick={onClose} style={{ padding: "9px 20px", borderRadius: 8, border: "1px solid var(--gg-border, #e5e7eb)", background: "transparent", cursor: "pointer", fontSize: 14, color: "inherit" }}>
            Cancel
          </button>
          <button type="submit" disabled={saving} style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: "var(--gg-primary, #2563eb)", color: "#fff", fontWeight: 700, fontSize: 14, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}>
            {saving ? "Creating…" : "Create Product"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function ProductListClient({ rows: initial }: { rows: ProductRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<DerivedRow[]>(() => initial.map(derive));
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [asc, setAsc] = useState(true);
  const [q, setQ] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const clickedToggle = useRef(false);

  const collator = useMemo(
    () => new Intl.Collator(undefined, { numeric: true, sensitivity: "base" }),
    []
  );

  function handleSort(key: SortKey) {
    setAsc(key === sortKey ? !asc : true);
    setSortKey(key);
  }

  const filtered = useMemo(() => {
    if (!q.trim()) return rows;
    const s = q.toLowerCase();
    return rows.filter(
      (r) => r.name.toLowerCase().includes(s) || r.sku.toLowerCase().includes(s)
    );
  }, [rows, q]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortKey] ?? (typeof a[sortKey] === "number" ? -Infinity : "");
      const bv = b[sortKey] ?? (typeof b[sortKey] === "number" ? -Infinity : "");
      if (typeof av === "number" && typeof bv === "number") {
        return asc ? av - bv : bv - av;
      }
      const cmp = collator.compare(String(av), String(bv));
      return asc ? cmp : -cmp;
    });
  }, [filtered, sortKey, asc, collator]);

  const active   = sorted.filter((r) => r.status === "active");
  const inactive = sorted.filter((r) => r.status === "inactive");

  async function toggleStatus(r: DerivedRow, e: React.MouseEvent) {
    e.stopPropagation();
    clickedToggle.current = true;
    const next = r.status === "active" ? "inactive" : "active";
    setToggling(r.id);
    setRows((prev) =>
      prev.map((p) => (p.id === r.id ? { ...p, status: next as "active" | "inactive" } : p))
    );
    await fetch(`/api/crm/products/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setToggling(null);
  }

  function renderCell(r: DerivedRow, key: SortKey) {
    switch (key) {
      case "retail_cents":  return fmt(r.retail_cents);
      case "cost_cents":    return fmt(r.cost_cents);
      case "profit_cents": {
        if (r.profit_cents == null) return "—";
        const color = r.profit_cents >= 0 ? "#16a34a" : "#dc2626";
        return <span style={{ color, fontWeight: 600 }}>{fmt(r.profit_cents)}</span>;
      }
      case "margin_pct": {
        if (r.margin_pct == null) return "—";
        const color = r.margin_pct >= 0 ? "#16a34a" : "#dc2626";
        return <span style={{ color, fontWeight: 600 }}>{fmtPct(r.margin_pct)}</span>;
      }
      case "status": {
        const isActive = r.status === "active";
        return (
          <button
            type="button"
            onClick={(e) => toggleStatus(r, e)}
            disabled={toggling === r.id}
            style={{
              padding: "3px 12px", borderRadius: 20, border: "none",
              fontWeight: 700, fontSize: 12, cursor: "pointer",
              background: isActive ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.12)",
              color: isActive ? "#15803d" : "#dc2626",
              opacity: toggling === r.id ? 0.5 : 1,
            }}
          >
            {isActive ? "Active" : "Inactive"}
          </button>
        );
      }
      default: {
        const val = r[key];
        return val != null ? String(val) : "—";
      }
    }
  }

  function renderGroup(group: DerivedRow[], label: string) {
    if (group.length === 0) return null;
    return (
      <>
        <tr>
          <td
            colSpan={COLUMNS.length}
            style={{
              padding: "8px 12px",
              fontSize: 12,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              opacity: 0.5,
              background: "rgba(0,0,0,0.03)",
              borderTop: "1px solid rgba(0,0,0,0.08)",
            }}
          >
            {label} ({group.length})
          </td>
        </tr>
        {group.map((r) => (
          <tr
            key={r.id}
            className="product-row"
            onClick={() => {
              if (clickedToggle.current) { clickedToggle.current = false; return; }
              router.push(`/crm/products/${r.id}`);
            }}
            style={{ cursor: "pointer", borderTop: "1px solid rgba(0,0,0,0.05)" }}
          >
            {COLUMNS.map((col) => (
              <td
                key={col.key}
                style={{
                  padding: "10px 12px",
                  fontSize: 14,
                  textAlign: col.align ?? "left",
                  whiteSpace: col.key === "name" ? undefined : "nowrap",
                  maxWidth: col.key === "name" ? 260 : undefined,
                  overflow: col.key === "name" ? "hidden" : undefined,
                  textOverflow: col.key === "name" ? "ellipsis" : undefined,
                }}
              >
                {renderCell(r, col.key)}
              </td>
            ))}
          </tr>
        ))}
      </>
    );
  }

  return (
    <section style={{ padding: "16px 20px" }}>
      <style>{`
        tr.product-row:hover td { background: var(--gg-bg-subtle, rgba(0,0,0,0.03)); }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, flex: 1 }}>Products</h1>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          style={{
            padding: "8px 18px", borderRadius: 8, border: "none",
            background: "var(--gg-primary, #2563eb)", color: "#fff",
            fontWeight: 700, fontSize: 14, cursor: "pointer",
          }}
        >
          + Add Product
        </button>
      </div>

      {/* Search */}
      <div style={{ marginBottom: 12 }}>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name or SKU…"
          style={{
            padding: "8px 14px", borderRadius: 10, fontSize: 14,
            border: "1px solid var(--gg-border, #e5e7eb)",
            background: "transparent", color: "inherit", width: "min(340px, 100%)",
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid rgba(0,0,0,0.08)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "rgba(0,0,0,0.03)" }}>
              {COLUMNS.map((col) => {
                const isSorted = sortKey === col.key;
                return (
                  <th
                    key={col.key}
                    style={{ textAlign: col.align ?? "left", padding: 0, width: col.width, whiteSpace: "nowrap" }}
                    aria-sort={(isSorted ? (asc ? "ascending" : "descending") : "none") as React.AriaAttributes["aria-sort"]}
                  >
                    <button
                      onClick={() => handleSort(col.key)}
                      style={{
                        all: "unset", cursor: "pointer", display: "inline-flex",
                        alignItems: "center", padding: "10px 12px",
                        width: "100%", boxSizing: "border-box",
                        justifyContent: col.align === "right" ? "flex-end" : "flex-start",
                      }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 700, opacity: 0.7 }}>{col.label}</span>
                      {isSorted && <SortArrow dir={asc ? "asc" : "desc"} />}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {renderGroup(active, "Active")}
            {renderGroup(inactive, "Inactive")}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} style={{ padding: 24, textAlign: "center", opacity: 0.4, fontSize: 14 }}>
                  {q ? "No products match your search." : "No products yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: 10, fontSize: 13, opacity: 0.5 }}>
        {active.length} active · {inactive.length} inactive
      </p>

      {showModal && (
        <CreateModal
          onClose={() => setShowModal(false)}
          onCreated={(id) => router.push(`/crm/products/${id}`)}
        />
      )}
    </section>
  );
}
