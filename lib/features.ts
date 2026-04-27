// lib/features.ts
// Canonical source of truth for all per-tenant feature keys, plan presets, and helpers.

export const ALL_FEATURE_KEYS = [
  "crm",               // base CRM: people, households, locations, settings
  "crm_companies",     // companies module
  "crm_opportunities", // pipeline / kanban
  "crm_lists",         // dial & walk lists
  "crm_surveys",          // surveys & questionnaires
  "crm_survey_branding",  // tenant-branded embedded/hosted forms (FieldPack+)
  "crm_stops",         // stops / activity feed
  "crm_import",        // CSV bulk import
  "crm_dedupe",        // duplicate detection & merge
  "crm_cleanup",       // data cleanup tools
  "crm_enrichment",    // GS community enrichment data (meta_json)
  "pwa_doors",         // door canvassing app
  "pwa_dials",         // phone banking app
  "pwa_texts",         // text banking app
  "pwa_storefront",              // storefront / ordering
  "pwa_storefront_take_order",  // Take Order tab
  "pwa_storefront_make_sale",   // Make Sale tab
  "pwa_storefront_orders",      // View Orders tab
  "pwa_storefront_inventory",   // View Inventory tab
  "pwa_storefront_survey",      // Take Survey tab
  "crm_dispatch",               // Dispatch bulk email
  "sitrep_core",                // SitRep: tasks, widget, basic list view
  "sitrep_calendar",            // SitRep: calendar view (week/month)
  "sitrep_team",                // SitRep: assignable tasks, meetings, team calendar
  "sitrep_missions",            // SitRep: Missions container and detail page
  "news",                       // Intel Brief: news aggregation + relevance scoring
] as const;

export type FeatureKey = (typeof ALL_FEATURE_KEYS)[number];

export type Plan = "scout_kit" | "field_pack" | "war_chest" | "enterprise" | "custom";

export const PLAN_LABELS: Record<Exclude<Plan, "custom">, string> = {
  scout_kit:  "Scout Kit",
  field_pack: "Field Pack",
  war_chest:  "War Chest",
  enterprise: "Enterprise",
};

export const PLAN_FEATURES: Record<Exclude<Plan, "custom">, readonly FeatureKey[]> = {
  // Entry level — core field ops
  scout_kit: [
    "crm", "crm_lists",
    "pwa_doors", "pwa_dials", "pwa_texts",
    "sitrep_core", "sitrep_calendar", "sitrep_team", "sitrep_missions",
  ],
  // Mid tier — adds pipeline, surveys, storefront
  field_pack: [
    "crm", "crm_opportunities", "crm_lists", "crm_surveys", "crm_stops",
    "pwa_doors", "pwa_dials", "pwa_texts",
    "pwa_storefront", "pwa_storefront_take_order", "pwa_storefront_make_sale",
    "pwa_storefront_orders", "pwa_storefront_inventory", "pwa_storefront_survey",
    "sitrep_core", "sitrep_calendar", "sitrep_team", "sitrep_missions",
  ],
  // Full suite — adds companies, data tools, branding, dispatch
  war_chest: [
    "crm", "crm_companies", "crm_opportunities", "crm_lists",
    "crm_surveys", "crm_survey_branding", "crm_stops",
    "crm_import", "crm_dedupe", "crm_cleanup", "crm_dispatch",
    "pwa_doors", "pwa_dials", "pwa_texts",
    "pwa_storefront", "pwa_storefront_take_order", "pwa_storefront_make_sale",
    "pwa_storefront_orders", "pwa_storefront_inventory", "pwa_storefront_survey",
    "sitrep_core", "sitrep_calendar", "sitrep_team", "sitrep_missions",
    "news",
  ],
  // Everything including enrichment
  enterprise: ALL_FEATURE_KEYS,
};

export const FEATURE_META: Record<FeatureKey, { label: string; group: string }> = {
  crm:               { label: "Base CRM (People, Households, Locations)", group: "CRM Core" },
  crm_companies:     { label: "Companies",                                group: "CRM Core" },
  crm_opportunities: { label: "Opportunities / Pipeline",                 group: "CRM Core" },
  crm_lists:         { label: "Lists (Dial & Walklists)",                 group: "CRM Field" },
  crm_surveys:          { label: "Surveys",                               group: "CRM Field" },
  crm_survey_branding:  { label: "Survey Branding (Field Pack+)",         group: "CRM Field" },
  crm_stops:         { label: "Stops / Activity Feed",                    group: "CRM Field" },
  crm_import:        { label: "Import (CSV Bulk Upload)",                 group: "CRM Data" },
  crm_dedupe:        { label: "Dedupe",                                   group: "CRM Data" },
  crm_cleanup:       { label: "Cleanup Tools",                            group: "CRM Data" },
  crm_enrichment:    { label: "Community Enrichment (GS Data)",           group: "CRM Data" },
  pwa_doors:         { label: "Doors (Door Canvassing)",                  group: "App Settings" },
  pwa_dials:         { label: "Dials (Phone Banking)",                    group: "App Settings" },
  pwa_texts:         { label: "Texts (Text Banking)",                     group: "App Settings" },
  pwa_storefront:              { label: "Storefront / Ordering",          group: "App Settings" },
  pwa_storefront_take_order:  { label: "Storefront — Take Order tab",     group: "App Settings" },
  pwa_storefront_make_sale:   { label: "Storefront — Make Sale tab",      group: "App Settings" },
  pwa_storefront_orders:      { label: "Storefront — View Orders tab",    group: "App Settings" },
  pwa_storefront_inventory:   { label: "Storefront — Inventory tab",      group: "App Settings" },
  pwa_storefront_survey:      { label: "Storefront — Take Survey tab",    group: "App Settings" },
  crm_dispatch:               { label: "Dispatch (Bulk Email)",            group: "CRM Data" },
  sitrep_core:                { label: "SitRep (Tasks & Widget)",          group: "SitRep" },
  sitrep_calendar:            { label: "SitRep Calendar View",             group: "SitRep" },
  sitrep_team:                { label: "SitRep Team Features",             group: "SitRep" },
  sitrep_missions:            { label: "SitRep Missions",                  group: "SitRep" },
  news:                       { label: "Intel Brief",                       group: "CRM Core" },
};

export function hasFeature(features: readonly FeatureKey[], key: FeatureKey): boolean {
  return features.includes(key);
}

export function planFromFeatures(features: readonly FeatureKey[]): Plan {
  if (ALL_FEATURE_KEYS.every((k) => features.includes(k))) return "enterprise";

  const check = (planKeys: readonly FeatureKey[]) =>
    features.length === planKeys.length && planKeys.every((k) => features.includes(k));

  if (check(PLAN_FEATURES.war_chest))  return "war_chest";
  if (check(PLAN_FEATURES.field_pack)) return "field_pack";
  if (check(PLAN_FEATURES.scout_kit))  return "scout_kit";
  return "custom";
}
