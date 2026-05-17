# SitRep Calendar Sharing Spec — Codebase Findings
**Date:** 2026-05-07  
**Spec:** sitrep-calendar-sharing-squad-org-spec.md  
**Status:** Pre-implementation review. DO NOT implement until findings are reviewed.

---

## Quick Summary

The spec is directionally correct and the bugs it documents are real. Five critical gaps would cause runtime failures if implemented as written:
1. Migration order is inverted (squad_id FK added before squads table exists)
2. `owner_user_id` column used throughout but never added in migrations
3. Personal items data model conflict with existing records
4. `sort_order` in seed code but missing from `squads` DDL
5. `user_tenants` table assumed to exist — needs verification

The rest of the spec aligns with current code. Details below.

---

## 1. Bug Confirmations (spec is correct)

### Bug 1 — `tenant_id` missing from CRM SELECT
**Status: CONFIRMED**  
`app/crm/sitrep/calendar/page.tsx` — `ITEM_SELECT` string does not include `tenant_id`. The `lib/sitrep-calendar-filter.ts` `!tid` escape hatch at line 111 (`const inSource = sources.length === 0 || !tid || ...`) silently bypasses source matching for these items.

The PWA `apps/sitrep-pwa/app/(pwa)/calendar/page.tsx` already has `tenant_id` in its `CAL_SELECT` — PWA is not affected.

### Bug 2 — `visibility = null` falls through to false
**Status: CONFIRMED in both files**  
`apps/sitrep-pwa/lib/calendar-filter.ts` line 113:
```ts
if (item.visibility === "assignee_only" || !item.visibility) {
  if (!isAssigned(item, userId)) return false;
```
Any item with `visibility = null` (most items) fails this test unless the user is creator/assignee. The spec's fix (`visibility ?? "team"`) is correct.

`lib/sitrep-calendar-filter.ts` has identical logic — same bug.

### Bug 3 — `anySharedVisible` too blunt
**Status: CONFIRMED**  
`app/crm/sitrep/calendar/CalendarLayout.tsx` line 73:
```ts
const anySharedVisible = sharedViews.some((sv) => visibleTypeIds.has(sv.view_id));
```
If any shared view is on, ALL `_source_tenant_id` items appear regardless of which view they belong to. Fixed by the new model removing cross-tenant fetching entirely.

### Bug 4 — PWA shared items injected unconditionally
**Status: CONFIRMED**  
`apps/sitrep-pwa/app/(pwa)/calendar/CalendarLayout.tsx` — `onSharedViewsLoaded` fetches `/api/sitrep/calendar-views/shared/items` and merges results into `items` state before any filtering. Toggle state has no effect on whether these items appear in the calendar.

### Bug 5 — `type_sources` never populated
**Status: CONFIRMED (by inference)**  
PWA `SharedViewData` has `type_sources: CalendarSource[]` (non-optional), but `isItemInSharedView` returns false when `sv.type_sources` is empty (line 125: `if (!inSource) return false`). Items from shared views only appear due to Bug 4's unconditional injection — the filter itself never passes them.

### Bug 6 — Two diverged filter files
**Status: CONFIRMED**  
- `apps/sitrep-pwa/lib/calendar-filter.ts` — PWA version (currently up to date, recently refactored)
- `lib/sitrep-calendar-filter.ts` — CRM version (has `effectiveTenantId()`, `!tid` escape hatch, different `SharedViewData` shape without `type_sources`)

The PWA version is actually cleaner than the CRM version. Use the PWA version as the base for the unified file, not the CRM one.

---

## 2. Critical Spec Gaps (would break implementation)

### Gap 1 — Migration order is inverted (§17)
The spec lists migrations in this order:
```sql
-- 1. Add squad_id to sitrep_items  (references squads(id))
-- 2. Create squads table
```
The FK constraint `ADD COLUMN squad_id UUID REFERENCES squads(id)` will fail because `squads` doesn't exist yet. **Correct order: Create squads → Create squad_members → Then alter sitrep_items.**

### Gap 2 — `owner_user_id` column never added to `sitrep_items`
The spec uses `owner_user_id` in three places:
- `CALENDAR_ITEM_SELECT` includes it as a required field
- Personal items fetch: `.eq("owner_user_id", crmUser.userId)`
- Filter: `item.owner_user_id === userId || item.created_by === userId`

But §17 (Migrations) has no `ALTER TABLE sitrep_items ADD COLUMN owner_user_id`. Selecting a non-existent column in PostgREST fails the entire query.

**Recommendation:** Either (a) add `ALTER TABLE sitrep_items ADD COLUMN owner_user_id UUID REFERENCES auth.users(id)` to migrations and backfill with `created_by`, or (b) remove `owner_user_id` from CALENDAR_ITEM_SELECT and filter — use `created_by` everywhere instead. Option (b) is simpler and `created_by` already serves this purpose.

