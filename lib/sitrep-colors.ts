/**
 * Shared color families — used by SitRep, dispositions, settings, and any
 * feature that needs a user-facing color picker.
 *
 * Each family has 5 shades, dark → light:
 *   shades[0]  col 1 — darkest
 *   shades[1]  col 2 — dark     ← PALETTE dark half  (done / completed)
 *   shades[2]  col 3 — accent   (borders, icons, mid-tone)
 *   shades[3]  col 4 — light    ← PALETTE light half (active / incomplete)
 *   shades[4]  col 5 — lightest
 *
 * The canonical 24-color palette uses shades[3] (light) + shades[1] (dark).
 * Col 4 and col 2 give the best hue distinction across all 12 families —
 * col 5 lights are near-indistinguishable pastels; col 1 darks cluster into
 * navy / brown-red / mud-green triads.
 */

export type ColorFamily = {
  key: string;
  name: string;
  shades: readonly [string, string, string, string, string];
};

/** One of the 24 canonical app colors (12 families × light + dark). */
export type PaletteColor = {
  hex: string;
  name: string;        // e.g. "Blue Light"
  familyKey: string;   // e.g. "blue"
  role: "light" | "dark";
  pairHex: string;     // the complementary half
};

export const COLOR_FAMILIES: readonly ColorFamily[] = [
  { key: "blue",    name: "Blue",    shades: ["#1e3a8a","#1d4ed8","#3b82f6","#93c5fd","#dbeafe"] },
  { key: "indigo",  name: "Indigo",  shades: ["#312e81","#4338ca","#6366f1","#a5b4fc","#e0e7ff"] },
  { key: "violet",  name: "Violet",  shades: ["#4c1d95","#6d28d9","#7c3aed","#c4b5fd","#ede9fe"] },
  { key: "fuchsia", name: "Fuchsia", shades: ["#701a75","#86198f","#c026d3","#e879f9","#fae8ff"] },
  { key: "pink",    name: "Pink",    shades: ["#831843","#be185d","#ec4899","#f9a8d4","#fce7f3"] },
  { key: "red",     name: "Red",     shades: ["#7f1d1d","#b91c1c","#ef4444","#fca5a5","#fee2e2"] },
  { key: "orange",  name: "Orange",  shades: ["#7c2d12","#c2410c","#f97316","#fdba74","#ffedd5"] },
  { key: "amber",   name: "Amber",   shades: ["#78350f","#b45309","#f59e0b","#fcd34d","#fef3c7"] },
  { key: "lime",    name: "Lime",    shades: ["#365314","#4d7c0f","#84cc16","#d9f99d","#f7fee7"] },
  { key: "green",   name: "Green",   shades: ["#14532d","#15803d","#22c55e","#86efac","#dcfce7"] },
  { key: "teal",    name: "Teal",    shades: ["#134e4a","#0f766e","#14b8a6","#5eead4","#ccfbf1"] },
  { key: "sky",     name: "Sky",     shades: ["#0c4a6e","#0369a1","#0ea5e9","#7dd3fc","#e0f2fe"] },
] as const;

/**
 * The 24 canonical app colors: shades[3] (light) then shades[1] (dark)
 * for each family, in the same order as COLOR_FAMILIES.
 * Laid out as 12 lights followed by 12 darks so a 2-row UI (lights on top,
 * darks below) keeps each family's pair vertically aligned.
 */
export const COLOR_PALETTE: readonly PaletteColor[] = [
  ...COLOR_FAMILIES.map((f) => ({
    hex: f.shades[3],
    name: `${f.name} Light`,
    familyKey: f.key,
    role: "light" as const,
    pairHex: f.shades[1],
  })),
  ...COLOR_FAMILIES.map((f) => ({
    hex: f.shades[1],
    name: `${f.name} Dark`,
    familyKey: f.key,
    role: "dark" as const,
    pairHex: f.shades[3],
  })),
];

/** Default color family key for each built-in SitRep item type. */
export const SYSTEM_TYPE_FAMILIES: Record<string, string> = {
  task:    "blue",
  event:   "violet",
  meeting: "teal",
};

export function getFamilyByKey(key: string | null | undefined): ColorFamily | undefined {
  if (!key) return undefined;
  return COLOR_FAMILIES.find((f) => f.key === key) as ColorFamily | undefined;
}

/** Returns the family for a type slug, falling back to blue. */
export function getFamilyForType(
  typeSlug: string,
  overrideMap?: Record<string, string>,
): ColorFamily {
  const key = overrideMap?.[typeSlug] ?? SYSTEM_TYPE_FAMILIES[typeSlug] ?? "blue";
  return (getFamilyByKey(key) ?? getFamilyByKey("blue"))!;
}
