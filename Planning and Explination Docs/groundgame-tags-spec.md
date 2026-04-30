# GroundGame — Contact Tags System
## Feature Spec for Claude Code
**Status:** Pre-development planning
**Suite:** GuerrillaSuite
**Product:** GroundGame CRM
**Feature tier:** All tiers (core CRM feature)

---

## 0. Feature Identity

**Feature name:** Tags
**Touches:** HQ Settings, Person Detail page, Import flow, Form Builder, Form submission handler, Contact list

Tags are tenant-scoped labels applied to contacts. They are managed from a central library in HQ settings, applied manually on person detail pages, bulk-applied during imports or via the contact list, and generated automatically from form question answers. Every tag display in the UI uses the tenant's brand color (`var(--gg-primary)`) as a pill — no per-tag color configuration.

---

## 1. Schema Changes

### 1.1 New Table — `tenant_tags`

```sql
CREATE TABLE tenant_tags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,                    -- e.g. "Color:Blue", "Volunteer", "New Leads June"
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, name)                      -- no duplicate tag names within a tenant
);

CREATE INDEX idx_tenant_tags_tenant ON tenant_tags(tenant_id);
```

RLS: Enable and scope by `tenant_id` using the existing `X-Tenant-Id` header pattern (`makeSb(tenantId)`).

### 1.2 New Column — `tenant_people.tags`

```sql
ALTER TABLE tenant_people
  ADD COLUMN tags UUID[] NOT NULL DEFAULT '{}';

CREATE INDEX idx_tenant_people_tags ON tenant_people USING GIN(tags);
```

This is a `uuid[]` array of `tenant_tags.id` values. The GIN index makes filtering by tag fast regardless of how many tags a person has. The existing `people.tags_json` column on the global `people` table is **unused and remains untouched** — it was never populated and we are not migrating it.

### 1.3 Why UUID array, not JSONB

- Renaming a tag updates one row in `tenant_tags` — zero writes to `tenant_people` needed
- Deleting a tag requires a cleanup pass on `tenant_people` (intentional, with warning UI)
- GIN-indexed `uuid[]` handles 20+ tags per person with no performance degradation
- Filtering `WHERE tags @> ARRAY['uuid-here']::uuid[]` is clean and indexable

---

## 2. Tag Library — HQ Settings

**Route:** `/crm/settings/tags` (or wherever HQ settings lives — follow the existing settings page pattern)

**Auth:** Director/Admin only. Field users cannot access tag management.

### 2.1 Page Layout

**Page title:** "Tags"
**Subtitle/description:** "Manage tags for your organization. Tags can be applied to contacts manually, during imports, or automatically via form responses."

**"New Tag" button** — opens an inline input or small modal to create a tag. Input is just a text field for the tag name. On save, inserts into `tenant_tags`. If the name already exists (case-insensitive check), show inline error: "A tag with this name already exists."

**Tag list** — table or card list showing all `tenant_tags` rows for this tenant:

| Column | Notes |
|--------|-------|
| Tag name | Shown as a pill in `var(--gg-primary)` color |
| Contacts | Count of `tenant_people` rows where `tags @> ARRAY[tag.id]` |
| Created | `created_at` date |
| Actions | Edit (rename) · Delete |

**Sort:** Alphabetical by name, default. No pagination needed unless a tenant has 100+ tags — add if needed.

### 2.2 Rename (Edit)

Clicking Edit opens an inline edit input pre-filled with the current name. On save:
- Update `tenant_tags.name` where `id = tag.id`
- That's it — all `tenant_people.tags` UUID arrays still point to the same UUID, so the display name updates everywhere automatically with zero additional writes

### 2.3 Delete

Clicking Delete checks the contact count for that tag.

**If count = 0:** Delete immediately with no warning. Remove the row from `tenant_tags`. No cleanup needed on `tenant_people` since no one has it.

**If count > 0:** Show a confirmation warning before deleting:

> "**Delete tag '[name]'?**
> This tag is currently applied to **47 contacts**. Deleting it will remove it from all of them. This cannot be undone."
>
> [Cancel] [Delete Tag]

