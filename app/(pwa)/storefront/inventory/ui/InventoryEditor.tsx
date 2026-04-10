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
};

export default function InventoryEditor({ initial }: { initial: ProductRow[] }) {
  const [rows, setRows] = useState<ProductRow[]>(initial);
  const [pending, start] = useTransition();

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
        {rows.map((r, i) => (
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
            {/* Left: name + SKU */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <Link
                href={`/storefront/inventory/${r.id}`}
                style={{ fontWeight: 700, fontSize: 15, textDecoration: "none", color: "inherit", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
              >
                {r.name}
              </Link>
              {r.sku && (
                <span style={{ fontSize: 12, opacity: 0.5, marginTop: 2, display: "block" }}>
                  {r.sku}
                </span>
              )}
            </div>

            {/* Right: on-hand input + reserved */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <label style={{ fontSize: 11, opacity: 0.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  On Hand
                </label>
                <input
                  type="number"
                  value={Number(r.on_hand ?? 0)}
                  min={0}
                  onChange={(e) => {
                    const next = [...rows];
                    next[i] = { ...r, on_hand: Number(e.target.value) };
                    setRows(next);
                  }}
                  style={{
                    width: 64,
                    textAlign: "right",
                    padding: "5px 8px",
                    borderRadius: 6,
                    border: "1px solid var(--gg-border, #e5e7eb)",
                    fontSize: 14,
                    fontWeight: 700,
                    background: "transparent",
                    color: "inherit",
                  }}
                />
              </div>
              {(r.reserved_qty ?? 0) > 0 && (
                <span style={{ fontSize: 11, opacity: 0.5 }}>
                  {Number(r.reserved_qty)} reserved
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <button className="btn" disabled={pending} style={{ alignSelf: "flex-start" }}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
