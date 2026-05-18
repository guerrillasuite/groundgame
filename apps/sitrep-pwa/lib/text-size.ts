export type TextSize = "normal" | "large" | "xl";

const KEY = "sitrep_text_size";

export function loadTextSize(): TextSize {
  if (typeof localStorage === "undefined") return "normal";
  return (localStorage.getItem(KEY) as TextSize) ?? "normal";
}

export function saveTextSize(size: TextSize) {
  localStorage.setItem(KEY, size);
  applyTextSize(size);
}

export function applyTextSize(size: TextSize) {
  if (size === "normal") {
    delete document.documentElement.dataset.textSize;
  } else {
    document.documentElement.dataset.textSize = size;
  }
}
