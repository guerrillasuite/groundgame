# SitRep — Calendar Sharing, Org/Squad Model & Views Redesign
## Feature Spec for Claude Code
**Status:** Pre-development planning
**Replaces:** The broken view-sharing model across CRM and PWA
**Touches:** Four CRM pages (calendar/page.tsx, calendar/CalendarLayout.tsx, calendar/CalendarSwitcher.tsx, settings/SitRepSettingsPanel.tsx), two PWA pages (calendar/page.tsx, calendar/CalendarLayout.tsx, calendar/CalendarSwitcherDrawer.tsx), unified filter file, DB schema, CRM shared app shell

**Design goal:** CRM and PWA should feel like the same product. Same visual language, same dark palette, same component shapes. No layout shift when navigating between CRM pages. See §19 for full UI consistency requirements — these apply equally to every file listed above.

---

## 0. Why This Exists — The Bugs We Are Fixing

The current calendar sharing model is broken in opposite directions on each platform and must not be patched — it must be replaced. Do not attempt to fix the old view-sharing system. Build the new model described in this spec. The bugs are documented here so the same mistakes are not repeated.

### Bug 1 — `tenant_id` not selected on CRM items
In `app/crm/sitrep/calendar/page.tsx`, the `sitrep_items` select string does not include `tenant_id`. The filter function `isItemInCalendar` in `sitrep-calendar-filter.ts` calls `effectiveTenantId(item)` which returns `""` when both `_source_tenant_id` and `tenant_id` are absent. An empty string is falsy, so `!tid` evaluates to true, bypassing the source check entirely and producing inconsistent results downstream.

**Fix:** Always include `tenant_id` in every `sitrep_items` select. Never rely on the `!tid` escape hatch — remove it from the new filter.

### Bug 2 — `visibility = null` falls through to false
In both `calendar-filter.ts` (PWA) and `sitrep-calendar-filter.ts` (CRM), items with no `visibility` value fall into the `assignee_only` branch which returns false for non-assigned items. Most items in the DB have `visibility = null`. This causes the CRM calendar to show nothing for own items when calendar types are configured.

**Fix:** Treat `visibility = null` or `undefined` as `team` — visible to all members of the context it belongs to. This is the correct default. Any item explicitly marked private has had that set intentionally.

### Bug 3 — `anySharedVisible` too blunt on CRM
In the CRM `CalendarLayout.tsx`, cross-tenant items are shown if `anySharedVisible` is true — meaning any shared view being toggled on causes ALL cross-tenant items to appear regardless of which view they belong to.

**Fix:** This entire pattern is eliminated. Cross-tenant shared views are replaced by the Squad and Favorites model. There are no cross-tenant item fetches in the new model.

### Bug 4 — PWA shared items injected unconditionally
In the PWA `CalendarLayout.tsx`, `onSharedViewsLoaded` fetches all shared view items and merges them into state before any filtering runs. The toggle state has no effect on whether these items appear.

**Fix:** This entire pattern is eliminated. Shared items in the new model come only from Squad membership, which is fetched server-side and correctly scoped.

### Bug 5 — `type_sources` never populated on PWA shared views
The PWA `SharedViewData` type includes `type_sources` but it is never populated by the `/api/sitrep/calendar-views/shared` endpoint. `isItemInSharedView` always returns false because `sv.type_sources` is always an empty array. Items from shared views bypass the filter entirely via the unconditional state injection in Bug 4.

**Fix:** The `SharedViewData` type and the shared views endpoint are removed. Squad membership replaces this concept entirely.

### Bug 6 — Two diverged filter files
`calendar-filter.ts` (PWA) and `sitrep-calendar-filter.ts` (CRM) started as copies and have diverged. They produce different behavior for the same inputs. There is one source of truth for filter logic and it lives in a shared package or a single shared utility imported by both platforms.

**Fix:** Consolidate into a single `sitrep-calendar-filter.ts` in a location importable by both CRM and PWA. Both platforms use the same filter logic with no divergence.

---

## 1. Terminology — UI vs. Internal

This spec introduces "Org" as the user-facing term for what the codebase calls a "tenant." This is a UI-layer rename only. Do not rename database columns, table names, helper functions (`getTenant`, `makeSb`, `X-Tenant-Id` header), or any internal code references. The full internal rename is a separate future task.

**In all user-facing UI copy:** use "Org"
**In all code, DB, and API:** continue using "tenant", "tenant_id", "tenantId"

This means:
- The calendar switcher labels a Work entry with the Org name, not "tenant"
- Settings pages say "Your Orgs" not "Your Tenants"
- No DB migrations rename any column for this reason alone

---

## 2. The New Model — Complete Overview

### 2.1 What exists after this spec ships

**Your Calendars** — items you own or are assigned to, organized by context:

```
WORK
  [Org A name]   toggle   ← one entry per GS tenant you're a member of
  [Org B name]   toggle

PERSONAL           toggle  ← items with no tenant/squad OR visibility='private', created_by = you

SQUADS
  Household      toggle   ← default Squad 1, auto-created on first login
  The Squad      toggle   ← default Squad 2, auto-created on first login
  [Squad name]   toggle   ← any additional Squads you've created or joined
```

**Favorites** — contacts whose availability you want to see overlaid on your calendar:

```
FAVORITES
  [Contact name]  toggle  ← busy blocks overlay your calendar when on
                            detail level: Busy / Basic / Full (set per contact)
```

**Views** — named presets of toggle states across all of the above:

```
VIEWS (shown first in the drawer)
  Just Me         ● active
  Work Mode
  Home Mode
  Everything
  + New View
```

### 2.2 What is gone

- Custom filtered view sharing — removed entirely
- `user_calendar_views` as a sharing mechanism — removed (table repurposed for Views, see section 6)
- `calendar_view_shares` — no longer used by new UI (table can remain for migration safety but no new rows are written)
- `calendar_view_invites` — no longer used
- The concept of "sharing a view" with another user — replaced by Squad membership and Favorites
- Cross-tenant item fetching in `page.tsx` — removed
- The `SharedViewData` type on the PWA — removed
- The `/api/sitrep/calendar-views/shared` and `/api/sitrep/calendar-views/shared/items` endpoints — removed

