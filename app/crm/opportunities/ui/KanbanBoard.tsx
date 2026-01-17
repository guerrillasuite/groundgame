"use client";

import { useEffect, useMemo, useState } from "react";
import { updateOpportunityStage, updateOpportunityField } from "../actions";

type Opp = { id: string; title: string | null; amount_cents: number | null };
type ColumnMap = Record<string, Opp[]>;
type Props = {
  stages?: string[];
  itemsByStage?: ColumnMap;
};

function normalizeColumns(stages: string[], map: ColumnMap): ColumnMap {
  const out: ColumnMap = {};
  for (const s of stages) out[s] = Array.isArray(map?.[s]) ? [...map[s]] : [];
  return out;
}

export default function KanbanBoard({ stages = [], itemsByStage = {} }: Props) {
  const safeStages = Array.isArray(stages) ? stages : [];

  // Seed state once; keep in sync via effect below
  const initialColumns = useMemo(
    () => normalizeColumns(safeStages, itemsByStage),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const [columns, setColumns] = useState<ColumnMap>(initialColumns);

  // Sync when parent provides new data
  useEffect(() => {
    setColumns(normalizeColumns(safeStages, itemsByStage));
  }, [safeStages.join("|"), JSON.stringify(itemsByStage)]);

  function onDragStart(e: React.DragEvent, id: string, from: string) {
    e.dataTransfer.setData("text/plain", JSON.stringify({ id, from }));
    e.dataTransfer.effectAllowed = "move";
  }

  function onDrop(e: React.DragEvent, to: string) {
    e.preventDefault();
    const raw = e.dataTransfer.getData("text/plain");
    if (!raw) return;

    let payload: { id: string; from: string } | null = null;
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }
    if (!payload) return;

    const { id, from } = payload;
    if (!id || !from || from === to) return;

    setColumns(prev => {
      const src = [...(prev[from] ?? [])];
      const dst = [...(prev[to] ?? [])];
      const idx = src.findIndex(i => i.id === id);
      if (idx >= 0) {
        const [item] = src.splice(idx, 1);
        dst.unshift(item);
        return { ...prev, [from]: src, [to]: dst };
      }
      return prev;
    });

    // Persist (fire-and-forget)
    updateOpportunityStage(id, to).catch(console.error);
  }

  // Render keys: prefer provided stages; otherwise fall back to whatever is in state
  const colsToRender = safeStages.length ? safeStages : Object.keys(columns);
  const gridCols = Math.max(1, colsToRender.length);

  return (
    <div
      style={{
        display: "grid",
        gap: 12,
        gridTemplateColumns: `repeat(${gridCols}, minmax(220px, 1fr))`,
      }}
    >
      {colsToRender.map(stage => (
        <div
          key={stage}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => onDrop(e, stage)}
          style={{
            background: "var(--brand-surface)",
            borderRadius: "var(--radius)",
            boxShadow: "var(--shadow)",
            padding: 8,
            minHeight: 320,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6, textTransform: "capitalize" }}>
            {stage}
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            {(columns[stage] ?? []).map((card) => (
              <article
                key={card.id}
                draggable
                onDragStart={(e) => onDragStart(e, card.id, stage)}
                style={{
                  background: "var(--brand-bg)",
                  color: "var(--brand-text)",
                  borderRadius: "var(--radius)",
                  boxShadow: "var(--shadow-press)",
                  padding: 10,
                  cursor: "grab",
                }}
              >
                <input
                  defaultValue={card.title ?? ""}
                  placeholder="Title"
                  onBlur={(e) =>
                    updateOpportunityField(card.id, { title: e.currentTarget.value }).catch(console.error)
                  }
                  style={{
                    width: "100%",
                    background: "transparent",
                    border: "1px solid rgba(255,255,255,.12)",
                    borderRadius: 8,
                    padding: "6px 8px",
                    color: "inherit",
                    marginBottom: 6,
                  }}
                />

                <div style={{ fontSize: 12, opacity: 0.8 }}>
                  {((card.amount_cents ?? 0) / 100).toLocaleString()} USD
                </div>
              </article>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
