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

export default function InventoryEditor({ initial }: { initial: ProductRow[] }) {
  const [rows, setRows] = useState<ProductRow[]>(initial);
  const [pending, start] = useTransition();

  function adjust(i: number, delta: number) {
    const next = [...rows];
    const current = Number(next[i].on_hand ?? 0);
    next[i] = { ...next[i], on_hand: Math.max(0, current + delta) };
    setRows(next);
  }

  const primaryBorder = "1px solid var(--gg-primary, #2563eb)";

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
                gap: 12,
                padding: "12px 16px",
                borderBottom: i < rows.length - 1 ? "1px solid var(--gg-border, #e5e7eb)" : undefined,
              }}
            >
              {/* Name + SKU */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <Link
                  href={`/storefront/inventory/${r.id}`}
                  style={{ fontWeight: 700, fontSize: 14, textDecoration: "none", color: "inherit", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                >
                  {r.name}
                </Link>
                {r.sku && (
                  <span style={{ fontSize: 11, opacity: 0.4, display: "block", marginTop: 1 }}>{r.sku}</span>
                )}
              </div>

              {/* Price */}
              {price && (
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--gg-accent, #3B82F6)", flexShrink: 0 }}>
                  {price}
                </span>
              )}

              {/* Stepper: [-5][-1][count][+1][+5] */}
              <div style={{ display: "flex", flexShrink: 0 }}>
                {([-5, -1] as const).map((delta) => (
                  <button
                    key={delta}
                    type="button"
                    onClick={() => adjust(i, delta)}
                    style={{
                      width: 34, height: 34, border: primaryBorder,
                      borderRight: "none", background: "transparent", cursor: "pointer",
                      fontSize: 12, fontWeight: 700, color: "var(--gg-primary, #2563eb)",
                      borderRadius: delta === -5 ? "8px 0 0 8px" : 0,
                      flexShrink: 0,
                    }}
                  >
                    {delta}
                  </button>
                ))}

                {/* Count cell */}
                <div style={{
                  width: 40, height: 34, border: primaryBorder,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 15, fontWeight: 800,
                }}>
                  {Number(r.on_hand ?? 0)}
                </div>

                {([1, 5] as const).map((delta) => (
                  <button
                    key={delta}
                    type="button"
                    onClick={() => adjust(i, delta)}
                    style={{
                      width: 34, height: 34, border: primaryBorder,
                      borderLeft: "none", background: "transparent", cursor: "pointer",
                      fontSize: 12, fontWeight: 700, color: "var(--gg-primary, #2563eb)",
                      borderRadius: delta === 5 ? "0 8px 8px 0" : 0,
                      flexShrink: 0,
                    }}
                  >
                    +{delta}
                  </button>
                ))}
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
