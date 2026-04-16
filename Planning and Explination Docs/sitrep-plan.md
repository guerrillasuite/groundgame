# SitRep — GuerrillaSuite Task, Event & Calendar Layer
## Planning & Architecture Document
**Status:** Pre-development planning (v1 spec)
**Suite:** GuerrillaSuite
**Lives in:** GroundGame (v1) → Standalone product (v3)
**Stack:** Next.js · Supabase (PostgreSQL) · Railway · GitHub

---

## 1. Product Overview

SitRep is GuerrillaSuite's task, event, and calendar engine. It is the connective tissue beneath every time-sensitive action in the suite — follow-up reminders on a contact, a scheduled staff meeting, a to-do list from a manager, a bill due date from LedgerLine, a payroll run from the employer's account, a canvass shift from GroundGame. Everything that has a time or a deadline lives here.

SitRep is not just a task manager and it is not just a calendar. It is the unified operational picture of your time — personal, team, and eventually cross-product.

**v1:** Named Tool inside GroundGame. Widget on the CRM dashboard. Full SitRep page at `/crm/sitrep/`. All five item types ship from day one. GroundGame Shifts surface as read-only calendar items fed from GroundGame's data model. Schema designed for cross-product expansion in v2.

**v2:** Cross-product. LedgerLine bill due dates, payroll schedules, and report delivery feed into SitRep automatically. External meeting invites with accept/decline via link. iCal export so users can subscribe to their SitRep calendar in Google/Apple/Outlook (read-only). In-app notification center. Expanded calendar views.

**v3:** Standalone product at `sitrep.guerrillasuite.com`. Full Google Calendar replacement. Shared circles, multiple calendars, personal/work/family views. Two-way sync with external calendar apps. Free to all users including those outside GuerrillaSuite.

---

## 2. Naming & Branding

**Product name:** SitRep
**Suite:** GuerrillaSuite
**Tagline (working):** *"Know what's happening. Know what's next."*

A sitrep — situation report — is a military briefing on the current state of operations: what happened, what's in progress, what's coming. That's exactly what this product does.

**Voice and copy guidelines for v1 UI:**
- The full page is called **"SitRep"** — never "Tasks," "Calendar," or "Reminders"
- Individual items are called by their type: **Task**, **Event**, **Meeting**, **Mission**, **Shift**
- When referring to a specific Mission, capitalize it: "Mission: Q2 Canvass Push"
- The dashboard widget is the **"SitRep widget"**
- Overdue items are labeled **"Past Due"**
- Empty states: "All clear. Nothing on the board." — not "No tasks found"
- Completion of a task should feel like an ops win — confident, not corporate

---

## 3. Item Type System

SitRep has five item types. Four are owned by SitRep (`task`, `event`, `meeting`, `mission`). One — `shift` — is owned by GroundGame and surfaces in SitRep as a read-only calendar item. All four SitRep-native types share the unified `sitrep_items` table (type-discriminated), except Missions which get their own `sitrep_missions` table. Shifts are read from GroundGame's own table and rendered in SitRep without a row in `sitrep_items`.

### 3.1 Task
A completable to-do item. Atomic — one action, one owner, one due date. No start time. Moves through a status flow. Think: "Call John back by Friday," "Submit expense report," "Review canvass list."

- Has a `status`: `open` → `in_progress` → `done` | `cancelled`
- Has a `due_date` (date only — no time required)
- Has a `priority`: `low` | `normal` | `high` | `urgent`
- Completion is a deliberate action — the user marks it done
- Can be assigned to one user or left as personal (creator only)
- Can belong to a Mission
- Supports per-item notifications
- Supports recurring rules

### 3.2 Event
A time-boxed occurrence on the calendar. Has a start and end datetime. No required attendees. No completion state — it either happened or it didn't. Think: "Phone bank Tuesday 6–8pm," "Voter registration drive Saturday."

- Has `start_at` and `end_at` datetimes
- Supports all-day flag
- No completion state — event is done when its end time passes
- Can have optional attendees (linked users — for awareness, not required participation)
- Can belong to a Mission
- Public or private via the visibility model
- Supports recurring rules
- Supports per-item notifications

