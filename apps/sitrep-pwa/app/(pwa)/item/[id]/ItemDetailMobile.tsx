"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getFamilyByKey } from "@/lib/sitrep-colors";
import { utcToDatetimeLocal, localToUtcIso, fmtItemDate, todayStr, localDateStr, effectiveDate } from "@/lib/date-utils";
import MapPicker, { isUrl, locationHref } from "@/components/MapPicker";

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
  color: S.text, fontSize: 13, outline: "none",
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

interface Props {
  item: SitRepItemFull;
  children: any[];
  types: ItemType[];
  userId: string;
  tenantId: string;
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
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: S.dim }}>
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

export default function ItemDetailMobile({ item: initialItem, children, types, userId, tenantId }: Props) {
  const router = useRouter();
  const [tz, setTz]           = useState("UTC");
  const [item, setItem]       = useState(initialItem);
  const [title, setTitle]     = useState(initialItem.title ?? "");
  const [desc, setDesc]       = useState(initialItem.description ?? "");
  const [dueDateLocal, setDueDateLocal] = useState(
    (initialItem.due_date ?? initialItem.start_at) ? utcToDatetimeLocal(initialItem.due_date ?? initialItem.start_at) : ""
  );
  const [location, setLocation] = useState(initialItem.location ?? "");
  const [saving, setSaving]   = useState(false);
  const [comment, setComment] = useState("");
  const [posting, setPosting] = useState(false);
  const [comments, setComments] = useState<any[]>(initialItem.sitrep_comments ?? []);
  const [delConfirm, setDelConfirm] = useState(false);
  const [mapPickerOpen, setMapPickerOpen] = useState(false);

  useEffect(() => { setTz(Intl.DateTimeFormat().resolvedOptions().timeZone); }, []);

  const typeMap = Object.fromEntries(types.map((t) => [t.slug, t]));
  const t       = typeMap[item.item_type];
  const family  = getFamilyByKey(t?.color ?? "blue");
  const accent  = family?.shades[2] ?? "#3b82f6";

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
  function onLocationBlur() { if (location !== (item.location ?? "")) save({ location: location || null }); }
  function onDateBlur() {
    const utc = dueDateLocal ? localToUtcIso(dueDateLocal) : null;
    if (utc !== item.due_date) save({ due_date: utc });
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

  return (
    <div style={{ minHeight: "100dvh", background: S.bg }}>
      {/* Sticky back header */}
      <div style={{
        position: "sticky", top: 0, zIndex: 50, background: S.bg,
        borderBottom: `1px solid ${S.border}`,
        padding: "12px 16px",
        paddingTop: "max(12px, env(safe-area-inset-top))",
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <button
          onClick={() => router.back()}
          style={{
            background: "none", border: "none", color: S.dimBright,
            fontSize: 14, fontWeight: 500, cursor: "pointer",
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
            fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
            color: accent,
          }}>
            {t?.name ?? item.item_type}
          </span>
        </div>
        {saving && <span style={{ fontSize: 11, color: S.dim }}>Saving…</span>}
      </div>

      {/* Content */}
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
              fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
              padding: "4px 10px", borderRadius: 20,
              background: item.status === "done" ? "rgba(34,197,94,.15)" : `${accent}22`,
              color: item.status === "done" ? "#86efac" : accent,
              border: item.status === "done" ? "1px solid rgba(34,197,94,.3)" : `1px solid ${accent}44`,
            }}>
              {item.status}
            </span>
            {isOverdue && (
              <span style={{
                fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 20,
                background: "rgba(239,68,68,.15)", color: "#fca5a5",
                border: "1px solid rgba(239,68,68,.3)",
              }}>
                Overdue
              </span>
            )}
          </div>
        </div>

        {/* Details section */}
        <Section title="Details">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Due date */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: S.dim, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {item.item_type === "task" ? "Due Date" : "Start Time"}
              </label>
              <input
                type="datetime-local"
                value={dueDateLocal}
                onChange={(e) => setDueDateLocal(e.target.value)}
                onBlur={onDateBlur}
                style={{ ...inputStyle, colorScheme: "dark" }}
                onFocus={focusIn}
              />
            </div>

            {/* Priority (tasks only) */}
            {item.item_type === "task" && (
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: S.dim, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Priority
                </label>
                <select
                  value={item.priority ?? "normal"}
                  onChange={(e) => save({ priority: e.target.value })}
                  style={{ ...inputStyle }}
                  onFocus={focusIn}
                  onBlur={focusOut}
                >
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            )}

            {/* Location */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: S.dim, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Location
              </label>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  onBlur={onLocationBlur}
                  placeholder="Add location"
                  style={{ ...inputStyle, paddingRight: location ? 40 : 12 }}
                  onFocus={focusIn}
                />
                {location && (
                  isUrl(location) ? (
                    <a
                      href={locationHref(location) ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        width: 24, height: 24, borderRadius: 7,
                        background: "color-mix(in srgb, var(--gg-primary,#2563eb) 18%, transparent)",
                        border: "1px solid color-mix(in srgb, var(--gg-primary,#2563eb) 35%, transparent)",
                        color: "var(--gg-primary,#2563eb)", textDecoration: "none",
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                        <polyline points="15 3 21 3 21 9"/>
                        <line x1="10" y1="14" x2="21" y2="3"/>
                      </svg>
                    </a>
                  ) : (
                    <button
                      onClick={() => setMapPickerOpen(true)}
                      style={{
                        position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        width: 24, height: 24, borderRadius: 7,
                        background: "color-mix(in srgb, var(--gg-primary,#2563eb) 18%, transparent)",
                        border: "1px solid color-mix(in srgb, var(--gg-primary,#2563eb) 35%, transparent)",
                        color: "var(--gg-primary,#2563eb)", cursor: "pointer",
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                        <circle cx="12" cy="10" r="3"/>
                      </svg>
                    </button>
                  )
                )}
              </div>
              {mapPickerOpen && location && !isUrl(location) && (
                <div style={{ position: "relative", marginTop: 6 }}>
                  <MapPicker location={location} onClose={() => setMapPickerOpen(false)} />
                </div>
              )}
            </div>
          </div>
        </Section>

        {/* Description */}
        <Section title="Description">
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onBlur={onDescBlur}
            placeholder="Add notes or description…"
            rows={4}
            style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }}
            onFocus={focusIn}
          />
        </Section>

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
                    <span style={{ flex: 1, fontSize: 13, color: child.status === "done" ? S.dim : S.text,
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
                <div style={{ fontSize: 12, color: S.dim, marginBottom: 4 }}>
                  {new Date(c.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </div>
                <div style={{ fontSize: 14, color: S.text, lineHeight: 1.5 }}>{c.body}</div>
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
                  fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0,
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
                color: "#86efac", fontSize: 14, fontWeight: 600, cursor: "pointer",
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
              color: "#fca5a5", fontSize: 14, fontWeight: 600, cursor: "pointer",
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
              color: S.dim, fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
