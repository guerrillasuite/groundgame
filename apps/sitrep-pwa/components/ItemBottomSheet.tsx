"use client";

import { useState, useEffect, useRef } from "react";
import BottomSheet from "./BottomSheet";
import TypePillSelector, { ItemType } from "./TypePillSelector";
import SitRepLocationPicker from "./SitRepLocationPicker";
import { getFamilyByKey } from "@/lib/sitrep-colors";
import { utcToDatetimeLocal, localToUtcIso } from "@/lib/date-utils";
import type { SitRepItem } from "@/app/(pwa)/list/ListRow";
import type { CalendarTypeData } from "@/lib/calendar-filter";

const S = {
  text:      "rgb(236 240 245)",
  dim:       "rgb(100 116 139)",
  dimBright: "rgb(148 163 184)",
  border:    "rgba(255,255,255,.08)",
} as const;

type SquadOption  = { id: string; name: string; color: string; tenantId?: string };
type OrgOption    = { id: string; name: string };
type Member       = { user_id: string; name: string; email: string };
type CalChoice    = "personal" | string; // "personal" | orgId | squadId
type VisibilityVal = "private" | "assignee_only" | "team";

const SYSTEM_TYPES: ItemType[] = [
  { id: "sys-task",    name: "Task",    slug: "task",    color: "blue"   },
  { id: "sys-event",   name: "Event",   slug: "event",   color: "green"  },
  { id: "sys-meeting", name: "Meeting", slug: "meeting", color: "purple" },
];

interface ItemBottomSheetProps {
  open: boolean;
  onClose: () => void;
  item: SitRepItem | null;
  createMode: boolean;
  types: ItemType[];
  calendarTypes?: CalendarTypeData[];
  squads?: SquadOption[];
  orgs?: OrgOption[];
  tenantId: string;
  userId: string;
  tz: string;
  onSaved: (item: SitRepItem) => void;
  onDeleted: (id: string) => void;
  onExpandItem: (id: string) => void;
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 9,
  background: "rgba(255,255,255,.05)",
  border: "1px solid rgba(255,255,255,.1)",
  color: S.text,
  fontSize: 13,
  outline: "none",
  transition: "border-color .15s, box-shadow .15s",
};

function focusIn(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
  e.currentTarget.style.borderColor = "color-mix(in srgb, var(--gg-primary, #2563eb) 55%, transparent)";
  e.currentTarget.style.boxShadow   = "0 0 0 3px color-mix(in srgb, var(--gg-primary, #2563eb) 16%, transparent)";
}
function focusOut(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
  e.currentTarget.style.borderColor = "rgba(255,255,255,.1)";
  e.currentTarget.style.boxShadow   = "none";
}

function defaultCalTypeId(calendarTypes?: CalendarTypeData[]): string {
  if (!calendarTypes?.length) return "";
  const ct = calendarTypes.find((c) => c.cal_type === "work")
    ?? calendarTypes.find((c) => c.cal_type === "family")
    ?? calendarTypes[0];
  return ct?.id ?? "";
}

function guessCalTypeId(
  calendarTypes?: CalendarTypeData[],
  item?: { tenant_id?: string; visibility?: string } | null,
): string {
  if (!calendarTypes?.length) return "";
  if (item?.visibility === "private") {
    const personal = calendarTypes.find((c) => c.cal_type === "personal");
    if (personal) return personal.id;
  }
  if (item?.tenant_id) {
    const match = calendarTypes.find((c) =>
      (c.sources ?? []).some((s) => s.type === "tenant" && s.tenant_id === item.tenant_id)
    );
    if (match) return match.id;
  }
  return defaultCalTypeId(calendarTypes);
}

function calPayload(
  calendarTypes: CalendarTypeData[] | undefined,
  selectedId: string,
  fallbackTenantId: string,
): { tenantId: string; visibility: string } {
  const ct = calendarTypes?.find((c) => c.id === selectedId);
  if (!ct) return { tenantId: fallbackTenantId, visibility: "assignee_only" };
  const src = (ct.sources ?? [])[0];
  const tid = (src && "tenant_id" in src ? src.tenant_id : null) ?? fallbackTenantId;
  if (ct.cal_type === "personal") return { tenantId: fallbackTenantId, visibility: "private" };
  if (ct.cal_type === "work" || ct.cal_type === "family") return { tenantId: tid, visibility: "team" };
  return { tenantId: tid, visibility: "assignee_only" };
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";
}

