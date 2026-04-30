# GroundGame Visual Guide
## Complete Design System Reference — SitRep-era Dark UI

This document captures every visual pattern, token value, helper function, and CSS class used in the SitRep modernization. It is the authoritative reference when building new features. Copy-paste these snippets directly; do not deviate from the values here.

---

## 1. Surface Token Object

Define this at the top of every client component that renders dark UI. Copy verbatim:

```ts
const S = {
  bg:        "rgb(10 13 20)",          // page/body background
  surface:   "rgb(14 18 28)",          // slightly elevated (sidebar, tray, form bg)
  card:      "rgb(20 25 38)",          // primary card surface
  border:    "rgba(255,255,255,.07)",  // card borders (use .08 for input borders)
  text:      "rgb(236 240 245)",       // primary text
  dim:       "rgb(100 116 139)",       // muted labels, section headers, placeholders
  dimBright: "rgb(148 163 184)",       // secondary labels, meta text, back-link text
} as const;
```

**In settings panels** (SitRepSettingsPanel.tsx uses this legacy variant — keep for settings pages only):
```ts
const S = {
  surface: "rgb(18 23 33)",
  card:    "rgb(28 36 48)",
  border:  "rgb(43 53 67)",
  text:    "rgb(238 242 246)",
  dim:     "rgb(160 174 192)",
} as const;
```

---

## 2. Primary Color — `--gg-primary` + `color-mix()`

The tenant's brand color is set as a CSS custom property. Always use `color-mix()` for opacity variants — never hardcode `rgba(37,99,235,…)`.

**Always include the fallback `#2563eb`:**
```
var(--gg-primary, #2563eb)
```

### Opacity Reference Table

| Use | Expression |
|---|---|
| Active bg (filter pill, selected card) | `color-mix(in srgb, var(--gg-primary, #2563eb) 18%, transparent)` |
| Active border | `color-mix(in srgb, var(--gg-primary, #2563eb) 50%, transparent)` |
| Active text | `color-mix(in srgb, var(--gg-primary, #2563eb) 90%, #fff)` |
| Subtle glow / box-shadow halo | `color-mix(in srgb, var(--gg-primary, #2563eb) 22%, transparent)` |
| Focus ring (box-shadow) | `0 0 0 3px color-mix(in srgb, var(--gg-primary, #2563eb) 14%, transparent)` |
| Focus border-color | `color-mix(in srgb, var(--gg-primary, #2563eb) 55%, transparent)` |
| Button glow (box-shadow) | `0 2px 14px color-mix(in srgb, var(--gg-primary, #2563eb) 42%, transparent)` |
| Left accent bar (expanded section) | `inset 3px 0 0 0 var(--gg-primary, #2563eb)` (in `boxShadow`) |
| iOS toggle track (on) glow | `0 0 8px color-mix(in srgb, var(--gg-primary, #2563eb) 45%, transparent)` |

---

## 3. Reusable Component: `FilterPill`

**Lives in:** `app/crm/sitrep/SitRepPanel.tsx` and `app/crm/sitrep/calendar/SitRepCalendar.tsx` (identical copy in both — not yet extracted to a shared component file).

**When to use:** Any filter bar, view switcher, or segmented control.

```tsx
function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "5px 13px",
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
        transition: "transform .12s ease, box-shadow .12s ease, filter .12s ease",
        border: active
          ? "1px solid color-mix(in srgb, var(--gg-primary, #2563eb) 50%, transparent)"
          : "1px solid rgba(255,255,255,.07)",
        background: active
          ? "color-mix(in srgb, var(--gg-primary, #2563eb) 18%, transparent)"
          : "rgba(255,255,255,.03)",
        color: active
          ? "color-mix(in srgb, var(--gg-primary, #2563eb) 90%, #fff)"
          : "rgb(100 116 139)",
        boxShadow: active
          ? "0 0 12px color-mix(in srgb, var(--gg-primary, #2563eb) 22%, transparent)"
          : "0 1px 4px rgba(0,0,0,.18)",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.transform = "translateY(-1.5px)";
          e.currentTarget.style.filter = "brightness(1.3)";
          e.currentTarget.style.boxShadow = "0 3px 10px rgba(0,0,0,.25)";
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "";
        e.currentTarget.style.filter = "";
        e.currentTarget.style.boxShadow = active
          ? "0 0 12px color-mix(in srgb, var(--gg-primary, #2563eb) 22%, transparent)"
          : "0 1px 4px rgba(0,0,0,.18)";
      }}
    >
      {children}
    </button>
  );
}
```

