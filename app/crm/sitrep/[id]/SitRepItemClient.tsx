"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// ── Types ──────────────────────────────────────────────────────────────────────

type Assignment = { user_id: string; role: string };
type SitRepLink = { id: string; record_type: string; record_id: string; display_label: string | null };

type FullItem = {
  id: string;
  item_type: "task" | "event" | "meeting";
  title: string;
  description: string | null;
  status: string | null;
  priority: string | null;
  due_date: string | null;
  start_at: string | null;
  end_at: string | null;
  is_all_day: boolean | null;
  agenda: string | null;
  meeting_notes: string | null;
  mission_id: string | null;
  visibility: string;
  created_by: string;
  created_at: string;
  updated_at: string | null;
  sitrep_assignments: Assignment[];
  sitrep_links: SitRepLink[];
};

type Mission = { id: string; title: string; status: string };
type User   = { id: string; name: string; email: string };

type Props = {
  item: FullItem;
  missions: Mission[];
  users: User[];
  currentUserId: string;
};

type SaveState = "idle" | "saving" | "saved" | "error";

// ── Helpers ────────────────────────────────────────────────────────────────────

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 16);
}

function fmtCreated(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function userInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  return (parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : name.slice(0, 2)).toUpperCase();
}

function userHue(name: string) {
  return Math.abs([...name].reduce((acc, c) => acc + c.charCodeAt(0) * 31, 0)) % 360;
}

// ── Status config ──────────────────────────────────────────────────────────────

const TASK_STATUSES = [
  { key: "open",        label: "Open",        icon: "○", color: "rgba(255,255,255,.15)", activeColor: "rgba(255,255,255,.12)", textColor: "rgb(238 242 246)" },
  { key: "in_progress", label: "In Progress", icon: "▶", color: "rgba(59,130,246,.2)",   activeColor: "rgba(59,130,246,.35)", textColor: "#93c5fd" },
  { key: "done",        label: "Done",        icon: "✓", color: "rgba(22,163,74,.2)",    activeColor: "rgba(22,163,74,.35)",  textColor: "#86efac" },
  { key: "cancelled",   label: "Cancelled",   icon: "✕", color: "rgba(107,114,128,.15)", activeColor: "rgba(107,114,128,.3)", textColor: "rgb(134 150 168)" },
];

const PRIORITIES = [
  { key: "low",    label: "Low",    color: "rgba(255,255,255,.1)", textColor: "rgb(134 150 168)" },
  { key: "normal", label: "Normal", color: "rgba(255,255,255,.1)", textColor: "rgb(238 242 246)" },
  { key: "high",   label: "High",   color: "rgba(245,158,11,.18)", textColor: "#fcd34d" },
  { key: "urgent", label: "Urgent", color: "rgba(220,38,38,.18)",  textColor: "#fca5a5" },
];

const VISIBILITIES = [
  { key: "private",       label: "Private (only me)" },
  { key: "assignee_only", label: "Assignees only" },
  { key: "team",          label: "Team (all CRM users)" },
];

const TYPE_LABELS: Record<string, string> = { task: "TASK", event: "EVENT", meeting: "MEETING" };
const TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  task:    { bg: "rgba(59,130,246,.18)",  color: "#93c5fd" },
  event:   { bg: "rgba(139,92,246,.18)",  color: "#c4b5fd" },
  meeting: { bg: "rgba(16,185,129,.18)",  color: "#6ee7b7" },
};

const LINK_TYPE_LABELS: Record<string, string> = {
  person: "Person", household: "Household", opportunity: "Opportunity",
  stop: "Stop", company: "Company", location: "Location",
};

// ── Component ──────────────────────────────────────────────────────────────────