### 3.3 Meeting
A structured synchronous gathering with internal participants, an agenda, and post-meeting notes. Requires at least one attendee beyond the creator.

- Has `start_at` and `end_at` datetimes
- Has a required participant list (internal GuerrillaSuite users only in v1)
- Meeting invites in v1 are **internal and indeclinable** — adding a user to a meeting places it on their calendar. No accept/decline flow in v1.
- Has optional `agenda` (pre-meeting text)
- Has optional `meeting_notes` (post-meeting notes, editable after the meeting ends)
- Generates SitRep notifications for all participants automatically
- Can belong to a Mission
- Supports recurring rules

**v2 addition:** External invite links. Non-GuerrillaSuite users receive an email invite with a link to accept/decline and get reminders. No GuerrillaSuite account required for external attendees.

### 3.4 Mission
A named container that groups Tasks, Events, and Meetings under a shared goal. A Mission is not something you check off in one action — it is something you work through. Think: "Mission: Q2 Canvass Push," "Mission: Fundraiser Dinner May 15," "Mission: Volunteer Recruitment Drive."

- Capitalize when referring to a specific one: "Mission: [Name]"
- Has a `status` stage flow: `planning` → `active` → `complete` → `archived`
- Has a `due_date` (the Mission deadline — date only, not a time)
- Has an owner (the user who created it — transferable)
- Any user can create a Mission; visibility rules govern who can see and interact with it
- Items (Tasks, Events, Meetings) belong to a Mission via `mission_id` on `sitrep_items`
- Mission detail page shows all linked items, status, progress bar, and deadline
- Progress is auto-calculated: percentage of linked Tasks in `done` status
- Has optional `description` field
- Supports per-item notifications (fires on Mission `due_date`)
- **Database table:** `sitrep_missions` (not stored in `sitrep_items`)

### 3.5 Shift (GroundGame-owned, SitRep-displayed)
A scheduled field work block created and owned in GroundGame. SitRep reads Shift records from GroundGame's data model and renders them on the calendar as read-only items.

