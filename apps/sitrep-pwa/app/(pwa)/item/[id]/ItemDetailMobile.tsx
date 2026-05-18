"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getFamilyByKey } from "@/lib/sitrep-colors";
import { utcToDatetimeLocal, localToUtcIso, fmtItemDate, todayStr, localDateStr, effectiveDate } from "@/lib/date-utils";
import SitRepLocationPicker from "@/components/SitRepLocationPicker";

const S = {
  bg:        "rgb(10 13 20)",
  surface:   "rgb(14 18 28)",
  card:      "rgb(20 25 38)",
  border:    "rgba(255,255,255,.07)",
  text:      "rgb(236 240 245)",
  dim:       "rgb(100 116 139)",
  dimBright: "rgb(148 163 184)",
} as const;

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 9,
  background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)",
  color: S.text, fontSize: "var(--fs-base)", outline: "none",
  transition: "border-color .15s, box-shadow .15s",
};
function focusIn(e: React.FocusEvent<HTMLElement>) {
  (e.currentTarget as HTMLElement).style.borderColor = "color-mix(in srgb, var(--gg-primary, #2563eb) 55%, transparent)";
  (e.currentTarget as HTMLElement).style.boxShadow   = "0 0 0 3px color-mix(in srgb, var(--gg-primary, #2563eb) 16%, transparent)";
}
function focusOut(e: React.FocusEvent<HTMLElement>) {
  (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,.1)";
  (e.currentTarget as HTMLElement).style.boxShadow   = "none";
}

// Loose type — select("*") returns any columns the DB has now or later
type SitRepItemFull = Record<string, any> & {
  id: string;
  item_type: string;
  title: string;
  status: string;
  visibility?: string;
  created_by?: string;
  sitrep_assignments?: { user_id: string; role: string }[];
  sitrep_comments?: { id: string; body: string; author_id: string; created_at: string }[];
  sitrep_activity?: { id: string; event_type: string; old_value: string | null; new_value: string | null; actor_id: string; created_at: string }[];
};

type ItemType = { id: string; name: string; slug: string; color: string };
type CfDef = { field_key: string; label: string; field_type: string; options: { value: string; label: string }[]; display_scope?: string };
type FieldOverride = { label?: string; hidden: boolean; display_scope: string; sort_order?: number };

interface Props {
  item: SitRepItemFull | null;
  error?: string;
  children: any[];
  types: ItemType[];
  userId: string;
  tenantId: string;
  customFieldDefs: CfDef[];
  fieldOverrides?: Record<string, FieldOverride>;
}

