# GuerrillaSuite — Intake Builder Rebuild
## Feature Spec for Claude Code
**Status:** V2 — Redesign of existing SurveyBuilder
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

### 1.1 The Entry Point — New Intake Type Selection Screen

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

### 1.2 The Builder — Visual Redesign

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

**Starter A — Support / Oppose:**
- Do you support [issue]? (Yes / No / No Opinion)
- How strongly? (Multiple choice: Strongly / Somewhat / Not very)
- Comments (textarea, optional)

**Starter B — Top Issue:**
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

**Two-column layout:**
- Left column (main): collapsible section cards, stacked vertically, ~65% width
- Right column: live preview popout card, ~35% width, sticky

**Left column sections (in order):**
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
- Drag-and-drop reorder (already works, just needs visual polish)

**Card hover:** slight lift, drag handle brightens

**Add Question button:** full-width dashed border card below the last question. Click opens a question type picker (existing UI, just needs visual polish to match).

### 3.6 Settings Section

Contains all primary settings visible without scrolling. Organized into logical sub-groups with a subtle divider between groups (no sub-headers — just spacing and a 1px rule).

**Group 1 — Identity & Appearance:**
- Logo display toggle (pulls from tenant settings)
- Button label (text input, default "Submit")

**Group 2 — Notifications:**
- Staff notification email(s) — tag-style input, multiple addresses allowed
- Respondent confirmation email toggle + subject line input (shown when on)

**Group 3 — Submissions:**
- Allow multiple submissions toggle (default: off/blocked)
- Require contact_id URL toggle (Survey and Custom only — hidden for other types)

**Group 4 — Pipeline (Opportunity Intake only, or when triggered in Custom/Survey):**
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

### 3.8 Live Preview — Right Column

A sticky card on the right side of the builder that renders a simplified live preview of the public-facing form as the admin builds it.

**Behavior:**
- Updates in real time as questions are added/edited and settings change
- Not a full render — a faithful simplified representation
- Shows: public header, description, questions in order with their labels and input types, submit button with current label
- Does NOT show: conditional logic branches, multi-page breaks, advanced styling

**Card design:**
- Label at top: `Preview` in small muted caps
- Thin device frame mockup (rounded rectangle border suggesting a browser/phone)
- Form rendered inside the frame using muted versions of the tenant colors
- Submit button rendered in tenant primary color

**Mobile/Desktop toggle:**
- Two small icon buttons at the top right of the preview card: `□` (desktop) and `📱` (mobile)
- Mobile default — frame narrows to ~375px equivalent
- Desktop switches to wider frame

**Scroll behavior:**
- Preview card is `position: sticky; top: 24px` so it stays visible as the admin scrolls through the builder sections

---

## 4. Settings Gating by Type

### 4.1 Gating Table

| Setting | Person | Company | Opportunity | Event | Survey | Custom |
|---|---|---|---|---|---|---|
| Logo toggle | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Button label | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Staff notification email | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Respondent confirmation email | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Allow multiple submissions | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Require contact_id URL | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Opportunity trigger | ❌ | ❌ | 🔒 locked on | ✅ | ✅ | ✅ |
| Pipeline / stage picker | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Submission limit | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Expiration date | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Password protection | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Show results after submission | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Webhook URL | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Auto-tag | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Post-submission redirect | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Show Done / Take Again buttons | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Field mapping | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

Settings not listed in a type's available set are hidden entirely — not grayed out, not shown with a lock icon. Just absent.

### 4.2 Require Contact ID URL — Survey Behavior

When this toggle is on:
- The form only accepts submissions arriving with a valid `?cid=[contactId]` in the URL
- Bare `/s/[surveyId]` links (without a contact ID) show a message: "This survey requires a personalized link. Please use the link that was sent to you."
- This is already architecturally supported by the existing contact ID tracking — this toggle just enforces it strictly

### 4.3 Show Results After Submission — Custom Display Choice

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
- **Drag handle:** opacity `0.3` at rest → `1.0` on question card hover, `100ms`
- **Toggle switch:** circle slides `200ms ease`, track color transitions simultaneously
- **Required pill:** color transition from muted → green, `150ms`
- **Floating label:** `transform: translateY(-20px) scale(0.85)` on focus/fill, `150ms ease`
- **Add Question card:** dashed border pulses subtly on hover (border-color opacity animation)
- **Section accent bar:** fades in from left on expand, `200ms`
- **Preview card update:** content fades briefly (`opacity 0.7 → 1`) when questions change, `100ms`

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
