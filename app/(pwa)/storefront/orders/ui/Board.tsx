"use client";

import { useMemo, useRef, useState } from "react";
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
      const k = o.stage && stages.some((s) => s.key === o.stage) ? o.stage : stages[0]?.key ?? "new";
      by[k] = [...(by[k] ?? []), o];
    });
    return by;
  });

  const [overStage, setOverStage] = useState<string | null>(null);
  const dragIdRef = useRef<string | null>(null);
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
  }, [cols, stages, q]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const st of stages) c[st.key] = viewCols[st.key]?.length ?? 0;
    return c;
  }, [viewCols, stages]);

  const sums = useMemo(() => {
    const s: Record<string, number> = {};
    for (const st of stages) {
      s[st.key] = (viewCols[st.key] || []).reduce((acc, o) => acc + (typeof o.amount_cents === "number" ? o.amount_cents : 0), 0);
    }
    return s;
  }, [viewCols, stages]);

  const currency = (c?: number | null) => (typeof c === "number" ? `$${(c / 100).toFixed(2)}` : "$0.00");

  function onDragStart(e: React.DragEvent, id: string) {
    dragIdRef.current = id;
    e.dataTransfer.setData("text/plain", id);
  }
  function onDragOver(e: React.DragEvent, stageKey: string) {
    e.preventDefault();
    if (overStage !== stageKey) setOverStage(stageKey);
  }
  async function onDrop(e: React.DragEvent, stageKey: string) {
    e.preventDefault();
    setOverStage(null);
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;

    setCols((prev) => {
      const next: Record<string, Order[]> = {};
      for (const k of Object.keys(prev)) next[k] = [...prev[k]];
      let moved: Order | null = null;
      for (const k of Object.keys(next)) {
        const i = next[k].findIndex((o) => o.id === id);
        if (i >= 0) { moved = { ...next[k][i], stage: stageKey }; next[k].splice(i, 1); break; }
      }
      if (moved) next[stageKey] = [moved, ...(next[stageKey] ?? [])];
      return next;
    });

    const { error } = await supabase.rpc("gg_update_opportunity_stage_v1", {
      p_tenant_id: tenantId,
      p_order_id: id,
      p_stage: stageKey,
    });
    if (error) {
      console.error(error);
      // revert
      const by: Record<string, Order[]> = {};
      stages.forEach((s) => (by[s.key] = []));
      (orders || []).forEach((o) => {
        const k = o.stage && stages.some((s) => s.key === o.stage) ? o.stage : stages[0]?.key ?? "new";
        by[k] = [...(by[k] ?? []), o];
      });
      setCols(by);
      alert("Failed to update stage.");
    }
    dragIdRef.current = null;
  }

  return (
    <div>
      <style jsx>{`
        /* Search toolbar */
        .toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
        .search {
          flex: 1; display: inline-flex; align-items: center; gap: 8px;
          padding: 8px 12px; border-radius: 10px;
          border: 1px solid rgb(var(--border-600));
          background: rgb(var(--card-700));
        }
        .search input { flex: 1; background: transparent; border: 0; outline: none; color: inherit; min-width: 80px; }
        .search .clear { padding: 3px 8px; border-radius: 6px; border: 1px solid rgb(var(--border-600)); background: rgb(var(--surface-800)); cursor: pointer; font-size: 12px; }

        /* Board — horizontal on desktop, vertical on mobile */
        .board {
          display: grid;
          grid-template-columns: repeat(${stages.length}, minmax(280px, 1fr));
          gap: 14px;
          align-items: start;
          width: 100%;
        }
        @media (max-width: 768px) {
          .board { grid-template-columns: 1fr; }
        }

        /* Column */
        .col {
          background: rgb(var(--card-700));
          border: 1px solid rgb(var(--border-600));
          border-radius: var(--radius);
          display: flex; flex-direction: column;
          box-shadow: 0 4px 12px rgba(59,130,246,.08);
        }
        .col.drop { outline: 2px dashed rgba(59,130,246,.8); outline-offset: -4px; }

        /* Column header */
        .head {
          padding: 10px 14px;
          border-bottom: 1px solid rgb(var(--border-600));
          border-top-left-radius: var(--radius);
          border-top-right-radius: var(--radius);
          background: rgb(var(--card-700));
        }
        .head-row { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
        .stage-label { font-weight: 800; font-size: 14px; }
        .stage-meta { font-size: 11px; opacity: 0.55; white-space: nowrap; }

        /* Card list */
        .body { padding: 10px; display: flex; flex-direction: column; gap: 8px; }

        /* Card — auto height, content-driven */
        .kcard {
          background: rgb(var(--surface-800));
          border: 1px solid rgb(var(--border-600));
          border-radius: 10px;
          box-shadow: 0 4px 14px rgba(59,130,246,.12);
          padding: 12px;
          cursor: grab;
          transition: border-color .12s, box-shadow .12s;
          display: flex; flex-direction: column; gap: 6px;
        }
        .kcard:hover { border-color: rgba(255,255,255,.18); box-shadow: 0 8px 22px rgba(59,130,246,.2); }
        .kcard:active { cursor: grabbing; }

        .card-title { font-weight: 700; font-size: 14px; line-height: 1.2; }
        .card-items { display: flex; flex-direction: column; gap: 2px; }
        .card-item { font-size: 12px; opacity: 0.65; display: flex; gap: 6px; }
        .card-item .qty { font-variant-numeric: tabular-nums; min-width: 22px; }
        .card-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 2px; }
        .card-total { font-weight: 800; font-variant-numeric: tabular-nums; font-size: 14px; }
        .card-hint { font-size: 11px; opacity: 0.35; }

        .empty { padding: 16px 10px; font-size: 13px; opacity: 0.4; text-align: center; }
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
          {q && <button className="clear" type="button" onClick={() => setQ("")}>Clear</button>}
        </div>
      </div>

      <div className="board">
        {stages.map((stage) => {
          const list = viewCols[stage.key] || [];
          const cnt  = counts[stage.key] || 0;
          const sum  = sums[stage.key]   || 0;
          const hot  = overStage === stage.key;

          return (
            <div
              key={stage.key}
              className={`col ${hot ? "drop" : ""}`}
              onDragOver={(e) => onDragOver(e, stage.key)}
              onDrop={(e) => onDrop(e, stage.key)}
            >
              <div className="head">
                <div className="head-row">
                  <span className="stage-label">{stage.label}</span>
                  <span className="stage-meta">
                    {cnt} {cnt === 1 ? "order" : "orders"} · {currency(sum)}
                  </span>
                </div>
              </div>

              <div className="body">
                {list.map((o) => {
                  const items = Array.isArray(o.items) ? o.items : [];
                  const show  = items.slice(0, 3);
                  const more  = items.length - show.length;
                  return (
                    <div
                      key={o.id}
                      className="kcard"
                      draggable
                      onDragStart={(e) => onDragStart(e, o.id)}
                      onClick={() => {
                        if (dragIdRef.current === o.id) return;
                        router.push(`/storefront/orders/${o.id}`);
                      }}
                    >
                      <div className="card-title">{o.title || "Untitled Order"}</div>
                      {show.length > 0 && (
                        <div className="card-items">
                          {show.map((it, i) => (
                            <div key={i} className="card-item">
                              <span className="qty">{it.quantity ?? 0}×</span>
                              <span>{it.name || it.sku || "Item"}</span>
                            </div>
                          ))}
                          {more > 0 && <div className="card-item" style={{ opacity: 0.4 }}>+{more} more…</div>}
                        </div>
                      )}
                      <div className="card-footer">
                        <span className="card-total">{currency(o.amount_cents)}</span>
                        <span className="card-hint">Tap to open</span>
                      </div>
                    </div>
                  );
                })}
                {list.length === 0 && <div className="empty">No orders</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
