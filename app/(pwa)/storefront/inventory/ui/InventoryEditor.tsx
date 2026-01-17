"use client";

import { useState, useTransition } from "react";
import { saveInventory } from "../actions";

type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  on_hand: number | null;
  reserved_qty: number | null; // open orders
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
          <div style={{ width: 120, textAlign: "right" }}>On hand</div>
          <div style={{ width: 140, textAlign: "right" }}>Reserved (open)</div>
        </div>
        {rows.map((r, i) => (
          <div key={r.id} className="row" role="row" style={{ alignItems: "center" }}>
            <div style={{ flex: 2 }}>{r.name}</div>
            <div style={{ flex: 1 }}>{r.sku ?? ""}</div>
            <div style={{ width: 120 }}>
              <input
                type="number"
                value={Number(r.on_hand ?? 0)}
                onChange={(e) => {
                  const next = [...rows];
                  next[i] = { ...r, on_hand: Number(e.target.value) };
                  setRows(next);
                }}
                style={{ width: "100%", textAlign: "right" }}
              />
            </div>
            <div style={{ width: 140, textAlign: "right" }}>
              {Number(r.reserved_qty ?? 0)}
            </div>
          </div>
        ))}
      </div>

      <div className="row" style={{ gap: 8 }}>
        <button className="btn" disabled={pending}>Save</button>
      </div>
    </form>
  );
}