**Usage:**
```tsx
<div style={{ display: "flex", gap: 4 }}>
  <FilterPill active={scope === "mine"} onClick={() => setScope("mine")}>Mine</FilterPill>
  <FilterPill active={scope === "all"}  onClick={() => setScope("all")}>All</FilterPill>
</div>
{/* Divider between pill groups */}
<div style={{ width: 1, height: 18, background: "rgba(255,255,255,.1)", margin: "0 2px" }} />
```

---

## 4. Input / Select / Textarea System

### `inputStyle` — copy exactly into any component

```ts
const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 9,
  background: "rgba(255,255,255,.05)",
  backdropFilter: "blur(8px)",
  border: "1px solid rgba(255,255,255,.1)",
  color: S.text,
  fontSize: 13,
  outline: "none",
  transition: "border-color .15s, box-shadow .15s",
};
```

Alias used in `SitRepItemClient.tsx` as `fieldStyle` (identical concept, slightly different padding):
```ts
const fieldStyle: React.CSSProperties = {
  background: "rgba(255,255,255,.05)",
  border: `1px solid ${S.border}`,
  borderRadius: 8,
  padding: "6px 10px",
  color: S.text,
  fontSize: 13,
  outline: "none",
  transition: "border-color .15s, box-shadow .15s",
};
```

### Focus / Blur Handlers

```ts
// For `SitRepPanel.tsx` pattern (inputStyle)
const focusInput = (
  e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
) => {
  e.currentTarget.style.borderColor =
    "color-mix(in srgb, var(--gg-primary, #2563eb) 55%, transparent)";
  e.currentTarget.style.boxShadow =
    "0 0 0 3px color-mix(in srgb, var(--gg-primary, #2563eb) 16%, transparent)";
};
const blurInput = (
  e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
) => {
  e.currentTarget.style.borderColor = "rgba(255,255,255,.1)";
  e.currentTarget.style.boxShadow = "none";
};

// For `SitRepItemClient.tsx` pattern (fieldStyle uses S.border)
const focusField = (
  e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
) => {
  e.currentTarget.style.borderColor =
    "color-mix(in srgb, var(--gg-primary, #2563eb) 55%, transparent)";
  e.currentTarget.style.boxShadow =
    "0 0 0 3px color-mix(in srgb, var(--gg-primary, #2563eb) 14%, transparent)";
};
const blurField = (
  e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
) => {
  e.currentTarget.style.borderColor = S.border;
  e.currentTarget.style.boxShadow = "none";
};
```

**Apply to every input, select, and textarea:**
```tsx
<input
  type="text"
  style={inputStyle}
  onFocus={focusInput}
  onBlur={blurInput}
/>
<select style={inputStyle} onFocus={focusInput} onBlur={blurInput}>...</select>
<textarea
  rows={4}
  style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }}
  onFocus={focusInput}
  onBlur={blurInput}
/>
```

### Form Field Label Style (consistent across all forms)

```tsx
<label style={{
  fontSize: 11,
  fontWeight: 700,
  display: "block",
  marginBottom: 6,
  color: S.dim,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
}}>
  Field Label
</label>
```

---

## 5. iOS-Style Toggle (replaces all checkboxes)

Never use `<input type="checkbox">`. Always use this pattern.

```tsx
// Minimal: just the toggle track + circle
function Toggle({
  on,
  onToggle,
}: {
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      onClick={onToggle}
      style={{
        width: 38,
        height: 21,
        borderRadius: 11,
        cursor: "pointer",
        position: "relative",
        flexShrink: 0,
        background: on
          ? "var(--gg-primary, #2563eb)"
          : "rgba(255,255,255,.12)",
        boxShadow: on
          ? "0 0 8px color-mix(in srgb, var(--gg-primary, #2563eb) 45%, transparent)"
          : "inset 0 1px 3px rgba(0,0,0,.4)",
        transition: "background .2s ease, box-shadow .2s ease",
      }}
    >
      <div style={{
        position: "absolute",
        top: 2,
        left: on ? 19 : 2,
        width: 17,
        height: 17,
        borderRadius: "50%",
        background: "#fff",
        boxShadow: "0 1px 4px rgba(0,0,0,.35)",
        transition: "left .2s ease",
      }} />
    </div>
  );
}

// With label — click the row to toggle
<div
  style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13, cursor: "pointer", color: S.dimBright }}
  onClick={() => setOn(!on)}
>
  <Toggle on={on} onToggle={() => setOn(!on)} />
  All day
</div>
```

