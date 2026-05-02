"use client";

import { useState, useEffect } from "react";
import BottomSheet from "./BottomSheet";
import type { SitRepItem } from "@/app/(pwa)/list/ListRow";

const S = {
  text: "rgb(236 240 245)",
  dim:  "rgb(100 116 139)",
} as const;

interface RescheduleSheetProps {
  open: boolean;
  item: SitRepItem | null;
  onClose: () => void;
  onRescheduled: (id: string, newDate: string) => void;
}

export default function RescheduleSheet({ open, item, onClose, onRescheduled }: RescheduleSheetProps) {
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && item?.due_date) {
      setDate(item.due_date.slice(0, 16));
    } else if (open) {
      const now = new Date();
      now.setMinutes(0, 0, 0);
      now.setHours(now.getHours() + 1);
      setDate(now.toISOString().slice(0, 16));
    }
  }, [open, item]);

  async function handleSave() {
    if (!item || !date) return;
    setSaving(true);
    await onRescheduled(item.id, date);
    setSaving(false);
  }

  return (
    <BottomSheet open={open} onClose={onClose} maxHeight="40vh">
      <div style={{ padding: "8px 16px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: S.dim, paddingBottom: 2 }}>
          Reschedule
        </div>
        {item && (
          <div style={{ fontSize: 15, fontWeight: 600, color: S.text, lineHeight: 1.4 }}>
            {item.title}
          </div>
        )}

        <input
          type="datetime-local"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={{
            width: "100%",
            padding: "11px 14px",
            borderRadius: 9,
            background: "rgba(255,255,255,.05)",
            border: "1px solid rgba(255,255,255,.1)",
            color: S.text,
            fontSize: 15,
            outline: "none",
            colorScheme: "dark",
          }}
        />

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: "11px 0", borderRadius: 9,
              border: "1px solid rgba(255,255,255,.1)",
              background: "rgba(255,255,255,.04)",
              color: S.dim, fontSize: 14, fontWeight: 600, cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !date}
            style={{
              flex: 2, padding: "11px 0", borderRadius: 9, border: "none",
              background: "linear-gradient(135deg, var(--gg-primary, #2563eb) 0%, color-mix(in srgb, var(--gg-primary, #2563eb) 70%, #7c3aed) 100%)",
              color: "#fff", fontSize: 14, fontWeight: 600,
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "Saving…" : "Reschedule"}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
