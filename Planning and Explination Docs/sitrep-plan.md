# SitRep — GuerrillaSuite Task, Event & Calendar Layer
## Planning & Architecture Document
**Status:** v2 SHIPPED (2026-05-01) — PWA scaffolding next
**Suite:** GuerrillaSuite
**Lives in:** GroundGame (`/crm/sitrep/`) → Standalone product (v3)
**Stack:** Next.js 15.5 · Supabase (PostgreSQL) · Railway · GitHub

---

## Current Build Status

### ✅ v1 — Shipped 2026-04-16

Core task/event/meeting board, missions, calendar view, dashboard widget, item detail with auto-save, full RBAC.

### ✅ v2 — Shipped 2026-05-01

Full Jira + Google Calendar + Calendly expansion. All 10 phases complete.

---

## v2 Feature Map — What Shipped

| # | Feature | Status | Where |
|---|---------|--------|-------|
| 1 | Custom stages per type (pipeline-style) | ✅ | Type settings slide-in |
| 2 | Mission Type flag + Show in Kanban flag | ✅ | Type settings → OS pills |
| 3 | Multi-role ownership per type | ✅ | Type settings → Advanced accordion |
| 4 | Item hierarchy (parent/depth, max 3 levels) | ✅ | Item detail → sub-items section |
| 5 | Item dependencies | ✅ | Item detail → dependencies section |
| 6 | Comments on items | ✅ | Item detail → comments section |
| 7 | Activity log per item | ✅ | Item detail → activity section |
| 8 | Kanban view (rows by type, columns by stage) | ✅ | `/crm/sitrep/kanban/` |
| 9 | Calendar enhancements (day view, drag-reschedule, overflow) | ✅ | `/crm/sitrep/calendar/` |
| 10 | Booking pages (Calendly rival) | ✅ | `/book/[slug]` + settings |
| 11 | Parent deletion modal (cascade vs. orphan) | ✅ | Item detail delete |
| 12 | Multi-calendar (Work/Personal/Custom, sharing, invites) | ✅ | Calendar sidebar |
| 13 | Settings UI redesign | ✅ | `/crm/settings/sitrep/` |
| 14 | Automations (schema + preview UI) | ✅ | Settings → Automations card |
| 15 | Standalone SitRep PWA | 🔲 Not started | `apps/sitrep-pwa/` |

---

## Architecture Overview

### Routes

```
/crm/sitrep/                     List view — grouped sections (Overdue/Today/This Week/Later/Done)
/crm/sitrep/kanban/              Kanban board — rows by item type, columns by type stage
/crm/sitrep/timeline/            Gantt timeline — horizontal bars, 3 zoom levels
/crm/sitrep/calendar/            Calendar — month/week/day views with multi-calendar sidebar
/crm/sitrep/[id]/                Item detail — full edit, sub-items, deps, comments, activity
/crm/settings/sitrep/            Settings — Item Types, Booking Pages, Public Calendars, Widget, Automations
/book/[slug]                     Public booking page (no auth) — slot picker + form
/calendar-invite/[token]         Public invite accept/decline page (no auth)
```

### Key Files

