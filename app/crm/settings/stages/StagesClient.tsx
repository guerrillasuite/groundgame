"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { STAGE_PRESETS, StagePreset, StageDefinition } from "@/lib/opportunityPresets";

type Stage = { key: string; label: string; order_index: number };
type Tenant = { id: string; slug: string; name: string };
type Identity = { isSuperAdmin: boolean; tenantId: string | null };

function getActivePreset(stages: Stage[]): StagePreset | null {
  if (!stages.length) return null;
  const keys = stages.map((s) => s.key).sort().join(",");
  return (
    STAGE_PRESETS.find((p) => p.stages.map((s) => s.key).sort().join(",") === keys) ?? null
  );
}

function slugify(label: string, suffix: number): string {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "stage";
  return `${base}_${suffix}`;
}

// ── Styles ───────────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: "rgba(255,255,255,.04)",
  border: "1px solid rgba(255,255,255,.08)",
  borderRadius: 10,
  padding: "14px 16px",
  color: "rgb(238 242 246)",
};

const INPUT: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,.12)",
  background: "rgba(255,255,255,.05)",
  color: "var(--brand-text, #fff)",
  fontSize: 13,
  boxSizing: "border-box",
};

function btn(color: string, extra?: React.CSSProperties): React.CSSProperties {
  return {
    padding: "7px 14px",
    borderRadius: 8,
    border: "none",
    background: color,
    color: "#fff",
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
    ...extra,
  };
}

// ── Warning Modal ─────────────────────────────────────────────────────────────

