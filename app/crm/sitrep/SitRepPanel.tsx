"use client";

import { useState, useTransition, useRef, useEffect, FormEvent } from "react";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────────────────────

type Assignment = { user_id: string; role: string };

export type SitRepItem = {
  id: string;
  item_type: "task" | "event" | "meeting";
  title: string;
  status: string | null;
  priority: string | null;
  due_date: string | null;
  start_at: string | null;
  end_at: string | null;
  is_all_day: boolean | null;
  mission_id: string | null;
  visibility: string;
  created_by: string;
  created_at: string;
  sitrep_assignments: Assignment[];
};

type Mission = { id: string; title: string; status: string };
type User = { id: string; name: string; email: string };
type CreateType = "task" | "event" | "meeting" | "mission";

export type Props = {
  initialItems: SitRepItem[];
  missions: Mission[];
  users: User[];
  currentUserId: string;
  hasMissions?: boolean;
};

// ── Date helpers ───────────────────────────────────────────────────────────────

function todayStr() { return new Date().toISOString().split("T")[0]; }
function tomorrowStr() {
  const d = new Date(); d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}
function weekEndStr() {
  const d = new Date(); d.setDate(d.getDate() + 7);
  return d.toISOString().split("T")[0];
}

function effectiveDate(item: SitRepItem): string | null {
  if (item.item_type === "task") return item.due_date;
  return item.start_at ?? item.due_date;
}

// Returns true only if the stored datetime string has an explicit non-midnight time component.
function hasExplicitTime(s: string | null | undefined): boolean {
  if (!s || !s.includes("T")) return false;
  const t = s.split("T")[1] ?? "";
  return !t.startsWith("00:00");
}

function isOverdue(item: SitRepItem): boolean {
  if (item.status === "done" || item.status === "cancelled") return false;
  const ed = effectiveDate(item);
  if (!ed) return false;
  return ed.split("T")[0] < todayStr();
}

function fmtDate(item: SitRepItem): string {
  const ed = effectiveDate(item);
  if (!ed) return "";
  const dateStr = ed.split("T")[0];
  const today = todayStr();
  const tomorrow = tomorrowStr();

  const withTime = item.item_type !== "task" && hasExplicitTime(item.start_at) && !item.is_all_day;
  const timeLabel = withTime
    ? " " + new Date(item.start_at!).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
    : "";

  if (dateStr === today) return `Today${timeLabel}`;
  if (dateStr === tomorrow) return `Tomorrow${timeLabel}`;

  const d = new Date(dateStr + "T00:00:00");
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString("en-US", opts) + timeLabel;
}

// ── Grouping ───────────────────────────────────────────────────────────────────

type Group = { key: string; label: string; color: string; items: SitRepItem[] };

