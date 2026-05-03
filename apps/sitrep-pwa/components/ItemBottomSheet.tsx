"use client";

import { useState, useEffect, useRef } from "react";
import BottomSheet from "./BottomSheet";
import TypePillSelector, { ItemType } from "./TypePillSelector";
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

interface ItemBottomSheetProps {
  open: boolean;
  onClose: () => void;
  item: SitRepItem | null;
  createMode: boolean;
  types: ItemType[];
  calendarTypes?: CalendarTypeData[];
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

export default function ItemBottomSheet({
  open, onClose, item, createMode, types, calendarTypes, tenantId, userId, tz,
  onSaved, onDeleted, onExpandItem,
}: ItemBottomSheetProps) {
  const [title, setTitle]               = useState("");
  const [typeSlug, setTypeSlug]         = useState(types[0]?.slug ?? "task");
  const [selectedCalId, setSelectedCalId] = useState(() => defaultCalTypeId(calendarTypes));
  // Stored as datetime-local string (local time) for the <input>
  const [dueDateLocal, setDueDateLocal] = useState("");
  const [location, setLocation]         = useState("");
  const [saving, setSaving]             = useState(false);
  const [deleting, setDeleting]         = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const titleRef  = useRef<HTMLInputElement>(null);
  const [titleShake, setTitleShake] = useState(false);

  // Reset form when sheet opens — convert UTC ISO → datetime-local for inputs
  useEffect(() => {
    if (!open) return;
    if (createMode) {
      setTitle("");
      setTypeSlug(types[0]?.slug ?? "task");
      setSelectedCalId(defaultCalTypeId(calendarTypes));
      setDueDateLocal("");
      setLocation("");
    } else if (item) {
      setTitle(item.title);
      setTypeSlug(item.item_type);
      // Convert stored UTC ISO to local datetime-local input value
      const stored = item.due_date ?? (item as any).start_at ?? null;
      setDueDateLocal(stored ? utcToDatetimeLocal(stored) : "");
      setLocation((item as any).location ?? "");
    }
    setConfirmDelete(false);
    setSaving(false);
  }, [open, createMode, item, types]);

  const family = getFamilyByKey(types.find((t) => t.slug === typeSlug)?.color ?? "blue");
  const accent = family?.shades[2] ?? "#3b82f6";

  async function handleSave() {
    if (!title.trim()) {
      setTitleShake(true);
      titleRef.current?.focus();
      setTimeout(() => setTitleShake(false), 500);
      return;
    }
    setSaving(true);

    // Convert local datetime-local value → UTC ISO for storage
    const dueDateUtc = dueDateLocal ? localToUtcIso(dueDateLocal) : null;

    const cal = createMode ? calPayload(calendarTypes, selectedCalId, tenantId) : null;

    const payload = {
      title:      title.trim(),
      item_type:  typeSlug,
      due_date:   dueDateUtc,
      location:   location.trim() || null,
      tenantId:   cal?.tenantId ?? tenantId,
      created_by: userId,
      ...(cal ? { visibility: cal.visibility } : {}),
    };

    try {
      let result: SitRepItem;
      if (createMode) {
        const res = await fetch("/api/sitrep/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        result = await res.json();
      } else {
        const res = await fetch(`/api/sitrep/items/${item!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, id: item!.id }),
        });
        result = await res.json();
      }
      onSaved(result);
    } catch { /* ignore */ }
    setSaving(false);
  }

  async function handleComplete() {
    if (!item) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/sitrep/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "done", tenantId }),
      });
      const updated = await res.json();
      onSaved({ ...item, ...updated, status: "done" });
    } catch { /* ignore */ }
    setSaving(false);
  }

  async function handleDelete() {
    if (!item) return;
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    try {
      await fetch(`/api/sitrep/items/${item.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId }),
      });
      onDeleted(item.id);
    } catch { /* ignore */ }
    setDeleting(false);
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div style={{ padding: "4px 16px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Type selector + close */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <TypePillSelector types={types} value={typeSlug} onChange={setTypeSlug} />
          <button
            onClick={onClose}
            style={{
              flexShrink: 0, width: 32, height: 32, borderRadius: 8,
              border: "1px solid rgba(255,255,255,.1)", background: "rgba(255,255,255,.05)",
              color: S.dim, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
            }}
          >
            ×
          </button>
        </div>

        {/* Calendar picker — create mode only */}
        {createMode && calendarTypes && calendarTypes.length > 0 && (
          <div style={{ overflowX: "auto", display: "flex", gap: 6, paddingBottom: 2, scrollbarWidth: "none" }}>
            {calendarTypes.map((ct) => {
              const dot = getFamilyByKey(ct.color)?.shades[3] ?? "#818cf8";
              const active = selectedCalId === ct.id;
              return (
                <button
                  key={ct.id}
                  onClick={() => setSelectedCalId(ct.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    flexShrink: 0, padding: "5px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                    cursor: "pointer",
                    border: active
                      ? `1px solid ${dot}55`
                      : "1px solid rgba(255,255,255,.08)",
                    background: active
                      ? `${dot}22`
                      : "rgba(255,255,255,.03)",
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

        {/* Title */}
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

        {/* Due date — datetime-local input (local time) */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={S.dim} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          <input
            type="datetime-local"
            value={dueDateLocal}
            onChange={(e) => setDueDateLocal(e.target.value)}
            style={{ ...inputStyle, colorScheme: "dark" }}
            onFocus={focusIn}
            onBlur={focusOut}
          />
        </div>

        {/* Location */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={S.dim} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Add location"
            style={inputStyle}
            onFocus={focusIn}
            onBlur={focusOut}
          />
        </div>

        {/* Action bar */}
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
                onClick={() => item && onExpandItem(item.id)}
                style={{
                  flex: 1, padding: "11px 0", borderRadius: 9,
                  border: "1px solid rgba(255,255,255,.1)", background: "rgba(255,255,255,.04)",
                  color: S.dimBright, fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}
              >
                Expand ↗
              </button>
            </>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