On confirm:
1. Remove the tag UUID from `tags` array on all `tenant_people` rows that contain it — use a Postgres array removal: `UPDATE tenant_people SET tags = array_remove(tags, 'uuid') WHERE tenant_id = ? AND tags @> ARRAY['uuid']`
2. Delete the `tenant_tags` row

Do both in a transaction.

---

## 3. Person Detail Page

**Where it lives:** The existing person detail page in the CRM. Follow whatever layout pattern is already established there.

**Auth:** All roles can view tags. Director/Admin/Support can add and remove tags. Field users see tags as read-only pills.

### 3.1 Tags Section

Add a "Tags" section to the person detail page. Show existing tags as pills (`var(--gg-primary)` color, same style as the tag library). Each pill has an `×` button for admins/directors to remove that tag.

**Add tag UI:** A combobox/typeahead input below the existing tags. As the user types, it filters `tenant_tags` for this tenant by name (case-insensitive `ilike`). Matching tags appear as dropdown options. User selects one to apply it.

- If no match found, show "No tags found. Manage tags in Settings."
- Do **not** allow creating tags from this input — tag creation is settings-only
- On selection: add the tag UUID to `tenant_people.tags` for this person

**Save behavior:** Apply/remove immediately on interaction (optimistic UI, no save button needed for tags). Each add or remove is an independent PATCH to `tenant_people`.

---

## 4. Import Flow

**Where it lives:** The existing import UI. Add a tagging step to the import flow — either as a new step in the import wizard or as an option on the final review/confirm screen.

**Auth:** Director/Admin only (same as import access generally).

### 4.1 Tag Assignment at Import Time

On the import confirm/review step, add a section:

**"Tag these contacts"**
"Apply tags to all contacts in this import. Useful for filtering this import later."

A multi-select tag picker showing all `tenant_tags` for this tenant. The user can select zero, one, or multiple tags. These tags are added to every `tenant_people` row created or updated by this import run.

**Implementation:** After the import rows are upserted into `tenant_people`, run a single update:
```sql
UPDATE tenant_people
SET tags = array_cat(tags, ARRAY['uuid1', 'uuid2']::uuid[])
WHERE tenant_id = ? AND person_id = ANY(ARRAY[...imported person ids])
```
Use `array_cat` so existing tags on contacts that already existed are preserved — do not overwrite.

Note: Tag creation is not available at import time. If the user wants a new tag like "New Leads June 2025", they create it in settings first, then it appears in the import tag picker. This is by design — imports happen in bulk and tag names should be deliberate.

---

## 5. Form Builder — Question-Level Tag Mapping

**Where it lives:** The existing form builder UI. This adds a new optional configuration to individual form questions.

**Auth:** Director/Admin only (same as form builder access).

### 5.1 Supported Question Types

Tag mapping is only available on **multiple choice** and **multi-select** questions. Single-line text, long text, date, etc. do not support tag mapping.

### 5.2 Per-Question Tag Mapping Toggle

On each eligible question in the form builder, add a toggle:

**"Map answers to tags"** — off by default.

When toggled **on**, the following UI appears below the toggle:

**Prefix field:**
```
Tag prefix: [________________]
            e.g. "Color" → answers become "Color:Blue", "Color:Red"
```

A single text input for the prefix. This is the part before the colon. The answer value fills in after the colon automatically.

Below the prefix field, show a read-only preview for each answer choice:
```
Red     →  tag: "Color:Red"
Blue    →  tag: "Color:Blue"
Green   →  tag: "Color:Green"
```

These previews update live as the user types the prefix.

When toggled **off**, the prefix and previews disappear. No tags are mapped for this question.

### 5.3 Tag Creation at Form Save/Publish

When a form is **saved or published**, the system inspects all questions with tag mapping enabled and creates any missing tags in `tenant_tags` using find-or-create logic:

For each mapped answer across all tag-mapped questions:
1. Construct the full tag name: `"${prefix}:${answerValue}"`
2. Look up `tenant_tags` where `tenant_id = ? AND LOWER(name) = LOWER(constructed_name)`
3. If found: use existing UUID — no insert needed
4. If not found: insert new row into `tenant_tags` and get the new UUID