**Exact inline version from `SitRepPanel.tsx` (no separate component):**
```tsx
<div
  style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13, cursor: "pointer", color: S.dimBright }}
  onClick={() => setCreateIsAllDay(!createIsAllDay)}
>
  <div style={{
    width: 38, height: 21, borderRadius: 11, position: "relative", flexShrink: 0,
    background: createIsAllDay ? "var(--gg-primary, #2563eb)" : "rgba(255,255,255,.12)",
    boxShadow: createIsAllDay
      ? "0 0 8px color-mix(in srgb, var(--gg-primary, #2563eb) 45%, transparent)"
      : "inset 0 1px 3px rgba(0,0,0,.4)",
    transition: "background .2s ease, box-shadow .2s ease",
  }}>
    <div style={{
      position: "absolute", top: 2,
      left: createIsAllDay ? 19 : 2,
      width: 17, height: 17, borderRadius: "50%",
      background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,.35)",
      transition: "left .2s ease",
    }} />
  </div>
  All day
</div>
```

---

## 6. Collapsible Section Card

Used in SitRep detail page (Status, Priority sections). The left accent strip appears in `boxShadow` when expanded.

```tsx
const [expanded, setExpanded] = useState(true); // open by default

<div style={{
  background: "rgba(20,25,38,.75)",
  backdropFilter: "blur(4px)",
  border: `1px solid ${S.border}`,
  borderRadius: 12,
  overflow: "hidden",
  boxShadow: expanded
    ? "inset 3px 0 0 0 var(--gg-primary, #2563eb), 0 4px 20px rgba(0,0,0,.3), inset 0 1px 0 rgba(255,255,255,.05)"
    : "0 2px 8px rgba(0,0,0,.25)",
  transition: "box-shadow .2s ease",
}}>

  {/* Clickable header row */}
  <div
    onClick={() => setExpanded(!expanded)}
    style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "12px 18px", cursor: "pointer",
      borderBottom: expanded ? `1px solid ${S.border}` : "none",
    }}
  >
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: "0.09em",
      color: S.dim, textTransform: "uppercase",
    }}>
      Section Label
    </span>
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {/* Optional: collapsed summary */}
      {!expanded && (
        <span style={{ fontSize: 12, color: S.dim }}>Current Value</span>
      )}
      {/* Chevron — rotates on expand */}
      <span style={{
        fontSize: 14, color: S.dim, display: "inline-block",
        transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
        transition: "transform .2s ease",
      }}>›</span>
    </div>
  </div>

  {/* Collapsible content */}
  <div style={{
    maxHeight: expanded ? "500px" : "0px",
    overflow: "hidden",
    transition: "max-height .2s ease",
    padding: expanded ? "14px 18px" : "0 18px",
  }}>
    {/* your content here */}
  </div>
</div>
```

---

## 7. Inset Left Accent Strip

Used on calendar items, list rows, dashboard widget rows, and any card that needs type/category color coding. Implemented entirely in `boxShadow` — zero box-model impact.

```tsx
// The accent color for a given item type comes from the color family system (Section 10).

// Standard card (rest state)
boxShadow: `inset 3px 0 0 0 ${accentColor}, 0 2px 8px rgba(0,0,0,.2)`

// Dashboard widget row (rest state)
boxShadow: `inset 3px 0 0 0 ${accentColor}, 0 1px 3px rgba(0,0,0,.08)`

// Hover (lift + expanded shadow + type glow)
boxShadow: `inset 3px 0 0 0 ${accentColor}, 0 6px 20px rgba(0,0,0,.35), 0 0 12px ${accentColor}22`

// Always pair transition on the element
transition: "transform .12s ease, box-shadow .12s ease"

// Hover also sets:
transform: "translateY(-2px)"   // calendar items
transform: "translateY(-1.5px)" // list rows, widget rows
```

---

## 8. Glass Card Variants

