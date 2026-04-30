# GuerrillaSuite — Error Pages, Empty States & Toast System
## Feature Spec for Claude Code
**Status:** Pre-development planning
**Suite:** GuerrillaSuite / GroundGame
**Scope:** All error states, access walls, auth states, empty states, load failures, and action feedback across the product

---

## 0. Philosophy & Tone

GuerrillaSuite runs on a military ops naming convention. Every error, wall, and empty state should feel like a field report — terse, self-aware, never panicked, occasionally funny. The system has a personality. It owns its mistakes. It doesn't suffer fools.

### Tonal Rules

**When it's our fault (server errors, outages):** Own it. Be self-deprecating. The worse the outage, the more we can lean into the absurdity. *"Our servers are having an existential crisis"* is appropriate when the servers are literally down.

**When it's the user's fault (wrong URL, no permission):** Dry, confident, not apologetic. We don't take the blame. *"You haven't been cleared for this sector"* — delivered without judgment, but also without a sorry.

**Empty states (no data yet):** Informative and motivating. Not an error. Feels like a mission brief before the operation starts.

**Boundary conditions (limits, locks):** Matter-of-fact ops voice. The system is doing its job and telling you about it.

### Copy Structure

Every error surface has two text layers:

```
[ROTATING HEADLINE]   "Intel suggests this location doesn't exist."
[STATIC SUB-LINE]     Double-check the URL or return to the dashboard.
[CTA BUTTON]          ← Back to base
```

The rotating headline is where the personality lives. The sub-line is always static and always useful — it tells the user exactly what to do. This separation means personality never comes at the cost of clarity.

Headline pools contain **3–4 options** per scenario. The selection is seeded from `Math.random()` on component mount — no persistence, no cookies. Just a different line on each load. The pool should feel like different members of the same ops team wrote each one — same voice, slight variation in phrasing.

### Rotation Implementation Pattern

```tsx
// At the top of each error component — useMemo with no deps so it picks once on mount
// Must be "use client" for this pattern to work without hydration mismatch
const HEADLINES = [
  "Intel suggests this location doesn't exist.",
  "We sent you to a dead grid.",
  "Target not found. This route has gone dark.",
  "Nothing at these coordinates.",
];

const headline = useMemo(
  () => HEADLINES[Math.floor(Math.random() * HEADLINES.length)],
  [] // eslint-disable-line react-hooks/exhaustive-deps
);
```

All full-page error components are `"use client"` — see Section 10 for reasoning.

---

## 1. Glitch Animation System

The glitch effect is the centerpiece of all full-page error screens. It runs in three phases.

### Phase Structure

**Phase 1 — Impact (0–0.8s):** Aggressive. Multiple clip-path slices jumping, chromatic aberration at full width, brief brightness spike, slight horizontal shake on the whole element. This is the moment something broke.

**Phase 2 — Stabilizing (0.8s–2.2s):** Visibly calming. Slices become less frequent and smaller, aberration tightens, shake stops. The system is trying to recover.

**Phase 3 — Idle (2.2s+):** Subtle. A slow flicker every ~5 seconds — a single clip-path slice shift, text-shadow drifting slightly. Runs indefinitely via `animation-delay` on a looping idle keyframe. The system is "up" but clearly not fully healthy.

The idle phase is what makes the page feel alive. Sitting on a 500 error for 30 seconds and watching it still faintly glitch in the background is the detail that makes this feel crafted.

### CSS Implementation

Define as a `<style>` block inside the error page component — not in `globals.css`. Scoped to error pages only.

```css
/* Phase 1 + 2 — entrance glitch, runs once */
@keyframes glitch-entrance {
  0%   { clip-path: inset(0 0 100% 0); transform: translateX(0); filter: brightness(1); }
  5%   { clip-path: inset(20% 0 60% 0); transform: translateX(-4px); filter: brightness(2.5); }
  8%   { text-shadow: -6px 0 #ff0040, 6px 0 #00ffff; }
  10%  { clip-path: inset(0 0 0 0); transform: translateX(3px); filter: brightness(1); }
  14%  { clip-path: inset(55% 0 30% 0); transform: translateX(-2px); }
  18%  { clip-path: inset(0 0 0 0); transform: translateX(0); }
  22%  { clip-path: inset(70% 0 5% 0); transform: translateX(4px); filter: brightness(1.8); }
  26%  { clip-path: inset(0 0 0 0); transform: translateX(-1px); }
  35%  { clip-path: inset(40% 0 40% 0); transform: translateX(2px); }
  40%  { clip-path: inset(0 0 0 0); transform: translateX(0); filter: brightness(1); }
  /* Phase 2 calming */
  55%  { clip-path: inset(80% 0 10% 0); transform: translateX(-1px); }
  60%  { clip-path: inset(0 0 0 0); transform: translateX(0); }
  75%  { clip-path: inset(15% 0 75% 0); transform: translateX(1px); }
  80%  { clip-path: inset(0 0 0 0); transform: translateX(0); }
  100% { clip-path: inset(0 0 0 0); transform: translateX(0); filter: brightness(1); text-shadow: inherit; }
}

/* Phase 3 — idle, loops slowly after entrance completes */
@keyframes glitch-idle {
  0%, 92%  { clip-path: inset(0 0 0 0); transform: translateX(0); text-shadow: inherit; }
  93%      { clip-path: inset(60% 0 30% 0); transform: translateX(-1px); text-shadow: -2px 0 rgba(255,0,64,.4), 2px 0 rgba(0,255,255,.4); }
  94%      { clip-path: inset(0 0 0 0); transform: translateX(1px); }
  95%      { clip-path: inset(85% 0 5% 0); transform: translateX(0); }
  96%      { clip-path: inset(0 0 0 0); text-shadow: inherit; }
  100%     { clip-path: inset(0 0 0 0); transform: translateX(0); }
}

.glitch-entrance {
  animation: glitch-entrance 2.2s ease-out forwards;
}

.glitch-idle {
  animation: glitch-idle 5s linear infinite;
  animation-delay: 2.2s; /* starts exactly when entrance ends */
}
```