function groupItems(items: SitRepItem[]): Group[] {
  const today = todayStr();
  const tomorrow = tomorrowStr();
  const weekEnd = weekEndStr();

  const buckets: Record<string, SitRepItem[]> = {
    overdue: [], today: [], tomorrow: [], week: [],
    later: [], nodate: [], done: [], cancelled: [],
  };

  for (const item of items) {
    if (item.status === "done")      { buckets.done.push(item); continue; }
    if (item.status === "cancelled") { buckets.cancelled.push(item); continue; }
    const ed = effectiveDate(item);
    if (!ed) { buckets.nodate.push(item); continue; }
    const ds = ed.split("T")[0];
    if (ds < today)    { buckets.overdue.push(item); continue; }
    if (ds === today)  { buckets.today.push(item); continue; }
    if (ds === tomorrow) { buckets.tomorrow.push(item); continue; }
    if (ds <= weekEnd) { buckets.week.push(item); continue; }
    buckets.later.push(item);
  }

  const muted = "rgb(134 150 168)";
  const result: Group[] = [];
  if (buckets.overdue.length)   result.push({ key: "overdue",   label: "Overdue",    color: "rgb(220 38 38)",  items: buckets.overdue });
  if (buckets.today.length)     result.push({ key: "today",     label: "Today",      color: "rgb(245 158 11)", items: buckets.today });
  if (buckets.tomorrow.length)  result.push({ key: "tomorrow",  label: "Tomorrow",   color: muted,             items: buckets.tomorrow });
  if (buckets.week.length)      result.push({ key: "week",      label: "This Week",  color: muted,             items: buckets.week });
  if (buckets.later.length)     result.push({ key: "later",     label: "Later",      color: muted,             items: buckets.later });
  if (buckets.nodate.length)    result.push({ key: "nodate",    label: "No Date",    color: muted,             items: buckets.nodate });
  if (buckets.done.length)      result.push({ key: "done",      label: "Done",       color: "rgb(22 163 74)",  items: buckets.done });
  if (buckets.cancelled.length) result.push({ key: "cancelled", label: "Cancelled",  color: muted,             items: buckets.cancelled });
  return result;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

// Per-type accent colors — used for badges, left borders, and dots
const TYPE_CFG: Record<string, { label: string; bg: string; color: string; accent: string }> = {
  task:    { label: "TASK",  bg: "rgba(59,130,246,.15)",  color: "#93c5fd", accent: "#3b82f6" },
  event:   { label: "EVENT", bg: "rgba(139,92,246,.15)",  color: "#c4b5fd", accent: "#8b5cf6" },
  meeting: { label: "MTG",   bg: "rgba(16,185,129,.15)",  color: "#6ee7b7", accent: "#10b981" },
};

function TypeBadge({ type }: { type: string }) {
  const c = TYPE_CFG[type] ?? TYPE_CFG.task;
  return (
    <span style={{
      fontSize: 10, fontWeight: 800, letterSpacing: "0.07em",
      padding: "3px 7px", borderRadius: 5,
      background: c.bg,
      color: c.color,
      border: `1px solid ${c.color}30`,
      flexShrink: 0,
    }}>
      {c.label}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const cfg: Record<string, { label: string; bg: string; color: string; border: string }> = {
    urgent: { label: "!! URGENT", bg: "rgba(220,38,38,.15)", color: "#fca5a5", border: "rgba(220,38,38,.35)" },
    high:   { label: "HIGH",      bg: "rgba(245,158,11,.12)", color: "#fcd34d", border: "rgba(245,158,11,.30)" },
  };
  const c = cfg[priority];
  if (!c) return null;
  return (
    <span style={{
      fontSize: 10, fontWeight: 800, letterSpacing: "0.05em",
      padding: "3px 7px", borderRadius: 5,
      background: c.bg, color: c.color,
      border: `1px solid ${c.border}`,
      flexShrink: 0,
    }}>
      {c.label}
    </span>
  );
}

function UserDot({ name }: { name: string }) {
  const initials = name
    .trim().split(/\s+/)
    .map((p) => p[0] ?? "")
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const hue = Math.abs(name.charCodeAt(0) * 37 + name.charCodeAt(1) * 17) % 360;
  return (
    <span title={name} style={{
      width: 22, height: 22, borderRadius: "50%",
      background: `hsl(${hue},55%,32%)`,
      border: `1.5px solid hsl(${hue},55%,45%)`,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      fontSize: 9, fontWeight: 700, color: "#fff",
      flexShrink: 0,
    }}>
      {initials || "?"}
    </span>
  );
}

function StatusDot({
  item, onToggle, pending,
}: { item: SitRepItem; onToggle: () => void; pending: boolean }) {
  const overdue   = isOverdue(item);
  const done      = item.status === "done";
  const inProg    = item.status === "in_progress";
  const cancelled = item.status === "cancelled";

  if (item.item_type !== "task") {
    const { accent } = TYPE_CFG[item.item_type] ?? TYPE_CFG.task;
    const icon = item.item_type === "meeting" ? "⊙" : "◆";
    return (
      <span style={{
        width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
        background: `${accent}22`, border: `2px solid ${accent}66`,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontSize: 9, color: accent,
      }}>
        {icon}
      </span>
    );
  }

  const borderColor = cancelled
    ? "rgba(255,255,255,.15)"
    : done
      ? "rgb(22 163 74)"
      : overdue
        ? "rgb(220 38 38)"
        : inProg
          ? "var(--primary, #3b82f6)"
          : "rgba(255,255,255,.25)";

  return (
    <button
      onClick={onToggle}
      disabled={pending || cancelled}
      title={done ? "Mark open" : "Mark done"}
      style={{
        width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
        border: `2px solid ${borderColor}`,
        background: done ? "rgb(22 163 74)" : cancelled ? "rgba(255,255,255,.04)" : "transparent",
        cursor: cancelled ? "default" : "pointer",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontSize: 10, fontWeight: 700,
        color: done ? "#fff" : cancelled ? "rgba(255,255,255,.2)" : "transparent",
        transition: "all .1s ease",
        padding: 0,
        opacity: pending ? 0.5 : 1,
      }}
    >
      {done ? "✓" : cancelled ? "✕" : ""}
    </button>
  );
}

function FilterPill({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "5px 13px",
        borderRadius: 20,
        border: active
          ? "1px solid color-mix(in srgb, var(--primary, #2563eb) 55%, transparent)"
          : "1px solid rgba(255,255,255,.1)",
        background: active
          ? "color-mix(in srgb, var(--primary, #2563eb) 22%, transparent)"
          : "rgba(255,255,255,.04)",
        color: active ? "#93c5fd" : "rgb(160 174 192)",
        fontSize: 12, fontWeight: 600,
        cursor: "pointer", transition: "all .12s ease",
      }}
    >
      {children}
    </button>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function SitRepPanel({ initialItems, missions, users, currentUserId, hasMissions }: Props) {
  const [items, setItems] = useState<SitRepItem[]>(initialItems);
  const [scope, setScope]       = useState<"mine" | "all">("mine");
  const [typeFilter, setTypeFilter] = useState<"all" | "task" | "event" | "meeting">("all");
  const [statusFilter, setStatusFilter] = useState<"active" | "done" | "all">("active");

  // Quick-add state
  const [quickTitle, setQuickTitle] = useState("");
  const [quickDate, setQuickDate]   = useState("");
  const [addPending, startAdd]      = useTransition();

  // Status toggle pending map
  const [togglePending, setTogglePending] = useState<Record<string, boolean>>({});

  // Create modal
  const [showCreate, setShowCreate]     = useState(false);
  const [createType, setCreateType]     = useState<CreateType>("task");
  const [createTitle, setCreateTitle]   = useState("");
  const [createDesc, setCreateDesc]     = useState("");
  const [createPriority, setCreatePriority] = useState("normal");
  const [createDueDate, setCreateDueDate] = useState("");
  const [createStartAt, setCreateStartAt] = useState("");
  const [createEndAt, setCreateEndAt]   = useState("");
  const [createIsAllDay, setCreateIsAllDay] = useState(false);
  const [createAgenda, setCreateAgenda] = useState("");
  const [createMissionId, setCreateMissionId] = useState("");
  const [createVisibility, setCreateVisibility] = useState("assignee_only");
  const [createAssignees, setCreateAssignees] = useState<string[]>([]);
  const [createStatus, setCreateStatus] = useState("planning"); // for missions
  const [creating, setCreating]         = useState(false);
  const [createError, setCreateError]   = useState("");

  // New button dropdown
  const [showNewMenu, setShowNewMenu] = useState(false);
  const newBtnRef  = useRef<HTMLButtonElement>(null);
  const newMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside — must include the menu div itself,
  // otherwise mousedown fires before click and collapses the menu first.
  useEffect(() => {
    if (!showNewMenu) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!newBtnRef.current?.contains(t) && !newMenuRef.current?.contains(t)) {
        setShowNewMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showNewMenu]);

  // Derived stats
  const now = todayStr();
  const openItems  = items.filter((i) => i.status !== "done" && i.status !== "cancelled");
  const overdueItems = items.filter((i) => isOverdue(i));

  // Filtered view
  const userMap = new Map(users.map((u) => [u.id, u]));
  const missionMap = new Map(missions.map((m) => [m.id, m]));

  let filtered = items;

  if (scope === "mine") {
    filtered = filtered.filter(
      (i) => i.created_by === currentUserId || i.sitrep_assignments.some((a) => a.user_id === currentUserId)
    );
  }
  if (typeFilter !== "all") {
    filtered = filtered.filter((i) => i.item_type === typeFilter);
  }
  if (statusFilter === "active") {
    filtered = filtered.filter((i) => i.status !== "done" && i.status !== "cancelled");
  } else if (statusFilter === "done") {
    filtered = filtered.filter((i) => i.status === "done");
  }

  const groups = groupItems(filtered);

  // ── Actions ──────────────────────────────────────────────────────────────────

  async function handleToggle(item: SitRepItem) {
    if (item.item_type !== "task" || item.status === "cancelled") return;
    const newStatus = item.status === "done" ? "open" : "done";
    setTogglePending((p) => ({ ...p, [item.id]: true }));
    setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, status: newStatus } : i));
    await fetch(`/api/crm/sitrep/items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    setTogglePending((p) => ({ ...p, [item.id]: false }));
  }

  function handleQuickAdd(e: FormEvent) {
    e.preventDefault();
    if (!quickTitle.trim()) return;
    const title = quickTitle.trim();
    const dueDate = quickDate || null;
    setQuickTitle("");
    setQuickDate("");

    startAdd(async () => {
      const res = await fetch("/api/crm/sitrep/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_type: "task", title, due_date: dueDate, visibility: "assignee_only" }),
      });
      if (res.ok) {
        const { id } = await res.json();
        const newItem: SitRepItem = {
          id, item_type: "task", title, status: "open", priority: "normal",
          due_date: dueDate, start_at: null, end_at: null, is_all_day: false,
          mission_id: null, visibility: "assignee_only",
          created_by: currentUserId, created_at: new Date().toISOString(),
          sitrep_assignments: [],
        };
        setItems((prev) => [newItem, ...prev]);
      }
    });
  }

  function openCreate(type: CreateType) {
    setCreateType(type);
    setCreateTitle(""); setCreateDesc(""); setCreatePriority("normal");
    setCreateDueDate(""); setCreateStartAt(""); setCreateEndAt("");
    setCreateIsAllDay(false); setCreateAgenda(""); setCreateMissionId("");
    setCreateVisibility(type === "task" ? "assignee_only" : "team");
    setCreateAssignees([]); setCreateStatus("planning");
    setCreateError("");
    setShowCreate(true);
    setShowNewMenu(false);
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!createTitle.trim()) { setCreateError("Title is required."); return; }
    setCreating(true); setCreateError("");

    const endpoint = createType === "mission"
      ? "/api/crm/sitrep/missions"
      : "/api/crm/sitrep/items";

    const body: Record<string, any> = {
      title: createTitle.trim(),
      description: createDesc || null,
      visibility: createVisibility,
    };

    if (createType === "mission") {
      body.status = createStatus;
      body.due_date = createDueDate || null;
    } else {
      body.item_type = createType;
      body.mission_id = createMissionId || null;
      if (createAssignees.length) body.assignee_ids = createAssignees;

      if (createType === "task") {
        body.priority = createPriority;
        body.due_date = createDueDate || null;
        body.status = "open";
      } else {
        body.start_at = createStartAt || null;
        body.end_at   = createEndAt   || null;
        body.is_all_day = createIsAllDay;
        if (createType === "meeting") body.agenda = createAgenda || null;
      }
    }

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = await res.json();
      if (createType !== "mission") {
        const newItem: SitRepItem = {
          id: data.id, item_type: createType as any,
          title: createTitle.trim(), status: createType === "task" ? "open" : null,
          priority: createType === "task" ? createPriority : null,
          due_date: createType === "task" ? (createDueDate || null) : null,
          start_at: createType !== "task" ? (createStartAt || null) : null,
          end_at:   createType !== "task" ? (createEndAt   || null) : null,
          is_all_day: createIsAllDay, mission_id: createMissionId || null,
          visibility: createVisibility, created_by: currentUserId,
          created_at: new Date().toISOString(),
          sitrep_assignments: createAssignees.map((uid) => ({ user_id: uid, role: "assignee" })),
        };
        setItems((prev) => [newItem, ...prev]);
      }
      setShowCreate(false);
    } else {
      const err = await res.json().catch(() => ({}));
      setCreateError(err.error ?? "Failed to create. Please try again.");
    }
    setCreating(false);
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const S = {
    surface: "rgb(18 23 33)",
    card:    "rgb(28 36 48)",
    border:  "rgb(43 53 67)",
    text:    "rgb(238 242 246)",
    dim:     "rgb(160 174 192)",  // brightened for WCAG AA (~4.2:1 on card)
  } as const;

  return (
    <div className="stack" style={{ maxWidth: 900 }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>SitRep</h1>
          <div style={{ display: "flex", gap: 16, marginTop: 6, flexWrap: "wrap", alignItems: "baseline" }}>
            <span style={{ fontSize: 13, color: S.dim }}>
              <span style={{ fontWeight: 700, fontSize: 18, color: S.text, marginRight: 3 }}>{openItems.length}</span>
              open
            </span>
            {overdueItems.length > 0 && (
              <span style={{ fontSize: 13, color: "rgba(220,38,38,.8)" }}>
                <span style={{ fontWeight: 700, fontSize: 18, color: "rgb(248 113 113)", marginRight: 3 }}>{overdueItems.length}</span>
                overdue
              </span>
            )}
            <span style={{ fontSize: 13, color: S.dim }}>
              <span style={{ fontWeight: 600, fontSize: 15, color: S.text, marginRight: 3 }}>{items.length}</span>
              total
            </span>
          </div>
        </div>

        {/* Right actions: Missions link + New button */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {hasMissions && (
          <Link
            href="/crm/sitrep/missions"
            style={{
              padding: "7px 14px", fontSize: 13, borderRadius: 10,
              border: "1px solid rgba(99,102,241,.3)",
              background: "rgba(99,102,241,.08)",
              color: "#a5b4fc", textDecoration: "none",
              display: "inline-flex", alignItems: "center", gap: 6,
              fontWeight: 500,
            }}
          >
            <span style={{ fontSize: 13 }}>⬡</span>
            Missions
          </Link>
        )}
        {/* New button + dropdown */}
        <div style={{ position: "relative" }}>
          <button
            ref={newBtnRef}
            className="btn"
            onClick={() => setShowNewMenu((v) => !v)}
            style={{ padding: "7px 14px", fontSize: 13, borderRadius: 10, gap: 6, display: "flex", alignItems: "center" }}
          >
            + New
            <span style={{ opacity: 0.6, fontSize: 10 }}>▾</span>
          </button>
          {showNewMenu && (
            <div ref={newMenuRef} style={{
              position: "absolute", top: "calc(100% + 4px)", right: 0,
              background: S.card, border: `1px solid ${S.border}`,
              borderRadius: 10, padding: 4, zIndex: 100,
              minWidth: 150, boxShadow: "0 8px 28px rgba(0,0,0,.45)",
            }}>
              {([
                { type: "task",    icon: "○",  label: "Task" },
                { type: "event",   icon: "◆",  label: "Event" },
                { type: "meeting", icon: "◉",  label: "Meeting" },
                { type: "mission", icon: "⬡",  label: "Mission" },
              ] as const).map((opt) => (
                <button
                  key={opt.type}
                  onClick={() => openCreate(opt.type)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, width: "100%",
                    padding: "8px 12px", background: "none", border: "none",
                    color: S.text, cursor: "pointer", borderRadius: 7, fontSize: 13,
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,.06)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                >
                  <span style={{ opacity: 0.55, width: 14, textAlign: "center" }}>{opt.icon}</span>
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        </div>
      </div>

      {/* ── Quick-add bar ── */}
      <form onSubmit={handleQuickAdd} style={{
        display: "flex", gap: 8, alignItems: "center",
        padding: "10px 14px",
        background: S.surface,
        border: `1px solid ${S.border}`,
        borderRadius: 14,
        transition: "border-color .15s",
      }}
        onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(59,130,246,.45)")}
        onBlur={(e)  => (e.currentTarget.style.borderColor = S.border)}
      >
        <span style={{ fontSize: 16, opacity: 0.35, flexShrink: 0 }}>○</span>
        <input
          type="text"
          value={quickTitle}
          onChange={(e) => setQuickTitle(e.target.value)}
          placeholder="Add a task…"
          style={{
            flex: 1, background: "transparent", border: "none", outline: "none",
            color: S.text, fontSize: 14, minWidth: 0,
          }}
        />
        <input
          type="date"
          value={quickDate}
          onChange={(e) => setQuickDate(e.target.value)}
          style={{
            background: "transparent", border: "none", outline: "none",
            color: quickDate ? S.text : S.dim, fontSize: 12, cursor: "pointer",
            flexShrink: 0,
          }}
        />
        <button
          type="submit"
          disabled={!quickTitle.trim() || addPending}
          style={{
            padding: "5px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700,
            border: "1px solid rgba(59,130,246,.4)",
            background: quickTitle.trim()
              ? "color-mix(in srgb, var(--primary, #2563eb) 25%, transparent)"
              : "rgba(255,255,255,.05)",
            color: quickTitle.trim() ? "color-mix(in srgb, var(--primary, #2563eb) 85%, #fff)" : S.dim,
            cursor: quickTitle.trim() ? "pointer" : "default",
            transition: "all .12s ease", flexShrink: 0,
          }}
        >
          {addPending ? "…" : "Add"}
        </button>
      </form>

      {/* ── Filter bar ── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <div style={{ display: "flex", gap: 4 }}>
          <FilterPill active={scope === "mine"} onClick={() => setScope("mine")}>Mine</FilterPill>
          <FilterPill active={scope === "all"}  onClick={() => setScope("all")}>All</FilterPill>
        </div>
        <div style={{ width: 1, height: 20, background: S.border, margin: "0 2px" }} />
        <div style={{ display: "flex", gap: 4 }}>
          {(["all","task","event","meeting"] as const).map((t) => (
            <FilterPill key={t} active={typeFilter === t} onClick={() => setTypeFilter(t)}>
              {t === "all" ? "All Types" : t === "task" ? "Tasks" : t === "event" ? "Events" : "Meetings"}
            </FilterPill>
          ))}
        </div>
        <div style={{ width: 1, height: 20, background: S.border, margin: "0 2px" }} />
        <div style={{ display: "flex", gap: 4 }}>
          <FilterPill active={statusFilter === "active"} onClick={() => setStatusFilter("active")}>Active</FilterPill>
          <FilterPill active={statusFilter === "done"}   onClick={() => setStatusFilter("done")}>Done</FilterPill>
          <FilterPill active={statusFilter === "all"}    onClick={() => setStatusFilter("all")}>All</FilterPill>
        </div>
      </div>

      {/* ── Item list ── */}
      {groups.length === 0 ? (
        <div style={{
          padding: "56px 0", textAlign: "center",
          color: S.dim, fontSize: 14,
          background: `radial-gradient(ellipse at 50% 40%, rgba(37,99,235,.06) 0%, transparent 70%)`,
          borderRadius: 16, border: `1px solid ${S.border}`,
        }}>
          <div style={{ fontSize: 40, marginBottom: 14, opacity: 0.35, lineHeight: 1 }}>✓</div>
          <div style={{ fontWeight: 700, fontSize: 15, color: S.text }}>All clear.</div>
          <div style={{ fontSize: 13, marginTop: 6, color: S.dim, maxWidth: 280, margin: "6px auto 0" }}>
            Nothing on the board. Add a task above or use{" "}
            <span style={{ color: S.text, fontWeight: 600 }}>+ New</span> to schedule an event or meeting.
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 20 }}>
          {groups.map((group) => (
            <div key={group.key}>
              {/* Section header */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <span style={{
                  fontSize: 11, fontWeight: 800, letterSpacing: "0.1em",
                  color: group.color, textTransform: "uppercase", flexShrink: 0,
                }}>
                  {group.label}
                </span>
                <div style={{
                  flex: 1, height: 1,
                  background: `linear-gradient(to right, ${group.color}55, transparent)`,
                }} />
                <span style={{
                  fontSize: 10, fontWeight: 700, flexShrink: 0,
                  color: group.color, background: `${group.color}1a`,
                  borderRadius: 99, padding: "2px 9px",
                  border: `1px solid ${group.color}30`,
                }}>
                  {group.items.length}
                </span>
              </div>

              {/* Items */}
              <div style={{ display: "grid", gap: 2 }}>
                {group.items.map((item) => {
                  const overdue    = isOverdue(item);
                  const isDone     = item.status === "done";
                  const mission    = item.mission_id ? missionMap.get(item.mission_id) : undefined;
                  const dateLabel  = fmtDate(item);
                  const assignees  = item.sitrep_assignments
                    .slice(0, 4)
                    .map((a) => userMap.get(a.user_id))
                    .filter(Boolean) as User[];

                  const typeAccent = TYPE_CFG[item.item_type]?.accent ?? "#3b82f6";
                  const cardBg = overdue
                    ? `linear-gradient(to right, rgba(220,38,38,.07) 0%, ${S.card} 60%)`
                    : group.key === "today"
                      ? `linear-gradient(to right, rgba(245,158,11,.06) 0%, ${S.card} 60%)`
                      : S.card;

                  return (
                    <div
                      key={item.id}
                      style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "10px 14px",
                        background: cardBg,
                        border: `1px solid ${S.border}`,
                        borderLeft: `3px solid ${isDone || item.status === "cancelled" ? "rgba(255,255,255,.1)" : typeAccent}`,
                        borderRadius: 10,
                        opacity: isDone || item.status === "cancelled" ? 0.55 : 1,
                        transition: "border-color .12s, background .12s, box-shadow .12s",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = "rgba(255,255,255,.14)";
                        e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,.3)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = S.border;
                        e.currentTarget.style.boxShadow = "none";
                      }}
                    >
                      {/* Status dot */}
                      <StatusDot
                        item={item}
                        onToggle={() => handleToggle(item)}
                        pending={!!togglePending[item.id]}
                      />

                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "nowrap" }}>
                          <TypeBadge type={item.item_type} />
                          <Link
                            href={`/crm/sitrep/${item.id}`}
                            style={{
                              fontSize: 13, fontWeight: 500, color: S.text,
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                              textDecoration: isDone ? "line-through" : "none",
                              opacity: isDone ? 0.7 : 1,
                              flex: 1, minWidth: 0,
                            }}
                          >
                            {item.title}
                          </Link>
                        </div>
                        {mission && (
                          <div style={{ marginTop: 3 }}>
                            <span style={{
                              fontSize: 11, fontWeight: 500,
                              background: "color-mix(in srgb, var(--primary, #2563eb) 15%, transparent)", color: "#93c5fd",
                              borderRadius: 4, padding: "1px 7px",
                            }}>
                              ⬡ {mission.title}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Right meta */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                        {dateLabel && (
                          <span
                            suppressHydrationWarning
                            style={{
                              fontSize: 11, fontWeight: overdue ? 700 : 400,
                              color: overdue ? "rgb(220 38 38)" : S.dim,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {dateLabel}
                          </span>
                        )}
                        {item.priority && (item.priority === "urgent" || item.priority === "high") && (
                          <PriorityBadge priority={item.priority} />
                        )}
                        {assignees.length > 0 && (
                          <div style={{ display: "flex", gap: -4 }}>
                            {assignees.map((u) => <UserDot key={u.id} name={u.name || u.email} />)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Create modal ── */}
      {showCreate && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 200,
            background: "rgba(0,0,0,.65)", backdropFilter: "blur(3px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 16,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}
        >
          <div style={{
            width: "min(540px, 100%)",
            background: S.card, border: `1px solid ${S.border}`,
            borderRadius: 16, padding: 24,
            boxShadow: "0 24px 64px rgba(0,0,0,.5)",
            display: "grid", gap: 16,
            maxHeight: "90vh", overflowY: "auto",
          }}>
            {/* Modal header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                {createType === "task" ? "New Task" : createType === "event" ? "New Event" : createType === "meeting" ? "New Meeting" : "New Mission"}
              </h2>
              <button
                onClick={() => setShowCreate(false)}
                style={{
                  background: "none", border: "none", color: S.dim,
                  cursor: "pointer", fontSize: 18, padding: "0 4px", lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>

            {/* Type switcher (for items, not missions) */}
            {createType !== "mission" && (
              <div style={{ display: "flex", gap: 4 }}>
                {(["task","event","meeting"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setCreateType(t)}
                    style={{
                      flex: 1, padding: "7px 0", borderRadius: 8, fontSize: 12, fontWeight: 600,
                      border: createType === t
                        ? `1px solid ${TYPE_CFG[t]?.color ?? "#93c5fd"}55`
                        : `1px solid ${S.border}`,
                      background: createType === t
                        ? `${TYPE_CFG[t]?.bg ?? "rgba(37,99,235,.2)"}`
                        : "rgba(255,255,255,.04)",
                      color: createType === t ? (TYPE_CFG[t]?.color ?? "#93c5fd") : S.dim,
                      cursor: "pointer", transition: "all .1s",
                    }}
                  >
                    {t === "task" ? "Task" : t === "event" ? "Event" : "Meeting"}
                  </button>
                ))}
              </div>
            )}

            <form onSubmit={handleCreate} style={{ display: "grid", gap: 14 }}>
              {/* Title */}
              <div>
                <label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
                  Title <span style={{ color: "rgb(220 38 38)" }}>*</span>
                </label>
                <input
                  type="text"
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                  placeholder={
                    createType === "task" ? "What needs to be done?" :
                    createType === "event" ? "Event name…" :
                    createType === "meeting" ? "Meeting subject…" :
                    "Mission title…"
                  }
                  autoFocus
                  style={{
                    width: "100%", padding: "9px 12px", borderRadius: 8,
                    background: S.surface, border: `1px solid ${S.border}`,
                    color: S.text, fontSize: 14,
                  }}
                />
              </div>

              {/* Task-specific fields */}
              {createType === "task" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>Priority</label>
                    <select
                      value={createPriority}
                      onChange={(e) => setCreatePriority(e.target.value)}
                      style={{ width: "100%", padding: "9px 10px", borderRadius: 8, background: S.surface, border: `1px solid ${S.border}`, color: S.text, fontSize: 13 }}
                    >
                      <option value="low">Low</option>
                      <option value="normal">Normal</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>Due Date</label>
                    <input type="date" value={createDueDate} onChange={(e) => setCreateDueDate(e.target.value)}
                      style={{ width: "100%", padding: "9px 10px", borderRadius: 8, background: S.surface, border: `1px solid ${S.border}`, color: S.text, fontSize: 13 }} />
                  </div>
                </div>
              )}

              {/* Event/Meeting-specific fields */}
              {(createType === "event" || createType === "meeting") && (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>Start</label>
                      <input type="datetime-local" value={createStartAt} onChange={(e) => setCreateStartAt(e.target.value)}
                        style={{ width: "100%", padding: "9px 10px", borderRadius: 8, background: S.surface, border: `1px solid ${S.border}`, color: S.text, fontSize: 12 }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>End</label>
                      <input type="datetime-local" value={createEndAt} onChange={(e) => setCreateEndAt(e.target.value)}
                        style={{ width: "100%", padding: "9px 10px", borderRadius: 8, background: S.surface, border: `1px solid ${S.border}`, color: S.text, fontSize: 12 }} />
                    </div>
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 400, cursor: "pointer" }}>
                    <input type="checkbox" checked={createIsAllDay} onChange={(e) => setCreateIsAllDay(e.target.checked)}
                      style={{ width: 14, height: 14, accentColor: "var(--primary, #2563eb)" }} />
                    All day
                  </label>
                  {createType === "meeting" && (
                    <div>
                      <label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>Agenda</label>
                      <textarea value={createAgenda} onChange={(e) => setCreateAgenda(e.target.value)}
                        rows={3} placeholder="Meeting agenda…"
                        style={{ width: "100%", padding: "9px 12px", borderRadius: 8, resize: "vertical", background: S.surface, border: `1px solid ${S.border}`, color: S.text, fontSize: 13 }} />
                    </div>
                  )}
                </>
              )}

              {/* Mission-specific fields */}
              {createType === "mission" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>Status</label>
                    <select value={createStatus} onChange={(e) => setCreateStatus(e.target.value)}
                      style={{ width: "100%", padding: "9px 10px", borderRadius: 8, background: S.surface, border: `1px solid ${S.border}`, color: S.text, fontSize: 13 }}>
                      <option value="planning">Planning</option>
                      <option value="active">Active</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>Due Date</label>
                    <input type="date" value={createDueDate} onChange={(e) => setCreateDueDate(e.target.value)}
                      style={{ width: "100%", padding: "9px 10px", borderRadius: 8, background: S.surface, border: `1px solid ${S.border}`, color: S.text, fontSize: 13 }} />
                  </div>
                </div>
              )}

              {/* Description */}
              <div>
                <label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>Description</label>
                <textarea value={createDesc} onChange={(e) => setCreateDesc(e.target.value)}
                  rows={2} placeholder="Optional notes…"
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 8, resize: "vertical", background: S.surface, border: `1px solid ${S.border}`, color: S.text, fontSize: 13 }} />
              </div>

              {/* Link to Mission (for items only) */}
              {createType !== "mission" && missions.length > 0 && (
                <div>
                  <label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>Mission (optional)</label>
                  <select value={createMissionId} onChange={(e) => setCreateMissionId(e.target.value)}
                    style={{ width: "100%", padding: "9px 10px", borderRadius: 8, background: S.surface, border: `1px solid ${S.border}`, color: S.text, fontSize: 13 }}>
                    <option value="">— None —</option>
                    {missions.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
                  </select>
                </div>
              )}

              {/* Assignees (items only) */}
              {createType !== "mission" && users.length > 1 && (
                <div>
                  <label style={{ fontSize: 12, display: "block", marginBottom: 6 }}>
                    {createType === "task" ? "Assignees" : createType === "event" ? "Attendees" : "Participants"}
                  </label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {users.map((u) => {
                      const selected = createAssignees.includes(u.id);
                      return (
                        <button
                          key={u.id} type="button"
                          onClick={() => setCreateAssignees((prev) =>
                            selected ? prev.filter((id) => id !== u.id) : [...prev, u.id]
                          )}
                          style={{
                            padding: "4px 10px", borderRadius: 16, fontSize: 12, fontWeight: 500,
                            border: selected
                              ? "1px solid color-mix(in srgb, var(--primary, #2563eb) 55%, transparent)"
                              : `1px solid ${S.border}`,
                            background: selected
                              ? "color-mix(in srgb, var(--primary, #2563eb) 22%, transparent)"
                              : "rgba(255,255,255,.04)",
                            color: selected ? "#93c5fd" : S.dim,
                            cursor: "pointer",
                          }}
                        >
                          {u.name || u.email}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Visibility */}
              <div>
                <label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>Visibility</label>
                <select value={createVisibility} onChange={(e) => setCreateVisibility(e.target.value)}
                  style={{ width: "100%", padding: "9px 10px", borderRadius: 8, background: S.surface, border: `1px solid ${S.border}`, color: S.text, fontSize: 13 }}>
                  <option value="private">Private (only me)</option>
                  <option value="assignee_only">Assignees only</option>
                  <option value="team">Team (all CRM users)</option>
                </select>
              </div>

              {createError && (
                <p style={{ margin: 0, fontSize: 12, color: "rgb(220 38 38)" }}>{createError}</p>
              )}

              {/* Actions */}
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 4 }}>
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  style={{
                    padding: "8px 18px", borderRadius: 8, fontSize: 13,
                    border: `1px solid ${S.border}`, background: "rgba(255,255,255,.04)",
                    color: S.dim, cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !createTitle.trim()}
                  className="btn"
                  style={{ padding: "8px 22px", fontSize: 13, borderRadius: 8 }}
                >
                  {creating ? "Creating…" : `Create ${createType === "task" ? "Task" : createType === "event" ? "Event" : createType === "meeting" ? "Meeting" : "Mission"}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
