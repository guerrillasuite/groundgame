"use client";

import { useState, useTransition, useRef, useEffect, FormEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { COLOR_FAMILIES, SYSTEM_TYPE_FAMILIES, getFamilyByKey, type ColorFamily } from "@/lib/sitrep-colors";

// ── Types ──────────────────────────────────────────────────────────────────────

type Assignment = { user_id: string; role: string };

export type SitRepItem = {
  id: string;
  item_type: string;
  title: string;
  description: string | null;
  location: string | null;
  location_address: string | null;
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
type User   = { id: string; name: string; email: string };
type CreateType = "task" | "event" | "meeting" | "mission";

export type Props = {
  initialItems: SitRepItem[];
  missions: Mission[];
  users: User[];
  currentUserId: string;
  hasMissions?: boolean;
  typeColors?: Record<string, string>;
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

function isUrgentOrOverdue(item: SitRepItem): boolean {
  if (item.status === "done" || item.status === "cancelled") return false;
  const ed = effectiveDate(item);
  if (!ed) return false;
  if (hasExplicitTime(ed)) {
    return new Date(ed).getTime() < Date.now() + 12 * 60 * 60 * 1000;
  }
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

  if (dateStr === today)    return `Today${timeLabel}`;
  if (dateStr === tomorrow) return `Tomorrow${timeLabel}`;

  const d = new Date(dateStr + "T00:00:00");
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString("en-US", opts) + timeLabel;
}

// ── Color helpers ──────────────────────────────────────────────────────────────

function getItemFamily(item: SitRepItem, typeColors?: Record<string, string>): ColorFamily {
  const key = typeColors?.[item.item_type] ?? SYSTEM_TYPE_FAMILIES[item.item_type] ?? "blue";
  return getFamilyByKey(key) ?? COLOR_FAMILIES[0];
}

const TYPE_LABEL: Record<string, string> = { task: "TASK", event: "EVENT", meeting: "MTG" };

// ── Grouping ───────────────────────────────────────────────────────────────────

type Group = { key: string; label: string; color: string; items: SitRepItem[] };

function groupItems(items: SitRepItem[]): Group[] {
  const today   = todayStr();
  const tomorrow = tomorrowStr();
  const weekEnd  = weekEndStr();

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
    if (ds < today)      { buckets.overdue.push(item); continue; }
    if (ds === today)    { buckets.today.push(item); continue; }
    if (ds === tomorrow) { buckets.tomorrow.push(item); continue; }
    if (ds <= weekEnd)   { buckets.week.push(item); continue; }
    buckets.later.push(item);
  }

  const muted = "rgb(100 116 139)";
  const result: Group[] = [];
  if (buckets.overdue.length)   result.push({ key: "overdue",   label: "Overdue",   color: "rgb(239 68 68)",  items: buckets.overdue });
  if (buckets.today.length)     result.push({ key: "today",     label: "Today",     color: "rgb(245 158 11)", items: buckets.today });
  if (buckets.tomorrow.length)  result.push({ key: "tomorrow",  label: "Tomorrow",  color: muted,             items: buckets.tomorrow });
  if (buckets.week.length)      result.push({ key: "week",      label: "This Week", color: muted,             items: buckets.week });
  if (buckets.later.length)     result.push({ key: "later",     label: "Later",     color: muted,             items: buckets.later });
  if (buckets.nodate.length)    result.push({ key: "nodate",    label: "No Date",   color: muted,             items: buckets.nodate });
  if (buckets.done.length)      result.push({ key: "done",      label: "Done",      color: "rgb(34 197 94)",  items: buckets.done });
  if (buckets.cancelled.length) result.push({ key: "cancelled", label: "Cancelled", color: muted,             items: buckets.cancelled });
  return result;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function TypeBadge({ type, family, isDone }: { type: string; family: ColorFamily; isDone: boolean }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 800, letterSpacing: "0.09em",
      padding: "2px 7px", borderRadius: 5, flexShrink: 0,
      background: isDone ? "rgba(255,255,255,.22)" : family.shades[1],
      color: "#fff",
      boxShadow: isDone ? "none" : `0 1px 6px ${family.shades[1]}55`,
    }}>
      {TYPE_LABEL[type] ?? type.toUpperCase()}
    </span>
  );
}

function PriorityBadge({ priority, isDone }: { priority: string; isDone: boolean }) {
  const cfg = isDone
    ? {
        urgent: { label: "!! URGENT", bg: "rgba(220,38,38,.28)",  color: "#fca5a5", glow: "none" },
        high:   { label: "HIGH",      bg: "rgba(245,158,11,.25)", color: "#fde68a", glow: "none" },
      }
    : {
        urgent: { label: "!! URGENT", bg: "rgba(254,226,226,.92)", color: "#991b1b", glow: "0 0 8px rgba(239,68,68,.3)" },
        high:   { label: "HIGH",      bg: "rgba(254,243,199,.92)", color: "#78350f", glow: "0 0 8px rgba(245,158,11,.25)" },
      };
  const c = cfg[priority as keyof typeof cfg];
  if (!c) return null;
  return (
    <span style={{
      fontSize: 9, fontWeight: 800, letterSpacing: "0.06em",
      padding: "2px 7px", borderRadius: 5,
      background: c.bg, color: c.color, flexShrink: 0,
      boxShadow: c.glow,
    }}>
      {c.label}
    </span>
  );
}