**Two-layer implementation:** Use two overlapping `<span>` elements with `position: absolute` for the big error code text. The outer wrapper gets `.glitch-entrance`, the inner span gets `.glitch-idle`. This creates the layered corruption look where the entrance and idle animations can run independently without fighting each other.

```tsx
<div style={{ position: "relative" }}>
  <span className="glitch-entrance" style={{ fontSize: 180, fontWeight: 900, ... }}>
    <span className="glitch-idle">404</span>
  </span>
</div>
```

### Color Treatment by Error Type

The chromatic aberration colors and background bloom shift based on error type:

| Error type | Aberration colors | Background bloom | Card accent |
|---|---|---|---|
| User errors (404, permissions) | `#ff0040` + `#00ffff` | Primary blue at 8% | Primary blue inset border |
| Server errors (500, outage) | `#ff4400` + `#ffcc00` | `#ef4444` at 6% | Red `#ef4444` inset border |
| Auth errors (expired, denied) | `#ff0040` + `#00ffff` | `#f59e0b` at 6% | Amber `#f59e0b` inset border |

Background bloom is a `radial-gradient` centered behind the content card:

```css
/* User error */
background: radial-gradient(ellipse 60% 50% at 50% 40%,
  color-mix(in srgb, var(--gg-primary, #2563eb) 8%, transparent),
  rgb(10 13 20) 70%);

/* Server error */
background: radial-gradient(ellipse 60% 50% at 50% 40%,
  rgba(239,68,68,0.06),
  rgb(10 13 20) 70%);

/* Auth error */
background: radial-gradient(ellipse 60% 50% at 50% 40%,
  rgba(245,158,11,0.06),
  rgb(10 13 20) 70%);
```

The card inset border uses the same `boxShadow` inset trick from the design system — `inset 3px 0 0 0 [color]` — zero box-model impact, consistent with all other accent strips in the product.

---

## 2. Full-Page Error Routes

Next.js special files that render at the route level.

### File Structure

```
app/
  not-found.tsx           # Global 404 — no nav, full bleed
  error.tsx               # Global 500 — no nav, full bleed
  crm/
    not-found.tsx         # CRM 404 — renders inside CrmHeader
    error.tsx             # CRM 500 — renders inside CrmHeader
```

The global versions render on a completely bare dark page — no nav, no shell, just the error and a way out. These fire if someone hits a bad URL before they're authenticated, or if the CRM shell itself crashes.

The CRM versions render inside the existing `CrmHeader` layout so the top nav is still usable. The user can click any nav item to escape. These fire on bad URLs or page crashes inside `/crm/`.

### 2.1 Global 404 — `app/not-found.tsx`

**Scenario:** Bad URL, deleted page, mistyped route — unauthenticated or outside CRM.

**Visual treatment:**
- Full-bleed page background — `rgb(10 13 20)` with blue radial bloom
- Glitched `404` text at `180px` font size, centered, using full glitch system — blue aberration
- Elevated glass card centered on the page, overlaid on the big text
- Primary gradient CTA button (from design system)

**Layout structure:**
```
[full page, centered vertically and horizontally]
  [big glitched "404" text — behind card, barely peeking out]
  [elevated glass card — 480px max-width]
    [eyebrow: "ERROR 404" — 10px, uppercase, S.dim, letter-spaced]
    [rotating headline — 22px, S.text, font-weight 700]
    [static sub-line — 14px, S.dim]
    [CTA button — "← Back to base"]
    [secondary link — "Contact support"]
```

**Headline pool:**
- *"Intel suggests this location doesn't exist."*
- *"We sent you to a dead grid."*
- *"Target not found. This route has gone dark."*
- *"Nothing at these coordinates."*

**Static sub-line:** Double-check your URL or head back to the command center.

**Primary CTA:** `← Back to base` → `/`

**Secondary (plain text link below button):** `Contact support` → mailto or support URL

---

### 2.2 Global 500 — `app/error.tsx`

**Scenario:** Unhandled exception, server crash — unauthenticated or the CRM shell itself breaking.

