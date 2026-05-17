# GuerrillaSuite — Custom Fields
## Feature Spec for Claude Code

---

## 0. Feature Identity

**Feature name:** Custom Fields
**Scope:** CRM-wide — People, Companies, Households, Locations (settings page) + Opportunities (pipeline type editor) + SitRep Items (SitRep type editor)
**Settings page:** `/crm/settings/custom-fields`
**Feature key:** No new feature gate needed — available to all tenants with CRM access

---

## 0.5 Current Implementation State (as of 2026-05-16)

This spec is a forward-looking design doc. Not everything in it is built yet. Before implementing any section, check this table:

| Area | Status | Notes |
|---|---|---|
| `opportunities.custom_fields` JSONB column | ✅ **Exists** | Migration `20260516000000_opportunities_custom_fields.sql` |
| Survey builder → opportunities custom field mapping | ✅ **Exists** | Freeform key input in `CrmFieldPicker`; stores `opportunities.custom_fields.<key>` in `crm_field` |
| `panel-submit` writing to `opportunities.custom_fields` | ✅ **Exists** | Merges via JS spread before UPDATE |
| Opportunity detail page displaying `custom_fields` | ✅ **Exists** | Read-only display in Details card; keys humanized |
| `custom_field_definitions` table | ❌ **Not built** | Entire Section 2.1 schema is planned, not deployed |
| Settings page `/crm/settings/custom-fields` | ❌ **Not built** | |
| `tenant_people.custom_data` | ✅ **Exists** (pre-existing) | Not yet wired to survey builder or detail pages |
| `tenant_companies.custom_data` | ✅ **Exists** (pre-existing) | Not yet wired |
| `households.custom_data` | ❌ **Not built** | Needs migration |
| `locations.custom_data` | ❌ **Not built** | Needs migration |
| `sitrep_items.custom_fields` | ❌ **Not built** | Needs migration |
| Automations exposing custom field vars | ❌ **Gap** | `buildNormalizedPayload` does not expose `custom_fields` values as `{{vars}}`; see Section 11 |
| Import mapper integration | ❌ **Not built** | |
| Filter builder integration | ❌ **Not built** | |

---

## 1. The Core Model

Custom fields allow Directors to extend the built-in fields on any record type with tenant-defined fields. Values are stored in an existing or new JSONB column on each record type. Field definitions live in a new `custom_field_definitions` table.

### 1.1 Storage Columns

Most JSONB columns already exist. Two need migrations:

| Record Type | Storage Column | Table | Status |
|---|---|---|---|
| People | `custom_data` | `tenant_people` | ✅ Already exists |
| Companies | `custom_data` | `tenant_companies` | ✅ Already exists |
| Opportunities | `custom_fields` | `opportunities` | ✅ Added via migration `20260516000000_opportunities_custom_fields.sql` |
| Households | `custom_data` | `households` | ❌ Needs migration |
| Locations | `custom_data` | `locations` | ❌ Needs migration |
| SitRep Items | `custom_fields` | `sitrep_items` | ❌ Needs migration |

> **Note:** All record types use `custom_data` or `custom_fields` as the column name. There is no `custom` column — an earlier draft used that name for opportunities but the migration used `custom_fields` instead.

### 1.2 Scoping Rules

**Flat / tenant-scoped (settings page):**
- People, Companies, Households, Locations
- Field definitions belong to the tenant, not to a sub-type
- People fields additionally have a `contact_type_keys` array — controls which detail page sections the field appears under (see Section 3)

**Type-scoped (managed in type editors):**
- Opportunities — definition created inside the Pipeline type editor, implicitly scoped to that pipeline type
- SitRep Items — definition created inside the SitRep type editor slide-in, implicitly scoped to that item type

All definitions, regardless of scope, live in the same `custom_field_definitions` table with a `record_type` discriminator and scoping columns.

---

## 2. Database Schema

### 2.1 New Table — `custom_field_definitions`

