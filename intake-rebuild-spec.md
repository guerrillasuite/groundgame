# GuerrillaSuite – Intake Builder Rebuild
## Feature Spec for Claude Code
**Status:** V2 – Redesign of existing SurveyBuilder
**Suite:** GuerrillaSuite
**Product:** GroundGame CRM
**Feature tier:** Varies by plan (existing gating carries over)

---

## 0. Feature Identity

**Feature name:** Intake
**Location in product:** `/crm/intake`
**Nav label:** `📋 Intake`

Intake is GuerrillaSuite's unified form, survey, and data collection tool. It replaces the existing SurveyBuilder with a significantly more polished, type-aware experience. The underlying data model, field mapping, conditional logic, multi-page support, embed functionality, results page, and form status logic are all already built and working — this spec covers the **builder UI redesign and the new type-selection system only**. Do not rebuild what already works.

**What the existing system already handles (do not touch):**
- Field mapping to contact/company/opportunity records
- Conditional logic between questions
- Multi-page form support
- Auto-fill of known contact info via tracked URL
- Contact ID tracking in URL (`/s/[surveyId]?cid=[contactId]`)
- Embed support via SurveyPanel
- Results page and response viewing
- Form status (Draft / Live / Closed)
- Auto-tag on submission
- Opportunity creation trigger

---

## 1. What Is Changing

### 1.1 The Entry Point – New Intake Type Selection Screen

When a user clicks **"New Intake"** from the Intake list view, instead of going directly into the builder they land on a **type selection screen** first.

Six type cards arranged in a **2×3 grid**:

| Type | Icon | One-liner |
|------|------|-----------|
| **Person Intake** | 👤 | Capture contact details from individuals |
| **Company Intake** | 🏢 | Capture business and partnership information |
| **Opportunity Intake** | 💰 | Take orders, capture sales leads |
| **Event** | 📅 | Register attendees for an event |
| **Survey** | 📊 | Collect opinions, run polls |
| **Custom** | ⚙️ | Start from scratch with full control |

Selecting a type pre-configures the builder with the appropriate defaults and pre-filled questions, then navigates into the builder. The type is locked after selection — if the user wants a different type they start a new Intake.

### 1.2 The Builder – Visual Redesign

The builder itself keeps all existing functionality but is reorganized into **collapsible section cards** with a dramatically improved visual treatment. See Section 3 for full design spec.

### 1.3 New Settings Added

Several new settings are being added to the builder that do not exist today. See Section 4.

---

## 2. Type Defaults

### 2.1 Person Intake
**Purpose:** B2C contact capture — canvassing sign-ups, lead forms, contact us pages.

**Pre-filled questions (mapped):**
- First Name (text, mapped → contact.first_name, required)
- Last Name (text, mapped → contact.last_name, required)
- Phone (phone, mapped → contact.phone, required)
- Email (email, mapped → contact.email, required)

**Settings defaults:**
- Opportunity trigger: off
- Require contact_id URL: off
- Multiple submissions: blocked
- Show results after submission: off

**Settings available:** See gating table in Section 4.

---

### 2.2 Company Intake
**Purpose:** B2B intake — business partnerships, vendor applications, corporate sign-ups.

**Pre-filled questions (mapped):**
- Company Name (text, mapped → company.name, required)
- Industry (dropdown, mapped → company.industry)
- Website (text, mapped → company.website)
- Primary Contact Name (text, mapped → contact.full_name, required)
- Phone (phone, mapped → contact.phone, required)
- Email (email, mapped → contact.email, required)

**Note for Claude Code:** Company Intake creates/updates both a company record and a linked contact record simultaneously — the same way the existing builder already handles multi-record submissions. No new record-linking logic is needed.

**Settings defaults:**
- Opportunity trigger: off
- Require contact_id URL: off
- Multiple submissions: blocked
- Show results after submission: off

---

### 2.3 Opportunity Intake
**Purpose:** Orders, sales leads, service requests — anything that should land in a pipeline.

**Pre-filled questions (mapped):**
- First Name (text, mapped → contact.first_name, required)
- Last Name (text, mapped → contact.last_name, required)
- Phone (phone, mapped → contact.phone, required)
- Email (email, mapped → contact.email, required)
- Address (text, mapped → contact.address)
- Product / Service Interest (dropdown, mapped → opportunity.product)
- How did you hear about us? (dropdown)
- Notes (textarea)

**Settings defaults:**
- Opportunity trigger: **always on, locked** — cannot be disabled
- Pipeline and stage picker: visible and required before publishing
- Require contact_id URL: off
- Multiple submissions: blocked
- Show results after submission: off

---

### 2.4 Event
**Purpose:** Event registration and attendee capture.

**Pre-filled questions (mapped):**
- First Name (text, mapped → contact.first_name, required)
- Last Name (text, mapped → contact.last_name, required)
- Phone (phone, mapped → contact.phone)
- Email (email, mapped → contact.email, required)
- Which event / session? (dropdown — admin fills in options)
- How did you hear about us? (dropdown)

**Settings defaults:**
- Opportunity trigger: off
- Submission limit: off (admin should turn on and set cap)
- Expiration date: off
- Password protection: off
- Multiple submissions: blocked

---

### 2.5 Survey
**Purpose:** Opinion polls, feedback collection, internal member polls.

**Pre-filled questions — admin picks one of two starter templates on the type selection screen (a second step after clicking Survey):**

**Starter A – Support / Oppose:**
- Do you support [issue]? (Yes / No / No Opinion)
- How strongly? (Multiple choice: Strongly / Somewhat / Not very)
- Comments (textarea, optional)

**Starter B – Top Issue:**
- What is your top issue? (Multiple choice, admin fills options)
- Why is this important to you? (textarea, optional)
- What are your top 3 priorities? (Multi-select)

Both starters are just pre-filled starting points — admin can edit, remove, or add questions freely.

**Settings defaults:**
- Opportunity trigger: off
- Require contact_id URL: off (but available as a toggle)
- Multiple submissions: blocked
- Show results after submission: off

---

### 2.6 Custom
**Purpose:** Start from scratch. All settings available, no pre-filled questions, no locked defaults.