- **Not a row in `sitrep_items`** — lives in GroundGame's own table (to be specced in GroundGame v2)
- Appears in SitRep calendar with distinct visual treatment (separate color and `[GG]` badge)
- Fields displayed in SitRep: shift title, start/end time, location, assigned role, team lead
- Clicking a Shift in SitRep navigates to the GroundGame shift detail page — no SitRep detail page
- Cannot be created, edited, or completed from within SitRep
- Uses `source_product = 'groundgame'` and `source_record_type = 'shift'` — same pattern as cross-product items in v2
- Users only see Shifts they are personally assigned to (pulled by user_id from GroundGame's roster)

---

## 4. Visibility & Assignment Model

Assigned To and Viewable By are two fully separate concepts. They must be modeled and surfaced separately throughout the UI.

### 4.1 Assigned To
Who is responsible for this item.

- **Task:** one assigned user, or unassigned (personal — creator only)
- **Event:** optional attendees (awareness, not responsibility)
- **Meeting:** required participant list — all participants get it on their calendar
- **Mission:** one owner (creator by default, transferable)

Assigning a Task to someone does not automatically change its visibility. A boss can assign a Task to a rep that no one else on the team knows about.

### 4.2 Viewable By
Who can see this item exists. Four levels, set per item at creation, editable by the creator.

| Level | Who Sees It |
|-------|-------------|
| `private` | Creator only. Not visible to anyone else — including the assignee unless they are also the creator. For personal items only the user should know about. |
| `assignee_only` | Creator + assigned user(s) only. Nobody else on the team knows this item exists. |
| `team` | All users in the tenant. Shared to-do lists, public calendar events, team meetings. |
| `custom` | A specific defined list of user UUIDs. A sub-team, a committee, a Mission group. |

**Practical examples:**
- Boss creates a Task, assigns to a rep, visibility = `assignee_only` → only boss and rep see it
- Rep creates a personal Task, visibility = `private` → only the rep sees it, even a Director cannot
- Campaign manager creates a canvass Event, visibility = `team` → whole org sees it on the calendar
- Manager creates a Task for two specific reps with sensitive context, visibility = `custom` → only those two reps and the manager see it
- A user blocks time for a personal appointment, visibility = `private` → shows on their own calendar, invisible to teammates

### 4.3 Who Can Create and Assign

- **Operatives:** Can create private Tasks and Events for themselves. Can create team-visible Events. Cannot assign Tasks to others.
- **Support:** Can create all item types. Can assign Tasks to Operatives in their team. Can create Meetings with attendees. Can create Missions.
- **Directors:** Can create all item types. Can assign Tasks to any user in the tenant. Full visibility into team items.
- **All roles:** Can create Missions with any visibility setting. Visibility rules govern who can interact with the Mission.

Maps to the existing role system (Operative / Support / Director) — no new roles needed in v1.

### 4.4 Mission Visibility and Item Independence
A Mission's visibility controls who can see the Mission itself. Items within a Mission (Tasks, Events, Meetings) maintain their own independent visibility settings — a private Task inside a team-visible Mission stays private. The Mission's visibility does not cascade to its items.

---

## 5. Per-Item Notifications

Every SitRep item supports a per-item notification override, separate from the user's global notification preferences. A user can set a reminder directly on an item at creation time without touching global settings.

### 5.1 How It Works

On the create/edit form, a **"Notify Me"** section appears for all item types:

- Toggle: Notify me for this item (on/off — defaults to on if email is enabled globally)
- If on: time-before picker — value (integer) + unit selector
  - **Tasks** (due date): e.g. 1 day, 2 days, 1 week before due date
  - **Events and Meetings** (start time): e.g. 15 minutes, 30 minutes, 1 hour, 1 day before start
  - **Missions** (deadline): e.g. 1 week, 2 weeks before due date

When a user is added as an assignee or meeting participant, they receive a notification at their global default time unless they open the item and set a custom per-item override.

### 5.2 Notification Priority Order

1. Per-item override (`sitrep_item_notifications`) — always takes precedence for that specific item
2. Global user preference (`sitrep_notification_prefs`) — used when no per-item override exists
3. System default — 24h for tasks, 30 min for events/meetings, when no preference row exists

---

## 6. Data Model

### Migration Note
The existing `reminders` table must be migrated into `sitrep_items` before the old table is dropped. All existing records migrate with `item_type = 'task'` and `visibility = 'assignee_only'` as safe defaults. The existing `reminders.type` values (`callback`, `return_visit`, `opportunity_follow_up`, `opportunity_stale`, `custom`) should be preserved in the `description` field or as a tag so context isn't lost. Note: `reminders.created_by_user_id` is nullable — migration must handle NULL values (use a sentinel or leave created_by NULL on migrated rows and enforce NOT NULL only on new rows). This is a destructive migration requiring a rollback plan. Execute in a single transaction. Coordinate timing and migration script before the table is dropped. **This migration should be the first thing done before any new SitRep development begins.**

### Core Tables

**`sitrep_missions`**
Missions are top-level containers and get their own table to avoid null-heavy rows in `sitrep_items`.

```sql
CREATE TABLE sitrep_missions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     TEXT NOT NULL,
  title         TEXT NOT NULL,
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'planning',
                -- 'planning' | 'active' | 'complete' | 'archived'
  due_date      DATE,
  visibility    TEXT NOT NULL DEFAULT 'team',
                -- 'private' | 'assignee_only' | 'team' | 'custom'
  created_by    UUID NOT NULL REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,
  archived_at   TIMESTAMPTZ
);

CREATE INDEX idx_sitrep_missions_tenant     ON sitrep_missions(tenant_id, status);
CREATE INDEX idx_sitrep_missions_created_by ON sitrep_missions(created_by);
```

**`sitrep_items`**
All SitRep-native items (Task, Event, Meeting) in one unified table, type-discriminated. Missions and Shifts are NOT stored here.

```sql
CREATE TABLE sitrep_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           TEXT NOT NULL,
  item_type           TEXT NOT NULL,
                      -- 'task' | 'event' | 'meeting'
                      -- 'mission' and 'shift' are NOT item_types here
  title               TEXT NOT NULL,
  description         TEXT,

  -- Task fields
  status              TEXT,
                      -- 'open' | 'in_progress' | 'done' | 'cancelled'
                      -- NULL for events and meetings
  priority            TEXT,
                      -- 'low' | 'normal' | 'high' | 'urgent'
                      -- Tasks only; NULL for events and meetings
  due_date            DATE,
                      -- Tasks: due date (date only, no time). NULL for events/meetings.

  -- Event and Meeting fields
  start_at            TIMESTAMPTZ,   -- NULL for tasks
  end_at              TIMESTAMPTZ,   -- NULL for tasks
  is_all_day          BOOLEAN DEFAULT false,

  -- Meeting fields
  agenda              TEXT,
  meeting_notes       TEXT,          -- Editable after meeting ends

  -- Mission relationship
  mission_id        UUID REFERENCES sitrep_missions(id) ON DELETE SET NULL,

  -- Visibility
  visibility          TEXT NOT NULL DEFAULT 'assignee_only',
                      -- 'private' | 'assignee_only' | 'team' | 'custom'
                      -- Always independent of the parent Mission's visibility

  -- Recurring
  is_recurring        BOOLEAN DEFAULT false,
  recurring_rule_id   UUID REFERENCES sitrep_recurring_rules(id) ON DELETE SET NULL,

  -- Cross-product source tracking (used for v2 items pushed from LedgerLine, etc.)
  source_product      TEXT,
                      -- 'groundgame' | 'ledgerline' | 'supplyline' | 'manual'
  source_record_type  TEXT,
                      -- e.g. 'opportunity' | 'invoice' | 'payroll_run' | 'shift'
  source_record_id    UUID,

  -- Authorship
  created_by          UUID NOT NULL REFERENCES auth.users(id),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  completed_at        TIMESTAMPTZ,
  cancelled_at        TIMESTAMPTZ
);

CREATE INDEX idx_sitrep_items_tenant_type     ON sitrep_items(tenant_id, item_type);
CREATE INDEX idx_sitrep_items_tenant_status   ON sitrep_items(tenant_id, status);
CREATE INDEX idx_sitrep_items_due_date        ON sitrep_items(tenant_id, due_date);
CREATE INDEX idx_sitrep_items_start_at        ON sitrep_items(tenant_id, start_at);
CREATE INDEX idx_sitrep_items_mission       ON sitrep_items(mission_id);
CREATE INDEX idx_sitrep_items_created_by      ON sitrep_items(created_by);
```

**`sitrep_assignments`**
One row per assigned user per item. Handles task assignees (single) and meeting participants (multiple) through the same table.

```sql
CREATE TABLE sitrep_assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id     UUID NOT NULL REFERENCES sitrep_items(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id),
  role        TEXT NOT NULL DEFAULT 'assignee',
              -- 'assignee' (tasks) | 'attendee' (events) | 'participant' (meetings) | 'organizer' (meetings)
  accepted    BOOLEAN,
              -- v1: always NULL (meetings are indeclinable in v1)
              -- v2: true/false/null for external invites
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(item_id, user_id)
);

CREATE INDEX idx_sitrep_assignments_user ON sitrep_assignments(user_id, item_id);
CREATE INDEX idx_sitrep_assignments_item ON sitrep_assignments(item_id);
```

**`sitrep_links`**
Polymorphic link table. One item or Mission can link to multiple records across the suite.

```sql
CREATE TABLE sitrep_links (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id         UUID REFERENCES sitrep_items(id) ON DELETE CASCADE,
  mission_id    UUID REFERENCES sitrep_missions(id) ON DELETE CASCADE,
                  -- Exactly one of item_id or mission_id must be set.
  record_type     TEXT NOT NULL,
                  -- 'person' | 'company' | 'opportunity' | 'location' | 'user' |
                  -- 'invoice' | 'payroll_run' | etc.
  record_id       UUID NOT NULL,
  display_label   TEXT,             -- Cached display name at link time for performance
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_sitrep_links_target CHECK (
    (item_id IS NOT NULL AND mission_id IS NULL) OR
    (item_id IS NULL AND mission_id IS NOT NULL)
  )
);

CREATE INDEX idx_sitrep_links_item      ON sitrep_links(item_id);
CREATE INDEX idx_sitrep_links_mission ON sitrep_links(mission_id);
CREATE INDEX idx_sitrep_links_record    ON sitrep_links(record_type, record_id);
```

**`sitrep_visibility_grants`**
Only populated when visibility = `custom`. Defines the explicit user list for that item or Mission.

```sql
CREATE TABLE sitrep_visibility_grants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id       UUID REFERENCES sitrep_items(id) ON DELETE CASCADE,
  mission_id  UUID REFERENCES sitrep_missions(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_sitrep_grants_target CHECK (
    (item_id IS NOT NULL AND mission_id IS NULL) OR
    (item_id IS NULL AND mission_id IS NOT NULL)
  ),
  UNIQUE(item_id, user_id),
  UNIQUE(mission_id, user_id)
);
```

**`sitrep_recurring_rules`**

```sql
CREATE TABLE sitrep_recurring_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       TEXT NOT NULL,
  frequency       TEXT NOT NULL,
                  -- 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'annual'
  interval        INTEGER DEFAULT 1,
                  -- Every N units (e.g. every 2 weeks: frequency='weekly', interval=2)
  days_of_week    TEXT[],       -- For weekly: ['mon', 'wed', 'fri']
  day_of_month    INTEGER,      -- For monthly: 15
  end_date        DATE,         -- NULL = no end
  max_occurrences INTEGER,      -- NULL = no limit
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

**`sitrep_item_notifications`**
Per-item notification overrides. One row per user per item or Mission where a custom reminder is set.

```sql
CREATE TABLE sitrep_item_notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id         UUID REFERENCES sitrep_items(id) ON DELETE CASCADE,
  mission_id    UUID REFERENCES sitrep_missions(id) ON DELETE CASCADE,
                  -- Exactly one of item_id or mission_id must be set.
                  -- Mission notifications fire on mission due_date.
  user_id         UUID NOT NULL REFERENCES auth.users(id),
  notify_enabled  BOOLEAN NOT NULL DEFAULT true,
  notify_value    INTEGER NOT NULL,     -- e.g. 30, 2, 1
  notify_unit     TEXT NOT NULL,        -- 'minutes' | 'hours' | 'days' | 'weeks'
  sent_at         TIMESTAMPTZ,          -- Set when notification fires. Prevents duplicate sends.
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_sitrep_notif_target CHECK (
    (item_id IS NOT NULL AND mission_id IS NULL) OR
    (item_id IS NULL AND mission_id IS NOT NULL)
  ),
  UNIQUE(item_id, user_id),
  UNIQUE(mission_id, user_id)
);

