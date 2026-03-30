"use client";

import { useCallback, useEffect, useState } from "react";
import ReminderModal from "./ReminderModal";
import type { Reminder } from "@/lib/types/reminder";

const STATUS_COLORS: Record<string, string> = {
  pending:   "#facc15",
  sent:      "#4ade80",
  cancelled: "#6b7280",
};

const TYPE_LABELS: Record<string, string> = {
  callback:              "Call Back",
  return_visit:          "Return Visit",
  opportunity_follow_up: "Follow-up",
  opportunity_stale:     "Stale Alert",
  custom:                "Reminder",
};

type Props = {
  personId?: string;
  householdId?: string;
  opportunityId?: string;
};

export default function RemindersSection({ personId, householdId, opportunityId }: Props) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const params = new URLSearchParams();
  if (personId)       params.set("person_id", personId);
  if (householdId)    params.set("household_id", householdId);
  if (opportunityId)  params.set("opportunity_id", opportunityId);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/crm/reminders?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => setReminders(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [params.toString()]);

  useEffect(() => { load(); }, [load]);

  async function cancel(id: string) {
    await fetch(`/api/crm/reminders/${id}`, { method: "DELETE" });
    load();
  }

  async function markDone(id: string) {
    await fetch(`/api/crm/reminders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "sent" }),
    });
    load();
  }

  const linked = { personId, householdId, opportunityId };

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, opacity: 0.85 }}>Reminders</h4>
        <button
          className="btn btn-sm"
          style={{ fontSize: 12 }}
          onClick={() => setModalOpen(true)}
        >
          + Add Reminder
        </button>
      </div>

      {loading && <p style={{ fontSize: 13, opacity: 0.5 }}>Loading…</p>}

      {!loading && reminders.length === 0 && (
        <p style={{ fontSize: 13, opacity: 0.4, margin: 0 }}>No reminders.</p>
      )}

      {reminders.map((r) => (
        <div
          key={r.id}
          style={{
            background: "var(--gg-card, #10131b)",
            border: "1px solid var(--gg-border, #22283a)",
            borderRadius: 8, padding: "10px 12px",
            marginBottom: 8, fontSize: 13,
            display: "flex", alignItems: "flex-start", gap: 10,
          }}
        >
          <div style={{
            width: 8, height: 8, borderRadius: "50%", flexShrink: 0, marginTop: 4,
            background: STATUS_COLORS[r.status] ?? "#6b7280",
          }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 500, marginBottom: 2 }}>{r.title}</div>
            <div style={{ opacity: 0.55, fontSize: 12 }}>
              {TYPE_LABELS[r.type] ?? r.type}
              {" · "}
              {new Date(r.due_at).toLocaleDateString("en-US", {
                month: "short", day: "numeric", year: "numeric",
                hour: "numeric", minute: "2-digit",
              })}
            </div>
            {r.notes && (
              <div style={{ opacity: 0.65, fontSize: 12, marginTop: 3, whiteSpace: "pre-wrap" }}>
                {r.notes}
              </div>
            )}
          </div>
          {r.status === "pending" && (
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <button
                className="btn btn-sm"
                style={{ fontSize: 11, padding: "2px 8px" }}
                onClick={() => markDone(r.id)}
                title="Mark done"
              >
                ✓
              </button>
              <button
                className="btn btn-sm"
                style={{ fontSize: 11, padding: "2px 8px", opacity: 0.6 }}
                onClick={() => cancel(r.id)}
                title="Cancel"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      ))}

      {modalOpen && (
        <ReminderModal
          linked={linked}
          onSaved={load}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}