### 2.3 What "Shared With Me" means now

There is no "Shared With Me" section in the new drawer. The concept is absorbed:

- Items someone shares with you via a Squad = they appear in that Squad's toggle
- Items someone's availability you want to see = they appear as a Favorite overlay
- Nothing else crosses into your calendar without your explicit action

---

## 3. Squads — New Schema

Squads are a new first-class concept. They are lightweight shared groups — not GuerrillaSuite tenants, not billing entities, not feature-gated. Every user gets them free.

### 3.1 New tables

```sql
CREATE TABLE squads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  created_by      UUID NOT NULL REFERENCES auth.users(id),
  org_id          UUID REFERENCES tenants(id) ON DELETE SET NULL,
  -- org_id is null for standalone Squads, set when Squad is nested under an Org
  color           TEXT NOT NULL DEFAULT 'teal',
  is_default      BOOLEAN DEFAULT false,
  -- is_default = true for the auto-created Household/Family Squad
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE squad_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  squad_id        UUID NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id),
  role            TEXT NOT NULL DEFAULT 'collaborator',
  -- role: owner | collaborator | viewer
  invited_by      UUID REFERENCES auth.users(id),
  joined_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (squad_id, user_id)
);

CREATE INDEX idx_squad_members_user ON squad_members(user_id);
CREATE INDEX idx_squad_members_squad ON squad_members(squad_id);
```

### 3.2 Squad item ownership

`sitrep_items` gains a new nullable column:

```sql
ALTER TABLE sitrep_items ADD COLUMN squad_id UUID REFERENCES squads(id) ON DELETE SET NULL;
CREATE INDEX idx_sitrep_items_squad ON sitrep_items(squad_id);
```

An item belongs to exactly one primary context — either a tenant (Org) OR a Squad OR neither (Personal). This is about where the item was *created and lives*, not about where it can be *seen*. A Squad that is nested under an Org is still a Squad — items created in it have `squad_id` set, not `tenant_id`. The Org membership of a Squad does not change item ownership or visibility rules. The mutual exclusivity of `tenant_id` vs `squad_id` on any single item is enforced at the application layer, not via DB constraint, to keep migrations simple.

| Context | tenant_id | squad_id | created_by | Notes |
|---------|-----------|----------|------------|-------|
| Org item | set | null | set | Lives in an Org, visible to Org members per visibility rules |
| Squad item | null | set | set | Lives in a Squad, visible to Squad members per visibility rules |
| Squad under Org item | null | set | set | Squad is nested under Org but item ownership is still Squad |
| Personal item | null | null | set | No shared context, visible only to creator |

**Note:** There is no `owner_user_id` column on `sitrep_items`. Use `created_by` for all creator/personal ownership checks. Do not add `owner_user_id` — it would duplicate `created_by`.

**Existing data note:** Existing "personal" items (marked `visibility = 'private'`) have `tenant_id` set because they were created inside an Org. The personal filter (§6.2) must handle this by checking `visibility = 'private'` before the tenant/squad routing — not by requiring `tenant_id` to be null.

### 3.3 Squad seeding on first login

When a user logs in for the first time (detected by absence of any `squad_members` row for that user), create two default Squads automatically:

- **Household** — for family/home coordination. Color: teal.
- **The Squad** — for friends/social coordination. Color: indigo.

Both exist immediately so new users can start inviting people to either context without having to create anything first. Two Squads covering the two most common non-work shared calendar use cases.

```typescript
// In the auth callback or first-load server component
async function seedDefaultSquads(userId: string) {
  const existing = await db.from("squad_members")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  
  if ((existing.count ?? 0) > 0) return;

  // Create both default squads in parallel
  const [householdRes, squadRes] = await Promise.all([
    db.from("squads").insert({
      name: "Household",
      created_by: userId,
      color: "teal",
      is_default: true,
      sort_order: 0,
    }).select("id").single(),
    db.from("squads").insert({
      name: "The Squad",
      created_by: userId,
      color: "indigo",
      is_default: true,
      sort_order: 1,
    }).select("id").single(),
  ]);

  const memberInserts = [];
  if (householdRes.data) {
    memberInserts.push({ squad_id: householdRes.data.id, user_id: userId, role: "owner" });
  }
  if (squadRes.data) {
    memberInserts.push({ squad_id: squadRes.data.id, user_id: userId, role: "owner" });
  }
  if (memberInserts.length > 0) {
    await db.from("squad_members").insert(memberInserts);
  }
}
```

### 3.4 Squad → Org nesting

When a user creates an Org (or upgrades a Squad to an Org — future feature), existing Squads can be pulled under it by setting `squads.org_id`. This is an admin action. Nested Squads retain all their members, items, and identity. Nothing is migrated or destroyed.

The Org admin sees nested Squads in their Org settings. Squad members who are not Org members do not gain Org access — Squad and Org membership are independent.

---

## 4. Favorites — New Schema

Favorites are contacts whose busy/free availability you want to overlay on your calendar.

### 4.1 New table

```sql
CREATE TABLE sitrep_favorites (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id   UUID NOT NULL REFERENCES auth.users(id),
  favorite_user_id UUID NOT NULL REFERENCES auth.users(id),
  detail_level    TEXT NOT NULL DEFAULT 'busy',
  -- detail_level: busy | basic | full
  -- busy: time block only, no title or details
  -- basic: title + time + location
  -- full: all item fields
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (owner_user_id, favorite_user_id)
);

CREATE INDEX idx_sitrep_favorites_owner ON sitrep_favorites(owner_user_id);
```

### 4.2 How Favorite overlays work

When a Favorite is toggled on in the calendar switcher:

- Fetch that user's items where `visibility != 'private'` and the Favorite's detail level determines what fields are returned
- Render as overlay blocks on the calendar — visually distinct from own items (muted color, no click-through to full detail unless detail_level = 'full')
- These items are NEVER mixed into the main item list — they only appear on the calendar grid views (Day, Week, Month)
- They do NOT appear in the List view on the PWA — List view always shows only your own items

**API endpoint:**
```
GET /api/sitrep/favorites/[favoriteUserId]/items?from=YYYY-MM-DD&to=YYYY-MM-DD
```

Returns items filtered by detail_level. At `busy` level, returns only `{ id, start_at, end_at, is_all_day }` — no title, no description. At `basic` adds `title, location`. At `full` returns full item shape.

### 4.3 Consent model

Adding someone as a Favorite does NOT automatically make your items visible to them. Visibility is one-directional unless both users add each other as Favorites. There is no notification when someone adds you as a Favorite in v1 — this is intentional and keeps the model simple. Future versions may add a "following" notification.

---

## 5. Views — Repurposed Schema

Views in the new model are named presets of toggle states. They contain no filter logic, no sharing permissions, no foreign keys to calendar types. They are purely a saved UI state.

### 5.1 New table

```sql
CREATE TABLE sitrep_views (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id   UUID NOT NULL REFERENCES auth.users(id),
  name            TEXT NOT NULL,
  toggle_state    JSONB NOT NULL DEFAULT '{}',
  -- toggle_state shape:
  -- {
  --   org_ids: string[],            tenant IDs toggled on
  --   squad_ids: string[],          squad IDs toggled on
  --   personal: boolean,
  --   favorite_ids: string[],       favorite user IDs toggled on
  --   filters: {
  --     item_types: string[],       e.g. ["task","event"] — empty = all types
  --     statuses: string[],         e.g. ["open","in_progress"] — empty = all statuses
  --     show_completed: boolean,    default true
  --   }
  -- }
  is_default      BOOLEAN DEFAULT false,
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sitrep_views_owner ON sitrep_views(owner_user_id);
```

The `filters` object inside `toggle_state` controls which item types and statuses are shown when this View is active. An empty array for `item_types` or `statuses` means "show all" — do not require users to explicitly list every type to get everything. `show_completed` defaults to true; setting it false hides items in terminal stages (done, cancelled) across all visible calendars.

### 5.2 Default Views seeded on first load

When a user has no Views, seed four defaults. The seeding function takes the user's current org IDs and squad IDs as input so it can populate sensible defaults immediately.

```typescript
async function seedDefaultViews(
  userId: string,
  orgIds: string[],
  squadIds: string[], // expects [householdId, theSquadId, ...] in order
) {
  const existing = await db.from("sitrep_views")
    .select("id", { count: "exact", head: true })
    .eq("owner_user_id", userId);

  if ((existing.count ?? 0) > 0) return;

  await db.from("sitrep_views").insert([
    {
      owner_user_id: userId,
      name: "Just Me",
      toggle_state: {
        org_ids: orgIds,
        squad_ids: [],
        personal: true,
        favorite_ids: [],
        filters: { item_types: [], statuses: [], show_completed: true },
      },
      is_default: true,
      sort_order: 0,
    },
    {
      owner_user_id: userId,
      name: "Work Mode",
      toggle_state: {
        org_ids: orgIds,
        squad_ids: [],
        personal: false,
        favorite_ids: [],
        filters: { item_types: [], statuses: [], show_completed: false },
        // show_completed false: hides done items — cleaner for active work view
      },
      is_default: false,
      sort_order: 1,
    },
    {
      owner_user_id: userId,
      name: "Home Mode",
      toggle_state: {
        org_ids: [],
        squad_ids: squadIds, // includes Household and The Squad by default
        personal: true,
        favorite_ids: [],
        filters: { item_types: [], statuses: [], show_completed: true },
      },
      is_default: false,
      sort_order: 2,
    },
    {
      owner_user_id: userId,
      name: "Everything",
      toggle_state: {
        org_ids: orgIds,
        squad_ids: squadIds,
        personal: true,
        favorite_ids: [],
        filters: { item_types: [], statuses: [], show_completed: true },
      },
      is_default: false,
      sort_order: 3,
    },
  ]);
}
```

**Just Me** — your Org(s) and Personal only. No Squads, no Favorites. Filters show all types and statuses including completed. This is the default active View on first load.

**Work Mode** — your Org(s) only. No Squads, no Personal. Hides completed items so only active work items show. Good for a focused work session.

**Home Mode** — your Squads and Personal only. No Org items. All types and statuses visible. Good for evenings and weekends.

**Everything** — all Orgs, all Squads, Personal. All types and statuses. Use deliberately — this is where it gets busy.

Favorite IDs start empty in all seeded Views because the user has no Favorites yet. As they add Favorites, they can manually add them to Views via the toggle editor.

### 5.3 Unsaved changes behavior

When the user adjusts toggles in the editor without saving:

- The calendar updates in real time (toggle state in memory)
- A subtle "Unsaved changes" indicator appears in the drawer header with "Save" and "Revert" buttons
- Switching to a different View discards unsaved changes and applies the new View's toggle state
- Closing the drawer without switching Views preserves the unsaved state until the user navigates away or reloads

---

## 6. The Unified Filter — One File, Both Platforms

Delete both `calendar-filter.ts` and `sitrep-calendar-filter.ts`. Replace with a single file importable by both CRM and PWA. Suggested location: a shared lib path accessible to both apps, or duplicate the file intentionally with a comment marking it as the canonical copy that must be kept in sync.

### 6.1 New item shape requirement

Every fetch of `sitrep_items` MUST include `tenant_id` and `squad_id` in the select string. No exceptions. The filter cannot work correctly without these fields.

```typescript
// Required minimum select for any sitrep_items query feeding the calendar
const CALENDAR_ITEM_SELECT = `
  id, tenant_id, squad_id,
  item_type, title, status, priority,
  due_date, start_at, end_at, is_all_day,
  visibility, created_by,
  sitrep_assignments(user_id, role)
`;
```

`owner_user_id` does NOT exist on `sitrep_items` — use `created_by` for all ownership checks. Do not add it to this select.