No starter template step. Goes directly into the full builder with all options unlocked and all sections empty.

---

## 3. Builder Visual Redesign

### 3.1 Design Direction

The aesthetic target is **premium dark ops** — the visual language of Linear, Vercel dashboard, and Raycast applied to a political/field ops context. Not flashy. Not playful. Confident, dense, high-information, and visually layered.

**Core visual principles:**
- Dark base palette using existing GuerrillaSuite CSS variables
- Tenant primary color drives active states, button fills, and accent bars
- Tenant accent color drives hover glows, border highlights on focus
- Cards have genuine visual lift — depth through shadow, not just border
- Subtle glassmorphism on section cards: semi-transparent background + very slight backdrop blur
- Micro-interactions on every interactive element — nothing is static

### 3.2 Type Selection Screen

Full-width screen, centered content, max-width 900px.

**Header:**
```
New Intake
Choose a starting point
```
`New Intake` in large bold type. `Choose a starting point` in muted subtext below.

**Card grid:** 2×3, equal sizing, generous gap.

**Each card contains:**
- Icon at top (48px, rendered as a subtle glyph in tenant primary color)
- Type name in bold (18px)
- One-line description in muted text (13px)
- No button — the whole card is the click target

**Card default state:**
- Background: `rgb(var(--card-700))`
- Border: `1px solid rgb(var(--border-600))`
- Border-radius: `12px`
- Padding: `28px 24px`
- Box-shadow: `0 2px 8px rgba(0,0,0,0.3)`

**Card hover state:**
- Border: `1px solid` tenant accent color at 60% opacity
- Box-shadow: `0 8px 32px` tenant accent color at 15% opacity
- Background lightens very slightly (`rgba(255,255,255,0.02)` overlay)
- Icon color shifts to full tenant accent color
- Transition: `150ms ease`
- Subtle `translateY(-2px)` lift

**Card selected state (Survey only — shows before navigating to starter template step):**
- Border: `1px solid` tenant accent color at full opacity
- Left accent bar: `3px solid` tenant primary color inset on left edge
- Persistent glow

**Survey second step** (starter template picker):
After clicking Survey, the grid fades out and a smaller two-card choice appears:
- Support / Oppose
- Top Issue
With a `← Back` link to return to the type grid.

### 3.3 Builder Layout

**Single-column layout** (live preview deferred to V3):
- Full-width, max ~860px, centered with comfortable side padding
- Collapsible section cards stacked vertically

**Sections (in order):**
1. Form Details
2. Questions
3. Settings
4. Advanced Settings (collapsed by default)

Each section is a card with:
- Header row: section title (bold, 14px) + chevron for expand/collapse + one-line summary when collapsed
- Content: revealed on expand with smooth height transition (`max-height` transition, `200ms ease`)
- Active/expanded state: `border-left: 3px solid` tenant primary color
- Background: `rgba(var(--card-700-raw), 0.7)` with `backdrop-filter: blur(4px)`
- Box-shadow: `0 4px 24px rgba(0,0,0,0.4)`
- Border-radius: `10px`
- Collapsed summary text: muted, 12px — e.g. "5 questions · Multiple choice, Yes/No, Text"

### 3.4 Form Details Section

Contains:
- Form name (internal label)
- Public header / title
- Description
- URL slug + Copy button
- Thank you message
- Footer text
- Learn more URL (collapsed under "Additional text" expand)

Input styling:
- Floating labels (label animates up when field is focused or has content)
- Bottom-border-only style on inputs (no full box border) — cleaner, less visual weight
- Focus state: bottom border transitions to tenant primary color
- Character count shown on subject/header fields

### 3.5 Questions Section

**Question card design:**
Each question is its own card within the section.

```
⠿  [MC]  What is your top issue?                    Required ●  ···
         ○ Option 1
         ○ Option 2
         + Add option
```

- `⠿` drag handle on the far left — visible on hover, always present but muted when not hovered
- `[MC]` question type badge — colored pill, color varies by type:
  - Multiple choice: tenant primary at 20% bg, full primary text
  - Yes/No: green tint
  - Text/textarea: blue tint
  - Email/Phone/Address: purple tint
  - Dropdown: amber tint
- Question text in bold
- Required toggle on the right — pill style, green when on
- `···` menu on far right for edit, duplicate, delete
- Move up / Move down buttons replacing the drag handle (DnD confirmed not implemented; buttons must be visually polished — not plain text links, but compact icon buttons that feel native to the card)

**Card hover:** slight lift, move buttons brighten

**Add Question button:** full-width dashed border card below the last question. Click opens a question type picker (existing UI, just needs visual polish to match).

### 3.6 Settings Section

Contains all primary settings visible without scrolling. Organized into logical sub-groups with a subtle divider between groups (no sub-headers — just spacing and a 1px rule).

**Group 1 – Identity & Appearance:**
- Logo display toggle (pulls from tenant settings)
- Button label (text input, default "Submit")

**Group 2 – Notifications:**
- Staff notification email(s) — tag-style input, multiple addresses allowed
- Respondent confirmation email toggle + subject line input (shown when on)

**Group 3 – Submissions:**
- Allow multiple submissions toggle (default: off/blocked)
- Require contact_id URL toggle (Survey and Custom only — hidden for other types)

**Group 4 – Pipeline (Opportunity Intake only, or when triggered in Custom/Survey):**
- Opportunity trigger toggle (locked on for Opportunity Intake)
- Pipeline picker
- Stage picker

**Toggle styling:**
- iOS-style pill toggle: rounded track, sliding circle
- Tenant primary color when on, muted gray when off
- Label left, toggle right, flex row, baseline aligned
- Smooth `200ms` slide transition

### 3.7 Advanced Settings Section

Collapsed by default. Contains less commonly needed options.

**Contents vary by type — see gating table in Section 4.**

General advanced options:
- Submission limit (number input + toggle to enable)
- Expiration date/time (date picker + toggle to enable)
- Password protection (text input + toggle to enable)
- Post-submission redirect URL (replaces thank you message if set)
- Show "Done" button toggle
- Show "Take Again" button toggle
- Show results after submission (Custom only — see Section 4.3)
- Webhook URL (Custom only)
- Auto-tag on submission (tag picker — already exists)

