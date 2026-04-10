"use client";
import { useEffect, useState, useCallback } from "react";
import {
  ALL_FEATURE_KEYS,
  FEATURE_META,
  type FeatureKey,
} from "@/lib/features";

// Features hidden from self-service (plan-gated or admin-only)
const HIDDEN_FEATURES: FeatureKey[] = ["crm_survey_branding", "crm_enrichment"];

const GROUPS = ["App Settings", "CRM Core", "CRM Field", "CRM Data"] as const;

const TIMEZONES = [
  "UTC", "America/New_York", "America/Chicago", "America/Denver",
  "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu",
];

const IMPORT_MODES = [
  { value: "fill_blanks", label: "Fill Blanks (only update empty fields)" },
  { value: "smart_merge", label: "Smart Merge (update if newer or higher authority)" },
  { value: "override",    label: "Override (overwrite all mapped fields)" },
];

type ContactTypeRow = {
  key: string;
  label: string;
  stages: { key: string; label: string }[];
};

const TOGGLE: React.CSSProperties = {
  position: "relative", display: "inline-flex", width: 40, height: 22,
  borderRadius: 11, border: "none", cursor: "pointer", transition: "background 0.2s",
  flexShrink: 0,
};

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      style={{ ...TOGGLE, background: checked ? "var(--gg-primary, #2563eb)" : "rgba(255,255,255,.15)" }}
    >
      <span style={{
        position: "absolute", top: 3, left: checked ? 21 : 3,
        width: 16, height: 16, borderRadius: "50%", background: "#fff",
        transition: "left 0.2s",
      }} />
    </button>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", maxWidth: 360, padding: "8px 12px", borderRadius: 8,
  border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.04)",
  color: "inherit", fontSize: 14, boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, opacity: 0.6, marginBottom: 4 };

