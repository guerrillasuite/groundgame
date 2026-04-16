"use client";

import { useState, useRef, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// ── Types ──────────────────────────────────────────────────────────────────────

type Assignment = { user_id: string; role: string };

type SitRepItem = {
  id: string;
  item_type: "task" | "event" | "meeting";
  title: string;
  status: string | null;
  priority: string | null;
  due_date: string | null;
  start_at: string | null;
  is_all_day: boolean | null;
  visibility: string;
  created_by: string;
  sitrep_assignments: Assignment[];
};

type Mission = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  due_date: string | null;
  visibility: string;
  created_by: string;
  created_at: string;
  updated_at: string | null;
  completed_at: string | null;
};

type User = { id: string; name: string; email: string };

type Props = {
  mission: Mission;
  items: SitRepItem[];
  progress: number;
  users: User[];
  currentUserId: string;
};

type SaveState = "idle" | "saving" | "saved" | "error";

// ── Helpers ────────────────────────────────────────────────────────────────────

const MISSION_STATUSES = [
  { key: "planning", label: "Planning", icon: "○", accent: "rgba(134,150,168,.7)",   activeBg: "rgba(134,150,168,.12)" },
  { key: "active",   label: "Active",   icon: "●", accent: "var(--gg-primary, #2563eb)", activeBg: "rgba(37,99,235,.15)" },
  { key: "complete", label: "Complete", icon: "✓", accent: "rgb(22 163 74)",          activeBg: "rgba(22,163,74,.15)" },
  { key: "archived", label: "Archived", icon: "◻", accent: "rgba(107,114,128,.5)",   activeBg: "rgba(107,114,128,.1)" },
];

const TYPE_CFG: Record<string, { label: string; bg: string; color: string; icon: string }> = {
  task:    { label: "TASK",  bg: "rgba(59,130,246,.18)",  color: "#93c5fd",  icon: "○" },
  event:   { label: "EVENT", bg: "rgba(139,92,246,.18)",  color: "#c4b5fd",  icon: "◆" },
  meeting: { label: "MTG",   bg: "rgba(16,185,129,.18)",  color: "#6ee7b7",  icon: "◉" },
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "#fca5a5",
  high:   "#fcd34d",
};

function todayStr() { return new Date().toISOString().split("T")[0]; }

function isOverdue(item: SitRepItem) {
  if (item.status === "done" || item.status === "cancelled") return false;
  const ed = item.item_type === "task" ? item.due_date : item.start_at;
  if (!ed) return false;
  return ed.split("T")[0] < todayStr();
}

function fmtItemDate(item: SitRepItem) {
  const ed   = item.item_type === "task" ? item.due_date : item.start_at;
  if (!ed) return "";
  const ds   = ed.split("T")[0];
  const today    = todayStr();
  const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split("T")[0]; })();
  const withTime = item.item_type !== "task" && item.start_at && !item.is_all_day;
  const timeLabel = withTime
    ? " " + new Date(item.start_at!).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
    : "";
  if (ds === today)    return `Today${timeLabel}`;
  if (ds === tomorrow) return `Tomorrow${timeLabel}`;
  const d = new Date(ds + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + timeLabel;
}

function fmtDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function userInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  return (parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : name.slice(0, 2)).toUpperCase();
}