```sql
CREATE TABLE custom_field_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Which record type this field belongs to
  record_type TEXT NOT NULL,
  -- 'people' | 'companies' | 'households' | 'locations' | 'opportunities' | 'sitrep_items'

  -- Stable key — used as the JSONB property name at storage time.
  -- Never changes after creation. Namespaced to prevent collisions.
  -- Format: cf_{record_type_abbrev}__{slug}
  -- e.g. 'cf_ppl__ask_amount', 'cf_opp__close_probability'
  -- Generated automatically from label on creation. Never user-editable.
  field_key TEXT NOT NULL,

  -- Display
  label TEXT NOT NULL,
  field_type TEXT NOT NULL,
  -- 'text' | 'number' | 'date' | 'boolean' | 'select' | 'multiselect' | 'url' | 'email' | 'phone' | 'textarea'

  -- For field_type = 'select' or 'multiselect': array of option objects
  -- [{value: 'opt_1', label: 'Option One'}, ...]
  -- value is a stable slug; label is display text
  options JSONB DEFAULT '[]',

  -- For record_type = 'people':
  -- Which contact type keys this field is associated with.
  -- Empty array = General field (shows for ALL people regardless of type).
  -- Non-empty = only renders on person detail page when person.contact_types overlaps this array.
  contact_type_keys TEXT[] DEFAULT '{}',

  -- For record_type = 'opportunities':
  -- The pipeline type key this field belongs to.
  -- Set at creation time from the pipeline type editor context.
  pipeline_type_key TEXT,

  -- For record_type = 'sitrep_items':
  -- The sitrep item type UUID this field belongs to.
  sitrep_type_id UUID REFERENCES sitrep_item_types(id) ON DELETE CASCADE,

  -- UI configuration
  placeholder TEXT,
  help_text TEXT,
  required BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,

  -- Lifecycle
  is_archived BOOLEAN DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Enforce uniqueness of field_key per tenant per record type
  UNIQUE (tenant_id, record_type, field_key),

  -- Enforce scoping constraints
  CONSTRAINT chk_scoping CHECK (
    (record_type = 'opportunities' AND pipeline_type_key IS NOT NULL)
    OR (record_type = 'sitrep_items' AND sitrep_type_id IS NOT NULL)
    OR (record_type IN ('people', 'companies', 'households', 'locations'))
  )
);

CREATE INDEX idx_cfd_tenant_type ON custom_field_definitions(tenant_id, record_type);
CREATE INDEX idx_cfd_tenant_pipeline ON custom_field_definitions(tenant_id, pipeline_type_key) WHERE pipeline_type_key IS NOT NULL;
CREATE INDEX idx_cfd_tenant_sitrep ON custom_field_definitions(tenant_id, sitrep_type_id) WHERE sitrep_type_id IS NOT NULL;
CREATE INDEX idx_cfd_contact_types ON custom_field_definitions USING GIN(contact_type_keys) WHERE record_type = 'people';
```

### 2.2 Migrations — Add Missing Storage Columns

```sql
-- households
ALTER TABLE households ADD COLUMN IF NOT EXISTS custom_data JSONB DEFAULT '{}';

-- locations
ALTER TABLE locations ADD COLUMN IF NOT EXISTS custom_data JSONB DEFAULT '{}';

-- sitrep_items (check if already exists before running)
ALTER TABLE sitrep_items ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}';
```

Note: `tenant_people.custom_data`, `tenant_companies.custom_data`, and `opportunities.custom_fields` already exist — no migration needed for those.

### 2.3 GIN Index for JSONB Querying

Add GIN indexes on all custom data columns to support filtering and search:

```sql
CREATE INDEX IF NOT EXISTS idx_tenant_people_custom_data ON tenant_people USING GIN(custom_data);
CREATE INDEX IF NOT EXISTS idx_tenant_companies_custom_data ON tenant_companies USING GIN(custom_data);
CREATE INDEX IF NOT EXISTS idx_opportunities_custom_fields ON opportunities USING GIN(custom_fields);
CREATE INDEX IF NOT EXISTS idx_households_custom_data ON households USING GIN(custom_data);
CREATE INDEX IF NOT EXISTS idx_locations_custom_data ON locations USING GIN(custom_data);
CREATE INDEX IF NOT EXISTS idx_sitrep_items_custom_fields ON sitrep_items USING GIN(custom_fields);
```

### 2.4 Field Key Generation

Field keys are generated automatically at creation time. Never shown to users. Never editable after creation.

