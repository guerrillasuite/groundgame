"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { COLOR_FAMILIES, SYSTEM_TYPE_FAMILIES, getFamilyByKey, type ColorFamily } from "@/lib/sitrep-colors";
import type { SitRepItem, Props } from "../SitRepPanel";

type View = "month" | "week" | "day";

// ── Date utilities ─────────────────────────────────────────────────────────────

function todayStr() { return new Date().toISOString().split("T")[0]; }

function effectiveDate(item: SitRepItem): string | null {
  if (item.item_type === "task") return item.due_date;
  return item.start_at ?? item.due_date;
}

function hasExplicitTime(s: string | null | undefined): boolean {
  if (!s || !s.includes("T")) return false;
  return !s.split("T")[1].startsWith("00:00");
}

function addDays(ds: string, n: number): string {
  const d = new Date(ds + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

function addMonths(ds: string, n: number): string {
  const d = new Date(ds + "T00:00:00");
  d.setMonth(d.getMonth() + n);
  return d.toISOString().split("T")[0];
}

function startOfWeek(ds: string): string {
  const d = new Date(ds + "T00:00:00");
  d.setDate(d.getDate() - d.getDay()); // Sun = 0
  return d.toISOString().split("T")[0];
}

function getMonthGrid(ds: string): string[] {
  const first = new Date(ds.slice(0, 8) + "01T00:00:00");
  const grid = new Date(first);
  grid.setDate(grid.getDate() - first.getDay());
  const days: string[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(grid);
    d.setDate(d.getDate() + i);
    days.push(d.toISOString().split("T")[0]);
  }
  return days;
}

function fmtMonthYear(ds: string): string {
  return new Date(ds + "T00:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" });
}
function fmtWeekRange(ws: string): string {
  const s = new Date(ws + "T00:00:00");
  const e = new Date(addDays(ws, 6) + "T00:00:00");
  return s.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " – " +
    e.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtFullDay(ds: string): string {
  return new Date(ds + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}
function fmtShortDay(ds: string): string {
  return new Date(ds + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
function fmtTime(s: string): string {
  return new Date(s).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}
function fmtDateLabel(item: SitRepItem): string {
  const ed = effectiveDate(item);
  if (!ed) return "";
  const today = todayStr();
  const tomorrow = addDays(today, 1);
  const ds = ed.split("T")[0];
  const prefix = ds === today ? "Today" : ds === tomorrow ? "Tomorrow"
    : new Date(ds + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const time = item.item_type !== "task" && hasExplicitTime(item.start_at) && !item.is_all_day
    ? " " + fmtTime(item.start_at!) : "";
  return prefix + time;
}

// ── Color helpers ──────────────────────────────────────────────────────────────

function getItemFamily(item: SitRepItem, typeColors?: Record<string, string>): ColorFamily {
  const key = typeColors?.[item.item_type] ?? SYSTEM_TYPE_FAMILIES[item.item_type] ?? "blue";
  return getFamilyByKey(key) ?? COLOR_FAMILIES[0];
}

// ── Filter pill ────────────────────────────────────────────────────────────────

function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "5px 13px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer",
        transition: "transform .12s ease, box-shadow .12s ease, filter .12s ease",
        border: active
          ? "1px solid color-mix(in srgb, var(--gg-primary, #2563eb) 50%, transparent)"
          : "1px solid rgba(255,255,255,.07)",
        background: active
          ? "color-mix(in srgb, var(--gg-primary, #2563eb) 18%, transparent)"
          : "rgba(255,255,255,.03)",
        color: active
          ? "color-mix(in srgb, var(--gg-primary, #2563eb) 90%, #fff)"
          : "rgb(100 116 139)",
        boxShadow: active
          ? "0 0 12px color-mix(in srgb, var(--gg-primary, #2563eb) 22%, transparent), 0 2px 6px rgba(0,0,0,.22)"
          : "0 1px 4px rgba(0,0,0,.18)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-1.5px)";
        e.currentTarget.style.boxShadow = active
          ? "0 0 18px color-mix(in srgb, var(--gg-primary, #2563eb) 32%, transparent), 0 4px 14px rgba(0,0,0,.3)"
          : "0 4px 12px rgba(0,0,0,.32)";
        if (!active) e.currentTarget.style.filter = "brightness(1.3)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "";
        e.currentTarget.style.boxShadow = active
          ? "0 0 12px color-mix(in srgb, var(--gg-primary, #2563eb) 22%, transparent), 0 2px 6px rgba(0,0,0,.22)"
          : "0 1px 4px rgba(0,0,0,.18)";
        e.currentTarget.style.filter = "";
      }}
    >{children}</button>
  );
}

// ── Item pill (used in month and week views) ───────────────────────────────────

function ItemPill({
  item, typeColors, onClick,
}: { item: SitRepItem; typeColors?: Record<string, string>; onClick: () => void }) {
  const family = getItemFamily(item, typeColors);
  const isDone = item.status === "done";
  const bg = isDone ? family.shades[1] : family.shades[3];
  const color = isDone ? "#fff" : "#0f172a";
  const time = item.item_type !== "task" && hasExplicitTime(item.start_at) && !item.is_all_day
    ? fmtTime(item.start_at!) + " " : "";

  const accentCol = isDone ? family.shades[0] : family.shades[2];
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={item.title}
      style={{
        display: "block", width: "100%", textAlign: "left",
        padding: "3px 7px", borderRadius: 5, fontSize: 11, fontWeight: 600,
        background: bg, color,
        border: "none", cursor: "pointer",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        textDecoration: isDone ? "line-through" : "none",
        opacity: isDone ? 0.75 : 1,
        boxShadow: `inset 2px 0 0 0 ${accentCol}, 0 1px 3px rgba(0,0,0,.2), 0 0 0 1px color-mix(in srgb, var(--gg-primary, #2563eb) 18%, transparent)`,
        transition: "all .12s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = `inset 2px 0 0 0 ${accentCol}, 0 3px 10px rgba(0,0,0,.3), 0 0 10px ${accentCol}22, 0 0 0 1px color-mix(in srgb, var(--gg-primary, #2563eb) 36%, transparent), 0 0 8px color-mix(in srgb, var(--gg-primary, #2563eb) 16%, transparent)`;
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = `inset 2px 0 0 0 ${accentCol}, 0 1px 3px rgba(0,0,0,.2), 0 0 0 1px color-mix(in srgb, var(--gg-primary, #2563eb) 18%, transparent)`;
        e.currentTarget.style.transform = "";
      }}
    >
      {time}{item.title}
    </button>
  );
}

// ── Item details modal ─────────────────────────────────────────────────────────

function ItemDetailsModal({
  item, typeColors, users, missions, onClose, onToggle, togglePending,
}: {
  item: SitRepItem;
  typeColors?: Record<string, string>;
  users: Map<string, { id: string; name: string; email: string }>;
  missions: Map<string, { id: string; title: string; status: string }>;
  onClose: () => void;
  onToggle: (item: SitRepItem) => void;
  togglePending: boolean;
}) {
  const family = getItemFamily(item, typeColors);
  const isDone = item.status === "done";
  const isConfirmed = item.status === "confirmed";
  const isCancelled = item.status === "cancelled";
  const cardBg = isDone ? family.shades[1] : family.shades[3];
  const textColor = isDone ? "#fff" : "#0f172a";
  const dimColor = isDone ? "rgba(255,255,255,.7)" : "#475569";
  const mission = item.mission_id ? missions.get(item.mission_id) : undefined;
  const assignees = item.sitrep_assignments
    .map((a) => users.get(a.user_id))
    .filter(Boolean) as { id: string; name: string; email: string }[];

  const S = {
    surface: "rgb(18 23 33)",
    card:    "rgb(28 36 48)",
    border:  "rgb(43 53 67)",
    text:    "rgb(238 242 246)",
    dim:     "rgb(160 174 192)",
  } as const;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 300,
      background: "rgba(0,0,0,.65)", backdropFilter: "blur(3px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: "min(520px, 100%)",
        background: S.card, border: `1px solid ${S.border}`,
        borderRadius: 16, overflow: "hidden",
        boxShadow: "0 24px 64px rgba(0,0,0,.55)",
        maxHeight: "90vh", display: "flex", flexDirection: "column",
      }}>
        {/* Color header stripe */}
        <div style={{
          background: cardBg, padding: "16px 20px",
          display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
              <span style={{
                fontSize: 10, fontWeight: 800, letterSpacing: "0.07em",
                padding: "2px 6px", borderRadius: 4,
                background: isDone ? "rgba(0,0,0,.28)" : family.shades[1],
                color: "#fff", flexShrink: 0,
              }}>
                {(item.item_type === "task" ? "TASK" : item.item_type === "event" ? "EVENT" : item.item_type === "meeting" ? "MTG" : item.item_type.toUpperCase())}
              </span>
              {isConfirmed && (
                <span style={{
                  fontSize: 9, fontWeight: 800, letterSpacing: "0.06em",
                  padding: "1px 5px", borderRadius: 3,
                  background: "rgba(0,0,0,.12)", color: textColor,
                }}>CONFIRMED</span>
              )}
              {isCancelled && (
                <span style={{
                  fontSize: 9, fontWeight: 800, letterSpacing: "0.06em",
                  padding: "1px 5px", borderRadius: 3,
                  background: "rgba(0,0,0,.18)", color: textColor,
                }}>CANCELLED</span>
              )}
            </div>
            <div style={{
              fontSize: 17, fontWeight: 700, color: textColor,
              textDecoration: isDone ? "line-through" : "none",
              opacity: isDone ? 0.8 : 1,
              overflow: "hidden", textOverflow: "ellipsis",
            }}>
              {item.title}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "rgba(0,0,0,.15)", border: "none", color: textColor,
            cursor: "pointer", fontSize: 16, padding: "4px 8px",
            borderRadius: 6, lineHeight: 1, flexShrink: 0,
          }}>✕</button>
        </div>

        {/* Details body */}
        <div style={{ padding: "20px", overflowY: "auto", display: "grid", gap: 14 }}>

          {/* Date / time */}
          {(effectiveDate(item)) && (
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span style={{ fontSize: 14, opacity: 0.5, flexShrink: 0, marginTop: 1 }}>📅</span>
              <div style={{ fontSize: 13, color: S.text }}>
                {fmtDateLabel(item)}
                {item.end_at && hasExplicitTime(item.end_at) && !item.is_all_day && (
                  <span style={{ color: S.dim }}> → {fmtTime(item.end_at)}</span>
                )}
                {item.is_all_day && (
                  <span style={{ color: S.dim, marginLeft: 6, fontSize: 11 }}>(all day)</span>
                )}
              </div>
            </div>
          )}

          {/* Priority */}
          {item.priority && item.priority !== "normal" && item.priority !== "low" && (
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ fontSize: 14, opacity: 0.5, flexShrink: 0 }}>⚑</span>
              <span style={{
                fontSize: 11, fontWeight: 800, letterSpacing: "0.05em",
                padding: "2px 8px", borderRadius: 4,
                background: item.priority === "urgent" ? "#fee2e2" : "#fef3c7",
                color: item.priority === "urgent" ? "#991b1b" : "#78350f",
              }}>
                {item.priority === "urgent" ? "!! URGENT" : "HIGH"}
              </span>
            </div>
          )}

          {/* Mission */}
          {mission && (
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ fontSize: 14, opacity: 0.5, flexShrink: 0 }}>⬡</span>
              <span style={{ fontSize: 13, color: S.text }}>
                {mission.title}
                <span style={{ fontSize: 11, color: S.dim, marginLeft: 6 }}>({mission.status})</span>
              </span>
            </div>
          )}

          {/* Assignees */}
          {assignees.length > 0 && (
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span style={{ fontSize: 14, opacity: 0.5, flexShrink: 0, marginTop: 2 }}>👥</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {assignees.map((u) => (
                  <span key={u.id} style={{
                    fontSize: 12, padding: "2px 10px", borderRadius: 12,
                    background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.1)",
                    color: S.text,
                  }}>
                    {u.name || u.email}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Location */}
          {(item.location || item.location_address) && (
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span style={{ fontSize: 14, opacity: 0.5, flexShrink: 0, marginTop: 1 }}>📍</span>
              <div>
                {item.location && (
                  <div style={{ fontSize: 13, fontWeight: 600, color: S.text }}>{item.location}</div>
                )}
                {item.location_address && (() => {
                  const addr = item.location_address;
                  const isUrl = /^https?:\/\//i.test(addr);
                  return (
                    <a
                      href={isUrl ? addr : `https://maps.google.com/?q=${encodeURIComponent(addr)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 12, color: "#60a5fa", textDecoration: "underline", wordBreak: "break-all" }}
                    >
                      {addr}
                    </a>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Description */}
          {item.description && (
            <div style={{
              fontSize: 13, color: S.text, lineHeight: 1.6,
              background: "rgba(255,255,255,.04)", borderRadius: 8,
              padding: "10px 14px", border: "1px solid rgba(255,255,255,.06)",
              whiteSpace: "pre-wrap",
            }}>
              {item.description}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center", paddingTop: 4 }}>
            <Link href={`/crm/sitrep/${item.id}`} style={{
              fontSize: 12, fontWeight: 600, color: S.dim,
              textDecoration: "none", padding: "7px 14px",
              border: "1px solid rgba(255,255,255,.1)", borderRadius: 8,
              background: "rgba(255,255,255,.04)",
              transition: "all .12s ease",
            }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,.08)"; (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(-1px)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,.04)"; (e.currentTarget as HTMLAnchorElement).style.transform = ""; }}
            >
              Open full details →
            </Link>
            {!isCancelled && (
              <button
                onClick={() => { onToggle(item); onClose(); }}
                disabled={togglePending}
                style={{
                  fontSize: 12, fontWeight: 600,
                  padding: "7px 16px", borderRadius: 8, cursor: "pointer",
                  background: isDone ? "rgba(255,255,255,.09)" : family.shades[1],
                  color: isDone ? S.dim : "#fff",
                  border: `1px solid ${isDone ? "rgba(255,255,255,.12)" : family.shades[0]}`,
                  opacity: togglePending ? 0.6 : 1,
                  boxShadow: isDone ? "none" : `0 0 14px ${family.shades[0]}33`,
                  transition: "all .12s ease",
                }}
                onMouseEnter={(e) => { if (!togglePending) { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.filter = "brightness(1.1)"; } }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.filter = ""; }}
              >
                {isDone ? "↩ Mark open" : "✓ Mark done"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function SitRepCalendar({ initialItems, missions, users, currentUserId, hasMissions, typeColors }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [view, setView] = useState<View>((searchParams.get("view") as View) ?? "month");
  const [curDate, setCurDate] = useState<string>(searchParams.get("date") ?? todayStr());

  const [scope, setScope]       = useState<"mine" | "all">("mine");
  const [typeFilter, setTypeFilter] = useState<"all" | "task" | "event" | "meeting">("all");
  const [statusFilter, setStatusFilter] = useState<"active" | "done" | "all">("active");

  const [items, setItems] = useState<SitRepItem[]>(initialItems);
  const [modalItem, setModalItem] = useState<SitRepItem | null>(null);
  const [togglePending, setTogglePending] = useState<Record<string, boolean>>({});

  const [showCreate,      setShowCreate]      = useState(false);
  const [createType,      setCreateType]      = useState<"task"|"event"|"meeting">("task");
  const [createTitle,     setCreateTitle]     = useState("");
  const [createDate,      setCreateDate]      = useState("");
  const [createAllDay,    setCreateAllDay]    = useState(false);
  const [createMissionId, setCreateMissionId] = useState("");
  const [creating,        setCreating]        = useState(false);
  const [createError,     setCreateError]     = useState("");

  const userMap    = new Map(users.map((u) => [u.id, u]));
  const missionMap = new Map(missions.map((m) => [m.id, m]));

  const S = {
    bg:       "rgb(10 13 20)",
    surface:  "rgb(14 18 28)",
    card:     "rgb(20 25 38)",
    border:   "rgba(255,255,255,.07)",
    text:     "rgb(236 240 245)",
    dim:      "rgb(100 116 139)",
    dimBright:"rgb(148 163 184)",
  } as const;

  // Sync view + date to URL params for persistence
  function navigate(newView: View, newDate: string) {
    setView(newView);
    setCurDate(newDate);
    const params = new URLSearchParams({ view: newView, date: newDate });
    router.replace(`/crm/sitrep/calendar?${params.toString()}`, { scroll: false });
  }

  function setViewKeepDate(v: View) { navigate(v, curDate); }
  function stepBack() {
    if (view === "month") navigate("month", addMonths(curDate, -1));
    else if (view === "week") navigate("week", addDays(startOfWeek(curDate), -7));
    else navigate("day", addDays(curDate, -1));
  }
  function stepForward() {
    if (view === "month") navigate("month", addMonths(curDate, 1));
    else if (view === "week") navigate("week", addDays(startOfWeek(curDate), 7));
    else navigate("day", addDays(curDate, 1));
  }

  // Filter items
  let filtered = items;
  if (scope === "mine") {
    filtered = filtered.filter(
      (i) => i.created_by === currentUserId || i.sitrep_assignments.some((a) => a.user_id === currentUserId)
    );
  }
  if (typeFilter !== "all") filtered = filtered.filter((i) => i.item_type === typeFilter);
  if (statusFilter === "active") filtered = filtered.filter((i) => i.status !== "done" && i.status !== "cancelled");
  else if (statusFilter === "done") filtered = filtered.filter((i) => i.status === "done");

  // Build date → items map
  const dateMap = new Map<string, SitRepItem[]>();
  for (const item of filtered) {
    const ed = effectiveDate(item);
    if (!ed) continue;
    const ds = ed.split("T")[0];
    if (!dateMap.has(ds)) dateMap.set(ds, []);
    dateMap.get(ds)!.push(item);
  }
  // Sort each day's items by time then title
  dateMap.forEach((dayItems) => {
    dayItems.sort((a, b) => {
      const at = effectiveDate(a) ?? "";
      const bt = effectiveDate(b) ?? "";
      return at.localeCompare(bt) || a.title.localeCompare(b.title);
    });
  });

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

  function openCalCreate() {
    setCreateType("task"); setCreateTitle(""); setCreateDate("");
    setCreateAllDay(false); setCreateMissionId(""); setCreateError("");
    setShowCreate(true);
  }

  async function handleCalCreate(e: FormEvent) {
    e.preventDefault();
    if (!createTitle.trim()) { setCreateError("Title is required."); return; }
    setCreating(true); setCreateError("");
    const body: Record<string, any> = {
      item_type: createType, title: createTitle.trim(),
      visibility: createType === "task" ? "assignee_only" : "team",
      mission_id: createMissionId || null,
    };
    if (createType === "task") {
      body.status   = "open";
      body.due_date = createDate || null;
    } else {
      body.start_at   = createDate || null;
      body.is_all_day = createAllDay;
    }
    const res = await fetch("/api/crm/sitrep/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const data = await res.json();
      const newItem: SitRepItem = {
        id: data.id, item_type: createType, title: createTitle.trim(),
        status: createType === "task" ? "open" : null,
        priority: createType === "task" ? "normal" : null,
        description: null, location: null, location_address: null,
        due_date:  createType === "task" ? (createDate || null) : null,
        start_at:  createType !== "task" ? (createDate || null) : null,
        end_at: null, is_all_day: createAllDay,
        mission_id: createMissionId || null,
        visibility: createType === "task" ? "assignee_only" : "team",
        created_by: currentUserId, created_at: new Date().toISOString(),
        sitrep_assignments: [],
      };
      setItems((prev) => [newItem, ...prev]);
      setShowCreate(false);
    } else {
      const err = await res.json().catch(() => ({}));
      setCreateError(err.error ?? "Failed to create. Please try again.");
    }
    setCreating(false);
  }

  // ── Period label ────────────────────────────────────────────────────────────

  const periodLabel = view === "month"
    ? fmtMonthYear(curDate)
    : view === "week"
      ? fmtWeekRange(startOfWeek(curDate))
      : fmtFullDay(curDate);

  // ── Common nav bar ──────────────────────────────────────────────────────────

  const NavBar = () => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
      {([["←", stepBack], ["→", stepForward]] as const).map(([label, fn]) => (
        <button key={label} onClick={fn} style={{
          padding: "7px 13px", borderRadius: 9,
          border: "1px solid rgba(255,255,255,.09)",
          background: "rgba(255,255,255,.05)", backdropFilter: "blur(8px)",
          color: S.text, cursor: "pointer", fontSize: 14, fontWeight: 600,
          boxShadow: "0 2px 8px rgba(0,0,0,.25), inset 0 1px 0 rgba(255,255,255,.06)",
          transition: "all .12s",
        }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,.09)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,.05)"; e.currentTarget.style.transform = ""; }}
        >{label}</button>
      ))}
      <div style={{ flex: 1, textAlign: "center", fontWeight: 800, fontSize: 15, color: S.text, letterSpacing: "-0.01em" }}>
        {periodLabel}
      </div>
      <button onClick={() => navigate(view, todayStr())} style={{
        padding: "6px 14px", borderRadius: 9,
        border: "1px solid color-mix(in srgb, var(--gg-primary, #2563eb) 40%, transparent)",
        background: "color-mix(in srgb, var(--gg-primary, #2563eb) 14%, transparent)",
        color: "color-mix(in srgb, var(--gg-primary, #2563eb) 85%, #fff)",
        cursor: "pointer", fontSize: 12, fontWeight: 700,
        boxShadow: "0 0 12px color-mix(in srgb, var(--gg-primary, #2563eb) 18%, transparent)",
        transition: "all .12s",
      }}>Today</button>
    </div>
  );

  // ── Month view ──────────────────────────────────────────────────────────────

  const MonthView = () => {
    const today = todayStr();
    const curMonth = curDate.slice(0, 7);
    const grid = getMonthGrid(curDate);
    const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const MAX_PILLS = 3;

    return (
      <div>
        {/* DOW headers */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 2 }}>
          {DOW.map((d) => (
            <div key={d} style={{
              textAlign: "center", fontSize: 11, fontWeight: 700,
              color: S.dim, textTransform: "uppercase", letterSpacing: "0.06em",
              padding: "6px 0",
            }}>{d}</div>
          ))}
        </div>
        {/* Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
          {grid.map((ds) => {
            const isToday = ds === today;
            const inMonth = ds.startsWith(curMonth);
            const dayItems = dateMap.get(ds) ?? [];
            const visible = dayItems.slice(0, MAX_PILLS);
            const overflow = dayItems.length - MAX_PILLS;

            return (
              <div
                key={ds}
                onClick={() => navigate("day", ds)}
                style={{
                  minHeight: 90, padding: "6px 5px",
                  background: isToday
                    ? "color-mix(in srgb, var(--gg-primary, #2563eb) 10%, transparent)"
                    : inMonth ? S.surface : "rgba(255,255,255,.015)",
                  border: isToday
                    ? "1px solid color-mix(in srgb, var(--gg-primary, #2563eb) 50%, transparent)"
                    : `1px solid ${S.border}`,
                  borderRadius: 8, cursor: "pointer",
                  boxShadow: isToday
                    ? "0 0 18px color-mix(in srgb, var(--gg-primary, #2563eb) 14%, transparent), inset 0 0 18px color-mix(in srgb, var(--gg-primary, #2563eb) 5%, transparent)"
                    : "none",
                  transition: "all .12s ease",
                }}
                onMouseEnter={(e) => {
                  if (!isToday) {
                    e.currentTarget.style.background = "rgba(255,255,255,.06)";
                    e.currentTarget.style.boxShadow = "0 4px 14px rgba(0,0,0,.28)";
                    e.currentTarget.style.transform = "translateY(-1px)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isToday) {
                    e.currentTarget.style.background = inMonth ? S.surface : "rgba(255,255,255,.015)";
                    e.currentTarget.style.boxShadow = "none";
                    e.currentTarget.style.transform = "";
                  }
                }}
              >
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
                  {isToday ? (
                    <span style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      width: 22, height: 22, borderRadius: "50%",
                      background: "var(--gg-primary, #2563eb)",
                      color: "#fff", fontSize: 11, fontWeight: 800,
                      boxShadow: "0 0 8px color-mix(in srgb, var(--gg-primary, #2563eb) 45%, transparent)",
                    }}>
                      {parseInt(ds.split("-")[2], 10)}
                    </span>
                  ) : (
                    <span style={{
                      fontSize: 12, fontWeight: inMonth ? 500 : 400,
                      color: inMonth ? S.text : S.dim,
                    }}>
                      {parseInt(ds.split("-")[2], 10)}
                    </span>
                  )}
                </div>
                <div style={{ display: "grid", gap: 2 }}>
                  {visible.map((item) => (
                    <ItemPill key={item.id} item={item} typeColors={typeColors}
                      onClick={() => setModalItem(item)} />
                  ))}
                  {overflow > 0 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate("day", ds); }}
                      style={{
                        fontSize: 10, fontWeight: 600, color: S.dim,
                        background: "none", border: "none", cursor: "pointer",
                        textAlign: "left", padding: "1px 4px",
                      }}
                    >
                      +{overflow} more
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ── Week view ───────────────────────────────────────────────────────────────

  const WeekView = () => {
    const today = todayStr();
    const ws = startOfWeek(curDate);
    const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
    const MAX_PILLS = 8;

    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {days.map((ds) => {
          const isToday = ds === today;
          const dayItems = dateMap.get(ds) ?? [];
          const visible = dayItems.slice(0, MAX_PILLS);
          const overflow = dayItems.length - MAX_PILLS;
          const d = new Date(ds + "T00:00:00");

          return (
            <div key={ds} style={{
              background: isToday
                ? "color-mix(in srgb, var(--gg-primary, #2563eb) 8%, transparent)"
                : S.surface,
              border: isToday
                ? "1px solid color-mix(in srgb, var(--gg-primary, #2563eb) 40%, transparent)"
                : `1px solid ${S.border}`,
              borderRadius: 10, padding: "10px 8px", minHeight: 200,
              boxShadow: isToday
                ? "0 0 16px color-mix(in srgb, var(--gg-primary, #2563eb) 10%, transparent)"
                : "none",
            }}>
              <div style={{ marginBottom: 8, textAlign: "center" }}>
                <div style={{
                  fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: isToday
                    ? "color-mix(in srgb, var(--gg-primary, #2563eb) 90%, #fff)"
                    : S.dim,
                  marginBottom: 4,
                }}>
                  {d.toLocaleDateString("en-US", { weekday: "short" })}
                </div>
                {isToday ? (
                  <span style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    width: 26, height: 26, borderRadius: "50%",
                    background: "var(--gg-primary, #2563eb)",
                    color: "#fff", fontSize: 13, fontWeight: 800,
                    boxShadow: "0 0 10px color-mix(in srgb, var(--gg-primary, #2563eb) 45%, transparent)",
                  }}>
                    {d.getDate()}
                  </span>
                ) : (
                  <div style={{ fontSize: 16, fontWeight: 600, color: S.text }}>{d.getDate()}</div>
                )}
              </div>
              <div style={{ display: "grid", gap: 3 }}>
                {visible.map((item) => (
                  <ItemPill key={item.id} item={item} typeColors={typeColors}
                    onClick={() => setModalItem(item)} />
                ))}
                {overflow > 0 && (
                  <button
                    onClick={() => navigate("day", ds)}
                    style={{
                      fontSize: 10, fontWeight: 600, color: S.dim,
                      background: "none", border: "none", cursor: "pointer",
                      textAlign: "left", padding: "2px 4px",
                    }}
                  >+{overflow} more</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // ── Day view ────────────────────────────────────────────────────────────────

  const DayView = () => {
    const today = todayStr();
    const isToday = curDate === today;
    const dayItems = dateMap.get(curDate) ?? [];

    return (
      <div>
        {dayItems.length === 0 ? (
          <div style={{
            padding: "48px 0", textAlign: "center", color: S.dim, fontSize: 14,
            border: `1px solid ${S.border}`, borderRadius: 14,
          }}>
            <div style={{ fontSize: 32, opacity: 0.25, marginBottom: 10 }}>◷</div>
            <div>Nothing scheduled {isToday ? "today" : "on this day"}.</div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 4 }}>
            {dayItems.map((item) => {
              const isDone = item.status === "done";
              const isConfirmed = item.status === "confirmed";
              const family = getItemFamily(item, typeColors);
              const cardBg = isDone ? family.shades[1] : family.shades[3];
              const textColor = isDone ? "#fff" : "#0f172a";
              const time = item.item_type !== "task" && hasExplicitTime(item.start_at) && !item.is_all_day
                ? fmtTime(item.start_at!) : null;

              const accentCol = isDone ? family.shades[0] : family.shades[2];
              return (
                <div
                  key={item.id}
                  onClick={() => setModalItem(item)}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "12px 16px", borderRadius: 10,
                    background: cardBg,
                    border: `1px solid ${family.shades[2]}44`,
                    boxShadow: `inset 3px 0 0 0 ${accentCol}, 0 2px 8px rgba(0,0,0,.2), 0 0 0 1px color-mix(in srgb, var(--gg-primary, #2563eb) 22%, transparent), 0 0 10px color-mix(in srgb, var(--gg-primary, #2563eb) 10%, transparent)`,
                    cursor: "pointer", transition: "all .12s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = `inset 3px 0 0 0 ${accentCol}, 0 6px 20px rgba(0,0,0,.32), 0 0 18px ${accentCol}28, 0 0 0 1px color-mix(in srgb, var(--gg-primary, #2563eb) 40%, transparent), 0 0 16px color-mix(in srgb, var(--gg-primary, #2563eb) 18%, transparent)`;
                    e.currentTarget.style.transform = "translateY(-2px)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = `inset 3px 0 0 0 ${accentCol}, 0 2px 8px rgba(0,0,0,.2), 0 0 0 1px color-mix(in srgb, var(--gg-primary, #2563eb) 22%, transparent), 0 0 10px color-mix(in srgb, var(--gg-primary, #2563eb) 10%, transparent)`;
                    e.currentTarget.style.transform = "";
                  }}
                >
                  {time && (
                    <div style={{
                      fontSize: 11, fontWeight: 600, color: isDone ? "rgba(255,255,255,.6)" : "#475569",
                      minWidth: 52, flexShrink: 0, textAlign: "right",
                    }}>
                      {time}
                    </div>
                  )}
                  <span style={{
                    fontSize: 10, fontWeight: 800, letterSpacing: "0.07em",
                    padding: "2px 6px", borderRadius: 4, flexShrink: 0,
                    background: isDone ? "rgba(0,0,0,.28)" : family.shades[1], color: "#fff",
                  }}>
                    {item.item_type === "task" ? "TASK" : item.item_type === "event" ? "EVENT" : "MTG"}
                  </span>
                  {isConfirmed && (
                    <span style={{
                      fontSize: 9, fontWeight: 800, letterSpacing: "0.06em",
                      padding: "1px 5px", borderRadius: 3,
                      background: "rgba(0,0,0,.12)", color: textColor, flexShrink: 0,
                    }}>CONFIRMED</span>
                  )}
                  <span style={{
                    flex: 1, fontSize: 13, fontWeight: 500, color: textColor,
                    textDecoration: isDone ? "line-through" : "none",
                    opacity: isDone ? 0.75 : 1,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {item.title}
                  </span>
                  {item.priority && (item.priority === "urgent" || item.priority === "high") && (
                    <span style={{
                      fontSize: 10, fontWeight: 800, letterSpacing: "0.05em",
                      padding: "2px 6px", borderRadius: 4, flexShrink: 0,
                      background: isDone ? "rgba(220,38,38,.25)" : "#fee2e2",
                      color: isDone ? "#fca5a5" : "#991b1b",
                    }}>
                      {item.priority === "urgent" ? "!! URGENT" : "HIGH"}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="stack" style={{ maxWidth: 1100 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>SitRep</h1>
          <div style={{ fontSize: 13, color: S.dim, marginTop: 4 }}>
            {filtered.length} items shown
          </div>
        </div>

        {/* + New button */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={openCalCreate} style={{
            padding: "8px 18px", borderRadius: 10, fontSize: 13, fontWeight: 700,
            background: "linear-gradient(135deg, var(--gg-primary, #2563eb), color-mix(in srgb, var(--gg-primary, #2563eb) 68%, #7c3aed))",
            border: "none", color: "#fff", cursor: "pointer",
            boxShadow: "0 2px 14px color-mix(in srgb, var(--gg-primary, #2563eb) 42%, transparent)",
            transition: "transform .12s ease, box-shadow .15s ease",
          }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1.5px)"; e.currentTarget.style.boxShadow = "0 6px 20px color-mix(in srgb, var(--gg-primary, #2563eb) 55%, transparent)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 2px 14px color-mix(in srgb, var(--gg-primary, #2563eb) 42%, transparent)"; }}
          >+ New</button>

        {/* List / Calendar toggle */}
        <div style={{
          display: "flex", borderRadius: 10, overflow: "hidden",
          border: `1px solid ${S.border}`, flexShrink: 0,
        }}>
          <Link href="/crm/sitrep" style={{
            padding: "8px 16px", fontSize: 13, fontWeight: 600,
            background: "transparent", color: S.dim,
            textDecoration: "none", display: "flex", alignItems: "center", gap: 6,
            transition: "all .12s",
          }}>
            ☰ List
          </Link>
          <Link href="/crm/sitrep/calendar" style={{
            padding: "8px 16px", fontSize: 13, fontWeight: 600,
            background: "color-mix(in srgb, var(--gg-primary, #2563eb) 16%, transparent)",
            color: "color-mix(in srgb, var(--gg-primary, #2563eb) 90%, #fff)",
            textDecoration: "none", display: "flex", alignItems: "center", gap: 6,
            borderLeft: "1px solid color-mix(in srgb, var(--gg-primary, #2563eb) 40%, transparent)",
            transition: "all .12s",
          }}>
            ◫ Calendar
          </Link>
        </div>
        </div>
      </div>

      {/* Filter bar */}
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
        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          {(["month","week","day"] as const).map((v) => (
            <button key={v} onClick={() => setViewKeepDate(v)} style={{
              padding: "5px 13px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer",
              transition: "all .12s ease",
              border: view === v
                ? "1px solid color-mix(in srgb, var(--gg-primary, #2563eb) 50%, transparent)"
                : "1px solid rgba(255,255,255,.07)",
              background: view === v
                ? "color-mix(in srgb, var(--gg-primary, #2563eb) 18%, transparent)"
                : "rgba(255,255,255,.03)",
              color: view === v
                ? "color-mix(in srgb, var(--gg-primary, #2563eb) 90%, #fff)"
                : S.dim,
              boxShadow: view === v
                ? "0 0 12px color-mix(in srgb, var(--gg-primary, #2563eb) 22%, transparent)"
                : "none",
            }}>
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar body */}
      <div style={{
        background: S.card, border: `1px solid ${S.border}`,
        borderRadius: 16, padding: 20,
      }}>
        <NavBar />
        {view === "month" ? <MonthView /> : view === "week" ? <WeekView /> : <DayView />}
      </div>

      {/* Color key */}
      {(() => {
        const entries = Object.keys(typeColors ?? {}).length > 0
          ? Object.entries(typeColors ?? {})
          : [...new Set(items.map((i) => i.item_type))].map((slug) => [slug, SYSTEM_TYPE_FAMILIES[slug] ?? "blue"] as [string, string]);
        if (entries.length === 0) return null;
        return (
          <div style={{
            display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center",
            padding: "10px 16px", borderRadius: 10,
            background: "rgba(255,255,255,.02)", border: `1px solid ${S.border}`,
          }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.09em", color: S.dim, textTransform: "uppercase" }}>
              Types
            </span>
            {entries.map(([slug, colorKey]) => {
              const family = getFamilyByKey(colorKey) ?? COLOR_FAMILIES[0];
              const label = slug === "task" ? "Tasks" : slug === "event" ? "Events" : slug === "meeting" ? "Meetings"
                : slug.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
              return (
                <div key={slug} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{
                    width: 32, height: 14, borderRadius: 4,
                    background: family.shades[3],
                    boxShadow: `inset 3px 0 0 0 ${family.shades[2]}`,
                  }} />
                  <span style={{ fontSize: 11, fontWeight: 500, color: S.dimBright }}>{label}</span>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Details modal */}
      {modalItem && (
        <ItemDetailsModal
          item={modalItem}
          typeColors={typeColors}
          users={userMap}
          missions={missionMap}
          onClose={() => setModalItem(null)}
          onToggle={handleToggle}
          togglePending={!!togglePending[modalItem.id]}
        />
      )}

      {/* Create modal */}
      {showCreate && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 300,
          background: "rgba(0,0,0,.65)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
        }} onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}>
          <form onSubmit={handleCalCreate} style={{
            width: "min(440px, 100%)",
            background: "rgba(20,25,38,.97)", backdropFilter: "blur(20px)",
            border: "1px solid rgba(255,255,255,.1)", borderRadius: 16, overflow: "hidden",
            boxShadow: "0 24px 64px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.06)",
          }}>
            <div style={{ padding: "18px 20px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: S.text }}>New Item</span>
              <button type="button" onClick={() => setShowCreate(false)} style={{ background: "none", border: "none", color: S.dim, cursor: "pointer", fontSize: 18, lineHeight: 1 }}>✕</button>
            </div>

            {/* Type selector */}
            <div style={{ padding: "14px 20px 0", display: "flex", gap: 6 }}>
              {(["task","event","meeting"] as const).map((t) => (
                <button type="button" key={t} onClick={() => setCreateType(t)} style={{
                  flex: 1, padding: "8px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                  background: createType === t
                    ? "color-mix(in srgb, var(--gg-primary, #2563eb) 18%, transparent)"
                    : "rgba(255,255,255,.04)",
                  border: createType === t
                    ? "1px solid color-mix(in srgb, var(--gg-primary, #2563eb) 50%, transparent)"
                    : "1px solid rgba(255,255,255,.1)",
                  color: createType === t
                    ? "color-mix(in srgb, var(--gg-primary, #2563eb) 90%, #fff)"
                    : S.dim,
                  transition: "all .12s ease",
                }}>
                  {t === "task" ? "Task" : t === "event" ? "Event" : "Meeting"}
                </button>
              ))}
            </div>

            {/* Fields */}
            <div style={{ padding: "14px 20px 20px", display: "grid", gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, display: "block", marginBottom: 5, color: S.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>Title *</label>
                <input
                  autoFocus
                  type="text"
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                  placeholder={createType === "task" ? "Task title…" : createType === "event" ? "Event name…" : "Meeting title…"}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 9, background: "rgba(255,255,255,.05)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,.1)", color: S.text, fontSize: 13, outline: "none", transition: "border-color .15s, box-shadow .15s", boxSizing: "border-box" }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "color-mix(in srgb, var(--gg-primary, #2563eb) 55%, transparent)"; e.currentTarget.style.boxShadow = "0 0 0 3px color-mix(in srgb, var(--gg-primary, #2563eb) 14%, transparent)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,.1)"; e.currentTarget.style.boxShadow = "none"; }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, display: "block", marginBottom: 5, color: S.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                  {createType === "task" ? "Due Date" : "Start"}
                </label>
                <input
                  type={createType !== "task" && !createAllDay ? "datetime-local" : "date"}
                  value={createDate}
                  onChange={(e) => setCreateDate(e.target.value)}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 9, background: "rgba(255,255,255,.05)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,.1)", color: S.text, fontSize: 13, outline: "none", transition: "border-color .15s, box-shadow .15s", boxSizing: "border-box" }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "color-mix(in srgb, var(--gg-primary, #2563eb) 55%, transparent)"; e.currentTarget.style.boxShadow = "0 0 0 3px color-mix(in srgb, var(--gg-primary, #2563eb) 14%, transparent)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,.1)"; e.currentTarget.style.boxShadow = "none"; }}
                />
              </div>

              {createType !== "task" && (
                <div onClick={() => setCreateAllDay(!createAllDay)} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13, cursor: "pointer", color: S.dimBright }}>
                  <div style={{
                    width: 38, height: 21, borderRadius: 11, position: "relative", flexShrink: 0,
                    background: createAllDay ? "var(--gg-primary, #2563eb)" : "rgba(255,255,255,.12)",
                    boxShadow: createAllDay ? "0 0 8px color-mix(in srgb, var(--gg-primary, #2563eb) 45%, transparent)" : "inset 0 1px 3px rgba(0,0,0,.4)",
                    transition: "background .2s ease, box-shadow .2s ease",
                  }}>
                    <div style={{ position: "absolute", top: 2, left: createAllDay ? 19 : 2, width: 17, height: 17, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,.35)", transition: "left .2s ease" }} />
                  </div>
                  All day
                </div>
              )}

              {hasMissions && missions.length > 0 && (
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, display: "block", marginBottom: 5, color: S.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>Mission</label>
                  <select value={createMissionId} onChange={(e) => setCreateMissionId(e.target.value)}
                    style={{ width: "100%", padding: "9px 12px", borderRadius: 9, background: "rgba(255,255,255,.05)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,.1)", color: S.text, fontSize: 13, outline: "none", boxSizing: "border-box" }}>
                    <option value="">— None —</option>
                    {missions.filter((m) => m.status !== "done").map((m) => (
                      <option key={m.id} value={m.id}>{m.title}</option>
                    ))}
                  </select>
                </div>
              )}

              {createError && (
                <div style={{ fontSize: 12, color: "#fca5a5", padding: "8px 12px", background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.2)", borderRadius: 8 }}>
                  {createError}
                </div>
              )}

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 2 }}>
                <button type="button" onClick={() => setShowCreate(false)} style={{
                  padding: "8px 18px", borderRadius: 9, fontSize: 13, fontWeight: 600,
                  background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)",
                  color: S.dim, cursor: "pointer", transition: "all .12s",
                }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,.08)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,.04)"; }}
                >Cancel</button>
                <button type="submit" disabled={creating} style={{
                  padding: "8px 22px", borderRadius: 9, fontSize: 13, fontWeight: 600,
                  background: "linear-gradient(135deg, var(--gg-primary, #2563eb), color-mix(in srgb, var(--gg-primary, #2563eb) 68%, #7c3aed))",
                  border: "none", color: "#fff", cursor: "pointer",
                  boxShadow: "0 2px 14px color-mix(in srgb, var(--gg-primary, #2563eb) 42%, transparent)",
                  opacity: creating ? 0.7 : 1, transition: "all .12s",
                }}>
                  {creating ? "Creating…" : "Create"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