function userHue(name: string) {
  return Math.abs([...name].reduce((acc, c) => acc + c.charCodeAt(0) * 31, 0)) % 360;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function MissionDetailClient({ mission, items: initialItems, progress: initialProgress, users, currentUserId }: Props) {
  const router = useRouter();

  const [mTitle,   setMTitle]   = useState(mission.title);
  const [mDesc,    setMDesc]    = useState(mission.description ?? "");
  const [mStatus,  setMStatus]  = useState(mission.status);
  const [mDueDate, setMDueDate] = useState(mission.due_date ?? "");
  const [mVis,     setMVis]     = useState(mission.visibility);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [items,    setItems]    = useState<SitRepItem[]>(initialItems);
  const [progress, setProgress] = useState(initialProgress);

  const [togglePending, setTogglePending] = useState<Record<string, boolean>>({});
  const [deleting,  setDeleting]  = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  // New item quick-add
  const [quickTitle, setQuickTitle] = useState("");
  const [quickType,  setQuickType]  = useState<"task" | "event" | "meeting">("task");
  const [quickDate,  setQuickDate]  = useState("");
  const [addPending, setAddPending] = useState(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const S = {
    surface: "rgb(18 23 33)",
    card:    "rgb(28 36 48)",
    border:  "rgb(43 53 67)",
    text:    "rgb(238 242 246)",
    dim:     "rgb(134 150 168)",
  } as const;

  const userMap   = new Map(users.map((u) => [u.id, u]));
  const isCreator = mission.created_by === currentUserId;

  // ── Recalculate progress from current items ───────────────────────────────────

  function recalcProgress(its: SitRepItem[]) {
    const tasks   = its.filter((i) => i.item_type === "task");
    const done    = tasks.filter((i) => i.status === "done").length;
    return tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;
  }

  // ── Save helpers ──────────────────────────────────────────────────────────────

  async function patchNow(fields: Record<string, unknown>) {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    setSaveState("saving");
    try {
      const res = await fetch(`/api/crm/sitrep/missions/${mission.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      setSaveState(res.ok ? "saved" : "error");
    } catch { setSaveState("error"); }
    saveTimer.current = setTimeout(() => setSaveState("idle"), 2500);
  }

  function patchDebounced(fields: Record<string, unknown>) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState("idle");
    saveTimer.current = setTimeout(() => patchNow(fields), 700);
  }

  // ── Task toggle ───────────────────────────────────────────────────────────────

  async function handleToggle(item: SitRepItem) {
    if (item.item_type !== "task" || item.status === "cancelled") return;
    const newStatus = item.status === "done" ? "open" : "done";
    setTogglePending((p) => ({ ...p, [item.id]: true }));
    const updated = items.map((i) => i.id === item.id ? { ...i, status: newStatus } : i);
    setItems(updated);
    setProgress(recalcProgress(updated));
    await fetch(`/api/crm/sitrep/items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    setTogglePending((p) => ({ ...p, [item.id]: false }));
  }

  // ── Quick-add item ────────────────────────────────────────────────────────────

  async function handleQuickAdd(e: FormEvent) {
    e.preventDefault();
    if (!quickTitle.trim() || addPending) return;
    setAddPending(true);
    const body: Record<string, any> = {
      item_type: quickType, title: quickTitle.trim(),
      mission_id: mission.id, visibility: "team",
    };
    if (quickType === "task") { body.status = "open"; body.due_date = quickDate || null; }
    else body.start_at = quickDate ? quickDate + "T00:00:00" : null;

    const res = await fetch("/api/crm/sitrep/items", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const { id } = await res.json();
      const newItem: SitRepItem = {
        id, item_type: quickType, title: quickTitle.trim(),
        status: quickType === "task" ? "open" : null,
        priority: quickType === "task" ? "normal" : null,
        due_date: quickType === "task" ? (quickDate || null) : null,
        start_at: quickType !== "task" ? (quickDate ? quickDate + "T00:00:00" : null) : null,
        is_all_day: false, visibility: "team",
        created_by: currentUserId, sitrep_assignments: [],
      };
      const updated = [...items, newItem];
      setItems(updated);
      setProgress(recalcProgress(updated));
      setQuickTitle(""); setQuickDate("");
    }
    setAddPending(false);
  }

  // ── Delete mission ────────────────────────────────────────────────────────────

  async function handleDelete() {
    setDeleting(true);
    const res = await fetch(`/api/crm/sitrep/missions/${mission.id}`, { method: "DELETE" });
    if (res.ok) router.push("/crm/sitrep/missions");
    else setDeleting(false);
  }

  // ── Group items by type ───────────────────────────────────────────────────────

  const taskItems    = items.filter((i) => i.item_type === "task");
  const eventItems   = items.filter((i) => i.item_type === "event");
  const meetingItems = items.filter((i) => i.item_type === "meeting");

  const statusCfg = MISSION_STATUSES.find((s) => s.key === mStatus) ?? MISSION_STATUSES[0];
  const dueDateFmt = fmtDate(mDueDate || mission.due_date);
  const duePast    = mDueDate ? mDueDate < todayStr() : false;

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }} className="stack">

      {/* ── Top nav ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link
          href="/crm/sitrep/missions"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, color: S.dim, fontSize: 13, fontWeight: 500 }}
        >
          <span style={{ fontSize: 16 }}>←</span> Missions
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href={`/crm/sitrep?mission=${mission.id}`} style={{ fontSize: 12, color: S.dim }}>
            View items in SitRep ↗
          </Link>
          {saveState === "saving" && <span style={{ fontSize: 11, color: S.dim }}>Saving…</span>}
          {saveState === "saved"  && <span style={{ fontSize: 11, color: "rgb(22 163 74)", fontWeight: 600 }}>✓ Saved</span>}
          {saveState === "error"  && <span style={{ fontSize: 11, color: "rgb(220 38 38)", fontWeight: 600 }}>✕ Error</span>}
        </div>
      </div>

      {/* ── Mission header ── */}
      <div style={{
        background: S.card, border: `1px solid ${S.border}`,
        borderLeft: `3px solid ${statusCfg.accent}`,
        borderRadius: 14, padding: "20px 22px",
        display: "grid", gap: 14,
      }}>
        {/* Title */}
        <input
          type="text" value={mTitle}
          onChange={(e) => { setMTitle(e.target.value); patchDebounced({ title: e.target.value }); }}
          placeholder="Untitled Mission"
          style={{
            width: "100%", background: "transparent", border: "none",
            outline: "none", color: S.text, fontSize: 24, fontWeight: 700,
            letterSpacing: "-0.01em", padding: 0, lineHeight: 1.3,
          }}
        />

        {/* Status pills */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {MISSION_STATUSES.map((s) => {
            const active = mStatus === s.key;
            return (
              <button
                key={s.key}
                onClick={() => { setMStatus(s.key); patchNow({ status: s.key }); }}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 13px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                  border: active ? `1px solid ${s.accent}55` : `1px solid ${S.border}`,
                  background: active ? s.activeBg : "rgba(255,255,255,.03)",
                  color: active ? s.accent : S.dim,
                  cursor: "pointer", transition: "all .1s",
                }}
              >
                {s.icon} {s.label}
              </button>
            );
          })}
        </div>

        {/* Description */}
        <textarea
          value={mDesc}
          onChange={(e) => { setMDesc(e.target.value); patchDebounced({ description: e.target.value || null }); }}
          placeholder="Add a mission description…"
          rows={2}
          style={{
            width: "100%", background: "rgba(255,255,255,.04)", border: `1px solid ${S.border}`,
            borderRadius: 8, padding: "10px 12px", color: S.text, fontSize: 13,
            lineHeight: 1.6, resize: "vertical",
          }}
        />

        {/* Due date + visibility row */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: S.dim }}>Due</span>
            <input
              type="date" value={mDueDate}
              onChange={(e) => { setMDueDate(e.target.value); patchNow({ due_date: e.target.value || null }); }}
              style={{
                background: "rgba(255,255,255,.06)", border: `1px solid ${S.border}`,
                borderRadius: 6, padding: "4px 8px",
                color: duePast && mStatus !== "complete" ? "rgb(220 38 38)" : S.text,
                fontSize: 12, cursor: "pointer",
              }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: S.dim }}>Visibility</span>
            <select value={mVis}
              onChange={(e) => { setMVis(e.target.value); patchNow({ visibility: e.target.value }); }}
              style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 6, padding: "4px 8px", color: S.text, fontSize: 12 }}>
              <option value="private">Private</option>
              <option value="team">Team</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Progress bar ── */}
      {taskItems.length > 0 && (
        <div style={{
          background: S.card, border: `1px solid ${S.border}`,
          borderRadius: 12, padding: "14px 18px",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: S.dim, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Task Progress
            </span>
            <span style={{
              fontSize: 18, fontWeight: 800,
              color: progress === 100 ? "rgb(22 163 74)" : S.text,
            }}>
              {progress}%
            </span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,.08)", overflow: "hidden" }}>
            <div style={{
              height: "100%", width: `${progress}%`,
              borderRadius: 4,
              background: progress === 100
                ? "linear-gradient(90deg, rgb(22 163 74), rgb(34 197 94))"
                : "linear-gradient(90deg, var(--gg-primary, #2563eb), #60a5fa)",
              transition: "width .4s cubic-bezier(.25,.8,.25,1)",
            }} />
          </div>
          <div style={{ fontSize: 11, color: S.dim, marginTop: 6, fontWeight: 500 }}>
            {taskItems.filter((i) => i.status === "done").length} of {taskItems.length} tasks complete
            {taskItems.filter((i) => isOverdue(i)).length > 0 && (
              <span style={{ color: "rgb(220 38 38)", marginLeft: 10, fontWeight: 700 }}>
                · {taskItems.filter((i) => isOverdue(i)).length} overdue
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Quick-add item ── */}
      <form onSubmit={handleQuickAdd} style={{
        display: "flex", gap: 8, alignItems: "center",
        padding: "10px 14px",
        background: S.surface, border: `1px solid ${S.border}`, borderRadius: 12,
      }}
        onFocus={(e)  => (e.currentTarget.style.borderColor = "rgba(59,130,246,.45)")}
        onBlur={(e)   => (e.currentTarget.style.borderColor = S.border)}
      >
        {/* Type selector */}
        <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
          {(["task","event","meeting"] as const).map((t) => {
            const cfg = TYPE_CFG[t];
            const active = quickType === t;
            return (
              <button key={t} type="button" onClick={() => setQuickType(t)}
                style={{
                  padding: "3px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700,
                  border: active ? `1px solid ${cfg.color}55` : `1px solid transparent`,
                  background: active ? cfg.bg : "transparent",
                  color: active ? cfg.color : S.dim,
                  cursor: "pointer", transition: "all .1s",
                }}
              >
                {cfg.icon}
              </button>
            );
          })}
        </div>
        <input
          type="text" value={quickTitle}
          onChange={(e) => setQuickTitle(e.target.value)}
          placeholder={`Add ${quickType}…`}
          style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: S.text, fontSize: 13, minWidth: 0 }}
        />
        <input
          type="date" value={quickDate}
          onChange={(e) => setQuickDate(e.target.value)}
          style={{ background: "transparent", border: "none", outline: "none", color: quickDate ? S.text : S.dim, fontSize: 11, cursor: "pointer", flexShrink: 0 }}
        />
        <button type="submit" disabled={!quickTitle.trim() || addPending}
          style={{
            padding: "5px 14px", borderRadius: 7, fontSize: 12, fontWeight: 700, flexShrink: 0,
            border: "1px solid rgba(59,130,246,.4)",
            background: quickTitle.trim() ? "rgba(37,99,235,.25)" : "rgba(255,255,255,.05)",
            color: quickTitle.trim() ? "#93c5fd" : S.dim,
            cursor: quickTitle.trim() ? "pointer" : "default", transition: "all .12s",
          }}
        >
          {addPending ? "…" : "Add"}
        </button>
      </form>

      {/* ── Items by group ── */}
      {[
        { label: "Tasks",    list: taskItems,    type: "task"    as const },
        { label: "Events",   list: eventItems,   type: "event"   as const },
        { label: "Meetings", list: meetingItems, type: "meeting" as const },
      ].map(({ label, list, type }) => {
        if (list.length === 0) return null;
        const cfg = TYPE_CFG[type];
        return (
          <div key={type}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{
                fontSize: 10, fontWeight: 800, letterSpacing: "0.1em",
                color: cfg.color, textTransform: "uppercase",
              }}>
                {label}
              </span>
              <div style={{ flex: 1, height: 1, background: S.border, opacity: 0.5 }} />
              <span style={{ fontSize: 11, color: S.dim }}>{list.length}</span>
            </div>
            <div style={{ display: "grid", gap: 2 }}>
              {list.map((item) => {
                const overdue   = isOverdue(item);
                const isDone    = item.status === "done";
                const dateLabel = fmtItemDate(item);
                const assignees = (item.sitrep_assignments ?? [])
                  .slice(0, 3)
                  .map((a) => userMap.get(a.user_id))
                  .filter(Boolean) as User[];

                return (
                  <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    {/* Toggle (tasks) */}
                    {item.item_type === "task" ? (
                      <button
                        onClick={() => handleToggle(item)}
                        disabled={!!togglePending[item.id] || item.status === "cancelled"}
                        style={{
                          width: 18, height: 18, borderRadius: "50%", flexShrink: 0, padding: 0,
                          border: `2px solid ${isDone ? "rgb(22 163 74)" : overdue ? "rgb(220 38 38)" : "rgba(255,255,255,.25)"}`,
                          background: isDone ? "rgb(22 163 74)" : "transparent",
                          color: isDone ? "#fff" : "transparent",
                          cursor: item.status === "cancelled" ? "default" : "pointer",
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          fontSize: 9, fontWeight: 700,
                          opacity: togglePending[item.id] ? 0.5 : 1,
                          transition: "all .1s",
                        }}
                      >
                        {isDone ? "✓" : ""}
                      </button>
                    ) : (
                      <span style={{
                        width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                        background: cfg.bg, color: cfg.color,
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        fontSize: 9, fontWeight: 700,
                      }}>
                        {cfg.icon}
                      </span>
                    )}

                    {/* Content */}
                    <Link
                      href={`/crm/sitrep/${item.id}`}
                      style={{
                        flex: 1, minWidth: 0,
                        display: "flex", alignItems: "center",
                        padding: "9px 12px",
                        background: S.card, border: `1px solid ${S.border}`,
                        borderRadius: 9, textDecoration: "none",
                        opacity: isDone || item.status === "cancelled" ? 0.6 : 1,
                        transition: "border-color .1s, background .1s",
                      }}
                      onMouseEnter={(e) => {
                        const el = e.currentTarget as HTMLAnchorElement;
                        el.style.borderColor = "rgba(255,255,255,.12)";
                        el.style.background  = "rgb(32 41 55)";
                      }}
                      onMouseLeave={(e) => {
                        const el = e.currentTarget as HTMLAnchorElement;
                        el.style.borderColor = S.border;
                        el.style.background  = S.card;
                      }}
                    >
                      <span style={{
                        flex: 1, fontSize: 13, fontWeight: 500, color: S.text,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        textDecoration: isDone ? "line-through" : "none",
                      }}>
                        {item.title}
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginLeft: 8 }}>
                        {dateLabel && (
                          <span style={{ fontSize: 11, color: overdue ? "rgb(220 38 38)" : S.dim, fontWeight: overdue ? 700 : 400, whiteSpace: "nowrap" }}>
                            {dateLabel}
                          </span>
                        )}
                        {item.priority && PRIORITY_COLORS[item.priority] && (
                          <span style={{
                            fontSize: 9, fontWeight: 800, letterSpacing: "0.06em",
                            padding: "2px 6px", borderRadius: 4,
                            background: item.priority === "urgent" ? "rgba(220,38,38,.18)" : "rgba(245,158,11,.15)",
                            color: PRIORITY_COLORS[item.priority],
                          }}>
                            {item.priority.toUpperCase()}
                          </span>
                        )}
                        {assignees.length > 0 && (
                          <div style={{ display: "flex" }}>
                            {assignees.map((u) => {
                              const hue = userHue(u.name || u.email);
                              return (
                                <span key={u.id} title={u.name || u.email} style={{
                                  width: 20, height: 20, borderRadius: "50%",
                                  background: `hsl(${hue},55%,32%)`,
                                  border: `1.5px solid rgb(28 36 48)`,
                                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                                  fontSize: 8, fontWeight: 700, color: "#fff",
                                  marginLeft: -4,
                                }}>
                                  {userInitials(u.name || u.email)}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {items.length === 0 && (
        <div style={{ padding: "32px 0", textAlign: "center", color: S.dim }}>
          <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.3 }}>⬡</div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>No items yet.</div>
          <div style={{ fontSize: 12, marginTop: 4, opacity: 0.7 }}>Use the bar above to add tasks, events, or meetings.</div>
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
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(220,38,38,.1)"; e.currentTarget.style.color = "rgb(220 38 38)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "rgba(220,38,38,.7)"; }}
            >
              🗑 Delete this mission
            </button>
          ) : (
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "12px 16px", background: "rgba(220,38,38,.08)",
              border: `1px solid rgba(220,38,38,.3)`, borderRadius: 10,
            }}>
              <span style={{ fontSize: 13, color: S.text, flex: 1 }}>
                Delete permanently? Linked items will remain but lose their mission link.
              </span>
              <button onClick={() => setConfirmDel(false)} style={{ padding: "6px 14px", borderRadius: 7, fontSize: 12, border: `1px solid ${S.border}`, background: "rgba(255,255,255,.05)", color: S.dim, cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting} style={{ padding: "6px 14px", borderRadius: 7, fontSize: 12, fontWeight: 700, border: "1px solid rgba(220,38,38,.5)", background: "rgba(220,38,38,.2)", color: "rgb(220 38 38)", cursor: "pointer" }}>
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
