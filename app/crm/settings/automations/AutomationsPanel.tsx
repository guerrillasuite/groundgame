"use client";

import { useState } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

type Squad = { id: string; name: string; color: string };
type User  = { id: string; name: string; email: string };

type Automation = {
  id:             string;
  name:           string;
  trigger_type:   string;
  trigger_config: Record<string, any>;
  conditions:     Condition[];
  action_type:    string;
  action_config:  Record<string, any>;
  is_active:      boolean;
  run_count:      number;
  last_run_at:    string | null;
  created_at:     string;
};

type Condition = {
  field: string;
  op:    "eq" | "neq" | "in" | "not_in" | "is_empty" | "is_not_empty";
  value?: any;
};

// ── Constants ──────────────────────────────────────────────────────────────────

const TRIGGER_LABELS: Record<string, string> = {
  item_created:             "Item Created",
  status_changed:           "Status Changed",
  item_completed:           "Item Completed",
  item_cancelled:           "Item Cancelled",
  priority_changed:         "Priority Changed",
  assignment_added:         "User Assigned",
  due_date_changed:         "Due Date Changed",
  item_overdue:             "Item Overdue (cron)",
  date_approaching:         "Date Approaching (cron)",
  opportunity_created:      "Opportunity Created",
  opportunity_stage_changed:"Opportunity Stage Changed",
  person_created:           "Person Created",
  scheduled_daily:          "Scheduled Daily",
  scheduled_weekly:         "Scheduled Weekly",
};

const ACTION_LABELS: Record<string, string> = {
  send_email:               "Send Email",
  create_sitrep_item:       "Create SitRep Item",
  update_sitrep_item:       "Update This Item",
  create_reminder:          "Create Reminder",
  update_opportunity_stage: "Update Opportunity Stage",
};

const STATUS_OPTIONS  = ["open", "in_progress", "confirmed", "done", "cancelled"];
const PRIORITY_OPTIONS = ["low", "normal", "high", "urgent"];
const ITEM_TYPES      = ["task", "event", "meeting"];
const CONDITION_FIELDS = ["item_type", "status", "priority", "visibility", "squad_id", "tenant_id", "created_by", "is_all_day", "parent_item_id"];
const CONDITION_OPS    = [
  { value: "eq",           label: "equals" },
  { value: "neq",          label: "not equals" },
  { value: "in",           label: "is one of" },
  { value: "not_in",       label: "is not one of" },
  { value: "is_empty",     label: "is empty" },
  { value: "is_not_empty", label: "is not empty" },
];

// ── Styles ─────────────────────────────────────────────────────────────────────

const S = {
  bg:      "rgb(10 13 20)",
  surface: "rgb(14 18 28)",
  card:    "rgb(20 25 38)",
  border:  "rgba(255,255,255,.07)",
  text:    "rgb(236 240 245)",
  dim:     "rgb(100 116 139)",
  dimBr:   "rgb(148 163 184)",
} as const;

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 11px", borderRadius: 8,
  background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)",
  color: S.text, fontSize: 13, outline: "none",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: "0.05em",
  textTransform: "uppercase", color: S.dim, display: "block", marginBottom: 5,
};

// ── FieldMap selector ──────────────────────────────────────────────────────────

type FieldMapValue =
  | { mode: "static";    value: any }
  | { mode: "none" }
  | { mode: "today";     offset_days?: number }
  | { mode: "creator" }
  | { mode: "assignees" }
  | { mode: "field";     field: string; offset_days?: number; prefix?: string };