export default function ItemBottomSheet({
  open, onClose, item, createMode, types, calendarTypes, squads = [], orgs = [], tenantId, userId, tz,
  onSaved, onDeleted, onExpandItem,
}: ItemBottomSheetProps) {
  const firstOrgId = orgs[0]?.id ?? tenantId ?? "";

  type FieldOverride = { label?: string; hidden: boolean; display_scope: string };
  type SnapshotField = { field_key: string; label: string; field_type: string; options: {value: string; label: string}[]; sort_order: number };

  // Context-loaded state
  const [contextTypes,   setContextTypes]   = useState<ItemType[]>(types.length ? types : SYSTEM_TYPES);
  const [contextMembers, setContextMembers] = useState<Member[]>([]);
  const [assigneeIds,    setAssigneeIds]    = useState<string[]>([userId]);
  const [visibility,     setVisibility]     = useState<VisibilityVal>("team");
  const [fieldOverrides, setFieldOverrides] = useState<Record<string, FieldOverride>>({});
  const [snapshotFields, setSnapshotFields] = useState<SnapshotField[]>([]);
  const [cfValues,       setCfValues]       = useState<Record<string, any>>({});
  const [cfLocationDisplays, setCfLocationDisplays] = useState<Record<string, string>>({});

  // Form state
  const [title, setTitle]               = useState("");
  const [typeSlug, setTypeSlug]         = useState(types[0]?.slug ?? "task");
  const [selectedCalId, setSelectedCalId] = useState(() => defaultCalTypeId(calendarTypes));
  const [calChoice, setCalChoice]       = useState<CalChoice>(() => firstOrgId || "personal");
  const [dueDateLocal, setDueDateLocal] = useState("");
  const [locationId,      setLocationId]      = useState<string | null>(null);
  const [locationDisplay, setLocationDisplay] = useState("");
  const [saving, setSaving]             = useState(false);
  const [deleting, setDeleting]         = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [errorMsg, setErrorMsg]         = useState<string | null>(null);
  const titleRef    = useRef<HTMLInputElement>(null);
  const [titleShake, setTitleShake] = useState(false);

  // Reset form when sheet opens
  useEffect(() => {
    if (!open) return;
    if (createMode) {
      setTitle("");
      setTypeSlug((types.length ? types : SYSTEM_TYPES)[0]?.slug ?? "task");
      setSelectedCalId(defaultCalTypeId(calendarTypes));
      setCalChoice(firstOrgId || "personal");
      setDueDateLocal("");
      setLocationId(null);
      setLocationDisplay("");
      setAssigneeIds([userId]);
      setVisibility("team");
    } else if (item) {
      setTitle(item.title);
      setTypeSlug(item.item_type);
      setSelectedCalId(guessCalTypeId(calendarTypes, item as any));
      const itemVis = (item as any).visibility ?? "team";
      setVisibility(itemVis as VisibilityVal);
      const ids = item.sitrep_assignments?.map((a) => a.user_id) ?? [userId];
      setAssigneeIds(ids.length ? ids : [userId]);
      if (itemVis === "private") {
        setCalChoice("personal");
      } else if ((item as any).squad_id) {
        setCalChoice((item as any).squad_id);
      } else {
        setCalChoice((item as any).tenant_id ?? firstOrgId ?? "personal");
      }
      const stored = (item as any).start_at ?? item.due_date ?? null;
      if (!stored) {
        setDueDateLocal("");
      } else if (stored.includes("T") || stored.endsWith("Z")) {
        // Full datetime — convert UTC → local "YYYY-MM-DDTHH:mm"
        setDueDateLocal(utcToDatetimeLocal(stored));
      } else {
        // Date-only — just show the date, no forced midnight time
        setDueDateLocal(stored);
      }
      const lid = (item as any).location_id ?? null;
      setLocationId(lid);
      setLocationDisplay("");
      if (lid && tenantId) {
        fetch(`/api/sitrep/locations?tenantId=${encodeURIComponent(tenantId)}&id=${encodeURIComponent(lid)}`)
          .then((r) => r.ok ? r.json() : null)
          .then((d) => { if (d?.display) setLocationDisplay(d.display); })
          .catch(() => {});
      }
    }
    // Reset snapshot custom field values from existing item
    setCfValues((item as any)?.custom_fields ?? {});
    setConfirmDelete(false);
    setSaving(false);
    setErrorMsg(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, createMode, item]);

  // Fetch context types + members when calChoice changes
  useEffect(() => {
    if (calChoice === "personal") {
      setContextTypes(types.length ? types : SYSTEM_TYPES);
      setContextMembers([]);
      if (createMode) setVisibility("private");
      return;
    }
    const isOrg = orgs.some((o) => o.id === calChoice);
    const tid   = isOrg ? calChoice : (squads.find((s) => s.id === calChoice)?.tenantId ?? null);
    const sqId  = isOrg ? null : calChoice;
    if (!tid) { setContextTypes(types.length ? types : SYSTEM_TYPES); setContextMembers([]); return; }

    const params = new URLSearchParams({ tenantId: tid });
    if (sqId) params.set("squadId", sqId);
    fetch(`/api/sitrep/org-context?${params}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data) return;
        setContextTypes(data.types?.length ? data.types : (types.length ? types : SYSTEM_TYPES));
        setContextMembers(data.members ?? []);
        setFieldOverrides(data.fieldOverrides ?? {});
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calChoice]);

  // If the current typeSlug isn't available in the new context, reset to first
  useEffect(() => {
    if (contextTypes.length && !contextTypes.some((t) => t.slug === typeSlug)) {
      setTypeSlug(contextTypes[0].slug);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextTypes]);

  // Fetch display names for location-type snapshot fields once fields are known
  useEffect(() => {
    const locFields = snapshotFields.filter(sf => sf.field_type === "location");
    for (const sf of locFields) {
      const id = cfValues[sf.field_key];
      if (!id || !tenantId) continue;
      fetch(`/api/sitrep/locations?tenantId=${encodeURIComponent(tenantId)}&id=${encodeURIComponent(id)}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.display) setCfLocationDisplays(prev => ({ ...prev, [sf.field_key]: d.display })); })
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshotFields]);

  // Fetch snapshot custom fields when type or context changes
  useEffect(() => {
    const isOrg = orgs.some((o) => o.id === calChoice);
    const tid = calChoice === "personal" ? null
      : isOrg ? calChoice
      : (squads.find((s) => s.id === calChoice)?.tenantId ?? null);
    const currentTypeObj = contextTypes.find((t) => t.slug === typeSlug);
    if (!tid || !currentTypeObj) { setSnapshotFields([]); return; }
    const params = new URLSearchParams({ tenantId: tid, itemTypeId: currentTypeObj.id });
    fetch(`/api/sitrep/custom-fields?${params}`)
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setSnapshotFields(Array.isArray(data) ? data : []))
      .catch(() => setSnapshotFields([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeSlug, contextTypes, calChoice]);

  const currentType = contextTypes.find((t) => t.slug === typeSlug) ?? contextTypes[0];
  const family = getFamilyByKey(currentType?.color ?? "blue");
  const accent = family?.shades[2] ?? "#3b82f6";

  function isHidden(key: string): boolean {
    return fieldOverrides[key]?.hidden === true;
  }

  function toggleAssignee(uid: string) {
    setAssigneeIds((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  }

  async function handleSave() {
    if (!title.trim()) {
      setTitleShake(true);
      titleRef.current?.focus();
      setTimeout(() => setTitleShake(false), 500);
      return;
    }
    setSaving(true);

    // For tasks, time is optional — only convert if the user actually set a time (has "T").
    // Events/meetings always use datetime-local so they always have a time.
    const dueDateHasTime = dueDateLocal.includes("T");
    const dueDateUtc = (dueDateLocal && dueDateHasTime) ? localToUtcIso(dueDateLocal) : null;
    const dueDateOnly = dueDateLocal ? dueDateLocal.split("T")[0] : null;

    // Legacy calendarTypes path
    const cal = calendarTypes?.length && selectedCalId
      ? calPayload(calendarTypes, selectedCalId, tenantId)
      : null;

    // New calChoice path
    const choicePayload = !cal ? (() => {
      if (calChoice === "personal") {
        return { visibility: "private" as VisibilityVal, squad_id: null, tenantId: null };
      }
      const isOrg = orgs.some((o) => o.id === calChoice);
      if (isOrg) {
        return { visibility, squad_id: null, tenantId: calChoice };
      }
      const sq = squads.find((s) => s.id === calChoice);
      return { visibility, squad_id: calChoice, tenantId: sq?.tenantId ?? firstOrgId ?? null };
    })() : null;

    const effectiveVisibility = cal?.visibility ?? choicePayload?.visibility ?? visibility;
    const effectiveAssignees  = effectiveVisibility === "private" ? [userId] : assigneeIds;

    const isTask = typeSlug === "task";
    const payload: Record<string, unknown> = {
      title:      title.trim(),
      item_type:  typeSlug,
      due_date:   isTask ? dueDateOnly : null,
      start_at:   isTask ? dueDateUtc : (dueDateLocal ? localToUtcIso(dueDateLocal) : null),
      location_id:   locationId,
      ...(Object.keys(cfValues).length > 0 ? { custom_fields: cfValues } : {}),
      tenantId:   cal?.tenantId ?? choicePayload?.tenantId ?? tenantId ?? null,
      created_by: userId,
      visibility: effectiveVisibility,
      assignees:  effectiveAssignees,
      ...(choicePayload ? { squad_id: choicePayload.squad_id } : {}),
    };

    setErrorMsg(null);
    try {
      let result: SitRepItem;
      if (createMode) {
        const res = await fetch("/api/sitrep/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          let msg = `Server error ${res.status}`;
          try { msg = JSON.parse(text)?.error ?? msg; } catch { if (text) msg = text.slice(0, 200); }
          throw new Error(msg);
        }
        result = await res.json();
      } else {
        const res = await fetch(`/api/sitrep/items/${item!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, id: item!.id }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          let msg = `Server error ${res.status}`;
          try { msg = JSON.parse(text)?.error ?? msg; } catch { if (text) msg = text.slice(0, 200); }
          throw new Error(msg);
        }
        result = await res.json();
      }
      onSaved(result);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Save failed");
      setSaving(false);
      return;
    }
    setSaving(false);
  }

  async function handleComplete() {
    if (!item) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const itemTenantId = (item as any).tenant_id ?? null;
      const res = await fetch(`/api/sitrep/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "done", tenantId: itemTenantId }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed");
      const updated = await res.json();
      onSaved({ ...item, ...updated, status: "done" });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to complete");
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!item) return;
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    setErrorMsg(null);
    try {
      const itemTenantId = (item as any).tenant_id ?? null;
      const res = await fetch(`/api/sitrep/items/${item.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: itemTenantId }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed");
      onDeleted(item.id);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to delete");
    }
    setDeleting(false);
  }

  const isPersonal  = calChoice === "personal";
  const showMembers = !isPersonal && contextMembers.length > 0;

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div style={{ padding: "4px 16px 16px", display: "flex", flexDirection: "column", gap: 14 }}>

        {/* ── Context / calendar picker — TOP ── */}
        {(!calendarTypes || calendarTypes.length === 0) && !isHidden("calendar_badge") && (
          <div style={{ overflowX: "auto", display: "flex", gap: 6, paddingBottom: 2, scrollbarWidth: "none" }}>
            {[
              { key: "personal", label: "Personal", color: "#94a3b8" },
              ...orgs.map((org) => ({ key: org.id, label: org.name, color: "#818cf8" })),
              ...squads.map((sq) => ({
                key:   sq.id,
                label: sq.name,
                color: getFamilyByKey(sq.color)?.shades[3] ?? "#818cf8",
              })),
            ].map((opt) => {
              const active = calChoice === opt.key;
              return (
                <button
                  key={opt.key}
                  onClick={() => setCalChoice(opt.key as CalChoice)}
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    flexShrink: 0, padding: "5px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                    cursor: "pointer",
                    border: active ? `1px solid ${opt.color}55` : "1px solid rgba(255,255,255,.08)",
                    background: active ? `${opt.color}22` : "rgba(255,255,255,.03)",
                    color: active ? S.dimBright : S.dim,
                    transition: "all .12s",
                  }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: opt.color, flexShrink: 0 }} />
                  {opt.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Legacy calendarTypes picker */}
        {calendarTypes && calendarTypes.length > 0 && !isHidden("calendar_badge") && (
          <div style={{ overflowX: "auto", display: "flex", gap: 6, paddingBottom: 2, scrollbarWidth: "none" }}>
            {calendarTypes.map((ct) => {
              const dot    = getFamilyByKey(ct.color)?.shades[3] ?? "#818cf8";
              const active = selectedCalId === ct.id;
              return (
                <button
                  key={ct.id}
                  onClick={() => setSelectedCalId(ct.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    flexShrink: 0, padding: "5px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                    cursor: "pointer",
                    border: active ? `1px solid ${dot}55` : "1px solid rgba(255,255,255,.08)",
                    background: active ? `${dot}22` : "rgba(255,255,255,.03)",
                    color: active ? S.dimBright : S.dim,
                    transition: "all .12s",
                  }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot, flexShrink: 0 }} />
                  {ct.name}
                </button>
              );
            })}
          </div>
        )}

        {/* ── Type selector + expand + close ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <TypePillSelector types={contextTypes} value={typeSlug} onChange={setTypeSlug} />
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
            {!createMode && item && (
              <button
                onClick={() => onExpandItem(item.id)}
                title="Open full view"
                style={{
                  width: 32, height: 32, borderRadius: 8,
                  border: "1px solid rgba(255,255,255,.1)", background: "rgba(255,255,255,.05)",
                  color: S.dim, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
                }}
              >
                ↗
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                width: 32, height: 32, borderRadius: 8,
                border: "1px solid rgba(255,255,255,.1)", background: "rgba(255,255,255,.05)",
                color: S.dim, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
              }}
            >
              ×
            </button>
          </div>
        </div>

        {/* ── Title ── */}
        <div style={{ animation: titleShake ? "shake .35s ease" : "none" }}>
          <style>{`@keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-5px)}40%,80%{transform:translateX(5px)}}`}</style>
          <input
            ref={titleRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs to happen?"
            style={{
              width: "100%", background: "none", border: "none", outline: "none",
              color: S.text, fontSize: 18, fontWeight: 600, padding: "4px 0",
            }}
          />
        </div>

        {/* ── Due date / time ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={S.dim} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          {typeSlug === "task" ? (
            <div style={{ flex: 1, display: "flex", gap: 6 }}>
              <input
                type="date"
                value={dueDateLocal.split("T")[0] || ""}
                onChange={(e) => {
                  const t = dueDateLocal.includes("T") ? dueDateLocal.split("T")[1] : "";
                  setDueDateLocal(t ? `${e.target.value}T${t}` : e.target.value);
                }}
                style={{ ...inputStyle, flex: 1, colorScheme: "dark" }}
                onFocus={focusIn}
                onBlur={focusOut}
              />
              <input
                type="time"
                value={dueDateLocal.includes("T") ? dueDateLocal.split("T")[1] : ""}
                onChange={(e) => {
                  const d = dueDateLocal.split("T")[0] || "";
                  setDueDateLocal(e.target.value ? `${d}T${e.target.value}` : d);
                }}
                style={{ ...inputStyle, width: 108, colorScheme: "dark" }}
                onFocus={focusIn}
                onBlur={focusOut}
              />
            </div>
          ) : (
            <input
              type="datetime-local"
              value={dueDateLocal}
              onChange={(e) => setDueDateLocal(e.target.value)}
              style={{ ...inputStyle, colorScheme: "dark" }}
              onFocus={focusIn}
              onBlur={focusOut}
            />
          )}
        </div>

        {/* ── Location ── */}
        <SitRepLocationPicker
          tenantId={tenantId}
          locationId={locationId}
          locationDisplay={locationDisplay}
          onSelect={(id, display) => { setLocationId(id); setLocationDisplay(display); }}
        />

        {/* ── Snapshot custom fields ── */}
        {snapshotFields.map((sf) => {
          const val = cfValues[sf.field_key] ?? "";
          const setVal = (v: any) => setCfValues((prev) => ({ ...prev, [sf.field_key]: v === "" ? null : v }));
          return (
            <div key={sf.field_key}>
              <div style={{ fontSize: 11, fontWeight: 600, color: S.dim, marginBottom: 5, textTransform: "uppercase", letterSpacing: ".04em" }}>
                {sf.label}
              </div>
              {sf.field_type === "boolean" ? (
                <button
                  onClick={() => setVal(!val)}
                  style={{
                    padding: "8px 14px", borderRadius: 9, fontSize: 13, cursor: "pointer",
                    background: val ? "rgba(99,102,241,.2)" : "rgba(255,255,255,.05)",
                    border: val ? "1px solid rgba(99,102,241,.4)" : "1px solid rgba(255,255,255,.1)",
                    color: S.text,
                  }}
                >
                  {val ? "Yes" : "No"}
                </button>
              ) : sf.field_type === "location" ? (
                <SitRepLocationPicker
                  tenantId={tenantId}
                  locationId={val ?? null}
                  locationDisplay={cfLocationDisplays[sf.field_key] ?? ""}
                  onSelect={(id, display) => {
                    setVal(id);
                    setCfLocationDisplays(prev => ({ ...prev, [sf.field_key]: display }));
                  }}
                />
              ) : sf.field_type === "select" && sf.options?.length ? (
                <select
                  value={val}
                  onChange={(e) => setVal(e.target.value)}
                  style={{ ...inputStyle, colorScheme: "dark" }}
                >
                  <option value="">—</option>
                  {sf.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <input
                  type={sf.field_type === "number" ? "number" : sf.field_type === "date" ? "date" : "text"}
                  value={val ?? ""}
                  onChange={(e) => setVal(e.target.value)}
                  style={{ ...inputStyle, colorScheme: "dark" }}
                  onFocus={focusIn as any}
                  onBlur={focusOut as any}
                />
              )}
            </div>
          );
        })}

        {/* ── Assignee picker — hidden for personal ── */}
        {showMembers && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: S.dim, marginBottom: 8, textTransform: "uppercase", letterSpacing: ".04em" }}>
              Assignees
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {contextMembers.map((m) => {
                const selected = assigneeIds.includes(m.user_id);
                const ini      = initials(m.name || m.email);
                const isMe     = m.user_id === userId;
                return (
                  <button
                    key={m.user_id}
                    onClick={() => toggleAssignee(m.user_id)}
                    title={m.name || m.email}
                    style={{
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                      background: "none", border: "none", cursor: "pointer", padding: 0,
                    }}
                  >
                    <div style={{
                      width: 36, height: 36, borderRadius: "50%",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, fontWeight: 700,
                      border: selected
                        ? `2px solid ${accent}`
                        : "2px solid rgba(255,255,255,.12)",
                      background: selected
                        ? `${accent}33`
                        : "rgba(255,255,255,.06)",
                      color: selected ? accent : S.dim,
                      transition: "all .12s",
                      position: "relative",
                    }}>
                      {ini}
                      {selected && (
                        <span style={{
                          position: "absolute", bottom: -2, right: -2,
                          width: 12, height: 12, borderRadius: "50%",
                          background: accent, border: "1.5px solid rgb(10 13 20)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 7, color: "#fff", fontWeight: 900,
                        }}>✓</span>
                      )}
                    </div>
                    <span style={{ fontSize: 9, color: selected ? S.dimBright : S.dim, maxWidth: 48, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {isMe ? "Me" : (m.name || m.email).split(" ")[0]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Visibility — hidden for personal ── */}
        {!isPersonal && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: S.dim, marginBottom: 8, textTransform: "uppercase", letterSpacing: ".04em" }}>
              Visibility
            </div>
            <div style={{
              display: "flex", borderRadius: 8, overflow: "hidden",
              border: "1px solid rgba(255,255,255,.08)", background: "rgba(255,255,255,.03)",
            }}>
              {(["private", "assignee_only", "team"] as const).map((v) => {
                const labels: Record<VisibilityVal, string> = {
                  private:       "Private",
                  assignee_only: "Assignees",
                  team:          "Team",
                };
                const active = visibility === v;
                return (
                  <button
                    key={v}
                    onClick={() => setVisibility(v)}
                    style={{
                      flex: 1, padding: "8px 0", fontSize: 11, fontWeight: 600,
                      cursor: "pointer", border: "none",
                      background: active ? "rgba(255,255,255,.1)" : "transparent",
                      color: active ? S.text : S.dim,
                      transition: "all .12s",
                    }}
                  >
                    {labels[v]}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Error message ── */}
        {errorMsg && (
          <div style={{
            padding: "8px 12px", borderRadius: 8,
            background: "rgba(239,68,68,.12)", border: "1px solid rgba(239,68,68,.25)",
            color: "#fca5a5", fontSize: 13,
          }}>
            {errorMsg}
          </div>
        )}

        {/* ── Action bar ── */}
        <div style={{ borderTop: "1px solid rgba(255,255,255,.07)", paddingTop: 12, display: "flex", gap: 8 }}>
          {createMode ? (
            <>
              <button
                onClick={onClose}
                style={{
                  flex: 1, padding: "11px 0", borderRadius: 9,
                  border: "1px solid rgba(255,255,255,.1)", background: "rgba(255,255,255,.04)",
                  color: S.dim, fontSize: 14, fontWeight: 600, cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  flex: 2, padding: "11px 0", borderRadius: 9, border: "none",
                  background: `linear-gradient(135deg, ${accent} 0%, color-mix(in srgb, ${accent} 70%, #7c3aed) 100%)`,
                  color: "#fff", fontSize: 14, fontWeight: 600,
                  cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </>
          ) : confirmDelete ? (
            <>
              <button
                onClick={() => setConfirmDelete(false)}
                style={{
                  flex: 1, padding: "11px 0", borderRadius: 9,
                  border: "1px solid rgba(255,255,255,.1)", background: "rgba(255,255,255,.04)",
                  color: S.dim, fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  flex: 1, padding: "11px 0", borderRadius: 9,
                  border: "1px solid rgba(239,68,68,.3)", background: "rgba(239,68,68,.15)",
                  color: "#fca5a5", fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}
              >
                {deleting ? "Deleting…" : "Confirm Delete"}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleComplete}
                disabled={saving || item?.status === "done"}
                style={{
                  flex: 1, padding: "11px 0", borderRadius: 9,
                  border: "1px solid rgba(34,197,94,.3)", background: "rgba(34,197,94,.1)",
                  color: "#86efac", fontSize: 13, fontWeight: 600,
                  cursor: item?.status === "done" ? "default" : "pointer",
                  opacity: item?.status === "done" ? 0.5 : 1,
                }}
              >
                ✓ Complete
              </button>
              <button
                onClick={handleDelete}
                style={{
                  flex: 1, padding: "11px 0", borderRadius: 9,
                  border: "1px solid rgba(239,68,68,.2)", background: "rgba(239,68,68,.08)",
                  color: "#fca5a5", fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}
              >
                Delete
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  flex: 1, padding: "11px 0", borderRadius: 9, border: "none",
                  background: `linear-gradient(135deg, ${accent} 0%, color-mix(in srgb, ${accent} 70%, #7c3aed) 100%)`,
                  color: "#fff", fontSize: 13, fontWeight: 600,
                  cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