### 3.8 Live Preview – Right Column

**⚠️ DEFERRED TO V3.** Builder is single-column. Do not implement. See Section 7.

---

## 4. Settings Gating by Type

### 4.1 Gating Table

| Setting | Person | Company | Opportunity | Event | Survey | Custom |
|---|---|---|---|---|---|---|
| Logo toggle | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Button label | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Staff notification email | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Respondent confirmation email | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Allow multiple submissions | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Require contact_id URL | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ |
| Opportunity trigger | ✗ | ✗ | 🔒 locked on | ✗ | ✓ | ✓ |
| Pipeline / stage picker | ✗ | ✗ | ✓ | ✗ | ✓ | ✓ |
| Submission limit | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Expiration date | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Password protection | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Show results after submission | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| Webhook URL | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| Auto-tag | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Post-submission redirect | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Show Done / Take Again buttons | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Field mapping | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

Settings not listed in a type's available set are hidden entirely — not grayed out, not shown with a lock icon. Just absent.

### 4.2 Require Contact ID URL – Survey Behavior

When this toggle is on:
- The form only accepts submissions arriving with a valid `?cid=[contactId]` in the URL
- Bare `/s/[surveyId]` links (without a contact ID) show a message: "This survey requires a personalized link. Please use the link that was sent to you."
- This is already architecturally supported by the existing contact ID tracking — this toggle just enforces it strictly

### 4.3 Show Results After Submission – Custom Display Choice

When this toggle is enabled in Custom (or Survey), a second control appears asking how results should be displayed. Four options rendered as small radio cards:

- **None** — don't show anything additional (default)
- **Submission count** — "X people have responded" shown on the thank you screen
- **Aggregate results** — charts and percentages per question shown after submission
- **Your response** — shows the respondent a summary of what they submitted

Only one option can be selected. The display choice is stored per form.

---

## 5. Intake List View

The existing list view for surveys carries over but should be updated to reflect the new type system.

**Each row in the list shows:**
- Form name
- Type badge (Person Intake / Company Intake / Opportunity Intake / Event / Survey / Custom) — colored pill per type
- Status badge (Draft / Live / Closed) — existing logic
- Response count
- Last updated
- Actions: Edit, View Results, Duplicate, Archive

**Type badge colors** (use existing CSS variable palette):
- Person Intake: blue
- Company Intake: teal
- Opportunity Intake: green
- Event: purple
- Survey: amber
- Custom: gray

---

## 6. Visual Micro-Interactions Reference

These are the specific motion and interaction details that make the builder feel premium. Claude Code should implement all of these:

- **Type selection card hover:** `translateY(-2px)` + accent glow shadow, `150ms ease`
- **Section card expand/collapse:** smooth `max-height` transition, chevron rotates `90deg`, `200ms ease`
- **Question card hover:** `translateY(-1px)` + slightly brighter border, `150ms ease`
- **Move buttons:** opacity `0.3` at rest → `1.0` on question card hover, `100ms`
- **Toggle switch:** circle slides `200ms ease`, track color transitions simultaneously
- **Required pill:** color transition from muted → green, `150ms`
- **Floating label:** `transform: translateY(-20px) scale(0.85)` on focus/fill, `150ms ease`
- **Add Question card:** dashed border pulses subtly on hover (border-color opacity animation)
- **Section accent bar:** fades in from left on expand, `200ms`

---

## 7. What NOT to Build

- ❌ No live preview — this is V3, not part of this spec (was discussed and deferred)
- ❌ No new record-linking logic — existing multi-record submission handling is already correct
- ❌ No new conditional logic UI — existing system carries over as-is
- ❌ No new multi-page UI — existing system carries over as-is
- ❌ No new results page — already built and looks good
- ❌ No new embed logic — SurveyPanel already handles this
- ❌ No new form status logic — Draft/Live/Closed already built
- ❌ No custom domain support — handled by existing embed/SurveyPanel approach
- ❌ No Petition type — deferred to future consideration
- ❌ No Volunteer Sign-Up type — covered by Person Intake with added questions

---

## 8. Files Likely Touched

This spec does not have full visibility into the existing file structure. Claude Code should identify the relevant files. Expected scope:

**New or heavily modified:**
- The survey/intake builder page component
- The survey list page component
- Any shared question card components
- Any shared settings panel components

**New:**
- Type selection screen component
- Survey starter template picker component (Survey type second step)

**Carry over without changes:**
- Results page
- SurveyPanel embed component
- Conditional logic components
- Multi-page components
- Field mapping components
- Form status logic
- Contact ID URL tracking

---

## 9. Patterns to Follow

- Match existing auth patterns — use `getTenant()` and `getCrmUser()`
- Use `makeSb(tenantId)` for all DB queries
- Use existing CSS variable system — `rgb(var(--card-700))`, `rgb(var(--border-600))`, `rgb(var(--primary-600))`, etc.
- Tenant primary and accent colors are already available via CSS variables — use them for all accent states
- No new design system — extend what exists
- No form tags — use onClick handlers and controlled state
- Follow existing toast pattern for save confirmations
- The type a form was created with should be stored on the form record and used to determine which settings are shown in the builder when re-editing

---

## 10. Conflicts With Existing System (Identified by Code Audit)

These are concrete gaps between what the spec assumes and what actually exists in the codebase. Resolve or note these before implementation begins.

---

### CONFLICT 1 — Internal Spec Contradiction: Live Preview
**✅ RESOLVED: Deferred to V3.**

Section 3.8 has been struck. Builder is single-column. No live preview in this build.

---

### CONFLICT 2 — `form_type` Column Does Not Exist in DB
**Severity: Blocker — migration required before any type-aware UI works**

The spec assumes forms have an explicit type stored on the record and that this type drives builder behavior when re-editing. The current `surveys` table has no `form_type` column — type is inferred at runtime from feature flags (`storefront_mode`, `opp_trigger`, etc.), not stored explicitly.

A migration adding `form_type text` (values: `person` | `company` | `opportunity` | `event` | `survey` | `custom`, default `custom`) is required before any type-gating logic can work. Existing forms should default to `custom` or `survey` based on their current configuration.

