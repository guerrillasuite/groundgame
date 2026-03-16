"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { updateOpportunityStage, updateOpportunityField } from "../actions";
import type { OppCard } from "../page";

type ColumnMap = Record<string, OppCard[]>;

type Props = {
  stageKeys?: string[];
  stageLabels?: Record<string, string>;
  itemsByStage?: ColumnMap;
};

const PRIORITY_COLOR: Record<string, string> = {
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#6b7280",
};

const SOURCE_LABEL: Record<string, string> = {
  doors: "Doors",
  calls: "Calls",
  walklist: "List",
  manual: "Manual",
};

function buildColumns(keys: string[], map: ColumnMap): ColumnMap {
  const out: ColumnMap = {};
  for (const k of keys) out[k] = Array.isArray(map?.[k]) ? [...map[k]] : [];
  return out;
}

export default function KanbanBoard({
  stageKeys = [],
  stageLabels = {},
  itemsByStage = {},
}: Props) {
  const keys = Array.isArray(stageKeys) ? stageKeys.filter(Boolean) : [];

  // Track last-known server state to seed/reset columns
  const serverRef = useRef<ColumnMap>({});
  const [columns, setColumns] = useState<ColumnMap>(() => buildColumns(keys, itemsByStage));

  // Sync when server pushes fresh data
  const serialized = JSON.stringify(itemsByStage);
  useEffect(() => {
    const next = buildColumns(keys, itemsByStage);
    serverRef.current = next;
    setColumns(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageKeys.join(","), serialized]);

  function onDragStart(e: React.DragEvent, id: string, from: string) {
    e.dataTransfer.setData("text/plain", JSON.stringify({ id, from }));
    e.dataTransfer.effectAllowed = "move";
  }

  function onDrop(e: React.DragEvent, to: string) {
    e.preventDefault();
    const raw = e.dataTransfer.getData("text/plain");
    if (!raw) return;
    let payload: { id: string; from: string } | null = null;
    try { payload = JSON.parse(raw); } catch { return; }
    if (!payload) return;
    const { id, from } = payload;
    if (!id || !from || from === to) return;

    setColumns((prev) => {
      const src = [...(prev[from] ?? [])];
      const dst = [...(prev[to] ?? [])];
      const idx = src.findIndex((i) => i.id === id);
      if (idx < 0) return prev;
      const [item] = src.splice(idx, 1);
      dst.unshift(item);
      return { ...prev, [from]: src, [to]: dst };
    });

    updateOpportunityStage(id, to).catch(console.error);
  }

  const gridCols = Math.max(1, keys.length);

  return (
    <div
      style={{
        display: "grid",
        gap: 12,
        gridTemplateColumns: `repeat(${gridCols}, minmax(220px, 1fr))`,
      }}
    >
      {keys.map((stageKey) => {
        const label = stageLabels[stageKey] || stageKey;
        const cards = columns[stageKey] ?? [];

        return (
          <div
            key={stageKey}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => onDrop(e, stageKey)}
            style={{
              background: "var(--brand-surface)",
              borderRadius: "var(--radius)",
              boxShadow: "var(--shadow)",
              padding: 8,
              minHeight: 320,
            }}
          >
            <div style={{
              fontWeight: 700, marginBottom: 8, fontSize: 13,
              textTransform: "capitalize", opacity: 0.8,
            }}>
              {label}
              <span style={{ marginLeft: 6, fontWeight: 400, opacity: 0.5 }}>
                {cards.length}
              </span>
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              {cards.map((card) => (
                <article
                  key={card.id}
                  draggable
                  onDragStart={(e) => onDragStart(e, card.id, stageKey)}
                  style={{
                    background: "var(--brand-bg)",
                    color: "var(--brand-text)",
                    borderRadius: "var(--radius)",
                    boxShadow: "var(--shadow-press)",
                    padding: 10,
                    cursor: "grab",
                  }}
                >
                  {/* Top row: priority dot + source badge + open link */}
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 7 }}>
                    {card.priority && PRIORITY_COLOR[card.priority] && (
                      <span
                        title={card.priority}
                        style={{
                          width: 7, height: 7, borderRadius: "50%",
                          background: PRIORITY_COLOR[card.priority],
                          flexShrink: 0,
                        }}
                      />
                    )}
                    {card.source && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
                        textTransform: "uppercase",
                        background: "rgba(255,255,255,.1)",
                        borderRadius: 4, padding: "1px 5px", opacity: 0.7,
                      }}>
                        {SOURCE_LABEL[card.source] ?? card.source}
                      </span>
                    )}
                    <Link
                      href={`/crm/opportunities/${card.id}`}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        marginLeft: "auto", fontSize: 11, opacity: 0.45,
                        textDecoration: "none", whiteSpace: "nowrap",
                      }}
                    >
                      Open →
                    </Link>
                  </div>

                  {/* Title (inline editable) */}
                  <input
                    defaultValue={card.title ?? ""}
                    placeholder="Untitled"
                    onBlur={(e) =>
                      updateOpportunityField(card.id, { title: e.currentTarget.value }).catch(console.error)
                    }
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      width: "100%",
                      background: "transparent",
                      border: "1px solid rgba(255,255,255,.12)",
                      borderRadius: 7,
                      padding: "5px 8px",
                      color: "inherit",
                      marginBottom: 6,
                      fontSize: 13,
                      fontWeight: 600,
                      boxSizing: "border-box",
                    }}
                  />

                  {card.contact_name && (
                    <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 2 }}>
                      {card.contact_name}
                    </div>
                  )}
                  {card.contact_method && (
                    <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 4, fontFamily: "monospace" }}>
                      {card.contact_method}
                    </div>
                  )}
                  {card.amount_cents != null && card.amount_cents > 0 && (
                    <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.85, marginTop: 2 }}>
                      ${(card.amount_cents / 100).toLocaleString()}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
