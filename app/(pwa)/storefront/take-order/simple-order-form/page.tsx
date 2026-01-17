"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type Product = {
  id: string;
  name: string;
  sku: string | null;
  on_hand: number | null;
  status?: string | null;
};

type ItemRow = {
  key: string;          // local row key
  product_id: string;   // selected product
  qty: number;          // quantity for this row
};

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

export default function SimpleOrderForm() {
  // --- A) EMBED MODE: hide global header/footer in iframe ---
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add("embed");
    return () => html.classList.remove("embed");
  }, []);

  // Aggressive guard for headers/footers that get re-inserted after hydration
  useEffect(() => {
    const HIDE_SELECTORS = [
      "header", "footer", '[role="banner"]', '[role="contentinfo"]',
      '[class*="header"]', '[class*="Header"]', '[class*="app-header"]', '[class*="pwa-header"]', '[class*="crm-header"]',
      '[class*="footer"]', '[class*="Footer"]', '[class*="app-footer"]', '[class*="pwa-footer"]', '[class*="crm-footer"]',
      '[class*="bottom-bar"]', '[class*="bottomBar"]', '[class*="fab"]',
    ];
    const hideMatches = () => {
      try {
        const nodes = document.querySelectorAll(HIDE_SELECTORS.join(","));
        nodes.forEach((n) => {
          const el = n as HTMLElement;
          el.style.setProperty("display", "none", "important");
          el.style.setProperty("visibility", "hidden", "important");
          el.style.setProperty("pointer-events", "none", "important");
          el.style.setProperty("height", "0px", "important");
          el.style.setProperty("min-height", "0px", "important");
          el.style.setProperty("max-height", "0px", "important");
          el.style.setProperty("margin", "0", "important");
          el.style.setProperty("padding", "0", "important");
        });
      } catch {}
    };
    const raf = requestAnimationFrame(hideMatches);
    const mo = new MutationObserver(() => hideMatches());
    mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    return () => {
      cancelAnimationFrame(raf);
      mo.disconnect();
    };
  }, []);

  // --- B) AUTO-RESIZE CHILD → PARENT ---
  useEffect(() => {
    const postHeight = () => {
      const h =
        document.documentElement.scrollHeight ||
        document.body.scrollHeight ||
        document.documentElement.offsetHeight ||
        580;
      window.parent?.postMessage({ type: "embed:height", height: Math.max(400, h) }, "*");
    };

    postHeight();
    window.addEventListener("load", postHeight);

    const ro = new ResizeObserver(() => postHeight());
    ro.observe(document.documentElement);
    if (document.body) ro.observe(document.body);

    const pulses = [100, 300, 800, 1500];
    const timers = pulses.map((ms) => setTimeout(postHeight, ms));

    return () => {
      window.removeEventListener("load", postHeight);
      ro.disconnect();
      timers.forEach(clearTimeout);
    };
  }, []);

  // --- C) LOAD ACTIVE PRODUCTS (tenant via RLS) ---
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setLoadErr(null);
      const { data, error } = await supabase
        .from("products")
        .select("id,name,sku,on_hand,status")
        .eq("status", "active")
        .order("name", { ascending: true });

      if (!alive) return;
      if (error) {
        setLoadErr(error.message || "Failed to load products.");
        setProducts([]);
      } else {
        setProducts((data ?? []) as Product[]);
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // --- D) ITEMS (multi-row POS) ---
  const [items, setItems] = useState<ItemRow[]>([
    { key: uid(), product_id: "", qty: 1 },
  ]);

  function addItem() {
    setItems((prev) => [...prev, { key: uid(), product_id: "", qty: 1 }]);
  }
  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }
  function updateItem(idx: number, patch: Partial<ItemRow>) {
    setItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  }

  // helpers for display/validation
  const productById = useMemo(() => {
    const map = new Map<string, Product>();
    products.forEach((p) => map.set(p.id, p));
    return map;
  }, [products]);

  const [errors, setErrors] = useState<string[]>([]);

  // --- E) SUBMIT → validate & postMessage to parent ---
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors([]);

    const fd = new FormData(e.currentTarget);
    const baseErrors: string[] = [];

    // Basic contact/delivery requirements (adjust as you like)
    const first_name = String(fd.get("first_name") || "").trim();
    const last_name = String(fd.get("last_name") || "").trim();
    const address_line1 = String(fd.get("address_line1") || "").trim();
    if (!first_name) baseErrors.push("First name is required.");
    if (!last_name) baseErrors.push("Last name is required.");
    if (!address_line1) baseErrors.push("Delivery address is required.");

    // Items validation
    const validItems = items
      .map((it) => {
        const product = it.product_id ? productById.get(it.product_id) : null;
        const qty = Number(it.qty || 0);
        return { ...it, product, qty };
      })
      .filter((row) => !!row.product && row.qty > 0);

    if (validItems.length === 0) {
      baseErrors.push("At least one product with quantity ≥ 1 is required.");
    }

    // Optional stock check (warn, but do not block)
    const stockWarnings: string[] = [];
    validItems.forEach((row) => {
      const onHand = Number(row.product?.on_hand ?? 0);
      if (row.qty > onHand) {
        stockWarnings.push(
          `${row.product?.name || "Product"} qty (${row.qty}) exceeds on-hand (${onHand}).`
        );
      }
    });

    if (baseErrors.length > 0) {
      setErrors(baseErrors);
      // ensure parent still sees height change
      window.parent?.postMessage({ type: "embed:height", height: document.documentElement.scrollHeight }, "*");
      return;
    }

    // Build payload
    const payload = {
      contact: {
        first_name,
        last_name,
        email: String(fd.get("email") || "").trim(),
        phone: String(fd.get("phone") || "").trim(),
      },
      delivery: {
        address_line1,
        city: String(fd.get("city") || "").trim(),
        state: String(fd.get("state") || "").trim(),
        postal_code: String(fd.get("postal_code") || "").trim(),
      },
      notes: String(fd.get("notes") || ""),
      items: validItems.map((row) => ({
        product_id: row.product_id,
        sku: row.product?.sku || null,
        quantity: row.qty,
        // unit_price_cents: (optional) include if you capture price here
      })),
      warnings: stockWarnings, // non-blocking heads-up
    };

    // Post to parent (the Take Order page listens for this)
    try {
      window.parent?.postMessage({ type: "order:validated", payload }, "*");
    } catch {
      // fallback so you see something happen
      alert("Validated (demo). Parent message failed; check listener.");
    }
  }

  return (
    <>
      {/* Global CSS overrides for embed mode */}
      <style jsx global>{`
        html.embed,
        html.embed body { background: transparent !important; }

        html.embed body,
        html.embed main,
        html.embed .page,
        html.embed .content,
        html.embed .gg-page,
        html.embed #__next,
        html.embed [data-nextjs-router] {
          padding-bottom: 0 !important;
          margin-bottom: 0 !important;
        }

        html.embed .sticky,
        html.embed .sticky-bottom,
        html.embed .fixed-bottom,
        html.embed .site-footer-wrap,
        html.embed .footer-wrap {
          display: none !important;
          height: 0 !important;
          min-height: 0 !important;
          max-height: 0 !important;
          margin: 0 !important;
          padding: 0 !important;
        }
      `}</style>

      <form onSubmit={onSubmit} className="stack" style={{ padding: 16 }}>
        {/* Top customer/delivery fields */}
        <div className="grid" style={{ gap: 12, gridTemplateColumns: "1fr 1fr" }}>
          <label className="stack">
            <span>First Name</span>
            <input name="first_name" required />
          </label>
          <label className="stack">
            <span>Last Name</span>
            <input name="last_name" required />
          </label>

          <label className="stack">
            <span>Email</span>
            <input type="email" name="email" />
          </label>
          <label className="stack">
            <span>Phone</span>
            <input type="tel" name="phone" />
          </label>

          <label className="stack" style={{ gridColumn: "1 / -1" }}>
            <span>Delivery Address</span>
            <input name="address_line1" required />
          </label>

          <label className="stack">
            <span>City</span>
            <input name="city" />
          </label>
          <label className="stack">
            <span>State</span>
            <input name="state" />
          </label>
          <label className="stack">
            <span>ZIP</span>
            <input name="postal_code" />
          </label>

          <label className="stack" style={{ gridColumn: "1 / -1" }}>
            <span>Notes</span>
            <textarea name="notes" rows={3} />
          </label>
        </div>

        {/* Multi-item POS section */}
        <div className="stack" style={{ marginTop: 12 }}>
          <h3 style={{ margin: 0 }}>Items</h3>

          {items.map((it, idx) => {
            const p = it.product_id ? productById.get(it.product_id) : null;
            const onHand = Number(p?.on_hand ?? 0);
            const qty = Number(it.qty || 0);
            const lowStock = p && qty > onHand;

            return (
              <div key={it.key} className="row" style={{ gap: 8, alignItems: "center" }}>
                {/* Product select */}
                <div style={{ flex: 3 }}>
                  {loading ? (
                    <div className="text-dim">Loading products…</div>
                  ) : loadErr ? (
                    <div className="text-error">Error: {loadErr}</div>
                  ) : products.length === 0 ? (
                    <div className="text-dim">No active products found.</div>
                  ) : (
                    <select
                      required
                      value={it.product_id}
                      onChange={(e) => updateItem(idx, { product_id: e.target.value })}
                      aria-label={`Product ${idx + 1}`}
                      style={{ width: "100%" }}
                    >
                      <option value="" disabled>
                        Select a product…
                      </option>
                      {products.map((prod) => (
                        <option key={prod.id} value={prod.id}>
                          {prod.name} {prod.sku ? `(${prod.sku})` : ""} — On hand: {Number(prod.on_hand ?? 0)}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Quantity */}
                <div style={{ width: 120 }}>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={it.qty}
                    onChange={(e) => updateItem(idx, { qty: Math.max(1, Number(e.target.value || 1)) })}
                    aria-label={`Quantity ${idx + 1}`}
                    style={{ width: "100%", textAlign: "right" }}
                  />
                </div>

                {/* On hand indicator */}
                <div style={{ width: 160, fontSize: 12, textAlign: "right" }}>
                  {p ? (
                    <span className={lowStock ? "text-error" : "text-dim"}>
                      On hand: {onHand}{lowStock ? ` (need ${qty - onHand} more)` : ""}
                    </span>
                  ) : (
                    <span className="text-dim">Select a product</span>
                  )}
                </div>

                {/* Remove row */}
                <button
                  type="button"
                  className="btn"
                  onClick={() => removeItem(idx)}
                  aria-label={`Remove item ${idx + 1}`}
                >
                  Remove
                </button>
              </div>
            );
          })}

          <div>
            <button type="button" className="btn" onClick={addItem}>
              + Add Product
            </button>
          </div>
        </div>

        {/* Inline validation errors (if any) */}
        {errors.length > 0 && (
          <div
            role="alert"
            style={{
              marginTop: 8,
              padding: 12,
              borderRadius: 8,
              border: "1px solid var(--red-8)",
              background: "var(--red-1)",
              color: "var(--red-11)",
            }}
          >
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        <button className="btn" style={{ marginTop: 12 }} type="submit">
          Validate & Continue to Payment
        </button>
      </form>
    </>
  );
}
