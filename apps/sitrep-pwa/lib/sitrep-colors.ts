export type ColorFamily = {
  key: string;
  name: string;
  shades: readonly [string, string, string, string, string];
};

export type PaletteColor = {
  hex: string;
  name: string;
  familyKey: string;
  role: "light" | "dark";
  pairHex: string;
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

export const SYSTEM_TYPE_FAMILIES: Record<string, string> = {
  task:    "blue",
  event:   "violet",
  meeting: "teal",
};

export function getFamilyByKey(key: string | null | undefined): ColorFamily | undefined {
  if (!key) return undefined;
  return COLOR_FAMILIES.find((f) => f.key === key) as ColorFamily | undefined;
}

export function getFamilyForType(
  typeSlug: string,
  overrideMap?: Record<string, string>,
): ColorFamily {
  const key = overrideMap?.[typeSlug] ?? SYSTEM_TYPE_FAMILIES[typeSlug] ?? "blue";
  return (getFamilyByKey(key) ?? getFamilyByKey("blue"))!;
}
