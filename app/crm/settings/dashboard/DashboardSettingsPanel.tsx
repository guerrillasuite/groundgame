"use client";

import { useEffect, useState } from "react";

const S = {
  surface: "rgb(18 23 33)",
  card:    "rgb(28 36 48)",
  border:  "rgba(255,255,255,.08)",
  text:    "rgb(238 242 246)",
  dim:     "rgb(130 148 168)",
} as const;

const ADMIN_KPI_OPTIONS = [
  { id: "stops_today",           label: "Stops Today" },
  { id: "stops_this_week",       label: "Stops This Week" },
  { id: "open_opps",             label: "Open Opportunities" },
  { id: "pipeline_value",        label: "Pipeline Value" },
  { id: "win_rate",              label: "Win Rate (30d)" },
  { id: "contacts_reached_week", label: "Contacts Reached" },
  { id: "active_lists",          label: "Active Lists" },
  { id: "past_due_sitrep",       label: "Past Due Items" },
  { id: "surveys_completed_week",label: "Surveys This Week" },
  { id: "new_people_week",       label: "New Contacts" },
];

const FIELD_KPI_OPTIONS = [
  { id: "my_stops_today",       label: "My Stops Today" },
  { id: "my_stops_week",        label: "My Stops This Week" },
  { id: "my_lists",             label: "My Active Lists" },
  { id: "my_past_due",          label: "Past Due" },
  { id: "contacts_reached_today",label: "Contacts Reached" },
  { id: "active_ops",           label: "Active Opps" },
];

const ADMIN_WIDGET_LABELS: Record<string, string> = {
  pipeline:        "Opportunity Pipeline",
  active_lists:    "Active Lists",
  survey_progress: "Survey Progress",
  recent_activity: "Recent Activity",
  sitrep:          "SitRep Widget",
  intel_brief:     "Intel Brief",
};

const FIELD_WIDGET_LABELS: Record<string, string> = {
  my_lists:     "My Lists",
  sitrep:       "SitRep Widget",
  recent_stops: "Recent Stops",
};

type DashConfig = {
  admin_widgets: Record<string, boolean>;
  field_kpi_ids: string[];
  field_widgets: Record<string, boolean>;
};

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", userSelect: "none" }}>
      <div
        onClick={() => onChange(!checked)}
        style={{
          width: 38, height: 22, borderRadius: 99, position: "relative", flexShrink: 0,
          background: checked ? "#6366f1" : "rgba(255,255,255,.1)",
          border: `1px solid ${checked ? "#6366f1" : S.border}`,
          transition: "background .15s, border-color .15s",
          cursor: "pointer",
        }}
      >
        <div style={{
          position: "absolute", top: 2, left: checked ? 18 : 2,
          width: 16, height: 16, borderRadius: "50%", background: "white",
          transition: "left .15s",
          boxShadow: "0 1px 3px rgba(0,0,0,.3)",
        }} />
      </div>
      <span style={{ fontSize: 14, color: S.text }}>{label}</span>
    </label>
  );
}

function KpiChip({ id, label, selected, selectable, onToggle }: {
  id: string; label: string; selected: boolean; selectable: boolean; onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={!selected && !selectable}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 14px", borderRadius: 8, cursor: selected || selectable ? "pointer" : "default",
        background: selected ? "rgba(99,102,241,.15)" : "rgba(255,255,255,.04)",
        border: `1px solid ${selected ? "rgba(99,102,241,.4)" : S.border}`,
        color: selected ? "#a5b4fc" : selectable ? S.text : S.dim,
        fontSize: 13, fontWeight: 500, transition: "all .12s ease",
        opacity: !selected && !selectable ? 0.5 : 1,
      }}
    >
      {selected && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#6366f1", flexShrink: 0 }} />}
      {label}
    </button>
  );
}