### 6.2 New filter logic

```typescript
export type ViewFilters = {
  item_types:      string[];  // empty = all types
  statuses:        string[];  // empty = all statuses
  show_completed:  boolean;   // false hides done/cancelled items
};

export type CalendarContext = {
  orgIds:        string[];  // tenant IDs the user has toggled on
  squadIds:      string[];  // squad IDs the user has toggled on
  personalOn:    boolean;
  favoriteIds:   string[];  // favorite user IDs toggled on (for overlay items only)
  filters:       ViewFilters;
};

export type ItemLike = {
  tenant_id?:          string | null;
  squad_id?:           string | null;
  visibility?:         string | null;
  created_by?:         string | null;
  item_type?:          string | null;
  status?:             string | null;
  sitrep_assignments?: { user_id: string; role: string }[];
};

const TERMINAL_STATUSES = ["done", "cancelled"];

function isAssigned(item: ItemLike, userId: string): boolean {
  return (
    item.created_by === userId ||
    (item.sitrep_assignments ?? []).some((a) => a.user_id === userId)
  );
}

// Resolve effective visibility — NEVER return false for null visibility
function effectiveVisibility(item: ItemLike): string {
  return item.visibility ?? "team"; // null/undefined defaults to team
}

function passesFilters(item: ItemLike, filters: ViewFilters): boolean {
  // Item type filter — empty array means show all
  if (filters.item_types.length > 0 && item.item_type) {
    if (!filters.item_types.includes(item.item_type)) return false;
  }
  // Status filter — empty array means show all
  if (filters.statuses.length > 0 && item.status) {
    if (!filters.statuses.includes(item.status)) return false;
  }
  // show_completed filter — hides terminal status items when false
  if (filters.show_completed === false && item.status) {
    if (TERMINAL_STATUSES.includes(item.status)) return false;
  }
  return true;
}

export function isItemVisible(item: ItemLike, userId: string, context: CalendarContext): boolean {
  const vis = effectiveVisibility(item);

  // Apply View filters first — if item doesn't pass filters it's hidden regardless of context
  if (!passesFilters(item, context.filters)) return false;

  // Private items: always treated as personal regardless of tenant_id.
  // Existing data: items marked visibility='private' may still have tenant_id set (they were
  // created inside an Org but the user marked them private). These belong in the Personal bucket,
  // not the Org bucket.
  if (vis === "private") {
    if (!context.personalOn) return false;
    return item.created_by === userId;
  }

  // Personal item: no tenant, no squad (new personal items going forward)
  if (!item.tenant_id && !item.squad_id) {
    return context.personalOn;
  }

  // Squad item
  if (item.squad_id) {
    if (!context.squadIds.includes(item.squad_id)) return false;
    return true; // team and assignee_only items visible to all squad members
  }

  // Org item
  if (item.tenant_id) {
    if (!context.orgIds.includes(item.tenant_id)) return false;
    if (vis === "assignee_only") return isAssigned(item, userId);
    return true; // team items visible to all org members
  }

  return false;
}

export function filterItems<T extends ItemLike>(
  items: T[],
  userId: string,
  context: CalendarContext,
): T[] {
  return items.filter((item) => isItemVisible(item, userId, context));
}
```

### 6.3 What is removed from the filter

- `isItemInCalendar` — removed
- `isItemInSharedView` — removed
- `matchesFilterConfig` — removed (Views no longer filter items, they only control toggles)
- `SharedViewData` type — removed from filter file
- `CalendarTypeData` type — removed from filter file (no longer needed by filter)
- The `sources` matching logic — removed (items carry their own `tenant_id`/`squad_id`)
- The `!tid` escape hatch — removed and must never be reintroduced

---

## 7. Data Fetching — CRM Calendar Page

Replace the entire `page.tsx` data fetch with the new model. Remove all cross-tenant item fetching. Remove shared views queries.

```typescript
// app/crm/sitrep/calendar/page.tsx — new fetch shape

const [itemsRes, squadItemsRes, userSquadsRes, userFavoritesRes, userViewsRes] = await Promise.all([
  // Own Org items — MUST include tenant_id and squad_id
  sb.from("sitrep_items")
    .select(CALENDAR_ITEM_SELECT)
    .eq("tenant_id", tenant.id)
    .is("squad_id", null)
    .order("start_at", { ascending: true, nullsFirst: false })
    .order("due_date",  { ascending: true, nullsFirst: false })
    .limit(1000),

  // Squad items for all squads this user is a member of
  // Fetch squad IDs first, then items
  // (see implementation note below)

  // User's squads
  sbRaw().from("squad_members")
    .select("squad_id, role, squads(id, name, color, org_id, is_default)")
    .eq("user_id", crmUser.userId),

  // User's favorites
  sbRaw().from("sitrep_favorites")
    .select("id, favorite_user_id, detail_level, sort_order")
    .eq("owner_user_id", crmUser.userId)
    .order("sort_order"),

  // User's saved Views
  sbRaw().from("sitrep_views")
    .select("id, name, toggle_state, is_default, sort_order")
    .eq("owner_user_id", crmUser.userId)
    .order("sort_order"),
]);

// Fetch squad items separately after resolving squad IDs
const squadIds = (userSquadsRes.data ?? []).map((m: any) => m.squad_id);
let squadItems: any[] = [];
if (squadIds.length > 0) {
  const { data } = await sbRaw().from("sitrep_items")
    .select(CALENDAR_ITEM_SELECT)
    .in("squad_id", squadIds)
    .order("start_at", { ascending: true, nullsFirst: false })
    .limit(500);
  squadItems = data ?? [];
}

// Personal items: private items created by this user.
// Includes both items with no tenant (new personal items) AND items with a tenant but
// visibility='private' (existing personal items created inside an Org).
// Fetched in two parts and merged; dedup by id before passing to layout.
const [personalNoTenantRes, personalPrivateRes] = await Promise.all([
  sbRaw().from("sitrep_items")
    .select(CALENDAR_ITEM_SELECT)
    .is("tenant_id", null)
    .is("squad_id", null)
    .eq("created_by", crmUser.userId)
    .limit(500),
  sbRaw().from("sitrep_items")
    .select(CALENDAR_ITEM_SELECT)
    .eq("visibility", "private")
    .eq("created_by", crmUser.userId)
    .limit(500),
]);
const personalSeen = new Set<string>();
const personalItems: any[] = [];
for (const item of [
  ...(personalNoTenantRes.data ?? []),
  ...(personalPrivateRes.data ?? []),
]) {
  if (!personalSeen.has(item.id)) { personalSeen.add(item.id); personalItems.push(item); }
}

const allItems = [
  ...(itemsRes.data ?? []),
  ...squadItems,
  ...(personalItems ?? []),
];
```

