# GuerrillaSuite — Location System Spec
## For use with Claude Code

---

## 0. Summary

This spec covers the full implementation of a unified location system across GuerrillaSuite. The core deliverable is a reusable `LocationPicker` component that searches the existing `locations` table, falls back to manual address entry when nothing matches, and writes new rows on demand. This component replaces every free-text location field in the system.

Three surfaces are updated in this pass:

1. **SitRep items** — drop two orphan text fields (`location` and `location_address`), add `location_id` FK and `meeting_url` text, wire up the unified location field with smart icon detection
2. **Companies** — already have `location_id` FK but no picker UI; wire up the component
3. **Households** — same as companies

Opportunities already have `opportunity_locations` as a proper junction table with a `role` field and `is_primary` flag. That data model is correct. The same `LocationPicker` component is wired into the opportunity form but with multi-location support.

No external geocoding provider is used for autocomplete in v1. The picker searches the existing `locations` table only. A Geocodio integration for geocoding manually-entered addresses is included (free tier: 2,500 lookups/day, no storage restrictions, permissive terms). Named venue / POI search from an external provider is explicitly out of scope for v1.

---

## 1. Database Changes

### 1.1 Add columns to `sitrep_items`

The `sitrep_items` table currently has `location` (text) and `location_address` (text) as free-text fields. These are dropped and replaced with structured FK + URL fields.

```sql
ALTER TABLE sitrep_items
  ADD COLUMN location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  ADD COLUMN meeting_url TEXT;
```

The existing `location` and `location_address` text columns are dropped. No migration of existing data is needed — confirmed that current data in those fields is not important.

```sql
ALTER TABLE sitrep_items
  DROP COLUMN IF EXISTS location,
  DROP COLUMN IF EXISTS location_address;
```

### 1.2 Add `external_place_id` and `external_place_source` to `locations`

The `locations` table already has `geocode_failed`, `lat`, `lon`, `place_name`, `common_place_name`, `full_address`, `address_line1`, `city`, `state`, `postal_code`, `zip`, `notes`, `tenant_id`, and all political geography columns. It does NOT yet have `external_place_id` or `external_place_source` — add these:

```sql
ALTER TABLE locations
  ADD COLUMN external_place_id TEXT,
  ADD COLUMN external_place_source TEXT; -- enum-style: 'geocodio' | 'manual' | 'import' | future providers
```

`external_place_source` is a plain text column, not a Postgres enum, to avoid painful enum migrations when providers are added later.

### 1.3 Index for location search

The `LocationPicker` search query hits `place_name`, `common_place_name`, and `full_address`. Add a GIN index on a tsvector of those fields to support fast full-text search at scale.

```sql
CREATE INDEX idx_locations_search
  ON locations
  USING GIN (
    to_tsvector(
      'english',
      coalesce(place_name, '') || ' ' ||
      coalesce(common_place_name, '') || ' ' ||
      coalesce(full_address, '') || ' ' ||
      coalesce(address_line1, '') || ' ' ||
      coalesce(city, '') || ' ' ||
      coalesce(state, '')
    )
  );
```

### 1.4 No changes to `companies`, `households`, or `opportunity_locations`

- `companies` already has `location_id UUID` FK — confirmed in DB ✓
- `households` already has `location_id UUID` FK — confirmed in DB ✓
- `opportunity_locations` junction table already has `id`, `tenant_id`, `opportunity_id`, `location_id`, `role`, `is_primary`, `notes`, `created_at`, `updated_at` — confirmed correct ✓
- `opportunities` has `delivery_location TEXT` (free-text, legacy) — leave it, do not drop it

---

## 2. Geocodio Integration

Geocodio is used in one specific case only: when a user manually enters an address via the `LocationPicker` form, the system attempts to geocode it before writing the new `locations` row. This populates `lat`, `lon`, and political geography fields.

**Important:** `lib/geocode.ts` already exists in the codebase. It uses the US Census Geocoder for bulk geocoding of existing locations missing lat/lon. Do NOT modify it. The new `lib/geocodio.ts` is a separate file used only by the LocationPicker's manual-entry flow.

**Geocodio is NOT used for autocomplete.** It is a one-time geocode call at the moment a new location row is written from manual entry.

### 2.1 Environment variable

```
GEOCODIO_API_KEY=your_key_here
```

Add to `.env.local` and Railway environment.

### 2.2 Geocoding utility

Create `lib/geocodio.ts` (new file — does not conflict with existing `lib/geocode.ts`):