This means:
- Tags appear in the library the moment the form is saved, before anyone fills it out
- A director can see what tags a form will generate just by looking at the library
- Form submission handler does lookups only — no creation logic needed at submission time
- If the same tag name already exists (created manually or by another form), the existing tag is reused — no duplicates

**Edge case — editing a published form:** If a user changes the prefix from "Color" to "Hue" on a published form, the old "Color:Blue" tags remain in the library and on any contacts who already submitted. New submissions will use "Hue:Blue" tags (created at next save). The admin is responsible for manually cleaning up the old tags from the library if desired. This behavior should be noted in a small helper text in the form builder near the prefix field: "Changing this prefix after the form has received responses will create new tags. Existing tags and tagged contacts are not affected."

### 5.4 Form Submission Handler

When a form is submitted, for each question with tag mapping enabled:
1. Get the respondent's answer(s) to that question
2. Construct the tag name(s): `"${prefix}:${answerValue}"`
3. Look up each tag in `tenant_tags` by `(tenant_id, name)` — **find only, never create**
4. For each found tag UUID: add to `tenant_people.tags` for the submitting person using `array_cat` (preserve existing tags, no duplicates)

If a tag UUID is not found at submission time (edge case: someone deleted the tag from the library after the form was saved), skip silently — do not error the form submission.

---

## 6. Contact List — Filter and Bulk Edit

**Where it lives:** The existing contact list / people list in the CRM.

### 6.1 Filter by Tag

Add "Tag" as a filter option in the contact list filter panel. The tag filter is a multi-select — selecting multiple tags returns contacts that have **any** of the selected tags (OR logic), not all of them. If AND logic is needed in the future, that is a v2 consideration.

Query pattern:
```sql
-- One tag
WHERE tags @> ARRAY['uuid']::uuid[]

-- Any of multiple tags (OR)
WHERE tags && ARRAY['uuid1', 'uuid2']::uuid[]
```

### 6.2 Bulk Tag Edit

**How it's triggered:** User selects one or more contacts via checkboxes on the contact list. A bulk action bar appears (following whatever bulk action pattern already exists in the CRM). One of the available bulk actions is **"Edit Tags"**.

**Bulk tag edit modal/panel:**

Title: "Edit Tags — [N] contacts selected"

Two sections:

**Add tags:**
A multi-select tag picker. Tags selected here are **added** to all selected contacts (array union — existing tags preserved, no duplicates).

**Remove tags:**
A multi-select tag picker. Tags selected here are **removed** from all selected contacts that have them. Contacts that don't have a selected tag are unaffected.

Both sections use the same tag picker component (all `tenant_tags` for this tenant). A tag can appear in both sections simultaneously if the user wants — the remove runs after the add.

**Save behavior:**
- Add: `UPDATE tenant_people SET tags = array_cat(tags, ARRAY[...uuids]) WHERE tenant_id = ? AND person_id = ANY(?)`
- Remove: loop `array_remove` for each tag UUID to remove, or use a Postgres function that removes multiple elements at once
- Show success toast: "Tags updated for [N] contacts."

This bulk edit covers the import cleanup use case — import without tagging, then select all and bulk-add a tag after the fact.

---

## 7. Tag Pill Component

All tag displays across the product use the same pill component. Define it once and reuse everywhere.

**Visual spec (following VisualGuide.md patterns):**

```tsx
// Tag pill — read-only
<span style={{
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "3px 10px",
  borderRadius: 20,
  fontSize: 12,
  fontWeight: 600,
  background: "color-mix(in srgb, var(--gg-primary, #2563eb) 18%, transparent)",
  border: "1px solid color-mix(in srgb, var(--gg-primary, #2563eb) 40%, transparent)",
  color: "color-mix(in srgb, var(--gg-primary, #2563eb) 90%, #fff)",
}}>
  {tag.name}
</span>

// Tag pill — removable (person detail page, admin only)
<span style={{ /* same as above */ }}>
  {tag.name}
  <button onClick={() => removeTag(tag.id)} style={{
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 0,
    lineHeight: 1,
    color: "color-mix(in srgb, var(--gg-primary, #2563eb) 70%, #fff)",
    fontSize: 11,
  }}>×</button>
</span>
```