The `CalendarLayout` receives `allItems` unfiltered. The `filterItems` function handles all visibility logic client-side based on the active View's toggle state.

---

## 8. Data Fetching — PWA Calendar Page

The PWA calendar page server component follows the same pattern as the CRM page above. Key differences:

- The current PWA `page.tsx` uses `getTenant(user.userId)` to resolve a single tenant from the host/env. Multi-org support requires fetching all tenants the user belongs to.
- **Before implementing:** verify whether a `user_tenants`, `tenant_users`, or `tenant_admins` join table exists in Supabase. If it does not exist, add it to the §17 migrations before using it here. The table needs at minimum `(user_id, tenant_id)` columns.
- Once verified, fetch all tenant IDs the user is a member of, then fetch items from all those tenants in parallel (using the same chunk pattern as `fetchCalItemsByIds`).
- Squad and Personal items fetched identically to CRM.

Remove entirely:
- `onSharedViewsLoaded` function in `CalendarLayout.tsx`
- The shared views `useEffect` in `CalendarSwitcherDrawer.tsx`
- The `fetch("/api/sitrep/calendar-views/shared")` call
- The `fetch("/api/sitrep/calendar-views/shared/items")` call
- The `sharedViews` prop and all references to it

---

## 9. Calendar Switcher UI — Both Platforms

### 9.1 Two-state drawer

The drawer has two states. State is managed in the parent (`CalendarLayout`).

**State 1 — Views list (default):**

```
MY CALENDARS                    ✕

  Just Me              ●        ← active, highlighted row
  Home Mode
  Work Mode  
  Full Picture

  + New View
```

Tapping any View row applies it immediately and closes the drawer. Tapping the active View opens State 2 (the toggle editor) for that View. A dedicated edit icon (✎) on each row also opens State 2.

**State 2 — Toggle editor:**

```
← Just Me                       ✕
   Unsaved changes   Save  Revert   ← only shown when dirty

  WORK
    Crowe Media Org    ●
    Campaign Org       ●

  PERSONAL             ●

  SQUADS
    Household          ●
    The Squad          ○

  FAVORITES
    Wife               ●  Basic ▾
    + Add Favorite

  FILTERS
    Item types:  All ● / Task / Event / Meeting / ...
    Status:      All ● / Open / In Progress / Done / ...
    Hide completed  ○

  ────────────────────────────
  Save as New View    Update View
```

Changes apply to the calendar in real time. Back arrow (←) returns to State 1. If there are unsaved changes, show the "Unsaved changes" indicator with Save and Revert inline.

**Filters section behavior:**

