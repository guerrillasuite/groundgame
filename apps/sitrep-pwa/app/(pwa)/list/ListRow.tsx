"use client";

import { useState } from "react";
import { getFamilyForType } from "@/lib/sitrep-colors";
import { todayStr, localDateStr, effectiveDate, fmtItemDate } from "@/lib/date-utils";
import SwipeableRow from "./SwipeableRow";

export type SitRepItem = {
  id: string;
  tenant_id?: string;
  title: string;
  item_type: string;
  status: string;
  due_date: string | null;
  start_at?: string | null;
  end_at?: string | null;
  is_all_day?: boolean | null;
  priority: string | null;
  location?: string | null;
  visibility?: string;
  created_by?: string;
  mission_id?: string | null;
  parent_item_id?: string | null;
  sitrep_assignments?: { user_id: string; role: string }[];
};

interface ListRowProps {
  item: SitRepItem;
  typeColor?: string;
  typeName?: string;
  tz: string;
  onTap: () => void;
  onComplete: () => void;
  onReschedule: () => void;
  completing?: boolean;
  isHidden?: (key: string) => boolean;
}

export function isItemOverdue(item: SitRepItem): boolean {
  if (item.status === "done" || item.status === "cancelled") return false;
  const ed = effectiveDate(item);
  if (!ed) return false;
  const ds = ed.includes("T") ? localDateStr(ed) : ed;
  return ds < todayStr();
}

function AssigneeDots({ assignments }: { assignments?: { user_id: string }[] }) {
  const ids = (assignments ?? []).slice(0, 3);
  if (!ids.length) return null;
  return (
    <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
      {ids.map(({ user_id }) => {
        const hue =
          Math.abs(
            (user_id.charCodeAt(0) ?? 65) * 37 +
              (user_id.charCodeAt(1) ?? 0) * 17,
          ) % 360;
        return (
          <span
            key={user_id}
            style={{
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: `hsl(${hue},45%,28%)`,
              border: `1.5px solid hsl(${hue},55%,44%)`,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 7,
              fontWeight: 800,
              color: "#fff",
              flexShrink: 0,
            }}
          >
            {user_id.slice(0, 1).toUpperCase()}
          </span>
        );
      })}
    </div>
  );
}

export default function ListRow({
  item,
  typeColor,
  typeName,
  tz,
  onTap,
  onComplete,
  onReschedule,
  completing = false,
  isHidden,
}: ListRowProps) {
  const [hovered, setHovered] = useState(false);

  const family = getFamilyForType(
    item.item_type,
    typeColor ? { [item.item_type]: typeColor } : undefined,
  );
  const isDone      = item.status === "done";
  const isCancelled = item.status === "cancelled";
  const isConfirmed = item.status === "confirmed";
  const overdue     = isItemOverdue(item);

  const cardBg    = isDone ? family.shades[1] : family.shades[3];
  const textColor = isDone ? "#fff" : "#0f172a";
  const dimColor  = isDone ? "rgba(255,255,255,.7)" : "#475569";
  const accent    = isDone ? family.shades[0] : family.shades[2];

  const dateLabel  = fmtItemDate(item, tz);
  const badgeLabel = typeName
    ? typeName.length > 6
      ? typeName.slice(0, 4).toUpperCase()
      : typeName.toUpperCase()
    : item.item_type.slice(0, 4).toUpperCase();

  const restShadow  = `inset 3px 0 0 0 ${accent}`;
  const hoverShadow = `inset 3px 0 0 0 ${accent}, 0 6px 20px rgba(0,0,0,.3), 0 0 0 1px ${accent}44`;

  return (
    <SwipeableRow onComplete={onComplete} onReschedule={onReschedule} borderRadius={10}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={onTap}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "11px 14px",
          minHeight: 52,
          background: cardBg,
          borderRadius: 10,
          border: isDone
            ? `1px solid ${family.shades[0]}`
            : `1px solid color-mix(in srgb, var(--gg-primary,#2563eb) 40%, ${accent})`,
          boxShadow: hovered && !isCancelled ? hoverShadow : restShadow,
          transform: hovered && !isCancelled ? "translateY(-1px)" : "",
          opacity: completing || isCancelled ? 0.45 : 1,
          transition: "transform .15s ease, box-shadow .15s ease",
          cursor: "pointer",
        }}
      >
        {/* Check circle */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            onComplete();
          }}
          style={{
            width: 24,
            height: 24,
            borderRadius: "50%",
            flexShrink: 0,
            border: isDone
              ? "2px solid rgba(255,255,255,.6)"
              : isCancelled
                ? "2px solid rgba(0,0,0,.14)"
                : `2px solid ${accent}`,
            background: isDone
              ? "rgba(255,255,255,.24)"
              : isConfirmed
                ? accent
                : "transparent",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: isCancelled ? "default" : "pointer",
            fontSize: 11,
            fontWeight: 800,
            color: "#fff",
            boxShadow:
              !isDone && !isCancelled ? `0 0 0 3px ${accent}22` : "none",
            transition: "all .15s ease",
          }}
        >
          {isDone && (
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#fff"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Top row: badges + title */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              flexWrap: "wrap",
            }}
          >
            {/* Type badge */}
            {(!isHidden || !isHidden("calendar_badge")) && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: "0.09em",
                padding: "2px 7px",
                borderRadius: 5,
                flexShrink: 0,
                background: isDone ? "rgba(255,255,255,.22)" : family.shades[1],
                color: "#fff",
                boxShadow: isDone ? "none" : `0 1px 6px ${family.shades[1]}55`,
              }}
            >
              {badgeLabel}
            </span>
            )}

            {/* Confirmed badge */}
            {isConfirmed && !isDone && (
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: "0.07em",
                  padding: "2px 6px",
                  borderRadius: 4,
                  flexShrink: 0,
                  background: "rgba(16,185,129,.18)",
                  color: "#059669",
                  border: "1px solid rgba(16,185,129,.3)",
                }}
              >
                CONFIRMED
              </span>
            )}

            {/* Urgent badge */}
            {item.priority === "urgent" && !isDone && (
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: "0.06em",
                  padding: "2px 6px",
                  borderRadius: 4,
                  flexShrink: 0,
                  background: "rgba(254,226,226,.92)",
                  color: "#991b1b",
                  boxShadow: "0 0 8px rgba(239,68,68,.3)",
                }}
              >
                !! URGENT
              </span>
            )}

            {/* High badge */}
            {item.priority === "high" && !isDone && (
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: "0.06em",
                  padding: "2px 6px",
                  borderRadius: 4,
                  flexShrink: 0,
                  background: "rgba(254,243,199,.92)",
                  color: "#78350f",
                  boxShadow: "0 0 8px rgba(245,158,11,.25)",
                }}
              >
                HIGH
              </span>
            )}

            {/* Title */}
            <span
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: textColor,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flex: 1,
                minWidth: 0,
                letterSpacing: "-0.01em",
                textDecoration: isDone ? "line-through" : "none",
                opacity: isDone ? 0.72 : 1,
              }}
            >
              {item.title}
            </span>
          </div>

          {/* Date label */}
          {dateLabel && (
            <div
              style={{
                fontSize: 11,
                marginTop: 2,
                color:
                  overdue && !isDone ? "#991b1b" : dimColor,
                fontWeight: overdue && !isDone ? 700 : 400,
              }}
            >
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