---

### CONFLICT 3 — Fifteen New Settings Columns Don't Exist
**Severity: Blocker — migration required**

The following settings exist in the spec but are absent from the `surveys` table schema (`lib/db/supabase-surveys.ts`):

| Column | Type | Notes |
|--------|------|-------|
| `button_label` | `text` | Default "Submit" |
| `logo_display_enabled` | `boolean` | Default true |
| `staff_notification_emails` | `text[]` | Nullable |
| `respondent_confirmation_email_enabled` | `boolean` | Default false |
| `respondent_confirmation_email_subject` | `text` | Nullable |
| `allow_multiple_submissions` | `boolean` | Default false |
| `require_contact_id_url` | `boolean` | Default false |
| `submission_limit` | `integer` | Nullable — null = unlimited |
| `expiration_at` | `timestamptz` | Nullable |
| `password_hash` | `text` | Nullable — store hashed, not plaintext |
| `post_submission_redirect_url` | `text` | Nullable — distinct from `post_submit_survey_id` |
| `show_results_after_submission` | `boolean` | Default false |
| `results_display_mode` | `text` | `none` \| `count` \| `aggregate` \| `your_response` |
| `webhook_url` | `text` | Nullable |

All 14 columns need to be added in a single migration. The TypeScript `Survey` type in `lib/db/supabase-surveys.ts` also needs updating to include all of them.

---

### CONFLICT 4 — Route Location: `/crm/survey` vs `/crm/intake`
**Severity: Medium — structural change**

The spec puts everything at `/crm/intake`, but the entire existing system lives at `/crm/survey` (pages, nav link in `CrmHeader.tsx`, internal links throughout). Three options:
1. Rename the directory (`app/crm/survey/` → `app/crm/intake/`) — clean break, need to verify nothing else hard-codes the old path
2. Keep `/crm/survey` working and add `/crm/intake` as an alias with redirects
3. Rename the UI label only and leave the path as-is

Recommended: rename the directory and update the nav link + any internal references. The API routes (`/api/survey/...`) can stay as-is — the URL is implementation detail, not user-facing.

Files that must be updated if renamed:
- `app/crm/survey/` → `app/crm/intake/` (all pages inside)
- `app/components/crm/CrmHeader.tsx` line ~40: `href: "/crm/survey"` → `"/crm/intake"`, label `"Surveys"` → `"Intake"`
- Any `<Link href="/crm/survey...">` references elsewhere

---

### CONFLICT 5 — "Company" Record Type Has No Backing Table
**✅ RESOLVED: Companies table confirmed to exist.**

Company Intake can be implemented as described. Use the existing companies table for `company.*` CRM field mappings. The multi-record submission path (company + linked contact) should work through the existing intake API route the same way other multi-record submissions do.

---

### CONFLICT 6 — Draft/Live/Closed Status Is Not Actually Stored
**✅ RESOLVED: Build it properly per spec.**

Add a `status text NOT NULL DEFAULT 'draft'` column to the `surveys` table. Values: `draft` | `live` | `closed`. Backfill: existing surveys with any active_channels set → `live`; all others → `draft`. The Active Channels section in the builder remains but is subordinate to the status field — a `live` form is live on the channels selected; a `draft` form is never publicly accessible regardless of channels; a `closed` form shows a "This form is closed" message.

---

### CONFLICT 7 — `respondent_confirmation_email` Has No Email Infrastructure
**✅ RESOLVED: Resend is already integrated.**

Implement fully — UI, DB column, and send logic. Wire into the survey submit API route (`app/api/survey/complete/route.ts` or `panel-submit`) using the existing Resend integration. When `respondent_confirmation_email_enabled` is true and the respondent provided an email address, send using the configured subject line and a simple thank-you body. Reuse the same Resend client/helper already in the codebase.

---

### CONFLICT 8 — Three Settings Require Server-Side Enforcement, Not Just UI
**Severity: High — store-only is not sufficient for these**

The following settings require enforcement in the server-side API routes, not just the builder UI:

| Setting | Where to enforce |
|---------|-----------------|
| `submission_limit` | `app/api/survey/panel-submit/route.ts`, `app/api/survey/complete/route.ts` — check count before accepting |
| `expiration_at` | `app/s/[surveyId]/page.tsx`, `app/survey/[surveyId]/page.tsx` — block render if past expiration |
| `password_hash` | Same public entry pages — gate display behind password check |
| `require_contact_id_url` | `app/s/[surveyId]/page.tsx` — block if `cid` query param absent |

Each of these needs both a builder UI toggle AND server-side enforcement code. Implementation effort is roughly double what a store-only toggle would require.

---

### CONFLICT 9 — Drag-and-Drop Reorder
**✅ RESOLVED: Keep move-up/move-down buttons.**

DnD is not implemented. The existing `↑ ↓` buttons are kept but get a full visual polish pass — compact icon-only buttons, fade in on card hover matching the micro-interaction spec, consistent with the premium dark ops aesthetic. No DnD library is added in this build.

---

### CONFLICT 10 — Existing Settings Not Mentioned in Spec Must Be Preserved
**Severity: Low — omission risk**

The current builder has several settings that the spec does not mention. These are real features used in production and must not be silently dropped during the redesign:

- `op_intake_channels` — controls which PWA channels use this as their default intake form (doors, dials, texts, etc.)
- `view_config` — per-channel pagination mode and page layout builder (one_at_a_time / all_at_once / pages)
- `payment_enabled` — payment gate after submission
- `post_submit_survey_id` + `post_submit_required` + `post_submit_header` — form chaining
- `storefront_mode` / `delivery_enabled` / `order_products` — storefront/order form configuration
- `learn_more_label` — button label for the learn more URL
- `prefill_contact` — auto-fill known contact info (distinct from field mapping)
- User assignments — which users see this form in their PWA

All of these should be preserved under Advanced Settings, even if not called out in the spec's section breakdown. The Custom type should expose all of them.

---

## 11. Implementation To-Do

Ordered by dependency. Each phase should be complete before the next begins.

---

### PHASE 0 — Pre-Build Decisions
**All decisions made. No blockers.**