### Gap 3 — Personal items data model conflicts with existing data
The spec defines "personal" items as:
```
!item.tenant_id && !item.squad_id
```
But ALL existing items in the DB have `tenant_id` set — including private/personal ones. Users create "personal" items today by setting `visibility = 'private'` on items that still have a `tenant_id`.

With the new filter, every existing private item would be invisible in the Personal calendar because `tenant_id` is set, so it falls into the Org branch, and `visibility = 'private'` returns `item.created_by === userId` only if the Org is toggled on.

**Recommendation:** The Personal bucket must also include `visibility === 'private' && created_by === userId` items regardless of `tenant_id`, OR run a data migration to clear `tenant_id` on items where `visibility = 'private'`. A combined `isItemVisible` check like:
```ts
if (item.visibility === 'private') {
  return context.personalOn && (item.created_by === userId);
}
```
applied before the tenant/squad routing would handle existing data correctly.

### Gap 4 — `sort_order` used in seed code, missing from `squads` DDL
`seedDefaultSquads()` in §3.3 sets `sort_order: 0` and `sort_order: 1`, but the `CREATE TABLE squads` DDL in §3.1 has no `sort_order` column. Add `sort_order INTEGER DEFAULT 0` to the DDL.

### Gap 5 — `user_tenants` table existence unverified
§8 says the PWA should "Fetch all tenants the user is a member of via `user_tenants` table." The current PWA `page.tsx` uses `getTenant(user.userId)` which resolves a single tenant from the host or env var — it does not query a `user_tenants` table.

Needs verification: does a `user_tenants`, `tenant_users`, or `tenant_admins` join table exist in Supabase? If not, multi-org support requires a schema addition not currently in the spec.

---

## 3. Where Spec Assumptions Don't Match Current Code

### 3a — "Remove seedCalendarTypes() call" — no such call exists in CRM page.tsx
§15 says to remove `seedCalendarTypes()` from the CRM `page.tsx`. The current CRM page (`app/crm/sitrep/calendar/page.tsx`) doesn't call any seeding function — it just queries `user_calendar_types` directly. Skip this removal step; it's a no-op.

### 3b — CRM CalendarLayout has additional props the spec doesn't account for
Current CRM `CalendarLayout.tsx` accepts `{ missions, users, hasMissions, typeColors }` which are passed through to `SitRepCalendar`. The spec's rewrite instructions for CalendarLayout don't mention these. They're unrelated to calendar sharing but must be preserved in the new implementation — `SitRepCalendar` still needs them.

### 3c — Both `user_calendar_types` and `user_calendar_views` have live data
The spec removes `user_calendar_types` from the data model (replaced by squads + orgs). Users who have configured custom calendar types (Work, Personal, custom) will have that data stranded with no migration path. The spec acknowledges `calendar_view_shares` and `calendar_view_invites` can stay for migration safety, but `user_calendar_types` is the one users actively configured. Suggest: keep the table, add a note that it's deprecated, don't delete it in the initial migration.

### 3d — PWA filter file is the cleaner base
The spec says to consolidate both filter files into a new `sitrep-calendar-filter.ts`. The PWA's `apps/sitrep-pwa/lib/calendar-filter.ts` is already well-structured and was recently refactored — use it as the starting point, not the CRM's `lib/sitrep-calendar-filter.ts` which has the `!tid` escape hatch and `effectiveTenantId()` complexity.

### 3e — CalendarSwitcher type definitions are currently local, not from the filter file
The CRM `CalendarSwitcher.tsx` defines `CalendarTypeData` and `SharedViewData` locally (lines 24-42). The spec assumes a unified import path — the new CalendarSwitcher will need to import new types (`SquadData`, `FavoriteData`, `ViewData`) from the unified filter file. These types aren't yet defined in any shared location.

---

## 4. Reuse Opportunities

Keep these as-is:
- **`DayView`, `WeekView`, `MonthView`** — no changes needed; they consume items and don't know about the filter model
- **`getFamilyByKey` color system** — used throughout, keep all color references
- **`makeAdminSb()` pattern** — identical in both pages, keep
- **`fetchCalItemsByIds` chunking helper** (PWA page.tsx) — reuse for squad item fetching
- **`EyeToggle` component** (CRM CalendarSwitcher line 55) — clean component, extract to shared location for use in new drawer
- **`ViewPill` component** (PWA CalendarLayout line 35) — keep for the view/day/week/month header pills
- **The `S` style constants** — consistent dark-mode palette across all files; keep the pattern

Change but preserve the pattern:
- **`loadVisibleIds` / `saveVisibleIds`** — localStorage logic stays but the ID set changes (org_ids + squad_ids + personal boolean, not calendar type UUIDs). Either adapt or replace with active View state from DB.
- **`ItemBottomSheet.tsx`** — needs a new "Calendar" context selector field per §11, but the rest of the sheet is unchanged

