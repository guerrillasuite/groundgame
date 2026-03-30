"use client";

import { useCallback, useEffect, useState } from "react";
import ReminderModal from "@/app/components/crm/ReminderModal";
import type { Reminder } from "@/lib/types/reminder";

const STATUS_OPTIONS = [
  { value: "",          label: "All" },
  { value: "pending",   label: "Pending" },
  { value: "sent",      label: "Sent" },
  { value: "cancelled", label: "Cancelled" },
];

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

export default function RemindersPage() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [myOnly, setMyOnly] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (myOnly) params.set("assigned_to_me", "true");
    fetch(`/api/crm/reminders?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => setReminders(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [statusFilter, myOnly]);

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

  const sectionStyle: React.CSSProperties = {
    padding: "24px 28px",
    maxWidth: 900,
  };

  const rowStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 130px 180px 110px 80px",
    alignItems: "center",
    gap: 12,
    padding: "10px 14px",
    fontSize: 13,
    borderBottom: "1px solid rgba(255,255,255,.05)",
  };

  return (
    <section style={sectionStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Reminders</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setModalOpen(true)}>
          + New Reminder
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 4 }}>
          {STATUS_OPTIONS.map((o) => (
            <button
              key={o.value}
              className="btn btn-sm"
              style={{
                fontWeight: statusFilter === o.value ? 700 : 400,
                background: statusFilter === o.value ? "var(--gg-primary, #2563eb)" : undefined,
              }}
              onClick={() => setStatusFilter(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={myOnly}
            onChange={(e) => setMyOnly(e.target.checked)}
          />
          Assigned to me
        </label>
      </div>

      {/* Table header */}
      <div style={{ ...rowStyle, opacity: 0.45, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        <span>Title / Type</span>
        <span>Status</span>
        <span>Due</span>
        <span>Linked To</span>
        <span />
      </div>

      {loading && (
        <p style={{ padding: "16px 14px", opacity: 0.5, fontSize: 13 }}>Loading…</p>
      )}

      {!loading && reminders.length === 0 && (
        <p style={{ padding: "16px 14px", opacity: 0.4, fontSize: 13 }}>No reminders found.</p>
      )}

      {reminders.map((r) => (
        <div key={r.id} style={rowStyle}>
          {/* Title + type */}
          <div>
            <div style={{ fontWeight: 500 }}>{r.title}</div>
            <div style={{ fontSize: 11, opacity: 0.5, marginTop: 2 }}>
              {TYPE_LABELS[r.type] ?? r.type}
            </div>
          </div>

          {/* Status */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{
              width: 7, height: 7, borderRadius: "50%",
              background: STATUS_COLORS[r.status] ?? "#6b7280",
              flexShrink: 0,
            }} />
            <span style={{ textTransform: "capitalize" }}>{r.status}</span>
          </div>

          {/* Due date */}
          <span>
            {new Date(r.due_at).toLocaleDateString("en-US", {
              month: "short", day: "numeric", year: "numeric",
              hour: "numeric", minute: "2-digit",
            })}
          </span>

          {/* Linked record */}
          <span style={{ opacity: 0.5, fontSize: 12 }}>
            {r.opportunity_id ? (
              <a href={`/crm/opportunities/${r.opportunity_id}`} style={{ color: "inherit", textDecoration: "underline" }}>
                Opportunity
              </a>
            ) : r.person_id ? (
              <a href={`/crm/people/${r.person_id}`} style={{ color: "inherit", textDecoration: "underline" }}>
                Person
              </a>
            ) : r.household_id ? (
              <a href={`/crm/households/${r.household_id}`} style={{ color: "inherit", textDecoration: "underline" }}>
                Household
              </a>
            ) : "—"}
          </span>

          {/* Actions */}
          <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
            {r.status === "pending" && (
              <>
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
              </>
            )}
          </div>
        </div>
      ))}

      {modalOpen && (
        <ReminderModal
          onSaved={load}
          onClose={() => setModalOpen(false)}
        />
      )}
    </section>
  );
}