```tsx
// Standard glass card (section panels, settings cards)
{
  background: "rgba(20,25,38,.75)",
  backdropFilter: "blur(4px)",
  border: `1px solid ${S.border}`,
  borderRadius: 12,
  boxShadow: "0 2px 8px rgba(0,0,0,.25)",
}

// Elevated card (modal dialog, detail panel)
{
  background: "rgba(20,25,38,.97)",
  backdropFilter: "blur(20px)",
  border: "1px solid rgba(255,255,255,.1)",
  borderRadius: 16,
  boxShadow: "0 24px 64px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.06)",
}

// Modal backdrop overlay
{
  position: "fixed", inset: 0, zIndex: 50,
  background: "rgba(0,0,0,.65)",
  backdropFilter: "blur(3px)",
  display: "flex", alignItems: "center", justifyContent: "center",
}

// Meta / detail card (SitRep item page)
{
  background: S.card,
  border: `1px solid ${S.border}`,
  borderRadius: 14,
  boxShadow: "0 4px 20px rgba(0,0,0,.3), inset 0 1px 0 rgba(255,255,255,.05)",
  overflow: "hidden",
}
```

---

## 9. Button Styles

### Primary Gradient Button
```tsx
<button style={{
  background: "linear-gradient(135deg, var(--gg-primary, #2563eb), color-mix(in srgb, var(--gg-primary, #2563eb) 68%, #7c3aed))",
  border: "none",
  borderRadius: 10,
  color: "#fff",
  fontWeight: 700,
  fontSize: 13,
  padding: "8px 18px",
  cursor: "pointer",
  boxShadow: "0 2px 14px color-mix(in srgb, var(--gg-primary, #2563eb) 42%, transparent)",
  transition: "transform .12s ease, box-shadow .12s ease",
}}
  onMouseEnter={(e) => {
    e.currentTarget.style.transform = "translateY(-1.5px)";
    e.currentTarget.style.boxShadow =
      "0 4px 20px color-mix(in srgb, var(--gg-primary, #2563eb) 55%, transparent)";
  }}
  onMouseLeave={(e) => {
    e.currentTarget.style.transform = "";
    e.currentTarget.style.boxShadow =
      "0 2px 14px color-mix(in srgb, var(--gg-primary, #2563eb) 42%, transparent)";
  }}
>
  Save
</button>
```

Note: `className="btn"` (from globals.css) applies the base primary gradient button style for simpler cases.

### Ghost Button
```tsx
<button style={{
  background: "rgba(255,255,255,.04)",
  border: "1px solid rgba(255,255,255,.1)",
  borderRadius: 8,
  color: S.dim,
  fontSize: 13,
  fontWeight: 500,
  padding: "6px 14px",
  cursor: "pointer",
  transition: "background .12s, transform .12s",
}}
  onMouseEnter={(e) => {
    e.currentTarget.style.background = "rgba(255,255,255,.08)";
    e.currentTarget.style.transform = "translateY(-1px)";
  }}
  onMouseLeave={(e) => {
    e.currentTarget.style.background = "rgba(255,255,255,.04)";
    e.currentTarget.style.transform = "";
  }}
>
  Cancel
</button>
```

### Dashed "Add" Button
```tsx
<button style={{
  border: "2px dashed rgba(255,255,255,.12)",
  background: "rgba(255,255,255,.02)",
  borderRadius: 10,
  color: S.dim,
  cursor: "pointer",
  width: "100%",
  padding: "12px",
  fontSize: 13,
  fontWeight: 600,
  transition: "border-color .15s, background .15s",
}}
  onMouseEnter={(e) => {
    e.currentTarget.style.borderColor =
      "color-mix(in srgb, var(--gg-primary, #2563eb) 40%, transparent)";
    e.currentTarget.style.background = "rgba(255,255,255,.04)";
  }}
  onMouseLeave={(e) => {
    e.currentTarget.style.borderColor = "rgba(255,255,255,.12)";
    e.currentTarget.style.background = "rgba(255,255,255,.02)";
  }}
>
  + Add Item
</button>
```

### Danger Button
```tsx
<button style={{
  padding: "4px 10px",
  fontSize: 12,
  fontWeight: 500,
  borderRadius: 7,
  border: "1px solid rgba(220,38,38,.3)",
  background: "rgba(220,38,38,.08)",
  color: "#fca5a5",
  cursor: "pointer",
}}>
  Delete
</button>
```