export default function DashboardSettingsPanel({ isDirector }: { isDirector: boolean }) {
  const [myKpis, setMyKpis] = useState<string[]>([]);
  const [dashConfig, setDashConfig] = useState<DashConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [kpiSaving, setKpiSaving] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [kpiToast, setKpiToast] = useState("");
  const [configToast, setConfigToast] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/crm/dashboard/kpis").then(r => r.json()),
      isDirector ? fetch("/api/crm/dashboard/settings").then(r => r.json()) : Promise.resolve(null),
    ]).then(([kpiData, cfgData]) => {
      setMyKpis(kpiData.admin_kpi_ids ?? []);
      if (cfgData) setDashConfig(cfgData);
      setLoading(false);
    });
  }, [isDirector]);

  function toggleMyKpi(id: string) {
    setMyKpis(prev => {
      if (prev.includes(id)) return prev.filter(k => k !== id);
      if (prev.length >= 5) return prev;
      return [...prev, id];
    });
  }

  async function saveMyKpis() {
    setKpiSaving(true);
    const res = await fetch("/api/crm/dashboard/kpis", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admin_kpi_ids: myKpis }),
    });
    setKpiSaving(false);
    setKpiToast(res.ok ? "Saved!" : "Failed to save.");
    setTimeout(() => setKpiToast(""), 3000);
  }

  function toggleAdminWidget(key: string) {
    setDashConfig(prev => prev ? {
      ...prev,
      admin_widgets: { ...prev.admin_widgets, [key]: !prev.admin_widgets[key] },
    } : prev);
  }

  function toggleFieldWidget(key: string) {
    setDashConfig(prev => prev ? {
      ...prev,
      field_widgets: { ...prev.field_widgets, [key]: !prev.field_widgets[key] },
    } : prev);
  }

  function toggleFieldKpi(id: string) {
    setDashConfig(prev => {
      if (!prev) return prev;
      const cur = prev.field_kpi_ids;
      if (cur.includes(id)) return { ...prev, field_kpi_ids: cur.filter(k => k !== id) };
      if (cur.length >= 5) return prev;
      return { ...prev, field_kpi_ids: [...cur, id] };
    });
  }

  async function saveDashConfig() {
    if (!dashConfig) return;
    setConfigSaving(true);
    const res = await fetch("/api/crm/dashboard/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dashConfig),
    });
    setConfigSaving(false);
    setConfigToast(res.ok ? "Saved!" : "Failed to save.");
    setTimeout(() => setConfigToast(""), 3000);
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "32px 24px", color: S.dim, fontSize: 14 }}>
        Loading dashboard settings…
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "32px 24px", display: "flex", flexDirection: "column", gap: 32 }}>

      {/* ── My KPI Cards ─────────────────────────────────────────────────── */}
      <div style={{ background: S.card, border: `1px solid ${S.border}`, borderRadius: 12, padding: "24px 26px" }}>
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 700, color: S.text }}>My KPI Cards</h2>
          <p style={{ margin: 0, fontSize: 13, color: S.dim }}>
            Choose up to 5 stats to show at the top of your dashboard. Selected: {myKpis.length}/5
          </p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
          {ADMIN_KPI_OPTIONS.map(opt => (
            <KpiChip
              key={opt.id}
              id={opt.id}
              label={opt.label}
              selected={myKpis.includes(opt.id)}
              selectable={myKpis.length < 5}
              onToggle={() => toggleMyKpi(opt.id)}
            />
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button type="button" onClick={saveMyKpis} disabled={kpiSaving || myKpis.length === 0} className="gg-btn-primary" style={{ minWidth: 100 }}>
            {kpiSaving ? "Saving…" : "Save"}
          </button>
          {kpiToast && <span style={{ fontSize: 13, color: kpiToast === "Saved!" ? "#4ade80" : "#f87171" }}>{kpiToast}</span>}
        </div>
      </div>

      {/* ── Director-only: Tenant Dashboard Config ───────────────────────── */}
      {isDirector && dashConfig && (
        <div style={{ background: S.card, border: `1px solid ${S.border}`, borderRadius: 12, padding: "24px 26px", display: "flex", flexDirection: "column", gap: 28 }}>
          <div>
            <h2 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 700, color: S.text }}>Admin Dashboard Widgets</h2>
            <p style={{ margin: 0, fontSize: 13, color: S.dim }}>Choose which sections appear on the admin dashboard for all directors and support users.</p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {Object.keys(ADMIN_WIDGET_LABELS).map(key => (
              <Toggle
                key={key}
                checked={dashConfig.admin_widgets[key] ?? true}
                onChange={() => toggleAdminWidget(key)}
                label={ADMIN_WIDGET_LABELS[key]}
              />
            ))}
          </div>

          <div style={{ borderTop: `1px solid ${S.border}`, paddingTop: 24 }}>
            <h3 style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 700, color: S.text }}>Field Dashboard — KPI Cards</h3>
            <p style={{ margin: "0 0 14px", fontSize: 13, color: S.dim }}>
              Choose up to 5 stats for your field users&apos; dashboard. Selected: {dashConfig.field_kpi_ids.length}/5
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {FIELD_KPI_OPTIONS.map(opt => (
                <KpiChip
                  key={opt.id}
                  id={opt.id}
                  label={opt.label}
                  selected={dashConfig.field_kpi_ids.includes(opt.id)}
                  selectable={dashConfig.field_kpi_ids.length < 5}
                  onToggle={() => toggleFieldKpi(opt.id)}
                />
              ))}
            </div>
          </div>

          <div style={{ borderTop: `1px solid ${S.border}`, paddingTop: 24 }}>
            <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700, color: S.text }}>Field Dashboard — Widgets</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {Object.keys(FIELD_WIDGET_LABELS).map(key => (
                <Toggle
                  key={key}
                  checked={dashConfig.field_widgets[key] ?? true}
                  onChange={() => toggleFieldWidget(key)}
                  label={FIELD_WIDGET_LABELS[key]}
                />
              ))}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button type="button" onClick={saveDashConfig} disabled={configSaving} className="gg-btn-primary" style={{ minWidth: 100 }}>
              {configSaving ? "Saving…" : "Save Config"}
            </button>
            {configToast && <span style={{ fontSize: 13, color: configToast === "Saved!" ? "#4ade80" : "#f87171" }}>{configToast}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
