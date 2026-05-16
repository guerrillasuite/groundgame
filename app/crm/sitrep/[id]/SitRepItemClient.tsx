"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CustomFieldsWidget from "@/app/components/crm/CustomFieldsWidget";
import LocationPicker, { type LocationValue } from "@/app/components/crm/LocationPicker";

type CalSource = { type: string; tenant_id?: string };
type CalType   = { id: string; name: string; color: string; cal_type: "work"|"family"|"personal"|"custom"; sources: CalSource[] };

const CAL_DOT: Record<string, string> = {
  blue: "#3b82f6", violet: "#8b5cf6", green: "#22c55e", teal: "#10b981",
  amber: "#f59e0b", red: "#ef4444", orange: "#f97316", cyan: "#06b6d4",
  indigo: "#6366f1", rose: "#f43f5e", lime: "#84cc16", slate: "#94a3b8",
};

function calDot(color: string) { return CAL_DOT[color] ?? "#818cf8"; }

function calVisibility(ct: CalType): string {
  if (ct.cal_type === "personal") return "private";
  if (ct.cal_type === "work" || ct.cal_type === "family") return "team";
  return "assignee_only";
}

function guessCalId(calTypes: CalType[], tenantId: string, visibility: string): string {
  if (visibility === "private") {
    const p = calTypes.find((c) => c.cal_type === "personal");
    if (p) return p.id;
  }
  const byTenant = calTypes.find((c) =>
    (c.sources ?? []).some((s) => s.type === "tenant" && s.tenant_id === tenantId)
  );
  if (byTenant) return byTenant.id;
  return calTypes[0]?.id ?? "";
}

// ── Types ──────────────────────────────────────────────────────────────────────

type Assignment = { user_id: string; role: string };
type SitRepLink = { id: string; record_type: string; record_id: string; display_label: string | null };
type Stage      = { slug: string; name: string; color: string; is_terminal: boolean; sort_order: number };

type FullItem = {
  id: string;
  item_type: string;
  title: string;
  description: string | null;
  location_id: string | null;
  meeting_url: string | null;
  location_display: string | null;
  status: string | null;
  priority: string | null;
  due_date: string | null;
  start_at: string | null;
  end_at: string | null;
  is_all_day: boolean | null;
  agenda: string | null;
  meeting_notes: string | null;
  parent_item_id: string | null;
  depth: number;
  visibility: string;
  created_by: string;
  created_at: string;
  updated_at: string | null;
  custom_fields: Record<string, unknown> | null;
  sitrep_assignments: Assignment[];
  sitrep_links: SitRepLink[];
};

type User = { id: string; name: string; email: string };

type Props = {
  item: FullItem;
  typeDefs: Record<string, any>;
  parentItem: { id: string; title: string; item_type: string } | null;
  users: User[];
  currentUserId: string;
  sitrepTypeId?: string | null;
};

type SaveState = "idle" | "saving" | "saved" | "error";

// ── Color maps ─────────────────────────────────────────────────────────────────

const STAGE_COLORS: Record<string, { activeColor: string; textColor: string; grad: [string, string]; icon: string }> = {
  blue:   { activeColor: "rgba(59,130,246,.2)",   textColor: "#93c5fd",          grad: ["#3b82f6","#818cf8"],                             icon: "▶" },
  green:  { activeColor: "rgba(22,163,74,.2)",    textColor: "#86efac",          grad: ["#22c55e","#10b981"],                             icon: "✓" },
  amber:  { activeColor: "rgba(245,158,11,.18)",  textColor: "#fcd34d",          grad: ["#f59e0b","#d97706"],                             icon: "◎" },
  teal:   { activeColor: "rgba(16,185,129,.2)",   textColor: "#6ee7b7",          grad: ["#10b981","#06b6d4"],                             icon: "●" },
  violet: { activeColor: "rgba(139,92,246,.18)",  textColor: "#c4b5fd",          grad: ["#8b5cf6","#a78bfa"],                             icon: "○" },
  slate:  { activeColor: "rgba(107,114,128,.15)", textColor: "rgb(134 150 168)", grad: ["rgba(148,163,184,.35)","rgba(100,116,139,.12)"],  icon: "✕" },
  red:    { activeColor: "rgba(220,38,38,.18)",   textColor: "#fca5a5",          grad: ["#ef4444","#dc2626"],                             icon: "✕" },
  orange: { activeColor: "rgba(249,115,22,.18)",  textColor: "#fdba74",          grad: ["#f97316","#ea580c"],                             icon: "◎" },
  cyan:   { activeColor: "rgba(6,182,212,.2)",    textColor: "#67e8f9",          grad: ["#06b6d4","#0891b2"],                             icon: "●" },
  indigo: { activeColor: "rgba(99,102,241,.18)",  textColor: "#a5b4fc",          grad: ["#6366f1","#4f46e5"],                             icon: "○" },
  rose:   { activeColor: "rgba(244,63,94,.18)",   textColor: "#fda4af",          grad: ["#f43f5e","#e11d48"],                             icon: "!" },
  lime:   { activeColor: "rgba(132,204,22,.18)",  textColor: "#bef264",          grad: ["#84cc16","#65a30d"],                             icon: "✓" },
  white:  { activeColor: "rgba(255,255,255,.08)", textColor: "rgb(238 242 246)", grad: ["rgba(255,255,255,.4)","rgba(255,255,255,.12)"],   icon: "○" },
};

const TYPE_HERO: Record<string, { bg: string; color: string }> = {
  blue:   { bg: "rgba(59,130,246,.18)",  color: "#93c5fd" },
  green:  { bg: "rgba(22,163,74,.18)",   color: "#86efac" },
  amber:  { bg: "rgba(245,158,11,.18)",  color: "#fcd34d" },
  teal:   { bg: "rgba(16,185,129,.18)",  color: "#6ee7b7" },
  violet: { bg: "rgba(139,92,246,.18)",  color: "#c4b5fd" },
  slate:  { bg: "rgba(107,114,128,.15)", color: "rgb(148 163 184)" },
  red:    { bg: "rgba(220,38,38,.18)",   color: "#fca5a5" },
  orange: { bg: "rgba(249,115,22,.18)",  color: "#fdba74" },
  cyan:   { bg: "rgba(6,182,212,.18)",   color: "#67e8f9" },
  indigo: { bg: "rgba(99,102,241,.18)",  color: "#a5b4fc" },
  rose:   { bg: "rgba(244,63,94,.18)",   color: "#fda4af" },
  lime:   { bg: "rgba(132,204,22,.18)",  color: "#bef264" },
};

// ── Static config ──────────────────────────────────────────────────────────────

const FALLBACK_STAGES: Stage[] = [
  { slug: "open", name: "Open", color: "white", is_terminal: false, sort_order: 0 },
  { slug: "done", name: "Done", color: "green", is_terminal: true,  sort_order: 1 },
];

const PRIORITIES = [
  { key: "low",    label: "Low",    activeColor: "rgba(148,163,184,.1)",  textColor: "rgb(134 150 168)", grad: ["rgba(148,163,184,.3)","rgba(100,116,139,.1)"]  as [string,string] },
  { key: "normal", label: "Normal", activeColor: "rgba(255,255,255,.08)", textColor: "rgb(238 242 246)", grad: ["rgba(255,255,255,.38)","rgba(255,255,255,.1)"] as [string,string] },
  { key: "high",   label: "High",   activeColor: "rgba(245,158,11,.18)",  textColor: "#fcd34d",          grad: ["#f59e0b","#d97706"]                            as [string,string] },
  { key: "urgent", label: "Urgent", activeColor: "rgba(220,38,38,.18)",   textColor: "#fca5a5",          grad: ["#ef4444","#dc2626"]                            as [string,string] },
];