function CheckCircle({
  item, family, onToggle, pending,
}: { item: SitRepItem; family: ColorFamily; onToggle: () => void; pending: boolean }) {
  const done      = item.status === "done";
  const confirmed = item.status === "confirmed";
  const cancelled = item.status === "cancelled";

  return (
    <button
      onClick={onToggle}
      disabled={pending || cancelled}
      title={done ? "Mark open" : "Mark done"}
      style={{
        width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
        border: done
          ? "2px solid rgba(255,255,255,.6)"
          : cancelled
            ? "2px solid rgba(0,0,0,.14)"
            : `2px solid ${family.shades[2]}`,
        background: done
          ? "rgba(255,255,255,.24)"
          : confirmed
            ? family.shades[2]
            : "transparent",
        cursor: cancelled ? "default" : "pointer",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, fontWeight: 800,
        color: done ? "#fff" : "transparent",
        transition: "all .15s ease",
        padding: 0,
        opacity: pending ? 0.5 : 1,
        boxShadow: !done && !cancelled ? `0 0 0 3px ${family.shades[2]}22` : "none",
      }}
    >
      {done ? "✓" : ""}
    </button>
  );
}

function UserDot({ name }: { name: string }) {
  const initials = name.trim().split(/\s+/).map((p) => p[0] ?? "").filter(Boolean).slice(0, 2).join("").toUpperCase();
  const hue = Math.abs(name.charCodeAt(0) * 37 + (name.charCodeAt(1) || 0) * 17) % 360;
  return (
    <span title={name} style={{
      width: 22, height: 22, borderRadius: "50%",
      background: `hsl(${hue},50%,30%)`,
      border: `1.5px solid hsl(${hue},55%,44%)`,
      boxShadow: `0 0 0 2px hsl(${hue},55%,60%)20`,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      fontSize: 9, fontWeight: 700, color: "#fff", flexShrink: 0,
    }}>
      {initials || "?"}
    </span>
  );
}

