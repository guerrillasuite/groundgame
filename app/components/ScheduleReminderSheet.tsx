"use client";

import { useState, useTransition } from "react";

type Props = {
  defaultType: string;
  defaultTitle?: string;
  personId?: string | null;
  householdId?: string | null;
  locationId?: string | null;
  walklistItemId?: string | null;
  onSaved?: () => void;
  onDismiss: () => void;
};

export default function ScheduleReminderSheet({
  defaultType,
  defaultTitle = "",
  personId,
  householdId,
  locationId,
  walklistItemId,
  onSaved,
  onDismiss,
}: Props) {
  const [pending, start] = useTransition();
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("09:00");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function submit() {
    if (!dueDate) { setErr("Pick a date"); return; }
    start(async () => {
      try {
        const due = new Date(`${dueDate}T${dueTime || "09:00"}:00`).toISOString();
        const res = await fetch("/api/crm/reminders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: defaultType,
            title: defaultTitle || (defaultType === "callback" ? "Call Back" : "Return Visit"),
            notes: notes.trim() || null,
            due_at: due,
            person_id:        personId ?? null,
            household_id:     householdId ?? null,
            walklist_item_id: walklistItemId ?? null,
          }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error ?? "Failed");
        }
        setSaved(true);
        onSaved?.();
      } catch (e: any) {
        setErr(e?.message ?? "Failed to save");
      }
    });
  }

  const sheetStyle: React.CSSProperties = {
    position: "fixed", bottom: 0, left: 0, right: 0,
    background: "var(--card-bg, #111827)",
    borderTop: "1px solid rgba(255,255,255,.12)",
    borderRadius: "20px 20px 0 0",
    padding: "20px 20px 32px",
    zIndex: 9999,
    display: "flex", flexDirection: "column", gap: 14,
    boxShadow: "0 -8px 32px rgba(0,0,0,.5)",
  };

  const labelStyle: React.CSSProperties = {
    display: "flex", flexDirection: "column", gap: 4, fontSize: 13,
  };
  const dimStyle: React.CSSProperties = { opacity: 0.55 };

  if (saved) {
    return (
      <div style={sheetStyle}>
        <div style={{ textAlign: "center", fontSize: 15, fontWeight: 600, padding: "8px 0" }}>
          Reminder set ✓
        </div>
        <button className="btn" style={{ width: "100%" }} onClick={onDismiss}>
          Done
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 9998 }}
        onClick={onDismiss}
      />
      <div style={sheetStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>
            {defaultType === "callback" ? "Schedule Call Back" : "Schedule Return Visit"}
          </span>
          <button
            style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 18, opacity: 0.5 }}
            onClick={onDismiss}
          >
            ✕
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <label style={labelStyle}>
            <span style={dimStyle}>Date *</span>
            <input
              type="date"
              className="notes"
              style={{ minHeight: "unset", padding: "8px 10px" }}
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              autoFocus
            />
          </label>
          <label style={labelStyle}>
            <span style={dimStyle}>Time</span>
            <input
              type="time"
              className="notes"
              style={{ minHeight: "unset", padding: "8px 10px" }}
              value={dueTime}
              onChange={(e) => setDueTime(e.target.value)}
            />
          </label>
        </div>

        <label style={labelStyle}>
          <span style={dimStyle}>Notes</span>
          <textarea
            className="notes"
            rows={2}
            style={{ minHeight: "unset" }}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Gate code, preferences, context…"
          />
        </label>

        {err && <p style={{ color: "#f87171", fontSize: 13, margin: 0 }}>{err}</p>}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button className="btn" onClick={onDismiss} disabled={pending}>
            Skip
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={pending}>
            {pending ? "Saving…" : "Schedule"}
          </button>
        </div>
      </div>
    </>
  );
}