Format: `cf_{record_abbrev}__{slugified_label}`

| Record Type | Abbreviation | Example |
|---|---|---|
| people | ppl | `cf_ppl__ask_amount` |
| companies | co | `cf_co__contract_tier` |
| households | hh | `cf_hh__income_bracket` |
| locations | loc | `cf_loc__parking_notes` |
| opportunities | opp | `cf_opp__close_probability` |
| sitrep_items | sr | `cf_sr__agenda_url` |

If a generated key already exists for the tenant + record type, append `_2`, `_3`, etc. until unique.

Slugification: lowercase, spaces → underscores, strip all non-alphanumeric except underscores, truncate to 40 chars before the suffix.

---

## 3. People Custom Fields — The Visibility Model

This is the most nuanced record type. Understand this before building anything else.

### 3.1 How It Works

- Field values are **always stored flat** in `tenant_people.custom_data` regardless of contact type
- Field definitions have a `contact_type_keys TEXT[]` property
- On the person detail page, fields are grouped into sections by contact type
- A section for contact type X renders only if `person.contact_types` contains X AND at least one field definition has X in its `contact_type_keys`
- A "General" section renders for all people — fields where `contact_type_keys = '{}'` (empty array)
- **Data is never lost when type membership changes** — the value stays in `custom_data`, just won't render if the type is removed

### 3.2 Section Rendering Logic (pseudocode)

```
// On person detail page load:
person_types = person.contact_types  // e.g. ['donor', 'volunteer']
all_definitions = fetch definitions for record_type='people', tenant

general_fields = definitions where contact_type_keys = []
// → renders in "General" section always

for each type_key in person_types:
  type_fields = definitions where type_key IN contact_type_keys
  if type_fields is not empty:
    render section header = contact type label (from contact type registry)
    render fields for that section

// A field associated with multiple types (e.g. ['donor', 'volunteer'])
// appears in BOTH the Donor section and the Volunteer section on the detail page
// The value is shared — it's one field_key in the JSONB
```

### 3.3 Editing a Field's Contact Type Association

In the settings page, when creating or editing a People field, the Director sees a multi-select of the tenant's contact types plus a "General (all people)" option. Selecting "General" clears all type associations. Selecting specific types adds to `contact_type_keys`. A field can be associated with multiple types simultaneously.

---

## 4. Settings Page — `/crm/settings/custom-fields`

**File location:** `app/crm/settings/custom-fields/page.tsx`

**Auth:** `requireDirectorPage()` — Directors only.

**Page title:** "Custom Fields"

**Layout:** Tab bar across the top with one tab per record type. Default tab: People.

```
[People]  [Companies]  [Households]  [Locations]
```

Opportunities and SitRep Items are NOT tabs here — those are managed in their respective type editors.

### 4.1 People Tab

**Structure:** One collapsible section per contact type that has at least one field, plus a "General" section at the top. A contact type section only appears once a field is associated with it.

**Each section:**
- Section header: contact type label (e.g. "Donor") + count badge ("3 fields")
- "General" section header is always present, cannot be collapsed or removed
- Below the section header: a list of field rows (see 4.3)
- At the bottom of each section: `+ Add field to [Type Name]` dashed button
- Clicking it opens the field creation modal pre-scoped to that contact type

**"+ Add Field" button** at the top right of the page — opens the creation modal with contact type unset (user selects General or a type in the modal).

### 4.2 Companies, Households, Locations Tabs

**Structure:** Simpler — no type sections. Just a flat list of field rows.

**"+ Add Field" button** at top right opens the creation modal scoped to the current tab's record type.

### 4.3 Field Row

Each field definition renders as a row:

```
⠿  [field_type icon]  Field Label              [type badge(s)]   [Edit]  [Archive]
                       text · help text snippet
```

- Drag handle (⠿) for reordering — updates `sort_order` on drag end
- Field type icon: small icon indicating text/number/date/boolean/select/etc.
- Field label in primary text
- For People fields: small contact type badge pills showing associations ("Donor", "Volunteer") or "General" badge
- `[Edit]` opens the edit modal pre-filled
- `[Archive]` shows an inline confirmation: "Archive this field? Existing data is preserved but the field won't appear in new records." Confirm archives, Cancel dismisses. Archived fields are hidden from the list by default.
- A "Show archived" toggle at the bottom of each section reveals archived fields with a muted style and an "Unarchive" button.