function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "5px 13px", borderRadius: 20, fontSize: 12, fontWeight: 600,
        border: active
          ? "1px solid color-mix(in srgb, var(--gg-primary, #2563eb) 50%, transparent)"
          : "1px solid rgba(255,255,255,.07)",
        background: active
          ? "color-mix(in srgb, var(--gg-primary, #2563eb) 18%, transparent)"
          : "rgba(255,255,255,.03)",
        color: active
          ? "color-mix(in srgb, var(--gg-primary, #2563eb) 90%, #fff)"
          : "rgb(100 116 139)",
        cursor: "pointer",
        transition: "all .12s ease",
        boxShadow: active
          ? "0 0 12px color-mix(in srgb, var(--gg-primary, #2563eb) 22%, transparent)"
          : "none",
      }}
    >
      {children}
    </button>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function SitRepPanel({ initialItems, missions, users, currentUserId, hasMissions, typeColors }: Props) {
  const pathname   = usePathname();
  const isCalendar = !!pathname?.includes("/calendar");

  const [items, setItems]               = useState<SitRepItem[]>(initialItems);
  const [scope, setScope]               = useState<"mine" | "all">("mine");
  const [typeFilter, setTypeFilter]     = useState<"all" | "task" | "event" | "meeting">("all");
  const [statusFilter, setStatusFilter] = useState<"active" | "done" | "all">("active");

  const [quickTitle, setQuickTitle] = useState("");
  const [quickDate,  setQuickDate]  = useState("");
  const [addPending, startAdd]      = useTransition();
  const [togglePending, setTogglePending] = useState<Record<string, boolean>>({});

  const [showCreate,       setShowCreate]       = useState(false);
  const [createType,       setCreateType]       = useState<CreateType>("task");
  const [createTitle,      setCreateTitle]      = useState("");
  const [createDesc,       setCreateDesc]       = useState("");
  const [createPriority,   setCreatePriority]   = useState("normal");
  const [createDueDate,    setCreateDueDate]    = useState("");
  const [createStartAt,    setCreateStartAt]    = useState("");
  const [createEndAt,      setCreateEndAt]      = useState("");
  const [createIsAllDay,   setCreateIsAllDay]   = useState(false);
  const [createAgenda,     setCreateAgenda]     = useState("");
  const [createMissionId,  setCreateMissionId]  = useState("");
  const [createVisibility, setCreateVisibility] = useState("assignee_only");
  const [createAssignees,  setCreateAssignees]  = useState<string[]>([]);
  const [createStatus,     setCreateStatus]     = useState("planning");
  const [creating,         setCreating]         = useState(false);
  const [createError,      setCreateError]      = useState("");

  const [showNewMenu, setShowNewMenu] = useState(false);
  const newBtnRef  = useRef<HTMLButtonElement>(null);
  const newMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showNewMenu) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!newBtnRef.current?.contains(t) && !newMenuRef.current?.contains(t)) setShowNewMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showNewMenu]);

  const openItems    = items.filter((i) => i.status !== "done" && i.status !== "cancelled");
  const overdueItems = items.filter((i) => isOverdue(i));

  const userMap    = new Map(users.map((u) => [u.id, u]));
  const missionMap = new Map(missions.map((m) => [m.id, m]));

  let filtered = items;
  if (scope === "mine") {
    filtered = filtered.filter(
      (i) => i.created_by === currentUserId || i.sitrep_assignments.some((a) => a.user_id === currentUserId)
    );
  }
  if (typeFilter !== "all") filtered = filtered.filter((i) => i.item_type === typeFilter);
  if (statusFilter === "active") filtered = filtered.filter((i) => i.status !== "done" && i.status !== "cancelled");
  else if (statusFilter === "done") filtered = filtered.filter((i) => i.status === "done");

  const groups = groupItems(filtered);

  // ── Actions ──────────────────────────────────────────────────────────────────

  async function handleToggle(item: SitRepItem) {
    if (item.status === "cancelled") return;
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
    const title   = quickTitle.trim();
    const dueDate = quickDate || null;
    setQuickTitle(""); setQuickDate("");
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
          description: null, location: null, location_address: null,
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
    setShowCreate(true); setShowNewMenu(false);
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!createTitle.trim()) { setCreateError("Title is required."); return; }
    setCreating(true); setCreateError("");

    const endpoint = createType === "mission" ? "/api/crm/sitrep/missions" : "/api/crm/sitrep/items";
    const body: Record<string, any> = {
      title: createTitle.trim(),
      description: createDesc || null,
      visibility: createVisibility,
    };

    if (createType === "mission") {
      body.status   = createStatus;
      body.due_date = createDueDate || null;
    } else {
      body.item_type  = createType;
      body.mission_id = createMissionId || null;
      if (createAssignees.length) body.assignee_ids = createAssignees;
      if (createType === "task") {
        body.priority = createPriority;
        body.due_date = createDueDate || null;
        body.status   = "open";
      } else {
        body.start_at   = createStartAt || null;
        body.end_at     = createEndAt   || null;
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
          description: createDesc || null, location: null, location_address: null,
          due_date:  createType === "task" ? (createDueDate || null) : null,
          start_at:  createType !== "task" ? (createStartAt || null) : null,
          end_at:    createType !== "task" ? (createEndAt   || null) : null,
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

  // ── Style constants ───────────────────────────────────────────────────────────

  const S = {
    bg:       "rgb(10 13 20)",
    surface:  "rgb(14 18 28)",
    card:     "rgb(20 25 38)",
    border:   "rgba(255,255,255,.07)",
    text:     "rgb(236 240 245)",
    dim:      "rgb(100 116 139)",
    dimBright:"rgb(148 163 184)",
  } as const;

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px", borderRadius: 9,
    background: "rgba(255,255,255,.05)",
    border: "1px solid rgba(255,255,255,.1)",
    color: S.text, fontSize: 13, outline: "none",
    transition: "border-color .15s, box-shadow .15s",
  };

  const focusInput = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    e.currentTarget.style.borderColor = "color-mix(in srgb, var(--gg-primary, #2563eb) 55%, transparent)";
    e.currentTarget.style.boxShadow   = "0 0 0 3px color-mix(in srgb, var(--gg-primary, #2563eb) 16%, transparent)";
  };
  const blurInput = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    e.currentTarget.style.borderColor = "rgba(255,255,255,.1)";
    e.currentTarget.style.boxShadow   = "none";
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="stack" style={{ maxWidth: 900 }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }}>SitRep</h1>
          <div style={{ display: "flex", gap: 16, marginTop: 6, flexWrap: "wrap", alignItems: "baseline" }}>
            <span style={{ fontSize: 13, color: S.dimBright }}>
              <span style={{ fontWeight: 800, fontSize: 18, color: S.text, marginRight: 3 }}>{openItems.length}</span>open
            </span>
            {overdueItems.length > 0 && (
              <span style={{ fontSize: 13, color: "rgba(239,68,68,.7)" }}>
                <span style={{ fontWeight: 800, fontSize: 18, color: "rgb(252 165 165)", marginRight: 3 }}>{overdueItems.length}</span>overdue
              </span>
            )}
            <span style={{ fontSize: 13, color: S.dimBright }}>
              <span style={{ fontWeight: 600, fontSize: 15, color: S.text, marginRight: 3 }}>{items.length}</span>total
            </span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {hasMissions && (
            <Link href="/crm/sitrep/missions" style={{
              padding: "7px 15px", fontSize: 13, borderRadius: 10,
              border: "1px solid rgba(99,102,241,.35)",
              background: "rgba(99,102,241,.1)",
              boxShadow: "0 0 16px rgba(99,102,241,.18), inset 0 1px 0 rgba(255,255,255,.07)",
              color: "#a5b4fc", textDecoration: "none",
              display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600,
              transition: "all .15s ease",
            }}>
              <span>⬡</span> Missions
            </Link>
          )}
          <div style={{ position: "relative" }}>
            <button
              ref={newBtnRef}
              onClick={() => setShowNewMenu((v) => !v)}
              style={{
                padding: "7px 16px", fontSize: 13, fontWeight: 700, borderRadius: 10,
                background: "linear-gradient(135deg, var(--gg-primary, #2563eb), color-mix(in srgb, var(--gg-primary, #2563eb) 68%, #7c3aed))",
                boxShadow: "0 2px 14px color-mix(in srgb, var(--gg-primary, #2563eb) 42%, transparent), inset 0 1px 0 rgba(255,255,255,.18)",
                border: "none", color: "#fff",
                display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
                transition: "all .15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.boxShadow = "0 5px 22px color-mix(in srgb, var(--gg-primary, #2563eb) 55%, transparent), inset 0 1px 0 rgba(255,255,255,.2)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "";
                e.currentTarget.style.boxShadow = "0 2px 14px color-mix(in srgb, var(--gg-primary, #2563eb) 42%, transparent), inset 0 1px 0 rgba(255,255,255,.18)";
              }}
            >
              + New <span style={{ opacity: 0.7, fontSize: 10 }}>▾</span>
            </button>

            {showNewMenu && (
              <div ref={newMenuRef} style={{
                position: "absolute", top: "calc(100% + 6px)", right: 0,
                background: "rgba(16,20,32,.97)", backdropFilter: "blur(20px)",
                border: "1px solid rgba(255,255,255,.1)", borderRadius: 14, padding: 5,
                zIndex: 100, minWidth: 168,
                boxShadow: "0 16px 48px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.04), inset 0 1px 0 rgba(255,255,255,.06)",
              }}>
                {([
                  { type: "task",    icon: "○", label: "Task",    hoverBg: "rgba(59,130,246,.14)"  },
                  { type: "event",   icon: "◆", label: "Event",   hoverBg: "rgba(139,92,246,.14)"  },
                  { type: "meeting", icon: "◉", label: "Meeting", hoverBg: "rgba(16,185,129,.14)"  },
                  { type: "mission", icon: "⬡", label: "Mission", hoverBg: "rgba(99,102,241,.14)"  },
                ] as const).map((opt) => (
                  <button key={opt.type} onClick={() => openCreate(opt.type)} style={{
                    display: "flex", alignItems: "center", gap: 10, width: "100%",
                    padding: "9px 13px", background: "none", border: "none",
                    color: S.text, cursor: "pointer", borderRadius: 9, fontSize: 13,
                    textAlign: "left", transition: "background .1s",
                  }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = opt.hoverBg)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                  >
                    <span style={{ opacity: 0.6, width: 16, textAlign: "center", fontSize: 14 }}>{opt.icon}</span>
                    <span style={{ fontWeight: 500 }}>{opt.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Quick-add bar ── */}
      <form onSubmit={handleQuickAdd} style={{
        display: "flex", gap: 10, alignItems: "center",
        padding: "12px 16px",
        background: "rgba(255,255,255,.04)",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(255,255,255,.09)",
        borderRadius: 16,
        boxShadow: "0 4px 20px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.07)",
        transition: "border-color .15s, box-shadow .15s",
      }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = "color-mix(in srgb, var(--gg-primary, #2563eb) 55%, transparent)";
          e.currentTarget.style.boxShadow   = "0 4px 20px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.07), 0 0 0 3px color-mix(in srgb, var(--gg-primary, #2563eb) 16%, transparent)";
        }}
        onBlur={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          e.currentTarget.style.borderColor = "rgba(255,255,255,.09)";
          e.currentTarget.style.boxShadow   = "0 4px 20px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.07)";
        }}
      >
        <span style={{ fontSize: 18, opacity: 0.28, flexShrink: 0, lineHeight: 1 }}>○</span>
        <input
          type="text" value={quickTitle}
          onChange={(e) => setQuickTitle(e.target.value)}
          placeholder="Add a task…"
          style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: S.text, fontSize: 14, minWidth: 0 }}
        />
        <input
          type="date" value={quickDate}
          onChange={(e) => setQuickDate(e.target.value)}
          style={{ background: "transparent", border: "none", outline: "none", color: quickDate ? S.text : S.dim, fontSize: 12, cursor: "pointer", flexShrink: 0 }}
        />
        <button type="submit" disabled={!quickTitle.trim() || addPending} style={{
          padding: "6px 16px", borderRadius: 9, fontSize: 12, fontWeight: 700, flexShrink: 0,
          background: quickTitle.trim()
            ? "linear-gradient(135deg, var(--gg-primary, #2563eb), color-mix(in srgb, var(--gg-primary, #2563eb) 68%, #7c3aed))"
            : "rgba(255,255,255,.06)",
          boxShadow: quickTitle.trim()
            ? "0 2px 10px color-mix(in srgb, var(--gg-primary, #2563eb) 38%, transparent)"
            : "none",
          border: "none",
          color: quickTitle.trim() ? "#fff" : S.dim,
          cursor: quickTitle.trim() ? "pointer" : "default",
          transition: "all .15s ease",
        }}>
          {addPending ? "…" : "Add"}
        </button>
      </form>

      {/* ── Filter bar + List/Calendar toggle ── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <div style={{ display: "flex", gap: 3 }}>
          <FilterPill active={scope === "mine"} onClick={() => setScope("mine")}>Mine</FilterPill>
          <FilterPill active={scope === "all"}  onClick={() => setScope("all")}>All</FilterPill>
        </div>
        <div style={{ width: 1, height: 18, background: "rgba(255,255,255,.1)", margin: "0 2px" }} />
        <div style={{ display: "flex", gap: 3 }}>
          {(["all","task","event","meeting"] as const).map((t) => (
            <FilterPill key={t} active={typeFilter === t} onClick={() => setTypeFilter(t)}>
              {t === "all" ? "All Types" : t === "task" ? "Tasks" : t === "event" ? "Events" : "Meetings"}
            </FilterPill>
          ))}
        </div>
        <div style={{ width: 1, height: 18, background: "rgba(255,255,255,.1)", margin: "0 2px" }} />
        <div style={{ display: "flex", gap: 3 }}>
          <FilterPill active={statusFilter === "active"} onClick={() => setStatusFilter("active")}>Active</FilterPill>
          <FilterPill active={statusFilter === "done"}   onClick={() => setStatusFilter("done")}>Done</FilterPill>
          <FilterPill active={statusFilter === "all"}    onClick={() => setStatusFilter("all")}>All</FilterPill>
        </div>

        {/* List / Calendar toggle */}
        <div style={{ marginLeft: "auto", display: "flex", gap: 2, padding: 3, borderRadius: 11, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)" }}>
          <Link href="/crm/sitrep" style={{
            padding: "5px 14px", fontSize: 12, fontWeight: 600, borderRadius: 8,
            background: !isCalendar ? "color-mix(in srgb, var(--gg-primary, #2563eb) 22%, rgb(20 25 38))" : "transparent",
            color: !isCalendar ? "color-mix(in srgb, var(--gg-primary, #2563eb) 90%, #fff)" : S.dim,
            textDecoration: "none", display: "flex", alignItems: "center", gap: 5,
            border: !isCalendar ? "1px solid color-mix(in srgb, var(--gg-primary, #2563eb) 35%, transparent)" : "1px solid transparent",
            boxShadow: !isCalendar ? "0 0 12px color-mix(in srgb, var(--gg-primary, #2563eb) 18%, transparent)" : "none",
            transition: "all .12s",
          }}>☰ List</Link>
          <Link href="/crm/sitrep/calendar" style={{
            padding: "5px 14px", fontSize: 12, fontWeight: 600, borderRadius: 8,
            background: isCalendar ? "color-mix(in srgb, var(--gg-primary, #2563eb) 22%, rgb(20 25 38))" : "transparent",
            color: isCalendar ? "color-mix(in srgb, var(--gg-primary, #2563eb) 90%, #fff)" : S.dim,
            textDecoration: "none", display: "flex", alignItems: "center", gap: 5,
            border: isCalendar ? "1px solid color-mix(in srgb, var(--gg-primary, #2563eb) 35%, transparent)" : "1px solid transparent",
            boxShadow: isCalendar ? "0 0 12px color-mix(in srgb, var(--gg-primary, #2563eb) 18%, transparent)" : "none",
            transition: "all .12s",
          }}>◫ Cal</Link>
        </div>
      </div>

      {/* ── Item list ── */}
      {groups.length === 0 ? (
        <div style={{
          padding: "64px 0", textAlign: "center",
          background: "radial-gradient(ellipse at 50% 40%, color-mix(in srgb, var(--gg-primary, #2563eb) 8%, transparent) 0%, transparent 70%)",
          borderRadius: 20, border: "1px solid rgba(255,255,255,.06)",
        }}>
          <div style={{ fontSize: 44, marginBottom: 16, opacity: 0.22, lineHeight: 1 }}>✓</div>
          <div style={{ fontWeight: 800, fontSize: 16, color: S.text }}>All clear.</div>
          <div style={{ fontSize: 13, marginTop: 8, color: S.dim, maxWidth: 280, margin: "8px auto 0", lineHeight: 1.6 }}>
            Nothing on the board. Add a task above or use{" "}
            <span style={{ color: S.text, fontWeight: 600 }}>+ New</span> to schedule an event or meeting.
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 24 }}>
          {groups.map((group) => (
            <div key={group.key}>
              {/* Section header — glass pill */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 7,
                  padding: "3px 10px 3px 8px", borderRadius: 20, flexShrink: 0,
                  background: `${group.color}12`,
                  border: `1px solid ${group.color}30`,
                  backdropFilter: "blur(8px)",
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: group.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.09em", color: group.color, textTransform: "uppercase" }}>
                    {group.label}
                  </span>
                  <span style={{
                    fontSize: 10, fontWeight: 700, color: group.color,
                    background: `${group.color}1f`, borderRadius: 10, padding: "1px 6px", marginLeft: 1,
                  }}>
                    {group.items.length}
                  </span>
                </div>
                <div style={{ flex: 1, height: 1, background: `linear-gradient(to right, ${group.color}35, transparent)` }} />
              </div>

              {/* Items */}
              <div style={{ display: "grid", gap: 5 }}>
                {group.items.map((item) => {
                  const isDone      = item.status === "done";
                  const isCancelled = item.status === "cancelled";
                  const isConfirmed = item.status === "confirmed";
                  const urgent      = isUrgentOrOverdue(item);
                  const family      = getItemFamily(item, typeColors);
                  const mission     = item.mission_id ? missionMap.get(item.mission_id) : undefined;
                  const dateLabel   = fmtDate(item);
                  const assignees   = item.sitrep_assignments
                    .slice(0, 4)
                    .map((a) => userMap.get(a.user_id))
                    .filter(Boolean) as User[];

                  const cardBg     = isDone ? family.shades[1] : family.shades[3];
                  const cardBorder = isDone ? `1px solid ${family.shades[0]}` : `1px solid ${family.shades[2]}55`;
                  const textColor  = isDone ? "#fff" : "#0f172a";
                  const dateColor  = urgent && !isDone ? "#991b1b" : isDone ? "rgba(255,255,255,.72)" : "#1e293b";
                  const accentCol  = isDone ? family.shades[0] : family.shades[2];
                  const restShadow = `inset 3px 0 0 0 ${accentCol}, 0 2px 6px rgba(0,0,0,.22), 0 0 0 1px ${accentCol}18`;
                  const hoverShadow= `inset 3px 0 0 0 ${accentCol}, 0 8px 24px rgba(0,0,0,.32), 0 0 0 1px ${accentCol}44, 0 0 22px ${accentCol}1c`;

                  return (
                    <div
                      key={item.id}
                      style={{
                        display: "flex", alignItems: "center", gap: 12,
                        padding: "12px 16px",
                        background: cardBg,
                        border: cardBorder,
                        borderRadius: 12,
                        opacity: isCancelled ? 0.48 : 1,
                        boxShadow: restShadow,
                        transition: "transform .15s ease, box-shadow .15s ease",
                      }}
                      onMouseEnter={(e) => {
                        if (!isCancelled) {
                          e.currentTarget.style.transform = "translateY(-2px)";
                          e.currentTarget.style.boxShadow = hoverShadow;
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = "";
                        e.currentTarget.style.boxShadow = restShadow;
                      }}
                    >
                      <CheckCircle item={item} family={family} onToggle={() => handleToggle(item)} pending={!!togglePending[item.id]} />

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <TypeBadge type={item.item_type} family={family} isDone={isDone} />
                          {isConfirmed && (
                            <span style={{
                              fontSize: 9, fontWeight: 800, letterSpacing: "0.07em",
                              padding: "2px 6px", borderRadius: 4, flexShrink: 0,
                              background: isDone ? "rgba(255,255,255,.18)" : "rgba(16,185,129,.18)",
                              color: isDone ? "#fff" : "#059669",
                              border: isDone ? "none" : "1px solid rgba(16,185,129,.3)",
                            }}>CONFIRMED</span>
                          )}
                          <Link
                            href={`/crm/sitrep/${item.id}`}
                            style={{
                              fontSize: 15, fontWeight: 600, color: textColor,
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                              textDecoration: isDone ? "line-through" : "none",
                              opacity: isDone ? 0.72 : 1,
                              flex: 1, minWidth: 0, letterSpacing: "-0.01em",
                            }}
                          >
                            {item.title}
                          </Link>
                        </div>
                        {mission && (
                          <div style={{ marginTop: 4 }}>
                            <span style={{
                              fontSize: 11, fontWeight: 500,
                              background: isDone ? "rgba(255,255,255,.16)" : `${family.shades[1]}22`,
                              color: isDone ? "rgba(255,255,255,.82)" : family.shades[1],
                              borderRadius: 5, padding: "1px 8px",
                            }}>⬡ {mission.title}</span>
                          </div>
                        )}
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                        {dateLabel && (
                          <span suppressHydrationWarning style={{
                            fontSize: 12, fontWeight: urgent && !isDone ? 700 : 500,
                            color: dateColor, whiteSpace: "nowrap",
                            background: urgent && !isDone ? "rgba(239,68,68,.12)" : "transparent",
                            padding: urgent && !isDone ? "2px 7px" : "0",
                            borderRadius: urgent && !isDone ? 6 : 0,
                            border: urgent && !isDone ? "1px solid rgba(239,68,68,.2)" : "none",
                          }}>
                            {dateLabel}
                          </span>
                        )}
                        {item.priority && (item.priority === "urgent" || item.priority === "high") && (
                          <PriorityBadge priority={item.priority} isDone={isDone} />
                        )}
                        {assignees.length > 0 && (
                          <div style={{ display: "flex", gap: 3 }}>
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
        <div style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: "rgba(0,0,0,.72)", backdropFilter: "blur(8px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
        }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}
        >
          <div style={{
            width: "min(560px, 100%)",
            background: "rgba(15,19,30,.98)", backdropFilter: "blur(24px)",
            border: "1px solid rgba(255,255,255,.1)", borderRadius: 20,
            boxShadow: "0 32px 80px rgba(0,0,0,.7), 0 0 0 1px rgba(255,255,255,.04), inset 0 1px 0 rgba(255,255,255,.08)",
            overflow: "hidden", maxHeight: "90vh", display: "flex", flexDirection: "column",
          }}>
            {/* Header with type-color gradient */}
            <div style={{
              padding: "20px 24px 16px",
              background: createType === "task"
                ? "linear-gradient(160deg, rgba(59,130,246,.16) 0%, transparent 65%)"
                : createType === "event"
                  ? "linear-gradient(160deg, rgba(139,92,246,.16) 0%, transparent 65%)"
                  : createType === "meeting"
                    ? "linear-gradient(160deg, rgba(16,185,129,.16) 0%, transparent 65%)"
                    : "linear-gradient(160deg, rgba(99,102,241,.16) 0%, transparent 65%)",
              borderBottom: "1px solid rgba(255,255,255,.07)",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, letterSpacing: "-0.02em" }}>
                  {createType === "task" ? "New Task" : createType === "event" ? "New Event" : createType === "meeting" ? "New Meeting" : "New Mission"}
                </h2>
                <button onClick={() => setShowCreate(false)} style={{
                  background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.1)",
                  color: S.dimBright, cursor: "pointer", fontSize: 14, padding: "4px 9px",
                  borderRadius: 8, lineHeight: 1, transition: "all .12s",
                }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,.14)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,.08)")}
                >✕</button>
              </div>

              {createType !== "mission" && (
                <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,.04)", borderRadius: 11, padding: 3 }}>
                  {(["task","event","meeting"] as const).map((t) => {
                    const fam    = getItemFamily({ item_type: t } as any, typeColors);
                    const active = createType === t;
                    return (
                      <button key={t} onClick={() => setCreateType(t)} style={{
                        flex: 1, padding: "7px 0", borderRadius: 8, fontSize: 12, fontWeight: 700,
                        border: active ? `1px solid ${fam.shades[2]}45` : "1px solid transparent",
                        background: active ? fam.shades[3] : "transparent",
                        color: active ? fam.shades[1] : S.dim,
                        cursor: "pointer", transition: "all .12s",
                        boxShadow: active ? `0 2px 10px ${fam.shades[2]}30` : "none",
                      }}>
                        {t === "task" ? "Task" : t === "event" ? "Event" : "Meeting"}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ overflowY: "auto", flex: 1 }}>
              <form onSubmit={handleCreate} style={{ padding: "20px 24px", display: "grid", gap: 16 }}>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, display: "block", marginBottom: 6, color: S.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                    Title <span style={{ color: "rgb(239 68 68)" }}>*</span>
                  </label>
                  <input type="text" value={createTitle} onChange={(e) => setCreateTitle(e.target.value)}
                    placeholder={createType === "task" ? "What needs to be done?" : createType === "event" ? "Event name…" : createType === "meeting" ? "Meeting subject…" : "Mission title…"}
                    autoFocus style={inputStyle} onFocus={focusInput} onBlur={blurInput} />
                </div>

                {createType === "task" && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, display: "block", marginBottom: 6, color: S.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>Priority</label>
                      <select value={createPriority} onChange={(e) => setCreatePriority(e.target.value)} style={inputStyle} onFocus={focusInput} onBlur={blurInput}>
                        <option value="low">Low</option><option value="normal">Normal</option>
                        <option value="high">High</option><option value="urgent">Urgent</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, display: "block", marginBottom: 6, color: S.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>Due Date</label>
                      <input type="date" value={createDueDate} onChange={(e) => setCreateDueDate(e.target.value)} style={inputStyle} onFocus={focusInput} onBlur={blurInput} />
                    </div>
                  </div>
                )}

                {(createType === "event" || createType === "meeting") && (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, display: "block", marginBottom: 6, color: S.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>Start</label>
                        <input type="datetime-local" value={createStartAt} onChange={(e) => setCreateStartAt(e.target.value)} style={inputStyle} onFocus={focusInput} onBlur={blurInput} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, display: "block", marginBottom: 6, color: S.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>End</label>
                        <input type="datetime-local" value={createEndAt} onChange={(e) => setCreateEndAt(e.target.value)} style={inputStyle} onFocus={focusInput} onBlur={blurInput} />
                      </div>
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13, cursor: "pointer", color: S.dimBright }}>
                      <input type="checkbox" checked={createIsAllDay} onChange={(e) => setCreateIsAllDay(e.target.checked)}
                        style={{ width: 16, height: 16, accentColor: "var(--gg-primary, #2563eb)", cursor: "pointer" }} />
                      All day
                    </label>
                    {createType === "meeting" && (
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, display: "block", marginBottom: 6, color: S.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>Agenda</label>
                        <textarea value={createAgenda} onChange={(e) => setCreateAgenda(e.target.value)}
                          rows={3} placeholder="Meeting agenda…"
                          style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} onFocus={focusInput} onBlur={blurInput} />
                      </div>
                    )}
                  </>
                )}

                {createType === "mission" && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, display: "block", marginBottom: 6, color: S.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>Status</label>
                      <select value={createStatus} onChange={(e) => setCreateStatus(e.target.value)} style={inputStyle} onFocus={focusInput} onBlur={blurInput}>
                        <option value="planning">Planning</option><option value="active">Active</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, display: "block", marginBottom: 6, color: S.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>Due Date</label>
                      <input type="date" value={createDueDate} onChange={(e) => setCreateDueDate(e.target.value)} style={inputStyle} onFocus={focusInput} onBlur={blurInput} />
                    </div>
                  </div>
                )}

                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, display: "block", marginBottom: 6, color: S.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>Description</label>
                  <textarea value={createDesc} onChange={(e) => setCreateDesc(e.target.value)}
                    rows={2} placeholder="Optional notes…"
                    style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} onFocus={focusInput} onBlur={blurInput} />
                </div>

                {createType !== "mission" && missions.length > 0 && (
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, display: "block", marginBottom: 6, color: S.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>Mission (optional)</label>
                    <select value={createMissionId} onChange={(e) => setCreateMissionId(e.target.value)} style={inputStyle} onFocus={focusInput} onBlur={blurInput}>
                      <option value="">— None —</option>
                      {missions.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
                    </select>
                  </div>
                )}

                {createType !== "mission" && users.length > 1 && (
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, display: "block", marginBottom: 8, color: S.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                      {createType === "task" ? "Assignees" : createType === "event" ? "Attendees" : "Participants"}
                    </label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {users.map((u) => {
                        const sel = createAssignees.includes(u.id);
                        return (
                          <button key={u.id} type="button"
                            onClick={() => setCreateAssignees((prev) => sel ? prev.filter((id) => id !== u.id) : [...prev, u.id])}
                            style={{
                              padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 500,
                              border: sel ? "1px solid color-mix(in srgb, var(--gg-primary, #2563eb) 50%, transparent)" : "1px solid rgba(255,255,255,.09)",
                              background: sel ? "color-mix(in srgb, var(--gg-primary, #2563eb) 20%, transparent)" : "rgba(255,255,255,.04)",
                              color: sel ? "color-mix(in srgb, var(--gg-primary, #2563eb) 90%, #fff)" : S.dim,
                              cursor: "pointer", transition: "all .12s",
                              boxShadow: sel ? "0 0 10px color-mix(in srgb, var(--gg-primary, #2563eb) 20%, transparent)" : "none",
                            }}
                          >{u.name || u.email}</button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, display: "block", marginBottom: 6, color: S.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>Visibility</label>
                  <select value={createVisibility} onChange={(e) => setCreateVisibility(e.target.value)} style={inputStyle} onFocus={focusInput} onBlur={blurInput}>
                    <option value="private">Private (only me)</option>
                    <option value="assignee_only">Assignees only</option>
                    <option value="team">Team (all CRM users)</option>
                  </select>
                </div>

                {createError && (
                  <div style={{
                    padding: "9px 14px", borderRadius: 9,
                    background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.25)",
                    color: "rgb(252 165 165)", fontSize: 13,
                  }}>{createError}</div>
                )}

                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 4 }}>
                  <button type="button" onClick={() => setShowCreate(false)} style={{
                    padding: "9px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600,
                    border: "1px solid rgba(255,255,255,.1)", background: "rgba(255,255,255,.05)",
                    color: S.dimBright, cursor: "pointer", transition: "all .12s",
                  }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,.09)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,.05)")}
                  >Cancel</button>
                  <button type="submit" disabled={creating || !createTitle.trim()} style={{
                    padding: "9px 22px", borderRadius: 10, fontSize: 13, fontWeight: 700,
                    background: "linear-gradient(135deg, var(--gg-primary, #2563eb), color-mix(in srgb, var(--gg-primary, #2563eb) 68%, #7c3aed))",
                    boxShadow: "0 2px 14px color-mix(in srgb, var(--gg-primary, #2563eb) 40%, transparent), inset 0 1px 0 rgba(255,255,255,.18)",
                    border: "none", color: "#fff",
                    cursor: creating || !createTitle.trim() ? "default" : "pointer",
                    opacity: creating || !createTitle.trim() ? 0.55 : 1,
                    transition: "all .15s",
                  }}>
                    {creating ? "Creating…" : `Create ${createType === "task" ? "Task" : createType === "event" ? "Event" : createType === "meeting" ? "Meeting" : "Mission"}`}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
