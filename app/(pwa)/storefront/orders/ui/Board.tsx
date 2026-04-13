"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

type Stage = { key: string; label: string };

type Order = {
  id: string;
  title: string | null;
  stage: string | null;
  amount_cents: number | null;
  items?: { product_id: string | null; quantity: number | null; sku: string | null; name: string | null }[] | null;
};

export default function Board({
  stages,
  orders,
  tenantId,
}: {
  stages: Stage[];
  orders: Order[];
  tenantId: string;
}) {
  const router = useRouter();

  const [cols, setCols] = useState<Record<string, Order[]>>(() => {
    const by: Record<string, Order[]> = {};
    stages.forEach((s) => (by[s.key] = []));
    (orders || []).forEach((o) => {
      // Only place the order if its stage is visible — don't reassign to first column
      if (o.stage && stages.some((s) => s.key === o.stage)) {
        by[o.stage] = [...(by[o.stage] ?? []), o];
      }
    });
    return by;
  });

  // Collapsed state — all expanded by default
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [moving, setMoving] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const matches = (o: Order) => {
    if (!q) return true;
    const s = q.toLowerCase();
    if ((o.title || "").toLowerCase().includes(s)) return true;
    if (Array.isArray(o.items)) {
      for (const it of o.items) {
        if ((it?.name || "").toLowerCase().includes(s)) return true;
        if ((it?.sku  || "").toLowerCase().includes(s)) return true;
      }
    }
    return false;
  };

  const viewCols = useMemo(() => {
    const out: Record<string, Order[]> = {};
    for (const st of stages) out[st.key] = (cols[st.key] || []).filter(matches);
    return out;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cols, stages, q]);

  const currency = (c?: number | null) =>
    typeof c === "number" ? `$${(c / 100).toFixed(2)}` : "$0.00";

  async function moveOrder(orderId: string, fromKey: string, toKey: string) {
    if (fromKey === toKey) return;
    setMoving(orderId);

    // Optimistic update
    setCols((prev) => {
      const next: Record<string, Order[]> = {};
      for (const k of Object.keys(prev)) next[k] = [...prev[k]];
      const fromList = [...(next[fromKey] ?? [])];
      const idx = fromList.findIndex((o) => o.id === orderId);
      if (idx < 0) return prev;
      const [moved] = fromList.splice(idx, 1);
      next[fromKey] = fromList;
      next[toKey] = [{ ...moved, stage: toKey }, ...(next[toKey] ?? [])];
      return next;
    });

    const { error } = await supabase.rpc("gg_update_opportunity_stage_v1", {
      p_tenant_id: tenantId,
      p_order_id: orderId,
      p_stage: toKey,
    });
    if (error) {
      console.error(error);
      // Revert to server state
      const by: Record<string, Order[]> = {};
      stages.forEach((s) => (by[s.key] = []));
      (orders || []).forEach((o) => {
        if (o.stage && stages.some((s) => s.key === o.stage)) {
          by[o.stage] = [...(by[o.stage] ?? []), o];
        }
      });
      setCols(by);
      alert("Failed to update stage.");
    }
    setMoving(null);
  }

  const totalOrders = Object.values(cols).reduce((s, arr) => s + arr.length, 0);

  return (
    <div>
      <style jsx>{`
        .toolbar {
          display: flex; align-items: center; gap: 8px; margin-bottom: 14px;
        }
        .search {
          flex: 1; display: flex; align-items: center; gap: 8px;
          padding: 8px 12px; border-radius: 10px;
          border: 1px solid var(--gg-border, #e5e7eb);
          background: transparent;
        }
        .search input {
          flex: 1; background: transparent; border: 0; outline: none;
          color: inherit; font-size: 14px; min-width: 0;
        }
        .clear {
          padding: 3px 8px; border-radius: 6px;
          border: 1px solid var(--gg-border, #e5e7eb);
          background: transparent; cursor: pointer; font-size: 12px; color: inherit;
        }

        .accordion { display: flex; flex-direction: column; gap: 8px; }

        .stage-section {
          border: 1px solid var(--gg-border, #e5e7eb);
          border-radius: 12px; overflow: hidden;
        }

        .stage-hd {
          display: flex; align-items: center; gap: 10px;
          padding: 12px 14px; cursor: pointer; user-select: none;
          background: rgba(0,0,0,0.02);
        }
        .stage-hd:not(.is-collapsed) {
          border-bottom: 1px solid var(--gg-border, #e5e7eb);
        }
        .stage-name { font-weight: 700; font-size: 14px; flex: 1; }
        .stage-meta { font-size: 12px; opacity: 0.55; }
        .chevron { font-size: 10px; opacity: 0.35; transition: transform 0.18s; }
        .chevron.open { transform: rotate(90deg); }

        .stage-body { padding: 10px; display: flex; flex-direction: column; gap: 8px; }

        .kcard {
          border: 1px solid var(--gg-border, #e5e7eb);
          border-radius: 10px; padding: 12px;
          cursor: pointer; transition: border-color .12s;
          display: flex; flex-direction: column; gap: 7px;
        }
        .kcard:active { border-color: var(--gg-primary, #2563eb); }

        .card-title { font-weight: 700; font-size: 14px; line-height: 1.3; }
        .card-items { display: flex; flex-direction: column; gap: 2px; }
        .card-item { font-size: 12px; opacity: 0.65; display: flex; gap: 6px; }
        .card-foot {
          display: flex; align-items: center; justify-content: space-between; gap: 8px;
        }
        .card-total { font-weight: 700; font-size: 13px; }
        .stage-sel {
          font-size: 12px; padding: 3px 6px; border-radius: 6px;
          border: 1px solid var(--gg-border, #e5e7eb);
          background: transparent; cursor: pointer; color: inherit;
          max-width: 140px; flex-shrink: 0;
        }
        .empty {
          padding: 12px 6px; font-size: 13px; opacity: 0.4; text-align: center;
        }
      `}</style>

      {/* Search */}
      <div className="toolbar">
        <div className="search">
          <input
            type="search"
            value={q}
            placeholder="Search orders, items, SKU…"
            onChange={(e) => setQ(e.target.value)}
          />
          {q && (
            <button className="clear" type="button" onClick={() => setQ("")}>
              Clear
            </button>
          )}
        </div>
      </div>

      <p style={{ fontSize: 13, opacity: 0.5, margin: "0 0 12px" }}>
        {totalOrders} {totalOrders === 1 ? "order" : "orders"} total
      </p>

      <div className="accordion">
        {stages.map((stage) => {
          const list = viewCols[stage.key] || [];
          const isCollapsed = collapsed[stage.key] ?? false;
          const sum = list.reduce(
            (acc, o) => acc + (typeof o.amount_cents === "number" ? o.amount_cents : 0),
            0
          );

          return (
            <div key={stage.key} className="stage-section">
              {/* Stage header */}
              <div
                className={`stage-hd${isCollapsed ? " is-collapsed" : ""}`}
                onClick={() =>
                  setCollapsed((c) => ({ ...c, [stage.key]: !c[stage.key] }))
                }
              >
                <span className="stage-name">{stage.label}</span>
                <span className="stage-meta">
                  {list.length} {list.length === 1 ? "order" : "orders"}
                  {sum > 0 ? ` · ${currency(sum)}` : ""}
                </span>
                <span className={`chevron${isCollapsed ? "" : " open"}`}>▶</span>
              </div>

              {/* Cards */}
              {!isCollapsed && (
                <div className="stage-body">
                  {list.map((o) => {
                    const items = Array.isArray(o.items) ? o.items : [];
                    const show = items.slice(0, 3);
                    const more = items.length - show.length;
                    return (
                      <div
                        key={o.id}
                        className="kcard"
                        onClick={() => router.push(`/storefront/orders/${o.id}`)}
                      >
                        <div className="card-title">{o.title || "Untitled Order"}</div>

                        {show.length > 0 && (
                          <div className="card-items">
                            {show.map((it, i) => (
                              <div key={i} className="card-item">
                                <span style={{ minWidth: 22 }}>{it.quantity ?? 0}×</span>
                                <span>{it.name || it.sku || "Item"}</span>
                              </div>
                            ))}
                            {more > 0 && (
                              <div className="card-item" style={{ opacity: 0.35 }}>
                                +{more} more…
                              </div>
                            )}
                          </div>
                        )}

                        <div className="card-foot">
                          <span className="card-total">{currency(o.amount_cents)}</span>
                          <select
                            className="stage-sel"
                            value={o.stage ?? stage.key}
                            disabled={moving === o.id}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              e.stopPropagation();
                              moveOrder(o.id, stage.key, e.target.value);
                            }}
                          >
                            {stages.map((s) => (
                              <option key={s.key} value={s.key}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    );
                  })}
                  {list.length === 0 && (
                    <div className="empty">No orders in this stage</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