| Decision | Resolution |
|----------|-----------|
| Live preview | Deferred to V3. Builder is single-column. Section 3.8 struck. |
| Company table | Confirmed exists. Company Intake implements as designed. |
| Status column | Add formal `status text` column (`draft`/`live`/`closed`). Backfill from `active_channels`. |
| Route rename | Rename `/crm/survey` → `/crm/intake`. API routes stay at `/api/survey`. |
| Email provider | Resend already integrated. Confirmation email implements fully. |
| Question reorder | Keep move-up/down buttons, polish visually. No DnD library. |

---

### PHASE 1 — Database Migration
**Depends on:** Phase 0 decisions on status column and company table.

- [ ] Write migration file `20260514000000_intake_builder_v2.sql`:
  - Add `form_type text NOT NULL DEFAULT 'custom'` to `surveys`
  - Add `button_label text` to `surveys`
  - Add `logo_display_enabled boolean NOT NULL DEFAULT true` to `surveys`
  - Add `staff_notification_emails text[]` to `surveys`
  - Add `respondent_confirmation_email_enabled boolean NOT NULL DEFAULT false` to `surveys`
  - Add `respondent_confirmation_email_subject text` to `surveys`
  - Add `allow_multiple_submissions boolean NOT NULL DEFAULT false` to `surveys`
  - Add `require_contact_id_url boolean NOT NULL DEFAULT false` to `surveys`
  - Add `submission_limit integer` to `surveys` (null = unlimited)
  - Add `expiration_at timestamptz` to `surveys`
  - Add `password_hash text` to `surveys`
  - Add `post_submission_redirect_url text` to `surveys`
  - Add `show_results_after_submission boolean NOT NULL DEFAULT false` to `surveys`
  - Add `results_display_mode text NOT NULL DEFAULT 'none'` to `surveys`
  - Add `webhook_url text` to `surveys`
  - Add `status text NOT NULL DEFAULT 'draft'` to `surveys`; backfill: rows with any `active_channels` set → `'live'`, all others → `'draft'`
  - Run `supabase db push` or apply via dashboard

- [ ] Update `Survey` type in `lib/db/supabase-surveys.ts` to include all new columns
- [ ] Update `updateSurvey()` params type in `lib/db/supabase-surveys.ts` to accept all new columns

---

### PHASE 2 — Route Restructure
**Depends on:** Phase 0 route rename decision.

- [ ] If renaming: move `app/crm/survey/` directory to `app/crm/intake/`
  - `page.tsx` → list view (update heading "Surveys" → "Intake")
  - `new/page.tsx` → new intake flow entry
  - `[surveyId]/edit/page.tsx` → builder
  - `[surveyId]/results/page.tsx` → results (can stay or redirect)
- [ ] Update `CrmHeader.tsx`: `href: "/crm/survey"` → `"/crm/intake"`, label `"Surveys"` → `"Intake"`
- [ ] Grep entire codebase for `"/crm/survey"` and update all references
- [ ] If keeping old path: add `app/crm/intake/page.tsx` that redirects to `/crm/survey`

---

### PHASE 3 — Type Selection Screen
**Depends on:** Phase 2 (needs a target route for "New Intake").

- [ ] Create `app/components/intake/IntakeTypeSelector.tsx`:
  - Six type cards in 2×3 grid
  - All hover, selected, and transition states per Section 3.2
  - Survey card triggers second step (starter template picker) rather than navigating immediately
  - Other types navigate directly to builder with `?type=person` etc. in URL
- [ ] Create `app/components/intake/SurveyStarterPicker.tsx`:
  - Two-card choice: Support/Oppose vs Top Issue
  - Back link to return to type grid
  - Navigates to builder with `?type=survey&starter=support_oppose` or `&starter=top_issue`
- [ ] Wire `app/crm/intake/new/page.tsx` to render `IntakeTypeSelector`

---

### PHASE 4 — Builder: Pre-configuration by Type
**Depends on:** Phase 3 (type param must flow from type selector into builder).

- [ ] In the new/edit builder page, read `?type` and `?starter` from URL params on initial load
- [ ] On new form creation (POST `/api/survey`), write `form_type` from the URL param
- [ ] Build `getTypeDefaults(type, starter?)` helper that returns:
  - Pre-configured question array per type (Section 2)
  - Default settings object per type (opp_trigger locked, allow_multiple default, etc.)
- [ ] Apply defaults on creation: call `createQuestion()` for each pre-filled question in order
- [ ] For Opportunity Intake: `opp_trigger.enabled = true`, lock the toggle in UI (disabled state, not hidden)
- [ ] On edit load: read `form_type` from the saved survey record to determine which settings to show

---

### PHASE 5 — Builder Visual Redesign
**Depends on:** Phase 4 (builder must know the form type before rendering gated settings).
**This is the largest phase — `SurveyBuilder.tsx` is 121KB and is being substantially restructured.**

- [ ] Restructure builder to single-column layout (live preview deferred). Full-width, max ~860px, centered.

**Section card pattern (applies to all four sections):**
- [ ] Create `SectionCard` component: collapsible, chevron, accent bar on expand, glassmorphism background, collapsed summary line
- [ ] Implement `max-height` CSS transition for smooth expand/collapse, `200ms ease`
- [ ] Chevron rotates `90deg` on expand

**Form Details section:**
- [ ] Move: title, display_title, display_description, public_slug (+ copy button), thankyou_message, footer_text, website_url into this section
- [ ] Implement floating label input pattern (`FloatingInput` component or inline CSS)
- [ ] Bottom-border-only input style (no box border)
- [ ] Focus state: bottom border → tenant primary color
- [ ] Character count on title/header fields

**Questions section:**
- [ ] Redesign question cards per Section 3.5:
  - Move up / move down icon buttons (existing logic, new visual treatment — fade in on hover, icon-only, `100ms` opacity transition)
  - Type badge (colored pill per question type category)
  - Required pill toggle (green when on, transition `150ms`)
  - `···` context menu replacing individual action buttons (edit / duplicate / delete)