```typescript
const GEOCODIO_BASE = 'https://api.geocod.io/v1.7';

export type GeocodioResult = {
  lat: number;
  lon: number;
  congressional_district?: string;
  state_house_district?: string;
  state_senate_district?: string;
  county_name?: string;
  time_zone?: string;
  census_tract?: string;
  zip4?: string;
  formatted_address?: string;
};

export async function geocodeAddress(address: string): Promise<GeocodioResult | null> {
  const key = process.env.GEOCODIO_API_KEY;
  if (!key) {
    console.warn('GEOCODIO_API_KEY not set — skipping geocode');
    return null;
  }

  try {
    const params = new URLSearchParams({
      q: address,
      api_key: key,
      fields: 'cd,stateleg,timezone,census2020',
    });

    const res = await fetch(`${GEOCODIO_BASE}/geocode?${params}`);
    if (!res.ok) return null;

    const data = await res.json();
    const result = data?.results?.[0];
    if (!result) return null;

    const loc = result.location;
    const fields = result.fields ?? {};

    return {
      lat: loc.lat,
      lon: loc.lng,
      formatted_address: result.formatted_address,
      congressional_district: fields.congressional_districts?.[0]?.district_number?.toString(),
      state_house_district: fields.state_legislative_districts?.house?.[0]?.district_number?.toString(),
      state_senate_district: fields.state_legislative_districts?.senate?.[0]?.district_number?.toString(),
      county_name: result.address_components?.county,
      time_zone: fields.timezone?.name,
      census_tract: fields.census?.census_tract,
      zip4: result.address_components?.zip4,
    };
  } catch {
    return null;
  }
}
```

### 2.3 API route for creating a new location from manual entry

Create `app/api/crm/locations/route.ts` (new file at the locations root — distinct from the existing `app/api/crm/locations/create/route.ts` which is used by the import system and must NOT be modified).

This route is specifically for the `LocationPicker` manual entry form. It does NOT deduplicate (the user has already seen the search results and chosen to create a new record). It attempts Geocodio geocoding and writes the full location row.

```typescript
// POST /api/crm/locations
// Body: { address_line1, unit?, city, state, postal_code, place_name? }
// Returns: the new location record { id, place_name, full_address, city, state, ... }

export async function POST(req: NextRequest) {
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);
  const body = await req.json();

  if (!body.address_line1?.trim()) {
    return NextResponse.json({ error: 'address_line1 is required' }, { status: 400 });
  }

  const fullAddress = [
    body.address_line1,
    body.unit,
    body.city,
    body.state,
    body.postal_code,
  ].filter(Boolean).join(', ');

  const geo = await geocodeAddress(fullAddress);

  const { data, error } = await sb
    .from('locations')
    .insert({
      tenant_id: tenant.id,
      address_line1: body.address_line1.trim(),
      unit: body.unit?.trim() ?? null,
      city: body.city?.trim() ?? null,
      state: body.state?.trim() ?? null,
      postal_code: body.postal_code?.trim() ?? null,
      place_name: body.place_name?.trim() ?? null,
      full_address: geo?.formatted_address ?? fullAddress,
      lat: geo?.lat ?? null,
      lon: geo?.lon ?? null,
      congressional_district: geo?.congressional_district ?? null,
      state_house_district: geo?.state_house_district ?? null,
      state_senate_district: geo?.state_senate_district ?? null,
      county_name: geo?.county_name ?? null,
      time_zone: geo?.time_zone ?? null,
      census_tract: geo?.census_tract ?? null,
      zip4: geo?.zip4 ?? null,
      external_place_source: 'manual',
      geocode_failed: geo === null,
      source: 'user_entry',
    })
    .select('id, place_name, full_address, address_line1, city, state, postal_code')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
```

### 2.4 Updating the existing search route for picker use

`app/api/crm/locations/search/route.ts` **already exists** as a paginated list endpoint used by the Locations management page. It returns `{ rows: [{id, address, name, display}], total }` and uses `notes` as the display name field. **Do not remove or break its existing GET behavior.**

Add `?picker=1` mode to the existing GET handler. When `picker=1` is present, skip pagination, include `place_name` and `common_place_name` in the select, search all relevant fields, and return a flat array compatible with `LocationPicker`:

```typescript
// Add this branch inside the existing GET handler:
if (url.searchParams.get('picker') === '1') {
  if (!q || q.length < 2) return NextResponse.json([]);

  const { data } = await sb
    .from('locations')
    .select('id, place_name, common_place_name, full_address, address_line1, city, state, postal_code')
    .eq('tenant_id', tenant.id)
    .or(
      `full_address.ilike.%${q}%,place_name.ilike.%${q}%,` +
      `common_place_name.ilike.%${q}%,address_line1.ilike.%${q}%`
    )
    .limit(10);

  const qLower = q.toLowerCase();
  const ranked = (data ?? []).sort((a: any, b: any) => {
    const score = (r: any) =>
      (r.place_name?.toLowerCase().includes(qLower) ? 2 : 0) +
      (r.common_place_name?.toLowerCase().includes(qLower) ? 1 : 0);
    return score(b) - score(a);
  });

  return NextResponse.json(ranked);
}
// ... existing paginated behavior continues unchanged below
```

The `LocationPicker` calls `/api/crm/locations/search?q=...&picker=1`.

---

## 3. The `LocationPicker` Component

### 3.1 Location and imports

Create `app/components/crm/LocationPicker.tsx`.

This is a client component (`"use client"`). Shared CRM components live in `app/components/crm/` — this is the correct path (not `components/LocationPicker.tsx`).

### 3.2 Props

```typescript
type LocationPickerProps = {
  // Current value — either a location_id (physical) or a URL string (virtual)
  // null means empty
  value: { type: 'location'; locationId: string; displayText: string }
       | { type: 'url'; url: string }
       | null;

  onChange: (
    value: { type: 'location'; locationId: string; displayText: string }
           | { type: 'url'; url: string }
           | null
  ) => void;

  placeholder?: string;

  // compact: single line, used in SitRep item forms
  // full: used in company/household detail panels
  mode?: 'compact' | 'full';

  disabled?: boolean;
};
```

### 3.3 Behavior

**Detection logic:**

When the user begins typing:
- If value starts with `http://` or `https://` → treat as URL, skip search, call `onChange({ type: 'url', url: value })` on blur or Enter
- Otherwise → debounce 250ms, call `GET /api/crm/locations/search?q=...&picker=1`, show dropdown

**Search result shape** (from picker mode): `{ id, place_name, common_place_name, full_address, address_line1, city, state, postal_code }`

**Dropdown states:**
1. Searching — shimmer skeleton rows
2. Results — up to 10 rows; primary: `place_name ?? address_line1`; secondary: `city, state postal_code` in muted text
3. No results — "No locations found" + "Enter address manually →" option that expands the manual entry form inline
4. Empty / not yet typed — no dropdown

**On result selection:**
Close dropdown → display as pill with 📍 pin icon → call `onChange({ type: 'location', locationId: result.id, displayText: place_name ?? address_line1 + ', ' + city + ', ' + state })`

**Manual entry form (fallback):**
Expands inline. Fields:
- Place Name (optional)
- Address Line 1 (required)
- Unit / Suite (optional)
- City (required)
- State (required — 2-letter select with US states)
- ZIP Code (required)

"Save Location" POSTs to `POST /api/crm/locations` (the new route from §2.3). On success calls `onChange` with the new location UUID. If geocode fails, location still saves silently. "Cancel" collapses back to search.

**URL mode:**
No dropdown on `http` input. On blur/Enter commit as `{ type: 'url', url }`. Display with 🔗 icon.

**Clear button:**
`×` button when value is set. Calls `onChange(null)`, resets to empty.

**Keyboard navigation:**
- `↓` / `↑` — move through results
- `Enter` — select highlighted
- `Escape` — close dropdown

### 3.4 Visual design

Follow `VisualGuide.md` tokens exactly. Key specifics:

Input: standard `inputStyle` with `focusInput`/`blurInput` handlers.

Dropdown: glass card (`rgba(20,25,38,.97)`, `border: 1px solid rgba(255,255,255,.1)`, `borderRadius: 10`, `boxShadow: 0 8px 32px rgba(0,0,0,.45)`), positioned absolutely below input, `zIndex: 50`.

Result row:
```
padding: "10px 14px"
borderBottom: "1px solid rgba(255,255,255,.06)"
cursor: "pointer"
hover background: "rgba(255,255,255,.05)"
```

Primary text: `fontSize: 14, fontWeight: 500, color: S.text`
Secondary text: `fontSize: 12, color: S.dim, marginTop: 2`

Selected location pill:
```
display: inline-flex, alignItems: center, gap: 6
padding: "6px 12px", borderRadius: 8
background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)"
fontSize: 13, color: S.text
```

Icon (📍 physical, 🔗 URL) at `fontSize: 14` left. `×` at `fontSize: 16, color: S.dim` right.