**Important:** Fields cannot be deleted if any record has a non-null value for that `field_key`. Only archiving is permitted in that case. The Archive button checks this and shows an error if a hard delete is attempted with data present (though hard delete is not exposed in the UI — archive only).

### 4.4 Field Creation / Edit Modal

A centered modal, 520px max width on desktop.

**Fields in the modal:**

**Label** (text input, required)
The display name shown in the UI. e.g. "Ask Amount", "Donation Tier".

**Field Type** (select, required)
Options:
- Text (single line)
- Text (long / paragraph)
- Number
- Date
- Yes / No
- Select (single choice)
- Multi-select (multiple choices)
- Email
- Phone
- URL

**Options** (only shown if field_type = 'select' or 'multiselect')
Tag-style input. User types an option label and hits Enter to add it. Each option gets a stable value slug auto-generated from its label at creation time. Options can be reordered by drag. Removing an option shows a warning if values exist: "X records use this option. Removing it won't delete their data, but those values will show as 'Unknown option' until updated."

**Shown For** (only shown on People tab)
Multi-select of the tenant's contact types + "General (all people)" option.
- "General" = `contact_type_keys = []` — field appears for everyone
- Selecting types = field appears only for people in those types
- "General" and specific types are mutually exclusive in the UI — selecting General clears type selections and vice versa
- Defaults to "General" for new fields

**Required** (toggle)
If on, record save is blocked until this field has a value. Applied at the UI layer on the detail page form.

**Help Text** (text input, optional)
Short hint shown below the field input on the detail page. e.g. "Annual household estimate, not individual income."

**Placeholder** (text input, optional)
Shown inside the input when empty.

**Save button** — creates or updates the definition. On create: `field_key` is auto-generated and stored. User never sees it.

---

## 5. Type Editor Integration

### 5.1 SitRep Type Editor Slide-in

**Existing file:** `app/crm/settings/sitrep/SitRepSettingsPanel.tsx`

Add a "Custom Fields" collapsible section to the existing TypeEditorPanel slide-in, after the Stages section and before the Advanced accordion.

Section header: "Custom Fields" with a `+` icon button to add a new field.

**Field list:** Same row pattern as the settings page — drag handle, type icon, label, edit, archive. Compact version since it's inside a slide-in.

**Add field button** opens the same field creation modal, but:
- Record type is locked to `sitrep_items`
- `sitrep_type_id` is pre-set to the current type being edited
- The "Shown For" contact type selector is NOT shown

Fields created here are scoped to this item type — they only appear on SitRep items of this type.

### 5.2 Pipeline Type Editor

**Context:** The pipeline/contact type editor. Based on `TenantSelfPanel.tsx` patterns and the pipeline settings UI.

Same treatment as SitRep — add a "Custom Fields" collapsible section inside the pipeline type editor panel.

**Add field button** opens the creation modal with:
- Record type locked to `opportunities`
- `pipeline_type_key` pre-set to the current pipeline type's key
- "Shown For" selector NOT shown

Fields created here only appear on opportunities in this pipeline type.

---

## 6. Display on Detail Pages

### 6.1 Person Detail Page

**File to modify:** The existing person detail / Dossier detail component.

After the built-in fields section (or in a dedicated "Additional Information" area at the bottom of the detail panel), render custom field sections.

**Rendering logic:**
1. Fetch `custom_field_definitions` for `record_type = 'people'`, `tenant_id = tenant.id`, `is_archived = false`, ordered by `sort_order`
2. Fetch `tenant_people` row for this person to get `contact_types` and `custom_data`
3. Render "General" section first — fields where `contact_type_keys = []`
4. For each contact type in `person.contact_types`, render a section if any fields are associated
5. Each field renders as a labeled value display (read mode) or an inline edit input (edit mode)

**Read mode:**
```
Ask Amount
$2,500
```
```
Donation Tier
Major Donor
```
Empty fields show a muted "—" in read mode. No blank fields are hidden.

