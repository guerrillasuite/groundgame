"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import {
  ALL_FEATURE_KEYS,
  PLAN_FEATURES,
  FEATURE_META,
  planFromFeatures,
  type FeatureKey,
  type Plan,
} from "@/lib/features";
import type { Branding } from "@/lib/tenant";

type TenantData = {
  id: string;
  slug: string;
  name: string;
  plan: string;
  features: FeatureKey[];
  branding: Partial<Branding>;
  settings: Record<string, unknown>;
};

// Group features for the toggle grid
const GROUPS = ["PWA", "CRM Core", "CRM Field", "CRM Data"] as const;

const TOGGLE: React.CSSProperties = {
  position: "relative", display: "inline-flex", width: 40, height: 22,
  borderRadius: 11, border: "none", cursor: "pointer", transition: "background 0.2s",
  flexShrink: 0,
};

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        ...TOGGLE,
        background: checked ? "var(--gg-primary, #2563eb)" : "rgba(255,255,255,.15)",
      }}
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

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
];

const IMPORT_MODES = [
  { value: "fill_blanks", label: "Fill Blanks (only update empty fields)" },
  { value: "smart_merge", label: "Smart Merge (update if newer or higher authority)" },
  { value: "override",    label: "Override (overwrite all mapped fields)" },
];