Next.js `error.tsx` receives `error` and `reset` props. The `reset` function retries the render — it is the primary CTA.

**Visual treatment:**
- Full-bleed page — `rgb(10 13 20)` with **red** radial bloom
- Glitched `500` at `180px` — red/amber aberration (`#ff4400` + `#ffcc00`)
- Elevated glass card with **red** inset left border (`inset 3px 0 0 0 #ef4444`) — signals this is our fault
- Two buttons: primary "Try again" + ghost "← Back to base"

**Headline pool:**
- *"We broke something. Our bad."*
- *"Command has gone dark. We're working on reestablishing contact."*
- *"Our servers are having an existential crisis."*
- *"Something blew up on our end. Definitely not yours."*

**Static sub-line:** Our team has been notified. Try again in a moment.

**Primary CTA:** `Try again` → calls `reset()`
**Secondary CTA (ghost button):** `← Back to base` → `/`

**Note on `reset()`:** Most 500s are transient. "Try again" should be the primary action — it calls the Next.js error boundary reset which re-attempts the render without a full page reload.

---

### 2.3 CRM 404 — `app/crm/not-found.tsx`

**Scenario:** Bad URL inside `/crm/` — user is logged in, `CrmHeader` is visible.

**Visual treatment:**
- Renders inside `CrmHeader` shell — only the content area below the header gets the treatment
- Blue radial bloom fills the content area
- Glitched `404` at **`140px`** — slightly smaller than the global version since the header consumes vertical space
- Elevated glass card centered in the content area

**Headline pool:**
- *"Intel suggests this location doesn't exist."*
- *"That sector isn't on any of our maps."*
- *"We've lost the signal on that route."*
- *"Dead end. Even our scouts couldn't find this one."*

**Static sub-line:** Use the navigation above or return to the dashboard.

**Primary CTA:** `← Back to dashboard` → `/crm`

---

### 2.4 CRM 500 — `app/crm/error.tsx`