- [ ] Question card hover: `translateY(-1px)` + brighter border
- [ ] Drag handle: opacity `0.3` → `1.0` on card hover
- [ ] "Add Question" card: full-width dashed border, hover pulse animation

**Settings section:**
- [ ] Reorganize into four sub-groups per Section 3.6 with dividers
- [ ] Implement iOS-style toggle component (pill track, sliding circle, `200ms` transition)
- [ ] Apply type gating: hide settings not in the type's allowed set (Section 4.1)
- [ ] Lock Opportunity trigger toggle for Opportunity Intake (show but disabled)
- [ ] Staff notification emails: tag-style multi-input
- [ ] Respondent confirmation email: toggle + conditional subject line input

**Advanced Settings section:**
- [ ] Collapsed by default
- [ ] Move all advanced options here: submission_limit, expiration_at, password_hash, post_submission_redirect_url, show_results_after_submission (+ results_display_mode radio cards), webhook_url, auto_fields (auto-tag picker), show_take_again, show_done, post_submit_survey_id, op_intake_channels, view_config, payment_enabled, storefront settings, prefill_contact
- [ ] `show_results_after_submission` toggle: when on, show four radio cards (None / Count / Aggregate / Your Response)
- [ ] Apply type gating here too (webhook_url and show_results only for Custom)

**Micro-interactions (throughout):**
- [ ] All transitions from Section 6 implemented
- [ ] Section accent bar fade-in on expand

---

### PHASE 6 — Server-Side Enforcement
**Depends on:** Phase 1 (columns must exist).

- [ ] `submission_limit`: in `app/api/survey/panel-submit/route.ts` and `app/api/survey/complete/route.ts`, query current response count; if `>= submission_limit`, return 403 with `{"error": "This form has reached its submission limit"}`
- [ ] `expiration_at`: in `app/s/[surveyId]/page.tsx` and `app/survey/[surveyId]/page.tsx`, if `expiration_at` is set and past, render a "This form is closed" page instead of the form
- [ ] `password_hash`: in the same public entry pages, if `password_hash` is set, render a password gate UI first; validate submitted password server-side (bcrypt compare)
- [ ] `require_contact_id_url`: in `app/s/[surveyId]/page.tsx`, if `require_contact_id_url` is true and no `cid` query param is present, render the "This survey requires a personalized link" message
- [ ] `webhook_url`: in `app/api/survey/complete/route.ts`, if `webhook_url` is set, fire a POST with the session data after successful submission (fire-and-forget with try/catch)
- [ ] `show_results_after_submission` + `results_display_mode`: in the completion flow, if enabled, pass the display mode through to the thank-you screen in SurveyPanel so it can render the appropriate post-submit view
- [ ] `respondent_confirmation_email_enabled`: in `app/api/survey/complete/route.ts` (and `panel-submit`), after saving the session, if enabled and the respondent's email address is captured, send via Resend using the configured subject line and a standard thank-you body template
- [ ] `status` enforcement: in `app/s/[surveyId]/page.tsx` and `app/survey/[surveyId]/page.tsx`, if `status === 'draft'` return a 404 (not publicly accessible); if `status === 'closed'` render a "This form is closed" page. `status === 'live'` proceeds normally.

---

### PHASE 7 — List View Update
**Depends on:** Phase 1 (form_type column must exist), Phase 2 (correct route).

- [ ] Rewrite `app/crm/intake/page.tsx` (formerly `survey/page.tsx`):
  - Switch from card-per-survey layout to a proper table/list-row layout (the spec describes tabular columns: name, type badge, status badge, response count, last updated, actions)
  - Add Type badge per type with colors from Section 5
  - Add Status badge from `status` column: `draft` = gray, `live` = green, `closed` = red/muted
  - Response count (already available via `total_responses`)
  - Last updated (`updated_at`)
  - Actions row: Edit, View Results, Duplicate, Archive (Archive = set `active: false` and all channels empty, or set `status: 'closed'`)
  - "New Intake" button links to `/crm/intake/new`

---

### PHASE 8 — Nav and Polish
**Depends on:** All prior phases.