Manual entry form: standard `inputStyle` inputs, `labelStyle` labels, primary gradient button for Save.

---

## 4. SitRep Items — Unified Location Field

### 4.1 What changes in `SitRepItemClient.tsx`

The `FullItem` type currently has `location: string | null` and `location_address: string | null`. Replace both with:

```typescript
location_id: string | null;
meeting_url: string | null;
location_display: string | null; // derived at fetch time, not stored
```

The two state variables `location` and `locationAddr` are replaced by:

```typescript
const [locationValue, setLocationValue] = useState<
  | { type: 'location'; locationId: string; displayText: string }
  | { type: 'url'; url: string }
  | null
>(
  item.location_id
    ? { type: 'location', locationId: item.location_id, displayText: item.location_display ?? '' }
    : item.meeting_url
    ? { type: 'url', url: item.meeting_url }
    : null
);
```

The two separate text inputs (lines ~677–685) are replaced with a single `<LocationPicker>` in compact mode.

**On save:** `locationValue` change triggers PATCH with:
```typescript
{
  location_id: locationValue?.type === 'location' ? locationValue.locationId : null,
  meeting_url: locationValue?.type === 'url' ? locationValue.url : null,
}
```
Both fields are always sent together to keep them in sync.

### 4.2 Display in list and widget views

The `SitRepItem` type in `SitRepPanel.tsx` currently has `location` and `location_address`. Replace with `location_id`, `meeting_url`, and `location_display`. Update list rows and the create form default state accordingly (remove `location: null, location_address: null` from the create defaults).

Wherever a SitRep item's location is displayed, use this helper:

```typescript
function LocationDisplay({ locationId, meetingUrl, locationDisplay }: {
  locationId: string | null;
  meetingUrl: string | null;
  locationDisplay: string | null;
}) {
  if (meetingUrl) {
    return (
      <a href={meetingUrl} target="_blank" rel="noopener noreferrer"
        style={{ color: S.dimBright, fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
        🔗 <span>{meetingUrl}</span>
      </a>
    );
  }
  if (locationId && locationDisplay) {
    return (
      <span style={{ color: S.dimBright, fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
        📍 <span>{locationDisplay}</span>
      </span>
    );
  }
  return null;
}
```

Apply in: `SitRepPanel.tsx` list rows, `SitRepCalendar.tsx` event pills.

### 4.3 API changes

**`app/api/crm/sitrep/items/[id]/route.ts`:**

The `PATCHABLE` array currently includes `"location"` and `"location_address"`. After the DB columns are dropped, replace both with `"location_id"` and `"meeting_url"`:

```typescript
const PATCHABLE = [
  "title", "description", "status", "priority", "due_date",
  "start_at", "end_at", "is_all_day", "agenda", "meeting_notes",
  "mission_id", "visibility", "location_id", "meeting_url",   // ← updated
  "parent_item_id",
] as const;
```

Also add mutual exclusivity enforcement: if both `location_id` and `meeting_url` arrive, prefer `location_id` and set `meeting_url` to null:

```typescript
if (body.location_id && body.meeting_url) {
  patch.meeting_url = null;
}
```

**`app/api/crm/sitrep/items/route.ts` (GET list):**

Add location join to the select string and derive `location_display` before returning:

```typescript
.select(`
  id, tenant_id, item_type, title, description,
  status, priority, due_date,
  start_at, end_at, is_all_day,
  agenda, meeting_notes,
  mission_id, parent_item_id, depth,
  visibility, owner_user_id,
  is_recurring,
  location_id, meeting_url,
  location:locations(place_name, full_address, address_line1, city, state),
  source_product, source_record_type, source_record_id,
  created_by, created_at, updated_at, completed_at, cancelled_at,
  sitrep_assignments(user_id, role)
`)
```

Then map items to include `location_display`:

```typescript
items = items.map((item: any) => {
  const loc = item.location;
  const location_display = loc
    ? (loc.place_name ?? loc.address_line1 ?? loc.full_address ?? null) +
      (loc.city ? `, ${loc.city}` : '') +
      (loc.state ? `, ${loc.state}` : '')
    : null;
  return { ...item, location_display, location: undefined };
});
```

**`app/api/crm/sitrep/items/[id]/route.ts` (GET single):**

Same join and `location_display` derivation pattern.

---

## 5. Companies — Location Picker

### 5.1 Where the picker appears

