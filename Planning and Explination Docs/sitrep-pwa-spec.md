# SitRep PWA — Feature Spec
## For use with Claude Code
**Status:** Pre-development planning
**Suite:** GuerrillaSuite
**Product:** SitRep (standalone PWA)
**Stack:** Next.js · Supabase (PostgreSQL) · Railway · Turborepo monorepo
**Domain:** `sitrep.groundgame.digital`

---

## 0. What This Is

SitRep is GuerrillaSuite's task, event, and calendar layer. It currently ships as a named tool inside GroundGame at `/crm/sitrep/` — a fully-featured desktop-first experience with list view, kanban, Gantt timeline, calendar, item detail, booking pages, and multi-calendar sharing.

This document scopes the **SitRep standalone PWA** — a separate Next.js application in the monorepo (`apps/sitrep-pwa/`) deployed as its own Railway service at `sitrep.groundgame.digital`. It shares the same Supabase backend, the same `@guerrillasuite/db` and `@guerrillasuite/ui` packages, and the same auth system as GroundGame. It is mobile-first and home-screen installable.

The PWA is **not** a recreation of the full desktop SitRep. It is the consumer-facing, always-in-your-pocket experience — the reminders app and calendar app combined — with a SuperAdmin control plane at `/admin` that is a new surface not present anywhere else in the suite.

---

## 1. Monorepo Structure

```
guerrillasuite/
├── apps/
│   ├── groundgame/          # Existing — do not touch
│   ├── sitrep-pwa/          # NEW — this app
│   │   ├── app/
│   │   │   ├── (pwa)/       # Mobile PWA routes
│   │   │   │   ├── page.tsx             # Default → redirect to /list
│   │   │   │   ├── list/
│   │   │   │   │   └── page.tsx         # List view
│   │   │   │   ├── calendar/
│   │   │   │   │   └── page.tsx         # Calendar view (day default)
│   │   │   │   └── item/
│   │   │   │       └── [id]/
│   │   │   │           └── page.tsx     # Full item detail (expanded)
│   │   │   ├── admin/                   # SuperAdmin control plane
│   │   │   │   └── page.tsx             # Global type templates manager
  │   │   │   ├── login/
│   │   │   │   └── page.tsx             # Native-feeling auth screen
│   │   │   └── api/
│   │   │       ├── sitrep/              # Proxies to shared DB layer
│   │   │       └── admin/
│   │   │           └── global-types/
│   │   │               └── route.ts     # CRUD for sitrep_global_type_templates
│   │   ├── public/
│   │   │   ├── manifest.json            # PWA manifest
│   │   │   ├── sw.js                    # Service worker (offline shell only — v1)
│   │   │   ├── icon-192.png             # SitRep home screen icon
│   │   │   └── icon-512.png
│   │   ├── package.json
│   │   └── next.config.ts
```

---

## 2. Deployment

- **Railway service:** Separate from GroundGame. One crash does not affect the other.
- **Domain:** `sitrep.groundgame.digital` — pointed exclusively at this Railway service, never at the GroundGame service. This avoids any conflict with GroundGame's subdomain-based tenant routing (`getTenant()` reads the subdomain to identify tenants — `sitrep` must never resolve to the GroundGame app).
- **Auth:** Shared Supabase session cookies. A user logged into GroundGame on the same browser is already authenticated in the PWA. Session expiry shows the `/login` screen.
- **Environment variables:** Same `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` as GroundGame. Add `NEXT_PUBLIC_APP_URL=https://sitrep.groundgame.digital`.

---

## 3. PWA Manifest & Home Screen