-- Index for the cron job that polls pending notifications
CREATE INDEX idx_sitrep_notif_pending
  ON sitrep_item_notifications(notify_enabled, sent_at)
  WHERE sent_at IS NULL;
```

**`sitrep_notification_prefs`**
Global user preferences. Applied when no per-item override exists.

```sql
CREATE TABLE sitrep_notification_prefs (
  user_id                 UUID NOT NULL REFERENCES auth.users(id),
  tenant_id               TEXT NOT NULL,
  task_due_notify_value   INTEGER DEFAULT 24,
  task_due_notify_unit    TEXT DEFAULT 'hours',
  event_notify_value      INTEGER DEFAULT 30,
  event_notify_unit       TEXT DEFAULT 'minutes',
  overdue_notify          BOOLEAN DEFAULT true,
  assignment_notify       BOOLEAN DEFAULT true,     -- Notify when a Task is assigned to you
  meeting_added_notify    BOOLEAN DEFAULT true,     -- Notify when added to a Meeting
  email_enabled           BOOLEAN DEFAULT true,     -- v1 only; in-app toggle added in v2
  PRIMARY KEY (user_id, tenant_id)
);
```

---

## 7. URL & Route Structure

SitRep v1 lives inside the GroundGame `/crm/` namespace.

```
/crm/sitrep/                        # Main SitRep page — list view, "My Items" default
/crm/sitrep/calendar/               # Calendar view — week/month toggle
/crm/sitrep/missions/             # Missions list
/crm/sitrep/missions/[id]/        # Mission detail — items, progress, status
/crm/sitrep/[id]/                   # Individual item detail / edit
/crm/settings/sitrep/               # Global notification preferences (user-level)
```

The SitRep widget lives on `/crm/` (the main CRM dashboard page).

---

## 8. UI Surfaces — v1

### 8.1 SitRep Widget (Dashboard)

Lives on both `AdminDashboard` and `FieldDashboard` in `app/crm/page.tsx`. Replaces the existing Reminders widget entirely — same `Promise.all` parallel fetch pattern, same position in the layout. The current `/crm/reminders` page is folded into SitRep when this ships and the old route is removed.

**Widget label:** `📋 SitRep`

**Data query:** Items where the current user is creator or assignee, visibility allows access, status is `open` or `in_progress`, ordered by due_date / start_at ASC. Limit 5. GroundGame Shifts pulled separately from GG's shift table by user_id and merged into the sorted list.

**Widget card structure:**
```
📋 SitRep                                    Full SitRep →
──────────────────────────────────────────────────────────
⚠  Call John Martinez back        PAST DUE · Fri Apr 4
▶  Submit weekly canvass report    Today
○  Staff meeting                   Tue Apr 8 · 10am
○  Review Q2 territory map         Thu Apr 10
📅 Saturday Canvass Shift    [GG]  Sat Apr 12 · 8am
```

- `⚠` past due (red) | `▶` in progress (amber) | `○` open (muted) | `📅` event/meeting/shift
- Shifts show a `[GG]` badge; clicking navigates to the GroundGame shift detail page
- Link in top right: **"Full SitRep →"** → `/crm/sitrep/`
- Empty state: "All clear. Nothing on the board."

**Widget placement:**
- AdminDashboard: Replaces the current Reminders widget; before Lists
- FieldDashboard: Replaces the current Reminders widget; before My Lists

### 8.2 SitRep Main Page — `/crm/sitrep/`

**Default view:** List, "My Items" filter active.

**Filter bar:**
- View: My Items | Team Items | All (Directors only)
- Type: All | Tasks | Events | Meetings | Missions
- Status: All | Open | In Progress | Done | Past Due
- Date range picker
- Assigned to (Support and Directors only): user picker

**List item row:**
- Status icon / checkbox (Tasks: checkable inline to mark done)
- Type badge: small pill (Task / Event / Meeting / Mission / Shift)
- Title
- Mission name pill (if item belongs to a Mission — muted)
- Assignee avatar(s)
- Due date or start time
- Priority badge (Tasks only — shown only if `high` or `urgent`)
- Paperclip icon if linked records exist
- Bell icon if a per-item notification is set

**Quick-add bar** at top of list: inline input for fast Task creation — title + due date only. Full modal required for Events, Meetings, and Missions.

**Create item modal — fields by type:**

*All types:*
- Title (required)
- Description
- Linked records (multi-select: persons, companies, opportunities, locations)
- Mission (optional — attach to an existing Mission)
- Visibility (Private / Assignee Only / Team / Custom)
- Notify me: toggle → if on, value + unit picker (minutes / hours / days / weeks before)

*Task-specific:*
- Due date
- Priority (Low / Normal / High / Urgent)
- Assigned to (user picker — Support and Directors only)
- Status (defaults to Open)

*Event-specific:*
- Start date + time
- End date + time
- All-day toggle
- Optional attendees (user picker)

*Meeting-specific:*
- Start date + time
- End date + time
- Participants (user picker — required, at least one beyond creator)
- Agenda (text area)

*Mission-specific:*
- Due date
- Description
- Status (defaults to Planning)

### 8.3 Mission Detail Page — `/crm/sitrep/missions/[id]/`

**Header:** Mission title, status badge (Planning / Active / Complete / Archived), due date, progress bar (% of linked Tasks in `done`), owner name.

**Stage flow controls:** Click-to-advance — Planning → Active → Complete. Archive is a separate secondary action.

**Items list:** All Tasks, Events, and Meetings linked to this Mission. Same row format as the main list. Quick-add bar at top pre-populates `mission_id` for new items created here.

**Linked records panel:** Records linked at the Mission level (the campaign, a location, a company).

### 8.4 Calendar View — `/crm/sitrep/calendar/`

**Week / Month toggle.** Default: week view.

**What appears on the calendar:**
- Events: time block on the grid
- Meetings: time block, visually distinct from Events
- Tasks: pill on their due date column (no time block)
- Shifts: time block sourced from GroundGame, distinct visual treatment

**Color coding (confirm before build):**
- Tasks: slate/neutral
- Events: blue
- Meetings: purple
- Shifts: green (GroundGame brand — confirm)
- Past Due items: red border regardless of type

**Clicking a calendar item:**
- SitRep-native (Task, Event, Meeting): opens item detail slide-over or modal
- Missions do not appear directly on the calendar — their deadline appears as a Task-style pill if the Mission has a due date
- Shifts: navigates to GroundGame shift detail page

**Visibility:** Respects all visibility rules. Private items only show to their creator.

---

## 9. Notification System — v1

v1 notifications are email-based only. In-app notification center is v2.

### Email Notification Triggers

| Trigger | Default Timing | Configurable |
|---------|---------------|-------------|
| Task due soon | Global pref (default 24h) or per-item override | Yes |
| Task past due | Morning of overdue day | Yes — can disable |
| Task assigned to you | Immediate | Yes — can disable |
| Meeting added to your calendar | Immediate | Yes — can disable |
| Meeting starting soon | Global pref (default 30 min) or per-item override | Yes |
| Event starting soon | Global pref (default 30 min) or per-item override | Yes |
| Mission deadline approaching | Per-item override only in v1 | Yes |

Preferences configurable per user at `/crm/settings/sitrep/`.

**Sending mechanism:** A Railway worker (cron-style Next.js API route or standalone script deployed alongside the app) queries `sitrep_item_notifications` where `notify_enabled = true` and `sent_at IS NULL` and fires emails for any items whose calculated fire time has passed. Sets `sent_at` on send to prevent duplicate delivery. **Email provider: Resend** — already configured in `lib/email/resend.ts`. No Supabase Edge Functions exist in this codebase; use Railway.

---

## 10. Feature Gates — v1

SitRep is available on all GroundGame tiers (Scout Kit and above). Not Pro-gated in v1. Tier gating for v2/v3 launches TBD.

Feature flags to add to `@/lib/features.ts` (`ALL_FEATURE_KEYS`, `PLAN_FEATURES`, and `FEATURE_META`):

| Flag | Description | v1 Tier |
|------|-------------|---------|
| `sitrep_core` | Tasks, widget, basic list view | All |
| `sitrep_calendar` | Calendar view (week/month) | All |
| `sitrep_team` | Assignable tasks, meetings with participants, team calendar | All |
| `sitrep_missions` | Missions container and Mission detail page | All |

Add to `PLAN_FEATURES` and `FEATURE_META` in `@/lib/features`.

---

## 11. v2 Roadmap — Cross-Product, External Invites & iCal

v2 is triggered when LedgerLine ships and the suite has two products feeding into the same user's time.

### Cross-Product Item Ingestion
LedgerLine and SupplyLine push items into `sitrep_items` via DB triggers — same pattern as the GroundGame → LedgerLine sale-to-income handoff. The `source_product`, `source_record_type`, and `source_record_id` columns are already in the v1 schema for this reason. Cross-product items are read-only in SitRep — dismissable/snoozable, but edits happen in the source product.

Examples:
- LedgerLine bill due → SitRep Task (`source_product = 'ledgerline'`, `source_record_type = 'recurring_expense'`)
- LedgerLine payroll run → SitRep Event
- LedgerLine scheduled report delivery → SitRep Task
- SupplyLine reorder alert → SitRep Task

### External Meeting Invites (v2)
Non-GuerrillaSuite users can be invited to Meetings via an emailed link. The link allows them to accept or decline and, on acceptance, downloads an `.ics` file for their calendar app. No GuerrillaSuite account required. The `sitrep_assignments.accepted` column is already in the v1 schema — the accept/decline UI ships in v2.

### iCal Export (v2 — confirmed)
SitRep publishes a per-user iCal URL (`.ics` feed) that any calendar app can subscribe to. All of a user's visible SitRep items appear in Google Calendar, Apple Calendar, and Outlook as read-only. Changes in the external app do not sync back. Two-way sync is v3.

### In-App Notification Center (v2)
Notification bell in the CRM header. All SitRep triggers surface here in addition to email. Per-trigger configuration: email only, in-app only, both, or off.

### Expanded Calendar Views (v2)
- Day view added
- Color-coded by product source (GroundGame vs. LedgerLine vs. manual)
- "My Calendar" vs. "Team Calendar" top-level toggle

---

## 12. v3 Vision — Standalone Product

v3 is triggered when the suite has enough interconnected products that a unified time-based view is genuinely valuable as a daily destination — and when demand for SitRep exists from users who do not use GroundGame.

**Standalone URL:** `sitrep.guerrillasuite.com`
**Pricing:** Free to all users, including those with no other GuerrillaSuite products. Modeled after Google Calendar. Free standalone SitRep grows the GuerrillaSuite funnel.

### Core v3 Concepts

**Circles** — Shared calendar groups replacing tenant-scoped visibility. A user belongs to multiple circles: work team, family, campaign. Each circle has its own color. A user without a GuerrillaSuite tenant can still belong to circles.

**Multiple calendars per user** — Work, Personal, Family, Campaign — each with its own color, togglable as layers in one unified view.

**Private calendar** — Fully invisible to anyone else, including teammates and managers.

**Full suite integration** — Every GuerrillaSuite product plugs in as its own togglable calendar layer.

**Two-way external sync** — Full OAuth integration with Google Calendar and Microsoft Outlook. The right place to build this is as a standalone product with dedicated sync infrastructure — not as a feature inside a CRM.

**Missions in v3** — When SitRep is standalone, Missions become the personal project management layer too. "Mission: Move to New Apartment." "Mission: Launch Side Business." The tactical framing works just as well for personal use as it does for field campaigns.

### The Transition Signal
SitRep becomes a standalone product when:
1. At least three active suite products are feeding into it
2. Users are requesting features that don't belong inside a CRM (personal calendars, family circles, two-way external sync)
3. Inbound demand exists from non-GroundGame users who want SitRep independently

Track these signals actively starting in v2.

---

## 13. Open Questions

1. **Notification sending mechanism** — ✅ Resolved: Railway worker using **Resend** (`lib/email/resend.ts`). No Supabase Edge Functions in this codebase. Implement as a Next.js API route hit by a Railway cron, or a standalone worker script.

2. **`reminders` table migration** — Existing records migrate to `sitrep_items` with `item_type = 'task'` and `visibility = 'assignee_only'`. Needs a rollback plan. Coordinate with Claude Code before the old table is dropped. This is the first thing done before any SitRep development begins. Note: `reminders.created_by_user_id` is nullable — handle NULL in migration script.

3. **Meeting accept/decline UI in v1** — ✅ Resolved: Hide entirely until v2. Column exists in schema, UI control does not ship in v1.

4. **Shift visual treatment in calendar** — Confirm color and icon for GroundGame-sourced Shift items before calendar build. Recommend a distinct color with a `[GG]` badge to visually separate from native SitRep items.

5. **GroundGame Shift table spec** — The Shift data model lives in GroundGame, not SitRep. It needs to be specced as part of GroundGame v2. Minimum fields SitRep needs from the Shift record: shift title, start_at, end_at, location, assigned user IDs, team lead name, link back to the GroundGame shift detail URL.

6. **SitRep tier gating for v2/v3** — v1 is available on all GroundGame tiers. Decision noted that v2 or v3 launches may be gated by subscription tier. Flag for pricing discussion before v2 spec begins.

7. **Mission deadline on calendar** — Missions have a due date but no start time. The recommendation is to render a Mission's deadline as a pill on the calendar (like a Task) rather than a time block. Confirm this is the desired behavior before calendar build.