`app/crm/companies/[id]/page.tsx` is a **server component**. It already fetches `company.location_id` and displays the formatted address as a read-only field. The `LocationPicker` is a client component and cannot be used directly in a server component.

Introduce a small `"use client"` component `app/crm/companies/[id]/CompanyLocationPicker.tsx` that:
- Accepts `locationId: string | null` and `displayText: string` as props (serializable)
- Renders `<LocationPicker>` in full mode
- On `onChange`, PATCHes the company record via `fetch('/api/crm/companies/[id]', { method: 'PATCH', body: { location_id } })` or calls a server action

The server component passes `locationId` and the pre-resolved `displayText` (from the already-fetched location join) as props to this client wrapper.

### 5.2 Save behavior

PATCH to the company update endpoint with `{ location_id: string | null }`. The company update endpoint already accepts field updates — verify `location_id` is in the allowed fields list and add it if not.

### 5.3 Display

The server component already fetches and displays the linked location address. After the picker is wired in, this display is handled by the client component (which shows the pill when a location is selected).

---

## 6. Households — Location Picker

Same pattern as companies.

`app/crm/households/[id]/page.tsx` is a server component. `app/crm/households/_actions.ts` contains server actions for household mutations — add an `updateHouseholdLocation(householdId, locationId)` server action there.

Introduce `app/crm/households/[id]/HouseholdLocationPicker.tsx` (client component) that calls the server action on change.

Households represent a physical residence — URL mode in the picker is technically available (same component) but is not a concern to block.

---

## 7. Opportunities — Location Picker (Multi-Location)

Opportunities use the `opportunity_locations` junction table. This is the correct data model — no DB changes needed.

The `opportunities.delivery_location` text column is not dropped in this pass — leave it, stop writing to it.

### 7.1 Multi-location UI

In the opportunity detail/edit form, the location section shows:

```
Locations
[+ Add Location]

📍 The Woodlands Community Center, 2535 Lake Woodlands Dr    [Primary] [×]
📍 Montgomery County Fairgrounds, Conroe TX                              [×]
```

Each linked location: display text, remove button, "Primary" badge on `is_primary` row. Clicking a non-primary row promotes it (sets `is_primary = true`, others `false`).

The `role` field is not exposed in v1 — defaults to `service_at`. "+" opens `LocationPicker` in a small inline panel.

### 7.2 API routes

All new files — the `[id]` directory already exists (it has `custom-fields/route.ts`):

**`GET /api/crm/opportunities/[id]/locations`** — return all `opportunity_locations` rows joined with location display fields.

**`POST /api/crm/opportunities/[id]/locations`**:
```typescript
// body: { location_id: string, is_primary?: boolean }
// If is_primary true: set all existing rows to is_primary=false first
// Default is_primary to true if this is the first location, false otherwise
// role defaults to 'service_at'
```

**`DELETE /api/crm/opportunities/[id]/locations/[location_id]`** — remove the `opportunity_locations` row.

**`PATCH /api/crm/opportunities/[id]/locations/[location_id]`** — update `is_primary` (promote to primary, demotes others).

---

## 8. File Structure

**New files:**
```
lib/
  geocodio.ts                          # NEW — Geocodio utility (separate from existing lib/geocode.ts)

app/
  components/crm/
    LocationPicker.tsx                 # NEW — reusable picker component

  api/
    crm/
      locations/
        route.ts                       # NEW — POST: create location from manual entry (LocationPicker form)
                                       #       DO NOT touch create/route.ts (import system, uses findOrCreateLocation)
      opportunities/
        [id]/
          locations/
            route.ts                   # NEW — GET (list), POST (add)
            [location_id]/
              route.ts                 # NEW — DELETE, PATCH (promote primary)

  crm/
    companies/
      [id]/
        CompanyLocationPicker.tsx      # NEW — "use client" wrapper for server component page

    households/
      [id]/
        HouseholdLocationPicker.tsx    # NEW — "use client" wrapper for server component page
```

**Modified files:**
```
app/
  api/
    crm/
      locations/
        search/route.ts                # MODIFY — add ?picker=1 mode to existing GET handler
                                       #           (preserve existing paginated behavior unchanged)
      sitrep/
        items/
          route.ts                     # MODIFY — add location join + location_display to GET
          [id]/route.ts                # MODIFY — swap location/location_address → location_id/meeting_url
                                       #           in PATCHABLE; add mutual exclusivity check; add join to GET

  crm/
    sitrep/
      [id]/SitRepItemClient.tsx        # MODIFY — replace two text inputs with LocationPicker
      SitRepPanel.tsx                  # MODIFY — update item type, remove location/location_address
                                       #           from create defaults, update list row display
      calendar/SitRepCalendar.tsx      # MODIFY — update location display in event pills

    companies/
      [id]/page.tsx                    # MODIFY — pass locationId + displayText to CompanyLocationPicker

    households/
      [id]/page.tsx                    # MODIFY — pass locationId + displayText to HouseholdLocationPicker
      _actions.ts                      # MODIFY — add updateHouseholdLocation server action
```