### Nav Arrow Button (Calendar)
```tsx
<button
  style={{
    padding: "7px 13px",
    borderRadius: 9,
    border: "1px solid rgba(255,255,255,.09)",
    background: "rgba(255,255,255,.05)",
    backdropFilter: "blur(8px)",
    color: S.text,
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
    boxShadow: "0 2px 8px rgba(0,0,0,.25), inset 0 1px 0 rgba(255,255,255,.06)",
    transition: "all .12s",
  }}
  onMouseEnter={(e) => {
    e.currentTarget.style.background = "rgba(255,255,255,.09)";
    e.currentTarget.style.transform = "translateY(-1px)";
  }}
  onMouseLeave={(e) => {
    e.currentTarget.style.background = "rgba(255,255,255,.05)";
    e.currentTarget.style.transform = "";
  }}
>
  ←
</button>
```

---

## 10. Color Family System

**Source:** `lib/sitrep-colors.ts`

12 color families, each with 5 shades dark → light:

```
shades[0]  darkest   — very dark fill
shades[1]  dark      — completed / "done" items
shades[2]  accent    — inset strips, icons, borders
shades[3]  light     — active / open item backgrounds
shades[4]  lightest  — near-white pastel (rarely used)
```

### Get family + derive colors for any item type

```ts
import { getFamilyByKey, getFamilyForType, SYSTEM_TYPE_FAMILIES } from "@/lib/sitrep-colors";

// From a type slug + optional override map from the DB
const family = getFamilyForType(item.item_type, typeColorOverrides);
//   or from a raw color key stored on the type row:
const family = getFamilyByKey(typeRow.color) ?? getFamilyForType(item.item_type);

// Derive the three most-used values
const rowBackground = family.shades[3] + "55";  // light at ~33% — row bg
const accentStrip   = family.shades[2];          // accent — inset 3px left strip
const doneBg        = family.shades[1] + "33";   // dark at ~20% — completed item bg
```

### System type → family defaults

| Slug | Family key | Accent `[2]` | Light `[3]` | Dark `[1]` |
|---|---|---|---|---|
| task | blue | `#3b82f6` | `#93c5fd` | `#1d4ed8` |
| event | violet | `#7c3aed` | `#c4b5fd` | `#6d28d9` |
| meeting | teal | `#14b8a6` | `#5eead4` | `#0f766e` |

### Full palette for reference

```ts
// lib/sitrep-colors.ts — COLOR_FAMILIES (all 12)
{ key: "blue",    shades: ["#1e3a8a","#1d4ed8","#3b82f6","#93c5fd","#dbeafe"] }
{ key: "indigo",  shades: ["#312e81","#4338ca","#6366f1","#a5b4fc","#e0e7ff"] }
{ key: "violet",  shades: ["#4c1d95","#6d28d9","#7c3aed","#c4b5fd","#ede9fe"] }
{ key: "fuchsia", shades: ["#701a75","#86198f","#c026d3","#e879f9","#fae8ff"] }
{ key: "pink",    shades: ["#831843","#be185d","#ec4899","#f9a8d4","#fce7f3"] }
{ key: "red",     shades: ["#7f1d1d","#b91c1c","#ef4444","#fca5a5","#fee2e2"] }
{ key: "orange",  shades: ["#7c2d12","#c2410c","#f97316","#fdba74","#ffedd5"] }
{ key: "amber",   shades: ["#78350f","#b45309","#f59e0b","#fcd34d","#fef3c7"] }
{ key: "lime",    shades: ["#365314","#4d7c0f","#84cc16","#d9f99d","#f7fee7"] }
{ key: "green",   shades: ["#14532d","#15803d","#22c55e","#86efac","#dcfce7"] }
{ key: "teal",    shades: ["#134e4a","#0f766e","#14b8a6","#5eead4","#ccfbf1"] }
{ key: "sky",     shades: ["#0c4a6e","#0369a1","#0ea5e9","#7dd3fc","#e0f2fe"] }
```

### `groupItems()` helper — groups an array by a field key

**Defined in** `app/crm/page.tsx`. Copy here for use elsewhere:

