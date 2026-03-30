// lib/dispositionConfig.ts
// Shared disposition config types, defaults, and helpers.
// Safe to import in both server and client components.

export type DispoItem = {
  key: string;
  label: string;
  color: string;  // 6-digit hex, e.g. "#22c55e"
  enabled: boolean;
};

export type DispositionConfig = {
  doors: DispoItem[];
  calls: DispoItem[];
};

export const UNCONTACTED_COLOR = "#9CA3AF";

export const DEFAULT_DISPO_CONFIG: DispositionConfig = {
  doors: [
    { key: "not_home",       label: "Not Home",      color: "#9CA3AF", enabled: true },
    { key: "contact_made",   label: "Contacted",     color: "#22c55e", enabled: true },
    { key: "refused",        label: "Refused",       color: "#DC2626", enabled: true },
    { key: "wrong_address",  label: "Wrong Address", color: "#F97316", enabled: true },
    { key: "follow_up",      label: "Follow Up",     color: "#F59E0B", enabled: true },
  ],
  calls: [
    { key: "connected",      label: "Connected",      color: "#22c55e", enabled: true },
    { key: "no_answer",      label: "No Answer",      color: "#3B82F6", enabled: true },
    { key: "left_voicemail", label: "Left Voicemail", color: "#3B82F6", enabled: true },
    { key: "bad_number",     label: "Bad Number",     color: "#F97316", enabled: true },
    { key: "wrong_person",   label: "Wrong Person",   color: "#F97316", enabled: true },
    { key: "call_back",      label: "Call Back",      color: "#3B82F6", enabled: true },
    { key: "do_not_call",    label: "Do Not Call",    color: "#DC2626", enabled: true },
    { key: "not_interested", label: "Not Interested", color: "#DC2626", enabled: true },
    { key: "moved",          label: "Moved",          color: "#F97316", enabled: true },
    { key: "other",          label: "Other",          color: "#6B7280", enabled: true },
  ],
};

/**
 * Merge saved settings.dispositionConfig over the defaults.
 * Any missing keys fall back to the default values.
 */
export function resolveDispoConfig(
  settings: Record<string, unknown>
): DispositionConfig {
  const saved = settings?.dispositionConfig as Partial<DispositionConfig> | undefined;
  if (!saved) return DEFAULT_DISPO_CONFIG;

  function mergeChannel(defaults: DispoItem[], saved: DispoItem[] | undefined): DispoItem[] {
    if (!Array.isArray(saved) || saved.length === 0) return defaults;
    const savedMap = new Map(saved.map((d) => [d.key, d]));
    return defaults.map((def) => {
      const s = savedMap.get(def.key);
      if (!s) return def;
      return {
        key:     def.key,
        label:   s.label   ?? def.label,
        color:   s.color   ?? def.color,
        enabled: s.enabled ?? def.enabled,
      };
    });
  }

  return {
    doors: mergeChannel(DEFAULT_DISPO_CONFIG.doors, saved.doors),
    calls: mergeChannel(DEFAULT_DISPO_CONFIG.calls, saved.calls),
  };
}

/**
 * Build a flat { [key]: color } map from a DispositionConfig.
 * Includes both doors and calls (keys don't overlap).
 */
export function buildColorMap(config: DispositionConfig): Record<string, string> {
  const map: Record<string, string> = {};
  for (const item of [...config.doors, ...config.calls]) {
    map[item.key] = item.color;
  }
  return map;
}