**`public/manifest.json`:**
```json
{
  "name": "SitRep",
  "short_name": "SitRep",
  "description": "Your tasks, events, and calendar — always in your pocket.",
  "start_url": "/list",
  "display": "standalone",
  "background_color": "#0a0d14",
  "theme_color": "#0a0d14",
  "orientation": "portrait",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

The SitRep icon is distinct from the GroundGame icon. It should use the same GuerrillaSuite dark aesthetic but with the 📡 satellite dish as the visual anchor — the established Intel Brief / SitRep identity mark.

**`<head>` meta tags (add to root layout):**
```html
<link rel="manifest" href="/manifest.json" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="SitRep" />
<link rel="apple-touch-icon" href="/icon-192.png" />
<meta name="theme-color" content="#0a0d14" />
```

**Service worker (v1 — offline shell only):**
Register a minimal service worker that caches the app shell so the PWA loads instantly even on slow connections. Do not implement background sync or push notifications — those are v3. The service worker in v1 exists purely to satisfy PWA installability requirements and provide a fast shell load.

---

## 4. Visual Language

The PWA inherits the GuerrillaSuite dark UI from `VisualGuide.md` verbatim. All token values, color families, button styles, input styles, toggle patterns, and micro-interaction timings defined there apply here. Do not deviate.

**Mobile-specific additions on top of the VisualGuide:**

- **Bottom navigation bar:** Fixed at the bottom of the viewport. 56px tall. Two tabs: List (☰) and Calendar (📅). Active tab uses `var(--gg-primary, #2563eb)` icon color. Inactive uses `rgb(100 116 139)`. Background: `rgb(10 13 20)` with `border-top: 1px solid rgba(255,255,255,.07)`. Safe area padding for iPhone home indicator: `padding-bottom: env(safe-area-inset-bottom)`.

- **Bottom sheets:** All item interactions happen in a bottom sheet. Sheet slides up from the bottom with `transform: translateY(0)` from `translateY(100%)`, `transition: 300ms cubic-bezier(0.32, 0.72, 0, 1)`. Background: `rgb(20 25 38)`. Top border radius: `16px`. A `4px wide · 36px tall` drag handle pill centered at the top in `rgba(255,255,255,.15)`. Backdrop: `rgba(0,0,0,.6)` with `backdrop-filter: blur(4px)`.

- **Touch targets:** All tappable elements minimum `44px` tall. Never smaller.

- **Swipe zones:** Swipe gestures (list rows) are detected only on the center and right 70% of the row width. The leftmost 30% is reserved for the circle check-off tap target to avoid gesture conflicts.

- **Viewport:** `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />` — `viewport-fit=cover` is required for the safe area insets to work correctly on iPhone.

---

## 5. Authentication

**`/login`** is a full-screen native-feeling auth page. It is not a redirect to a web page — it renders within the PWA shell.

- Dark background matching the app (`rgb(10 13 20)`)
- SitRep icon centered at the top
- "SitRep" wordmark below the icon
- Email + password fields using `inputStyle` from VisualGuide
- Primary gradient "Sign In" button
- No sign-up flow — accounts are created through GroundGame. If a user hits login with no account, show: "Contact your administrator to get access."
- On successful auth: redirect to `/list`
- On session expiry anywhere in the app: redirect to `/login` preserving the attempted URL as a `?next=` param

Auth uses the existing Supabase Auth client — same session, same cookies as GroundGame. Do not create a separate auth system.

---

## 6. List View — `/list`

### Layout

Full-height scrollable page with the fixed bottom nav. No sidebar. No horizontal panels.

**Page header (sticky, top of page):**
```
SitRep                    [+ New]  [⚙]
```
"SitRep" wordmark left-aligned. `[+ New]` button opens the quick-create bottom sheet. `[⚙]` links to calendar sharing settings (bottom drawer — see Section 9).

**Grouped sections** — same grouping logic as the desktop list view:
- Overdue (red accent)
- Today
- This Week
- Later
- Done (collapsed by default, tap to expand)

Section headers: `10px`, `font-weight: 700`, `letter-spacing: 0.08em`, `text-transform: uppercase`, `color: rgb(100 116 139)`. Overdue header uses `#ef4444`.

### List Row

Each item row is `56px` minimum height (taller if title wraps).

```
[○]  Task title here                    [type badge]
     Due Today · 2:00 PM                [priority dot]
```

**Left side — circle check-off:**
- `28px` circle, `border: 2px solid` in the item type's accent color (`family.shades[2]` from VisualGuide color family system)
- Tap to complete: circle fills with a checkmark, item moves to Done section with a brief `opacity` fade
- This tap target occupies the leftmost 30% of the row and is exempt from swipe detection

**Right side:**
- Item type badge: small pill using `family.shades[3] + "55"` background and `family.shades[2]` text
- Priority dot: `!!` for urgent, `!` for high — positioned top-right

**Subtext line:** Due date/time in `rgb(100 116 139)`, `12px`. Overdue items show the subtext in `#ef4444`.

**Inset left accent strip** using `boxShadow: inset 3px 0 0 0 ${family.shades[2]}` — same pattern as desktop VisualGuide Section 7.

**Tap behavior:** Tapping anywhere on the row (except the circle) opens the item bottom sheet (Section 8).

### Swipe Gestures

Swipe gestures are detected via `touchstart` / `touchmove` / `touchend` on the row. Only activate when horizontal movement exceeds `10px` and is more horizontal than vertical (prevents scroll conflicts).

**Swipe right — Complete:**
- Row slides right revealing a green background with a ✓ icon
- At `60px` reveal: haptic feedback (if `navigator.vibrate` available — `vibrate(10)`)
- Release past `80px`: item marked complete, row fades out
- Release before `80px`: row snaps back

**Swipe left — Reschedule:**
- Row slides left revealing an amber background with a 📅 icon
- Release past `80px`: opens the reschedule bottom sheet (a simplified date/time picker sheet — not the full item sheet)
- Release before `80px`: row snaps back

**Swipe zone:** Center and right 70% of the row only. Left 30% (circle zone) does not initiate swipes.

**Spring animation on snap-back:** `transform: translateX(0)`, `transition: 300ms cubic-bezier(0.32, 0.72, 0, 1)`.

---

## 7. Calendar View — `/calendar`

### View Modes

Three modes controlled by a segmented control in the page header:

```
[Day]  [Week]  [Month]
```

Default view on first load: **Day**. Persist the last-used view in `localStorage`.

### Day View (Default)

A vertical hourly time grid for a single day. Swipe left/right to navigate between days.

**Header:**
```
← Wed, May 7          [Day] [Week] [Month]
```
Left arrow = previous day, right arrow = next day. Also supports swipe left/right on the grid itself to navigate days. "Today" button resets to current day (show only when not on today).

**Time grid:**
- Hours displayed `12 AM` through `11 PM` as left-side labels in `rgb(100 116 139)`, `11px`
- Current time indicator: a `2px` horizontal line in `var(--gg-primary)` with a `6px` circle on the left edge, positioned absolutely at the current time — updates every minute
- Events rendered as cards positioned absolutely within the time grid using `top` and `height` calculated from start/end times
- Overlapping events render side by side (split the column width equally)
- All-day events appear in a dedicated row above the time grid, below the header

**Event card in time grid:**
Same glass card pattern from VisualGuide — `inset 3px 0 0 0 ${accentColor}` left strip, dark background, rounded `8px`. Shows title and time. Tap opens item bottom sheet.

**Empty state:** "Nothing scheduled. Tap + to add something." centered in the grid.

### Week View

A vertical grouped list — **not** a time grid. Seven day sections stacked vertically, each showing that day's items as list rows beneath a day header. This is the Apple Calendar week list model, not a horizontal 7-column grid.

```
MON  May 5
  [○] Team standup · 9:00 AM
  [○] Review proposal · 2:00 PM

TUE  May 6
  Nothing scheduled

WED  May 7  ← today, highlighted
  [○] Client call · 11:00 AM
```

Day headers: `11px`, `font-weight: 700`, `letter-spacing: 0.06em`. Today's header uses `var(--gg-primary)` text color with a subtle `color-mix(in srgb, var(--gg-primary) 12%, transparent)` background pill.

Days with no items show "Nothing scheduled" in `rgb(100 116 139)`, `12px`, `font-style: italic`.

Swipe left/right on the page navigates to the next/previous week. A "This Week" button in the header returns to the current week when navigated away.

### Month View

A compact date-picker style grid. **No text on items — dots only.**

**Grid:** 7 columns (Sun–Sat), rows for each week of the month. Each day cell is square.

**Day cell:**
- Date number: `13px`, centered. Today gets a `26px` circle in `var(--gg-primary)` behind the number (same pattern as desktop calendar VisualGuide Section 11).
- Dots row below the date number: one dot per item on that day, rendered in timing order (earliest item first, left to right). Each dot is `5px` circle in the item type's `family.shades[2]` accent color.
- **Cap at 7 dots.** If a day has more than 7 items, the 7th dot is replaced with a small `+N` label in `rgb(100 116 139)`, `9px`.
- Dots wrap if needed but realistically at `5px` with `2px` gap this fits comfortably in a cell.

**Tapping a day cell:** Switches to Day view for that date. Month view is a navigation surface, not an editing surface.

**Month navigation:** `←` and `→` arrows in the header. Swipe left/right on the grid navigates months.

---

## 8. Item Bottom Sheet

The bottom sheet is the primary interaction surface for both viewing/editing existing items and creating new ones. It is always the first stop — full detail is accessed by expanding from here.

### Triggering the Sheet

- **Tap any list row** (outside the circle) → opens sheet pre-filled with that item's data in view/edit mode
- **Tap `+ New` button** → opens sheet in create mode with all fields blank
- **Tap a dot or event in calendar views** → opens sheet pre-filled for that item
- **Swipe left on a list row past threshold** → opens reschedule-only sheet (simplified — date/time picker only)

### Sheet Structure

```
━━━━━━━  ← drag handle

[Item Type Selector]         [✕ close]

[Title input — large, prominent]

📅 Date & Time               [picker]
📍 Location                  [input]
👤 Assign To                 [picker]

──────────────────────────────────────
[Complete]    [Delete]    [Expand ↗]
──────────────────────────────────────
```

**Title input:** `18px`, `font-weight: 600`, full width, no border — inline edit style. Placeholder: "What needs to happen?"

**Item Type Selector:** A row of small type pills at the top of the sheet (Task / Event / Meeting / any custom types). Active type highlighted with `color-mix(in srgb, var(--gg-primary) 18%, transparent)` background. Selecting a type updates the sheet's accent color immediately.

**Fields:**
- **Date & Time** — tapping opens a native datetime picker (`<input type="datetime-local">` styled to match the dark theme, or a custom sheet if native styling is insufficient on iOS)
- **Location** — plain text input. `12px` placeholder: "Add location"
- **Assign To** — a user picker showing tenant members. Shows avatar initials + name. Single select in v1.

**Bottom action bar:**
- **Complete** — marks item done, closes sheet, row animates out of list
- **Delete** — shows inline confirmation ("Delete this item?" with Confirm/Cancel) before firing
- **Expand ↗** — navigates to `/item/[id]` full detail page

**Create mode differences:**
- No Complete or Delete buttons
- Bottom bar shows: `[Cancel]` and `[Save]`
- Save creates the item and closes the sheet
- If title is empty on Save, shake the title input and focus it — do not save

**Sheet sizing:**
- Default height: `55vh` — enough for all fields without feeling cramped
- Keyboard open: sheet shifts up so fields remain visible above the keyboard
- User can drag the sheet up to `85vh` max or down to dismiss
- Drag to dismiss: if dragged down past `30%` of sheet height and released, sheet closes with the spring animation

### Reschedule Sheet (Swipe Left)

A simplified sheet — date/time picker only, no other fields. Header shows the item title. Bottom bar: `[Cancel]` and `[Reschedule]`.

---

## 9. Calendar Sharing — Bottom Drawer

Accessible via the `[⚙]` icon in the list view header and from a share button within calendar views.

This is a **bottom drawer** — similar to the bottom sheet but full height (`90vh`) and scrollable. It renders the same CalendarSwitcher logic from the desktop (`app/crm/sitrep/calendar/CalendarSwitcher.tsx`) adapted for mobile:

- Calendar types listed vertically with eye-toggle (same iOS toggle from VisualGuide Section 5)
- Grouped by type (Work / Personal / Custom)
- Share button (↗) per calendar opens an inner sheet for invite by email
- "Add Calendar" at the bottom (enforces max 5 per the desktop logic)

No new backend work. All sharing logic, invite flow, and `user_calendar_types` / `calendar_view_shares` / `calendar_view_invites` table interactions are identical to the desktop implementation.

---

## 10. Full Item Detail — `/item/[id]`

A full-screen page reached only by tapping "Expand ↗" from the bottom sheet.

This is a mobile-optimized version of the desktop `SitRepItemClient.tsx`. All fields are present — title, type, status/stage, priority, dates, location, assignees, description, sub-items, dependencies, comments, activity log, linked records.

**Layout:** Single scrollable column. Section cards use the collapsible pattern from VisualGuide Section 6. Each section (Details, Sub-items, Dependencies, Comments, Activity) is a collapsible card with the left accent strip on expand.

**Back navigation:** `← Back` in the top left returns to the previous view (list or calendar) without losing scroll position.

**Auto-save:** Same auto-save behavior as the desktop detail page — changes save on blur/debounce, no explicit save button for field edits.

**Delete:** Available here (not just in the bottom sheet). Same cascade/orphan modal for items with children per the desktop logic.

---

## 11. SuperAdmin Control Plane — `/admin`

### Access Control

Gate with `crmUser.isSuperAdmin === true`. Any non-SuperAdmin hitting `/admin` redirects to `/list`. This check happens server-side in the page component using `getCrmUser()`.

This route is **not linked from anywhere in the PWA UI**. It is navigated to directly by GuerrillaSuite employees. It renders in desktop layout — no mobile optimization required or desired.

### What Lives Here (V1)

**Global Type Templates Manager**

The three default SitRep item types (Task, Event, Meeting) are currently hardcoded in `app/api/crm/sitrep/types/route.ts` in the GroundGame app. When a tenant first calls that endpoint with no existing types, the hardcoded defaults are seeded into `sitrep_item_types` for that tenant.

This spec moves that seed data into a new database table and builds a UI to manage it.

**New table: `sitrep_global_type_templates`**
```sql
CREATE TABLE sitrep_global_type_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,         -- e.g. 'task', 'event', 'meeting'
  color TEXT NOT NULL,               -- color family key from VisualGuide palette
  icon TEXT,                         -- emoji or icon identifier
  is_mission_type BOOLEAN DEFAULT false,
  show_in_kanban BOOLEAN DEFAULT true,
  booking_enabled BOOLEAN DEFAULT false,
  stages JSONB DEFAULT '[]',         -- default stages array for this type
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,    -- inactive templates are not seeded to new tenants
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed the three existing defaults
INSERT INTO sitrep_global_type_templates (name, slug, color, sort_order) VALUES
  ('Task', 'task', 'blue', 0),
  ('Event', 'event', 'violet', 1),
  ('Meeting', 'meeting', 'teal', 2);
```

**Changes to `app/api/crm/sitrep/types/route.ts` (in GroundGame):**

The seeding logic currently checks if `sitrep_item_types` has zero rows for the tenant, then inserts hardcoded defaults. Change it to:
1. Query `sitrep_global_type_templates` where `is_active = true`, ordered by `sort_order`
2. Insert those records as the tenant's starting types
3. If `sitrep_global_type_templates` is empty for any reason, fall back to the existing hardcoded defaults (safety net — never leave a tenant with zero types)

**`/admin` page UI:**

A simple desktop-layout management page. No mobile optimization.

```
SitRep Admin                    [GuerrillaSuite internal — not for tenants]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Global Type Templates
These are seeded to every new tenant when they first open SitRep.
Existing tenants are not affected by changes here.

[+ Add Template]

┌─────────────────────────────────────────────────────────────────┐
│ ● Task          blue    kanban ✓   mission ✗    [Edit] [↕]      │
│ ● Event         violet  kanban ✓   mission ✗    [Edit] [↕]      │
│ ● Meeting       teal    kanban ✓   mission ✗    [Edit] [↕]      │
└─────────────────────────────────────────────────────────────────┘
```

- Color dot uses the family's `shades[2]` accent color
- `[↕]` is a drag handle for reordering (`sort_order`)
- `[Edit]` opens an inline edit panel (same field set as the TypeEditorPanel in desktop SitRep settings, minus the per-tenant customization options)
- Inactive templates shown with reduced opacity and a "Inactive" badge — they exist in the table but won't be seeded
- `[+ Add Template]` adds a new row (up to a soft limit of 8 total templates — warn but don't block above 8)

**API route: `app/api/admin/global-types/route.ts` (in sitrep-pwa):**
- `GET` — returns all `sitrep_global_type_templates` ordered by `sort_order`
- `POST` — creates a new template (SuperAdmin only)
- `PATCH /[id]` — updates a template (SuperAdmin only)
- `DELETE /[id]` — soft delete (sets `is_active = false`) if the slug matches a system default (task/event/meeting). Hard delete only for custom templates. Never allow deleting all three system defaults simultaneously — enforce minimum 1 active template.

---

## 12. Auth Patterns

All PWA routes use the same `getTenant()` and `getCrmUser()` pattern from `@/lib/tenant` and `@/lib/crm-auth`. The tenant is identified from the authenticated user's primary tenant membership — not from the subdomain (since `sitrep.groundgame.digital` is not a tenant subdomain).

**Important:** The PWA does not use subdomain-based tenant detection. It identifies the tenant from the authenticated user's session. A user who belongs to multiple tenants sees a tenant switcher (a simple select in the settings drawer) — same multi-tenant model as the rest of the suite.

For the `/admin` route, use a plain service role Supabase client without `X-Tenant-Id` header — same pattern as `/crm/admin/intel-brief-feeds` in GroundGame.

---

## 13. Data & API

The PWA does not duplicate API routes unnecessarily. Where possible it calls the existing GroundGame API routes directly (they are internal to the monorepo and share the same DB). New API routes are created only where the PWA needs behavior specific to its context (global type templates, auth flow).

**Existing routes consumed from GroundGame (no changes needed):**
- `GET/POST /api/crm/sitrep/items`
- `GET/PATCH/DELETE /api/crm/sitrep/items/[id]`
- `GET/POST /api/crm/sitrep/items/[id]/comments`
- `GET/POST /api/crm/sitrep/items/[id]/dependencies`
- `GET /api/crm/sitrep/types`
- `GET/POST /api/user/calendar-types`
- `GET/POST /api/user/calendar-types/[id]/views`

**New routes in sitrep-pwa:**
- `GET/POST /api/admin/global-types/route.ts`
- `PATCH/DELETE /api/admin/global-types/[id]/route.ts`

---

## 14. react-big-calendar Integration

Install `react-big-calendar` (MIT licensed, `github.com/jquense/react-big-calendar`) for the Day view time grid rendering. This handles:

- Absolute positioning of events within the hourly grid
- Overlapping event layout (side-by-side columns)
- Current time indicator
- All-day event row

**Do not use react-big-calendar for Week or Month views** — the Week view is a custom vertical grouped list (not a time grid) and the Month view is a custom dot-only grid. Both are custom implementations that would fight against react-big-calendar's rendering model.

**Styling:** Strip all default react-big-calendar CSS. Apply GuerrillaSuite visual tokens from VisualGuide.md to all rendered elements. The library is used for layout math only — not for visual output.

**Install:**
```bash
npm install react-big-calendar
npm install @types/react-big-calendar --save-dev
```

**Check React version compatibility** before installing. As of the time of this spec, react-big-calendar has an open issue with React 19 support. Confirm the monorepo's React version before pulling this in. If React 19 is in use and compatibility is broken, the Day view time grid must be implemented manually using absolute positioning math.

---

## 15. File Structure Summary

**New files (sitrep-pwa app):**
```
apps/sitrep-pwa/
  app/
    layout.tsx                        # Root layout — PWA meta tags, manifest link, bottom nav
    (pwa)/
      page.tsx                        # Redirect to /list
      list/
        page.tsx                      # List view server page
        ListPanel.tsx                 # List view client component
        ListRow.tsx                   # Individual row with swipe + circle
        SwipeableRow.tsx              # Swipe gesture wrapper component
      calendar/
        page.tsx                      # Calendar view server page
        CalendarLayout.tsx            # View switcher + active view renderer
        DayView.tsx                   # react-big-calendar day grid (or custom)
        WeekView.tsx                  # Custom vertical grouped list
        MonthView.tsx                 # Custom dot-only grid
        CalendarDrawer.tsx            # Calendar sharing bottom drawer
      item/
        [id]/
          page.tsx                    # Full item detail server page
          ItemDetailMobile.tsx        # Mobile-optimized detail client component
    admin/
      page.tsx                        # Global type templates manager
      GlobalTypeEditor.tsx            # Edit panel for a single template
    login/
      page.tsx                        # Auth screen
    api/
      admin/
        global-types/
          route.ts                    # GET/POST global type templates
          [id]/
            route.ts                  # PATCH/DELETE single template
  components/
    BottomSheet.tsx                   # Reusable bottom sheet wrapper
    ItemBottomSheet.tsx               # Item view/edit/create sheet
    RescheduleSheet.tsx               # Simplified reschedule-only sheet
    BottomNav.tsx                     # Fixed bottom navigation bar
    TypePillSelector.tsx              # Item type pill row selector
  public/
    manifest.json
    sw.js
    icon-192.png
    icon-512.png
  package.json
  next.config.ts
```

**Modified files (GroundGame app):**
```
app/api/crm/sitrep/types/route.ts    # Seed logic reads from sitrep_global_type_templates
```

**New Supabase migration:**
```
sitrep_global_type_templates          # New table with three default seeds
```

---

## 16. Important Patterns to Follow

- **Always use `getTenant()` and `getCrmUser()`** for auth — same as GroundGame, same packages
- **Tenant identification is user-based**, not subdomain-based in this app — do not read the subdomain
- **VisualGuide.md is law** for all visual tokens, component patterns, and micro-interaction timings — copy values verbatim
- **Touch targets are minimum 44px** — enforce this on every interactive element
- **Swipe detection must not conflict with scroll** — check that horizontal movement exceeds vertical before treating as a swipe gesture
- **Bottom sheet drag-to-dismiss** must feel native — use `cubic-bezier(0.32, 0.72, 0, 1)` spring easing
- **The circle tap target (30% left of row) is sacred** — never let swipe gestures initiate from this zone
- **Month view dots use item type accent colors** (`family.shades[2]` from the color family system) — not a single generic color
- **The `/admin` route is desktop layout** — do not apply mobile optimizations there
- **The seed fallback in `types/route.ts` must stay** — if `sitrep_global_type_templates` is empty, use hardcoded defaults. Never leave a tenant with zero item types.
- **react-big-calendar is for Day view only** — Week and Month are custom implementations
- **No push notifications in v1** — service worker is shell-only
- **No sign-up flow in the PWA** — accounts come from GroundGame

---

## 17. Out of Scope (Explicitly)

- ❌ Push notifications — v3
- ❌ Kanban view — desktop only
- ❌ Gantt / Timeline view — desktop only
- ❌ Booking page management in the PWA — desktop only
- ❌ External sharing (public links) — future
- ❌ Recurring item creation UI — future (schema exists, UI is not built even on desktop yet)
- ❌ Offline data sync — v2 (service worker caches shell only)
- ❌ Sign-up flow — accounts created through GroundGame
- ❌ Multi-tenant push to existing tenants from `/admin` — changes to global templates only affect new tenant onboarding, not existing tenants