```ts
function groupItems(
  items: any[],
  groupBy: string,
): { label: string; items: any[] }[] | null {
  if (groupBy === "none") return null;
  const PRIO_ORDER   = ["high", "medium", "low", "__none__"];
  const STATUS_ORDER = ["open", "in_progress", "done"];
  const map = new Map<string, any[]>();
  for (const item of items) {
    const key =
      groupBy === "type"     ? (item.item_type ?? "other")
    : groupBy === "status"   ? (item.status    ?? "other")
    : groupBy === "priority" ? (item.priority  ?? "__none__")
    : "—";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  const order =
    groupBy === "priority" ? PRIO_ORDER :
    groupBy === "status"   ? STATUS_ORDER : null;
  const entries = [...map.entries()];
  if (order) entries.sort(([a], [b]) => {
    const ai = order.indexOf(a); const bi = order.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
  return entries.map(([key, grpItems]) => ({
    label: key === "__none__" ? "No Priority"
         : key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " "),
    items: grpItems,
  }));
}
```

**Usage in JSX:**
```tsx
const groups = groupItems(items, groupBy); // "none" | "type" | "status" | "priority"

{groups
  ? groups.map(({ label, items: grp }) => (
      <div key={label} style={{ marginBottom: 8 }}>
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
          textTransform: "uppercase", color: S.dim,
          marginBottom: 4, paddingLeft: 2,
        }}>{label}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {grp.map(renderRow)}
        </div>
      </div>
    ))
  : (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {items.map(renderRow)}
    </div>
  )
}
```

---

## 11. Calendar Patterns

### NavBar component (SitRepCalendar.tsx — copy for new calendar features)

```tsx
const NavBar = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
    {([["←", stepBack], ["→", stepForward]] as const).map(([label, fn]) => (
      <button key={label} onClick={fn} style={{
        padding: "7px 13px", borderRadius: 9,
        border: "1px solid rgba(255,255,255,.09)",
        background: "rgba(255,255,255,.05)", backdropFilter: "blur(8px)",
        color: S.text, cursor: "pointer", fontSize: 14, fontWeight: 600,
        boxShadow: "0 2px 8px rgba(0,0,0,.25), inset 0 1px 0 rgba(255,255,255,.06)",
        transition: "all .12s",
      }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(255,255,255,.09)";
          e.currentTarget.style.transform  = "translateY(-1px)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "rgba(255,255,255,.05)";
          e.currentTarget.style.transform  = "";
        }}
      >
        {label}
      </button>
    ))}
    <span style={{ flex: 1, textAlign: "center", fontSize: 15, fontWeight: 700 }}>
      {periodLabel}
    </span>
    {/* View toggles — use FilterPill (Section 3) */}
    {(["month", "week", "day"] as const).map((v) => (
      <FilterPill key={v} active={view === v} onClick={() => setView(v)}>
        {v.charAt(0).toUpperCase() + v.slice(1)}
      </FilterPill>
    ))}
  </div>
);
```

### Today Badge (Month / Week view)

```tsx
// 26px circle for today's date number
<div style={{
  width: 26, height: 26, borderRadius: "50%",
  background: "var(--gg-primary, #2563eb)",
  boxShadow: "0 0 10px color-mix(in srgb, var(--gg-primary, #2563eb) 50%, transparent)",
  display: "flex", alignItems: "center", justifyContent: "center",
  color: "#fff", fontSize: 13, fontWeight: 700, flexShrink: 0,
}}>
  {dayNumber}
</div>
```

### Day View Item Card

```tsx
// accentCol = family.shades[2] for this item's type
<div style={{
  background: "rgba(20,25,38,.8)",
  backdropFilter: "blur(4px)",
  border: "1px solid rgba(255,255,255,.07)",
  borderRadius: 8,
  boxShadow: `inset 3px 0 0 0 ${accentCol}, 0 2px 8px rgba(0,0,0,.2)`,
  padding: "6px 10px",
  cursor: "pointer",
  transition: "transform .12s ease, box-shadow .12s ease",
}}
  onMouseEnter={(e) => {
    e.currentTarget.style.transform = "translateY(-2px)";
    e.currentTarget.style.boxShadow =
      `inset 3px 0 0 0 ${accentCol}, 0 6px 20px rgba(0,0,0,.35), 0 0 12px ${accentCol}22`;
  }}
  onMouseLeave={(e) => {
    e.currentTarget.style.transform = "";
    e.currentTarget.style.boxShadow =
      `inset 3px 0 0 0 ${accentCol}, 0 2px 8px rgba(0,0,0,.2)`;
  }}
>
  <div style={{ fontSize: 12, fontWeight: 600, color: S.text }}>{item.title}</div>
  <div style={{ fontSize: 11, color: S.dim }}>{timeLabel}</div>
</div>
```

