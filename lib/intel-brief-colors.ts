export const CATEGORY_PALETTE: Record<string, { hex: string; label: string }> = {
  blue:   { hex: "#3b82f6", label: "Blue" },
  red:    { hex: "#ef4444", label: "Red" },
  green:  { hex: "#22c55e", label: "Green" },
  purple: { hex: "#8b5cf6", label: "Purple" },
  orange: { hex: "#f97316", label: "Orange" },
  slate:  { hex: "#64748b", label: "Slate" },
  teal:   { hex: "#14b8a6", label: "Teal" },
  indigo: { hex: "#6366f1", label: "Indigo" },
  yellow: { hex: "#eab308", label: "Yellow" },
  gray:   { hex: "#9ca3af", label: "Gray" },
  cyan:   { hex: "#06b6d4", label: "Cyan" },
  pink:   { hex: "#ec4899", label: "Pink" },
};

export function colorHex(name: string): string {
  return CATEGORY_PALETTE[name]?.hex ?? "#9ca3af";
}
