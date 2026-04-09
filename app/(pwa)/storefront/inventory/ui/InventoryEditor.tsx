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
      <div className="table" role="table" style={{ width: "100%", overflowX: "auto" }}>
        <div className="row head" role="row" style={{ fontWeight: 700 }}>
          <div style={{ flex: 2 }}>Product</div>
          <div style={{ flex: 1 }}>SKU</div>
          <div style={{ width: 100, textAlign: "right" }}>On Hand</div>
          <div style={{ width: 120, textAlign: "right" }}>Reserved</div>
        </div>
        {rows.map((r, i) => (
          <div key={r.id} className="row" role="row" style={{ alignItems: "center" }}>
            <div style={{ flex: 2 }}>
              <Link
                href={`/storefront/inventory/${r.id}`}
                style={{ fontWeight: 600, textDecoration: "none", color: "var(--gg-primary, #2563eb)" }}
              >
                {r.name}
              </Link>
            </div>
            <div style={{ flex: 1, fontSize: 13, opacity: 0.65 }}>{r.sku ?? ""}</div>
            <div style={{ width: 100 }}>
              <input
                type="number"
                value={Number(r.on_hand ?? 0)}
                min={0}
                onChange={(e) => {
                  const next = [...rows];
                  next[i] = { ...r, on_hand: Number(e.target.value) };
                  setRows(next);
                }}
                style={{ width: "100%", textAlign: "right" }}
              />
            </div>
            <div style={{ width: 120, textAlign: "right", opacity: 0.65 }}>
              {Number(r.reserved_qty ?? 0)}
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="row" style={{ opacity: 0.5, fontSize: 13 }}>No active products found.</div>
        )}
      </div>

      <div className="row" style={{ gap: 8 }}>
        <button className="btn" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
      </div>
    </form>
  );
}
