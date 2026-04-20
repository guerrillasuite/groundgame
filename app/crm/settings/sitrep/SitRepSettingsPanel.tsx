"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ColorFamilyPicker } from "@/app/components/ColorFamilyPicker";

type ItemType = {
  id: string;
  name: string;
  slug: string;
  color: string;
  is_system: boolean;
  is_public: boolean;
};

type WidgetSettings = {
  show_types:            string[];
  sort_by:               "due_date" | "start_at" | "priority" | "created_at";
  sort_dir:              "asc" | "desc";
  group_by:              "none" | "type" | "status" | "priority";
  max_items:             number;
  widget_view:           "list" | "calendar";
  calendar_default_view: "day" | "week" | "month";
};

const DEFAULT_WIDGET: WidgetSettings = {
  show_types:            [],
  sort_by:               "due_date",
  sort_dir:              "asc",
  group_by:              "none",
  max_items:             10,
  widget_view:           "list",
  calendar_default_view: "week",
};

type PublicCalendar = {
  id: string;
  name: string;
  token: string;
  include_type_slugs: string[];
  include_statuses: string[];
  show_day: boolean;
  show_week: boolean;
  show_month: boolean;
  default_view: "day" | "week" | "month";
};

const S = {
  surface: "rgb(18 23 33)",
  card:    "rgb(28 36 48)",
  border:  "rgb(43 53 67)",
  text:    "rgb(238 242 246)",
  dim:     "rgb(160 174 192)",
} as const;

const ALL_STATUSES = [
  { key: "open",      label: "Open" },
  { key: "confirmed", label: "Confirmed" },
  { key: "done",      label: "Done" },
];

const ALL_VIEWS = [
  { key: "show_day",   label: "Day" },
  { key: "show_week",  label: "Week" },
  { key: "show_month", label: "Month" },
];

function MakePublicBtn({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        padding: "4px 12px", fontSize: 12, borderRadius: 7, fontWeight: 500,
        border: active ? "1px solid rgba(99,102,241,.5)" : `1px solid ${S.border}`,
        background: active ? "rgba(99,102,241,.14)" : "rgba(255,255,255,.03)",
        color: active ? "#a5b4fc" : S.dim, cursor: "pointer", flexShrink: 0,
      }}
    >
      {active ? "Public ✓" : "Make Public"}
    </button>
  );
}

function TypeRow({ t, savedId, onColorChange, onDelete, onTogglePublic }: {
  t: ItemType;
  savedId: string | null;
  onColorChange: (id: string, color: string) => void;
  onDelete: (id: string, name: string) => void;
  onTogglePublic: (id: string, val: boolean) => void;
}) {
  return (
    <div style={{
      background: S.surface, border: `1px solid ${S.border}`, borderRadius: 12,
      display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
    }}>
      <ColorFamilyPicker
        value={t.color}
        onChange={(key) => onColorChange(t.id, key)}
        size={28}
      />
      <span style={{ fontSize: 14, fontWeight: 500, flex: 1, color: S.text }}>{t.name}</span>
      <span style={{
        fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
        borderRadius: 4, padding: "2px 8px", flexShrink: 0,
        background: t.is_system ? "rgba(255,255,255,.06)" : "rgba(99,102,241,.12)",
        color: t.is_system ? S.dim : "#a5b4fc",
      }}>
        {t.is_system ? "SYSTEM" : "CUSTOM"}
      </span>
      {savedId === t.id && (
        <span style={{ fontSize: 11, color: "#4ade80", fontWeight: 600, flexShrink: 0 }}>Saved ✓</span>
      )}
      <MakePublicBtn active={t.is_public} onToggle={() => onTogglePublic(t.id, !t.is_public)} />
      {!t.is_system && (
        <button
          type="button"
          onClick={() => onDelete(t.id, t.name)}
          style={{
            padding: "4px 10px", fontSize: 12, borderRadius: 7, fontWeight: 500,
            border: "1px solid rgba(220,38,38,.3)", background: "rgba(220,38,38,.08)",
            color: "#fca5a5", cursor: "pointer", flexShrink: 0,
          }}
        >
          Delete
        </button>
      )}
    </div>
  );
}