```
app/crm/sitrep/
  page.tsx                       Server page — fetches items, types, users
  SitRepPanel.tsx                Main list view client component
  _components/SitRepViewToggle.tsx  Shared List/Kanban/Timeline/Calendar tab switcher
  kanban/
    page.tsx                     Server page for kanban
    SitRepKanban.tsx             Kanban board client component
  timeline/
    page.tsx                     Server page for timeline
    SitRepTimeline.tsx           Gantt chart client component
  calendar/
    page.tsx                     Server page — fetches items + seeds calendar types
    CalendarLayout.tsx           Client wrapper: switcher sidebar + calendar
    CalendarSwitcher.tsx         Left sidebar — eye-toggles per calendar type
    SitRepCalendar.tsx           Calendar renderer (month/week/day)
  [id]/
    page.tsx                     Server page for item detail
    SitRepItemClient.tsx         Item detail client component

app/crm/settings/sitrep/
  page.tsx                       Settings server page
  SitRepSettingsPanel.tsx        Settings client component

app/book/[slug]/
  page.tsx                       Public booking server page
  BookingClient.tsx              Slot picker + form client component

app/calendar-invite/[token]/
  page.tsx                       Invite accept server page
  InviteAcceptClient.tsx         Accept/decline UI

app/api/crm/sitrep/
  items/route.ts                 GET/POST items
  items/[id]/route.ts            GET/PATCH/DELETE item
  items/[id]/children/route.ts   GET sub-items
  items/[id]/dependencies/route.ts  GET/POST deps
  items/[id]/dependencies/[dep_id]/route.ts  DELETE dep
  items/[id]/comments/route.ts   GET/POST comments
  items/[id]/comments/[comment_id]/route.ts  PATCH/DELETE comment
  items/[id]/activity/route.ts   GET activity log
  types/route.ts                 GET/POST item types (seeds system types)
  types/[id]/route.ts            PATCH/DELETE item type
  booking-types/route.ts         GET/POST user's booking pages
  booking-types/[id]/route.ts    PATCH/DELETE booking page
  public-calendars/route.ts      GET/POST embeddable iCal tokens
  widget-settings/route.ts       GET/PATCH dashboard widget config

app/api/booking/[slug]/
  availability/route.ts          Public — computes open time slots
  confirm/route.ts               Public — creates person+item+email

app/api/user/
  calendar-types/route.ts        GET/POST user's calendar type buckets
  calendar-types/[id]/route.ts   PATCH/DELETE calendar type
  calendar-types/[typeId]/views/route.ts  GET/POST views within a type
  calendar-views/[id]/route.ts   PATCH/DELETE a view
  calendar-views/[id]/shares/route.ts  GET/POST(invite)/DELETE shares

app/api/calendar-invite/[token]/route.ts  POST accept/decline

lib/email/
  resend.ts                      Base sendEmail() wrapper
  sitrep-booking-confirm.ts      Booking confirmation HTML email

supabase/migrations/
  20260501000000_sitrep_v2.sql   Full v2 schema migration
```

---

## Database Schema — v2 Additions

All v2 tables were applied via `supabase/migrations/20260501000000_sitrep_v2.sql`.

### Columns added to existing tables

**`sitrep_item_types`** — added:
- `stages JSONB DEFAULT '[]'` — pipeline stages array: `[{slug, name, color, is_terminal, sort_order}]`
- `is_mission_type BOOLEAN DEFAULT false` — allows sub-items
- `show_in_kanban BOOLEAN DEFAULT true` — appears as a Kanban row
- `booking_enabled BOOLEAN DEFAULT false` — Director-only toggle to allow public booking pages for this type
- `custom_roles JSONB DEFAULT '[]'` — named assignee roles: `[{slug, name, max}]`

**`sitrep_items`** — added:
- `parent_item_id UUID REFERENCES sitrep_items(id) ON DELETE SET NULL` — hierarchy parent
- `depth INTEGER DEFAULT 0` — 0=root, 1=child, 2=grandchild, 3=great-grandchild (max)
- `reminder_sent_at TIMESTAMPTZ` — prevents duplicate reminder emails

### New tables

**`sitrep_dependencies`** — item blocking relationships
```
from_item_id, to_item_id, dep_type (blocks/precedes/follows/relates_to/duplicates), lag_days
```

**`sitrep_comments`** — per-item threaded comments
```
item_id, author_id, body, edited_at
```

**`sitrep_activity`** — immutable audit trail per item
```
item_id, actor_id, event_type, old_value, new_value
```

**`sitrep_booking_types`** — Calendly-rival booking page configs
```
owner_id, title, slug (globally unique), description, duration_minutes,
buffer_before, buffer_after, available_days INTEGER[], available_start TIME,
available_end TIME, timezone, sitrep_item_type, confirmation_msg, is_active
```

**`sitrep_automations`** — schema only, engine ships v2.5
```
name, trigger_type, trigger_config JSONB, action_type, action_config JSONB, is_active
```

**`user_calendar_types`** — user-scoped calendar buckets (max 5)
```
owner_user_id, name, color, cal_type (work/family/personal/custom),
sources JSONB ([{type:"tenant",tenant_id}|{type:"personal"}]),
delegate_for JSONB, sort_order
```

**`user_calendar_views`** — named filter lenses within a calendar type
```
calendar_type_id, owner_user_id, name, color, filter_config JSONB
({assignee_filter, show_viewer_items, item_type_slugs, stage_slugs, show_terminal}),
is_default, sort_order
```

**`calendar_view_shares`** — who can see a shared view
```
view_id, shared_with_user_id, role (viewer/editor)
```

**`calendar_view_invites`** — pending invite tokens
```
view_id, invited_by, email, role, token (unique hex), status (pending/accepted/declined)
```

