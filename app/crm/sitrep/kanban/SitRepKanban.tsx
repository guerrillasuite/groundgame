"use client";

import { useState, useCallback, useRef } from "react";
import Link from "next/link";
import { COLOR_FAMILIES, getFamilyByKey, type ColorFamily } from "@/lib/sitrep-colors";
import { SitRepViewToggle } from "../_components/SitRepViewToggle";

// ── Types ─────────────────────────────────────────────────────────────────────

type Stage = {
  slug: string;
  name: string;
  color: string;
  is_terminal: boolean;
  sort_order: number;
};

type KanbanType = {
  id?: string;
  slug: string;
  name: string;
  color: string;
  sort_order: number;
  show_in_kanban: boolean;
  is_mission_type: boolean;
  stages: Stage[];
};

type KanbanItem = {
  id: string;
  item_type: string;
  title: string;
  status: string | null;
  priority: string | null;
  due_date: string | null;
  start_at: string | null;
  parent_item_id: string | null;
  depth: number;
  created_by: string;
  sitrep_assignments: { user_id: string; role: string }[];
};

type Props = {
  initialItems: KanbanItem[];
  types: KanbanType[];
  currentUserId: string;
};

// ── Style constants ───────────────────────────────────────────────────────────

const S = {
  surface: "rgb(18 23 33)",
  card:    "rgb(28 36 48)",
  border:  "rgb(43 53 67)",
  text:    "rgb(238 242 246)",
  dim:     "rgb(160 174 192)",
} as const;

// ── Color helper ──────────────────────────────────────────────────────────────

function getFamily(colorKey: string): ColorFamily {
  return getFamilyByKey(colorKey) ?? COLOR_FAMILIES[0];
}

// ── Priority dot ──────────────────────────────────────────────────────────────

function PriorityDot({ priority }: { priority: string | null }) {
  if (priority === "urgent") return <span style={{ color: "rgb(239 68 68)", fontSize: 10, fontWeight: 800 }}>!!</span>;
  if (priority === "high")   return <span style={{ color: "rgb(245 158 11)", fontSize: 10, fontWeight: 800 }}>!</span>;
  return null;
}

// ── Kanban Card ───────────────────────────────────────────────────────────────

