"use client";

import { getFamilyByKey, getFamilyForType } from "@/lib/sitrep-colors";
import { todayStr, localDateStr, effectiveDate, fmtItemDate } from "@/lib/date-utils";
import SwipeableRow from "./SwipeableRow";

export type SitRepItem = {
  id: string;
  title: string;
  item_type: string;
  status: string;
  due_date: string | null;
  start_at?: string | null;
  end_at?: string | null;
  is_all_day?: boolean | null;
  priority: string | null;
  visibility?: string;
  created_by?: string;
  mission_id?: string | null;
  parent_item_id?: string | null;
  sitrep_assignments?: { user_id: string; role: string }[];
};

const TYPE_LABEL: Record<string, string> = { task: "TASK", event: "EVENT", meeting: "MTG" };

interface ListRowProps {
  item: SitRepItem;
  typeColor?: string;
  typeName?: string;
  tz: string;
  onTap: () => void;
  onComplete: () => void;
  onReschedule: () => void;
  completing?: boolean;
}

function isOverdue(item: SitRepItem): boolean {
  if (item.status === "done" || item.status === "cancelled") return false;
  const ed = effectiveDate(item);
  if (!ed) return false;
  const ds = ed.includes("T") ? localDateStr(ed) : ed;
  return ds < todayStr();
}

function AssigneeDots({ assignments }: { assignments?: { user_id: string }[] }) {
  const ids = (assignments ?? []).slice(0, 4);
  if (!ids.length) return null;
  return (
    <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
      {ids.map(({ user_id }) => {
        const hue = Math.abs((user_id.charCodeAt(0) ?? 65) * 37 + (user_id.charCodeAt(1) ?? 0) * 17) % 360;
        return (
          <span key={user_id} style={{
            width: 18, height: 18, borderRadius: "50%",
            background: `hsl(${hue},45%,32%)`,
            border: `1.5px solid hsl(${hue},50%,48%)`,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontSize: 7, fontWeight: 800, color: "#fff", flexShrink: 0,
            letterSpacing: 0,
          }}>
            {user_id.slice(0, 1).toUpperCase()}
          </span>
        );
      })}
      {(assignments?.length ?? 0) > 4 && (
        <span style={{
          width: 18, height: 18, borderRadius: "50%",
          background: "rgba(0,0,0,.2)", border: "1.5px solid rgba(0,0,0,.3)",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          fontSize: 7, fontWeight: 800, color: "rgba(0,0,0,.6)", flexShrink: 0,
        }}>
          +{(assignments?.length ?? 0) - 4}
        </span>
      )}
    </div>
  );
}

export default function ListRow({
  item, typeColor, typeName, tz, onTap, onComplete, onReschedule, completing = false,
}: ListRowProps) {
  const family   = getFamilyForType(item.item_type, typeColor ? { [item.item_type]: typeColor } : undefined);
  const isDone   = item.status === "done";
  const isCancelled = item.status === "cancelled";
  const isConfirmed = item.status === "confirmed";
  const overdue  = isOverdue(item);

  // Match main SitRep: light pastel bg for active, saturated dark for done
  const cardBg    = isDone ? family.shades[1] : family.shades[3];
  const textColor = isDone ? "#fff" : "#0f172a";
  const dimColor  = isDone ? "rgba(255,255,255,.7)" : "#475569";
  const accentCol = isDone ? family.shades[0] : family.shades[2];

  const dateLabel = fmtItemDate(item, tz);
  const badgeLabel = typeName
    ? (typeName.length > 6 ? typeName.slice(0, 4).toUpperCase() : typeName.toUpperCase())
    : (TYPE_LABEL[item.item_type] ?? item.item_type.toUpperCase());

  return (
    <SwipeableRow onComplete={onComplete} onReschedule={onReschedule}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "11px 14px",
          minHeight: 52,
          background: cardBg,
          borderBottom: "1px solid rgba(0,0,0,.06)",
          boxShadow: `inset 3px 0 0 0 ${accentCol}`,
          opacity: (completing || isCancelled) ? 0.45 : 1,
          transition: "opacity .3s",
        }}
      >
        {/* Check circle — left zone, exempt from swipe */}
        <div
          onClick={(e) => { e.stopPropagation(); onComplete(); }}
          style={{
            width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
            border: isDone ? "2px solid rgba(255,255,255,.5)" : `2px solid ${accentCol}`,
            background: isDone ? "rgba(255,255,255,.2)" : isConfirmed ? accentCol : "rgba(255,255,255,.35)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: isCancelled ? "default" : "pointer",
            boxShadow: !isDone && !isCancelled ? `0 0 0 3px ${accentCol}22` : "none",
            transition: "all .15s",
          }}
        >
          {isDone && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          )}
        </div>

        {/* Content */}
        <div onClick={onTap} style={{ flex: 1, minWidth: 0, cursor: "pointer" }}>
          {/* Top row: badges + title */}
          <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
            {/* Type badge */}
            <span style={{
              fontSize: 9, fontWeight: 800, letterSpacing: "0.08em",
              padding: "2px 6px", borderRadius: 4, flexShrink: 0,
              background: isDone ? "rgba(255,255,255,.22)" : accentCol,
              color: "#fff",
              boxShadow: isDone ? "none" : `0 1px 5px ${accentCol}55`,
            }}>
              {badgeLabel}
            </span>

            {/* Confirmed badge */}
            {isConfirmed && (
              <span style={{
                fontSize: 9, fontWeight: 800, letterSpacing: "0.06em",
                padding: "2px 6px", borderRadius: 4, flexShrink: 0,
                background: isDone ? "rgba(255,255,255,.18)" : "rgba(16,185,129,.18)",
                color: isDone ? "#fff" : "#059669",
                border: isDone ? "none" : "1px solid rgba(16,185,129,.3)",
              }}>CONFIRMED</span>
            )}

            {/* Priority badge */}
            {item.priority === "urgent" && !isDone && (
              <span style={{
                fontSize: 9, fontWeight: 800, letterSpacing: "0.06em",
                padding: "2px 6px", borderRadius: 4, flexShrink: 0,
                background: "rgba(254,226,226,.9)", color: "#991b1b",
              }}>!! URGENT</span>
            )}

            {/* Title */}
            <span style={{
              fontSize: 14, fontWeight: 600, color: textColor,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              textDecoration: isDone ? "line-through" : "none",
              opacity: isDone ? 0.72 : 1,
              flex: 1, minWidth: 0, letterSpacing: "-0.01em",
            }}>
              {item.title}
            </span>
          </div>

          {/* Date label */}
          {dateLabel && (
            <div style={{
              fontSize: 11, marginTop: 2,
              color: overdue && !isDone ? "#991b1b" : dimColor,
              fontWeight: overdue && !isDone ? 600 : 400,
            }}>
              {overdue && !isDone ? `Overdue · ${dateLabel}` : dateLabel}
            </div>
          )}
        </div>

        {/* Assignee dots */}
        <AssigneeDots assignments={item.sitrep_assignments} />
      </div>
    </SwipeableRow>
  );
}