Remove entirely:
- **`SharePanel` component** (CRM CalendarSwitcher) — sharing replaced by Squad invite; the invite flow goes through `/api/sitrep/squads/[id]/members`
- **Pending invites section** (CRM CalendarSwitcher lines 312-361) — `calendar_view_invites` no longer used
- **`onSharedViewsLoaded` function** (PWA CalendarLayout) — entire cross-tenant item fetch pattern gone
- **`anySharedVisible` pattern** (CRM CalendarLayout) — replaced by unified filter

---

## 5. Additional Notes for Implementation

### Filter file location
The spec suggests a shared lib path. Given the repo structure (two separate Next.js apps in a monorepo), the cleanest approach is:
1. Write the canonical copy at `lib/sitrep-calendar-filter.ts` (root lib, used by CRM)
2. Copy it to `apps/sitrep-pwa/lib/sitrep-calendar-filter.ts` with a top comment: `// CANONICAL: lib/sitrep-calendar-filter.ts — keep in sync`
3. Update PWA imports from `@/lib/calendar-filter` → `@/lib/sitrep-calendar-filter`

### Views vs. localStorage
The current model stores hidden calendar IDs in localStorage (`sitrep_cal_hidden`). The new model stores Views in the DB (`sitrep_views`). The "unsaved changes" pattern in §5.3 requires client-side dirty state tracked against the last-saved View. Implementation: keep a `dirtyToggleState` in component state; the DB is only written on explicit Save.

### Spec §9.5 ("What Views do NOT do") vs. existing filter behavior
The spec says Views don't filter items within a visible calendar — "If Work Org is toggled on, all visible items from that Org appear." But the new `filterItems` function in §6.2 DOES apply `ViewFilters` (item_types, statuses, show_completed) on every item. This is a contradiction in the spec: §9.5 says no filtering within visible calendars, but §6.2 and the toggle editor in §9.1 include an entire FILTERS section with item type and status filters. The FILTERS section behavior in §9.1 is the correct intent — §9.5 is poorly worded and should be ignored. The toggle editor filters DO work.

### `sitrep_items.squad_id` column — affects existing queries
Adding `squad_id` to `sitrep_items` means every existing query that does `.select("*")` will start returning it (fine). Queries that include explicit column lists need `squad_id` added. Main affected files:
- `app/crm/sitrep/calendar/page.tsx` (ITEM_SELECT)
- `apps/sitrep-pwa/app/(pwa)/calendar/page.tsx` (CAL_SELECT — already has tenant_id, add squad_id)
- `apps/sitrep-pwa/app/(pwa)/item/[id]/page.tsx` — uses `select("*")`, unaffected
- `app/api/sitrep/items/route.ts` — check what SELECT string it uses

### No migration for existing `user_calendar_views` data
`user_calendar_views` rows (existing user view configs) won't be migrated to `sitrep_views`. Users lose their configured views on upgrade. If this is acceptable for a v1 cutover, note it clearly in the migration plan. If not, a migration script is needed.

---

## 6. Files Not Yet Read (low priority but may affect implementation)

- `app/crm/settings/sitrep/SitRepSettingsPanel.tsx` — too large to fully read. First 100 lines confirm `PublicCalendar` type exists. The spec says to remove/deprecate the Public Calendars section and add Squad management. The existing booking types and widget settings sections should be preserved.
- `apps/sitrep-pwa/components/CalendarSwitcherDrawer.tsx` — referenced in PWA CalendarLayout but not read. Full rewrite per §9, so exact current state matters less than knowing the prop interface. Currently accepts `{ calendarTypes, visibleTypeIds, onToggleType, onTypesChanged, sharedViews, onSharedViewsLoaded }`.
- `app/api/sitrep/calendar-views/shared/route.ts` and `/items/route.ts` — these are the endpoints being deleted. Confirm they exist before removing.

---

## 7. Recommended Implementation Order

1. **DB migrations** (in corrected order): squads → squad_members → alter sitrep_items (squad_id + owner_user_id if needed) → sitrep_favorites → sitrep_views → RLS policies
2. **Unified filter file** — write `lib/sitrep-calendar-filter.ts` using PWA filter as base; copy to PWA
3. **CRM page.tsx** — new data fetch shape (org items + squad items + personal + views)
4. **CRM CalendarLayout** — remove shared view logic, wire new props, keep missions/users passthrough
5. **CRM CalendarSwitcher** — full rewrite (State 1 + State 2 + filters)
6. **PWA page.tsx** — new data fetch shape (verify user_tenants first)
7. **PWA CalendarLayout** — remove onSharedViewsLoaded, wire new props
8. **PWA CalendarSwitcherDrawer** — full rewrite
9. **ItemBottomSheet** — add Calendar context selector
10. **SitRepSettingsPanel** — add Squad management section