export default function SitRepItemClient({ item, missions, users, currentUserId }: Props) {
  const router = useRouter();

  // Editable field state
  const [title,       setTitle]       = useState(item.title);
  const [desc,        setDesc]        = useState(item.description ?? "");
  const [status,      setStatus]      = useState(item.status ?? "open");
  const [priority,    setPriority]    = useState(item.priority ?? "normal");
  const [dueDate,     setDueDate]     = useState(item.due_date ?? "");
  const [startAt,     setStartAt]     = useState(toDatetimeLocal(item.start_at));
  const [endAt,       setEndAt]       = useState(toDatetimeLocal(item.end_at));
  const [isAllDay,    setIsAllDay]    = useState(item.is_all_day ?? false);
  const [agenda,      setAgenda]      = useState(item.agenda ?? "");
  const [meetingNotes,setMeetingNotes]= useState(item.meeting_notes ?? "");
  const [missionId,   setMissionId]   = useState(item.mission_id ?? "");
  const [visibility,  setVisibility]  = useState(item.visibility);
  const [assignments, setAssignments] = useState<Assignment[]>(item.sitrep_assignments ?? []);
  const [saveState,   setSaveState]   = useState<SaveState>("idle");
  const [showAddUser, setShowAddUser] = useState(false);
  const [deleting,    setDeleting]    = useState(false);
  const [confirmDel,  setConfirmDel]  = useState(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addUserRef = useRef<HTMLDivElement>(null);

  // Close add-user dropdown on outside click
  useEffect(() => {
    if (!showAddUser) return;
    const handler = (e: MouseEvent) => {
      if (!addUserRef.current?.contains(e.target as Node)) setShowAddUser(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showAddUser]);

  // ── Save helpers ─────────────────────────────────────────────────────────────

  async function patchNow(fields: Record<string, unknown>) {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    setSaveState("saving");
    try {
      const res = await fetch(`/api/crm/sitrep/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      setSaveState(res.ok ? "saved" : "error");
    } catch {
      setSaveState("error");
    }
    saveTimer.current = setTimeout(() => setSaveState("idle"), 2500);
  }

  function patchDebounced(fields: Record<string, unknown>) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState("idle");
    saveTimer.current = setTimeout(() => patchNow(fields), 700);
  }

  async function handleAddAssignee(userId: string) {
    const role = item.item_type === "task" ? "assignee" : item.item_type === "event" ? "attendee" : "participant";
    setAssignments((prev) => [...prev, { user_id: userId, role }]);
    setShowAddUser(false);
    await patchNow({ add_assignee_ids: [userId], assignment_role: role });
  }

  async function handleRemoveAssignee(userId: string) {
    setAssignments((prev) => prev.filter((a) => a.user_id !== userId));
    await patchNow({ remove_assignee_ids: [userId] });
  }

  async function handleDelete() {
    setDeleting(true);
    const res = await fetch(`/api/crm/sitrep/items/${item.id}`, { method: "DELETE" });
    if (res.ok) router.push("/crm/sitrep");
    else setDeleting(false);
  }

  // ── Layout constants ──────────────────────────────────────────────────────────

  const S = {
    surface: "rgb(18 23 33)",
    card:    "rgb(28 36 48)",
    border:  "rgb(43 53 67)",
    text:    "rgb(238 242 246)",
    dim:     "rgb(134 150 168)",
  } as const;

  const typeColor  = TYPE_COLORS[item.item_type] ?? TYPE_COLORS.task;
  const isCreator  = item.created_by === currentUserId;

  const assignedIds = new Set(assignments.map((a) => a.user_id));
  const userMap     = new Map(users.map((u) => [u.id, u]));
  const unassigned  = users.filter((u) => !assignedIds.has(u.id));

  const mission = missionId ? missions.find((m) => m.id === missionId) : null;

  return (
    <div style={{ maxWidth: 700, margin: "0 auto" }} className="stack">

      {/* ── Top nav ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <Link
          href="/crm/sitrep"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, color: S.dim, fontSize: 13, fontWeight: 500 }}
        >
          <span style={{ fontSize: 16 }}>←</span> SitRep
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {saveState === "saving" && (
            <span style={{ fontSize: 11, color: S.dim }}>Saving…</span>
          )}
          {saveState === "saved" && (
            <span style={{ fontSize: 11, color: "rgb(22 163 74)", fontWeight: 600 }}>✓ Saved</span>
          )}
          {saveState === "error" && (
            <span style={{ fontSize: 11, color: "rgb(220 38 38)", fontWeight: 600 }}>✕ Error</span>
          )}
        </div>
      </div>

      {/* ── Header: type badge + item type indicator ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{
          fontSize: 10, fontWeight: 800, letterSpacing: "0.1em",
          padding: "3px 8px", borderRadius: 5,
          background: typeColor.bg, color: typeColor.color,
        }}>
          {TYPE_LABELS[item.item_type]}
        </span>
        {item.item_type === "task" && (
          <span style={{
            fontSize: 11, fontWeight: 600, color: S.dim,
            display: "flex", alignItems: "center", gap: 4,
          }}>
            {fmtCreated(item.created_at)}
          </span>
        )}
      </div>

      {/* ── Editable title ── */}
      <input
        type="text"
        value={title}
        onChange={(e) => { setTitle(e.target.value); patchDebounced({ title: e.target.value }); }}
        placeholder="Untitled"
        style={{
          width: "100%", background: "transparent", border: "none",
          outline: "none", color: S.text, fontSize: 26, fontWeight: 700,
          letterSpacing: "-0.01em", padding: 0, lineHeight: 1.25,
        }}
      />

      {/* ── Status row (tasks) ── */}
      {item.item_type === "task" && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: S.dim, textTransform: "uppercase", marginBottom: 8 }}>
            Status
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {TASK_STATUSES.map((s) => {
              const active = status === s.key;
              return (
                <button
                  key={s.key}
                  onClick={() => { setStatus(s.key); patchNow({ status: s.key }); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "7px 14px", borderRadius: 20, fontSize: 13, fontWeight: 600,
                    border: active ? `1px solid ${s.textColor}55` : `1px solid ${S.border}`,
                    background: active ? s.activeColor : "rgba(255,255,255,.03)",
                    color: active ? s.textColor : S.dim,
                    cursor: "pointer", transition: "all .1s ease",
                  }}
                >
                  <span style={{ fontSize: 11 }}>{s.icon}</span> {s.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Priority row (tasks) ── */}
      {item.item_type === "task" && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: S.dim, textTransform: "uppercase", marginBottom: 8 }}>
            Priority
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {PRIORITIES.map((p) => {
              const active = priority === p.key;
              return (
                <button
                  key={p.key}
                  onClick={() => { setPriority(p.key); patchNow({ priority: p.key }); }}
                  style={{
                    padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                    border: active ? `1px solid ${p.textColor}55` : `1px solid ${S.border}`,
                    background: active ? p.color : "rgba(255,255,255,.03)",
                    color: active ? p.textColor : S.dim,
                    cursor: "pointer", transition: "all .1s ease",
                  }}
                >
                  {active && <span style={{ marginRight: 4 }}>●</span>}{p.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Meta card ── */}
      <div style={{
        background: S.card, border: `1px solid ${S.border}`,
        borderRadius: 12, padding: "16px 18px",
        display: "grid", gap: 14,
      }}>

        {/* Due date (tasks) */}
        {item.item_type === "task" && (
          <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: S.dim }}>Due Date</span>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => { setDueDate(e.target.value); patchNow({ due_date: e.target.value || null }); }}
              style={{
                background: "rgba(255,255,255,.06)", border: `1px solid ${S.border}`,
                borderRadius: 7, padding: "5px 10px", color: S.text, fontSize: 13,
                width: "fit-content",
              }}
            />
          </div>
        )}

        {/* Start / End (events & meetings) */}
        {item.item_type !== "task" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: S.dim }}>Start</span>
              <input
                type={isAllDay ? "date" : "datetime-local"}
                value={isAllDay ? startAt.split("T")[0] : startAt}
                onChange={(e) => { setStartAt(e.target.value); patchNow({ start_at: e.target.value || null }); }}
                style={{ background: "rgba(255,255,255,.06)", border: `1px solid ${S.border}`, borderRadius: 7, padding: "5px 10px", color: S.text, fontSize: 12, width: "fit-content" }}
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: S.dim }}>End</span>
              <input
                type={isAllDay ? "date" : "datetime-local"}
                value={isAllDay ? endAt.split("T")[0] : endAt}
                onChange={(e) => { setEndAt(e.target.value); patchNow({ end_at: e.target.value || null }); }}
                style={{ background: "rgba(255,255,255,.06)", border: `1px solid ${S.border}`, borderRadius: 7, padding: "5px 10px", color: S.text, fontSize: 12, width: "fit-content" }}
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: S.dim }}>All Day</span>
              <input
                type="checkbox"
                checked={isAllDay}
                onChange={(e) => { setIsAllDay(e.target.checked); patchNow({ is_all_day: e.target.checked }); }}
                style={{ width: 16, height: 16, accentColor: "var(--gg-primary, #2563eb)", cursor: "pointer" }}
              />
            </div>
          </>
        )}

        {/* Mission */}
        <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: S.dim }}>Mission</span>
          <select
            value={missionId}
            onChange={(e) => { setMissionId(e.target.value); patchNow({ mission_id: e.target.value || null }); }}
            style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 7, padding: "5px 10px", color: S.text, fontSize: 13, width: "fit-content", maxWidth: "100%" }}
          >
            <option value="">— None —</option>
            {missions.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
          </select>
        </div>

        {/* Visibility */}
        <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: S.dim }}>Visibility</span>
          <select
            value={visibility}
            onChange={(e) => { setVisibility(e.target.value); patchNow({ visibility: e.target.value }); }}
            style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 7, padding: "5px 10px", color: S.text, fontSize: 13, width: "fit-content", maxWidth: "100%" }}
          >
            {VISIBILITIES.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
          </select>
        </div>

        {/* Created */}
        <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: S.dim }}>Created</span>
          <span style={{ fontSize: 12, color: S.dim }}>{fmtCreated(item.created_at)}</span>
        </div>
      </div>

      {/* ── Description ── */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: S.dim, textTransform: "uppercase", marginBottom: 8 }}>
          Description
        </div>
        <textarea
          value={desc}
          onChange={(e) => { setDesc(e.target.value); patchDebounced({ description: e.target.value || null }); }}
          placeholder="Add a description…"
          rows={3}
          style={{
            width: "100%", background: S.card, border: `1px solid ${S.border}`,
            borderRadius: 10, padding: "12px 14px", color: S.text, fontSize: 13,
            lineHeight: 1.6, resize: "vertical",
          }}
        />
      </div>

      {/* ── Agenda (meetings) ── */}
      {item.item_type === "meeting" && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: S.dim, textTransform: "uppercase", marginBottom: 8 }}>
            Agenda
          </div>
          <textarea
            value={agenda}
            onChange={(e) => { setAgenda(e.target.value); patchDebounced({ agenda: e.target.value || null }); }}
            placeholder="Meeting agenda…"
            rows={4}
            style={{
              width: "100%", background: S.card, border: `1px solid ${S.border}`,
              borderRadius: 10, padding: "12px 14px", color: S.text, fontSize: 13,
              lineHeight: 1.6, resize: "vertical",
            }}
          />
        </div>
      )}

      {/* ── Meeting notes (meetings) ── */}
      {item.item_type === "meeting" && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: S.dim, textTransform: "uppercase", marginBottom: 8 }}>
            Notes
          </div>
          <textarea
            value={meetingNotes}
            onChange={(e) => { setMeetingNotes(e.target.value); patchDebounced({ meeting_notes: e.target.value || null }); }}
            placeholder="Notes from the meeting…"
            rows={4}
            style={{
              width: "100%", background: S.card, border: `1px solid ${S.border}`,
              borderRadius: 10, padding: "12px 14px", color: S.text, fontSize: 13,
              lineHeight: 1.6, resize: "vertical",
            }}
          />
        </div>
      )}

      {/* ── Assignees ── */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: S.dim, textTransform: "uppercase", marginBottom: 10 }}>
          {item.item_type === "task" ? "Assignees" : item.item_type === "event" ? "Attendees" : "Participants"}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {assignments.map((a) => {
            const u = userMap.get(a.user_id);
            const name = u?.name || u?.email || a.user_id.slice(0, 8);
            const hue = userHue(name);
            return (
              <div
                key={a.user_id}
                style={{
                  display: "flex", alignItems: "center", gap: 7,
                  padding: "5px 10px 5px 6px", borderRadius: 20,
                  background: `hsl(${hue},45%,18%)`,
                  border: `1px solid hsl(${hue},45%,28%)`,
                }}
              >
                <span style={{
                  width: 22, height: 22, borderRadius: "50%",
                  background: `hsl(${hue},55%,32%)`,
                  border: `1.5px solid hsl(${hue},55%,45%)`,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  fontSize: 9, fontWeight: 700, color: "#fff", flexShrink: 0,
                }}>
                  {userInitials(name)}
                </span>
                <span style={{ fontSize: 12, fontWeight: 500, color: `hsl(${hue},60%,80%)` }}>{name}</span>
                <button
                  onClick={() => handleRemoveAssignee(a.user_id)}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    color: `hsl(${hue},40%,55%)`, fontSize: 13, padding: 0, lineHeight: 1,
                    display: "flex", alignItems: "center",
                  }}
                  title="Remove"
                >
                  ×
                </button>
              </div>
            );
          })}

          {/* Add assignee */}
          {unassigned.length > 0 && (
            <div style={{ position: "relative" }} ref={addUserRef}>
              <button
                onClick={() => setShowAddUser((v) => !v)}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                  border: `1px dashed rgba(255,255,255,.2)`,
                  background: "rgba(255,255,255,.03)",
                  color: S.dim, cursor: "pointer",
                }}
              >
                + Add
              </button>
              {showAddUser && (
                <div style={{
                  position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 50,
                  background: S.card, border: `1px solid ${S.border}`,
                  borderRadius: 10, padding: 4, minWidth: 200,
                  boxShadow: "0 8px 28px rgba(0,0,0,.45)",
                  maxHeight: 220, overflowY: "auto",
                }}>
                  {unassigned.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => handleAddAssignee(u.id)}
                      style={{
                        display: "flex", alignItems: "center", gap: 8, width: "100%",
                        padding: "8px 12px", background: "none", border: "none",
                        color: S.text, cursor: "pointer", borderRadius: 7, fontSize: 13, textAlign: "left",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,.06)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                    >
                      {(() => {
                        const hue = userHue(u.name || u.email);
                        return (
                          <span style={{
                            width: 22, height: 22, borderRadius: "50%",
                            background: `hsl(${hue},55%,32%)`,
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            fontSize: 9, fontWeight: 700, color: "#fff", flexShrink: 0,
                          }}>
                            {userInitials(u.name || u.email)}
                          </span>
                        );
                      })()}
                      <span>{u.name || u.email}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Linked CRM records ── */}
      {item.sitrep_links?.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: S.dim, textTransform: "uppercase", marginBottom: 10 }}>
            Linked Records
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {item.sitrep_links.map((link) => (
              <div
                key={link.id}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "8px 12px", background: S.card,
                  border: `1px solid ${S.border}`, borderRadius: 8,
                  fontSize: 13,
                }}
              >
                <span style={{
                  fontSize: 9, fontWeight: 800, letterSpacing: "0.06em",
                  padding: "2px 6px", borderRadius: 4,
                  background: "rgba(255,255,255,.08)", color: S.dim,
                }}>
                  {LINK_TYPE_LABELS[link.record_type] ?? link.record_type.toUpperCase()}
                </span>
                <span style={{ color: S.text }}>
                  {link.display_label ?? link.record_id.slice(0, 8) + "…"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Divider ── */}
      <div style={{ height: 1, background: S.border, opacity: 0.5 }} />

      {/* ── Danger zone ── */}
      {isCreator && (
        <div>
          {!confirmDel ? (
            <button
              onClick={() => setConfirmDel(true)}
              style={{
                display: "flex", alignItems: "center", gap: 7,
                background: "none", border: `1px solid rgba(220,38,38,.3)`,
                color: "rgba(220,38,38,.7)", borderRadius: 8,
                padding: "8px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                transition: "all .12s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(220,38,38,.1)";
                e.currentTarget.style.color = "rgb(220 38 38)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "none";
                e.currentTarget.style.color = "rgba(220,38,38,.7)";
              }}
            >
              🗑 Delete this {item.item_type}
            </button>
          ) : (
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "12px 16px", background: "rgba(220,38,38,.08)",
              border: `1px solid rgba(220,38,38,.3)`, borderRadius: 10,
            }}>
              <span style={{ fontSize: 13, color: "rgb(238 242 246)", flex: 1 }}>
                Delete permanently? This cannot be undone.
              </span>
              <button
                onClick={() => setConfirmDel(false)}
                style={{ padding: "6px 14px", borderRadius: 7, fontSize: 12, border: `1px solid ${S.border}`, background: "rgba(255,255,255,.05)", color: S.dim, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{ padding: "6px 14px", borderRadius: 7, fontSize: 12, fontWeight: 700, border: "1px solid rgba(220,38,38,.5)", background: "rgba(220,38,38,.2)", color: "rgb(220 38 38)", cursor: "pointer" }}
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          )}
        </div>
      )}

      <div style={{ height: 32 }} />
    </div>
  );
}