**Edit mode:**
Fields become editable inputs matching their field type. Changes are saved on blur (auto-save pattern, same as SitRep item detail). A debounced PATCH to `/api/crm/people/[id]/custom-fields` with the updated `custom_data` blob.

**Section collapse:** Each contact type section on the person detail page is collapsible. Collapse state persists in localStorage per person + section. General section is not collapsible.

**SitRep toggle (future):** The spec mentions this as a potential toggle. Reserve the architecture for it but do not build it in v1. Fields appear on detail pages only for now.

### 6.2 Company Detail Page

Same pattern as person detail. No type sections — just a single "Additional Information" section. Fields from `custom_field_definitions` where `record_type = 'companies'`.

### 6.3 Household Detail Page

Same pattern. Single section.

### 6.4 Location Detail Page

Same pattern. Single section.

### 6.5 Opportunity Detail Page

Fetch definitions where `record_type = 'opportunities'` AND `pipeline_type_key = opportunity.pipeline`. Render in a "Custom Fields" section on the opportunity detail. Same auto-save on blur pattern. Values live in `opportunities.custom_fields`.

**Current implementation:** The opportunity detail page already fetches and displays `custom_fields` as a read-only key/value list inside the Details card (`OppDetailClient.tsx`). Keys are humanized (underscores → spaces, title-cased). This will be replaced by the full typed-field rendering once `custom_field_definitions` is built.

### 6.6 SitRep Item Detail Page

**File to modify:** `app/crm/sitrep/[id]/SitRepItemClient.tsx`

Fetch definitions where `record_type = 'sitrep_items'` AND `sitrep_type_id = item.type_id`. Render as a collapsible "Custom Fields" section in the existing detail panel, after the core fields. Values live in `sitrep_items.custom_fields`.

Use the same `fieldStyle`, `focusField`/`blurField` patterns already in `SitRepItemClient.tsx`. Match the existing section card pattern with `inset 3px 0 0 0 var(--gg-primary)` left accent strip when expanded.

---

## 7. API Routes

### 7.1 Field Definitions CRUD

```
GET    /api/crm/custom-fields?record_type=people           # List definitions for a record type
POST   /api/crm/custom-fields                              # Create new definition
PATCH  /api/crm/custom-fields/[id]                         # Update label, options, help_text, sort_order, contact_type_keys, required
DELETE /api/crm/custom-fields/[id]                         # Archive only (sets is_archived = true)
PATCH  /api/crm/custom-fields/[id]/reorder                 # Bulk update sort_order after drag
```

**POST body (create):**
```json
{
  "record_type": "people",
  "label": "Ask Amount",
  "field_type": "number",
  "contact_type_keys": ["donor"],
  "required": false,
  "help_text": "Annual giving capacity estimate",
  "placeholder": "e.g. 2500",
  "options": []
}
```

Server generates `field_key` — never accept it from the client.

**Authorization:** All custom-field definition routes require `isAdmin` (Director or Support — check existing `requireDirectorApi` vs. `requireAdminApi` patterns and use whichever is appropriate for settings-level access).

### 7.2 Field Value Updates

Field values are updated through the existing record PATCH routes — not a separate endpoint. The existing PATCH for each record type accepts a `custom_data` (or `custom` for opportunities, `custom_fields` for sitrep) payload and merges it.

If a dedicated per-field patch is needed to avoid race conditions on the person detail page, add:

```
PATCH  /api/crm/people/[id]/custom-data           # Merges provided keys into custom_data
PATCH  /api/crm/companies/[id]/custom-data        # Same
PATCH  /api/crm/opportunities/[id]/custom-fields  # Same, targets 'custom_fields' column
PATCH  /api/crm/sitrep/items/[id]/custom-fields   # Same, targets 'custom_fields'
```

Each of these should do a **merge** (not replace) of the incoming payload into the existing JSONB:
```sql
UPDATE tenant_people
SET custom_data = custom_data || $incoming_patch
WHERE person_id = $id AND tenant_id = $tenant_id
```

For opportunities specifically:
```sql
UPDATE opportunities
SET custom_fields = custom_fields || $incoming_patch
WHERE id = $id AND tenant_id = $tenant_id
```