export default function TenantSelfPanel() {
  const [name, setName] = useState("");
  const [features, setFeatures] = useState<FeatureKey[]>([]);
  const [branding, setBranding] = useState<Record<string, unknown>>({});
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [contactTypes, setContactTypes] = useState<ContactTypeRow[]>([]);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/crm/settings/tenant")
      .then((r) => r.json())
      .then((d) => {
        setName(d.name ?? "");
        setFeatures(d.features ?? [...ALL_FEATURE_KEYS]);
        setBranding(d.branding ?? {});
        setSettings(d.settings ?? {});
        setContactTypes(d.contactTypes ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  function toggleGroup(group: string) {
    setCollapsedGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  }

  function toggleFeature(key: FeatureKey) {
    setFeatures((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
  }

  function setBrandingField(key: string, value: string) {
    setBranding((prev) => ({ ...prev, [key]: value }));
  }

  function setSettingsField(key: string, value: unknown) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  function togglePipeline(ctKey: string) {
    const hidden = (settings.hiddenContactTypes as string[] | undefined) ?? [];
    const next = hidden.includes(ctKey) ? hidden.filter((k) => k !== ctKey) : [...hidden, ctKey];
    setSettingsField("hiddenContactTypes", next);
  }

  function toggleStage(ctKey: string, stageKey: string) {
    const hiddenStages = (settings.hiddenStages as Record<string, string[]> | undefined) ?? {};
    const current = hiddenStages[ctKey] ?? [];
    const next = current.includes(stageKey) ? current.filter((k) => k !== stageKey) : [...current, stageKey];
    setSettingsField("hiddenStages", { ...hiddenStages, [ctKey]: next });
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/crm/settings/tenant", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, features, branding, settings }),
    });
    setSaving(false);
    if (res.ok) {
      setMsg({ type: "ok", text: "Saved successfully." });
      setTimeout(() => setMsg(null), 3000);
    } else {
      const body = await res.json().catch(() => ({}));
      setMsg({ type: "err", text: body.error ?? "Save failed" });
    }
  }

  if (loading) return <div className="stack"><p className="text-dim">Loading…</p></div>;

  return (
    <div className="stack">
      <div>
        <h2 style={{ margin: 0 }}>Brand Settings</h2>
        <p className="text-dim" style={{ marginTop: 4, fontSize: 13 }}>
          Customize your app branding, configure features, and control pipeline visibility.
        </p>
      </div>

      {/* Display Name */}
      <div>
        <label style={labelStyle}>Organization Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
      </div>

      {/* ── Branding ── */}
      <div>
        <p style={{ fontSize: 12, fontWeight: 700, opacity: 0.5, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
          Branding
        </p>
        <div style={{ display: "grid", gap: 16 }}>
          <div>
            <label style={labelStyle}>App Name</label>
            <input
              value={(branding.appName as string) ?? ""}
              onChange={(e) => setBrandingField("appName", e.target.value)}
              placeholder="GroundGame"
              style={inputStyle}
            />
          </div>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <div>
              <label style={labelStyle}>Primary Color</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="color" value={(branding.primaryColor as string) ?? "#2563EB"}
                  onChange={(e) => setBrandingField("primaryColor", e.target.value)}
                  style={{ width: 40, height: 32, borderRadius: 6, border: "1px solid rgba(255,255,255,.12)", background: "none", cursor: "pointer", padding: 2 }}
                />
                <input value={(branding.primaryColor as string) ?? "#2563EB"}
                  onChange={(e) => setBrandingField("primaryColor", e.target.value)}
                  style={{ ...inputStyle, maxWidth: 110, fontFamily: "monospace" }}
                />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Accent Color</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="color" value={(branding.accentColor as string) ?? "#3B82F6"}
                  onChange={(e) => setBrandingField("accentColor", e.target.value)}
                  style={{ width: 40, height: 32, borderRadius: 6, border: "1px solid rgba(255,255,255,.12)", background: "none", cursor: "pointer", padding: 2 }}
                />
                <input value={(branding.accentColor as string) ?? "#3B82F6"}
                  onChange={(e) => setBrandingField("accentColor", e.target.value)}
                  style={{ ...inputStyle, maxWidth: 110, fontFamily: "monospace" }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Feature Toggles ── */}
      <div>
        <p style={{ fontSize: 12, fontWeight: 700, opacity: 0.5, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
          Features
        </p>
        <div style={{ display: "grid", gap: 8 }}>
          {GROUPS.map((group) => {
            const groupKeys = ALL_FEATURE_KEYS.filter(
              (k) => FEATURE_META[k].group === group && !HIDDEN_FEATURES.includes(k)
            );
            if (groupKeys.length === 0) return null;
            const isCollapsed = !!collapsedGroups[group];
            const enabledCount = groupKeys.filter((k) => features.includes(k)).length;
            const hiddenPipelines = (settings.hiddenContactTypes as string[] | undefined) ?? [];
            const hiddenStagesMap = (settings.hiddenStages as Record<string, string[]> | undefined) ?? {};

            return (
              <div key={group} style={{ border: "1px solid rgba(255,255,255,.08)", borderRadius: 10, overflow: "hidden" }}>
                <button type="button" onClick={() => toggleGroup(group)}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "rgba(255,255,255,.03)", border: "none", cursor: "pointer", color: "inherit", textAlign: "left" }}
                >
                  <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.55, textTransform: "uppercase", letterSpacing: "0.08em", flex: 1 }}>{group}</span>
                  <span style={{ fontSize: 11, opacity: 0.4 }}>{enabledCount}/{groupKeys.length}</span>
                  <span style={{ fontSize: 10, opacity: 0.4, transform: isCollapsed ? "rotate(0deg)" : "rotate(90deg)", transition: "transform 0.15s" }}>▶</span>
                </button>

                {!isCollapsed && (
                  <div style={{ padding: "10px 14px", display: "grid", gap: 10 }}>
                    {groupKeys.map((key) => (
                      <div key={key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <ToggleSwitch checked={features.includes(key)} onChange={() => toggleFeature(key)} />
                        <span style={{ fontSize: 14 }}>{FEATURE_META[key].label}</span>
                      </div>
                    ))}

                    {/* Pipeline visibility — CRM Field only */}
                    {group === "CRM Field" && contactTypes.length > 0 && (
                      <div style={{ marginTop: 8, borderTop: "1px solid rgba(255,255,255,.07)", paddingTop: 14 }}>
                        <p style={{ fontSize: 11, fontWeight: 700, opacity: 0.4, textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 12px" }}>
                          Pipeline Visibility
                        </p>
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          {[...contactTypes, { key: "__uncategorized__", label: "Uncategorized", stages: [] }].map((ct) => {
                            const isPipelineOn = !hiddenPipelines.includes(ct.key);
                            const hiddenStages = hiddenStagesMap[ct.key] ?? [];
                            const stagesWithUncategorized = ct.key === "__uncategorized__" ? [] : [...ct.stages, { key: "__uncategorized__", label: "Uncategorized" }];
                            return (
                              <div key={ct.key} style={{
                                borderRadius: 10,
                                border: `1px solid ${isPipelineOn ? "rgba(99,102,241,.35)" : "rgba(255,255,255,.07)"}`,
                                background: isPipelineOn ? "rgba(99,102,241,.06)" : "rgba(255,255,255,.02)",
                                padding: "10px 12px",
                                transition: "all 0.2s",
                              }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: stagesWithUncategorized.length > 0 ? 10 : 0 }}>
                                  <span style={{ fontWeight: 700, fontSize: 14, opacity: isPipelineOn ? 1 : 0.4, transition: "opacity 0.2s" }}>
                                    {ct.label}
                                  </span>
                                  <ToggleSwitch checked={isPipelineOn} onChange={() => togglePipeline(ct.key)} />
                                </div>
                                {stagesWithUncategorized.length > 0 && (
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, opacity: isPipelineOn ? 1 : 0.3, transition: "opacity 0.2s", pointerEvents: isPipelineOn ? "auto" : "none" }}>
                                    {stagesWithUncategorized.map((stage) => {
                                      const isOn = !hiddenStages.includes(stage.key);
                                      return (
                                        <button key={stage.key} type="button" onClick={() => toggleStage(ct.key, stage.key)}
                                          style={{
                                            padding: "4px 11px", borderRadius: 20,
                                            border: isOn ? "1px solid rgba(99,102,241,.5)" : "1px solid rgba(255,255,255,.1)",
                                            background: isOn ? "rgba(99,102,241,.18)" : "transparent",
                                            color: isOn ? "#a5b4fc" : "rgba(255,255,255,.25)",
                                            fontSize: 12, fontWeight: 600, cursor: "pointer",
                                            textDecoration: isOn ? "none" : "line-through",
                                            transition: "all 0.15s",
                                          }}
                                        >
                                          {stage.label}
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Settings ── */}
      <div>
        <p style={{ fontSize: 12, fontWeight: 700, opacity: 0.5, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
          Settings
        </p>
        <div style={{ display: "grid", gap: 16 }}>
          <div>
            <label style={labelStyle}>Timezone</label>
            <select value={(settings.timezone as string) ?? ""} onChange={(e) => setSettingsField("timezone", e.target.value)} style={{ ...inputStyle, maxWidth: 300 }}>
              <option value="">— Default (UTC) —</option>
              {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Default Import Mode</label>
            <select value={(settings.defaultImportMode as string) ?? ""} onChange={(e) => setSettingsField("defaultImportMode", e.target.value)} style={{ ...inputStyle, maxWidth: 380 }}>
              <option value="">— Not set —</option>
              {IMPORT_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Support Email</label>
            <input type="email" value={(settings.supportEmail as string) ?? ""} onChange={(e) => setSettingsField("supportEmail", e.target.value)} placeholder="support@example.com" style={{ ...inputStyle, maxWidth: 300 }} />
          </div>
        </div>
      </div>

      {/* Save */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button type="button" onClick={save} disabled={saving}
          className="press-card"
          style={{ gridTemplateColumns: "1fr", width: "auto", padding: "10px 24px" }}
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
        {msg && (
          <p style={{ margin: 0, fontSize: 13, color: msg.type === "ok" ? "#86efac" : "#f87171" }}>
            {msg.text}
          </p>
        )}
      </div>
    </div>
  );
}