function LocationCfField({ fieldKey, locationId, tenantId, onSave }: { fieldKey: string; locationId: string | null; tenantId: string; onSave: (id: string | null, display: string) => void }) {
  const [display, setDisplay] = useState("");
  useEffect(() => {
    if (!locationId || !tenantId) { setDisplay(""); return; }
    fetch(`/api/sitrep/locations?tenantId=${encodeURIComponent(tenantId)}&id=${encodeURIComponent(locationId)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setDisplay(d?.display ?? ""))
      .catch(() => {});
  }, [locationId, tenantId]);
  function handleSelect(id: string | null, disp: string) { setDisplay(disp); onSave(id, disp); }
  return <SitRepLocationPicker tenantId={tenantId} locationId={locationId} locationDisplay={display} onSelect={handleSelect} />;
}

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{
      background: S.card, border: `1px solid ${S.border}`, borderRadius: 12, overflow: "hidden",
      boxShadow: open
        ? "inset 3px 0 0 0 var(--gg-primary, #2563eb), 0 4px 20px rgba(0,0,0,.3)"
        : "0 2px 8px rgba(0,0,0,.25)",
      transition: "box-shadow .2s",
    }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px", cursor: "pointer",
          borderBottom: open ? `1px solid ${S.border}` : "none",
        }}
      >
        <span style={{ fontSize: "var(--fs-sm)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: S.dim }}>
          {title}
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={S.dim} strokeWidth="2" strokeLinecap="round"
          style={{ transform: open ? "rotate(0)" : "rotate(-90deg)", transition: "transform .2s" }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>
      {open && <div style={{ padding: "14px 16px" }}>{children}</div>}
    </div>
  );
}

export default function ItemDetailMobile({ item: rawItem, error, children, types, userId, tenantId, customFieldDefs, fieldOverrides = {} }: Props) {
  const router = useRouter();
  // Safe defaults so hooks always run, even when item is null (error state)
  const initialItem = rawItem ?? { id: "", item_type: "task", title: "", status: "open" } as SitRepItemFull;

  const [tz, setTz]           = useState("UTC");
  const [item, setItem]       = useState(initialItem);
  const [title, setTitle]     = useState(initialItem.title ?? "");
  const [desc, setDesc]       = useState(initialItem.description ?? "");
  const [dueDateLocal, setDueDateLocal] = useState(
    (initialItem.due_date ?? initialItem.start_at) ? utcToDatetimeLocal(initialItem.due_date ?? initialItem.start_at) : ""
  );
  const [locationId,      setLocationId]      = useState<string | null>(initialItem.location_id ?? null);
  const [locationDisplay, setLocationDisplay] = useState("");
  const [saving, setSaving]   = useState(false);
  const [comment, setComment] = useState("");
  const [posting, setPosting] = useState(false);
  const [comments, setComments] = useState<any[]>(initialItem.sitrep_comments ?? []);
  const [delConfirm, setDelConfirm] = useState(false);
  const [cfValues, setCfValues] = useState<Record<string, any>>(initialItem.custom_fields ?? {});

  useEffect(() => { setTz(Intl.DateTimeFormat().resolvedOptions().timeZone); }, []);

  // Resolve location display name when location_id is set
  useEffect(() => {
    if (!locationId || !tenantId) { setLocationDisplay(""); return; }
    fetch(`/api/sitrep/locations?tenantId=${encodeURIComponent(tenantId)}&id=${encodeURIComponent(locationId)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => setLocationDisplay(data?.display ?? ""))
      .catch(() => {});
  }, [locationId, tenantId]);

  const typeMap = Object.fromEntries(types.map((t) => [t.slug, t]));
  const t       = typeMap[item.item_type];
  const family  = getFamilyByKey(t?.color ?? "blue");
  const accent  = family?.shades[2] ?? "#3b82f6";

  function lbl(key: string, defaultLabel: string): string {
    return fieldOverrides[key]?.label ?? defaultLabel;
  }
  function isHidden(key: string): boolean {
    return fieldOverrides[key]?.hidden === true;
  }

  async function save(patch: Record<string, unknown>) {
    setSaving(true);
    try {
      await fetch(`/api/sitrep/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...patch, tenantId }),
      });
      setItem((prev) => ({ ...prev, ...patch }));
    } catch { /* ignore */ }
    setSaving(false);
  }

  function onTitleBlur() { if (title.trim() !== item.title) save({ title: title.trim() }); }
  function onDescBlur()  { if (desc !== (item.description ?? "")) save({ description: desc || null }); }
  function onLocationSelect(id: string | null, display: string) {
    setLocationId(id);
    setLocationDisplay(display);
    save({ location_id: id });
  }
  function onDateBlur() {
    const utc = dueDateLocal ? localToUtcIso(dueDateLocal) : null;
    if (utc !== item.due_date) save({ due_date: utc });
  }

  function saveCf(key: string, value: any) {
    const updated = { ...cfValues, [key]: value === "" ? null : value };
    setCfValues(updated);
    save({ custom_fields: updated });
  }

  async function postComment() {
    if (!comment.trim()) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/sitrep/items/${item.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: comment.trim(), tenantId }),
      });
      const newComment = await res.json();
      setComments((p) => [...p, newComment]);
      setComment("");
    } catch { /* ignore */ }
    setPosting(false);
  }

  async function handleDelete() {
    if (!delConfirm) { setDelConfirm(true); return; }
    try {
      await fetch(`/api/sitrep/items/${item.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId }),
      });
      router.push("/list");
    } catch { /* ignore */ }
  }

  const isOverdue = (() => {
    if (item.status === "done" || item.status === "cancelled") return false;
    const ed = effectiveDate(item as any);
    if (!ed) return false;
    const ds = ed.includes("T") ? localDateStr(ed) : ed;
    return ds < todayStr();
  })();

  // Shared card overlay markup used for both the error state and the full detail
  const cardOverlay = (cardContent: React.ReactNode) => (
    <>
      <style>{`@keyframes sitrepSlideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }`}</style>
      {/* Backdrop */}
      <div
        onClick={() => router.back()}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,.55)", backdropFilter: "blur(4px)",
          zIndex: 200,
        }}
      />
      {/* Floating card */}
      <div style={{
        position: "fixed", left: 0, right: 0, bottom: 0, top: 44,
        background: S.bg,
        borderRadius: "20px 20px 0 0",
        borderTop: "1px solid rgba(255,255,255,.10)",
        boxShadow: "0 -16px 80px rgba(0,0,0,.85), 0 -1px 0 rgba(255,255,255,.08)",
        zIndex: 201,
        display: "flex", flexDirection: "column",
        overflow: "hidden",
        animation: "sitrepSlideUp 260ms cubic-bezier(.32,1,.23,1)",
      }}>
        {/* Drag handle */}
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", height: 20, paddingTop: 6 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,.22)" }} />
        </div>
        {cardContent}
      </div>
    </>
  );

  // Error / not-found state
  if (!rawItem || error) {
    return cardOverlay(
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: 12, padding: 32, textAlign: "center" }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={S.dim} strokeWidth="1.5" strokeLinecap="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span style={{ color: S.dimBright, fontSize: "var(--fs-md)", fontWeight: 600 }}>Could not load this item</span>
        <span style={{ color: S.dim, fontSize: "var(--fs-base)" }}>{error ?? "It may have been deleted or you may no longer have access."}</span>
        <button
          onClick={() => router.back()}
          style={{
            marginTop: 8, padding: "10px 24px", borderRadius: 10,
            background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.12)",
            color: S.text, fontSize: "var(--fs-md)", cursor: "pointer",
          }}
        >
          Go Back
        </button>
      </div>
    );
  }

  return cardOverlay(<>
      {/* Header */}
      <div style={{
        flexShrink: 0,
        background: S.bg,
        borderBottom: `1px solid ${S.border}`,
        padding: "10px 16px",
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <button
          onClick={() => router.back()}
          style={{
            background: "none", border: "none", color: S.dimBright,
            fontSize: "var(--fs-md)", fontWeight: 500, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 4, padding: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Back
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{
            fontSize: "var(--fs-sm)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
            color: accent,
          }}>
            {t?.name ?? item.item_type}
          </span>
        </div>
        {saving && <span style={{ fontSize: "var(--fs-sm)", color: S.dim }}>Saving…</span>}
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" as any }}>
      <div style={{ padding: "16px 16px 32px", display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Hero banner */}
        <div style={{
          padding: "20px 20px 16px",
          background: `linear-gradient(150deg, ${accent}1e 0%, rgba(10,13,20,0) 75%)`,
          border: `1px solid ${accent}22`,
          borderRadius: 14,
          boxShadow: `0 4px 24px rgba(0,0,0,.35), 0 0 36px ${accent}0d`,
        }}>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={onTitleBlur}
            style={{
              width: "100%", background: "none", border: "none", outline: "none",
              color: S.text, fontSize: 21, fontWeight: 700, padding: "0 0 12px",
              letterSpacing: "-0.01em", lineHeight: 1.25,
            }}
          />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{
              fontSize: "var(--fs-sm)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
              padding: "4px 10px", borderRadius: 20,
              background: item.status === "done" ? "rgba(34,197,94,.15)" : `${accent}22`,
              color: item.status === "done" ? "#86efac" : accent,
              border: item.status === "done" ? "1px solid rgba(34,197,94,.3)" : `1px solid ${accent}44`,
            }}>
              {item.status}
            </span>
            {isOverdue && (
              <span style={{
                fontSize: "var(--fs-sm)", fontWeight: 700, padding: "4px 10px", borderRadius: 20,
                background: "rgba(239,68,68,.15)", color: "#fca5a5",
                border: "1px solid rgba(239,68,68,.3)",
              }}>
                Overdue
              </span>
            )}
          </div>
        </div>

        {/* Unified fields: standard + custom, sorted by sort_order */}
        {(() => {
          const labelStyle: React.CSSProperties = { fontSize: "var(--fs-sm)", fontWeight: 700, color: S.dim, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" };
          // Standard field entries (key → render fn), default sort_order
          const STD_DEFAULT_ORDER: Record<string, number> = { due_date: 10, priority: 20, location_id: 30, description: 40, meeting_url: 50, visibility: 60 };
          type FieldEntry = { key: string; sortOrder: number; node: React.ReactNode };
          const entries: FieldEntry[] = [];

          // due_date
          if (!isHidden("due_date")) entries.push({ key: "due_date", sortOrder: fieldOverrides.due_date?.sort_order ?? STD_DEFAULT_ORDER.due_date, node: (
            <Section key="due_date" title={lbl("due_date", item.item_type === "task" ? "Due Date" : "Start Time")}>
              <input type="datetime-local" value={dueDateLocal} onChange={(e) => setDueDateLocal(e.target.value)} onBlur={onDateBlur} style={{ ...inputStyle, colorScheme: "dark" }} onFocus={focusIn} />
            </Section>
          )});

          // priority (tasks only)
          if (item.item_type === "task" && !isHidden("priority")) entries.push({ key: "priority", sortOrder: fieldOverrides.priority?.sort_order ?? STD_DEFAULT_ORDER.priority, node: (
            <Section key="priority" title={lbl("priority", "Priority")}>
              <select value={item.priority ?? "normal"} onChange={(e) => save({ priority: e.target.value })} style={{ ...inputStyle }} onFocus={focusIn} onBlur={focusOut}>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </Section>
          )});

          // location
          if (!isHidden("location_id")) entries.push({ key: "location_id", sortOrder: fieldOverrides.location_id?.sort_order ?? STD_DEFAULT_ORDER.location_id, node: (
            <Section key="location_id" title={lbl("location_id", "Location")}>
              <SitRepLocationPicker tenantId={tenantId} locationId={locationId} locationDisplay={locationDisplay} onSelect={onLocationSelect} />
            </Section>
          )});

          // description
          if (!isHidden("description")) entries.push({ key: "description", sortOrder: fieldOverrides.description?.sort_order ?? STD_DEFAULT_ORDER.description, node: (
            <Section key="description" title={lbl("description", "Description")}>
              <textarea value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={onDescBlur} placeholder="Add notes or description…" rows={4} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} onFocus={focusIn} />
            </Section>
          )});

          // custom fields
          customFieldDefs.forEach((def) => {
            const val = cfValues[def.field_key] ?? "";
            const labelEl = <label style={labelStyle}>{def.label}</label>;
            let fieldNode: React.ReactNode;

            if (def.field_type === "location") {
              fieldNode = <LocationCfField fieldKey={def.field_key} locationId={val || null} tenantId={tenantId} onSave={(id) => saveCf(def.field_key, id)} />;
            } else if (def.field_type === "textarea") {
              fieldNode = <textarea value={val} onChange={(e) => setCfValues((p) => ({ ...p, [def.field_key]: e.target.value }))} onBlur={(e) => saveCf(def.field_key, e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} onFocus={focusIn} />;
            } else if (def.field_type === "boolean") {
              fieldNode = <button onClick={() => saveCf(def.field_key, !val)} style={{ width: 40, height: 22, borderRadius: 11, border: "none", cursor: "pointer", background: val ? "var(--gg-primary,#2563eb)" : "rgba(255,255,255,.15)", position: "relative", flexShrink: 0 }}><span style={{ position: "absolute", top: 3, left: val ? 21 : 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left .15s" }} /></button>;
            } else if (def.field_type === "select" && def.options?.length > 0) {
              fieldNode = <select value={val} onChange={(e) => saveCf(def.field_key, e.target.value)} style={{ ...inputStyle }} onFocus={focusIn} onBlur={focusOut}><option value="">— select —</option>{def.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
            } else if (def.field_type === "number") {
              fieldNode = <input type="number" value={val} onChange={(e) => setCfValues((p) => ({ ...p, [def.field_key]: e.target.value }))} onBlur={(e) => saveCf(def.field_key, e.target.value === "" ? null : Number(e.target.value))} style={inputStyle} onFocus={focusIn} />;
            } else if (def.field_type === "date") {
              fieldNode = <input type="date" value={val} onChange={(e) => saveCf(def.field_key, e.target.value || null)} style={{ ...inputStyle, colorScheme: "dark" }} onFocus={focusIn} />;
            } else {
              fieldNode = <input type={def.field_type === "email" ? "email" : def.field_type === "phone" ? "tel" : def.field_type === "url" ? "url" : "text"} value={val} onChange={(e) => setCfValues((p) => ({ ...p, [def.field_key]: e.target.value }))} onBlur={(e) => saveCf(def.field_key, e.target.value)} style={inputStyle} onFocus={focusIn} />;
            }

            const wrapperNode = def.field_type === "boolean"
              ? <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>{labelEl}{fieldNode}</div>
              : <div>{labelEl}{fieldNode}</div>;

            entries.push({ key: def.field_key, sortOrder: def.sort_order ?? 100, node: (
              <Section key={def.field_key} title={def.label}>{wrapperNode}</Section>
            )});
          });

          entries.sort((a, b) => a.sortOrder - b.sortOrder);
          return <>{entries.map(e => e.node)}</>;
        })()}

        {/* (legacy custom fields block replaced by unified sorted rendering above) */}
        {false && customFieldDefs.length > 0 && (
          <Section title="Custom Fields">
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {customFieldDefs.map((def) => {
                const val = cfValues[def.field_key] ?? "";
                const labelEl = (
                  <label style={{ fontSize: "var(--fs-sm)", fontWeight: 700, color: S.dim, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {def.label}
                  </label>
                );
                if (def.field_type === "textarea") return (
                  <div key={def.field_key}>
                    {labelEl}
                    <textarea
                      value={val}
                      onChange={(e) => setCfValues((p) => ({ ...p, [def.field_key]: e.target.value }))}
                      onBlur={(e) => saveCf(def.field_key, e.target.value)}
                      rows={3}
                      style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }}
                      onFocus={focusIn}
                    />
                  </div>
                );
                if (def.field_type === "boolean") return (
                  <div key={def.field_key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    {labelEl}
                    <button
                      onClick={() => saveCf(def.field_key, !val)}
                      style={{
                        width: 40, height: 22, borderRadius: 11, border: "none", cursor: "pointer",
                        background: val ? "var(--gg-primary,#2563eb)" : "rgba(255,255,255,.15)",
                        position: "relative", flexShrink: 0,
                      }}
                    >
                      <span style={{
                        position: "absolute", top: 3, left: val ? 21 : 3,
                        width: 16, height: 16, borderRadius: "50%", background: "#fff",
                        transition: "left .15s",
                      }} />
                    </button>
                  </div>
                );
                if (def.field_type === "select" && def.options?.length > 0) return (
                  <div key={def.field_key}>
                    {labelEl}
                    <select
                      value={val}
                      onChange={(e) => saveCf(def.field_key, e.target.value)}
                      style={{ ...inputStyle }}
                      onFocus={focusIn}
                      onBlur={focusOut}
                    >
                      <option value="">— select —</option>
                      {def.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                );
                if (def.field_type === "number") return (
                  <div key={def.field_key}>
                    {labelEl}
                    <input
                      type="number"
                      value={val}
                      onChange={(e) => setCfValues((p) => ({ ...p, [def.field_key]: e.target.value }))}
                      onBlur={(e) => saveCf(def.field_key, e.target.value === "" ? null : Number(e.target.value))}
                      style={inputStyle}
                      onFocus={focusIn}
                    />
                  </div>
                );
                if (def.field_type === "date") return (
                  <div key={def.field_key}>
                    {labelEl}
                    <input
                      type="date"
                      value={val}
                      onChange={(e) => saveCf(def.field_key, e.target.value || null)}
                      style={{ ...inputStyle, colorScheme: "dark" }}
                      onFocus={focusIn}
                    />
                  </div>
                );
                if (def.field_type === "location") return (
                  <div key={def.field_key}>
                    {labelEl}
                    <LocationCfField
                      fieldKey={def.field_key}
                      locationId={val || null}
                      tenantId={tenantId}
                      onSave={(id) => saveCf(def.field_key, id)}
                    />
                  </div>
                );
                // Default: text / email / phone / url
                return (
                  <div key={def.field_key}>
                    {labelEl}
                    <input
                      type={def.field_type === "email" ? "email" : def.field_type === "phone" ? "tel" : def.field_type === "url" ? "url" : "text"}
                      value={val}
                      onChange={(e) => setCfValues((p) => ({ ...p, [def.field_key]: e.target.value }))}
                      onBlur={(e) => saveCf(def.field_key, e.target.value)}
                      style={inputStyle}
                      onFocus={focusIn}
                    />
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {/* Sub-items */}
        {children.length > 0 && (
          <Section title={`Sub-items (${children.length})`}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {children.map((child: any) => {
                const ct = typeMap[child.item_type];
                const cf = getFamilyByKey(ct?.color ?? "blue");
                const ca = cf?.shades[2] ?? "#3b82f6";
                return (
                  <button
                    key={child.id}
                    onClick={() => router.push(`/item/${child.id}`)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 12px", borderRadius: 8,
                      background: "rgba(255,255,255,.03)",
                      border: `1px solid ${S.border}`,
                      boxShadow: `inset 3px 0 0 0 ${ca}`,
                      cursor: "pointer", textAlign: "left",
                    }}
                  >
                    <span style={{ flex: 1, fontSize: "var(--fs-base)", color: child.status === "done" ? S.dim : S.text,
                      textDecoration: child.status === "done" ? "line-through" : "none" }}>
                      {child.title}
                    </span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={S.dim} strokeWidth="2" strokeLinecap="round">
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                  </button>
                );
              })}
            </div>
          </Section>
        )}

        {/* Comments */}
        <Section title={`Comments (${comments.length})`} defaultOpen={false}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {comments.map((c: any) => (
              <div key={c.id} style={{
                padding: "10px 12px", borderRadius: 8,
                background: "rgba(255,255,255,.03)", border: `1px solid ${S.border}`,
              }}>
                <div style={{ fontSize: "var(--fs-sm)", color: S.dim, marginBottom: 4 }}>
                  {new Date(c.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </div>
                <div style={{ fontSize: "var(--fs-md)", color: S.text, lineHeight: 1.5 }}>{c.body}</div>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); postComment(); } }}
                placeholder="Add a comment…"
                style={{ ...inputStyle, flex: 1 }}
                onFocus={focusIn}
                onBlur={focusOut}
              />
              <button
                onClick={postComment}
                disabled={posting || !comment.trim()}
                style={{
                  padding: "9px 14px", borderRadius: 9, border: "none",
                  background: "var(--gg-primary,#2563eb)", color: "#fff",
                  fontSize: "var(--fs-base)", fontWeight: 600, cursor: "pointer", flexShrink: 0,
                  opacity: posting || !comment.trim() ? 0.5 : 1,
                }}
              >
                Post
              </button>
            </div>
          </div>
        </Section>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          {item.status !== "done" && (
            <button
              onClick={() => save({ status: "done" })}
              disabled={saving}
              style={{
                flex: 1, padding: "12px 0", borderRadius: 10,
                border: "1px solid rgba(34,197,94,.3)", background: "rgba(34,197,94,.1)",
                color: "#86efac", fontSize: "var(--fs-md)", fontWeight: 600, cursor: "pointer",
              }}
            >
              ✓ Mark Complete
            </button>
          )}
          <button
            onClick={handleDelete}
            style={{
              flex: 1, padding: "12px 0", borderRadius: 10,
              border: delConfirm ? "1px solid rgba(239,68,68,.5)" : "1px solid rgba(239,68,68,.2)",
              background: delConfirm ? "rgba(239,68,68,.2)" : "rgba(239,68,68,.08)",
              color: "#fca5a5", fontSize: "var(--fs-md)", fontWeight: 600, cursor: "pointer",
            }}
          >
            {delConfirm ? "Confirm Delete" : "Delete"}
          </button>
        </div>
        {delConfirm && (
          <button
            onClick={() => setDelConfirm(false)}
            style={{
              width: "100%", padding: "10px 0", borderRadius: 10,
              border: `1px solid ${S.border}`, background: "rgba(255,255,255,.04)",
              color: S.dim, fontSize: "var(--fs-base)", fontWeight: 600, cursor: "pointer",
            }}
          >
            Cancel
          </button>
        )}
      </div>
      </div>{/* end scrollable */}
    </>);
}
