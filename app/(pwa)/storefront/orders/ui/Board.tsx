"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

type Order = {
  id: string;
  title: string | null;
  stage: string | null;
  amount_cents: number | null;
  items?: { product_id: string | null; quantity: number | null; sku: string | null; name: string | null }[] | null;
};

const CARD_SIZE_DESKTOP = 140;
const CARD_SIZE_MOBILE  = 120;

export default function Board({
  stages,
  orders,
  tenantId,
}: {
  stages: string[];
  orders: Order[];
  tenantId: string;
}) {
  const router = useRouter();

  // Base columns (source of truth). We'll derive filtered "view" columns from this + search.
  const [cols, setCols] = useState<Record<string, Order[]>>(() => {
    const by: Record<string, Order[]> = {};
    stages.forEach((s) => (by[s] = []));
    (orders || []).forEach((o) => {
      const k = o.stage && stages.includes(o.stage) ? o.stage : stages[0];
      by[k].push(o);
    });
    return by;
  });

  const [overStage, setOverStage] = useState<string | null>(null);
  const dragIdRef = useRef<string | null>(null);

  // ── Search ──────────────────────────────────────────────────────────────────
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

  // View columns after search filter
  const viewCols = useMemo(() => {
    const out: Record<string, Order[]> = {};
    for (const st of stages) out[st] = (cols[st] || []).filter(matches);
    return out;
  }, [cols, stages, q]);

  // Totals & counts per column (respect search)
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const st of stages) c[st] = viewCols[st]?.length ?? 0;
    return c;
  }, [viewCols, stages]);

  const sums = useMemo(() => {
    const s: Record<string, number> = {};
    for (const st of stages) {
      s[st] = (viewCols[st] || []).reduce((acc, o) => acc + (typeof o.amount_cents === "number" ? o.amount_cents : 0), 0);
    }
    return s;
  }, [viewCols, stages]);

  const currency = (c?: number | null) => (typeof c === "number" ? `$${(c / 100).toFixed(2)}` : "$0.00");

  // ── DnD ─────────────────────────────────────────────────────────────────────
  function onDragStart(e: React.DragEvent, id: string) {
    dragIdRef.current = id;
    e.dataTransfer.setData("text/plain", id);
  }
  function onDragOver(e: React.DragEvent, stage: string) {
    e.preventDefault();
    if (overStage !== stage) setOverStage(stage);
  }
  async function onDrop(e: React.DragEvent, stage: string) {
    e.preventDefault();
    setOverStage(null);
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;

    // optimistic move (on base cols)
    setCols((prev) => {
      const next: Record<string, Order[]> = {};
      for (const k of Object.keys(prev)) next[k] = [...prev[k]];
      let moved: Order | null = null;
      for (const k of Object.keys(next)) {
        const i = next[k].findIndex((o) => o.id === id);
        if (i >= 0) { moved = { ...next[k][i], stage }; next[k].splice(i, 1); break; }
      }
      if (moved) next[stage].unshift(moved);
      return next;
    });

    // persist
    const { error } = await supabase.rpc("gg_update_opportunity_stage_v1", {
      p_tenant_id: tenantId,
      p_order_id: id,
      p_stage: stage,
    });
    if (error) {
      // revert to original from props if save fails
      console.error(error);
      const by: Record<string, Order[]> = {};
      stages.forEach((s) => (by[s] = []));
      (orders || []).forEach((o) => {
        const k = o.stage && stages.includes(o.stage) ? o.stage : stages[0];
        by[k].push(o);
      });
      setCols(by);
      alert("Failed to update stage.");
    }
    dragIdRef.current = null;
  }

  return (
    <div className="kanban-wrap">
      <style jsx>{`
        .kanban-wrap { width: 100%; }

        /* Toolbar (search) */
        .toolbar {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
        }
        .search {
          flex: 1;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 10px;
          border-radius: 10px;
          border: 1px solid rgb(var(--border-600));
          background: rgb(var(--card-700));
        }
        .search input {
          flex: 1;
          background: transparent;
          border: 0;
          outline: none;
          color: inherit;
          min-width: 80px;
        }
        .search .clear {
          padding: 4px 8px;
          border-radius: 8px;
          border: 1px solid rgb(var(--border-600));
          background: rgb(var(--surface-800));
        }

        /* Full-width rails; page handles horizontal scroll on very small screens */
        .board {
          display: grid;
          grid-template-columns: repeat(${stages.length}, minmax(300px, 1fr));
          gap: 16px;
          width: 100%;
          align-items: start;
        }
        @media (min-width: 1440px) {
          .board { grid-template-columns: repeat(${stages.length}, minmax(340px, 1fr)); }
        }
        /* Mobile/PWA: stack columns vertically for easy vertical scrolling */
        @media (max-width: 768px) {
          .board { grid-template-columns: 1fr; }
        }

        .col {
          background: rgb(var(--card-700));
          border: 1px solid rgb(var(--border-600));
          border-radius: var(--radius);
          display: flex;
          flex-direction: column;
          min-height: 0;
          box-shadow: 0 8px 18px rgba(59,130,246,.10);
        }
        .head {
          position: sticky; top: 0; z-index: 1;
          padding: 10px 12px;
          background: rgb(var(--card-700));
          border-bottom: 1px solid rgb(var(--border-600));
          border-top-left-radius: var(--radius);
          border-top-right-radius: var(--radius);
        }
        .head-row {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 8px;
        }
        .stage-title { font-weight: 800; text-transform: capitalize; }
        .totals {
          color: rgb(var(--text-300));
          font-size: 12px;
          font-variant-numeric: tabular-nums;
          text-align: right;
          white-space: nowrap;
        }

        .body {
          padding: 12px;
          display: grid;
          gap: 10px;
          grid-auto-rows: ${CARD_SIZE_DESKTOP}px;
        }
        @media (max-width: 768px) {
          .body {
            grid-auto-rows: ${CARD_SIZE_MOBILE}px;
          }
        }

        .col.drop { outline: 2px dashed rgba(59,130,246,.9); outline-offset: -6px; }

        /* Simple square card with subtle blue underlight */
        .kcard {
          height: 100%;
          background: rgb(var(--surface-800));
          border: 1px solid rgb(var(--border-600));
          border-radius: 12px;
          box-shadow: 0 10px 22px rgba(59,130,246,.16);
          padding: 10px;
          display: grid;
          grid-template-rows: auto 1fr auto; /* title / items / total */
          gap: 6px;
          cursor: grab;
          transition: border-color .12s ease, box-shadow .12s ease, transform .06s ease;
        }
        .kcard:hover { border-color: rgba(255,255,255,.18); box-shadow: 0 14px 28px rgba(59,130,246,.22); }
        .kcard:active { cursor: grabbing; transform: scale(0.995); }

        .title {
          font-weight: 800;
          line-height: 1.1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .items {
          display: grid;
          gap: 2px;
          overflow: hidden;
        }
        .item {
          display: flex;
          gap: 6px;
          font-size: 12px;
          color: rgb(var(--text-300));
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }
        .qty { min-width: 22px; text-align: right; font-variant-numeric: tabular-nums; }

        .total {
          justify-self: end;
          font-weight: 900;
          font-variant-numeric: tabular-nums;
        }

        .empty {
          color: rgb(var(--text-300));
          font-size: 12px;
          padding: 6px 2px;
        }
      `}</style>

      {/* Toolbar */}
      <div className="toolbar">
        <div className="search">
          <input
            value={q}
            placeholder="Search orders, items, or SKU…"
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search orders"
          />
          {q && (
            <button className="clear" type="button" onClick={() => setQ("")}>
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="board">
        {stages.map((stage) => {
          const hot  = overStage === stage;
          const list = viewCols[stage] || [];
          const sum  = sums[stage] || 0;
          const cnt  = counts[stage] || 0;

          return (
            <div
              key={stage}
              className={`col ${hot ? "drop" : ""}`}
              onDragOver={(e) => onDragOver(e, stage)}
              onDrop={(e) => onDrop(e, stage)}
            >
              <div className="head">
                <div className="head-row">
                  <div className="stage-title">{stage}</div>
                  <div className="totals">
                    {cnt} {cnt === 1 ? "order" : "orders"} · {currency(sum)}
                  </div>
                </div>
              </div>

              <div className="body">
                {list.map((o) => {
                  const items = Array.isArray(o.items) ? o.items : [];
                  const show  = items.slice(0, 2);                 // keep tiles tidy: 2 lines max
                  const more  = items.length - show.length;        // show "+N more" if needed
                  return (
                    <div
                      key={o.id}
                      className="kcard"
                      draggable
                      onDragStart={(e) => onDragStart(e, o.id)}
                      onClick={() => {
                        if (dragIdRef.current === o.id) return; // ignore the click triggered after a drag
                        router.push(`/storefront/orders/${o.id}`);
                      }}
                      title={o.title || "Untitled Order"}
                    >
                      <div className="title">{o.title || "Untitled Order"}</div>

                      {show.length > 0 ? (
                        <div className="items">
                          {show.map((it, i) => (
                            <div key={i} className="item" title={it.name || it.sku || "Item"}>
                              <span className="qty">{it.quantity ?? 0}×</span>
                              <span className="nm">{it.name || it.sku || "Item"}</span>
                            </div>
                          ))}
                          {more > 0 && <div className="item">+{more} more…</div>}
                        </div>
                      ) : (
                        <div className="items" />
                      )}

                      <div className="total">{currency(o.amount_cents)}</div>
                    </div>
                  );
                })}

                {list.length === 0 && <div className="empty">No orders in “{stage}”.</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