export default function TenantEditPanel({ id }: { id: string }) {
  const [tenant, setTenant] = useState<TenantData | null>(null);
  const [name, setName] = useState("");
  const [features, setFeatures] = useState<FeatureKey[]>([]);
  const [branding, setBranding] = useState<Partial<Branding>>({});
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const getToken = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }, []);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (!token) { setLoading(false); return; }
      const res = await fetch(`/api/crm/admin/tenants/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { setLoading(false); return; }
      const data: TenantData = await res.json();
      setTenant(data);
      setName(data.name);
      setFeatures(data.features ?? [...ALL_FEATURE_KEYS]);
      setBranding(data.branding ?? {});
      setSettings(data.settings ?? {});
      setLoading(false);
    })();
  }, [id, getToken]);

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  }

  const currentPlan = planFromFeatures(features);

  function applyPlan(plan: Exclude<Plan, "custom">) {
    setFeatures([...PLAN_FEATURES[plan]]);
  }

  function toggleFeature(key: FeatureKey) {
    setFeatures((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  function setBrandingField(key: keyof Branding, value: string) {
    setBranding((prev) => ({ ...prev, [key]: value }));
  }

  function setSettingsField(key: string, value: unknown) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    const token = await getToken();
    if (!token) { setMsg({ type: "err", text: "Not authenticated" }); return; }
    setSaving(true);
    setMsg(null);

    let finalBranding = { ...branding };

    // Upload logo if a new file was selected
    if (logoFile) {
      const ext = logoFile.type.split("/")[1]?.toLowerCase() || "png";
      const path = `${id}/logo.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("tenant_logos")
        .upload(path, logoFile, { upsert: true, contentType: logoFile.type });
      if (uploadErr) {
        setSaving(false);
        setMsg({ type: "err", text: `Logo upload failed: ${uploadErr.message}` });
        return;
      }
      const { data: urlData } = supabase.storage.from("tenant_logos").getPublicUrl(path);
      finalBranding.logoUrl = urlData.publicUrl;
      setBranding(finalBranding);
      setLogoFile(null);
    }

    const res = await fetch(`/api/crm/admin/tenants/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name, plan: currentPlan, features, branding: finalBranding, settings }),
    });
    setSaving(false);
    if (res.ok) {
      setMsg({ type: "ok", text: "Saved successfully." });
    } else {
      const body = await res.json().catch(() => ({}));
      setMsg({ type: "err", text: body.error ?? "Save failed" });
    }
  }

  if (loading) return <div className="stack"><p className="text-dim">Loading…</p></div>;
  if (!tenant) return <div className="stack"><p style={{ color: "#f87171" }}>Tenant not found.</p></div>;

  const currentLogo = logoPreview ?? branding.logoUrl ?? null;

  return (
    <div className="stack">
      {/* Breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, opacity: 0.6 }}>
        <Link href="/crm/admin/tenants" style={{ color: "inherit" }}>← Tenants</Link>
      </div>

      <div>
        <h2 style={{ margin: 0 }}>{tenant.name}</h2>
        <p className="text-dim" style={{ marginTop: 4, fontSize: 13 }}>
          Slug: <code style={{ background: "rgba(255,255,255,.08)", padding: "1px 6px", borderRadius: 4 }}>{tenant.slug}</code>
        </p>
      </div>

      {/* Display Name */}
      <div>
        <label style={labelStyle}>Display Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={inputStyle}
        />
      </div>

      {/* ── Branding ─────────────────────────────────────────────────────── */}
      <div>
        <p style={{ fontSize: 12, fontWeight: 700, opacity: 0.5, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
          Branding
        </p>
        <div style={{ display: "grid", gap: 16 }}>

          {/* App Name */}
          <div>
            <label style={labelStyle}>App Name</label>
            <input
              value={branding.appName ?? ""}
              onChange={(e) => setBrandingField("appName", e.target.value)}
              placeholder="GroundGame"
              style={inputStyle}
            />
          </div>

          {/* Logo */}
          <div>
            <label style={labelStyle}>Logo</label>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {currentLogo && (
                <img
                  src={currentLogo}
                  alt="Logo preview"
                  style={{ width: 48, height: 48, objectFit: "contain", borderRadius: 8, background: "rgba(255,255,255,.06)", padding: 4 }}
                />
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  style={{
                    padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,.15)",
                    background: "rgba(255,255,255,.06)", color: "inherit", cursor: "pointer", fontSize: 13,
                  }}
                >
                  {currentLogo ? "Change Logo" : "Upload Logo"}
                </button>
                {branding.logoUrl && !logoPreview && (
                  <button
                    type="button"
                    onClick={() => { setBrandingField("logoUrl", ""); }}
                    style={{ fontSize: 11, opacity: 0.5, background: "none", border: "none", color: "inherit", cursor: "pointer", textAlign: "left", padding: 0 }}
                  >
                    Remove
                  </button>
                )}
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  style={{ display: "none" }}
                  onChange={handleLogoChange}
                />
              </div>
            </div>
            <p style={{ fontSize: 11, opacity: 0.4, marginTop: 6 }}>PNG, JPG, WebP, or SVG · Max 5MB</p>
          </div>

          {/* Colors */}
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <div>
              <label style={labelStyle}>Primary Color</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="color"
                  value={branding.primaryColor ?? "#2563EB"}
                  onChange={(e) => setBrandingField("primaryColor", e.target.value)}
                  style={{ width: 40, height: 32, borderRadius: 6, border: "1px solid rgba(255,255,255,.12)", background: "none", cursor: "pointer", padding: 2 }}
                />
                <input
                  value={branding.primaryColor ?? "#2563EB"}
                  onChange={(e) => setBrandingField("primaryColor", e.target.value)}
                  style={{ ...inputStyle, maxWidth: 110, fontFamily: "monospace" }}
                />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Accent Color</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="color"
                  value={branding.accentColor ?? "#3B82F6"}
                  onChange={(e) => setBrandingField("accentColor", e.target.value)}
                  style={{ width: 40, height: 32, borderRadius: 6, border: "1px solid rgba(255,255,255,.12)", background: "none", cursor: "pointer", padding: 2 }}
                />
                <input
                  value={branding.accentColor ?? "#3B82F6"}
                  onChange={(e) => setBrandingField("accentColor", e.target.value)}
                  style={{ ...inputStyle, maxWidth: 110, fontFamily: "monospace" }}
                />
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Plan presets */}
      <div>
        <p style={{ fontSize: 12, opacity: 0.6, marginBottom: 8 }}>Plan Preset</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(["basic", "pro", "custom"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => p !== "custom" && applyPlan(p)}
              style={{
                padding: "6px 16px", borderRadius: 8, border: "none", cursor: p === "custom" ? "default" : "pointer",
                fontWeight: 700, fontSize: 13, textTransform: "capitalize",
                background: currentPlan === p ? "var(--gg-primary, #2563eb)" : "rgba(255,255,255,.08)",
                color: "#fff", opacity: p === "custom" && currentPlan !== "custom" ? 0.4 : 1,
              }}
            >
              {p}
            </button>
          ))}
        </div>
        <p style={{ fontSize: 12, opacity: 0.5, marginTop: 6 }}>
          Basic: CRM + Lists + Doors + Dials · Pro: everything
        </p>
      </div>

      {/* Feature toggles by group */}
      {GROUPS.map((group) => {
        const groupKeys = ALL_FEATURE_KEYS.filter(
          (k) => FEATURE_META[k].group === group
        );
        return (
          <div key={group}>
            <p style={{ fontSize: 12, fontWeight: 700, opacity: 0.5, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
              {group}
            </p>
            <div style={{ display: "grid", gap: 10 }}>
              {groupKeys.map((key) => (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <ToggleSwitch
                    checked={features.includes(key)}
                    onChange={() => toggleFeature(key)}
                  />
                  <span style={{ fontSize: 14 }}>{FEATURE_META[key].label}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* ── Settings ─────────────────────────────────────────────────────── */}
      <div>
        <p style={{ fontSize: 12, fontWeight: 700, opacity: 0.5, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
          Settings
        </p>
        <div style={{ display: "grid", gap: 16 }}>

          {/* Timezone */}
          <div>
            <label style={labelStyle}>Timezone</label>
            <select
              value={(settings.timezone as string) ?? ""}
              onChange={(e) => setSettingsField("timezone", e.target.value)}
              style={{ ...inputStyle, maxWidth: 300 }}
            >
              <option value="">— Default (UTC) —</option>
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>

          {/* Default Import Mode */}
          <div>
            <label style={labelStyle}>Default Import Mode</label>
            <select
              value={(settings.defaultImportMode as string) ?? ""}
              onChange={(e) => setSettingsField("defaultImportMode", e.target.value)}
              style={{ ...inputStyle, maxWidth: 380 }}
            >
              <option value="">— Not set —</option>
              {IMPORT_MODES.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Support Email */}
          <div>
            <label style={labelStyle}>Support Email</label>
            <input
              type="email"
              value={(settings.supportEmail as string) ?? ""}
              onChange={(e) => setSettingsField("supportEmail", e.target.value)}
              placeholder="support@example.com"
              style={{ ...inputStyle, maxWidth: 300 }}
            />
          </div>

        </div>
      </div>

      {/* Save */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={save}
          disabled={saving}
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