**Scenario:** Page-level crash inside `/crm/` — header renders fine (it's outside the error boundary), content area is what crashed.

**Visual treatment:**
- Same layout as CRM 404 — header visible, content area gets the error treatment
- **Red** radial bloom in content area
- Glitched `500` at `140px` — red/amber aberration
- Elevated glass card with red inset left border

**Headline pool:**
- *"We broke something. Our bad."*
- *"This sector just went dark on us."*
- *"Something's malfunctioning in the field. On us."*
- *"Command is experiencing technical difficulties. The irony is not lost on us."*

**Static sub-line:** Try again or navigate away — we've logged the issue.

**Primary CTA:** `Try again` → calls `reset()`
**Secondary CTA (ghost button):** `← Back to dashboard` → `/crm`

---

## 3. Access Walls

Not full pages — components that render in place of a page's content when the user doesn't have required access. The `CrmHeader` is always visible. No redirect, no blank page.

All access walls use a single shared `<AccessWall />` component (see Section 9). They do **not** use the glitch animation — this isn't an error, it's a gate. Calm, authoritative.

### Visual Pattern (all access walls)

```
[content area — centered card, ~440px max-width]
  [ambient icon — large emoji at low opacity, behind card]
  [elevated glass card]
    [eyebrow: "ACCESS RESTRICTED" or "PLAN REQUIRED" — uppercase, 10px, S.dim]
    [rotating headline — 18px, S.text, font-weight 700]
    [static sub-line — 13px, S.dim]
    [CTA or contact link — varies]
```

The ambient icon sits behind the card at `72px`, `opacity: 0.06`, in the primary color or the relevant accent color. For permission walls: 🔒. For plan walls: 🛡.

---

### 3.1 Feature Not Unlocked (Plan Gated)

**Scenario:** The tenant's plan doesn't include this feature. Example: Intel Brief on Scout Kit, Dispatch not purchased.

**Two versions based on role:**

**Operative or Support user:**

Eyebrow: `ACCESS RESTRICTED`
Headline: *"You haven't been cleared for this sector."*
Sub-line: *"This feature isn't part of your current access level. Talk to your Director to find out more."*
No CTA button — they can't do anything from here.

**Director:**

Eyebrow: `PLAN REQUIRED`
Headline: *"This sector isn't on your current plan."*
Sub-line: *"Reach out to GuerrillaSuite to add it to your account."*
Ghost button: `Contact GuerrillaSuite →` → mailto or contact URL
Second ghost button: `← Back to dashboard`

**Implementation:** Check `crmUser.isAdmin` to determine which version to render. Pass `userIsAdmin` as a prop to `<AccessWall />`.

---

### 3.2 Role Not Sufficient

**Scenario:** Operative or Support user navigates directly to a Director-only URL (e.g. `/crm/admin/tenants`, `/crm/settings/dispatch/domains`).

Eyebrow: `ACCESS RESTRICTED`

**Headline pool:**
- *"You haven't been cleared for this sector."*
- *"Access denied. This area is Director-only."*
- *"Wrong clearance level for this zone."*

**Static sub-line:** This area requires Director-level access. If you think this is a mistake, contact your Director.

Ghost button: `← Back to dashboard` → `/crm`

---

### 3.3 SuperAdmin-Only Page

**Scenario:** A non-SuperAdmin hits a SuperAdmin route like `/crm/admin/intel-brief-feeds` or `/crm/admin/tenants`.

Eyebrow: `RESTRICTED`
Headline (single — no pool, this is rare): *"Way above your pay grade."*
Sub-line: *"This area is restricted to GuerrillaSuite system administrators."*
Ghost button: `← Back to dashboard`

---

### 3.4 Tenant Mismatch

**Scenario:** User tries to access another tenant's data — stale bookmarked URL, expired session that signed them into a different org, etc.

**Color treatment:** Amber (not blue or red — more serious than a locked feature but not a server error).

Eyebrow: `WRONG TERRITORY`

**Headline pool:**
- *"You're not authorized in this territory."*
- *"This isn't your operation."*
- *"Wrong org. Wrong sector."*

**Static sub-line:** You don't have access to this organization's account. Return to your own dashboard.

Primary CTA: `Go to my dashboard` → `/crm`

---

## 4. Auth States

These render on auth-related pages (`/login`, `/auth/callback`, etc.) — outside the CRM shell, full-bleed. No glitch animation on auth pages — these need to feel calm and trustworthy, not broken.

### 4.1 Session Expired / Logged Out

**Scenario:** JWT expired, user was idle, or explicitly signed out. They tried to access `/crm/` and got redirected to login.

**Visual treatment:**
- Full-bleed page — `rgb(10 13 20)` with **amber** radial bloom (not red — this is natural, not an error)
- No glitch — calm, informative
- Centered login card with the auth form or a "sign back in" prompt

**Headline pool (shown above the sign-in form):**
- *"You went dark."*
- *"We lost your signal."*
- *"Your session timed out. Happens to the best of us."*
- *"You've been away from the field."*

**Static sub-line:** Sign back in to pick up where you left off.

**CTA:** The login form itself (or a `Sign in →` button if this is a redirect notice rather than the form page).

---

### 4.2 Login Failed

**Scenario:** Wrong credentials submitted on the login form.

**Treatment:** Inline error message below the form — not a full-page takeover. A small red-tinted message block with a left red border appears beneath the submit button.

**Copy — first failed attempt:**
*"Those credentials didn't check out. Try again."*

**Copy — second+ failed attempt:**
*"Still not matching anything we have on file. Double-check your email and password."*

Never say "Invalid email or password" — this is the same information, just worse.

---

### 4.3 Magic Link Expired or Already Used

**Scenario:** User clicks a sign-in magic link that has expired or was already consumed.

**Visual treatment:** Full-bleed page, amber bloom, centered card. No glitch.

**Headline pool:**
- *"That link has expired."*
- *"This link has already been used."*
- *"Intel links have a short shelf life."*
- *"That link has gone dark."*

**Static sub-line:** Request a fresh link and try again.

**Primary CTA:** `Request a new link` → triggers new magic link flow

---

### 4.4 Account Not Found

**Scenario:** Email submitted at login has no matching account.

**Treatment:** Inline error within the login card — not a full page.

**Copy:** *"No account found at that address."*
**Sub-line:** *"Check the email or contact your Director to get set up."*

---

## 5. Toast Notification System

### 5.1 Overview

Toasts are small notification pills that slide in from the **bottom-right** corner of the screen. They stack vertically if multiple fire at once (newest on top), auto-dismiss after **4 seconds**, and can be manually dismissed. Hovering any toast pauses its auto-dismiss timer — the timer resumes on mouse leave.

**Architecture:** React context (`ToastContext`) with a `useToast()` hook. `<ToastProvider>` wraps `app/layout.tsx`. Individual components call `toast.success()`, `toast.error()`, etc. — no prop drilling, no local state per component.

**Stacking:** Maximum 4 toasts visible at once. If a 5th arrives, the oldest is force-dismissed with its exit animation. Toasts animate smoothly as items are added and removed from the stack.

---

### 5.2 Toast Types

| Type | Left border | Icon | Accent color |
|---|---|---|---|
| `success` | `#22c55e` | `✓` | Green |
| `error` | `#ef4444` | `✕` | Red |
| `warning` | `#f59e0b` | `⚠` | Amber |
| `info` | `var(--gg-primary, #2563eb)` | `ℹ` | Primary blue |

---

### 5.3 Visual Design

Each toast uses the **elevated glass card** pattern from the design system with a colored inset left border (the `boxShadow` inset trick — zero box-model impact).

```
┌──────────────────────────────────────────┐  ← elevated glass card
│ ✓  Saved.                            ✕  │  ← icon | title | dismiss X
│    Changes are locked and loaded.        │  ← optional sub-line (S.dim, 12px)
│ ████████████░░░░░░░░░░░░░░░░░░░░░░░░░░  │  ← progress bar (2px, depleting)
└──────────────────────────────────────────┘
  ↑ colored inset left border
```

**Dimensions:** `min-width: 280px`, `max-width: 380px`. Icon: `18px`. Title: `13px`, `font-weight: 600`, `S.text`. Sub-line: `12px`, `S.dim`. Dismiss X: small ghost icon button, right-aligned, vertically centered with the title.

**Progress bar:** A `2px` bar at the very bottom of the card that depletes left-to-right over 4 seconds. Colored to match the toast type. Its CSS animation `animation-play-state` toggles to `paused` on hover, resumes on mouse leave. This is the clearest possible signal that the toast will auto-dismiss.

**Entry animation:** Slides in from the right with a slight spring. `translateX(110%)` → `translateX(0)` + `translateY(8px)` → `translateY(0)`. Duration: `220ms`, easing: `cubic-bezier(0.34, 1.56, 0.64, 1)`. The overshoot bounce makes it feel alive without being annoying.

**Exit animation:** Slides back right and fades. `translateX(110%)` + `opacity: 0`. Duration: `180ms`, `ease-in`. When dismissed, the remaining toasts in the stack animate down to fill the gap.

---

### 5.4 API

```typescript
const { toast } = useToast();

// Basic
toast.success("Saved.");
toast.error("That didn't land.");
toast.warning("Approaching contact limit.");
toast.info("Campaign queued.");

// With sub-line
toast.success("Campaign sent.", { sub: "847 recipients are in the field." });
toast.error("Send failed.", { sub: "Resend returned an error. Try again." });

// With action button (inline ghost button inside the toast)
toast.error("Export failed.", {
  sub: "Something went wrong generating your report.",
  action: { label: "Retry", onClick: () => retryExport() }
});

// Manual duration override (ms — 0 means no auto-dismiss, stays until X clicked)
toast.error("Connection lost.", { duration: 0 });
```

---

### 5.5 Toast Copy — Success

| Action | Title | Sub-line |
|---|---|---|
| Save settings | *"Saved."* | *"Changes are locked and loaded."* |
| Contact created | *"Contact added to Dossier."* | — |
| Contact updated | *"Contact updated."* | — |
| Campaign sent (Dispatch) | *"Dispatched."* | *"[X] recipients are in the field."* |
| Campaign scheduled | *"Scheduled."* | *"Your campaign ships at [time]."* |
| Report generated | *"Report ready."* | *"Download it from your report history."* |
| Feed request submitted | *"Request sent."* | *"A GuerrillaSuite admin will review it shortly."* |
| Feed approved (SuperAdmin) | *"Feed is live."* | *"Articles will start arriving on the next hourly run."* |
| Domain verified | *"Domain verified."* | *"[domain] is cleared for sending."* |
| Task marked complete | *"Task complete."* | — |
| Invoice sent | *"Invoice dispatched."* | — |
| Payroll run approved | *"Payroll approved."* | *"Records have been created for all employees."* |
| Item deleted | *"Removed."* | — |
| Article suppressed | *"Removed from your briefing."* | — |
| Article flagged | *"Flagged for your comms team."* | — |
| Magic link sent | *"Link sent."* | *"Check your inbox."* |
| Copied to clipboard | *"Copied."* | — |

---

### 5.6 Toast Copy — Error

| Action | Title | Sub-line |
|---|---|---|
| Save failed | *"That didn't save."* | *"Something went wrong. Try again."* |
| Campaign send failed | *"Send failed."* | *"Resend returned an error. Check your sending domain and try again."* |
| Export / report failed | *"Export failed."* | *"We couldn't generate that. Try again."* |
| Upload — wrong file type | *"Wrong file type."* | *"Accepted: [list of types]."* |
| Upload — file too large | *"File too large."* | *"Maximum size is [limit]. Compress it and try again."* |
| Generic data fetch failure | *"Couldn't load this data."* | *"Something went wrong on our end. Refresh and try again."* |
| Contact limit reached | *"Contact limit reached."* | *"You've hit your plan's contact cap. Talk to your Director."* |
| Action forbidden | *"You're not cleared for that."* | — |
| Magic link send failed | *"Couldn't send the link."* | *"Try again or contact support."* |
| Domain verification failed | *"Verification failed."* | *"DNS records not detected. Double-check the values and try again."* |
| Delete failed | *"Couldn't remove that."* | *"Try again."* |

---

### 5.7 Toast Copy — Warning

| Scenario | Title | Sub-line |
|---|---|---|
| Approaching contact limit (80%+) | *"Contact limit approaching."* | *"You're at [X]% of your plan's [limit] contact cap."* |
| Unsubscribe link missing from email template | *"No unsubscribe link detected."* | *"Add {Unsubscribe_Link} to your template before sending."* |
| Domain pending verification | *"Domain not yet verified."* | *"DNS changes can take up to 24 hours to propagate."* |
| Navigating away with unsaved changes | *"You have unsaved changes."* | — |
| Scheduled report delivery failed | *"A scheduled report failed to deliver."* | *"Check your report schedule for details."* |

---

### 5.8 Toast Copy — Info

| Scenario | Title | Sub-line |
|---|---|---|
| Background job started | *"Running in the background."* | *"We'll let you know when it's ready."* |
| Feature not yet available | *"Coming soon."* | — |
| Auto-save triggered | *"Auto-saved."* | — |

---

## 6. Component-Level Load Failures

Inline error states within dashboard widgets or page sections. Not full-page takeovers — they appear when a specific data fetch fails while the rest of the page continues working.

### 6.1 Visual Pattern

A contained block that matches the approximate height of the widget it's replacing. Subtle red-tinted card.

```
┌──────────────────────────────────────────┐
│  ⚡  Couldn't load this section.    ↻   │
│     Something went wrong on our end.    │
└──────────────────────────────────────────┘
```

The `↻` retry button is a small ghost icon button right-aligned. Clicking it re-triggers the failed fetch. On retry, the card shows a skeleton shimmer. The `⚡` icon is consistent across all component-level failures — only the text changes.

Card styling: standard glass card with a subtle red left inset border (`inset 3px 0 0 0 rgba(239,68,68,0.4)`) and `background: rgba(239,68,68,0.03)` — barely perceptible tint, just enough to signal something is off.

### 6.2 Widget-Specific Copy

| Widget | Title | Sub-line |
|---|---|---|
| Intel Brief widget | *"Intel Brief went dark."* | *"Couldn't load your latest briefing."* |
| SitRep widget | *"SitRep is offline."* | *"Couldn't load your tasks and reminders."* |
| Pipeline / stats | *"Couldn't load pipeline data."* | *"Something went wrong fetching your numbers."* |
| Contact list | *"Contacts didn't load."* | *"Try refreshing the page."* |
| Report generation | *"Report failed."* | *"We couldn't generate this. Try again."* |
| Dispatch campaign list | *"Campaigns didn't load."* | *"Refresh and try again."* |
| LedgerLine dashboard | *"Financial data didn't load."* | *"Something went wrong. Try refreshing."* |

---

## 7. Empty States

Empty states are **not errors**. They are informative and motivating — a mission brief before the operation starts. Two distinct types with different copy and behavior.

### 7.1 Type A vs Type B

**Type A — Nothing exists yet:** The user hasn't created anything in this section. Copy is forward-looking. Always includes a primary CTA button giving them the first action.

**Type B — Filter returned zero results:** Data exists, but nothing matches the current filter or search. Copy acknowledges nothing matched. Never implies the user did something wrong. Always includes a plain text "Clear filters" or "View all" link — never a CTA button.

### 7.2 Visual Pattern

No icons, no emojis, no illustrations. The copy carries the weight.

Each empty state has a **watermark word** — large ALL-CAPS text rendered behind the headline content. Same design language as the big error codes on full-page errors, but quieter. Still, not animated, not glitched.

```
[centered in content area, relative positioned]

  [watermark word — absolute, behind content]
    font-size: 110px, font-weight: 900, letter-spacing: 0.15em
    color: rgba(255,255,255,0.03) — barely perceptible texture
    positioned slightly above center so it doesn't perfectly overlap the headline
    user-select: none, pointer-events: none

  [content — relative, z-index above watermark]
    [bold headline — 16px, font-weight 700, S.text]
    [muted sub-line — 13px, S.dim]
    [CTA button (Type A) or plain text link (Type B)]
```

No glitch, no bloom, no drama. Calm and purposeful. The watermark gives visual weight without decoration.

---

### 7.3 Watermark Word Reference

Each surface has one assigned watermark word. Pass it as a prop to `<EmptyState />`. Type A and Type B on the same surface share the same watermark — it's tied to the section, not the state. Filter zero-result states always use `NO MATCH` regardless of surface.

| Surface | Watermark |
|---|---|
| Contacts | `STANDBY` |
| Dispatch campaigns | `STANDBY` |
| Intel Brief feed | `NO SIGNAL` |
| Intel Brief widget (compact) | — (no watermark at compact size) |
| SitRep | `ALL CLEAR` |
| Saved Lists | `STANDBY` |
| Invoices | `STANDBY` |
| Payroll Runs | `STANDBY` |
| Report History | `STANDBY` |
| Flagged Articles | `NONE FLAGGED` |
| Search (universal) | `NO MATCH` |
| Filter zero results (universal) | `NO MATCH` |
| Generic fallback | `STANDBY` |

---

### 7.4 Empty State Copy — All Surfaces

**Contacts / Dossier**

Type A (no contacts yet):
Watermark: `STANDBY` | Headline: *"No contacts in the field yet."* | Sub: *"Import a list or add your first contact to get the operation moving."* | CTA: `Add first contact`

Type B (filter/search returned nothing):
Watermark: `NO MATCH` | Headline: *"No contacts match those filters."* | Sub: *"Adjust your filters or clear them to see everyone."* | Link: `Clear filters`

---

**Dispatch (Bulk Email)**

Type A (no campaigns):
Watermark: `STANDBY` | Headline: *"No campaigns dispatched yet."* | Sub: *"Build your first email campaign and get your message in the field."* | CTA: `Build a campaign`

Type B (filter):
Watermark: `NO MATCH` | Headline: *"No campaigns match those filters."* | Sub: *"Try a different status or clear the filters."* | Link: `Clear filters`

---

**Intel Brief Feed**

Type A (no articles scored yet — fresh tenant or feeds just activated):
Watermark: `NO SIGNAL` | Headline: *"No intel yet."* | Sub: *"Feeds are checked hourly. Your first briefing will arrive soon — or lower your relevance threshold in settings."* | Link: `Intel Brief Settings` (no CTA button — they can't force this)

Type B (threshold too high or date filter too narrow):
Watermark: `NO SIGNAL` | Headline: *"Nothing cleared your current filters."* | Sub: *"Lower your relevance threshold or widen the date range to see more intel."* | Link: `Adjust settings`

**Intel Brief widget (dashboard) — compact empty:**
No icon. Text only: *"You're all caught up."* — `13px`, `S.dim`, single centered line. No sub-line, no button. Confident silence.

---

**SitRep**

Type A (no tasks):
Watermark: `ALL CLEAR` | Headline: *"Nothing on the board."* | Sub: *"Add a task, set a reminder, or schedule an event to get SitRep working."* | CTA: `Add first task`

Type B (filter):
Icon: `🔍` | Headline: *"Nothing matches those filters."* | Sub: *"Adjust the filters or clear them to see everything on the board."* | Link: `Clear filters`

---

**Saved Lists**

Type A:
Watermark: `STANDBY` | Headline: *"No saved lists yet."* | Sub: *"Build and save a contact list to use it across campaigns and canvassing."* | CTA: `Build a list`

---

**Invoices (LedgerLine)**

Type A:
Watermark: `STANDBY` | Headline: *"No invoices yet."* | Sub: *"Create your first invoice and start tracking what you're owed."* | CTA: `Create invoice`

Type B (filter):
Watermark: `NO MATCH` | Headline: *"No invoices match those filters."* | Sub: *"Adjust the filters or clear them."* | Link: `Clear filters`

---

**Payroll Runs (LedgerLine)**

Type A:
Watermark: `STANDBY` | Headline: *"No payroll runs yet."* | Sub: *"Set up your employees and run your first payroll to get your team paid."* | CTA: `Set up payroll`

---

**Report History (LedgerLine)**

Type A:
Watermark: `STANDBY` | Headline: *"No reports generated yet."* | Sub: *"Run a report from the report center and it'll appear here."* | CTA: `Go to reports`

---

**Flagged Articles (Intel Brief admin view)**

Type A:
Watermark: `NONE FLAGGED` | Headline: *"Nothing flagged yet."* | Sub: *"Flag articles from the Intel Brief feed to surface them here for your comms team."* | No CTA (flagging happens elsewhere)

---

**Search — Universal Type B (zero results)**

Watermark: `NO MATCH` | Headline: *"No results for "[query]"."* | Sub: *"Try different keywords or check your spelling."* | Link: `Clear search`

---

**Generic / Fallback**

Type A:
Watermark: `STANDBY` | Headline: *"Nothing here yet."* | Sub: *"Get started by adding your first item."*

Type B:
Icon: `🔍` | Headline: *"Nothing matches those filters."* | Sub: *"Adjust or clear your filters."* | Link: `Clear filters`

---

## 8. Boundary & Rate Conditions

Inline warning or block states — not pages, not toasts — that appear inside the relevant UI element when a hard limit is hit.

### 8.1 Contact Limit

Shown as an inline banner at the top of the contacts section. Styled as an amber warning card (80–99%) or red blocked card (100%).

**At 80% — warning banner (amber):**
*"Approaching contact limit."* — *"You're at [X]% of your [Plan Name] plan's [limit] contact cap."*
If `crmUser.isAdmin`: add sub-line *"Contact GuerrillaSuite if you need more room."*
If not admin: *"Talk to your Director if you're running low."*

**At 100% — blocked banner (red):**
*"Contact limit reached."* — *"New contacts can't be added until the limit is raised."*
If `crmUser.isAdmin`: *"Contact GuerrillaSuite to increase your limit."* with a contact link.
If not admin: *"Talk to your Director."*

### 8.2 File Validation

Inline messages directly below a file input, shown immediately after a failed file selection. Not toasts — the user needs to see this next to the field they're interacting with.

**Wrong file type:**
`⚠ That file type isn't supported.` — *Accepted: [list].*

**File too large:**
`⚠ That file is too large.` — *Maximum size is [limit].*

---

## 9. Shared Components

### 9.1 `<EmptyState />`

```typescript
// app/components/EmptyState.tsx

interface EmptyStateProps {
  icon: string;             // Emoji rendered at 48px (full) or 20px (compact)
  headline: string;         // Bold one-liner
  sub?: string;             // Muted sub-line (optional)
  cta?: {                   // Primary CTA button — Type A only
    label: string;
    onClick?: () => void;
    href?: string;          // If provided, renders as <Link> instead of <button>
  };
  link?: {                  // Plain text link — Type B only
    label: string;
    onClick?: () => void;
    href?: string;
  };
  size?: "full" | "compact"; // full = page-centered (default), compact = widget inline
}
```

`size="full"` — vertically and horizontally centered in the available content area. Icon at `48px`. Headline at `16px`. Full sub-line rendered.

`size="compact"` — smaller treatment for dashboard widgets. Icon inline at `20px`. Headline at `13px`. Sub-line omitted even if provided. No CTA button.

**Location:** `app/components/EmptyState.tsx` — shared across all products.

---

### 9.2 `<AccessWall />`

```typescript
// app/components/AccessWall.tsx

interface AccessWallProps {
  type: "feature" | "role" | "superadmin" | "tenant";
  userIsAdmin?: boolean;       // For "feature" type — changes copy and CTA
  featureName?: string;        // e.g. "Intel Brief" — used in copy
  headlineOverride?: string;   // Skip the pool and use a specific headline
}
```

Handles all four access wall scenarios (Sections 3.1–3.4) based on `type` prop. Headline pool rotation happens inside the component. The `featureName` prop is used to make the copy specific: *"Intel Brief isn't part of your current plan"* rather than generic gating language.

**Location:** `app/components/AccessWall.tsx`

**Usage:**
```tsx
// In a page that checks a feature gate
if (!hasFeature(tenant.features, "news") && !crmUser.isSuperAdmin) {
  return (
    <AccessWall
      type="feature"
      userIsAdmin={crmUser.isAdmin}
      featureName="Intel Brief"
    />
  );
}
```

---

### 9.3 Toast System Files

```
app/components/Toast/
  ToastProvider.tsx      # Context, stack state, add/remove logic
  Toast.tsx              # Individual toast card — glass card, progress bar, animations
  useToast.ts            # Hook: returns { toast } with .success() .error() .warning() .info()
```

`<ToastProvider>` wraps `app/layout.tsx` at the root level so toasts are available globally.

---

## 10. Implementation Notes for Claude Code

### All Full-Page Error Components Are `"use client"`

Three reasons:
1. Headline rotation uses `useMemo(() => HEADLINES[Math.floor(Math.random() * HEADLINES.length)], [])` — this must run client-side only to avoid hydration mismatch between server-rendered HTML and client JS.
2. The glitch CSS animation requires client-side playback.
3. Next.js `error.tsx` receives `reset` as a prop from the error boundary — this only works in client components.

### Glitch Animation Stays Out of `globals.css`

The `@keyframes` declarations live in a `<style>` tag inside each error page component. This keeps them scoped, avoids loading animation code on every page, and prevents any potential naming conflicts with other keyframes in the global sheet.

### No New Design Tokens

All colors come from the existing `S` token object and `--gg-primary`. The only new values introduced here are error-type-specific bloom colors (`#ef4444` for server errors, `#f59e0b` for auth/amber states) — these are used inline, not added to any token system.

### Toast `<ToastProvider>` Placement

Wraps `app/layout.tsx` — outside the CRM shell, outside auth checks. This ensures toasts work on auth pages, error pages, and inside the CRM without any re-mounting.

### Progress Bar Pause on Hover

Implemented by tracking `isPaused: boolean` in the toast item's state, toggled by `onMouseEnter` / `onMouseLeave` on the toast card element. The CSS animation uses `animationPlayState: isPaused ? "paused" : "running"`. Track elapsed time in a `useRef` so the animation resumes from where it paused rather than resetting.

### `<AccessWall />` Does Not Use `redirect()`

Access walls render in place — they do not call Next.js `redirect()`. The page renders the `<AccessWall />` component and returns early. This keeps the `CrmHeader` visible and gives the user their nav back. Hard redirects to `/crm` are reserved only for SuperAdmin bypass scenarios that need to be completely hidden (e.g., tenants accessing global admin routes).

### File Locations Summary

```
app/
  not-found.tsx                      # Global 404
  error.tsx                          # Global 500
  crm/
    not-found.tsx                    # CRM 404 (inside CrmHeader)
    error.tsx                        # CRM 500 (inside CrmHeader)

app/components/
  EmptyState.tsx                     # Shared empty state component
  AccessWall.tsx                     # Shared access wall component
  Toast/
    ToastProvider.tsx
    Toast.tsx
    useToast.ts
```

---

## 11. Phrases That Are Now Retired

Any instance of these in the codebase should be replaced. If Claude Code encounters them during implementation, flag and replace.

| Retired phrase | Replace with |
|---|---|
| "Something went wrong" | *"We broke something."* / *"That didn't land."* |
| "Page not found" | Any headline from the 404 pool |
| "Unauthorized" / "Access denied" | *"You haven't been cleared for this sector."* |
| "An error occurred" | *"Something blew up on our end."* |
| "Please try again" | *"Try again."* — no please, confident not pleading |
| "Success!" (standalone) | Specific: *"Saved."* / *"Dispatched."* / *"Done."* |
| "Error" (standalone label) | Any headline from the relevant pool |
| "Loading..." (text spinner) | Skeleton shimmer — visual only, no text |
| "No results found" | *"No [things] match those filters."* |
| "You do not have permission to access this page" | *"Wrong clearance level for this zone."* |
| "Invalid email or password" | *"Those credentials didn't check out."* |