function FieldMapSelect({
  label, value, onChange, type = "text", staticOptions,
  showNone = false, showCreator = false, showAssignees = false,
  showDateField = false, fieldOptions,
}: {
  label: string;
  value: FieldMapValue | null;
  onChange: (v: FieldMapValue | null) => void;
  type?: "text" | "select" | "date";
  staticOptions?: { value: any; label: string }[];
  showNone?: boolean;
  showCreator?: boolean;
  showAssignees?: boolean;
  showDateField?: boolean;
  fieldOptions?: string[];
}) {
  const mode = value?.mode ?? "static";

  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
        <select
          value={mode}
          onChange={(e) => {
            const m = e.target.value;
            if (m === "none")      onChange({ mode: "none" });
            else if (m === "creator")   onChange({ mode: "creator" });
            else if (m === "assignees") onChange({ mode: "assignees" });
            else if (m === "today")     onChange({ mode: "today", offset_days: 0 });
            else if (m === "field")     onChange({ mode: "field", field: fieldOptions?.[0] ?? "title" });
            else                        onChange({ mode: "static", value: staticOptions?.[0]?.value ?? "" });
          }}
          style={{ ...inputStyle, width: "auto", flex: "0 0 auto" }}
        >
          <option value="static">Static value</option>
          {showNone      && <option value="none">None</option>}
          {showCreator   && <option value="creator">From trigger: creator</option>}
          {showAssignees && <option value="assignees">From trigger: assignees</option>}
          {showDateField && <option value="today">Today + N days</option>}
          {fieldOptions  && <option value="field">From trigger field</option>}
        </select>

        {mode === "static" && (
          staticOptions ? (
            <select
              value={(value as any)?.value ?? ""}
              onChange={(e) => onChange({ mode: "static", value: e.target.value })}
              style={{ ...inputStyle, flex: 1 }}
            >
              {staticOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          ) : (
            <input
              type={type === "date" ? "date" : "text"}
              value={(value as any)?.value ?? ""}
              onChange={(e) => onChange({ mode: "static", value: e.target.value })}
              style={{ ...inputStyle, flex: 1 }}
            />
          )
        )}

        {mode === "today" && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: S.dim, fontSize: 12 }}>+</span>
            <input
              type="number" min={0}
              value={(value as any)?.offset_days ?? 0}
              onChange={(e) => onChange({ mode: "today", offset_days: parseInt(e.target.value) || 0 })}
              style={{ ...inputStyle, width: 70 }}
            />
            <span style={{ color: S.dim, fontSize: 12 }}>days</span>
          </div>
        )}

        {mode === "field" && fieldOptions && (
          <>
            <select
              value={(value as any)?.field ?? fieldOptions[0]}
              onChange={(e) => onChange({ ...(value as any), mode: "field", field: e.target.value })}
              style={{ ...inputStyle, flex: 1 }}
            >
              {fieldOptions.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
            {showDateField && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: S.dim, fontSize: 12 }}>+</span>
                <input
                  type="number" min={0}
                  value={(value as any)?.offset_days ?? 0}
                  onChange={(e) => onChange({ ...(value as any), offset_days: parseInt(e.target.value) || 0 })}
                  style={{ ...inputStyle, width: 70 }}
                />
                <span style={{ color: S.dim, fontSize: 12 }}>days</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function AutomationsPanel({
  initialAutomations, squads, users, tenantId, pipelines, customItemTypes,
}: {
  initialAutomations: Automation[];
  squads:             Squad[];
  users:              User[];
  tenantId:           string;
  pipelines:          { key: string; label: string }[];
  customItemTypes:    { slug: string; name: string }[];
}) {
  const [automations, setAutomations] = useState<Automation[]>(initialAutomations);
  const [editing,     setEditing]     = useState<Automation | null>(null);
  const [showForm,    setShowForm]    = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState("");
  const [toggling,    setToggling]    = useState<Record<string, boolean>>({});

  // Form state
  const [name,          setName]          = useState("");
  const [triggerType,   setTriggerType]   = useState("status_changed");
  const [triggerConfig, setTriggerConfig] = useState<Record<string, any>>({});
  const [conditions,    setConditions]    = useState<Condition[]>([]);
  const [actionType,    setActionType]    = useState("send_email");
  const [actionConfig,  setActionConfig]  = useState<Record<string, any>>({});

  function openCreate() {
    setEditing(null);
    setName(""); setTriggerType("status_changed"); setTriggerConfig({});
    setConditions([]); setActionType("send_email"); setActionConfig({});
    setError(""); setShowForm(true);
  }

  function openEdit(a: Automation) {
    setEditing(a);
    setName(a.name); setTriggerType(a.trigger_type); setTriggerConfig(a.trigger_config ?? {});
    setConditions(a.conditions ?? []); setActionType(a.action_type); setActionConfig(a.action_config ?? {});
    setError(""); setShowForm(true);
  }

  function cancelForm() { setShowForm(false); setEditing(null); setError(""); }

  async function handleSave() {
    if (!name.trim()) { setError("Name is required."); return; }
    setSaving(true); setError("");
    try {
      const body = {
        name: name.trim(), trigger_type: triggerType, trigger_config: triggerConfig,
        conditions, action_type: actionType, action_config: actionConfig,
      };
      const url    = editing ? `/api/crm/sitrep/automations/${editing.id}` : "/api/crm/sitrep/automations";
      const method = editing ? "PATCH" : "POST";
      const res    = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); setError(e.error ?? "Save failed."); return; }
      const data: Automation = await res.json();
      setAutomations((prev) =>
        editing ? prev.map((a) => a.id === data.id ? data : a) : [data, ...prev]
      );
      cancelForm();
    } catch { setError("Network error."); }
    finally { setSaving(false); }
  }

  async function handleToggle(a: Automation) {
    setToggling((t) => ({ ...t, [a.id]: true }));
    const res = await fetch(`/api/crm/sitrep/automations/${a.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !a.is_active }),
    });
    if (res.ok) {
      setAutomations((prev) => prev.map((x) => x.id === a.id ? { ...x, is_active: !a.is_active } : x));
    }
    setToggling((t) => ({ ...t, [a.id]: false }));
  }

  async function handleDelete(a: Automation) {
    if (!confirm(`Delete automation "${a.name}"?`)) return;
    const res = await fetch(`/api/crm/sitrep/automations/${a.id}`, { method: "DELETE" });
    if (res.ok) setAutomations((prev) => prev.filter((x) => x.id !== a.id));
  }

  return (
    <div className="stack" style={{ maxWidth: 860 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }}>Automations</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: S.dim }}>
            Trigger-based rules that fire automatically when conditions are met.
          </p>
        </div>
        <button onClick={openCreate} style={{
          padding: "8px 18px", borderRadius: 10, fontSize: 13, fontWeight: 700,
          background: "linear-gradient(135deg, var(--gg-primary,#2563eb), color-mix(in srgb, var(--gg-primary,#2563eb) 68%, #7c3aed))",
          boxShadow: "0 2px 14px color-mix(in srgb, var(--gg-primary,#2563eb) 40%, transparent)",
          border: "none", color: "#fff", cursor: "pointer",
        }}>+ New Automation</button>
      </div>

      {/* List */}
      <div style={{ display: "grid", gap: 8 }}>
        {automations.length === 0 && !showForm && (
          <div style={{ padding: "48px 0", textAlign: "center", color: S.dim, fontSize: 14 }}>
            No automations yet. Click <strong style={{ color: S.text }}>+ New Automation</strong> to create one.
          </div>
        )}
        {automations.map((a) => (
          <div key={a.id} style={{
            display: "flex", alignItems: "center", gap: 12, padding: "14px 18px",
            background: S.card, border: `1px solid ${S.border}`, borderRadius: 12,
            opacity: a.is_active ? 1 : 0.55,
          }}>
            {/* Active toggle */}
            <button
              onClick={() => handleToggle(a)}
              disabled={!!toggling[a.id]}
              title={a.is_active ? "Active — click to disable" : "Inactive — click to enable"}
              style={{
                width: 36, height: 20, borderRadius: 10, flexShrink: 0, position: "relative",
                background: a.is_active ? "var(--gg-primary,#2563eb)" : "rgba(255,255,255,.12)",
                border: "none", cursor: "pointer", transition: "background .2s",
              }}
            >
              <span style={{
                position: "absolute", top: 2, left: a.is_active ? 18 : 2,
                width: 16, height: 16, borderRadius: "50%", background: "#fff",
                boxShadow: "0 1px 3px rgba(0,0,0,.3)", transition: "left .2s",
              }} />
            </button>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: S.text, marginBottom: 3 }}>{a.name}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 5,
                  background: "rgba(37,99,235,.18)", color: "#93c5fd", letterSpacing: "0.05em",
                }}>{TRIGGER_LABELS[a.trigger_type] ?? a.trigger_type}</span>
                <span style={{ fontSize: 10, color: S.dim }}>→</span>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 5,
                  background: "rgba(16,185,129,.15)", color: "#6ee7b7", letterSpacing: "0.05em",
                }}>{ACTION_LABELS[a.action_type] ?? a.action_type}</span>
                {a.run_count > 0 && (
                  <span style={{ fontSize: 10, color: S.dim }}>· {a.run_count} runs</span>
                )}
              </div>
            </div>

            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => openEdit(a)} style={{
                padding: "5px 12px", borderRadius: 7, fontSize: 12, fontWeight: 600,
                background: "rgba(255,255,255,.06)", border: `1px solid ${S.border}`,
                color: S.dimBr, cursor: "pointer",
              }}>Edit</button>
              <button onClick={() => handleDelete(a)} style={{
                padding: "5px 12px", borderRadius: 7, fontSize: 12, fontWeight: 600,
                background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.2)",
                color: "#fca5a5", cursor: "pointer",
              }}>Delete</button>
            </div>
          </div>
        ))}
      </div>

      {/* Create/edit form */}
      {showForm && (
        <div style={{
          background: S.surface, border: `1px solid rgba(255,255,255,.1)`, borderRadius: 16,
          padding: "24px", marginTop: 8,
          boxShadow: "0 16px 48px rgba(0,0,0,.5)",
        }}>
          <h2 style={{ margin: "0 0 20px", fontSize: 16, fontWeight: 800 }}>
            {editing ? "Edit Automation" : "New Automation"}
          </h2>

          {/* Name */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Overdue Task Reminder" style={inputStyle} />
          </div>

          {/* Trigger */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Trigger</label>
            <select value={triggerType} onChange={(e) => { setTriggerType(e.target.value); setTriggerConfig({}); }}
              style={inputStyle}>
              <optgroup label="SitRep Item">
                {["item_created","status_changed","item_completed","item_cancelled","priority_changed","assignment_added","due_date_changed"].map((t) => (
                  <option key={t} value={t}>{TRIGGER_LABELS[t]}</option>
                ))}
              </optgroup>
              <optgroup label="SitRep Cron">
                {["item_overdue","date_approaching"].map((t) => (
                  <option key={t} value={t}>{TRIGGER_LABELS[t]}</option>
                ))}
              </optgroup>
              <optgroup label="CRM">
                {["opportunity_created","opportunity_stage_changed","person_created"].map((t) => (
                  <option key={t} value={t}>{TRIGGER_LABELS[t]}</option>
                ))}
              </optgroup>
              <optgroup label="Scheduled">
                {["scheduled_daily","scheduled_weekly"].map((t) => (
                  <option key={t} value={t}>{TRIGGER_LABELS[t]}</option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* Trigger config sub-fields */}
          <TriggerConfigFields type={triggerType} config={triggerConfig} onChange={setTriggerConfig} pipelines={pipelines} />

          {/* Conditions */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>Conditions (optional, AND logic)</label>
              <button onClick={() => setConditions((c) => [...c, { field: "item_type", op: "eq", value: "task" }])}
                style={{ fontSize: 11, fontWeight: 700, color: "color-mix(in srgb, var(--gg-primary,#2563eb) 80%, #fff)",
                  background: "none", border: "none", cursor: "pointer" }}>
                + Add Condition
              </button>
            </div>
            {conditions.map((cond, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "center", flexWrap: "wrap" }}>
                <select value={cond.field}
                  onChange={(e) => setConditions((c) => c.map((x, j) => j === i ? { ...x, field: e.target.value } : x))}
                  style={{ ...inputStyle, width: "auto", flex: "1 1 120px" }}>
                  {CONDITION_FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
                <select value={cond.op}
                  onChange={(e) => setConditions((c) => c.map((x, j) => j === i ? { ...x, op: e.target.value as any } : x))}
                  style={{ ...inputStyle, width: "auto", flex: "1 1 110px" }}>
                  {CONDITION_OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {!["is_empty","is_not_empty"].includes(cond.op) && (
                  <input value={Array.isArray(cond.value) ? cond.value.join(", ") : (cond.value ?? "")}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const val = cond.op === "in" || cond.op === "not_in"
                        ? raw.split(",").map((s) => s.trim()).filter(Boolean)
                        : raw;
                      setConditions((c) => c.map((x, j) => j === i ? { ...x, value: val } : x));
                    }}
                    placeholder={cond.op === "in" || cond.op === "not_in" ? "val1, val2" : "value"}
                    style={{ ...inputStyle, flex: "2 1 140px" }}
                  />
                )}
                <button onClick={() => setConditions((c) => c.filter((_, j) => j !== i))}
                  style={{ background: "none", border: "none", color: S.dim, cursor: "pointer", fontSize: 16, flexShrink: 0 }}>×</button>
              </div>
            ))}
          </div>

          {/* Action */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Action</label>
            <select value={actionType} onChange={(e) => { setActionType(e.target.value); setActionConfig({}); }}
              style={inputStyle}>
              {Object.entries(ACTION_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>

          {/* Action config sub-fields */}
          <ActionConfigFields
            type={actionType} config={actionConfig} onChange={setActionConfig}
            squads={squads} users={users} customItemTypes={customItemTypes}
          />

          {error && (
            <div style={{ padding: "9px 14px", borderRadius: 8, background: "rgba(239,68,68,.1)",
              border: "1px solid rgba(239,68,68,.25)", color: "#fca5a5", fontSize: 13, marginBottom: 12 }}>
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={cancelForm} style={{
              padding: "9px 20px", borderRadius: 9, fontSize: 13, fontWeight: 600,
              border: `1px solid ${S.border}`, background: "rgba(255,255,255,.05)",
              color: S.dimBr, cursor: "pointer",
            }}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={{
              padding: "9px 22px", borderRadius: 9, fontSize: 13, fontWeight: 700,
              background: "linear-gradient(135deg, var(--gg-primary,#2563eb), color-mix(in srgb, var(--gg-primary,#2563eb) 68%, #7c3aed))",
              border: "none", color: "#fff", cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1,
            }}>{saving ? "Saving…" : editing ? "Save Changes" : "Create Automation"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Trigger config sub-form ────────────────────────────────────────────────────

function TriggerConfigFields({
  type, config, onChange, pipelines,
}: {
  type: string;
  config: Record<string, any>;
  onChange: (c: Record<string, any>) => void;
  pipelines: { key: string; label: string }[];
}) {
  const set = (k: string, v: any) => onChange({ ...config, [k]: v });
  const inp = (k: string, placeholder: string) => (
    <input value={config[k] ?? ""} onChange={(e) => set(k, e.target.value || undefined)}
      placeholder={placeholder} style={{ ...inputStyle, marginBottom: 8 }} />
  );

  const PipelineSelect = () => (
    <div style={{ marginBottom: 16 }}>
      <label style={labelStyle}>Filter pipeline (optional)</label>
      <select value={config.pipeline ?? ""} onChange={(e) => set("pipeline", e.target.value || undefined)} style={inputStyle}>
        <option value="">Any pipeline</option>
        {pipelines.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
      </select>
    </div>
  );

  if (type === "status_changed") return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
      <div><label style={labelStyle}>From status (optional)</label>
        <select value={config.from_status ?? ""} onChange={(e) => set("from_status", e.target.value || undefined)} style={inputStyle}>
          <option value="">Any</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div><label style={labelStyle}>To status (optional)</label>
        <select value={config.to_status ?? ""} onChange={(e) => set("to_status", e.target.value || undefined)} style={inputStyle}>
          <option value="">Any</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
    </div>
  );

  if (type === "priority_changed") return (
    <div style={{ marginBottom: 16 }}>
      <label style={labelStyle}>To priority (optional)</label>
      <select value={config.to_priority ?? ""} onChange={(e) => set("to_priority", e.target.value || undefined)} style={inputStyle}>
        <option value="">Any</option>
        {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
    </div>
  );

  if (type === "item_overdue") return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
      <div><label style={labelStyle}>Filter item type (optional)</label>
        <select value={config.item_type ?? ""} onChange={(e) => set("item_type", e.target.value || undefined)} style={inputStyle}>
          <option value="">All types</option>
          {ITEM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div><label style={labelStyle}>Filter priority (optional)</label>
        <select value={config.priority ?? ""} onChange={(e) => set("priority", e.target.value || undefined)} style={inputStyle}>
          <option value="">All priorities</option>
          {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
    </div>
  );

  if (type === "date_approaching") return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
      <div><label style={labelStyle}>Days before due date</label>
        <input type="number" min={1} value={config.days_before ?? 1}
          onChange={(e) => set("days_before", parseInt(e.target.value) || 1)} style={inputStyle} />
      </div>
      <div><label style={labelStyle}>Filter item type (optional)</label>
        <select value={config.item_type ?? ""} onChange={(e) => set("item_type", e.target.value || undefined)} style={inputStyle}>
          <option value="">All types</option>
          {ITEM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
    </div>
  );

  if (type === "opportunity_stage_changed") return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div><label style={labelStyle}>From stage (optional)</label>{inp("from_stage", "e.g. new")}</div>
        <div><label style={labelStyle}>To stage (optional)</label>{inp("to_stage", "e.g. won")}</div>
      </div>
      <PipelineSelect />
    </div>
  );

  if (type === "opportunity_created") return (
    <PipelineSelect />
  );

  if (type === "item_created") return (
    <div style={{ marginBottom: 16 }}>
      <label style={labelStyle}>Filter item type (optional)</label>
      <select value={config.item_type ?? ""} onChange={(e) => set("item_type", e.target.value || undefined)} style={inputStyle}>
        <option value="">All types</option>
        {ITEM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
    </div>
  );

  if (type === "scheduled_daily") return (
    <div style={{ marginBottom: 16 }}>
      <label style={labelStyle}>Time (UTC, HH:MM)</label>
      <input value={config.time_utc ?? "08:00"} onChange={(e) => set("time_utc", e.target.value)} style={inputStyle} placeholder="08:00" />
    </div>
  );

  if (type === "scheduled_weekly") return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
      <div><label style={labelStyle}>Day of week</label>
        <select value={config.day_of_week ?? 1} onChange={(e) => set("day_of_week", parseInt(e.target.value))} style={inputStyle}>
          {["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"].map((d, i) => (
            <option key={i} value={i}>{d}</option>
          ))}
        </select>
      </div>
      <div><label style={labelStyle}>Time (UTC, HH:MM)</label>
        <input value={config.time_utc ?? "08:00"} onChange={(e) => set("time_utc", e.target.value)} style={inputStyle} placeholder="08:00" />
      </div>
    </div>
  );

  return null;
}

// ── Action config sub-form ─────────────────────────────────────────────────────

function ActionConfigFields({
  type, config, onChange, squads, users, customItemTypes,
}: {
  type:            string;
  config:          Record<string, any>;
  onChange:        (c: Record<string, any>) => void;
  squads:          Squad[];
  users:           User[];
  customItemTypes: { slug: string; name: string }[];
}) {
  const set = (k: string, v: any) => onChange({ ...config, [k]: v });

  const TEMPLATE_HINT = (
    <div style={{ fontSize: 11, color: "rgb(100 116 139)", marginTop: 4 }}>
      Vars: <code style={{ fontSize: 10 }}>{"{{title}} {{status}} {{priority}} {{due_date}} {{squad_name}} {{assignee_names}} {{link}}"}</code>
    </div>
  );

  if (type === "send_email") return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Send to</label>
        <select value={config.recipient ?? "assignees"} onChange={(e) => set("recipient", e.target.value)} style={inputStyle}>
          <option value="assignees">Assignees / Assigned users</option>
          <option value="creator">Creator</option>
          <option value="specific_user">Specific user</option>
          <option value="all_org_members">All org members</option>
        </select>
      </div>
      {config.recipient === "specific_user" && (
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>User</label>
          <select value={config.user_id ?? ""} onChange={(e) => set("user_id", e.target.value)} style={inputStyle}>
            <option value="">Select user…</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
          </select>
        </div>
      )}
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Subject</label>
        <input value={config.subject_template ?? ""} onChange={(e) => set("subject_template", e.target.value)}
          placeholder="Task overdue: {{title}}" style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>Body</label>
        <textarea value={config.body_template ?? ""} onChange={(e) => set("body_template", e.target.value)}
          rows={4} placeholder="Hi,&#10;&#10;Your task '{{title}}' was due {{due_date}}. Please update its status.&#10;&#10;{{link}}"
          style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
        {TEMPLATE_HINT}
      </div>
    </div>
  );

  if (type === "create_sitrep_item") return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <label style={labelStyle}>Item type</label>
          <select value={config.item_type ?? "task"} onChange={(e) => set("item_type", e.target.value)} style={inputStyle}>
            <optgroup label="System">
              {ITEM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </optgroup>
            {customItemTypes.length > 0 && (
              <optgroup label="Custom">
                {customItemTypes.map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}
              </optgroup>
            )}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Visibility</label>
          <select value={config.visibility?.value ?? config.visibility ?? "assignee_only"}
            onChange={(e) => set("visibility", { mode: "static", value: e.target.value })} style={inputStyle}>
            <option value="private">Private</option>
            <option value="assignee_only">Assignees only</option>
            <option value="team">Team</option>
          </select>
        </div>
      </div>

      {/* Title */}
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Title</label>
        <div style={{ display: "flex", gap: 8 }}>
          <select
            value={config.title?.mode ?? "static"}
            onChange={(e) => {
              const m = e.target.value;
              set("title", m === "field" ? { mode: "field", field: "title", prefix: "" } : { mode: "static", value: "" });
            }}
            style={{ ...inputStyle, width: "auto", flexShrink: 0 }}>
            <option value="static">Static</option>
            <option value="field">From trigger: title (with prefix)</option>
          </select>
          {(config.title?.mode ?? "static") === "static" ? (
            <input value={config.title?.value ?? ""} onChange={(e) => set("title", { mode: "static", value: e.target.value })}
              placeholder="Follow up task" style={{ ...inputStyle, flex: 1 }} />
          ) : (
            <input value={config.title?.prefix ?? ""} onChange={(e) => set("title", { ...config.title, prefix: e.target.value })}
              placeholder='Prefix, e.g. "Follow up: "' style={{ ...inputStyle, flex: 1 }} />
          )}
        </div>
      </div>

      {/* Squad / Calendar */}
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Squad / Calendar</label>
        <div style={{ display: "flex", gap: 8 }}>
          <select
            value={config.squad_id?.mode ?? "none"}
            onChange={(e) => {
              const m = e.target.value;
              set("squad_id", m === "none" ? { mode: "none" } : m === "field" ? { mode: "field", field: "squad_id" } : { mode: "static", value: "" });
            }}
            style={{ ...inputStyle, width: "auto", flexShrink: 0 }}>
            <option value="none">None (personal)</option>
            <option value="field">From trigger (same squad)</option>
            <option value="static">Specific squad</option>
          </select>
          {config.squad_id?.mode === "static" && (
            <select value={config.squad_id?.value ?? ""} onChange={(e) => set("squad_id", { mode: "static", value: e.target.value })}
              style={{ ...inputStyle, flex: 1 }}>
              <option value="">Select squad…</option>
              {squads.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Due date */}
      <FieldMapSelect
        label="Due Date"
        value={config.due_date ?? null}
        onChange={(v) => set("due_date", v)}
        type="date"
        showNone
        showDateField
        fieldOptions={["due_date", "start_at"]}
      />

      {/* Priority */}
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Priority</label>
        <div style={{ display: "flex", gap: 8 }}>
          <select
            value={config.priority?.mode ?? "static"}
            onChange={(e) => {
              const m = e.target.value;
              set("priority", m === "field" ? { mode: "field", field: "priority" } : { mode: "static", value: "normal" });
            }}
            style={{ ...inputStyle, width: "auto", flexShrink: 0 }}>
            <option value="static">Static</option>
            <option value="field">From trigger</option>
          </select>
          {(config.priority?.mode ?? "static") === "static" && (
            <select value={config.priority?.value ?? "normal"} onChange={(e) => set("priority", { mode: "static", value: e.target.value })}
              style={{ ...inputStyle, flex: 1 }}>
              {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Assign to */}
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Assign to</label>
        <div style={{ display: "flex", gap: 8 }}>
          <select
            value={config.assign_to?.mode ?? "creator"}
            onChange={(e) => {
              const m = e.target.value;
              set("assign_to", m === "specific" ? { mode: "specific", user_id: "" } : { mode: m });
            }}
            style={{ ...inputStyle, width: "auto", flexShrink: 0 }}>
            <option value="creator">Trigger's creator</option>
            <option value="assignees">Trigger's assignees</option>
            <option value="specific">Specific user</option>
            <option value="none">No one</option>
          </select>
          {config.assign_to?.mode === "specific" && (
            <select value={config.assign_to?.user_id ?? ""} onChange={(e) => set("assign_to", { mode: "specific", user_id: e.target.value })}
              style={{ ...inputStyle, flex: 1 }}>
              <option value="">Select user…</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
            </select>
          )}
        </div>
      </div>
    </div>
  );

  if (type === "update_sitrep_item") return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
      <div>
        <label style={labelStyle}>Field</label>
        <select value={config.field ?? "status"} onChange={(e) => set("field", e.target.value)} style={inputStyle}>
          <option value="status">Status</option>
          <option value="priority">Priority</option>
          <option value="visibility">Visibility</option>
          <option value="due_date">Due Date</option>
        </select>
      </div>
      <div>
        <label style={labelStyle}>New value</label>
        {config.field === "priority" ? (
          <select value={config.value?.value ?? config.value ?? "normal"}
            onChange={(e) => set("value", { mode: "static", value: e.target.value })} style={inputStyle}>
            {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        ) : config.field === "visibility" ? (
          <select value={config.value?.value ?? config.value ?? "assignee_only"}
            onChange={(e) => set("value", { mode: "static", value: e.target.value })} style={inputStyle}>
            <option value="private">Private</option>
            <option value="assignee_only">Assignees only</option>
            <option value="team">Team</option>
          </select>
        ) : config.field === "due_date" ? (
          <FieldMapSelect label="" value={config.value ?? null} onChange={(v) => set("value", v)} type="date" showDateField fieldOptions={["due_date"]} />
        ) : (
          <select value={config.value?.value ?? config.value ?? "open"}
            onChange={(e) => set("value", { mode: "static", value: e.target.value })} style={inputStyle}>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
      </div>
    </div>
  );

  if (type === "create_reminder") return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Title template</label>
        <input value={config.title_template ?? "Reminder: {{title}}"} onChange={(e) => set("title_template", e.target.value)}
          style={inputStyle} />
        <div style={{ fontSize: 11, color: S.dim, marginTop: 4 }}>Supports {"{{vars}}"}</div>
      </div>
      <FieldMapSelect label="Due" value={config.due ?? null} onChange={(v) => set("due", v)} type="date" showDateField fieldOptions={["due_date"]} />
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Assign to</label>
        <div style={{ display: "flex", gap: 8 }}>
          <select value={config.assign_to?.mode ?? "creator"}
            onChange={(e) => {
              const m = e.target.value;
              set("assign_to", m === "specific" ? { mode: "specific", user_id: "" } : { mode: m });
            }}
            style={{ ...inputStyle, width: "auto", flexShrink: 0 }}>
            <option value="creator">Trigger's creator</option>
            <option value="specific">Specific user</option>
          </select>
          {config.assign_to?.mode === "specific" && (
            <select value={config.assign_to?.user_id ?? ""} onChange={(e) => set("assign_to", { mode: "specific", user_id: e.target.value })}
              style={{ ...inputStyle, flex: 1 }}>
              <option value="">Select user…</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
            </select>
          )}
        </div>
      </div>
    </div>
  );

  if (type === "update_opportunity_stage") return (
    <div style={{ marginBottom: 16 }}>
      <label style={labelStyle}>Change stage to</label>
      <input value={config.to_stage ?? ""} onChange={(e) => set("to_stage", e.target.value)}
        placeholder="e.g. won" style={inputStyle} />
    </div>
  );

  return null;
}
