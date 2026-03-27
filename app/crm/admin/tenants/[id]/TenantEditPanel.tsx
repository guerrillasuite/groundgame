"use client";
import { useEffect, useState, useCallback } from "react";
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

type TenantData = {
  id: string;
  slug: string;
  name: string;
  plan: string;
  features: FeatureKey[];
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

export default function TenantEditPanel({ id }: { id: string }) {
  const [tenant, setTenant] = useState<TenantData | null>(null);
  const [name, setName] = useState("");
  const [features, setFeatures] = useState<FeatureKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

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
      setLoading(false);
    })();
  }, [id, getToken]);

  const currentPlan = planFromFeatures(features);

  function applyPlan(plan: Exclude<Plan, "custom">) {
    setFeatures([...PLAN_FEATURES[plan]]);
  }

  function toggleFeature(key: FeatureKey) {
    setFeatures((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  async function save() {
    const token = await getToken();
    if (!token) { setMsg({ type: "err", text: "Not authenticated" }); return; }
    setSaving(true);
    setMsg(null);
    const res = await fetch(`/api/crm/admin/tenants/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name, plan: currentPlan, features }),
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

      {/* Name */}
      <div>
        <label style={{ display: "block", fontSize: 12, opacity: 0.6, marginBottom: 4 }}>Display Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{
            width: "100%", maxWidth: 360, padding: "8px 12px", borderRadius: 8,
            border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.04)",
            color: "inherit", fontSize: 14, boxSizing: "border-box",
          }}
        />
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