- Item types renders a multi-select pill row using all item types from the tenant's `sitrep_item_types`. "All" is a special pill that clears all specific selections. Selecting specific types deselects "All."
- Status renders the same multi-select pill pattern using all available stage slugs across all visible item types. "All" clears specific selections.
- "Hide completed" is an iOS toggle. When on, it sets `show_completed: false` and overrides any status selections that include terminal stages — completed items simply don't appear regardless of status filter.
- Filter changes apply immediately to the calendar behind the drawer (real-time feedback is important here so users understand what they're doing).

### 9.2 PWA — Views hidden from toggle editor, shown as pills

On the PWA, the drawer shows the Views list in State 1 identically to the CRM. In State 2, Views are not shown — only the toggles. This keeps the mobile experience clean.

Additionally on the PWA, the active View name appears as a pill in the calendar header bar for quick context awareness:

```
☰  Just Me ▾   Day  Week  Month        Today  + New
```

Tapping the pill opens the drawer directly to State 1.

### 9.3 Views — CRM

On the CRM, Views appear as a row of pills above the calendar (not in the sidebar drawer, which is a separate collapsed sidebar). Clicking a View pill applies it. Clicking the active View pill opens the sidebar to the toggle editor for that View.

### 9.4 Favorites in the toggle editor

Each Favorite shows:
- Contact name and avatar/initials
- Toggle (on/off)
- Detail level selector: `Busy ▾` opens a small inline select with Busy / Basic / Full

Adding a Favorite opens a user search modal scoped to people the user shares a Squad or Org with. You can only add someone as a Favorite if you have a shared context with them.

### 9.5 What Views DO and do NOT filter

Views DO apply the FILTERS section — item types, statuses, and "hide completed" — across all visible items, regardless of which Org/Squad they belong to. These filters apply in real time as the user adjusts them in the toggle editor.

Views do NOT grant access to items that the user is not permitted to see. The visibility rules in `isItemVisible` (§6.2) always run first. Toggling an Org on shows Org items subject to those rules — it does not expose private items the user didn't create or `assignee_only` items they aren't assigned to.

---

## 10. New API Endpoints

### Squads

```
GET    /api/sitrep/squads                    ← all squads user is a member of
POST   /api/sitrep/squads                    ← create a squad
GET    /api/sitrep/squads/[id]               ← squad detail
PATCH  /api/sitrep/squads/[id]               ← update name/color
DELETE /api/sitrep/squads/[id]               ← delete (owner only)
GET    /api/sitrep/squads/[id]/members       ← list members
POST   /api/sitrep/squads/[id]/members       ← invite member (by email)
PATCH  /api/sitrep/squads/[id]/members/[uid] ← update role
DELETE /api/sitrep/squads/[id]/members/[uid] ← remove member
```

### Favorites

```
GET    /api/sitrep/favorites                         ← all favorites for current user
POST   /api/sitrep/favorites                         ← add favorite
PATCH  /api/sitrep/favorites/[id]                    ← update detail_level or sort_order
DELETE /api/sitrep/favorites/[id]                    ← remove favorite
GET    /api/sitrep/favorites/[userId]/items          ← fetch that user's items (respects detail_level)
```

### Views

```
GET    /api/sitrep/views                    ← all views for current user
POST   /api/sitrep/views                    ← create view
PATCH  /api/sitrep/views/[id]               ← update name, toggle_state, is_default
DELETE /api/sitrep/views/[id]               ← delete view (cannot delete last view)
```

### Removed endpoints

Delete or deprecate (do not call from any new code):
- `/api/sitrep/calendar-views/shared`
- `/api/sitrep/calendar-views/shared/items`
- `/api/user/calendar-types` (replaced by squads + views)
- `/api/user/calendar-types/[id]`
- `/api/user/calendar-types/[typeId]/views`
- `/api/user/calendar-views/[id]`
- `/api/user/calendar-views/[id]/shares`
- `/api/calendar-invite/[token]`

---

## 11. Item Creation — Context Selector

When creating a new item, the user must be able to set which context it belongs to. The bottom sheet / create modal gains a "Calendar" field:

```
Calendar:  [Work — Crowe Media ▾]

Options:
  Work — Crowe Media Org
  Work — Campaign Org
  Personal
  Family Squad
  Basketball Squad
```

Defaults to the context of the active View. If Just Me is active, defaults to Work (first Org). If a Squad View is active, defaults to that Squad.

Squad items default to `visibility = 'team'` (visible to all squad members). Org items default to `visibility = 'team'`. Personal items are always `visibility = 'private'` regardless of what the user sets.

---

## 12. Squad Settings UI

Add a Squad management section to SitRep settings (`/crm/settings/sitrep/` and PWA settings):

**Section: My Squads**

List of all Squads the user is in, with role badge. Each Squad row expands to show:
- Squad name (editable by owner)
- Color picker (owner only)
- Member list with roles
- Invite by email (owner and collaborators)
- Leave Squad button (non-owners)
- Delete Squad button (owner only, with confirmation)
- If Squad is nested under an Org: show Org name as read-only context

**Create Squad flow:**
- Name (required)
- Color picker (12-color palette from design system)
- Invite members (optional, by email, comma-separated)
- Creates Squad + seeds creator as owner + sends invite emails

---

## 13. Visibility Model — Final Spec

```
private       Items visible only to creator. Never shown to anyone else.
              Used for: personal notes, private reminders.
              Personal items are always private.

just_me       Alias for private in UI copy. Same behavior.

assignee_only Visible to creator + anyone in sitrep_assignments for this item.
              Used for: tasks assigned to specific people.

team          Visible to all members of the item's context (Org or Squad).
              This is the DEFAULT for null/undefined visibility.
              Used for: most shared items.
```

`shareable` is NOT added as a visibility level. Cross-context visibility is handled by Favorites (read-only overlay) and Squad membership (full participation). The two-gate sharing model discussed earlier is deferred to a future spec — it adds meaningful complexity and the Squad + Favorites model covers the primary use cases.

---

## 14. Files to Create

```
lib/
  sitrep-calendar-filter.ts    ← NEW unified filter (replaces both old files)

app/api/sitrep/
  squads/
    route.ts                   ← GET list, POST create
    [id]/
      route.ts                 ← GET, PATCH, DELETE
      members/
        route.ts               ← GET list, POST invite
        [uid]/
          route.ts             ← PATCH role, DELETE member
  favorites/
    route.ts                   ← GET list, POST add
    [id]/
      route.ts                 ← PATCH, DELETE
    [userId]/
      items/
        route.ts               ← GET items at detail level
  views/
    route.ts                   ← GET list, POST create
    [id]/
      route.ts                 ← PATCH, DELETE
```

## 15. Files to Modify

**All six of the following files must be updated in this spec. Do not skip any of them. The bugs documented in section 0 affect all of these surfaces and all must be corrected.**

### CRM — Four pages

```
app/crm/sitrep/calendar/page.tsx
  ← Remove cross-tenant fetching, shared views query
  ← Add squad items fetch, personal items fetch (two-part — see §7), views fetch
  ← Add CALENDAR_ITEM_SELECT constant — must include tenant_id and squad_id (no owner_user_id)
  ← Pass squads, favorites, views as props to CalendarLayout
  ← Call seedDefaultSquads() and seedDefaultViews() on first load
  NOTE: There is no seedCalendarTypes() call in the current file — skip that removal step.

app/crm/sitrep/calendar/CalendarLayout.tsx
  ← Remove SharedViewData, anySharedVisible, cross-tenant filter logic
  ← Accept squads, favorites, views, availableItemTypes as props
  ← Build CalendarContext from active View's toggle_state
  ← Call filterItems() from unified filter — NOT the old filterByVisibleCalendars
  ← Manage active View state, unsaved changes state, dirty flag
  ← PRESERVE existing missions, users, hasMissions, typeColors props — pass them through
    to SitRepCalendar unchanged. These are unrelated to the calendar sharing model.

app/crm/sitrep/calendar/CalendarSwitcher.tsx
  ← Full rewrite per section 9
  ← State 1: Views list
  ← State 2: Toggle editor with WORK / PERSONAL / SQUADS / FAVORITES / FILTERS sections
  ← Filters section: item type multi-select pills, status multi-select pills, hide completed toggle
  ← Unsaved changes indicator with Save and Revert

app/crm/settings/sitrep/SitRepSettingsPanel.tsx
  ← Add Squad management section (section 12)
  ← Remove or deprecate the "Public Calendars" section (replaced by Squad sharing)
  ← Update shared views / calendar sharing UI — these settings no longer exist
```

### PWA — Two pages

```
app/(pwa)/calendar/page.tsx  (or equivalent PWA calendar server page)
  ← Same data fetch changes as CRM page.tsx above
  ← Fetch all tenants user is a member of (via user_tenants) for multi-org support
  ← Fetch squad items, personal items, views
  ← Must include tenant_id and squad_id in CALENDAR_ITEM_SELECT
  ← Call seedDefaultSquads() and seedDefaultViews() on first load
  ← Pass squads, favorites, views, availableItemTypes to CalendarLayout

app/(pwa)/calendar/CalendarLayout.tsx
  ← Remove onSharedViewsLoaded function entirely
  ← Remove sharedViews prop and all references to it
  ← Remove fetch("/api/sitrep/calendar-views/shared") call
  ← Remove fetch("/api/sitrep/calendar-views/shared/items") call
  ← Accept squads, favorites, views, availableItemTypes as props
  ← Build CalendarContext from active View's toggle_state
  ← Call filterItems() from unified filter
  ← Manage active View state, unsaved changes state, dirty flag
  ← Active View name shown as pill in header bar

app/(pwa)/calendar/CalendarSwitcherDrawer.tsx
  ← Full rewrite per section 9
  ← State 1: Views list (same as CRM)
  ← State 2: Toggle editor with WORK / PERSONAL / SQUADS / FAVORITES / FILTERS sections
  ← Views are NOT shown in State 2 on PWA (CRM only)
  ← Filters section identical to CRM version
  ← No shared views section anywhere
```

### Shared — Both platforms

```
lib/sitrep-calendar-filter.ts   (or shared location importable by both CRM and PWA)
  ← Full rewrite per section 6
  ← Exports: filterItems, isItemVisible, CalendarContext, ViewFilters, ItemLike
  ← No exports of old types: CalendarTypeData, SharedViewData, isItemInCalendar,
    isItemInSharedView, matchesFilterConfig, filterByVisibleCalendars
  ← Both CRM and PWA import from this single file
```

**See §20 for the complete pre-implementation checklist.** The checklist there supersedes this one and includes UI consistency requirements from §19.

## 16. Files to Delete

```
lib/calendar-filter.ts          ← replaced by unified sitrep-calendar-filter.ts
lib/sitrep-calendar-filter.ts   ← replaced by unified sitrep-calendar-filter.ts
```

---

## 17. DB Migrations

Run in this exact order — the FK on `sitrep_items.squad_id` depends on `squads` existing first.

```sql
-- 1. Create squads table (must come before sitrep_items alteration)
CREATE TABLE squads ( ... ); -- see section 3.1

-- 2. Create squad_members table
CREATE TABLE squad_members ( ... ); -- see section 3.1

-- 3. Add squad_id to sitrep_items (FK now valid since squads exists)
ALTER TABLE sitrep_items ADD COLUMN squad_id UUID REFERENCES squads(id) ON DELETE SET NULL;
CREATE INDEX idx_sitrep_items_squad ON sitrep_items(squad_id);

-- 4. Create sitrep_favorites table
CREATE TABLE sitrep_favorites ( ... ); -- see section 4.1

-- 5. Create sitrep_views table
CREATE TABLE sitrep_views ( ... ); -- see section 5.1

-- 6. RLS policies
ALTER TABLE squads ENABLE ROW LEVEL SECURITY;
ALTER TABLE squad_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE sitrep_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE sitrep_views ENABLE ROW LEVEL SECURITY;

-- squads: visible to members
CREATE POLICY "squad_members_see_squad" ON squads
  USING (id IN (
    SELECT squad_id FROM squad_members WHERE user_id = auth.uid()
  ));

-- squad_members: visible to members of same squad
CREATE POLICY "squad_members_see_members" ON squad_members
  USING (squad_id IN (
    SELECT squad_id FROM squad_members WHERE user_id = auth.uid()
  ));

-- sitrep_favorites: private to owner
CREATE POLICY "favorites_owner_only" ON sitrep_favorites
  USING (owner_user_id = auth.uid());

-- sitrep_views: private to owner
CREATE POLICY "views_owner_only" ON sitrep_views
  USING (owner_user_id = auth.uid());
```

---

## 18. Out of Scope for This Spec

- **Find a Time** — group scheduling across multiple people's availability. Planned v2.
- **Per-contact per-calendar visibility overrides** — the two-gate shareability model. Planned v2.
- **Squad → Org upgrade flow** — setting `squads.org_id` via a UI upgrade flow. Schema supports it, UI deferred.
- **Squad invite email** — sending Resend emails when inviting someone to a Squad. Use the existing Resend pattern from Dispatch when building this.
- **Favorite overlay rendering** — busy blocks from Favorites shown on calendar grid. Schema and API are in scope; the actual calendar grid rendering of overlay items is in scope only if time allows, otherwise v2.
- **Full internal tenant → org rename** — UI says Org everywhere, code stays as tenant. Full rename is a separate spec.
- **Automations triggered by Squad events** — future feature.

---

## 19. UI Consistency — CRM and PWA Must Feel Like the Same Product

This is a first-class requirement, not an afterthought. Every page touched by this spec must conform to these rules. The CRM currently has a layout-shift problem when navigating between pages (List, Calendar, Settings): the header jumps, content widths change, and the navigation reflows. This spec fixes that.

### 19.1 Shared Design Tokens

Both CRM SitRep pages and the PWA use the same dark-mode palette. The canonical values are:

```typescript
// Use these exact values everywhere in both CRM sitrep and PWA
const S = {
  bg:      "rgb(10 13 20)",        // page background
  surface: "rgb(15 19 28)",        // card/panel background
  card:    "rgb(22 28 40)",        // elevated card surface
  border:  "rgba(255,255,255,.07)",// all dividers and borders
  text:    "rgb(236 240 245)",     // primary text
  dimBrt:  "rgb(148 163 184)",     // secondary text
  dim:     "rgb(100 116 139)",     // muted/placeholder text
} as const;
```

Do not introduce custom one-off color values for backgrounds, borders, or text in any of the files touched by this spec. If a new color is needed, add it to this table and reference it by name. The primary accent is always `var(--gg-primary, #2563eb)`.

### 19.2 CRM SitRep App Shell

The CRM currently renders each SitRep page independently with its own nav/header logic. This causes layout shift when navigating between List, Calendar, and Settings. Fix this by introducing a shared shell layout for the SitRep section of the CRM.

**File to create:** `app/crm/sitrep/layout.tsx`

This is a Next.js route layout that wraps all pages under `app/crm/sitrep/**`. It renders:

1. A fixed-height top bar (48px) with:
   - The SitRep wordmark or logo (left)
   - Primary nav links: **List · Calendar · Settings** (center or left after logo)
   - User context info if needed (right)

2. The `{children}` content area below it, filling the remaining viewport height.

The top bar must have:
- `position: sticky; top: 0; z-index: 40`
- Fixed height of 48px — never let this grow or shrink
- The same `S.bg` background with a `1px solid S.border` bottom border
- `overflow: hidden` on the bar itself so nothing spills out

The nav links use a consistent pill/tab style. The active link is visually indicated. Links do NOT cause a full page reload — use Next.js `<Link>`.

Once this layout exists, each individual SitRep page (`list/page.tsx`, `calendar/page.tsx`, `settings/sitrep/page.tsx`) should remove any duplicate top-bar or nav-bar markup they currently render. The shell provides exactly one top bar; pages provide only content.

**File to update:** `app/crm/sitrep/calendar/CalendarLayout.tsx`

Remove the current outer `height: 100vh` wrapper. The layout shell provides the frame. CalendarLayout should fill the available space below the shell bar, not create its own full-screen container.

### 19.3 PWA Header Consistency

The PWA already has a sticky header in `CalendarLayout.tsx`. This same header pattern should be used across the PWA's main views. The header should always be:
- `position: sticky; top: 0; z-index: 50`
- `paddingTop: max(10px, env(safe-area-inset-top))` (safe area for notched devices)
- `borderBottom: 1px solid rgba(255,255,255,.07)`
- Same `S.bg` background

Do not allow pages to vary the header height or padding. If a page needs more header space (e.g., tab row below the main bar), add it below as a separate sticky element, not by growing the main bar.

### 19.4 Component Visual Language

The following patterns must be consistent across CRM and PWA:

**Buttons**
- Primary action: `background: var(--gg-primary, #2563eb)`, white text, `border-radius: 8px`, `padding: 8px 16px`
- Secondary/ghost: `background: rgba(255,255,255,.05)`, `border: 1px solid rgba(255,255,255,.1)`, `S.dim` text
- Destructive: `background: rgba(239,68,68,.15)`, `border: 1px solid rgba(239,68,68,.3)`, `#fca5a5` text

**Cards / list rows**
- Background: `S.card` (`rgb(22 28 40)`)
- Border: `1px solid S.border`
- Border radius: `10px`
- Hover: `background: rgb(28 34 50)` (slightly lighter)

**Drawers and bottom sheets**
- Background: `S.surface` (`rgb(15 19 28)`)
- Border: `1px solid S.border` on the open edge
- Use `env(safe-area-inset-bottom)` padding on the PWA for home bar clearance

**Section labels**
- ALL CAPS, `font-size: 10px`, `font-weight: 700`, `letter-spacing: 0.07em`, color `S.dim`
- Consistent `padding: 10px 14px 6px` above the first item in each section

**Toggle (eye toggle)**
- The `EyeToggle` component (◉/○) from the CRM CalendarSwitcher is the canonical toggle for all calendar visibility controls on both platforms. Extract it to a shared file rather than duplicating it.

### 19.5 No Layout Shift Checklist

Before marking any CRM page as done, verify:
- [ ] Navigating List → Calendar → Settings → List produces no header jump
- [ ] The top bar stays at exactly 48px across all three pages
- [ ] Content area starts at the same vertical offset on all three pages
- [ ] No page renders its own duplicate nav bar
- [ ] The shared shell layout renders exactly once per navigation

---

## 20. Pre-Implementation Checklist (updated)

**Schema and migrations**
- [ ] Verified `user_tenants`/`tenant_users` join table exists (or added to §17)
- [ ] Migration order is squads → squad_members → alter sitrep_items → favorites → views
- [ ] `squads` table DDL includes `sort_order INTEGER DEFAULT 0`
- [ ] No migration adds `owner_user_id` to `sitrep_items` — use `created_by` throughout

**Filter correctness**
- [ ] `tenant_id` and `squad_id` present in every `sitrep_items` select across all six files
- [ ] `visibility = null` treated as `team` in the unified filter (Bug 2 fix confirmed)
- [ ] `visibility = 'private'` handled before tenant/squad routing (fixes existing personal items)
- [ ] No `anySharedVisible` pattern anywhere (Bug 3 fix confirmed)
- [ ] No `onSharedViewsLoaded` or unconditional shared item injection on PWA (Bug 4 fix confirmed)
- [ ] No `SharedViewData` type referenced anywhere in new code (Bug 5 fix confirmed)
- [ ] Both CRM and PWA import filter from the same single file (Bug 6 fix confirmed)

**Data model**
- [ ] Four default Views seeded on first load on both platforms
- [ ] Two default Squads (Household, The Squad) seeded on first login on both platforms
- [ ] Personal items fetch includes both no-tenant items AND private items with tenant_id

**UI consistency (§19)**
- [ ] `app/crm/sitrep/layout.tsx` shell created with 48px fixed header
- [ ] All CRM SitRep pages remove duplicate nav markup
- [ ] CRM and PWA use identical `S` style constants
- [ ] `EyeToggle` extracted to shared location
- [ ] No layout shift when navigating between CRM List/Calendar/Settings
- [ ] PWA header height is consistent across all views

**Features**
- [ ] Toggle editor shows FILTERS section on both platforms
- [ ] Active View pill shown in PWA header bar
- [ ] "Calendar" context selector added to item create/edit bottom sheet (§11)
