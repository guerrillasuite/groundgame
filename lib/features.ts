// lib/features.ts
// Canonical source of truth for all per-tenant feature keys, plan presets, and helpers.

export const ALL_FEATURE_KEYS = [
  "crm",               // base CRM: people, households, locations, settings
  "crm_companies",     // companies module
  "crm_opportunities", // pipeline / kanban
  "crm_lists",         // dial & walk lists
  "crm_surveys",       // surveys & questionnaires
  "crm_stops",         // stops / activity feed
  "crm_import",        // CSV bulk import
  "crm_dedupe",        // duplicate detection & merge
  "crm_cleanup",       // data cleanup tools
  "crm_enrichment",    // GS community enrichment data (meta_json)
  "pwa_doors",         // door canvassing app
  "pwa_dials",         // phone banking app
  "pwa_texts",         // text banking app
  "pwa_storefront",    // storefront / ordering
] as const;

export type FeatureKey = (typeof ALL_FEATURE_KEYS)[number];

export type Plan = "basic" | "pro" | "custom";

export const PLAN_FEATURES: Record<Exclude<Plan, "custom">, readonly FeatureKey[]> = {
  basic: ["crm", "crm_lists", "pwa_doors", "pwa_dials", "pwa_texts"],
  pro: ALL_FEATURE_KEYS,
};

export const FEATURE_META: Record<FeatureKey, { label: string; group: string }> = {
  crm:               { label: "Base CRM (People, Households, Locations)", group: "CRM Core" },
  crm_companies:     { label: "Companies",                                group: "CRM Core" },
  crm_opportunities: { label: "Opportunities / Pipeline",                 group: "CRM Core" },
  crm_lists:         { label: "Lists (Dial & Walklists)",                 group: "CRM Field" },
  crm_surveys:       { label: "Surveys",                                  group: "CRM Field" },
  crm_stops:         { label: "Stops / Activity Feed",                    group: "CRM Field" },
  crm_import:        { label: "Import (CSV Bulk Upload)",                 group: "CRM Data" },
  crm_dedupe:        { label: "Dedupe",                                   group: "CRM Data" },
  crm_cleanup:       { label: "Cleanup Tools",                            group: "CRM Data" },
  crm_enrichment:    { label: "Community Enrichment (GS Data)",          group: "CRM Data" },
  pwa_doors:         { label: "Doors (Door Canvassing)",                  group: "PWA" },
  pwa_dials:         { label: "Dials (Phone Banking)",                    group: "PWA" },
  pwa_texts:         { label: "Texts (Text Banking)",                     group: "PWA" },
  pwa_storefront:    { label: "Storefront / Ordering",                    group: "PWA" },
};

export function hasFeature(features: readonly FeatureKey[], key: FeatureKey): boolean {
  return features.includes(key);
}

export function planFromFeatures(features: readonly FeatureKey[]): Plan {
  if (ALL_FEATURE_KEYS.every((k) => features.includes(k))) return "pro";
  const basicKeys = PLAN_FEATURES.basic;
  if (
    features.length === basicKeys.length &&
    basicKeys.every((k) => features.includes(k))
  )
    return "basic";
  return "custom";
}
