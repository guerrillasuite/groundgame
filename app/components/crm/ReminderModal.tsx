"use client";

import { useEffect, useState, useTransition } from "react";

type User = { id: string; name: string; email: string };

const TYPE_OPTIONS = [
  { value: "custom",                label: "General Reminder" },
  { value: "callback",              label: "Call Back" },
  { value: "return_visit",          label: "Return Visit" },
  { value: "opportunity_follow_up", label: "Opportunity Follow-up" },
];

const TYPE_TITLES: Record<string, string> = {
  callback:              "Call Back",
  return_visit:          "Return Visit",
  opportunity_follow_up: "Follow Up on Opportunity",
  custom:                "",
};

type LinkedRecord = {
  personId?: string;
  householdId?: string;
  opportunityId?: string;
  stopId?: string;
  walklistItemId?: string;
};

type Props = {
  linked?: LinkedRecord;
  defaultType?: string;
  onSaved: () => void;
  onClose: () => void;
};

export default function ReminderModal({ linked, defaultType = "custom", onSaved, onClose }: Props) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);

  const [type, setType] = useState(defaultType);
  const [title, setTitle] = useState(TYPE_TITLES[defaultType] ?? "");
  const [dueAt, setDueAt] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [notes, setNotes] = useState("");

  // Sync default title when type changes
  useEffect(() => {
    const auto = TYPE_TITLES[type];
    if (auto !== undefined) setTitle(auto);
  }, [type]);

  useEffect(() => {
    fetch("/api/crm/users")
      .then((r) => r.json())
      .then((d) => setUsers(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  function submit() {
    if (!title.trim()) { setErr("Title is required"); return; }
    if (!dueAt) { setErr("Due date/time is required"); return; }
    start(async () => {
      try {
        const res = await fetch("/api/crm/reminders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type,
            title: title.trim(),
            notes: notes.trim() || null,
            due_at: new Date(dueAt).toISOString(),
            assigned_to_user_id: assignedTo || null,
            person_id:        linked?.personId ?? null,
            household_id:     linked?.householdId ?? null,
            opportunity_id:   linked?.opportunityId ?? null,
            stop_id:          linked?.stopId ?? null,
            walklist_item_id: linked?.walklistItemId ?? null,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to save reminder");
        onSaved();
        onClose();
      } catch (e: any) {
        setErr(e?.message ?? "Failed to save reminder");
      }
    });
  }

  const label: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4, fontSize: 13 };
  const dim: React.CSSProperties = { opacity: 0.6 };

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.75)",
        zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "var(--gg-card, #10131b)",
        border: "1px solid var(--gg-border, #22283a)",
        borderRadius: 10, padding: 24, width: "100%", maxWidth: 420,
        display: "flex", flexDirection: "column", gap: 14,
      }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Set Reminder</h3>

        <label style={label}>
          <span style={dim}>Type</span>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>

        <label style={label}>
          <span style={dim}>Title *</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs to happen?"
            autoFocus
          />
        </label>

        <label style={label}>
          <span style={dim}>Due Date & Time *</span>
          <input
            type="datetime-local"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
          />
        </label>

        <label style={label}>
          <span style={dim}>Assign To</span>
          <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
            <option value="">— myself —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name || u.email}
              </option>
            ))}
          </select>
        </label>

        <label style={label}>
          <span style={dim}>Notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Optional details…"
            style={{ resize: "vertical" }}
          />
        </label>

        {err && <p style={{ color: "#f87171", fontSize: 13, margin: 0 }}>{err}</p>}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={onClose} disabled={pending}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={pending}>
            {pending ? "Saving…" : "Save Reminder"}
          </button>
        </div>
      </div>
    </div>
  );
}
