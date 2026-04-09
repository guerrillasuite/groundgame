"use client";

import { useEffect, useState } from "react";
import type { FeatureKey } from "@/lib/features";

const STOREFRONT_FEATURES: { key: FeatureKey; label: string; description: string }[] = [
  {
    key: "pwa_storefront_take_order",
    label: "Take Order",
    description: "Shows the Take Order tile on the Storefront home screen.",
  },
  {
    key: "pwa_storefront_make_sale",
    label: "Make Sale",
    description: "Shows the Make Sale tile on the Storefront home screen.",
  },
  {
    key: "pwa_storefront_orders",
    label: "View Orders",
    description: "Shows the View Orders tile — lets canvassers see and manage the order pipeline.",
  },
  {
    key: "pwa_storefront_inventory",
    label: "View Inventory",
    description: "Shows the View Inventory tile — product catalog, stock counts, and product profiles.",
  },
  {
    key: "pwa_storefront_survey",
    label: "Take Survey",
    description: "Shows the Take Survey tile on the Storefront home screen.",
  },
];

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        position: "relative",
        display: "inline-flex",
        width: 44,
        height: 24,
        borderRadius: 12,
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "background 0.2s",
        background: checked ? "var(--gg-primary, #2563eb)" : "rgba(0,0,0,0.15)",
        flexShrink: 0,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 4,
          left: checked ? 24 : 4,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#fff",
          transition: "left 0.2s",
        }}
      />
    </button>
  );
}

export default function StorefrontSettingsPage() {
  const [features, setFeatures] = useState<FeatureKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/crm/features")
      .then((r) => r.json())
      .then((d) => {
        setFeatures(d.features ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function toggle(key: FeatureKey) {
    const next = features.includes(key)
      ? features.filter((f) => f !== key)
      : [...features, key];
    setFeatures(next);
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    const storefrontKeys = STOREFRONT_FEATURES.map((f) => f.key);
    const enabled = features.filter((f) => storefrontKeys.includes(f));
    const res = await fetch("/api/crm/features", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ features: enabled }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg({ type: "err", text: data.error ?? "Save failed" });
    } else {
      setFeatures(data.features ?? features);
      setMsg({ type: "ok", text: "Saved." });
      setTimeout(() => setMsg(null), 2500);
    }
    setSaving(false);
  }

  return (
    <div className="stack">
      <h2 style={{ margin: 0 }}>Storefront Tab Settings</h2>
      <div>
        <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700 }}>Storefront Tabs</h3>
        <p className="muted" style={{ margin: "0 0 16px", fontSize: 13 }}>
          Control which tiles appear on the Storefront home screen. The Storefront itself must also
          be enabled (under PWA settings in the admin panel).
        </p>

        {loading ? (
          <p className="muted">Loading…</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {STOREFRONT_FEATURES.map((f) => (
              <div
                key={f.key}
                className="list-item"
                style={{ display: "flex", alignItems: "center", gap: 14 }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{f.label}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                    {f.description}
                  </div>
                </div>
                <Toggle
                  checked={features.includes(f.key)}
                  onChange={() => toggle(f.key)}
                  disabled={saving}
                />
              </div>
            ))}
          </div>
        )}

        {!loading && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 20 }}>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              style={{
                padding: "9px 24px",
                borderRadius: 8,
                border: "none",
                fontWeight: 700,
                fontSize: 14,
                cursor: saving ? "not-allowed" : "pointer",
                background: "var(--gg-primary, #2563eb)",
                color: "#fff",
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {msg && (
              <span
                style={{
                  fontSize: 13,
                  color: msg.type === "ok" ? "#16a34a" : "#dc2626",
                  fontWeight: 600,
                }}
              >
                {msg.text}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