This prevents two concurrent saves from clobbering each other's fields.

---

## 8. Search and Filter

### 8.1 Filter Builder

The existing list/filter builder in GroundGame exposes filterable fields. Custom fields are added to the "Advanced Fields" group at the bottom of the field picker. No gating — all defined fields for the active record type appear.

**Each custom field in the filter builder renders the appropriate control:**

| Field Type | Filter Control |
|---|---|
| text, textarea, url, email, phone | Text input with contains / equals / starts with operators |
| number | Number inputs with =, ≠, >, <, between operators |
| date | Date picker with on, before, after, between operators |
| boolean | Yes / No toggle |
| select | Checkbox list of options with is / is not operators |
| multiselect | Checkbox list with contains / contains all / contains any operators |

**Query construction for JSONB fields:**

```sql
-- text contains
WHERE custom_data->>'cf_ppl__field_key' ILIKE '%value%'

-- number greater than
WHERE (custom_data->>'cf_ppl__field_key')::numeric > 1000

-- select equals
WHERE custom_data->>'cf_ppl__field_key' = 'option_value'

-- multiselect contains
WHERE custom_data->'cf_ppl__field_key' @> '["option_value"]'

-- boolean
WHERE (custom_data->>'cf_ppl__field_key')::boolean = true

-- date between
WHERE (custom_data->>'cf_ppl__field_key')::date BETWEEN '2024-01-01' AND '2024-12-31'

-- is empty / is not empty
WHERE custom_data->>'cf_ppl__field_key' IS NULL OR custom_data->>'cf_ppl__field_key' = ''
WHERE custom_data->>'cf_ppl__field_key' IS NOT NULL AND custom_data->>'cf_ppl__field_key' != ''
```

For Opportunities and SitRep, filter custom fields are pre-filtered to the active pipeline type / sitrep type context.

### 8.2 Search

When a global search or record-level search is performed, custom text fields are included in the search index. Implementation: add custom `text`, `textarea`, `email`, `phone`, `url` field values to whatever full-text search mechanism is currently in use. For JSONB, this means including relevant keys in the `tsvector` generation if using Postgres FTS, or including them in the ilike clause if using simple search.

Do not include number, date, boolean, select values in full-text search — those are filter-only.

---

## 9. Import Mapping

**File to modify:** The existing import flow / column mapper.

When mapping an import column to a destination field, the field picker includes a "Custom Fields" group alongside the built-in system fields. All non-archived custom field definitions for the relevant record type appear here.

**For People imports:** All custom field definitions regardless of `contact_type_keys` association appear as mapping targets. The import doesn't need to know which contact type the person belongs to — it just writes to the flat JSONB.

**Value handling at import time:**
- `text`, `textarea`, `url`, `email`, `phone`: write the raw string value
- `number`: parse to numeric, skip row with a warning if non-numeric
- `date`: parse ISO 8601 or MM/DD/YYYY, skip with warning if unparseable
- `boolean`: accept `true/false`, `yes/no`, `1/0`, `Y/N` (case-insensitive)
- `select`: write the raw value as-is; if it doesn't match a defined option's value, add it to the JSONB anyway but flag in the import summary as "unrecognized option"
- `multiselect`: accept comma-separated values; same flag behavior for unrecognized options

**Import result:** Custom field values that fail validation are skipped (not the whole row). The import summary report shows a count of custom field validation skips with which field and which rows.

---

## 10. Survey Mapping

### 10.1 Current Implementation

The `CrmFieldPicker` component in `SurveyBuilder.tsx` supports mapping survey questions to opportunity custom fields today, **without** the `custom_field_definitions` table. The flow:

1. In the question editor, the user opens the CRM field picker and selects **Opportunities** as the target table.
2. At the bottom of the opportunities field list, a "Custom field key" text input appears.
3. The user types a snake_case key (e.g. `pickup_notes`). The input enforces lowercase and replaces spaces with underscores.
4. Clicking "Use" stores `"opportunities.custom_fields.pickup_notes"` in the question's `crm_field` column.