- [ ] Confirm `CrmHeader.tsx` nav entry reads `"Intake"` with the right href
- [ ] Smoke-test all six type flows: select type → builder opens with correct pre-fills and correct settings visible
- [ ] Smoke-test Survey two-step: both starters load correct questions
- [ ] Smoke-test existing surveys (no `form_type`): should default to `custom`, show all settings
- [ ] Smoke-test results page still works (no changes needed, verify link is correct)
- [ ] Smoke-test SurveyPanel embed (no changes needed, verify `form_type` column doesn't break anything)
- [ ] Test server-side enforcement for at least submission_limit and expiration_at
- [ ] Confirm move-up/down buttons are polished and behave correctly on first/last question (disable top button on first, bottom button on last)

---

## 12. Onboarding Templates

### 12.1 Purpose

When a new tenant is provisioned, they should be able to start with pre-built, ready-to-use intake forms rather than a blank slate. Initially this is applied programmatically during sign-up. In the near future, the onboarding/sign-up flow will present a template picker UI where the tenant selects which ones they want.

### 12.2 Template Architecture

Templates are defined as **static JSON config in code** (`lib/intake-templates.ts`). This keeps them versioned in git, easy to edit, and reusable without a separate DB table or tenant.

Each template is a plain object that matches the shape of an existing survey + questions creation request. No new data model needed — applying a template = creating a survey with pre-filled questions, identical to what the type selector already does in Phase 4.

**Template structure:**
```ts
type IntakeTemplate = {
  id: string;                // slug, e.g. "person-intake", "survey-support-oppose"
  name: string;              // display name in picker UI
  description: string;       // one-liner shown in picker
  type: FormType;            // person | company | opportunity | event | survey | custom
  category: string;          // grouping label, e.g. "Contact Capture", "Field Ops", "Surveys"
  survey: Partial<Survey>;   // settings/fields to set on the survey record
  questions: Partial<Question>[];  // pre-filled questions in order
}
```

### 12.3 Template Set

15 templates across 5 categories. Templates are pre-configured starting points — `getTypeDefaults()` from Phase 4 is the authoritative source for each type's defaults; templates that match a type exactly just call through to it. Templates with richer or different question sets define their own question arrays.

---

#### Category: Contact Capture

**`contact-form`** — Contact Form *(was "Person Intake")*
- Type: `person`
- Pre-fills: First Name, Last Name, Phone, Email (all required, all mapped)
- Settings: multiple submissions off, opp trigger off
- Notes: The universal default. Calling it "Contact Form" instead of "Person Intake" matches how every other form builder labels this.

**`newsletter-signup`** — Newsletter Sign-Up
- Type: `person`
- Pre-fills: First Name (required), Email (required, mapped), ZIP Code (text, optional), Which updates would you like? (multi-select: Events / Campaign Updates / Volunteer Opportunities / Policy News)
- Settings: multiple submissions off, button label "Subscribe"
- Notes: Minimal form for list growth. No phone — lower friction is the point.

**`volunteer-signup`** — Volunteer Sign-Up
- Type: `person`
- Pre-fills: First Name, Last Name, Email, Phone (all required, mapped), then:
  - What skills do you have? (multi-select: Canvassing / Phone Banking / Data Entry / Event Planning / Social Media / Writing / Bilingual / Other)
  - When are you available? (multi-select: Weekday mornings / Weekday afternoons / Weekday evenings / Weekends)
  - What are you most interested in doing? (multi-select: Canvassing / Phone Banking / Events / Office / Other)
  - How did you hear about us? (dropdown)
- Settings: multiple submissions off
- Notes: Core organizing tool. Feeds directly into volunteer tracking via CRM field mapping.

**`petition`** — Petition
- Type: `person`
- Pre-fills: First Name (required, mapped), Last Name (required, mapped), Email (required, mapped), Address (mapped), City, ZIP Code, I have read and support this petition (yes_no, required, not mapped)
- Optional trailer: Comments (textarea, optional)
- Settings: multiple submissions off, button label "Sign Petition"
- Notes: Signature collection. The yes_no field is the "sign here" moment — label it so in the question text.

---

#### Category: Business

**`business-contact`** — Business Contact *(was "Company Intake")*
- Type: `company`
- Same as the Company type defaults from Section 2.2
- Notes: Renamed for clarity.

---

#### Category: Sales & Fundraising

**`order-form`** — Order Form *(was "Opportunity Intake")*
- Type: `opportunity`
- Same as the Opportunity type defaults from Section 2.3 — opp trigger locked on
- Notes: Renamed for clarity.

**`donation-form`** — Donation Form
- Type: `opportunity`
- Pre-fills: First Name (required, mapped), Last Name (required, mapped), Email (required, mapped), Phone (mapped), then:
  - How much would you like to donate? (dropdown: $25 / $50 / $100 / $250 / $500 / Other — mapped to opportunity.amount)
  - Would you like to make this a monthly gift? (yes_no)
  - Message or dedication (textarea, optional)
  - How did you hear about us? (dropdown)
- Settings: opp trigger on (mode: always), button label "Donate"
- Notes: Contact capture + pipeline entry for fundraising. Actual payment processing is separate — this is the intake form.

---

#### Category: Events

**`event-registration`** — Event Registration
- Type: `event`
- Same as the Event type defaults from Section 2.4
- Notes: Matches the existing event default exactly.

**`volunteer-shift`** — Volunteer Shift Sign-Up
- Type: `event`
- Pre-fills: First Name (required, mapped), Last Name (required, mapped), Email (required, mapped), Phone (required, mapped), then:
  - Which shift are you signing up for? (dropdown — admin fills options before publishing)
  - Have you volunteered with us before? (yes_no)
  - Do you need parking or transportation assistance? (yes_no)
  - Any notes or questions? (textarea, optional)
- Settings: submission limit toggle recommended (admin should set capacity), multiple submissions off
- Notes: Distinct from Event Registration — this is for capacity-constrained volunteer shifts, not general attendee RSVP.

---

#### Category: Field Surveys

**`canvass-survey`** — Canvass Survey
- Type: `survey`
- Pre-fills (contact capture first, then survey):
  - First Name (text, mapped → contact.first_name, required)
  - Last Name (text, mapped → contact.last_name)
  - Phone (phone, mapped → contact.phone)
  - Email (email, mapped → contact.email, optional)
  - Are you a registered voter? (yes_no)
  - Do you support [candidate / issue]? (multiple_choice: Strong Support / Lean Support / Undecided / Lean Oppose / Strong Oppose)
  - What is your most important issue? (dropdown: Economy & Jobs / Public Safety / Education / Healthcare / Environment / Housing / Immigration / Other)
  - How likely are you to vote? (multiple_choice: Definitely / Probably / Maybe / Probably Not / Definitely Not)
  - Are you interested in volunteering? (yes_no)
- Settings: multiple submissions blocked, opp trigger off
- Notes: The core field ops survey. Covers voter ID, supporter level, issue ID, vote likelihood, and volunteer flag in one form. Admin should customize the candidate/issue name in the support question and add any local questions.

**`support-oppose`** — Support / Oppose Survey
- Type: `survey`
- Same as Survey Starter A from Section 2.5
- Notes: Pure opinion poll, no contact capture by default. Admin adds contact questions if needed.

**`top-issue`** — Top Issue Survey
- Type: `survey`
- Same as Survey Starter B from Section 2.5

**`poll-10`** — 10-Question Poll
- Type: `survey`
- Pre-fills (generic political opinion poll — admin customizes placeholders):
  1. How would you rate the job [official] is doing? (multiple_choice: Excellent / Good / Fair / Poor)
  2. Do you feel [city/state] is heading in the right or wrong direction? (multiple_choice: Right direction / Wrong direction / Not sure)
  3. Do you support [policy]? (multiple_choice: Strongly Support / Support / Neutral / Oppose / Strongly Oppose)
  4. What is the most important issue facing our community? (dropdown: Economy & Jobs / Public Safety / Education / Healthcare / Environment / Housing / Immigration / Other)
  5. How likely are you to vote in the next election? (multiple_choice: Definitely / Probably / Maybe / Probably Not / Definitely Not)
  6. Which party do you most identify with? (multiple_choice: Democrat / Republican / Independent / Other / Prefer not to say)
  7. Age range? (multiple_choice: 18–25 / 26–35 / 36–45 / 46–55 / 56–65 / 65+)
  8. How long have you lived in [city/district]? (multiple_choice: Less than 1 year / 1–5 years / 5–10 years / More than 10 years)
  9. Any other comments? (textarea, optional)
  10. May we follow up with you? (email, optional, mapped → contact.email)
- Settings: multiple submissions blocked
- Notes: Bracket questions (1–3) have placeholder text in [brackets] — admin fills them in before publishing. Intentionally generic so it works for any campaign context.

**`feedback-form`** — Feedback Form
- Type: `survey`
- Pre-fills:
  - How would you rate your overall experience? (rating: 1–5)
  - What did we do well? (textarea, optional)
  - What could we improve? (textarea, optional)
  - How likely are you to recommend us to a friend? (multiple_choice: Very Likely / Likely / Neutral / Unlikely / Very Unlikely)
  - Any other comments? (textarea, optional)
- Settings: multiple submissions allowed (on), opp trigger off
- Notes: General satisfaction survey. No contact capture by default — admin adds if needed.

**`wspq`** — World's Smallest Political Quiz
- Type: `survey` (special — see WSPQ handling note below)
- Pre-fills (10 questions, 5 personal + 5 economic, fixed answer options: Agree / Maybe / Disagree):
  - **Personal Freedom (Q1–5):**
    1. Government should not censor speech, press, media or Internet.
    2. Military service should be voluntary. There should be no draft.
    3. There should be no laws regarding sex between consenting adults.
    4. Repeal laws prohibiting adult possession and use of drugs.
    5. There should be no National ID card.
  - **Economic Freedom (Q6–10):**
    6. End "corporate welfare." No government handouts to business.
    7. End government barriers to international free trade.
    8. Let people control their own retirement; privatize Social Security.
    9. Replace government welfare with private charity.
    10. Cut taxes and government spending by 50% or more.
  - (Optional contact capture appended after Q10): First Name, Last Name, Email, Phone
- Settings: multiple submissions blocked, results display on (aggregate), button label "See My Results"
- **WSPQ Special Handling:** This template requires custom logic in `apply-templates`:
  - Survey ID must be set to `wspq-${tenantId}` (the WSPQ scoring/results logic detects this prefix)
  - Idempotency check: skip if a survey with ID `wspq-${tenantId}` already exists for this tenant (do not use title-matching)
  - Do not use `createSurvey()` helper directly — set the ID explicitly via a raw insert
  - Questions must use `question_type: 'multiple_choice'` with options `["Agree", "Maybe / Unsure", "Disagree"]` and `order_index: 1–10`
  - The existing `SurveyPanel.tsx` scoring and results display logic already handles this automatically once the survey ID prefix is correct

---

**Template count: 15** across 5 categories (Contact Capture × 4, Business × 1, Sales & Fundraising × 2, Events × 2, Field Surveys × 6)

### 12.4 Applying Templates to a Tenant

**API endpoint:** `POST /api/crm/intake/apply-templates`

Request body: `{ tenantId: string, templateIds: string[] }`

For each template ID:
1. Look up the template definition in `INTAKE_TEMPLATES`
2. Create the survey record via the existing `createSurvey()` helper, writing `form_type`, `status: 'draft'`, and any settings from the template
3. Create each question in order via `createQuestion()`, preserving `order_index`
4. Return the created survey IDs

This endpoint uses `getTenant()` auth (same as all CRM routes).

**Idempotency:** Standard templates skip if a survey with the same title already exists for the tenant. The WSPQ template skips if a survey with ID `wspq-${tenantId}` already exists — do not use title-matching for it.

**WSPQ exception:** The `apply-templates` endpoint must handle `wspq` as a special case. Instead of calling `createSurvey()`, do a raw upsert with the explicit ID `wspq-${tenantId}`. The survey ID prefix is what triggers special scoring/results rendering in `SurveyPanel.tsx` and `ResultsDashboard.tsx` — this is load-bearing and cannot be a random UUID.

**Called from tenant provisioning:** Wherever new tenants are created in the codebase (admin signup route or tenant seed script), call this endpoint with all template IDs after tenant creation completes. The initial default is to apply all templates automatically.

### 12.5 Onboarding Picker UI (Near Future)

When the sign-up/onboarding flow is built, this step should be added:

**"Start with templates" step:**
- Shows template cards (similar visual treatment to the type selection screen — Section 3.2)
- Grouped by category
- Each card: template name, type badge, description, question count preview
- Multi-select — tenants can pick none, some, or all
- "Skip" option available
- On confirm: calls `POST /api/crm/intake/apply-templates` with selected IDs

The template definitions in `lib/intake-templates.ts` are the source of truth for this UI — no hardcoded lists in the component.

---

### PHASE 9 — Onboarding Templates
**Depends on:** Phase 1 (surveys table must have `form_type` and `status`), Phase 4 (`getTypeDefaults()` must exist).

- [ ] Create `lib/intake-templates.ts` with `INTAKE_TEMPLATES` array — define all 15 templates from Section 12.3
- [ ] Refactor `getTypeDefaults()` from Phase 4 to be the canonical source: both the type selector (new intake flow) and the template definitions call this helper, so question/setting definitions live in one place
- [ ] Create `app/api/crm/intake/apply-templates/route.ts`:
  - `POST` handler, auth via `getTenant()`
  - Accepts `{ templateIds: string[] }` (tenant resolved from auth, not body)
  - For standard templates: create survey + questions via existing helpers; idempotent on title
  - For `wspq` template: raw insert with ID `wspq-${tenantId}`; idempotent on that specific ID
  - Return `{ created: Survey[], skipped: string[] }`
- [ ] Wire into tenant provisioning: find wherever new tenants are created and call `apply-templates` with all template IDs as the default onboarding set
- [ ] Add a manual trigger in the CRM (for testing and for admins who missed onboarding): a button or admin route like `POST /api/crm/intake/apply-templates` callable from the Intake list view via a "Load starter templates" option when the list is empty
- [ ] Document the template format in `lib/intake-templates.ts` with a comment so future templates can be added easily