### Type Color Key Legend

```tsx
// Render at bottom of any calendar that uses type colors
<div style={{
  display: "flex", flexWrap: "wrap", gap: 6,
  padding: "10px 0 4px",
  borderTop: `1px solid ${S.border}`,
}}>
  {Object.entries(typeColors).map(([slug, _colorKey]) => {
    const family = getFamilyForType(slug, typeColors);
    return (
      <div key={slug} style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600,
        background: family.shades[3] + "55",
        boxShadow: `inset 3px 0 0 0 ${family.shades[2]}`,
        color: S.dimBright,
      }}>
        {slug.charAt(0).toUpperCase() + slug.slice(1)}
      </div>
    );
  })}
</div>
```

---

## 12. Server Component Hover with Per-Item Dynamic Colors

Server components cannot use `onMouseEnter`/`onMouseLeave`. For list rows where each item has a different accent color, use a CSS custom property set inline per element and referenced in a `<style>` tag:

```tsx
// Server component (no "use client")
export default async function MyPage() {
  const items = await fetchItems();

  return (
    <section>
      {/* Inject CSS once per page — the :hover rule references var(--accent) */}
      <style>{`
        .accent-row {
          transition: transform .12s ease, box-shadow .12s ease;
        }
        .accent-row:hover {
          transform: translateY(-1.5px) !important;
          box-shadow:
            inset 3px 0 0 0 var(--accent),
            0 4px 14px rgba(0,0,0,.12) !important;
        }
      `}</style>

      {items.map((item) => {
        const accent = getAccentColor(item); // e.g. family.shades[2]
        return (
          <Link
            key={item.id}
            href={`/crm/.../${item.id}`}
            className="accent-row"
            style={{
              // Static rest-state box-shadow
              boxShadow: `inset 3px 0 0 0 ${accent}, 0 1px 3px rgba(0,0,0,.08)`,
              // CSS custom property — inherited by the :hover rule above
              "--accent": accent,
            } as React.CSSProperties}
          >
            {item.title}
          </Link>
        );
      })}
    </section>
  );
}
```

**Why it works:** CSS custom properties are inherited, so the `:hover` rule reading `var(--accent)` picks up the value set on that specific element. Each row gets a different `--accent`, even though there's one shared CSS class.

---

## 13. Iframe Embed Height Normalization

When a Next.js page is embedded in an `<iframe>`, `globals.css` `html, body { height: 100% }` clamps the body to viewport height, creating an internal scrollbar. Fix with both steps:

### Step 1 — Override height constraint (add to the embed page JSX)

```tsx
// Wrap your page JSX in a fragment and inject this style first:
<>
  <style>{`html, body { height: auto !important; overflow: auto !important; }`}</style>
  {/* rest of page */}
</>
```

### Step 2 — Report scrollHeight to parent via postMessage

```tsx
useEffect(() => {
  if (typeof window === "undefined" || window.parent === window) return; // skip non-iframe contexts

  const report = () =>
    window.parent.postMessage(
      { type: "gg-cal-height", height: document.body.scrollHeight },
      "*"
    );

  report(); // initial
  const observer = new ResizeObserver(report);
  observer.observe(document.body);
  return () => observer.disconnect();
}, []);
```

### Parent page (embedding the iframe)

```html
<iframe id="cal" src="/public/cal/TOKEN" width="100%" frameborder="0"></iframe>
<script>
  window.addEventListener("message", (e) => {
    if (e.data?.type === "gg-cal-height") {
      document.getElementById("cal").style.height = e.data.height + "px";
    }
  });
</script>
```

---

## 14. Tenant Settings Sub-key Pattern

When adding configuration that should persist per-tenant but doesn't warrant its own table, store it as a sub-key of `tenants.settings` (a JSONB column).

**API Route pattern** (`/api/crm/sitrep/widget-settings/route.ts`):