At submission time (`panel-submit`):
- `normalizeCrmField("opportunities.custom_fields.pickup_notes")` returns `{ table: "opportunities", column: "custom_fields.pickup_notes" }`.
- Panel-submit detects the `custom_fields.` prefix, extracts the key (`pickup_notes`), and merges `{ pickup_notes: answerValue }` into the existing `opportunities.custom_fields` JSONB using a read-then-spread pattern.

**Current limitation:** Only `opportunities` target is supported. People custom fields are not currently mappable in the survey builder (the `people` and `tenant_people` paths do not handle `custom_data.*` sub-keys in panel-submit).

### 10.2 Future Implementation (requires `custom_field_definitions` table)

Once `custom_field_definitions` is built:

**"Map to existing field":** Dropdown of all defined custom fields for the relevant record types. Selecting one stores the `field_key` on the question config.

**"Create and map to new field":** Opens the field creation modal inline. On save, the new field's `field_key` is automatically set as the mapping target for this question. The field is created as General (contact_type_keys = []) by default — the Director can update the association later in settings.

**At survey response time:** When a person submits a survey, the handler reads each question's `field_key` mapping and writes the answer value to the appropriate JSONB column. Applies the same type coercion logic as import.

**If the same person submits the same survey twice:** The new value overwrites the old value. Last response wins.

---

## 11. Automations Integration

### 11.1 Current State — Gap

The automations engine (`lib/automations/engine.ts` + `lib/automations/triggerPayload.ts`) is live and handles `opportunity_created` and other trigger types. However, `buildNormalizedPayload` **does not currently expose custom field values as `{{vars}}`**.

When an opportunity triggers an automation, the normalized payload exposes: `{{title}}`, `{{stage}}`, `{{pipeline}}`, `{{due_date}}`, `{{due_at}}`, `{{pickup_address}}`, `{{dropoff_address}}`, `{{pickup_location}}`, `{{dropoff_location}}`, `{{link}}`, `{{assignee_names}}`. It does **not** include `{{custom_fields.some_key}}` or any opportunity custom field values.

**To expose custom fields in automation templates**, `buildNormalizedPayload` needs to read `opportunities.custom_fields` from the DB when processing an opportunity payload, then add each key as `vars["custom_fields.<key>"] = value`. This would let automation action configs use `{{custom_fields.pickup_notes}}` in title/description templates.

### 11.2 Future Implementation (requires `custom_field_definitions`)

Once `custom_field_definitions` exists:

**Trigger conditions:**
- `custom_field_value_equals` — fires when a custom field is set to a specific value
- `custom_field_value_changes` — fires when a custom field changes
- `custom_field_is_empty` / `custom_field_is_not_empty`

**Action targets:**
- `set_custom_field_value` — sets a specific custom field to a provided value
- `clear_custom_field_value` — clears a field's value

The automations UI will pull from `custom_field_definitions` to populate field pickers in the condition and action editors. The definitions table is the source of truth for valid field keys.

---

## 12. Field Type Icons

Use consistent iconography throughout (settings page, filter builder, detail page section headers). Map each field type to a simple icon:

| Field Type | Icon |
|---|---|
| text | `T` or text icon |
| textarea | `¶` or paragraph icon |
| number | `#` |
| date | calendar icon |
| boolean | toggle icon |
| select | chevron-down / list icon |
| multiselect | checklist icon |
| email | envelope icon |
| phone | phone icon |
| url | link icon |

These should match whatever icon library is already in use in the codebase.

---

## 13. Visual Design Guidance

Follow the existing GuerrillaSuite dark UI pattern from `VisualGuide.md` throughout:

- Use the `S` surface token object for all colors
- Field rows in the settings page use the same card pattern: `background: rgba(20,25,38,.75)`, `border: 1px solid rgba(255,255,255,.07)`, `border-radius: 10px`
- The `+ Add Field` dashed button uses the existing Dashed "Add" Button pattern from Section 9 of VisualGuide.md
- The field creation modal uses the elevated card pattern: `background: rgba(20,25,38,.97)`, `backdropFilter: blur(20px)`
- All inputs use `inputStyle` + `focusInput`/`blurInput` handlers from VisualGuide.md Section 4
- Required toggle and any boolean toggles use the iOS-style toggle from Section 5
- Contact type section headers in the settings page use the `sectionLabel` pattern: `fontSize: 10, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase'`
- Field type badges and contact type association pills follow the FilterPill pattern from Section 3
- On the person detail page, custom field sections use the Collapsible Section Card pattern from Section 6 with the primary color left accent strip when expanded