Use `color-mix()` throughout — never hardcode rgba values for the primary color. Always include the `#2563eb` fallback.

---

## 8. API Routes Needed

Follow the existing pattern of `makeSb(tenantId)` for all tenant-scoped queries.

```
GET    /api/crm/tags                        # List all tenant_tags for this tenant
POST   /api/crm/tags                        # Create a new tag
PATCH  /api/crm/tags/[id]                   # Rename a tag
DELETE /api/crm/tags/[id]                   # Delete a tag (with count check)

GET    /api/crm/people/[id]/tags            # Get tags for a person (likely already in person fetch)
PATCH  /api/crm/people/[id]/tags            # Add or remove tags on a person

POST   /api/crm/tags/bulk-edit              # Bulk add/remove tags across multiple person IDs

POST   /api/crm/forms/[id]/sync-tags        # Called at form save/publish — find-or-create tags for all mapped questions
```

The form submission handler updates are made inside the existing form submission API route — no new route needed, just additional logic in the handler.

---

## 9. Files to Create or Modify

### New files
```
app/crm/settings/tags/
  page.tsx                        # Tag library management page

components/crm/
  TagPill.tsx                     # Reusable tag pill (read-only and removable variants)
  TagPicker.tsx                   # Combobox/typeahead for selecting tags from library
  BulkTagEditModal.tsx            # Bulk add/remove modal for contact list

app/api/crm/tags/
  route.ts                        # GET (list), POST (create)
  [id]/
    route.ts                      # PATCH (rename), DELETE (delete with cleanup)

app/api/crm/tags/
  bulk-edit/
    route.ts                      # POST — bulk add/remove across person IDs

app/api/crm/forms/
  [id]/
    sync-tags/
      route.ts                    # POST — find-or-create tags at form save/publish
```

### Modified files
```
app/crm/people/[id]/page.tsx      # Add Tags section with TagPicker and removable TagPills
app/crm/people/page.tsx           # Add tag filter to contact list filter panel + bulk action
app/crm/import/[...]/page.tsx     # Add tag assignment step to import wizard
app/crm/forms/[id]/builder/       # Add tag mapping toggle + prefix field to question config
app/crm/forms/[id]/               # Call sync-tags on save/publish
                                  # Handle tag writes in submission handler
```

### Database migrations
```sql
-- 1. New tenant_tags table
CREATE TABLE tenant_tags ( ... );  -- see Section 1.1

-- 2. New tags column on tenant_people
ALTER TABLE tenant_people ADD COLUMN tags UUID[] NOT NULL DEFAULT '{}';
CREATE INDEX idx_tenant_people_tags ON tenant_people USING GIN(tags);

-- 3. RLS on tenant_tags (follow existing RLS patterns)
ALTER TABLE tenant_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_scoped" ON tenant_tags
  USING (tenant_id = (current_setting('request.headers')::json->>'x-tenant-id')::uuid);
```

---

## 10. Open Questions for Development

1. **Settings route location** — Confirm the exact path for HQ settings pages in the existing codebase. The spec uses `/crm/settings/tags` but the actual path should match wherever other settings pages live (e.g. `/crm/admin/settings/tags` or `/crm/settings/tags`).

2. **Existing bulk action pattern** — Confirm how bulk actions are triggered on the contact list today (if at all). The bulk tag edit modal should follow whatever checkbox-select + action bar pattern already exists.

3. **Import wizard structure** — Confirm the shape of the existing import flow so the tag assignment step can be inserted at the right point (likely after column mapping, before final confirm).

4. **Form builder question config UI** — Confirm where per-question settings are currently rendered in the form builder so the tag mapping toggle is added in the right place and follows the existing pattern.

5. **`people.tags_json` column** — This column on the global `people` table remains in place and unused. It can be dropped in a future cleanup migration once this feature is confirmed stable. No action needed now.