```ts
// GET — return sub-key with defaults merged
export async function GET() {
  const tenant = await getTenant();
  const { data } = await makeSb(tenant.id)
    .from("tenants").select("settings").eq("id", tenant.id).single();
  const saved = (data as any).settings?.your_feature_key ?? {};
  return NextResponse.json({ ...YOUR_DEFAULTS, ...saved });
}

// PATCH — read-modify-write (never overwrite other settings keys)
export async function PATCH(req: NextRequest) {
  const denied = await requireDirectorApi();
  if (denied) return denied;
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);
  const body = await req.json();

  const { data } = await sb.from("tenants").select("settings").eq("id", tenant.id).single();
  const currentSettings = (data as any).settings ?? {};
  const merged = { ...YOUR_DEFAULTS, ...(currentSettings.your_feature_key ?? {}), ...body };

  await sb.from("tenants").update({
    settings: { ...currentSettings, your_feature_key: merged }
  }).eq("id", tenant.id);

  return NextResponse.json(merged);
}
```

**Using the saved config in a server component:**
```ts
// settings is passed from getTenant() as (tenant as any).settings
const featureCfg = {
  someOption: settings?.your_feature_key?.someOption ?? defaultValue,
};
```

---

## 15. Micro-interaction Timing Reference

| Element | CSS transition value |
|---|---|
| Filter pill hover | `transform .12s ease, box-shadow .12s ease, filter .12s ease` |
| List row / widget row lift | `transform .12s ease, box-shadow .12s ease` |
| Day view calendar item | `transform .12s ease, box-shadow .12s ease` |
| Type selection card | `transform .15s ease, box-shadow .15s ease, border-color .15s ease` |
| Section card box-shadow (expand) | `box-shadow .2s ease` |
| Section collapse / expand | `max-height .2s ease` |
| Section chevron rotate | `transform .2s ease` |
| iOS toggle circle slide | `left .2s ease` |
| iOS toggle track color | `background .2s ease, box-shadow .2s ease` |
| Input focus ring | `border-color .15s, box-shadow .15s` |
| Button gradient hover | `transform .12s ease, box-shadow .12s ease` |
| Ghost button hover | `background .12s, transform .12s` |
| Nav arrow hover | `all .12s` |
| Drag handle opacity | `opacity .1s ease` |

---

## 16. Things Never to Do

| Don't | Do instead |
|---|---|
| `<input type="checkbox">` | iOS toggle (Section 5) |
| `onMouseEnter` in a server component | CSS class + `--accent` custom property (Section 12) |
| Hardcode `rgba(37,99,235,…)` for primary tints | `color-mix(in srgb, var(--gg-primary, #2563eb) N%, transparent)` |
| `outline: none` without a replacement focus ring | `focusInput`/`blurInput` handlers (Section 4) |
| Separate DOM element for the left accent bar | `inset 3px 0 0 0 color` in `boxShadow` (Section 7) |
| Arbitrary dark grays like `#1a1f2e` | S token values (Section 1) |
| `opacity: 0.5` on `--gg-primary` | `color-mix()` (Section 2) |
| `height: 100vh` on an embed page | `height: auto !important` style injection (Section 13) |
| Querying all rows and aggregating in JS for large tables | Postgres RPC returning aggregated JSONB |

---

## 17. Key File Reference

| File | What it contains |
|---|---|
| `lib/sitrep-colors.ts` | `COLOR_FAMILIES`, `getFamilyByKey()`, `getFamilyForType()`, `SYSTEM_TYPE_FAMILIES` |
| `app/crm/sitrep/SitRepPanel.tsx` | `FilterPill`, `inputStyle`, `focusInput`/`blurInput`, iOS toggle (inline), create modal glass pattern |
| `app/crm/sitrep/calendar/SitRepCalendar.tsx` | `FilterPill` (duplicate), `NavBar`, month/week/day view renderers, type legend, create modal |
| `app/crm/sitrep/[id]/SitRepItemClient.tsx` | `S` tokens (canonical), `fieldStyle`, `focusField`/`blurField`, section collapse, iOS All Day toggle, status/priority button patterns, hero banner |
| `app/public/cal/[token]/PublicCalendarEmbed.tsx` | Full public glass treatment; iframe height fix + postMessage; `Pill` component |
| `app/crm/page.tsx` | `groupItems()`, server-component CSS `--accent` trick, dashboard widget row pattern |
| `app/crm/settings/sitrep/SitRepSettingsPanel.tsx` | Settings card layout; pill selector pattern; widget config UI |
| `app/api/crm/sitrep/widget-settings/route.ts` | Tenant settings sub-key GET/PATCH pattern |
| `app/components/ColorFamilyPicker.tsx` | Reusable color family picker (12 families, 2 rows) |