---

## 14. File Structure

New files:
```
app/
  crm/
    settings/
      custom-fields/
        page.tsx                  # Settings page — tab layout
        CustomFieldsPanel.tsx     # Client component — all four tabs
        FieldDefinitionModal.tsx  # Create/edit modal (shared across all tabs)
        FieldRow.tsx              # Single field row with drag handle

api/
  crm/
    custom-fields/
      route.ts                    # GET list, POST create
      [id]/
        route.ts                  # PATCH update, DELETE (archive)
        reorder/
          route.ts                # PATCH bulk sort_order update
    people/
      [id]/
        custom-data/
          route.ts                # PATCH merge custom_data values
    companies/
      [id]/
        custom-data/
          route.ts
    opportunities/
      [id]/
        custom/
          route.ts
    # sitrep items use existing /api/crm/sitrep/items/[id] route — extend that PATCH
```

Modified files:
```
app/crm/settings/sitrep/SitRepSettingsPanel.tsx   # Add Custom Fields section to TypeEditorPanel
app/crm/sitrep/[id]/SitRepItemClient.tsx           # Add custom fields section to item detail
app/crm/[person-detail-component]                  # Add custom fields sections to person detail
app/crm/[company-detail-component]                 # Add custom fields section to company detail
app/crm/[opportunity-detail-component]             # Add custom fields section to opportunity detail
[import mapper component]                          # Add custom fields as mapping targets
[filter builder component]                         # Add custom fields to Advanced Fields group
[pipeline type editor]                             # Add Custom Fields section (same as SitRep)
```

New Supabase migration:
```
custom_field_definitions table
GIN indexes on all custom data columns
ADD COLUMN custom_data to households
ADD COLUMN custom_data to locations
ADD COLUMN custom_fields to sitrep_items
```

---

## 15. Important Patterns to Follow

- **Never expose `field_key` in the UI** — users see labels only; keys are internal infrastructure
- **Never hard-delete a definition** — archive only; always check for existing data before even offering archive
- **Always merge, never replace** on JSONB updates — use `||` operator in Postgres to merge incoming patches into existing `custom_data`
- **`contact_type_keys = []` means General** — empty array is the "show for everyone" sentinel; null should not occur (enforce default `'{}'` at DB level)
- **`field_key` is immutable after creation** — if label changes, key does not. Enforce this in the PATCH route by stripping `field_key` from any incoming update payload
- **Options get stable value slugs at creation** — a select option's `value` slug never changes even if its `label` is renamed; this ensures stored JSONB values remain valid
- **Sort order is per-tenant per-record-type** — when returning definitions, always order by `sort_order ASC, created_at ASC`
- **Filter builder shows ALL non-archived fields** in the Advanced Fields group — no type-visibility gating in the filter context
- **`opportunities` uses `custom_fields`**, same as the planned `sitrep_items` column. People/companies/households/locations use `custom_data`. There is no column named `custom` anywhere — an earlier draft used that name but the migration used `custom_fields`
- **Auth:** Field definition management (CRUD in settings) requires Director. Reading field definitions to render them on detail pages is available to any authenticated CRM user. Writing field values via the detail page form requires whatever permission the underlying record edit requires.

---

## 16. V1 vs Future

### V1 — Build Now
- `custom_field_definitions` table and all migrations
- Settings page with People, Companies, Households, Locations tabs
- Custom Fields section in SitRep type editor
- Custom Fields section in Pipeline type editor
- Display and inline editing on all detail pages
- Filter builder integration (Advanced Fields group)
- Import mapper integration
- Survey question mapping (map to existing field + create and map to new field)
- API routes for CRUD and value updates

### Future
- Automations trigger conditions and action targets (schema-ready now, UI ships with automations engine in v2.5)
- Board/list row display toggle for SitRep (reserved in architecture, not built in v1)
- Field-level permissions (who can see/edit a specific field — complex, future)
- Conditional field visibility (show field X only if field Y = value Z — very future)
- Custom field reporting / aggregate views