// ── Public Calendar Form ───────────────────────────────────────────────────────

function CalendarForm({
  publicTypes,
  onCreated,
}: { publicTypes: ItemType[]; onCreated: (cal: PublicCalendar) => void }) {
  const [name, setName] = useState("");
  const [typeSlugs, setTypeSlugs] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>(["open", "confirmed"]);
  const [showDay, setShowDay]     = useState(true);
  const [showWeek, setShowWeek]   = useState(true);
  const [showMonth, setShowMonth] = useState(true);
  const [defaultView, setDefaultView] = useState<"day"|"week"|"month">("month");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  function toggleSlug(slug: string) {
    setTypeSlugs((prev) => prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]);
  }
  function toggleStatus(key: string) {
    setStatuses((prev) => prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]);
  }

  async function handleSave() {
    if (!name.trim()) { setErr("Name is required."); return; }
    setSaving(true); setErr("");
    const res = await fetch("/api/crm/sitrep/public-calendars", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        include_type_slugs: typeSlugs,
        include_statuses:   statuses,
        show_day:    showDay,
        show_week:   showWeek,
        show_month:  showMonth,
        default_view: defaultView,
      }),
    });
    if (res.ok) {
      const created = await res.json();
      onCreated(created);
      setName(""); setTypeSlugs([]); setStatuses(["open","confirmed"]);
      setShowDay(true); setShowWeek(true); setShowMonth(true); setDefaultView("month");
    } else {
      const e = await res.json().catch(() => ({}));
      setErr(e.error ?? "Failed to create.");
    }
    setSaving(false);
  }

  const TAG: React.CSSProperties = {
    padding: "4px 10px", borderRadius: 16, fontSize: 12, fontWeight: 500,
    cursor: "pointer", border: `1px solid ${S.border}`, transition: "all .1s",
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div>
        <label style={{ fontSize: 12, color: S.dim, display: "block", marginBottom: 4 }}>Calendar Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Public Events"
          style={{
            width: "100%", padding: "9px 12px", borderRadius: 8,
            background: S.surface, border: `1px solid ${S.border}`,
            color: S.text, fontSize: 14, boxSizing: "border-box",
          }}
        />
      </div>

      {publicTypes.length > 0 ? (
        <div>
          <label style={{ fontSize: 12, color: S.dim, display: "block", marginBottom: 6 }}>Include Types</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {publicTypes.map((t) => {
              const sel = typeSlugs.includes(t.slug);
              return (
                <button key={t.slug} type="button" onClick={() => toggleSlug(t.slug)} style={{
                  ...TAG,
                  background: sel ? "rgba(99,102,241,.18)" : "rgba(255,255,255,.04)",
                  borderColor: sel ? "rgba(99,102,241,.5)" : S.border,
                  color: sel ? "#a5b4fc" : S.dim,
                }}>{t.name}</button>
              );
            })}
          </div>
          {typeSlugs.length === 0 && (
            <p style={{ fontSize: 12, color: S.dim, margin: "4px 0 0" }}>All public types will be included if none selected.</p>
          )}
        </div>
      ) : (
        <p style={{ fontSize: 13, color: "rgb(251 191 36)", margin: 0 }}>
          ⚠ No types are marked public yet. Use "Make Public" above on any type to enable it here.
        </p>
      )}

      <div>
        <label style={{ fontSize: 12, color: S.dim, display: "block", marginBottom: 6 }}>Include Statuses</label>
        <div style={{ display: "flex", gap: 6 }}>
          {ALL_STATUSES.map((s) => {
            const sel = statuses.includes(s.key);
            return (
              <button key={s.key} type="button" onClick={() => toggleStatus(s.key)} style={{
                ...TAG,
                background: sel ? "rgba(255,255,255,.1)" : "rgba(255,255,255,.03)",
                borderColor: sel ? "rgba(255,255,255,.25)" : S.border,
                color: sel ? S.text : S.dim,
              }}>{s.label}</button>
            );
          })}
        </div>
      </div>

      <div>
        <label style={{ fontSize: 12, color: S.dim, display: "block", marginBottom: 6 }}>Available Views</label>
        <div style={{ display: "flex", gap: 6 }}>
          {ALL_VIEWS.map((v) => {
            const key = v.key as "show_day"|"show_week"|"show_month";
            const sel = key === "show_day" ? showDay : key === "show_week" ? showWeek : showMonth;
            const toggle = key === "show_day"
              ? () => setShowDay(!showDay)
              : key === "show_week" ? () => setShowWeek(!showWeek) : () => setShowMonth(!showMonth);
            return (
              <button key={v.key} type="button" onClick={toggle} style={{
                ...TAG,
                background: sel ? "rgba(255,255,255,.1)" : "rgba(255,255,255,.03)",
                borderColor: sel ? "rgba(255,255,255,.25)" : S.border,
                color: sel ? S.text : S.dim,
              }}>{v.label}</button>
            );
          })}
        </div>
      </div>

      <div>
        <label style={{ fontSize: 12, color: S.dim, display: "block", marginBottom: 4 }}>Default View</label>
        <div style={{ display: "flex", gap: 6 }}>
          {(["day","week","month"] as const).map((v) => (
            <button key={v} type="button" onClick={() => setDefaultView(v)} style={{
              ...TAG,
              background: defaultView === v ? "rgba(255,255,255,.1)" : "rgba(255,255,255,.03)",
              borderColor: defaultView === v ? "rgba(255,255,255,.3)" : S.border,
              color: defaultView === v ? S.text : S.dim,
            }}>
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {err && <p style={{ margin: 0, fontSize: 12, color: "rgb(220 38 38)" }}>{err}</p>}
      <div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="btn"
          style={{ padding: "8px 20px", fontSize: 13, borderRadius: 8 }}
        >
          {saving ? "Creating…" : "Create Calendar"}
        </button>
      </div>
    </div>
  );
}

// ── Embed code card ────────────────────────────────────────────────────────────

function CalendarCard({ cal, onDelete }: { cal: PublicCalendar; onDelete: (id: string) => void }) {
  const [copied, setCopied] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const src = `${origin}/public/cal/${cal.token}`;
  const iframeId = `ggcal-${cal.token.slice(0, 8)}`;
  const embed = `<iframe id="${iframeId}" src="${src}" width="100%" height="700" frameborder="0" style="border-radius:12px;min-width:300px;display:block" title="${cal.name}"></iframe>\n<script>window.addEventListener('message',function(e){if(e.data&&e.data.type==='gg-cal-height'){var f=document.getElementById('${iframeId}');if(f)f.style.height=e.data.height+'px';}});<\/script>`;

  function handleCopy() {
    navigator.clipboard.writeText(embed).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div style={{
      background: S.surface, border: `1px solid ${S.border}`, borderRadius: 12, padding: "14px 16px",
      display: "grid", gap: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: S.text }}>{cal.name}</div>
          <div style={{ fontSize: 11, color: S.dim, marginTop: 2 }}>
            {cal.include_type_slugs.length === 0 ? "All types" : cal.include_type_slugs.join(", ")}
            {" · "}
            {cal.include_statuses.join(", ")}
            {" · "}
            {[cal.show_day && "Day", cal.show_week && "Week", cal.show_month && "Month"].filter(Boolean).join("/")}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            if (!confirm(`Delete "${cal.name}"?`)) return;
            fetch(`/api/crm/sitrep/public-calendars/${cal.id}`, { method: "DELETE" })
              .then((r) => { if (r.ok) onDelete(cal.id); });
          }}
          style={{
            padding: "4px 10px", fontSize: 12, borderRadius: 7,
            border: "1px solid rgba(220,38,38,.3)", background: "rgba(220,38,38,.08)",
            color: "#fca5a5", cursor: "pointer", flexShrink: 0, fontWeight: 500,
          }}
        >Delete</button>
      </div>

      <div>
        <div style={{ fontSize: 11, color: S.dim, marginBottom: 4 }}>Embed code</div>
        <div style={{
          background: "rgba(0,0,0,.3)", borderRadius: 8, padding: "8px 12px",
          fontSize: 11, fontFamily: "monospace", color: "#94a3b8",
          wordBreak: "break-all", border: `1px solid ${S.border}`,
        }}>
          {embed}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          style={{
            marginTop: 8, padding: "5px 14px", fontSize: 12, borderRadius: 7, fontWeight: 600,
            border: `1px solid ${S.border}`, background: "rgba(255,255,255,.06)",
            color: copied ? "#4ade80" : S.text, cursor: "pointer",
          }}
        >
          {copied ? "Copied ✓" : "Copy embed code"}
        </button>
      </div>
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────

export default function SitRepSettingsPanel() {
  const [types, setTypes] = useState<ItemType[]>([]);
  const [loading, setLoading] = useState(true);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("blue");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");

  const [calendars, setCalendars] = useState<PublicCalendar[]>([]);
  const [calsLoading, setCalsLoading] = useState(true);

  const [widget, setWidget] = useState<WidgetSettings>(DEFAULT_WIDGET);
  const [widgetLoading, setWidgetLoading] = useState(true);
  const [widgetSaving, setWidgetSaving] = useState(false);
  const [widgetSaved, setWidgetSaved] = useState(false);

  useEffect(() => {
    fetch("/api/crm/sitrep/types")
      .then((r) => r.json())
      .then((data) => setTypes(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));

    fetch("/api/crm/sitrep/public-calendars")
      .then((r) => r.json())
      .then((data) => setCalendars(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setCalsLoading(false));

    fetch("/api/crm/sitrep/widget-settings")
      .then((r) => r.json())
      .then((data) => setWidget({ ...DEFAULT_WIDGET, ...data }))
      .catch(() => {})
      .finally(() => setWidgetLoading(false));
  }, []);

  async function saveWidget() {
    setWidgetSaving(true);
    await fetch("/api/crm/sitrep/widget-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(widget),
    });
    setWidgetSaving(false);
    setWidgetSaved(true);
    setTimeout(() => setWidgetSaved(false), 2000);
  }

  async function handleColorChange(id: string, color: string) {
    setTypes((prev) => prev.map((t) => (t.id === id ? { ...t, color } : t)));
    await fetch(`/api/crm/sitrep/types/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ color }),
    });
    setSavedId(id);
    setTimeout(() => setSavedId((cur) => (cur === id ? null : cur)), 2000);
  }

  async function handleTogglePublic(id: string, val: boolean) {
    setTypes((prev) => prev.map((t) => (t.id === id ? { ...t, is_public: val } : t)));
    await fetch(`/api/crm/sitrep/types/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_public: val }),
    });
    setSavedId(id);
    setTimeout(() => setSavedId((cur) => (cur === id ? null : cur)), 2000);
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/crm/sitrep/types/${id}`, { method: "DELETE" });
    if (res.ok) setTypes((prev) => prev.filter((t) => t.id !== id));
  }

  async function handleAdd() {
    if (!newName.trim() || adding) return;
    setAdding(true); setAddError("");
    const res = await fetch("/api/crm/sitrep/types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), color: newColor }),
    });
    if (res.ok) {
      const created = await res.json();
      setTypes((prev) => [...prev, created]);
      setNewName(""); setNewColor("blue");
    } else {
      const err = await res.json().catch(() => ({}));
      setAddError(err.error ?? "Failed to add type.");
    }
    setAdding(false);
  }

  const publicTypes = types.filter((t) => t.is_public);

  return (
    <div className="stack" style={{ maxWidth: 680 }}>

      {/* Breadcrumb + title */}
      <div>
        <div style={{ fontSize: 12, color: S.dim, marginBottom: 6 }}>
          <Link href="/crm/settings" style={{ color: S.dim, textDecoration: "none" }}>Settings</Link>
          {" / SitRep"}
        </div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>SitRep Settings</h1>
      </div>

      {/* Item Types card */}
      <div style={{
        background: S.card, border: `1px solid ${S.border}`,
        borderRadius: 16, padding: 24, display: "grid", gap: 20,
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Item Types</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: S.dim }}>
            Click the color circle to pick a color family. "Make Public" enables the type for embedded calendars.
          </p>
        </div>

        {loading ? (
          <div style={{ fontSize: 13, color: S.dim }}>Loading…</div>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {types.map((t) => (
              <TypeRow
                key={t.id}
                t={t}
                savedId={savedId}
                onColorChange={handleColorChange}
                onDelete={handleDelete}
                onTogglePublic={handleTogglePublic}
              />
            ))}
          </div>
        )}

        {/* Add new type */}
        <div>
          <div style={{
            fontSize: 10, fontWeight: 800, letterSpacing: "0.1em",
            color: S.dim, textTransform: "uppercase", marginBottom: 8,
          }}>
            Add Custom Type
          </div>
          <div style={{
            background: S.surface, border: `1px dashed ${S.border}`, borderRadius: 12,
            display: "flex", gap: 10, alignItems: "center", padding: "10px 14px",
          }}>
            <ColorFamilyPicker value={newColor} onChange={setNewColor} size={28} />
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
              placeholder="Type name…"
              style={{
                flex: 1, background: "transparent", border: "none", outline: "none",
                color: S.text, fontSize: 14, minWidth: 0,
              }}
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={!newName.trim() || adding}
              className="btn"
              style={{ padding: "6px 16px", fontSize: 13, borderRadius: 8, flexShrink: 0 }}
            >
              {adding ? "Adding…" : "+ Add"}
            </button>
          </div>
          {addError && (
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "rgb(220 38 38)" }}>{addError}</p>
          )}
        </div>
      </div>

      {/* Public Calendars card */}
      <div style={{
        background: S.card, border: `1px solid ${S.border}`,
        borderRadius: 16, padding: 24, display: "grid", gap: 24,
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Public Calendars</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: S.dim }}>
            Create shareable, embeddable calendars. Only items visible to "Team" and types marked Public are shown.
          </p>
        </div>

        {/* Existing calendars */}
        {calsLoading ? (
          <div style={{ fontSize: 13, color: S.dim }}>Loading…</div>
        ) : calendars.length > 0 ? (
          <div style={{ display: "grid", gap: 10 }}>
            {calendars.map((cal) => (
              <CalendarCard
                key={cal.id}
                cal={cal}
                onDelete={(id) => setCalendars((prev) => prev.filter((c) => c.id !== id))}
              />
            ))}
          </div>
        ) : null}

        {/* Create form */}
        <div>
          <div style={{
            fontSize: 10, fontWeight: 800, letterSpacing: "0.1em",
            color: S.dim, textTransform: "uppercase", marginBottom: 14,
          }}>
            New Public Calendar
          </div>
          <CalendarForm
            publicTypes={publicTypes}
            onCreated={(cal) => setCalendars((prev) => [...prev, cal])}
          />
        </div>
      </div>

      {/* Dashboard Widget card */}
      <div style={{
        background: S.card, border: `1px solid ${S.border}`,
        borderRadius: 16, padding: 24, display: "grid", gap: 24,
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Dashboard Widget</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: S.dim }}>
            Configure which items appear on the CRM dashboard and how they're sorted.
          </p>
        </div>

        {widgetLoading ? (
          <div style={{ fontSize: 13, color: S.dim }}>Loading…</div>
        ) : (
          <div style={{ display: "grid", gap: 20 }}>

            {/* View mode */}
            <div>
              <label style={{ fontSize: 12, color: S.dim, display: "block", marginBottom: 6, fontWeight: 600 }}>View Mode</label>
              <div style={{ display: "flex", gap: 6 }}>
                {([
                  { key: "list",     label: "📋 List" },
                  { key: "calendar", label: "📅 Calendar" },
                ] as const).map(({ key, label }) => {
                  const sel = widget.widget_view === key;
                  return (
                    <button key={key} type="button" onClick={() => setWidget((w) => ({ ...w, widget_view: key }))} style={{
                      padding: "6px 16px", borderRadius: 16, fontSize: 12, fontWeight: 600,
                      cursor: "pointer", transition: "all .1s",
                      border: sel ? "1px solid rgba(99,102,241,.5)" : `1px solid ${S.border}`,
                      background: sel ? "rgba(99,102,241,.14)" : "rgba(255,255,255,.04)",
                      color: sel ? "#a5b4fc" : S.dim,
                    }}>{label}</button>
                  );
                })}
              </div>
            </div>

            {/* Calendar default view — only shown when Calendar is selected */}
            {widget.widget_view === "calendar" && (
              <div>
                <label style={{ fontSize: 12, color: S.dim, display: "block", marginBottom: 6, fontWeight: 600 }}>Calendar Default View</label>
                <div style={{ display: "flex", gap: 6 }}>
                  {(["day", "week", "month"] as const).map((v) => {
                    const sel = widget.calendar_default_view === v;
                    return (
                      <button key={v} type="button" onClick={() => setWidget((w) => ({ ...w, calendar_default_view: v }))} style={{
                        padding: "4px 14px", borderRadius: 16, fontSize: 12, fontWeight: 500,
                        cursor: "pointer", transition: "all .1s",
                        border: sel ? "1px solid rgba(255,255,255,.3)" : `1px solid ${S.border}`,
                        background: sel ? "rgba(255,255,255,.12)" : "rgba(255,255,255,.04)",
                        color: sel ? S.text : S.dim,
                      }}>{v.charAt(0).toUpperCase() + v.slice(1)}</button>
                    );
                  })}
                </div>
                <p style={{ margin: "6px 0 0", fontSize: 12, color: S.dim }}>
                  Users can still switch between Day / Week / Month on the dashboard.
                </p>
              </div>
            )}

            {/* Type filter */}
            <div>
              <label style={{ fontSize: 12, color: S.dim, display: "block", marginBottom: 6, fontWeight: 600 }}>
                Show Types
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {types.map((t) => {
                  const sel = widget.show_types.includes(t.slug);
                  return (
                    <button
                      key={t.slug}
                      type="button"
                      onClick={() => setWidget((w) => ({
                        ...w,
                        show_types: sel
                          ? w.show_types.filter((s) => s !== t.slug)
                          : [...w.show_types, t.slug],
                      }))}
                      style={{
                        padding: "4px 12px", borderRadius: 16, fontSize: 12, fontWeight: 500,
                        cursor: "pointer", transition: "all .1s",
                        border: sel ? "1px solid rgba(99,102,241,.5)" : `1px solid ${S.border}`,
                        background: sel ? "rgba(99,102,241,.14)" : "rgba(255,255,255,.04)",
                        color: sel ? "#a5b4fc" : S.dim,
                      }}
                    >{t.name}</button>
                  );
                })}
              </div>
              {widget.show_types.length === 0 && (
                <p style={{ fontSize: 12, color: S.dim, margin: "4px 0 0" }}>All types shown when none selected.</p>
              )}
            </div>

            {/* Sort by */}
            <div>
              <label style={{ fontSize: 12, color: S.dim, display: "block", marginBottom: 6, fontWeight: 600 }}>Sort By</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {([
                  { key: "due_date",   label: "Due Date" },
                  { key: "start_at",   label: "Start At" },
                  { key: "priority",   label: "Priority" },
                  { key: "created_at", label: "Created" },
                ] as const).map(({ key, label }) => {
                  const sel = widget.sort_by === key;
                  return (
                    <button key={key} type="button" onClick={() => setWidget((w) => ({ ...w, sort_by: key }))} style={{
                      padding: "4px 12px", borderRadius: 16, fontSize: 12, fontWeight: 500,
                      cursor: "pointer", transition: "all .1s",
                      border: sel ? "1px solid rgba(255,255,255,.3)" : `1px solid ${S.border}`,
                      background: sel ? "rgba(255,255,255,.12)" : "rgba(255,255,255,.04)",
                      color: sel ? S.text : S.dim,
                    }}>{label}</button>
                  );
                })}
                <div style={{ display: "flex", gap: 4, marginLeft: 8 }}>
                  {(["asc", "desc"] as const).map((dir) => {
                    const sel = widget.sort_dir === dir;
                    return (
                      <button key={dir} type="button" onClick={() => setWidget((w) => ({ ...w, sort_dir: dir }))} style={{
                        padding: "4px 10px", borderRadius: 16, fontSize: 12, fontWeight: 500,
                        cursor: "pointer", transition: "all .1s",
                        border: sel ? "1px solid rgba(255,255,255,.3)" : `1px solid ${S.border}`,
                        background: sel ? "rgba(255,255,255,.12)" : "rgba(255,255,255,.04)",
                        color: sel ? S.text : S.dim,
                      }}>{dir === "asc" ? "↑ Asc" : "↓ Desc"}</button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Group by */}
            <div>
              <label style={{ fontSize: 12, color: S.dim, display: "block", marginBottom: 6, fontWeight: 600 }}>Group By</label>
              <div style={{ display: "flex", gap: 6 }}>
                {([
                  { key: "none",     label: "None" },
                  { key: "type",     label: "Type" },
                  { key: "status",   label: "Status" },
                  { key: "priority", label: "Priority" },
                ] as const).map(({ key, label }) => {
                  const sel = widget.group_by === key;
                  return (
                    <button key={key} type="button" onClick={() => setWidget((w) => ({ ...w, group_by: key }))} style={{
                      padding: "4px 12px", borderRadius: 16, fontSize: 12, fontWeight: 500,
                      cursor: "pointer", transition: "all .1s",
                      border: sel ? "1px solid rgba(255,255,255,.3)" : `1px solid ${S.border}`,
                      background: sel ? "rgba(255,255,255,.12)" : "rgba(255,255,255,.04)",
                      color: sel ? S.text : S.dim,
                    }}>{label}</button>
                  );
                })}
              </div>
            </div>

            {/* Max items */}
            <div>
              <label style={{ fontSize: 12, color: S.dim, display: "block", marginBottom: 6, fontWeight: 600 }}>Max Items</label>
              <div style={{ display: "flex", gap: 6 }}>
                {[5, 8, 10, 15, 20].map((n) => {
                  const sel = widget.max_items === n;
                  return (
                    <button key={n} type="button" onClick={() => setWidget((w) => ({ ...w, max_items: n }))} style={{
                      padding: "4px 12px", borderRadius: 16, fontSize: 12, fontWeight: 500,
                      cursor: "pointer", transition: "all .1s",
                      border: sel ? "1px solid rgba(255,255,255,.3)" : `1px solid ${S.border}`,
                      background: sel ? "rgba(255,255,255,.12)" : "rgba(255,255,255,.04)",
                      color: sel ? S.text : S.dim,
                    }}>{n}</button>
                  );
                })}
              </div>
            </div>

            {/* Save */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button
                type="button"
                onClick={saveWidget}
                disabled={widgetSaving}
                className="btn"
                style={{ padding: "8px 20px", fontSize: 13, borderRadius: 8 }}
              >
                {widgetSaving ? "Saving…" : "Save Widget Settings"}
              </button>
              {widgetSaved && <span style={{ fontSize: 12, color: "#4ade80", fontWeight: 600 }}>Saved ✓</span>}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