---

## 9. Migration SQL (Full, Run in Order)

```sql
-- 1. Add external provider columns to locations
ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS external_place_id TEXT,
  ADD COLUMN IF NOT EXISTS external_place_source TEXT;

-- 2. Add location columns to sitrep_items
ALTER TABLE sitrep_items
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS meeting_url TEXT;

-- 3. Drop orphan text columns from sitrep_items (data confirmed disposable)
ALTER TABLE sitrep_items
  DROP COLUMN IF EXISTS location,
  DROP COLUMN IF EXISTS location_address;

-- 4. Add search index on locations
CREATE INDEX IF NOT EXISTS idx_locations_search
  ON locations
  USING GIN (
    to_tsvector(
      'english',
      coalesce(place_name, '') || ' ' ||
      coalesce(common_place_name, '') || ' ' ||
      coalesce(full_address, '') || ' ' ||
      coalesce(address_line1, '') || ' ' ||
      coalesce(city, '') || ' ' ||
      coalesce(state, '')
    )
  );

-- 5. Index on location_id for sitrep_items lookups
CREATE INDEX IF NOT EXISTS idx_sitrep_items_location_id
  ON sitrep_items(location_id)
  WHERE location_id IS NOT NULL;
```

---

## 10. Important Patterns to Follow

- **Always use `getTenant()` and `makeSb(tenantId)`** in all location API routes — locations are tenant-scoped (`locations.tenant_id`)
- **`LocationPicker` is a client component** — never import it into server components directly; pass serializable props (locationId string, displayText string) from server components into a thin `"use client"` wrapper
- **Never write both `location_id` and `meeting_url`** on the same sitrep item — the API enforces mutual exclusivity, the component enforces it, and the display logic assumes it
- **Geocoding is best-effort** — a failed geocode never blocks saving a location row; `geocode_failed = true` is set silently and the row is written with null coordinates
- **Do NOT modify `app/api/crm/locations/create/route.ts`** — it is used by the import system via `findOrCreateLocation` and has different semantics (deduplication, 409 on existing). The LocationPicker uses the new `POST /api/crm/locations` route instead
- **Do NOT modify `lib/geocode.ts`** — it is the US Census Geocoder used for bulk lat/lon backfill. The new `lib/geocodio.ts` is a separate file for user-entered addresses via the LocationPicker
- **The existing `/api/crm/locations/search` GET handler must remain backward-compatible** — the paginated `{ rows, total }` format is used by the Locations management page. Only add the `?picker=1` mode alongside existing behavior
- **`location_display` is derived at fetch time** — never store it; always join `locations` and derive the display string in the API response
- **The `delivery_location` text column on `opportunities` is not dropped** — leave it, stop writing to it
- **Match VisualGuide.md exactly** — `LocationPicker` uses `S` tokens, `inputStyle`, `focusInput`/`blurInput`, glass card dropdown, primary gradient button for manual entry Save
- **Keyboard navigation is required** — the picker must be fully keyboard-navigable
- **The `locations` table uses both `zip` and `postal_code` columns** — the canvassing import uses `zip`; the LocationPicker manual entry form and `findOrCreateLocation` use `postal_code`. Use `postal_code` consistently in new code
- **The `locations` table has a `geom` PostGIS geometry column** — do not attempt to write to it from application code; it is populated by a separate spatial processing step

---

## 11. What Is Explicitly Out of Scope

- ❌ No external autocomplete or POI search in v1 — picker searches the existing `locations` table only
- ❌ No map display — locations are text/link only in this pass
- ❌ No bulk geocoding of existing location rows with null coordinates — separate background job, not part of this spec
- ❌ No `people` table location changes — people link to locations via `households.location_id`
- ❌ No changes to FieldRecon, canvassing routes, or territory management
- ❌ No `role` picker on opportunity locations in v1 — defaults to `service_at`
- ❌ No deletion of `opportunities.delivery_location` column in this pass
- ❌ No changes to `app/api/crm/locations/create/route.ts` or `lib/geocode.ts`