---

## How Each Feature Works

### Item Types & Stages

Item types live in `sitrep_item_types`. The system seeds three defaults (Task, Event, Meeting) on first API call if none exist. Each type defines its own `stages` array — these become Kanban columns and the stage selector in item detail.

`sitrep_items.status` stores the current stage slug (string). This is type-agnostic — the same column stores "open", "confirmed", "published", or any custom stage slug. The item type's stages array gives it meaning.

**In the settings panel:** Click any type → slide-in panel with Name, Color, OS pill toggles (Mission Type / Show in Kanban / Enable Booking), drag-reorderable stage rows, and an Advanced Settings accordion for custom roles.

### Item Hierarchy

Any item at `depth < 3` can have sub-items — there is no `is_mission_type` gate on the parent. Sub-items can be any type. The type selector in the "Add sub-item" row defaults to the parent's type but can be changed.

Depth is computed server-side: `depth = parent.depth + 1`. The API enforces max depth 3 with a 400 response.

**Delete behavior:** If an item has children and no `?cascade` or `?orphan` param, the API returns 409 with child count. The client shows a modal: "Delete all N sub-items" → `DELETE ?cascade=true` | "Keep as standalone" → `DELETE ?orphan=true` (sets `parent_item_id = NULL, depth = 0` on children).

### Dependencies

Stored in `sitrep_dependencies` with a `dep_type` enum (blocks, precedes, follows, relates_to, duplicates). Rendered in the item detail page. Padlock icon appears on board rows for blocked items.

### Comments & Activity

Comments are user-editable (own only) and Director-deletable (any). Activity is written server-side on every PATCH — tracks field changes (status, priority, title, assignee, etc.) with old/new values.

### Kanban Board (`/crm/sitrep/kanban/`)

Renders one horizontal section per item type where `show_in_kanban = true`. Each section has columns equal to that type's `stages` array. Items are placed in the column matching their `status` field.

