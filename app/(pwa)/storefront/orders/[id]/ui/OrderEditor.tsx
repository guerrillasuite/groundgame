"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { supabase } from "@/lib/supabase/client";
import { addOrderItem, removeOrderItem, updateOrder, updateOrderItem } from "../actions";

type Product = { id: string; name: string; sku: string | null; status: string | null };
type Item = {
  item_id: string;
  product_id: string | null;
  sku: string | null;
  name: string | null;
  quantity: number | null;
  unit_price_cents?: number | null;
  line_total_cents?: number | null;
};

export default function OrderEditor({ initial }: { initial: any }) {
  const orderId = initial?.id as string;

  // ---- display title at top (opportunity name) ----
  const [title, setTitle] = useState<string>(initial?.title || "Untitled Order");

  // ---- basic fields ----
  const [notes, setNotes] = useState<string>(initial?.notes || "");

  const [contact, setContact] = useState<{
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    full_name?: string | null;
  }>({
    first_name: initial?.contact?.first_name ?? null,
    last_name: initial?.contact?.last_name ?? null,
    email: initial?.contact?.email ?? null,
    phone: initial?.contact?.phone ?? null,
    full_name: initial?.contact?.full_name ?? null,
  });

  const [delivery, setDelivery] = useState<{
    address_line1: string | null;
    unit: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
  }>({
    address_line1: initial?.delivery?.address_line1 ?? null,
    unit: initial?.delivery?.unit ?? null,
    city: initial?.delivery?.city ?? null,
    state: initial?.delivery?.state ?? null,
    postal_code: initial?.delivery?.postal_code ?? null,
  });

  // ---- existing items ----
  const [items, setItems] = useState<Item[]>(Array.isArray(initial?.items) ? initial.items : []);

  // ---- add-product dropdown (active products only; same as the POS form) ----
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsErr, setProductsErr] = useState<string | null>(null);
  const [selProductId, setSelProductId] = useState<string>("");
  const [selQty, setSelQty] = useState<number>(1);

  useEffect(() => {
    let alive = true;
    (async () => {
      setProductsLoading(true);
      setProductsErr(null);
      const { data, error } = await supabase
        .from("products")
        .select("id,name,sku,status")
        .eq("status", "active")
        .order("name", { ascending: true });
      if (!alive) return;
      if (error) {
        setProductsErr(error.message || "Failed to load products.");
      } else {
        setProducts((data ?? []) as Product[]);
        if (data && data.length > 0) setSelProductId(data[0].id);
      }
      setProductsLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const selProduct = useMemo(() => products.find((p) => p.id === selProductId) || null, [products, selProductId]);

  // ---- save ----
  const [saving, startSaving] = useTransition();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startSaving(async () => {
      await updateOrder(orderId, {
        title,
        notes,
        contact: {
          first_name: contact.first_name ?? null,
          last_name: contact.last_name ?? null,
          email: contact.email ?? null,
          phone: contact.phone ?? null,
        },
        delivery: {
          address_line1: delivery.address_line1 ?? null,
          unit: delivery.unit ?? null,
          city: delivery.city ?? null,
          state: delivery.state ?? null,
          postal_code: delivery.postal_code ?? null,
        },
      });
      alert("Saved.");
    });
  };

  // ---- UI helpers ----
  const currency = (c?: number | null) => (typeof c === "number" ? `$${(c / 100).toFixed(2)}` : "$0.00");

  return (
    <form onSubmit={onSubmit} className="stack" style={{ gap: 12 }}>
      {/* Opportunity title */}
      <div className="row" style={{ alignItems: "center", gap: 8 }}>
        <div style={{ fontWeight: 800, fontSize: 18, lineHeight: 1.1 }}>{title || "Untitled Order"}</div>
      </div>

      {/* Contact */}
      <div className="grid" style={{ gap: 10, gridTemplateColumns: "1fr 1fr" }}>
        <label className="stack">
          <span>First Name</span>
          <input
            value={contact.first_name ?? ""}
            onChange={(e) => setContact((c) => ({ ...c, first_name: e.target.value }))}
            placeholder="Jane"
          />
        </label>
        <label className="stack">
          <span>Last Name</span>
          <input
            value={contact.last_name ?? ""}
            onChange={(e) => setContact((c) => ({ ...c, last_name: e.target.value }))}
            placeholder="Doe"
          />
        </label>

        <label className="stack">
          <span>Email</span>
          <input
            type="email"
            value={contact.email ?? ""}
            onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))}
            placeholder="jane@example.com"
          />
        </label>
        <label className="stack">
          <span>Phone</span>
          <input
            type="tel"
            value={contact.phone ?? ""}
            onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))}
            placeholder="(555) 555-5555"
          />
        </label>
      </div>

      {/* Delivery */}
      <div className="grid" style={{ gap: 10, gridTemplateColumns: "1fr 1fr" }}>
        <label className="stack" style={{ gridColumn: "1 / -1" }}>
          <span>Address</span>
          <input
            value={delivery.address_line1 ?? ""}
            onChange={(e) => setDelivery((d) => ({ ...d, address_line1: e.target.value }))}
            placeholder="123 Main St"
          />
        </label>
        <label className="stack">
          <span>Unit</span>
          <input value={delivery.unit ?? ""} onChange={(e) => setDelivery((d) => ({ ...d, unit: e.target.value }))} />
        </label>
        <label className="stack">
          <span>City</span>
          <input value={delivery.city ?? ""} onChange={(e) => setDelivery((d) => ({ ...d, city: e.target.value }))} />
        </label>
        <label className="stack">
          <span>State</span>
          <input value={delivery.state ?? ""} onChange={(e) => setDelivery((d) => ({ ...d, state: e.target.value }))} />
        </label>
        <label className="stack">
          <span>ZIP</span>
          <input
            value={delivery.postal_code ?? ""}
            onChange={(e) => setDelivery((d) => ({ ...d, postal_code: e.target.value }))}
          />
        </label>
      </div>

      {/* Notes */}
      <label className="stack">
        <span>Notes</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
      </label>

      {/* Items */}
      <div className="stack" style={{ marginTop: 8 }}>
        <div style={{ fontWeight: 700 }}>Items</div>

        {items.length === 0 ? (
          <div className="text-dim" style={{ fontSize: 12 }}>No items yet.</div>
        ) : (
          <div className="stack" style={{ gap: 8 }}>
            {items.map((it, idx) => (
              <div key={it.item_id ?? idx} className="row" style={{ gap: 8, alignItems: "center" }}>
                <div style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {it.name || it.sku || "Item"}
                </div>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={Number(it.quantity || 1)}
                  onChange={async (e) => {
                    const q = Math.max(1, Number(e.target.value || 1));
                    setItems((prev) =>
                      prev.map((p) => (p.item_id === it.item_id ? { ...p, quantity: q } : p))
                    );
                    await updateOrderItem(String(it.item_id), q);
                  }}
                  style={{ width: 90 }}
                />
                <div style={{ width: 110, textAlign: "right" }}>
                  {currency(it.line_total_cents ?? (Number(it.quantity || 0) * Number(it.unit_price_cents || 0)))}
                </div>
                <button
                  type="button"
                  className="btn"
                  onClick={async () => {
                    await removeOrderItem(String(it.item_id));
                    setItems((prev) => prev.filter((p) => p.item_id !== it.item_id));
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add product (filtered dropdown like POS form) */}
      <div className="row" style={{ gap: 8, alignItems: "center", marginTop: 6 }}>
        {productsLoading ? (
          <div className="text-dim">Loading products…</div>
        ) : productsErr ? (
          <div className="text-error">Error: {productsErr}</div>
        ) : products.length === 0 ? (
          <div className="text-dim">No active products.</div>
        ) : (
          <>
            <select value={selProductId} onChange={(e) => setSelProductId(e.target.value)} style={{ flex: 2 }}>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.sku ? `(${p.sku})` : ""}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              step={1}
              value={selQty}
              onChange={(e) => setSelQty(Math.max(1, Number(e.target.value || 1)))}
              style={{ width: 90 }}
            />
            <button
              type="button"
              className="btn"
              onClick={async () => {
                if (!selProductId) return;
                const qty = Math.max(1, Number(selQty || 1));
                await addOrderItem(orderId, selProductId, qty);
                // update local list; we’ll append a lightweight row
                const prod = products.find((p) => p.id === selProductId);
                setItems((prev) => [
                  ...prev,
                  {
                    item_id: crypto.randomUUID(),
                    product_id: selProductId,
                    sku: prod?.sku ?? null,
                    name: prod?.name ?? null,
                    quantity: qty,
                  },
                ]);
              }}
            >
              Add Product
            </button>
          </>
        )}
      </div>

      <div className="row" style={{ gap: 8, marginTop: 10 }}>
        <button className="btn" disabled={saving} type="submit">
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
