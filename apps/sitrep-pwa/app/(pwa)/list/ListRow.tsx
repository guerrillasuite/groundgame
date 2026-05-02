"use client";

import { getFamilyByKey } from "@/lib/sitrep-colors";
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
}

function isOverdue(item: SitRepItem): boolean {
  if (item.status === "done" || item.status === "cancelled") return false;
  const ed = effectiveDate(item);
  if (!ed) return false;
  const ds = ed.includes("T") ? localDateStr(ed) : ed;
  return ds < todayStr();
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
}: ListRowProps) {
  const family = getFamilyByKey(typeColor ?? "blue");
  const accent = family?.shades[2] ?? "#3b82f6";
  const badgeBg = `${family?.shades[3] ?? "#93c5fd"}33`;

  const overdue = isOverdue(item);
  const dateLabel = fmtItemDate(item, tz);

  const priorityLabel =
    item.priority === "urgent" ? "!!" :
    item.priority === "high"   ? "!"  : null;

  return (
    <SwipeableRow onComplete={onComplete} onReschedule={onReschedule}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          padding: "12px 16px",
          minHeight: 56,
          background: "rgb(14 18 28)",
          borderBottom: "1px solid rgba(255,255,255,.05)",
          boxShadow: `inset 3px 0 0 0 ${accent}`,
          opacity: completing ? 0.4 : 1,
          transition: "opacity .3s",
        }}
      >
        {/* Left 30% — circle check tap target, exempt from swipe */}
        <div
          onClick={(e) => { e.stopPropagation(); onComplete(); }}
          style={{
            width: "30%",
            display: "flex",
            alignItems: "center",
            paddingTop: 2,
            minHeight: 44,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <div style={{
            width: 26,
            height: 26,
            borderRadius: "50%",
            border: `2px solid ${accent}`,
            background: item.status === "done" ? accent : "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            transition: "background .15s",
          }}>
            {item.status === "done" && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            )}
          </div>
        </div>

        {/* Main content */}
        <div
          onClick={onTap}
          style={{ flex: 1, cursor: "pointer", minWidth: 0 }}
        >
          <div style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 8,
          }}>
            <span style={{
              fontSize: 14,
              fontWeight: 500,
              color: item.status === "done" ? "rgb(100 116 139)" : "rgb(236 240 245)",
              textDecoration: item.status === "done" ? "line-through" : "none",
              lineHeight: 1.4,
              flex: 1,
              wordBreak: "break-word",
            }}>
              {item.title}
            </span>

            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              {typeName && (
                <span style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: "2px 7px",
                  borderRadius: 10,
                  background: badgeBg,
                  color: accent,
                  letterSpacing: "0.04em",
                }}>
                  {typeName}
                </span>
              )}
              {priorityLabel && (
                <span style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: item.priority === "urgent" ? "#ef4444" : "#f59e0b",
                }}>
                  {priorityLabel}
                </span>
              )}
            </div>
          </div>

          {dateLabel && (
            <div style={{
              fontSize: 12,
              color: overdue ? "#ef4444" : "rgb(100 116 139)",
              marginTop: 3,
            }}>
              {overdue ? "Overdue" : dateLabel}
            </div>
          )}
        </div>
      </div>
    </SwipeableRow>
  );
}