const VISIBILITIES = [
  { key: "private",       label: "Private (only me)" },
  { key: "assignee_only", label: "Assignees only" },
  { key: "team",          label: "Team (all CRM users)" },
];

const LINK_TYPE_LABELS: Record<string, string> = {
  person: "Person", household: "Household", opportunity: "Opportunity",
  stop: "Stop", company: "Company", location: "Location",
};

const DEP_TYPES = ["blocks","precedes","follows","relates_to","duplicates"] as const;
const DEP_LABELS: Record<string, string> = {
  blocks: "Blocks", precedes: "Precedes", follows: "Follows",
  relates_to: "Relates to", duplicates: "Duplicates",
};

const ACTIVITY_DESC: Record<string, (e: any) => string> = {
  created:          () => "Created this item",
  status_changed:   (e) => `Status: ${e.old_value ?? "—"} → ${e.new_value}`,
  priority_changed: (e) => `Priority: ${e.old_value ?? "—"} → ${e.new_value}`,
  due_changed:      () => "Due date changed",
  title_changed:    (e) => `Renamed: "${e.old_value}" → "${e.new_value}"`,
  parent_changed:   () => "Parent item changed",
  commented:        () => "Added a comment",
  dep_added:        (e) => `Dependency added: ${e.new_value ?? ""}`,
  dep_removed:      (e) => `Dependency removed: ${e.old_value ?? ""}`,
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function utcToDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localToUtcIso(local: string): string {
  return new Date(local).toISOString();
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtRelative(iso: string) {
  const d   = new Date(iso);
  const now = new Date();
  const diffMs   = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1)  return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const h = Math.floor(diffMins / 60);
  if (h < 24) return `${h}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function userInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  return (parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : name.slice(0, 2)).toUpperCase();
}

function userHue(name: string) {
  return Math.abs([...name].reduce((acc, c) => acc + c.charCodeAt(0) * 31, 0)) % 360;
}

function sc(colorKey: string) { return STAGE_COLORS[colorKey] ?? STAGE_COLORS.white; }
function th(colorKey: string) { return TYPE_HERO[colorKey]    ?? { bg: "rgba(59,130,246,.18)", color: "#93c5fd" }; }

// ── Main Component ─────────────────────────────────────────────────────────────

export default function SitRepItemClient({ item, typeDefs, parentItem, users, currentUserId, sitrepTypeId }: Props) {
  const router  = useRouter();
  const typeDef = typeDefs[item.item_type] ?? null;
  const stages  = ((typeDef?.stages ?? []) as Stage[]).length > 0
    ? (typeDef.stages as Stage[]).slice().sort((a, b) => a.sort_order - b.sort_order)
    : FALLBACK_STAGES;
  const typeHero = th(typeDef?.color ?? "blue");
  const typeName = (typeDef?.name ?? item.item_type).toUpperCase();
  const isMissionType = !!typeDef?.is_mission_type;
  const isTask = item.item_type === "task";

  // ── Field state ────────────────────────────────────────────────────────────

  const [title,        setTitle]        = useState(item.title);
  const [desc,         setDesc]         = useState(item.description ?? "");
  const [status,       setStatus]       = useState(item.status ?? stages[0]?.slug ?? "open");
  const [priority,     setPriority]     = useState(item.priority ?? "normal");
  const [dueDate,      setDueDate]      = useState(item.due_date ?? "");
  // Initialize with UTC-sliced value so SSR matches; useEffect corrects to local tz after hydration
  const [startAt, setStartAt] = useState(item.start_at ? item.start_at.slice(0, 16) : "");
  const [endAt,   setEndAt]   = useState(item.end_at   ? item.end_at.slice(0, 16)   : "");
  useEffect(() => {
    if (item.start_at) setStartAt(utcToDatetimeLocal(item.start_at));
    if (item.end_at)   setEndAt(utcToDatetimeLocal(item.end_at));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [isAllDay,     setIsAllDay]     = useState(item.is_all_day ?? false);
  const [locationValue, setLocationValue] = useState<LocationValue>(
    item.location_id
      ? { type: "location", locationId: item.location_id, displayText: item.location_display ?? "" }
      : item.meeting_url
      ? { type: "url", url: item.meeting_url }
      : null
  );
  const [agenda,       setAgenda]       = useState(item.agenda ?? "");
  const [meetingNotes, setMeetingNotes] = useState(item.meeting_notes ?? "");
  const [visibility,   setVisibility]   = useState(item.visibility);
  const [assignments,  setAssignments]  = useState<Assignment[]>(item.sitrep_assignments ?? []);

  // ── UI state ───────────────────────────────────────────────────────────────

  const [calTypes,  setCalTypes]  = useState<CalType[]>([]);
  const [calTypeId, setCalTypeId] = useState("");

  const [saveState,        setSaveState]        = useState<SaveState>("idle");
  const [showAddUser,      setShowAddUser]       = useState(false);
  const [deleting,         setDeleting]          = useState(false);
  const [deleteModal,      setDeleteModal]       = useState<"none"|"confirm"|"children">("none");
  const [deleteChildCount, setDeleteChildCount]  = useState(0);
  const [deleteError,      setDeleteError]       = useState<string | null>(null);
  const [statusExpanded,   setStatusExpanded]    = useState(true);
  const [priorityExpanded, setPriorityExpanded]  = useState(true);
  const [activityExpanded, setActivityExpanded]  = useState(false);

  // ── Secondary data ─────────────────────────────────────────────────────────

  const [children,     setChildren]     = useState<any[]>([]);
  const [comments,     setComments]     = useState<any[]>([]);
  const [activity,     setActivity]     = useState<any[]>([]);
  const [deps,         setDeps]         = useState<{ outgoing: any[]; incoming: any[] }>({ outgoing: [], incoming: [] });
  const [newChildTitle,   setNewChildTitle]   = useState("");
  const [newChildType,    setNewChildType]    = useState(item.item_type);
  const [addingChild,     setAddingChild]     = useState(false);
  const [newComment,      setNewComment]      = useState("");
  const [submittingCmt,   setSubmittingCmt]   = useState(false);
  const [editCmtId,       setEditCmtId]       = useState<string|null>(null);
  const [editCmtBody,     setEditCmtBody]     = useState("");
  const [showAddDep,      setShowAddDep]       = useState(false);
  const [depType,         setDepType]          = useState<string>("blocks");
  const [depTargetId,     setDepTargetId]      = useState("");
  const [addingDep,       setAddingDep]        = useState(false);

  const saveTimer  = useRef<ReturnType<typeof setTimeout>|null>(null);
  const addUserRef = useRef<HTMLDivElement>(null);

  // fetch calendar types for the picker
  useEffect(() => {
    fetch("/api/user/calendar-types")
      .then((r) => r.ok ? r.json() : [])
      .then((data: CalType[]) => {
        setCalTypes(data);
        setCalTypeId(guessCalId(data, item.tenant_id ?? "", item.visibility));
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // fetch secondary data
  useEffect(() => {
    const base = `/api/crm/sitrep/items/${item.id}`;
    fetch(`${base}/children`).then(r => r.ok ? r.json() : []).then((d: any[]) => {
      setChildren(Array.isArray(d) ? d : []);
    }).catch(() => {});
    fetch(`${base}/comments`).then(r => r.ok ? r.json() : []).then((d: any[]) => {
      setComments(Array.isArray(d) ? d : []);
    }).catch(() => {});
    fetch(`${base}/dependencies`).then(r => r.ok ? r.json() : []).then((d: any[]) => {
      if (!Array.isArray(d)) return;
      setDeps({
        outgoing: d.filter((x: any) => x.direction === "outgoing"),
        incoming: d.filter((x: any) => x.direction === "incoming"),
      });
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  useEffect(() => {
    if (!activityExpanded || activity.length > 0) return;
    fetch(`/api/crm/sitrep/items/${item.id}/activity`).then(r => r.ok ? r.json() : []).then((d: any[]) => {
      setActivity(Array.isArray(d) ? d : []);
    }).catch(() => {});
  }, [activityExpanded, item.id, activity.length]);

  useEffect(() => {
    if (!showAddUser) return;
    const h = (e: MouseEvent) => { if (!addUserRef.current?.contains(e.target as Node)) setShowAddUser(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showAddUser]);

  // ── Save helpers ───────────────────────────────────────────────────────────

  async function patchNow(fields: Record<string, unknown>) {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    setSaveState("saving");
    try {
      const res = await fetch(`/api/crm/sitrep/items/${item.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fields),
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

  async function handleAddAssignee(userId: string) {
    const role = item.item_type === "task" ? "assignee" : item.item_type === "event" ? "attendee" : "participant";
    setAssignments(p => [...p, { user_id: userId, role }]);
    setShowAddUser(false);
    await patchNow({ add_assignee_ids: [userId], assignment_role: role });
  }

  async function handleRemoveAssignee(userId: string) {
    setAssignments(p => p.filter(a => a.user_id !== userId));
    await patchNow({ remove_assignee_ids: [userId] });
  }

  async function handleDelete(mode?: "cascade"|"orphan") {
    setDeleting(true);
    setDeleteError(null);
    const qs  = mode ? `?${mode}=true` : "";
    const res = await fetch(`/api/crm/sitrep/items/${item.id}${qs}`, { method: "DELETE" });
    if (res.ok) { router.push("/crm/sitrep"); return; }
    if (res.status === 409) {
      const data = await res.json().catch(() => ({}));
      setDeleteChildCount(data.child_count ?? 0);
      setDeleteModal("children");
      setDeleting(false);
      return;
    }
    const errData = await res.json().catch(() => ({}));
    setDeleteError(errData.error ?? "Delete failed");
    setDeleting(false);
  }

  async function handleAddChild() {
    if (!newChildTitle.trim()) return;
    setAddingChild(true);
    try {
      const childTypeDef = typeDefs[newChildType];
      const childStages  = ((childTypeDef?.stages ?? []) as Stage[]).filter(s => !s.is_terminal).sort((a, b) => a.sort_order - b.sort_order);
      const firstStage   = childStages[0]?.slug ?? "open";
      const res = await fetch("/api/crm/sitrep/items", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newChildTitle.trim(), item_type: newChildType, parent_item_id: item.id, status: firstStage }),
      });
      if (res.ok) {
        const data = await res.json();
        setChildren(p => [...p, {
          id: data.id, title: newChildTitle.trim(), item_type: newChildType,
          status: firstStage, priority: null, depth: (item.depth ?? 0) + 1,
          parent_item_id: item.id, child_count: 0,
        }]);
        setNewChildTitle("");
      }
    } finally { setAddingChild(false); }
  }

  async function handleSubmitComment() {
    if (!newComment.trim()) return;
    setSubmittingCmt(true);
    try {
      const res = await fetch(`/api/crm/sitrep/items/${item.id}/comments`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: newComment.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setComments(p => [...p, data]);
        setNewComment("");
      }
    } finally { setSubmittingCmt(false); }
  }

  async function handleEditComment() {
    if (!editCmtId || !editCmtBody.trim()) return;
    const res = await fetch(`/api/crm/sitrep/items/${item.id}/comments/${editCmtId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: editCmtBody.trim() }),
    });
    if (res.ok) {
      setComments(p => p.map(c => c.id === editCmtId ? { ...c, body: editCmtBody.trim(), edited_at: new Date().toISOString() } : c));
      setEditCmtId(null); setEditCmtBody("");
    }
  }

  async function handleDeleteComment(cid: string) {
    const res = await fetch(`/api/crm/sitrep/items/${item.id}/comments/${cid}`, { method: "DELETE" });
    if (res.ok) setComments(p => p.filter(c => c.id !== cid));
  }

  async function handleAddDep() {
    if (!depTargetId.trim()) return;
    setAddingDep(true);
    try {
      const res = await fetch(`/api/crm/sitrep/items/${item.id}/dependencies`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dep_type: depType, to_item_id: depTargetId.trim() }),
      });
      if (res.ok) {
        // Refetch deps to get full joined item info
        const fresh = await fetch(`/api/crm/sitrep/items/${item.id}/dependencies`).then(r => r.ok ? r.json() : []);
        if (Array.isArray(fresh)) {
          setDeps({
            outgoing: fresh.filter((x: any) => x.direction === "outgoing"),
            incoming: fresh.filter((x: any) => x.direction === "incoming"),
          });
        }
        setDepTargetId(""); setShowAddDep(false);
      }
    } finally { setAddingDep(false); }
  }

  async function handleRemoveDep(depId: string) {
    const res = await fetch(`/api/crm/sitrep/items/${item.id}/dependencies/${depId}`, { method: "DELETE" });
    if (res.ok) {
      setDeps(p => ({ outgoing: p.outgoing.filter(d => d.id !== depId), incoming: p.incoming.filter(d => d.id !== depId) }));
    }
  }

  // ── Style constants ────────────────────────────────────────────────────────

  const S = {
    card: "rgb(20 25 38)", border: "rgba(255,255,255,.08)",
    text: "rgb(236 240 245)", dim: "rgb(100 116 139)", dimBright: "rgb(148 163 184)",
  } as const;

  const focusField = (e: React.FocusEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>) => {
    e.currentTarget.style.borderColor = "color-mix(in srgb, var(--gg-primary, #2563eb) 55%, transparent)";
    e.currentTarget.style.boxShadow   = "0 0 0 3px color-mix(in srgb, var(--gg-primary, #2563eb) 14%, transparent)";
  };
  const blurField = (e: React.FocusEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>) => {
    e.currentTarget.style.borderColor = S.border;
    e.currentTarget.style.boxShadow   = "none";
  };
  const fieldStyle: React.CSSProperties = {
    background: "rgba(255,255,255,.05)", border: `1px solid ${S.border}`,
    borderRadius: 8, padding: "6px 10px", color: S.text, fontSize: 13,
    outline: "none", transition: "border-color .15s, box-shadow .15s",
  };
  const SECTION_HEADER: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, letterSpacing: "0.09em",
    color: S.dim, textTransform: "uppercase", marginBottom: 10,
  };
  const sectionCard: React.CSSProperties = {
    background: S.card, border: `1px solid ${S.border}`, borderRadius: 14,
    boxShadow: "0 4px 20px rgba(0,0,0,.3), inset 0 1px 0 rgba(255,255,255,.05)",
    overflow: "hidden",
  };

  const assignedIds  = new Set(assignments.map(a => a.user_id));
  const userMap      = new Map(users.map(u => [u.id, u]));
  const unassigned   = users.filter(u => !assignedIds.has(u.id));
  const currentStage = stages.find(s => s.slug === status);
  const isCreator    = item.created_by === currentUserId;

  // children progress
  const childrenDone = children.filter(c => {
    const cStages = (typeDefs[c.item_type]?.stages ?? []) as Stage[];
    return cStages.find(s => s.slug === c.status)?.is_terminal ?? false;
  }).length;

  const hasDeps = deps.outgoing.length > 0 || deps.incoming.length > 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 700, margin: "0 auto" }} className="stack">

      {/* ── Hero banner ── */}
      <div style={{
        padding: "28px 28px 24px",
        background: `linear-gradient(150deg, ${typeHero.bg} 0%, rgba(14,18,28,0) 70%)`,
        border: `1px solid ${typeHero.color}28`,
        borderRadius: 16,
        boxShadow: `0 4px 28px rgba(0,0,0,.35), 0 0 40px ${typeHero.color}0d`,
      }}>
        {/* Top row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <Link href="/crm/sitrep" style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            color: S.dimBright, fontSize: 13, fontWeight: 600,
            background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.11)",
            padding: "6px 13px", borderRadius: 9, textDecoration: "none",
          }}>
            ← SitRep
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {parentItem && (
              <Link href={`/crm/sitrep/${parentItem.id}`} style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                fontSize: 12, color: S.dim, textDecoration: "none",
                background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.09)",
                padding: "5px 11px", borderRadius: 7,
              }}>
                <span style={{ opacity: 0.6 }}>↑</span>
                <span style={{ fontWeight: 700, letterSpacing: "0.06em" }}>{(typeDefs[parentItem.item_type]?.name ?? parentItem.item_type).toUpperCase()}</span>
                <span style={{ color: S.dimBright, fontWeight: 500 }}>{parentItem.title}</span>
              </Link>
            )}
            {saveState === "saving" && <span style={{ fontSize: 12, color: S.dim }}>Saving…</span>}
            {saveState === "saved"  && <span style={{ fontSize: 12, fontWeight: 700, color: "#4ade80", background: "rgba(34,197,94,.1)", border: "1px solid rgba(34,197,94,.25)", padding: "4px 10px", borderRadius: 20 }}>✓ Saved</span>}
            {saveState === "error"  && <span style={{ fontSize: 12, fontWeight: 700, color: "#f87171", background: "rgba(239,68,68,.1)",  border: "1px solid rgba(239,68,68,.25)",  padding: "4px 10px", borderRadius: 20 }}>✕ Error</span>}
          </div>
        </div>

        {/* Type badge row */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <span style={{
            fontSize: 11, fontWeight: 800, letterSpacing: "0.1em",
            padding: "4px 11px", borderRadius: 7,
            background: typeHero.bg, color: typeHero.color, border: `1px solid ${typeHero.color}40`,
            boxShadow: `0 0 10px ${typeHero.color}22`,
          }}>
            {typeName}
          </span>
          {isMissionType && (
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", padding: "4px 10px", borderRadius: 7, background: "rgba(255,255,255,.07)", color: S.dim, border: "1px solid rgba(255,255,255,.1)" }}>
              ⬡ MISSION
            </span>
          )}
          <span style={{ fontSize: 12, color: S.dim }}>{fmtDate(item.created_at)}</span>
        </div>

        {/* Editable title */}
        <input
          type="text" value={title}
          onChange={(e) => { setTitle(e.target.value); patchDebounced({ title: e.target.value }); }}
          placeholder="Untitled"
          style={{ width: "100%", background: "transparent", border: "none", outline: "none", color: S.text, fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em", padding: 0, lineHeight: 1.25 }}
        />
      </div>

      {/* ── Status ── */}
      {(() => {
        const activeShadowFor = (s: Stage) => {
          const c = sc(s.color);
          return `0 0 0 3px ${c.grad[0]}22, 0 0 18px ${c.textColor}30, 0 2px 8px rgba(0,0,0,.32), inset 0 1px 0 rgba(255,255,255,.07)`;
        };
        return (
          <div style={{
            background: "rgba(20,25,38,.75)", backdropFilter: "blur(4px)",
            border: `1px solid ${S.border}`, borderRadius: 12, overflow: "hidden",
            boxShadow: statusExpanded
              ? "inset 3px 0 0 0 var(--gg-primary, #2563eb), 0 4px 20px rgba(0,0,0,.3)"
              : "0 2px 8px rgba(0,0,0,.25)",
            transition: "box-shadow .2s",
          }}>
            <div onClick={() => setStatusExpanded(v => !v)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", cursor: "pointer", borderBottom: statusExpanded ? `1px solid ${S.border}` : "none" }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.09em", color: S.dim, textTransform: "uppercase" }}>Status</span>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {!statusExpanded && currentStage && (() => {
                  const c = sc(currentStage.color);
                  return <span style={{ fontSize: 12, color: c.textColor, fontWeight: 600 }}>{c.icon} {currentStage.name}</span>;
                })()}
                <span style={{ fontSize: 14, color: S.dim, display: "inline-block", transform: statusExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform .2s" }}>›</span>
              </div>
            </div>
            <div style={{ maxHeight: statusExpanded ? "200px" : "0px", overflow: "hidden", transition: "max-height .2s" }}>
              <div style={{ padding: "14px 18px", display: "flex", flexWrap: "wrap", gap: 6 }}>
                {stages.map((s) => {
                  const active = status === s.slug;
                  const c = sc(s.color);
                  const activeShadow = activeShadowFor(s);
                  const idleShadow   = "0 1px 4px rgba(0,0,0,.22)";
                  return (
                    <button key={s.slug}
                      onClick={() => { setStatus(s.slug); patchNow({ status: s.slug }); }}
                      style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "transform .12s, box-shadow .12s, filter .12s", border: active ? `1.5px solid ${c.grad[0]}cc` : `1px solid rgba(255,255,255,.1)`, background: active ? c.activeColor : "rgba(255,255,255,.04)", color: active ? c.textColor : S.dim, boxShadow: active ? activeShadow : idleShadow }}
                      onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1.5px)"; e.currentTarget.style.boxShadow = active ? `0 0 0 4px ${c.grad[0]}18, 0 5px 16px rgba(0,0,0,.4)` : "0 4px 14px rgba(0,0,0,.38)"; if (!active) e.currentTarget.style.filter = "brightness(1.2)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = active ? activeShadow : idleShadow; e.currentTarget.style.filter = ""; }}
                    >
                      <span style={{ fontSize: 12 }}>{c.icon}</span> {s.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Priority (tasks) ── */}
      {isTask && (() => {
        const currentP = PRIORITIES.find(p => p.key === priority);
        return (
          <div style={{ background: "rgba(20,25,38,.75)", backdropFilter: "blur(4px)", border: `1px solid ${S.border}`, borderRadius: 12, overflow: "hidden", boxShadow: priorityExpanded ? "inset 3px 0 0 0 var(--gg-primary, #2563eb), 0 4px 20px rgba(0,0,0,.3)" : "0 2px 8px rgba(0,0,0,.25)", transition: "box-shadow .2s" }}>
            <div onClick={() => setPriorityExpanded(v => !v)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", cursor: "pointer", borderBottom: priorityExpanded ? `1px solid ${S.border}` : "none" }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.09em", color: S.dim, textTransform: "uppercase" }}>Priority</span>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {!priorityExpanded && currentP && <span style={{ fontSize: 12, color: currentP.textColor, fontWeight: 600 }}>● {currentP.label}</span>}
                <span style={{ fontSize: 14, color: S.dim, display: "inline-block", transform: priorityExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform .2s" }}>›</span>
              </div>
            </div>
            <div style={{ maxHeight: priorityExpanded ? "160px" : "0px", overflow: "hidden", transition: "max-height .2s" }}>
              <div style={{ padding: "14px 18px", display: "flex", flexWrap: "wrap", gap: 6 }}>
                {PRIORITIES.map((p) => {
                  const active = priority === p.key;
                  const activeShadow = `0 0 0 3px ${p.grad[0]}20, 0 0 16px ${p.textColor}28, 0 2px 8px rgba(0,0,0,.3)`;
                  const idleShadow   = "0 1px 4px rgba(0,0,0,.22)";
                  return (
                    <button key={p.key}
                      onClick={() => { setPriority(p.key); patchNow({ priority: p.key }); }}
                      style={{ padding: "7px 15px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "transform .12s, box-shadow .12s, filter .12s", border: active ? `1.5px solid ${p.grad[0]}cc` : `1px solid rgba(255,255,255,.1)`, background: active ? p.activeColor : "rgba(255,255,255,.04)", color: active ? p.textColor : S.dim, boxShadow: active ? activeShadow : idleShadow }}
                      onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1.5px)"; e.currentTarget.style.boxShadow = active ? `0 0 0 4px ${p.grad[0]}16, 0 5px 16px rgba(0,0,0,.4)` : "0 4px 14px rgba(0,0,0,.38)"; if (!active) e.currentTarget.style.filter = "brightness(1.2)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = active ? activeShadow : idleShadow; e.currentTarget.style.filter = ""; }}
                    >
                      {active && <span style={{ marginRight: 5 }}>●</span>}{p.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Meta card ── */}
      <div style={sectionCard}>
        {([
          isTask && {
            label: "Due Date",
            content: <input type="date" value={dueDate} onChange={(e) => { setDueDate(e.target.value); patchNow({ due_date: e.target.value || null }); }} style={{ ...fieldStyle, width: "fit-content" }} onFocus={focusField} onBlur={blurField} />,
          },
          !isTask && {
            label: "Start",
            content: <input type={isAllDay ? "date" : "datetime-local"} value={isAllDay ? startAt.split("T")[0] : startAt} onChange={(e) => {
              setStartAt(e.target.value);
              const utc = e.target.value ? (isAllDay ? e.target.value : localToUtcIso(e.target.value)) : null;
              patchNow({ start_at: utc });
            }} style={{ ...fieldStyle, width: "fit-content" }} onFocus={focusField} onBlur={blurField} />,
          },
          !isTask && {
            label: "End",
            content: <input type={isAllDay ? "date" : "datetime-local"} value={isAllDay ? endAt.split("T")[0] : endAt} onChange={(e) => {
              setEndAt(e.target.value);
              const utc = e.target.value ? (isAllDay ? e.target.value : localToUtcIso(e.target.value)) : null;
              patchNow({ end_at: utc });
            }} style={{ ...fieldStyle, width: "fit-content" }} onFocus={focusField} onBlur={blurField} />,
          },
          !isTask && {
            label: "All Day",
            content: (
              <div onClick={() => { setIsAllDay(v => !v); patchNow({ is_all_day: !isAllDay }); }} style={{ width: 38, height: 21, borderRadius: 11, cursor: "pointer", position: "relative", flexShrink: 0, background: isAllDay ? "var(--gg-primary, #2563eb)" : "rgba(255,255,255,.12)", boxShadow: isAllDay ? "0 0 8px color-mix(in srgb, var(--gg-primary, #2563eb) 45%, transparent)" : "inset 0 1px 3px rgba(0,0,0,.4)", transition: "background .2s, box-shadow .2s" }}>
                <div style={{ position: "absolute", top: 2, left: isAllDay ? 19 : 2, width: 17, height: 17, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,.35)", transition: "left .2s" }} />
              </div>
            ),
          },
          !isTask && {
            label: "Location / Link",
            content: (
              <LocationPicker
                value={locationValue}
                onChange={(v) => {
                  setLocationValue(v);
                  patchNow({
                    location_id: v?.type === "location" ? v.locationId : null,
                    meeting_url: v?.type === "url" ? v.url : null,
                  });
                }}
                mode="compact"
              />
            ),
          },
          calTypes.length > 0 && {
            label: "Calendar",
            content: (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {calTypes.map((ct) => {
                  const dot    = calDot(ct.color);
                  const active = calTypeId === ct.id;
                  return (
                    <button
                      key={ct.id}
                      type="button"
                      onClick={() => {
                        const newVis = calVisibility(ct);
                        setCalTypeId(ct.id);
                        setVisibility(newVis);
                        patchNow({ visibility: newVis });
                      }}
                      style={{
                        display: "flex", alignItems: "center", gap: 5,
                        padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                        cursor: "pointer", transition: "all .12s",
                        border: active ? `1px solid ${dot}55` : "1px solid rgba(255,255,255,.09)",
                        background: active ? `${dot}22` : "rgba(255,255,255,.04)",
                        color: active ? "rgb(148 163 184)" : "rgb(100 116 139)",
                        boxShadow: active ? `0 0 8px ${dot}20` : "none",
                      }}
                    >
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot, flexShrink: 0 }} />
                      {ct.name}
                    </button>
                  );
                })}
              </div>
            ),
          },
          {
            label: "Visibility",
            content: <select value={visibility} onChange={(e) => { setVisibility(e.target.value); patchNow({ visibility: e.target.value }); }} style={{ ...fieldStyle, width: "fit-content" }} onFocus={focusField} onBlur={blurField}>{VISIBILITIES.map(v => <option key={v.key} value={v.key}>{v.label}</option>)}</select>,
          },
          { label: "Created", content: <span style={{ fontSize: 12, color: S.dim }}>{fmtDate(item.created_at)}</span> },
        ] as any[]).filter(Boolean).map((row: any, i: number, arr: any[]) => (
          <div key={row.label} style={{ display: "grid", gridTemplateColumns: "130px 1fr", alignItems: "center", gap: 12, padding: "12px 18px", borderBottom: i < arr.length - 1 ? `1px solid ${S.border}` : "none", transition: "background .12s" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,.02)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <span style={{ fontSize: 12, fontWeight: 600, color: S.dim }}>{row.label}</span>
            {row.content}
          </div>
        ))}
      </div>

      {/* ── Description ── */}
      <div>
        <div style={SECTION_HEADER}>Description{!isTask && <span style={{ fontWeight: 400, textTransform: "none", fontSize: 10, opacity: 0.6 }}> — shown on public calendars</span>}</div>
        <textarea value={desc} onChange={(e) => { setDesc(e.target.value); patchDebounced({ description: e.target.value || null }); }} placeholder="Add a description…" rows={3}
          style={{ width: "100%", background: S.card, border: `1px solid ${S.border}`, borderRadius: 10, padding: "12px 14px", color: S.text, fontSize: 13, lineHeight: 1.6, resize: "vertical", outline: "none", transition: "border-color .15s, box-shadow .15s" }}
          onFocus={(e) => { e.currentTarget.style.borderColor = "color-mix(in srgb, var(--gg-primary, #2563eb) 55%, transparent)"; e.currentTarget.style.boxShadow = "0 0 0 3px color-mix(in srgb, var(--gg-primary, #2563eb) 14%, transparent)"; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = S.border; e.currentTarget.style.boxShadow = "none"; }}
        />
      </div>

      {/* ── Event notes ── */}
      {item.item_type === "event" && (
        <div>
          <div style={SECTION_HEADER}>Notes <span style={{ fontWeight: 400, textTransform: "none", opacity: 0.6 }}>— internal only</span></div>
          <textarea value={meetingNotes} onChange={(e) => { setMeetingNotes(e.target.value); patchDebounced({ meeting_notes: e.target.value || null }); }} placeholder="Internal notes…" rows={4}
            style={{ width: "100%", background: "rgba(255,255,255,.04)", border: `1px solid ${S.border}`, borderRadius: 10, padding: "12px 14px", color: S.text, fontSize: 13, lineHeight: 1.6, resize: "vertical", outline: "none", transition: "border-color .15s, box-shadow .15s" }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "color-mix(in srgb, var(--gg-primary, #2563eb) 55%, transparent)"; e.currentTarget.style.boxShadow = "0 0 0 3px color-mix(in srgb, var(--gg-primary, #2563eb) 14%, transparent)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = S.border; e.currentTarget.style.boxShadow = "none"; }}
          />
        </div>
      )}

      {/* ── Meeting agenda + notes ── */}
      {item.item_type === "meeting" && (<>
        <div>
          <div style={SECTION_HEADER}>Agenda</div>
          <textarea value={agenda} onChange={(e) => { setAgenda(e.target.value); patchDebounced({ agenda: e.target.value || null }); }} placeholder="Meeting agenda…" rows={4}
            style={{ width: "100%", background: "rgba(255,255,255,.04)", border: `1px solid ${S.border}`, borderRadius: 10, padding: "12px 14px", color: S.text, fontSize: 13, lineHeight: 1.6, resize: "vertical", outline: "none", transition: "border-color .15s, box-shadow .15s" }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "color-mix(in srgb, var(--gg-primary, #2563eb) 55%, transparent)"; e.currentTarget.style.boxShadow = "0 0 0 3px color-mix(in srgb, var(--gg-primary, #2563eb) 14%, transparent)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = S.border; e.currentTarget.style.boxShadow = "none"; }}
          />
        </div>
        <div>
          <div style={SECTION_HEADER}>Notes</div>
          <textarea value={meetingNotes} onChange={(e) => { setMeetingNotes(e.target.value); patchDebounced({ meeting_notes: e.target.value || null }); }} placeholder="Notes from the meeting…" rows={4}
            style={{ width: "100%", background: "rgba(255,255,255,.04)", border: `1px solid ${S.border}`, borderRadius: 10, padding: "12px 14px", color: S.text, fontSize: 13, lineHeight: 1.6, resize: "vertical", outline: "none", transition: "border-color .15s, box-shadow .15s" }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "color-mix(in srgb, var(--gg-primary, #2563eb) 55%, transparent)"; e.currentTarget.style.boxShadow = "0 0 0 3px color-mix(in srgb, var(--gg-primary, #2563eb) 14%, transparent)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = S.border; e.currentTarget.style.boxShadow = "none"; }}
          />
        </div>
      </>)}

      {/* ── Assignees ── */}
      <div>
        <div style={SECTION_HEADER}>
          {item.item_type === "task" ? "Assignees" : item.item_type === "event" ? "Attendees" : "Participants"}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {assignments.map((a) => {
            const u = userMap.get(a.user_id);
            const name = u?.name || u?.email || a.user_id.slice(0, 8);
            const hue  = userHue(name);
            return (
              <div key={a.user_id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 10px 5px 6px", borderRadius: 20, background: `hsl(${hue},45%,18%)`, border: `1px solid hsl(${hue},45%,28%)` }}>
                <span style={{ width: 22, height: 22, borderRadius: "50%", background: `hsl(${hue},55%,32%)`, border: `1.5px solid hsl(${hue},55%,45%)`, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{userInitials(name)}</span>
                <span style={{ fontSize: 12, fontWeight: 500, color: `hsl(${hue},60%,80%)` }}>{name}</span>
                <button onClick={() => handleRemoveAssignee(a.user_id)} style={{ background: "none", border: "none", cursor: "pointer", color: `hsl(${hue},40%,55%)`, fontSize: 13, padding: 0, lineHeight: 1, display: "flex", alignItems: "center" }} title="Remove">×</button>
              </div>
            );
          })}
          {unassigned.length > 0 && (
            <div style={{ position: "relative" }} ref={addUserRef}>
              <button onClick={() => setShowAddUser(v => !v)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600, border: "1px dashed rgba(255,255,255,.15)", background: "rgba(255,255,255,.04)", color: S.dimBright, cursor: "pointer", transition: "all .12s" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,.08)"; e.currentTarget.style.borderColor = "rgba(255,255,255,.25)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,.04)"; e.currentTarget.style.borderColor = "rgba(255,255,255,.15)"; }}
              >+ Add</button>
              {showAddUser && (
                <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 50, background: "rgba(16,20,32,.97)", backdropFilter: "blur(16px)", border: `1px solid rgba(255,255,255,.1)`, borderRadius: 12, padding: 4, minWidth: 200, boxShadow: "0 14px 40px rgba(0,0,0,.55)", maxHeight: 220, overflowY: "auto" }}>
                  {unassigned.map((u) => {
                    const hue = userHue(u.name || u.email);
                    return (
                      <button key={u.id} onClick={() => handleAddAssignee(u.id)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px", background: "none", border: "none", color: S.text, cursor: "pointer", borderRadius: 7, fontSize: 13, textAlign: "left" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,.06)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                      >
                        <span style={{ width: 22, height: 22, borderRadius: "50%", background: `hsl(${hue},55%,32%)`, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{userInitials(u.name || u.email)}</span>
                        <span>{u.name || u.email}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Sub-items ── */}
      {item.depth < 3 && (
        <div style={sectionCard}>
          <div style={{ padding: "14px 18px", borderBottom: `1px solid ${S.border}` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: children.length > 0 ? 10 : 0 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: S.text }}>Sub-items</span>
              <span style={{ fontSize: 11, color: S.dim }}>{childrenDone}/{children.length} done</span>
            </div>
            {children.length > 0 && (
              <div style={{ height: 4, borderRadius: 4, background: "rgba(255,255,255,.08)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${children.length > 0 ? Math.round(childrenDone / children.length * 100) : 0}%`, background: "var(--gg-primary, #2563eb)", borderRadius: 4, transition: "width .3s" }} />
              </div>
            )}
          </div>
          {children.length > 0 && (
            <div style={{ borderBottom: `1px solid ${S.border}` }}>
              {children.map((child: any) => {
                const childDef    = typeDefs[child.item_type];
                const childStages = (childDef?.stages ?? []) as Stage[];
                const cStage      = childStages.find(s => s.slug === child.status);
                const cSc         = sc(cStage?.color ?? "white");
                const done        = cStage?.is_terminal ?? false;
                return (
                  <Link key={child.id} href={`/crm/sitrep/${child.id}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 18px", textDecoration: "none", borderBottom: `1px solid ${S.border}`, transition: "background .1s" }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.025)")}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
                  >
                    <span style={{ fontSize: 11, color: cSc.textColor, flexShrink: 0 }}>{cSc.icon}</span>
                    <span style={{ fontSize: 13, color: done ? S.dim : S.text, flex: 1, textDecoration: done ? "line-through" : "none", opacity: done ? 0.6 : 1 }}>{child.title}</span>
                    {cStage && <span style={{ fontSize: 10, color: cSc.textColor, background: cSc.activeColor, padding: "2px 7px", borderRadius: 10, flexShrink: 0 }}>{cStage.name}</span>}
                  </Link>
                );
              })}
            </div>
          )}
          <div style={{ padding: "10px 18px", display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select value={newChildType} onChange={(e) => setNewChildType(e.target.value)} style={{ ...fieldStyle, width: "fit-content" }} onFocus={focusField} onBlur={blurField}>
              {Object.entries(typeDefs).map(([slug, t]: [string, any]) => (
                <option key={slug} value={slug}>{t.name ?? slug}</option>
              ))}
            </select>
            <input
              type="text" value={newChildTitle} placeholder="Sub-item title…"
              onChange={(e) => setNewChildTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddChild()}
              style={{ ...fieldStyle, flex: 1, minWidth: 140 }} onFocus={focusField} onBlur={blurField}
            />
            <button onClick={handleAddChild} disabled={addingChild || !newChildTitle.trim()} style={{ padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, border: "none", background: "var(--gg-primary, #2563eb)", color: "#fff", cursor: "pointer", opacity: newChildTitle.trim() ? 1 : 0.4 }}>
              {addingChild ? "…" : "Add"}
            </button>
          </div>
        </div>
      )}

      {/* ── Dependencies ── */}
      {(hasDeps || true) && (
        <div style={sectionCard}>
          <div style={{ padding: "12px 18px", borderBottom: `1px solid ${S.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: S.text }}>Dependencies</span>
            <button onClick={() => setShowAddDep(v => !v)} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 8, border: "1px dashed rgba(255,255,255,.2)", background: "none", color: S.dim, cursor: "pointer" }}>+ Add</button>
          </div>
          {showAddDep && (
            <div style={{ padding: "10px 18px", borderBottom: `1px solid ${S.border}`, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <select value={depType} onChange={(e) => setDepType(e.target.value)} style={{ ...fieldStyle, width: "fit-content" }} onFocus={focusField} onBlur={blurField}>
                {DEP_TYPES.map(t => <option key={t} value={t}>{DEP_LABELS[t]}</option>)}
              </select>
              <input type="text" value={depTargetId} onChange={(e) => setDepTargetId(e.target.value)} placeholder="Target item ID" style={{ ...fieldStyle, flex: 1, minWidth: 140 }} onFocus={focusField} onBlur={blurField} />
              <button onClick={handleAddDep} disabled={addingDep || !depTargetId.trim()} style={{ padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, border: "none", background: "var(--gg-primary, #2563eb)", color: "#fff", cursor: "pointer", opacity: depTargetId.trim() ? 1 : 0.4 }}>
                {addingDep ? "…" : "Link"}
              </button>
            </div>
          )}
          {deps.outgoing.length === 0 && deps.incoming.length === 0 && !showAddDep && (
            <div style={{ padding: "14px 18px", fontSize: 12, color: S.dim }}>No dependencies.</div>
          )}
          {deps.outgoing.map((d: any) => (
            <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 18px", borderBottom: `1px solid ${S.border}` }}>
              <span style={{ fontSize: 10, fontWeight: 700, background: "rgba(255,255,255,.06)", padding: "2px 7px", borderRadius: 6, color: S.dim, flexShrink: 0 }}>{DEP_LABELS[d.dep_type] ?? d.dep_type}</span>
              <Link href={`/crm/sitrep/${d.other_item?.id ?? d.to_item_id ?? ""}`} style={{ fontSize: 13, color: S.text, flex: 1, textDecoration: "none" }}>
                {d.other_item?.title ?? d.to_item_id}
              </Link>
              <button onClick={() => handleRemoveDep(d.id)} style={{ background: "none", border: "none", cursor: "pointer", color: S.dim, fontSize: 16, lineHeight: 1, padding: "2px 4px" }} title="Remove">×</button>
            </div>
          ))}
          {deps.incoming.map((d: any) => (
            <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 18px", borderBottom: `1px solid ${S.border}` }}>
              <span style={{ fontSize: 10, fontWeight: 700, background: "rgba(99,102,241,.1)", padding: "2px 7px", borderRadius: 6, color: "#a5b4fc", flexShrink: 0 }}>Blocked by</span>
              <Link href={`/crm/sitrep/${d.other_item?.id ?? d.from_item_id ?? ""}`} style={{ fontSize: 13, color: S.text, flex: 1, textDecoration: "none" }}>
                {d.other_item?.title ?? d.from_item_id}
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* ── Linked CRM records ── */}
      {item.sitrep_links?.length > 0 && (
        <div>
          <div style={SECTION_HEADER}>Linked Records</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {item.sitrep_links.map((link) => (
              <div key={link.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: S.card, border: `1px solid ${S.border}`, borderRadius: 8, fontSize: 13 }}>
                <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.06em", padding: "2px 6px", borderRadius: 4, background: "rgba(255,255,255,.08)", color: S.dim }}>{LINK_TYPE_LABELS[link.record_type] ?? link.record_type.toUpperCase()}</span>
                <span style={{ color: S.text }}>{link.display_label ?? link.record_id.slice(0, 8) + "…"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Custom Fields ── */}
      <CustomFieldsWidget
        recordType="sitrep_items"
        recordId={item.id}
        sitrepTypeId={sitrepTypeId}
        initialValues={item.custom_fields ?? {}}
      />

      {/* ── Comments ── */}
      <div style={sectionCard}>
        <div style={{ padding: "12px 18px", borderBottom: comments.length > 0 ? `1px solid ${S.border}` : "none" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: S.text }}>
            Comments {comments.length > 0 && <span style={{ fontSize: 11, color: S.dim, fontWeight: 400 }}>({comments.length})</span>}
          </span>
        </div>
        {comments.map((c: any) => {
          const u    = userMap.get(c.author_id);
          const name = u?.name || u?.email || c.author_id?.slice(0, 8) || "Unknown";
          const hue  = userHue(name);
          const isOwn = c.author_id === currentUserId;
          return (
            <div key={c.id} style={{ padding: "12px 18px", borderBottom: `1px solid ${S.border}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ width: 22, height: 22, borderRadius: "50%", background: `hsl(${hue},55%,32%)`, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{userInitials(name)}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: S.dimBright }}>{name}</span>
                <span style={{ fontSize: 11, color: S.dim }}>{fmtRelative(c.created_at)}</span>
                {c.edited_at && <span style={{ fontSize: 10, color: S.dim, opacity: 0.6 }}>(edited)</span>}
                <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                  {isOwn && editCmtId !== c.id && <button onClick={() => { setEditCmtId(c.id); setEditCmtBody(c.body); }} style={{ fontSize: 11, background: "none", border: "none", color: S.dim, cursor: "pointer", padding: "2px 6px" }}>Edit</button>}
                  {isOwn && <button onClick={() => handleDeleteComment(c.id)} style={{ fontSize: 11, background: "none", border: "none", color: "rgba(239,68,68,.5)", cursor: "pointer", padding: "2px 6px" }}>Del</button>}
                </div>
              </div>
              {editCmtId === c.id ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <textarea value={editCmtBody} onChange={(e) => setEditCmtBody(e.target.value)} rows={2} style={{ width: "100%", background: "rgba(255,255,255,.04)", border: `1px solid ${S.border}`, borderRadius: 8, padding: "8px 10px", color: S.text, fontSize: 13, lineHeight: 1.5, resize: "vertical", outline: "none" }} />
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={handleEditComment} style={{ fontSize: 12, fontWeight: 600, padding: "4px 12px", borderRadius: 7, border: "none", background: "var(--gg-primary, #2563eb)", color: "#fff", cursor: "pointer" }}>Save</button>
                    <button onClick={() => { setEditCmtId(null); setEditCmtBody(""); }} style={{ fontSize: 12, padding: "4px 12px", borderRadius: 7, border: `1px solid ${S.border}`, background: "none", color: S.dim, cursor: "pointer" }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: 13, color: S.text, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{c.body}</p>
              )}
            </div>
          );
        })}
        <div style={{ padding: "10px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
          <textarea value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Add a comment…" rows={2}
            style={{ width: "100%", background: "rgba(255,255,255,.04)", border: `1px solid ${S.border}`, borderRadius: 8, padding: "8px 10px", color: S.text, fontSize: 13, lineHeight: 1.5, resize: "vertical", outline: "none", transition: "border-color .15s, box-shadow .15s" }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "color-mix(in srgb, var(--gg-primary, #2563eb) 55%, transparent)"; e.currentTarget.style.boxShadow = "0 0 0 3px color-mix(in srgb, var(--gg-primary, #2563eb) 14%, transparent)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = S.border; e.currentTarget.style.boxShadow = "none"; }}
          />
          {newComment.trim() && (
            <button onClick={handleSubmitComment} disabled={submittingCmt} style={{ alignSelf: "flex-end", fontSize: 12, fontWeight: 600, padding: "5px 16px", borderRadius: 8, border: "none", background: "var(--gg-primary, #2563eb)", color: "#fff", cursor: "pointer" }}>
              {submittingCmt ? "Posting…" : "Post"}
            </button>
          )}
        </div>
      </div>

      {/* ── Activity log ── */}
      <div style={{ background: "rgba(20,25,38,.6)", border: `1px solid ${S.border}`, borderRadius: 12, overflow: "hidden" }}>
        <button type="button" onClick={() => setActivityExpanded(v => !v)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 18px", background: "none", border: "none", cursor: "pointer", borderBottom: activityExpanded ? `1px solid ${S.border}` : "none" }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: S.dim, textTransform: "uppercase" }}>Activity Log</span>
          <span style={{ fontSize: 13, color: S.dim, transform: activityExpanded ? "rotate(90deg)" : "none", transition: "transform .15s", display: "inline-block" }}>›</span>
        </button>
        {activityExpanded && (
          <div style={{ maxHeight: 300, overflowY: "auto" }}>
            {activity.length === 0 ? (
              <div style={{ padding: "14px 18px", fontSize: 12, color: S.dim }}>No activity recorded.</div>
            ) : activity.map((ev: any) => {
              const u    = userMap.get(ev.actor_id);
              const name = u?.name || u?.email || "System";
              const desc = ACTIVITY_DESC[ev.event_type]?.(ev) ?? ev.event_type;
              return (
                <div key={ev.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 18px", borderBottom: `1px solid ${S.border}` }}>
                  <span style={{ fontSize: 16, flexShrink: 0, opacity: 0.4, marginTop: 1 }}>·</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 12, color: S.text }}>{desc}</span>
                    <div style={{ fontSize: 11, color: S.dim, marginTop: 2 }}>{name} · {fmtRelative(ev.created_at)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Divider ── */}
      <div style={{ height: 1, background: "rgba(255,255,255,.07)" }} />

      {/* ── Danger zone ── */}
      {isCreator && (
        <div>
          {deleteError && (
            <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(239,68,68,.12)", border: "1px solid rgba(239,68,68,.25)", color: "#fca5a5", fontSize: 13, marginBottom: 8 }}>
              {deleteError}
            </div>
          )}
          {deleteModal === "none" && (
            <button onClick={() => { setDeleteModal("confirm"); setDeleteError(null); }} style={{ display: "flex", alignItems: "center", gap: 7, background: "rgba(239,68,68,.06)", border: "1px solid rgba(239,68,68,.22)", color: "rgba(239,68,68,.65)", borderRadius: 10, padding: "8px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all .15s" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,.12)"; e.currentTarget.style.borderColor = "rgba(239,68,68,.4)"; e.currentTarget.style.color = "rgb(239 68 68)"; e.currentTarget.style.boxShadow = "0 0 14px rgba(239,68,68,.18)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(239,68,68,.06)"; e.currentTarget.style.borderColor = "rgba(239,68,68,.22)"; e.currentTarget.style.color = "rgba(239,68,68,.65)"; e.currentTarget.style.boxShadow = "none"; }}
            >
              🗑 Delete this {typeDef?.name ?? item.item_type}
            </button>
          )}
          {deleteModal === "confirm" && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "rgba(220,38,38,.08)", border: "1px solid rgba(220,38,38,.3)", borderRadius: 10 }}>
              <span style={{ fontSize: 13, color: S.text, flex: 1 }}>Delete permanently? This cannot be undone.</span>
              <button onClick={() => setDeleteModal("none")} style={{ padding: "6px 14px", borderRadius: 7, fontSize: 12, border: `1px solid ${S.border}`, background: "rgba(255,255,255,.05)", color: S.dim, cursor: "pointer" }}>Cancel</button>
              <button onClick={() => handleDelete()} disabled={deleting} style={{ padding: "6px 14px", borderRadius: 7, fontSize: 12, fontWeight: 700, border: "1px solid rgba(220,38,38,.5)", background: "rgba(220,38,38,.2)", color: "rgb(220 38 38)", cursor: "pointer" }}>
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          )}
          {deleteModal === "children" && (
            <div style={{ padding: "16px 18px", background: "rgba(220,38,38,.08)", border: "1px solid rgba(220,38,38,.3)", borderRadius: 12, display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: S.text, marginBottom: 4 }}>This item has {deleteChildCount} sub-item{deleteChildCount !== 1 ? "s" : ""}.</div>
                <div style={{ fontSize: 12, color: S.dim }}>Choose what to do with them:</div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => handleDelete("cascade")} disabled={deleting} style={{ padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600, border: "1px solid rgba(220,38,38,.4)", background: "rgba(220,38,38,.18)", color: "rgb(239 68 68)", cursor: "pointer" }}>
                  {deleting ? "Deleting…" : `Delete all ${deleteChildCount} sub-items`}
                </button>
                <button onClick={() => handleDelete("orphan")} disabled={deleting} style={{ padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600, border: `1px solid ${S.border}`, background: "rgba(255,255,255,.06)", color: S.dimBright, cursor: "pointer" }}>
                  Keep sub-items as standalone
                </button>
                <button onClick={() => { setDeleteModal("none"); setDeleteChildCount(0); }} style={{ padding: "8px 16px", borderRadius: 8, fontSize: 12, border: `1px solid ${S.border}`, background: "none", color: S.dim, cursor: "pointer" }}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ height: 32 }} />
    </div>
  );
}