function KanbanCard({
  item,
  typeFamily,
  isDragging,
  onDragStart,
}: {
  item: KanbanItem;
  typeFamily: ColorFamily;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
}) {
  const today = new Date().toISOString().split("T")[0];
  const effectiveDate = item.item_type === "task" ? item.due_date : (item.start_at ?? item.due_date);
  const isOverdue = effectiveDate && effectiveDate.split("T")[0] < today && item.status !== "done" && item.status !== "cancelled";

  return (
    <div
      draggable
      onDragStart={onDragStart}
      style={{
        background: S.card,
        border: `1px solid ${S.border}`,
        borderTop: `2px solid ${typeFamily.shades[2]}`,
        borderRadius: 10,
        padding: "10px 12px",
        cursor: "grab",
        opacity: isDragging ? 0.5 : 1,
        transition: "opacity .1s, box-shadow .1s",
        boxShadow: "0 2px 8px rgba(0,0,0,.25)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 4 }}>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: S.text, lineHeight: 1.35 }}>
          {item.title}
        </span>
        {item.priority && <PriorityDot priority={item.priority} />}
      </div>
      {effectiveDate && (
        <div style={{
          fontSize: 11, color: isOverdue ? "rgb(239 68 68)" : S.dim,
          fontWeight: isOverdue ? 600 : 400,
        }}>
          {isOverdue ? "Overdue · " : ""}
          {new Date(effectiveDate.split("T")[0] + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </div>
      )}
      <Link
        href={`/crm/sitrep/${item.id}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          display: "block", marginTop: 6, fontSize: 10, color: "rgba(160,174,192,.6)",
          textDecoration: "none",
        }}
      >
        Open →
      </Link>
    </div>
  );
}

// ── Column ────────────────────────────────────────────────────────────────────

function KanbanColumn({
  stage,
  items,
  typeFamily,
  draggingId,
  onDragStart,
  onDrop,
}: {
  stage: Stage;
  items: KanbanItem[];
  typeFamily: ColorFamily;
  draggingId: string | null;
  onDragStart: (id: string) => void;
  onDrop: (stageSlug: string) => void;
}) {
  const [over, setOver] = useState(false);
  const stageFamily = getFamilyByKey(stage.color) ?? typeFamily;

  return (
    <div
      style={{
        minWidth: 220,
        flex: "1 1 220px",
        maxWidth: 340,
        display: "flex",
        flexDirection: "column",
        gap: 0,
      }}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); onDrop(stage.slug); }}
    >
      {/* Column header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 10px 10px",
        borderBottom: `2px solid ${stageFamily.shades[1]}55`,
        marginBottom: 8,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            width: 8, height: 8, borderRadius: "50%",
            background: stageFamily.shades[2],
            flexShrink: 0,
          }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: S.text }}>{stage.name}</span>
        </div>
        <span style={{
          fontSize: 11, fontWeight: 600,
          background: "rgba(255,255,255,.07)", borderRadius: 8,
          padding: "2px 7px", color: S.dim,
        }}>
          {items.length}
        </span>
      </div>

      {/* Cards */}
      <div style={{
        flex: 1,
        minHeight: 80,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "0 2px 12px",
        borderRadius: 8,
        background: over ? "rgba(255,255,255,.03)" : "transparent",
        transition: "background .1s",
        border: over ? `1px dashed ${stageFamily.shades[2]}55` : "1px solid transparent",
      }}>
        {items.map((item) => (
          <KanbanCard
            key={item.id}
            item={item}
            typeFamily={typeFamily}
            isDragging={draggingId === item.id}
            onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; onDragStart(item.id); }}
          />
        ))}
      </div>
    </div>
  );
}

// ── Type Row ──────────────────────────────────────────────────────────────────

function TypeRow({
  type,
  items,
  showTerminal,
  draggingId,
  onDragStart,
  onDrop,
}: {
  type: KanbanType;
  items: KanbanItem[];
  showTerminal: boolean;
  draggingId: string | null;
  onDragStart: (id: string) => void;
  onDrop: (typeSlug: string, stageSlug: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const family = getFamily(type.color);

  const visibleStages = (type.stages ?? [])
    .filter((s) => showTerminal || !s.is_terminal)
    .sort((a, b) => a.sort_order - b.sort_order);

  const itemsByStage: Record<string, KanbanItem[]> = {};
  for (const stage of type.stages ?? []) {
    itemsByStage[stage.slug] = items.filter((i) => i.status === stage.slug);
  }
  // Items with unrecognized status → first non-terminal stage
  const defaultStage = (type.stages ?? []).find((s) => !s.is_terminal)?.slug;
  for (const item of items) {
    const knownSlugs = new Set((type.stages ?? []).map((s) => s.slug));
    if (!knownSlugs.has(item.status ?? "")) {
      if (defaultStage) {
        itemsByStage[defaultStage] = [...(itemsByStage[defaultStage] ?? []), item];
      }
    }
  }

  return (
    <div style={{
      background: S.card,
      border: `1px solid ${S.border}`,
      borderLeft: `3px solid ${family.shades[2]}`,
      borderRadius: 12,
      overflow: "hidden",
    }}>
      {/* Row header */}
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        style={{
          width: "100%", textAlign: "left", background: "none", border: "none",
          display: "flex", alignItems: "center", gap: 10,
          padding: "12px 16px", cursor: "pointer",
          borderBottom: collapsed ? "none" : `1px solid ${S.border}`,
        }}
      >
        <span style={{
          display: "inline-block",
          transition: "transform .15s",
          transform: collapsed ? "none" : "rotate(90deg)",
          color: S.dim, fontSize: 12,
        }}>▶</span>
        <span style={{
          width: 10, height: 10, borderRadius: "50%",
          background: family.shades[2], flexShrink: 0,
        }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: S.text, flex: 1 }}>
          {type.name.toUpperCase()}
        </span>
        <span style={{
          fontSize: 11, color: S.dim,
          background: "rgba(255,255,255,.07)",
          borderRadius: 8, padding: "2px 8px",
        }}>
          {items.length} item{items.length !== 1 ? "s" : ""}
        </span>
      </button>

      {/* Columns */}
      {!collapsed && (
        <div style={{
          display: "flex", gap: 12, padding: "14px 14px 10px",
          overflowX: "auto",
        }}>
          {visibleStages.map((stage) => (
            <KanbanColumn
              key={stage.slug}
              stage={stage}
              items={itemsByStage[stage.slug] ?? []}
              typeFamily={family}
              draggingId={draggingId}
              onDragStart={onDragStart}
              onDrop={(stageSlug) => onDrop(type.slug, stageSlug)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Board ────────────────────────────────────────────────────────────────

export default function SitRepKanban({ initialItems, types, currentUserId }: Props) {
  const [items, setItems] = useState<KanbanItem[]>(initialItems);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingType, setDraggingType] = useState<string | null>(null);
  const [showTerminal, setShowTerminal] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);

  const kanbanTypes = types.filter((t) => t.show_in_kanban);

  function filterItems(typeSlug: string): KanbanItem[] {
    let filtered = items.filter((i) => i.item_type === typeSlug);
    if (mineOnly) {
      filtered = filtered.filter(
        (i) => i.created_by === currentUserId ||
          i.sitrep_assignments?.some((a) => a.user_id === currentUserId)
      );
    }
    return filtered;
  }

  function handleDragStart(itemId: string) {
    const item = items.find((i) => i.id === itemId);
    setDraggingId(itemId);
    setDraggingType(item?.item_type ?? null);
  }

  async function handleDrop(typeSlug: string, stageSlug: string) {
    if (!draggingId) return;

    // Disallow cross-type moves (item type must match row type)
    const item = items.find((i) => i.id === draggingId);
    if (!item || item.item_type !== typeSlug) {
      setDraggingId(null);
      setDraggingType(null);
      return;
    }

    if (item.status === stageSlug) {
      setDraggingId(null);
      setDraggingType(null);
      return;
    }

    // Optimistic update
    setItems((prev) =>
      prev.map((i) => i.id === draggingId ? { ...i, status: stageSlug } : i)
    );
    setDraggingId(null);
    setDraggingType(null);

    // Persist
    const res = await fetch(`/api/crm/sitrep/items/${draggingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: stageSlug }),
    });
    if (!res.ok) {
      // Revert
      setItems((prev) =>
        prev.map((i) => i.id === draggingId ? { ...i, status: item.status } : i)
      );
    }
  }

  const PILL: React.CSSProperties = {
    padding: "5px 13px", borderRadius: 20, fontSize: 12, fontWeight: 600,
    cursor: "pointer", border: "1px solid rgba(255,255,255,.08)", transition: "all .1s",
  };

  return (
    <div style={{ minHeight: "100vh", background: S.surface, padding: "24px 24px 60px" }}>

      {/* Header */}
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexWrap: "wrap", gap: 12, marginBottom: 20,
        }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: S.text }}>SitRep</h1>
            <p style={{ margin: "2px 0 0", fontSize: 13, color: S.dim }}>Kanban Board</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {/* Mine filter */}
            <button
              type="button"
              onClick={() => setMineOnly((v) => !v)}
              style={{
                ...PILL,
                background: mineOnly ? "rgba(99,102,241,.18)" : "rgba(255,255,255,.05)",
                borderColor: mineOnly ? "rgba(99,102,241,.4)" : "rgba(255,255,255,.08)",
                color: mineOnly ? "#a5b4fc" : S.dim,
              }}
            >
              {mineOnly ? "✓ Mine" : "Mine"}
            </button>
            {/* Terminal toggle */}
            <button
              type="button"
              onClick={() => setShowTerminal((v) => !v)}
              style={{
                ...PILL,
                background: showTerminal ? "rgba(255,255,255,.1)" : "rgba(255,255,255,.05)",
                borderColor: showTerminal ? "rgba(255,255,255,.25)" : "rgba(255,255,255,.08)",
                color: showTerminal ? S.text : S.dim,
              }}
            >
              {showTerminal ? "✓ Show Completed" : "Show Completed"}
            </button>
            <SitRepViewToggle />
          </div>
        </div>

        {/* Type rows */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {kanbanTypes.map((type) => (
            <TypeRow
              key={type.slug}
              type={type}
              items={filterItems(type.slug)}
              showTerminal={showTerminal}
              draggingId={draggingId}
              onDragStart={handleDragStart}
              onDrop={handleDrop}
            />
          ))}
          {kanbanTypes.length === 0 && (
            <div style={{ textAlign: "center", padding: 60, color: S.dim, fontSize: 14 }}>
              No item types with Kanban enabled. Enable "Show in Kanban" in{" "}
              <a href="/crm/settings/sitrep" style={{ color: "#a5b4fc" }}>SitRep Settings</a>.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
