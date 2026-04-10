"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { saveInventory } from "../actions";

type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  on_hand: number | null;
  reserved_qty: number | null;
  retail_cents?: number | null;
};

function fmt(cents: number | null | undefined) {
  if (cents == null) return null;
  return `$${(cents / 100).toFixed(2)}`;
}

const stepBtn: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 8,
  border: "1px solid var(--gg-border, #e5e7eb)",
  background: "transparent",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
  color: "inherit",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

export default function InventoryEditor({ initial }: { initial: ProductRow[] }) {
  const [rows, setRows] = useState<ProductRow[]>(initial);
  const [pending, start] = useTransition();

  function adjust(i: number, delta: number) {
    const next = [...rows];
    const current = Number(next[i].on_hand ?? 0);
    next[i] = { ...next[i], on_hand: Math.max(0, current + delta) };
    setRows(next);
  }

  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          await saveInventory(
            rows.map((r) => ({ product_id: r.id, on_hand: Number(r.on_hand ?? 0) }))
          );
          alert("Inventory saved.");
        });
      }}
    >
      <div style={{ borderRadius: 12, border: "1px solid var(--gg-border, #e5e7eb)", overflow: "hidden" }}>
        {rows.length === 0 && (
          <p style={{ margin: 0, padding: "20px 16px", fontSize: 13, opacity: 0.5 }}>No active products found.</p>
        )}
        {rows.map((r, i) => {
          const price = fmt(r.retail_cents);
          return (
            <div
              key={r.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "14px 16px",
                borderBottom: i < rows.length - 1 ? "1px solid var(--gg-border, #e5e7eb)" : undefined,
              }}
            >
              {/* Left: name, SKU, price */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <Link
                  href={`/storefront/inventory/${r.id}`}
                  style={{ fontWeight: 700, fontSize: 15, textDecoration: "none", color: "inherit", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                >
                  {r.name}
                </Link>
                <div style={{ display: "flex", gap: 8, marginTop: 3, alignItems: "center", flexWrap: "wrap" }}>
                  {price && (
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--gg-primary, #2563eb)" }}>{price}</span>
                  )}
                  {r.sku && (
                    <span style={{ fontSize: 12, opacity: 0.45 }}>{r.sku}</span>
                  )}
                </div>
                {(r.reserved_qty ?? 0) > 0 && (
                  <span style={{ fontSize: 11, opacity: 0.4, marginTop: 2, display: "block" }}>
                    {Number(r.reserved_qty)} reserved
                  </span>
                )}
              </div>

              {/* Right: count + stepper buttons */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                <span style={{ fontSize: 22, fontWeight: 800, lineHeight: 1, minWidth: 32, textAlign: "right" }}>
                  {Number(r.on_hand ?? 0)}
                </span>
                <div style={{ display: "flex", gap: 4 }}>
                  {([-5, -1, 1, 5] as const).map((delta) => (
                    <button
                      key={delta}
                      type="button"
                      onClick={() => adjust(i, delta)}
                      style={stepBtn}
                    >
                      {delta > 0 ? `+${delta}` : delta}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <button className="btn" disabled={pending} style={{ alignSelf: "flex-start" }}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