function WarningModal({
  orphanedStages,
  affectedCount,
  newPresetStages,
  currentStages,
  fallbackMap,
  onFallbackMapChange,
  onConfirm,
  onCancel,
  saving,
}: {
  orphanedStages: string[];
  affectedCount: number;
  newPresetStages: StageDefinition[];
  currentStages: { key: string; label: string }[];
  fallbackMap: Record<string, string>;
  onFallbackMapChange: (oldKey: string, newKey: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.6)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 9999, padding: 16,
    }}>
      <div style={{ ...card, maxWidth: 500, width: "100%", border: "1px solid rgba(251,191,36,.25)" }}>
        <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: 15, color: "#fbbf24" }}>
          ⚠ {affectedCount} opportunit{affectedCount === 1 ? "y" : "ies"} will lose their stage
        </p>
        <p style={{ margin: "0 0 16px", fontSize: 13, opacity: 0.65 }}>
          These stages won't exist in the new template. Choose where each one's opportunities should go:
        </p>

        <div style={{ display: "grid", gap: 10, marginBottom: 20 }}>
          {orphanedStages.map((oldKey) => {
            const oldLabel = currentStages.find((s) => s.key === oldKey)?.label ?? oldKey;
            return (
              <div key={oldKey} style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 8 }}>
                <div style={{
                  padding: "6px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                  background: "rgba(251,191,36,.15)", color: "#fbbf24", textAlign: "center",
                }}>
                  {oldLabel}
                </div>
                <span style={{ fontSize: 12, opacity: 0.5 }}>→</span>
                <select
                  value={fallbackMap[oldKey] ?? newPresetStages[0]?.key ?? ""}
                  onChange={(e) => onFallbackMapChange(oldKey, e.target.value)}
                  style={{ ...INPUT }}
                >
                  {newPresetStages.map((s) => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onConfirm} disabled={saving} style={btn("var(--gg-primary, #2563eb)")}>
            {saving ? "Applying…" : "Apply Template"}
          </button>
          <button onClick={onCancel} disabled={saving} style={btn("rgba(255,255,255,.08)")}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function StagesClient() {
  const [token, setToken] = useState<string | null>(null);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Warning modal
  const [pendingPreset, setPendingPreset] = useState<StagePreset | null>(null);
  const [orphanInfo, setOrphanInfo] = useState<{ affectedCount: number; orphanedStages: string[] } | null>(null);
  const [fallbackMap, setFallbackMap] = useState<Record<string, string>>({});
  const [previewLoading, setPreviewLoading] = useState(false);
  const [applyingPresetId, setApplyingPresetId] = useState<string | null>(null);

  const fetchStages = useCallback(async (tok: string | null, tenantId: string | null) => {
    setLoading(true);
    const url = tenantId
      ? `/api/crm/opportunities/stages?tenantId=${tenantId}`
      : "/api/crm/opportunities/stages";
    const headers: Record<string, string> = {};
    if (tok && tenantId) headers["Authorization"] = `Bearer ${tok}`;
    try {
      const res = await fetch(url, { headers });
      if (res.ok) setStages(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const tok = session?.access_token ?? null;
      setToken(tok);

      if (tok) {
        fetch("/api/crm/admin/me", { headers: { Authorization: `Bearer ${tok}` } })
          .then((r) => (r.ok ? r.json() : null))
          .then((id: Identity | null) => {
            if (id?.isSuperAdmin) {
              setIdentity(id);
              const tid = id.tenantId;
              setSelectedTenantId(tid);
              fetch("/api/crm/admin/tenants", { headers: { Authorization: `Bearer ${tok}` } })
                .then((r) => (r.ok ? r.json() : []))
                .then(setTenants);
              fetchStages(tok, tid);
            } else {
              fetchStages(tok, null);
            }
          })
          .catch(() => fetchStages(null, null));
      } else {
        fetchStages(null, null);
      }
    });
  }, [fetchStages]);

  function handleTenantChange(tenantId: string) {
    setSelectedTenantId(tenantId);
    setStages([]);
    setError(null);
    fetchStages(token, tenantId);
  }

  async function handleTemplateClick(preset: StagePreset) {
    setPreviewLoading(true);
    setApplyingPresetId(preset.id);
    setError(null);
    try {
      const url = selectedTenantId
        ? `/api/crm/opportunities/stages/preview?tenantId=${selectedTenantId}`
        : "/api/crm/opportunities/stages/preview";
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token && selectedTenantId) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ newStageKeys: preset.stages.map((s) => s.key) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Preview failed");
      }

      const info = await res.json();
      if (info.affectedCount > 0) {
        // Initialize each orphaned stage to map to the first stage of the new preset
        const initialMap: Record<string, string> = {};
        for (const oldKey of info.orphanedStages as string[]) {
          initialMap[oldKey] = preset.stages[0].key;
        }
        setPendingPreset(preset);
        setOrphanInfo(info);
        setFallbackMap(initialMap);
        setApplyingPresetId(null);
      } else {
        await applyPreset(preset, null);
      }
    } catch (e: any) {
      setError(e.message ?? "Failed to check existing opportunities. Please try again.");
      setApplyingPresetId(null);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function applyPreset(preset: StagePreset, map: Record<string, string> | null) {
    setSaving(true);
    setApplyingPresetId(preset.id);
    setError(null);
    try {
      await putStages(preset.stages, map ?? undefined);
      setStages(preset.stages.map((s, i) => ({ ...s, order_index: i })));
      showSuccess(`Applied "${preset.name}" template`);
    } catch (e: any) {
      setError(e.message ?? "Failed to apply template");
    } finally {
      setSaving(false);
      setApplyingPresetId(null);
      setPendingPreset(null);
      setOrphanInfo(null);
    }
  }

  async function putStages(stagesToSave: StageDefinition[], map?: Record<string, string>) {
    const url = selectedTenantId
      ? `/api/crm/opportunities/stages?tenantId=${selectedTenantId}`
      : "/api/crm/opportunities/stages";
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token && selectedTenantId) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(url, {
      method: "PUT",
      headers,
      body: JSON.stringify({ stages: stagesToSave, fallbackMap: map }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "Failed to save stages");
    }
    return res.json();
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await putStages(stages);
      showSuccess("Stages saved");
    } catch (e: any) {
      setError(e.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function showSuccess(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  }

  function handleReorder(idx: number, dir: -1 | 1) {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= stages.length) return;
    const next = [...stages];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    setStages(next.map((s, i) => ({ ...s, order_index: i })));
  }

  function handleLabelChange(idx: number, label: string) {
    setStages((prev) => prev.map((s, i) => (i === idx ? { ...s, label } : s)));
  }

  function handleDelete(idx: number) {
    if (stages.length <= 1) return;
    setStages((prev) =>
      prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order_index: i }))
    );
  }

  function handleAddStage() {
    const label = "New Stage";
    const key = slugify(label, stages.length);
    setStages((prev) => [...prev, { key, label, order_index: prev.length }]);
  }

  const activePreset = getActivePreset(stages);
  const tenantName = tenants.find((t) => t.id === selectedTenantId)?.name;

  return (
    <section style={{ padding: 16, maxWidth: 760, margin: "0 auto", color: "rgb(238 242 246)" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Pipeline Stages</h1>
      <p style={{ margin: "0 0 20px", fontSize: 13, opacity: 0.7 }}>
        Choose a preset template or customize your stages below.
      </p>

      {/* Super-admin tenant selector */}
      {identity?.isSuperAdmin && (
        <div style={{ ...card, marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
          <label style={{ fontSize: 12, opacity: 0.6, whiteSpace: "nowrap" }}>Managing tenant:</label>
          <select
            value={selectedTenantId ?? ""}
            onChange={(e) => handleTenantChange(e.target.value)}
            style={{ ...INPUT, width: "auto", flex: 1 }}
          >
            <option value="" disabled>Select a tenant…</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>{t.name} ({t.slug})</option>
            ))}
          </select>
          {tenantName && (
            <span style={{ fontSize: 12, opacity: 0.4, whiteSpace: "nowrap" }}>
              {selectedTenantId?.slice(0, 8)}…
            </span>
          )}
        </div>
      )}

      {/* Template picker */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Preset Templates
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
          {STAGE_PRESETS.map((preset) => {
            const isActive = activePreset?.id === preset.id;
            const isApplying = applyingPresetId === preset.id;
            const isDisabled = previewLoading || saving;
            return (
              <button
                key={preset.id}
                onClick={() => handleTemplateClick(preset)}
                disabled={isDisabled}
                style={{
                  ...card,
                  textAlign: "left",
                  cursor: isDisabled ? "default" : "pointer",
                  border: isActive
                    ? "1px solid var(--gg-primary, #2563eb)"
                    : "1px solid rgba(255,255,255,.12)",
                  background: isActive
                    ? "rgba(37,99,235,.15)"
                    : isApplying
                    ? "rgba(255,255,255,.08)"
                    : "rgba(255,255,255,.04)",
                  padding: "12px 14px",
                  transition: "border-color 0.15s, background 0.15s",
                  opacity: isDisabled && !isApplying ? 0.6 : 1,
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                  {isApplying ? (
                    <span style={{ color: "rgba(255,255,255,.5)", fontSize: 11 }}>Applying…</span>
                  ) : isActive ? (
                    <span style={{ color: "var(--gg-primary, #2563eb)" }}>✓</span>
                  ) : null}
                  {preset.name}
                </div>
                <div style={{ fontSize: 11, opacity: 0.65, lineHeight: 1.5 }}>{preset.description}</div>
                <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {preset.stages.map((s) => (
                    <span key={s.key} style={{
                      fontSize: 11, padding: "2px 7px", borderRadius: 4,
                      background: "rgba(255,255,255,.12)",
                    }}>{s.label}</span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Stage list editor */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Current Stages
        </h2>

        {loading ? (
          <p style={{ opacity: 0.4, fontSize: 13 }}>Loading…</p>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {stages.map((stage, idx) => (
              <div key={stage.key} style={{
                ...card, padding: "10px 12px",
                display: "flex", alignItems: "center", gap: 8,
              }}>
                {/* Reorder buttons */}
                <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
                  <button
                    onClick={() => handleReorder(idx, -1)}
                    disabled={idx === 0}
                    style={{ background: "none", border: "none", cursor: idx === 0 ? "default" : "pointer", opacity: idx === 0 ? 0.2 : 0.6, fontSize: 11, padding: "1px 4px", color: "#fff", lineHeight: 1 }}
                    aria-label="Move up"
                  >▲</button>
                  <button
                    onClick={() => handleReorder(idx, 1)}
                    disabled={idx === stages.length - 1}
                    style={{ background: "none", border: "none", cursor: idx === stages.length - 1 ? "default" : "pointer", opacity: idx === stages.length - 1 ? 0.2 : 0.6, fontSize: 11, padding: "1px 4px", color: "#fff", lineHeight: 1 }}
                    aria-label="Move down"
                  >▼</button>
                </div>

                {/* Label input */}
                <input
                  type="text"
                  value={stage.label}
                  onChange={(e) => handleLabelChange(idx, e.target.value)}
                  style={{ ...INPUT, flex: 1 }}
                />

                {/* Key badge */}
                <span style={{ fontSize: 10, opacity: 0.3, fontFamily: "monospace", flexShrink: 0, userSelect: "none" }}>
                  {stage.key}
                </span>

                {/* Delete */}
                <button
                  onClick={() => handleDelete(idx)}
                  disabled={stages.length <= 1}
                  style={{
                    background: "none", border: "none", cursor: stages.length <= 1 ? "default" : "pointer",
                    opacity: stages.length <= 1 ? 0.2 : 0.5, color: "#f87171", fontSize: 16, padding: "0 4px",
                    flexShrink: 0,
                  }}
                  aria-label="Delete stage"
                >×</button>
              </div>
            ))}

            <button
              onClick={handleAddStage}
              style={{ ...card, padding: "10px 14px", cursor: "pointer", border: "1px dashed rgba(255,255,255,.15)", background: "transparent", color: "rgba(255,255,255,.5)", fontSize: 13, textAlign: "left" }}
            >
              + Add Stage
            </button>
          </div>
        )}
      </div>

      {/* Feedback */}
      {error && <p style={{ color: "#f87171", fontSize: 13, marginBottom: 12 }}>{error}</p>}
      {successMsg && <p style={{ color: "#86efac", fontSize: 13, marginBottom: 12 }}>{successMsg}</p>}

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving || loading}
        style={btn("var(--gg-primary, #2563eb)", { opacity: saving || loading ? 0.6 : 1 })}
      >
        {saving ? "Saving…" : "Save Stages"}
      </button>

      {/* Warning modal */}
      {pendingPreset && orphanInfo && (
        <WarningModal
          orphanedStages={orphanInfo.orphanedStages}
          affectedCount={orphanInfo.affectedCount}
          newPresetStages={pendingPreset.stages}
          currentStages={stages}
          fallbackMap={fallbackMap}
          onFallbackMapChange={(oldKey, newKey) =>
            setFallbackMap((prev) => ({ ...prev, [oldKey]: newKey }))
          }
          onConfirm={() => applyPreset(pendingPreset, fallbackMap)}
          onCancel={() => { setPendingPreset(null); setOrphanInfo(null); }}
          saving={saving}
        />
      )}
    </section>
  );
}