- Row collapse state persists in localStorage
- Dragging a card between columns fires `PATCH /api/crm/sitrep/items/[id]` with `{ status: stageslug }`
- "Show Completed" toggle reveals terminal-stage columns (Done, Cancelled, etc.)
- Cross-type drag is disabled (items stay in their type's row)

### Gantt Timeline (`/crm/sitrep/timeline/`)

Renders items with `start_at` or `due_date` as horizontal bars on a date grid. Pure DOM positioning — no canvas or SVG for the bars themselves, though dependency arrows use SVG.

Three zoom levels controlled by a toggle: Month (12px/day), 2Wk (28px/day), Week (60px/day). Weekend shading appears at ≥24px/day. The label column is `position: sticky; left: 0` within a single scroll container — avoids vertical scroll sync issues.

"Today" button scrolls the container to center today in the viewport.

### Calendar Enhancements

The existing `SitRepCalendar.tsx` was enhanced in place (not rebuilt):
- **Day view** — single-day hourly grid, alongside existing Week and Month views
- **Today button** — jumps the current view to today's date
- **Drag-to-reschedule** — `mousedown` on an event → drag → `mouseup` fires PATCH with new `start_at`/`end_at`. Optimistic update, revert on error.
- **Month view overflow** — "+N more" pill expands inline via a `Set<string>` state tracking which day cells are expanded
- **Past-due tint** — events past their end time render at 50% opacity
- **Priority dots** — `!!` for urgent, `!` for high in the top-right of event pills

### Booking Pages

Any user can create booking pages at `/crm/settings/sitrep/` under "My Booking Pages." Directors can toggle `booking_enabled` on item types to make them available in booking page creation.

**Public flow (`/book/[slug]`):**
1. Server fetches booking type by slug + host name
2. `BookingClient` calls `GET /api/booking/[slug]/availability?days=28` — returns available slots excluding the owner's existing confirmed/open items
3. User picks a slot → fills name/email/notes → `POST /api/booking/[slug]/confirm`
4. Confirm route: matches person by email or creates new `people` row + `tenant_people` link → creates `sitrep_items` row (type = booking type's `sitrep_item_type`) → creates `sitrep_assignments` row (role = attendee) → sends Resend confirmation email
5. Success screen shown; confirmation email arrives

Booking pages and their APIs (`/book/*`, `/api/booking/*`) are fully public — exempted from auth middleware.

### Multi-Calendar System

**Data model:** Two-level.
- **Calendar Type** — defines data source and permission tier. Max 5 per user. Types: work (sources from a tenant), personal, family, custom.
- **Calendar View** — named filter lens within a type. Controls `assignee_filter`, `item_type_slugs`, `stage_slugs`, `show_viewer_items`, `show_terminal`.

**First-use seeding:** On first visit to `/crm/sitrep/calendar/`, the page server-component checks `user_calendar_types` count. If zero, it creates a "Work" type (sourced from current tenant) with a "My Work" default view, and a "Personal" type with a "Private" view.

**CalendarSwitcher sidebar:**
- Grouped by calendar type (collapsible)
- Eye-toggle per type — hides those items from the calendar renderer
- Each view shows a share button (↗) that opens a SharePanel slide-in
- Share panel invites by email → creates `calendar_view_invites` row → sends Resend email with accept link
- "Add Calendar" inline form at the bottom (enforces max 5)

**Item filtering:** `CalendarLayout` passes only items whose source calendar type is currently visible. Work types show tenant `sitrep_items`; toggling all work calendars off clears the calendar.

**Invite accept flow (`/calendar-invite/[token]`):**
- Public page, no auth required
- Shows view name + role + accept/decline buttons
- `POST /api/calendar-invite/[token]` marks invite accepted/declined, creates `calendar_view_shares` row if accepted and user is logged in, shows "Open Calendar" link

### Settings Panel (`/crm/settings/sitrep/`)

Five sections in order:

1. **Item Types** — card grid with color dot, name, mission/system badges. Click → TypeEditorPanel slide-in (name, color picker, OS pills, stage editor, advanced accordion for custom roles).

2. **My Booking Pages** — table of user's booking pages with public URL, duration, item type, active status. "+ New Page" → BookingPagePanel slide-in (title, description, duration presets, day-of-week toggles, time range, timezone, buffer time, confirmation message, active toggle).

3. **Public Calendars** — embeddable iCal tokens for external sharing. Create named calendars that filter by item type and status. Generates iframe embed code + auto-resize script.

4. **Dashboard Widget** — controls what appears on the CRM dashboard SitRep widget (view mode, sort, filter, max items).

5. **Automations** — preview card showing 4 example WHEN→THEN rules, labeled "SOON." Schema exists in `sitrep_automations` table.

### View Switcher

All four views (List, Kanban, Timeline, Calendar) share the same `<SitRepViewToggle />` component from `app/crm/sitrep/_components/SitRepViewToggle.tsx`. Each maps to its own dedicated route:

```
List     → /crm/sitrep
Kanban   → /crm/sitrep/kanban
Timeline → /crm/sitrep/timeline
Calendar → /crm/sitrep/calendar
```

Active state is detected by pathname prefix matching — no search-param ambiguity.

---

## What's Still Left To Do

### High Priority

**Standalone SitRep PWA** — Separate Next.js app in `apps/sitrep-pwa/`, same Railway project. Mobile-first: bottom nav (Today / Calendar / All / + Create), 44px touch targets, bottom sheet modals, swipe gestures (right = done, left = reschedule), PWA manifest + service worker, offline queue. Shares Supabase backend and `lib/` utilities with GroundGame. Target domain: `groundgame.digital/app/sitrep`.

**Automations engine** — Schema exists (`sitrep_automations`). Need the trigger evaluator (cron or DB trigger → check conditions → fire action) and the settings UI to create/edit rules. Planned for v2.5.

**Notification system** — Schema exists (`sitrep_item_notifications`, `sitrep_notification_prefs`). No cron route exists yet. Needs: Railway cron at `/api/cron/sitrep-notifications` that polls items whose notify time has passed and fires Resend emails. Also needs the user-facing notification preferences UI in settings.

### Medium Priority

**Booking: 1-hour reminder emails** — `reminder_sent_at` column exists on `sitrep_items`. Needs a cron route (`/api/cron/sitrep-booking-reminders`) that queries items with `start_at` in the 55–65 minute window and `reminder_sent_at IS NULL`, sends email, sets `reminder_sent_at`.

**Personal items** — The migration added `owner_user_id` to `sitrep_items` for items with no tenant (personal/family calendar items). The DB RLS policy exists. The create flow, API handling, and UI for creating personal items are not wired up yet. Personal items should be creatable from the PWA or from the Personal calendar type on the web.

**Linked records UI** — `sitrep_links` table exists and item detail shows existing links (read-only). The add/remove link flow (record type picker + search modal) is not built.

**Recurring rules UI** — `sitrep_recurring_rules` table and `sitrep_items.recurring_rule_id` FK exist. The "Repeat" toggle in the create/edit modal, frequency picker, and next-occurrence spawning logic on item completion are not built.

**Custom visibility grants UI** — `sitrep_visibility_grants` table exists. Selecting `visibility = 'custom'` saves the value but no user picker exists, making custom-visibility items invisible to everyone except the creator. Needs a user picker when "Custom" is selected.

**Multi-tenant aggregation** — A user who belongs to multiple tenants can create multiple Work calendar types (one per tenant). The CalendarLayout currently filters by whether any Work type is visible but doesn't separate items by source tenant. True cross-tenant merging requires fetching items from each sourced tenant separately and tagging them with their calendar type for color-coding.

**Delegate/secretary mode** — `delegate_for JSONB` column exists on `user_calendar_types`. Setting `assignee_filter` in a view to another user's ID should show that user's items. The API and CalendarLayout filtering for this are not wired.

### Lower Priority / Future

**iCal per-user feed** — A personal `.ics` subscription URL (distinct from the existing tenant-wide public calendar tokens). Subscribable in Google/Apple/Outlook.

**External meeting invites** — `sitrep_assignments.accepted` column exists (always NULL today). Emailed invite link for non-GuerrillaSuite attendees, accept/decline, `.ics` attachment on accept.

**Missions page removal** — `/crm/sitrep/missions/` and `/crm/sitrep/missions/[id]/` still exist from v1. Missions are now items (those whose type has `is_mission_type = true`). The old missions pages/API should be removed once the team confirms nothing depends on them. The migration preserved mission IDs in `sitrep_items` so the data is safe.

**Reminders table cleanup** — The old `reminders` table, `app/crm/reminders/`, and `app/api/crm/reminders/` routes are dead code. Safe to drop after confirming no external references.

**Cross-product ingestion** — LedgerLine bill due dates, payroll runs → `sitrep_items` via DB trigger. `source_product`, `source_record_type`, `source_record_id` columns are already in the schema.

---

## v3 Vision — Standalone Product

When SitRep has enough traction from the PWA and at least three GuerrillaSuite products are feeding into it, it spins out as `sitrep.guerrillasuite.com`:

- Full Google Calendar replacement
- Circles (shared calendar groups, not tied to a GuerrillaSuite tenant)
- Multiple calendars per user (Work / Personal / Family / Campaign)
- Two-way sync with Google Calendar and Microsoft Outlook (OAuth)
- Free standalone tier (personal/family) + team tier (booking + multi-tenant)
- Missions become personal project management too ("Mission: Move Apartments")

**Transition signal:** 3+ active suite products feeding in + inbound demand from non-GroundGame users + users requesting features that don't belong in a CRM.

---

## Naming & Branding

- Full page: **"SitRep"** — never "Tasks," "Calendar," or "Reminders"
- Individual items: **Task**, **Event**, **Meeting** (capitalize, by type name)
- Item containers: **Mission** (capitalize when specific: "Mission: Q2 Canvass")
- Dashboard widget: **"SitRep widget"**
- Overdue items: **"Past Due"**
- Empty state: "All clear. Nothing on the board." — not "No tasks found"

---

## Auth & Tenant Patterns

All CRM-facing SitRep routes use the standard `getTenant()` + `getCrmUser()` pattern:

```ts
const tenant  = await getTenant();   // from host subdomain or NEXT_PUBLIC_TEST_TENANT_ID
const crmUser = await getCrmUser();  // from Supabase session cookie
const sb = createClient(URL, SERVICE_KEY, { global: { headers: { "X-Tenant-Id": tenant.id } } });
```

Public routes (`/book/*`, `/api/booking/*`, `/calendar-invite/*`, `/api/calendar-invite/*`) are exempted in `middleware.ts` — no auth, no tenant check.

User-scoped calendar APIs (`/api/user/*`) use service role without tenant header — `user_calendar_types` is scoped by `owner_user_id`, not `tenant_id`.

---

## Feature Flags

| Flag | Description | Status |
|------|-------------|--------|
| `sitrep_core` | All core SitRep functionality | Required for all views |
| `sitrep_calendar` | Calendar view | On all tiers |
| `sitrep_team` | Assignable tasks, meetings, team calendar | On all tiers |
| `sitrep_missions` | Mission-type items + hierarchy | On all tiers |

Booking, multi-calendar, and timeline are ungated — available if `sitrep_core` is on.
