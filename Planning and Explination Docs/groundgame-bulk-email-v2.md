# GroundGame — Bulk Email (Dispatch) V1
## Feature Spec for Claude Code
**Status:** Pre-development planning
**Suite:** GuerrillaSuite
**Product:** GroundGame CRM
**Feature tier:** WarChest (gated behind `"crm_dispatch"` feature key)
**Sending infrastructure:** Resend (existing provider, paid plan)
**Template builder:** Unlayer (free plan obtained, Project ID: 285907)
**App domain:** `*.groundgame.digital` (each tenant on a subdomain)

---

## 0. Feature Identity

**Feature name:** Dispatch
**Location in product:** `/crm/dispatch`
**Widget/nav label:** `✉️ Dispatch`

Dispatch is GuerrillaSuite's bulk email tool. It lives inside GroundGame and lets campaign teams build professional, personalized email campaigns using a drag-and-drop template builder and send them to filtered contact segments or saved lists — directly from the CRM, with full people/contact integration.

The name Dispatch is already held in the Named Asset Registry as a strong reserved name. This is its first use.

---

## 1. Product Context

Dispatch is a WarChest-only named tool inside GroundGame. It is not a standalone product in V1. It lives at `/crm/dispatch` and follows all existing GroundGame auth, tenant-scoping, and UI patterns.

**V1 scope:** Build, send, and track bulk email campaigns to contact segments or saved lists.
**V2 scope (do not build now):** Full send/receive email aggregator baked into the CRM — a Gmail-like inbox for campaign communications.

---

## 2. Sending Infrastructure

**Provider:** Resend (`resend.com`)
**Why:** Already integrated for auth emails. One provider, one API key, one billing relationship, one deliverability reputation. Paid plan ($20/month) supports 50,000 emails/month with no daily cap — sufficient for campaign-scale sends of 500–1,000/day.

### 2.1 API Keys

Two separate Resend API keys are used — never mix auth email sending with bulk campaign sending:

- `RESEND_API_KEY` — existing key, already in use for Supabase auth emails. Do not touch or reuse for Dispatch.
- `RESEND_DISPATCH_API_KEY` — new key, created in the Resend dashboard with Full Access (or Sending Access unrestricted by domain). Used exclusively by Dispatch for all campaign sends.

### 2.2 Dual Sending Domain Model

Dispatch supports two sending domain types simultaneously. Every tenant always has access to the GS-managed default. Client-owned domains are added per client as they onboard.

**GS-managed default domain: `mail.groundgame.digital`**
- Verified once by the GuerrillaSuite team in the Resend account
- Available to every tenant immediately — no DNS setup required on their end
- A brand new tenant can send on day one using this domain
- From addresses using this domain look like: `jessi@mail.groundgame.digital`

**Client-owned domains (per client, optional):**
- Each client can add their own sending subdomain — e.g., `mail.freespeechmedia.live`, `mail.cowartforhouston.com`
- Added to the shared Resend account by the GuerrillaSuite team
- Client handles DNS records (SPF, DKIM) on their domain registrar
- Sending reputation is isolated per domain — one client's bad send does not affect others
- Recommended pattern is a subdomain (e.g., `mail.freespeechmedia.live`) rather than the root domain, to protect the client's main domain reputation

**From email dropdown at compose time:**
When building a campaign, the From Email field shows all verified domains available to that tenant:
```
jessi@mail.groundgame.digital        ✅ (GS default — always available)
jessi@mail.freespeechmedia.live      ✅ (client-owned, if verified)
```
The sender types a local part (e.g., `jessi`) and selects the domain from the dropdown. The GS default is always present. Client-owned domains appear once verified.

### 2.3 Domain Verification Flow

Resend verification is asynchronous. DNS propagation typically takes minutes to a few hours for modern providers like Cloudflare, and up to 24–48 hours for slower registrars. Resend will keep checking for up to 72 hours before marking a domain as failed.

**Verification UX requirements:**
- After DNS records are displayed to the tenant, the UI must not rely solely on a manual "Check Verification" button
- Poll the Resend domain status API in the background and update the badge automatically when verified
- Show a clear "Verification pending — this can take up to 24 hours" state so tenant admins are not confused
- Surface the Cloudflare fast path: if the tenant's domain uses Cloudflare DNS, note that they can use Resend's Domain Connect integration to add records automatically — significantly faster and error-free
- Show a subdomain recommendation tip: "We recommend using a subdomain like `mail.yourdomain.com` to protect your main domain's email reputation"

**Per-domain status badges:**
- Pending (amber) — DNS records not yet detected
- Verified (green) — fully confirmed, ready to send
- Failed (red) — not detected within 72 hours, likely misconfiguration

### 2.4 Per-Campaign Sender Configuration

Each campaign has its own `from` address and `reply_to` address set at compose time. These are per-email fields, not global tenant settings. The reply-to should typically be a real monitored inbox at the client's actual email provider — replies go there, not to the sending domain (which has no mailbox behind it and doesn't need one).

### 2.5 Webhook Setup

One webhook endpoint in the Resend dashboard points to `https://app.guerrillasuite.com/api/resend/webhook`. This is separate from any existing Resend webhook configuration for auth emails.

Events to subscribe to:
- `email.sent`
- `email.bounced`
- `email.delivery_delayed`

The webhook signing secret is returned when the webhook is created in the Resend dashboard. Store it as `RESEND_WEBHOOK_SECRET`. Every incoming webhook request must have its signature verified against this secret before processing.

Resend provides at-least-once delivery — the same event may arrive more than once in rare cases. Use the `svix-id` header included with every webhook request as a deduplication key. Store processed `svix-id` values and skip duplicates to prevent double-processing bounces or other events.

---

## 3. Template Builder

**Library:** `react-email-editor` (npm package name) — Unlayer's React wrapper
**Free plan:** Obtained. Project ID: `285907`
**License:** Free plan confirmed for use. No further license review needed.
**Output:** Unlayer produces two artifacts on save — a JSON design object (stored for re-editing) and rendered HTML (sent via Resend).

**Free plan limitations to be aware of:**
- `customJS` is a premium feature and will not work on the free plan. Do not use the `customJS` prop anywhere in the integration — it will silently fail or error.
- `customCSS` may also be restricted. Use Unlayer's built-in `appearance` and `theme` config for styling instead.
- All core features needed for V1 — drag-and-drop blocks, merge tags, exportHtml, loadDesign, mobile preview — are available on the free plan.

**Unlayer allowed domains (configure in Unlayer dashboard before shipping):**
- `*.groundgame.digital` — covers all tenant subdomains (confirm wildcard is accepted in Unlayer's domain allowlist UI; if not, add each tenant domain explicitly)
- `localhost:3001` — for local development (dev server runs on port 3001)

**What Unlayer provides out of the box:**
- Drag-and-drop block editor (columns, images, text, buttons, dividers, spacers, social icons, video thumbnails)
- Mobile preview toggle
- Merge tag / dynamic field support (configured via Unlayer's `mergeTags` prop)
- Pre-built block templates
- Custom color palette (configure to match GuerrillaSuite design system)
- Clean HTML output compatible with all major email clients

**GuerrillaSuite configuration of Unlayer:**
Pass the following configuration props to the `<EmailEditor />` component:

```typescript
// Merge tags available in the editor — these become {First_Name}, etc.
const mergeTags = {
  first_name: { name: "First Name", value: "{First_Name}" },
  last_name: { name: "Last Name", value: "{Last_Name}" },
  full_name: { name: "Full Name", value: "{Full_Name}" },
  email: { name: "Email Address", value: "{Email}" },
  city: { name: "City", value: "{City}" },
  state: { name: "State", value: "{State}" },
  unsubscribe_link: { name: "Unsubscribe Link", value: "{Unsubscribe_Link}" },
  trackable_link: { name: "Trackable Link", value: "{Trackable_Link_URL}" },
}

// Appearance config — match GuerrillaSuite design language
// Do NOT use customJS or customCSS — not available on free plan
const appearance = {
  theme: "modern_dark", // or "modern_light" — pick whichever matches the CRM
  panels: { tools: { dock: "right" } }
}
```

**Dynamic field processing at send time:**
Before a campaign is sent, the system performs a mail-merge pass on the stored HTML for each recipient:
- `{First_Name}` → recipient's first name from the `people` record
- `{Last_Name}` → recipient's last name
- `{Full_Name}` → first + last
- `{Email}` → recipient's email address
- `{City}` / `{State}` → from the person's linked location record (via `people` → `households` → `locations`)
- `{Unsubscribe_Link}` → generated per-recipient unsubscribe URL (required, see Section 6)
- `{Trackable_Link_URL}` → see Section 5 for click tracking

If a field is empty for a given recipient (e.g., no city on file), the merge tag resolves to an empty string. Do not expose the raw `{Field_Name}` placeholder in the sent email.

---

## 4. Data Model

### 4.1 New Tables

**`email_campaigns`**
```sql
CREATE TABLE email_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,                        -- Internal campaign name, not shown to recipient
  subject TEXT NOT NULL,
  preview_text TEXT,                         -- Email preview/preheader text
  from_name TEXT NOT NULL,                   -- Display name, e.g. "Jessi Cowart"
  from_email TEXT NOT NULL,                  -- Sending address, e.g. jessi@cowartforhouston.com
  reply_to TEXT,                             -- Reply-to address, nullable
  design_json JSONB NOT NULL,               -- Unlayer JSON design — used for re-editing
  html_body TEXT NOT NULL,                  -- Rendered HTML from Unlayer — sent via Resend
  status TEXT NOT NULL DEFAULT 'draft',     -- 'draft' | 'scheduled' | 'sending' | 'sent' | 'cancelled'
  audience_type TEXT NOT NULL,              -- 'segment' | 'list'
  audience_segment_filters JSONB,           -- Stored filter config if audience_type = 'segment'
  audience_list_id UUID REFERENCES walklists(id),  -- FK to walklist if audience_type = 'list'
  audience_count INTEGER,                   -- Resolved recipient count at send time
  scheduled_at TIMESTAMPTZ,                 -- Null = send immediately
  sent_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_campaigns_tenant ON email_campaigns(tenant_id, status);
```

**`email_sends`**
One row per recipient per campaign. This is the send ledger.

```sql
CREATE TABLE email_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  person_id UUID NOT NULL,                  -- FK into the `people` table
  email_address TEXT NOT NULL,              -- Captured at send time (not joined — email may change)
  resend_message_id TEXT,                   -- Resend's message ID for tracking
  status TEXT NOT NULL DEFAULT 'queued',    -- 'queued' | 'sent' | 'bounced' | 'failed'
  bounced_at TIMESTAMPTZ,
  bounce_type TEXT,                         -- 'hard' | 'soft'
  bounce_reason TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_sends_campaign ON email_sends(campaign_id);
CREATE INDEX idx_email_sends_person ON email_sends(person_id);
```

**`email_clicks`**
One row per click event.

```sql
CREATE TABLE email_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
  send_id UUID NOT NULL REFERENCES email_sends(id) ON DELETE CASCADE,
  person_id UUID NOT NULL,                  -- FK into the `people` table
  tenant_id TEXT NOT NULL,
  original_url TEXT NOT NULL,               -- The destination URL the sender configured
  clicked_at TIMESTAMPTZ DEFAULT NOW(),
  user_agent TEXT,
  ip_address TEXT
);

CREATE INDEX idx_email_clicks_campaign ON email_clicks(campaign_id);
CREATE INDEX idx_email_clicks_send ON email_clicks(send_id);
```

**`email_unsubscribes`**
Global unsubscribe list per tenant. A contact on this list never receives email from this tenant again.

```sql
CREATE TABLE email_unsubscribes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  person_id UUID,                           -- Null if unsubscribed before person record existed
  email_address TEXT NOT NULL,
  campaign_id UUID REFERENCES email_campaigns(id),  -- Which campaign triggered the unsubscribe
  unsubscribed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, email_address)
);

CREATE INDEX idx_email_unsubscribes_tenant ON email_unsubscribes(tenant_id, email_address);
```

**`email_sending_domains`**
Per-tenant verified sending domains.

```sql
CREATE TABLE email_sending_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  domain TEXT NOT NULL,                     -- e.g. "cowartforhouston.com"
  resend_domain_id TEXT,                    -- Resend's domain ID for API calls
  dns_records JSONB,                        -- DNS records Resend requires (stored for display)
  verified BOOLEAN DEFAULT false,
  is_default BOOLEAN DEFAULT false,         -- Tenant's default sending domain
  created_at TIMESTAMPTZ DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  UNIQUE (tenant_id, domain)
);
```

---

## 5. Click Tracking

Click tracking is implemented via a redirect URL pattern. When a campaign is sent, any URL in the email body that the sender wants to track is replaced with a GuerrillaSuite redirect URL that:

1. Logs the click to `email_clicks`
2. Immediately redirects the recipient to the original destination URL

**Redirect URL format:**
```
https://app.guerrillasuite.com/r/{send_id}/{url_hash}
```

- `send_id` — the UUID from `email_sends`, identifying which recipient clicked
- `url_hash` — a short hash identifying which link in the email was clicked (derived from the original URL)

**The `{Trackable_Link_URL}` merge tag:**
When the sender uses the `{Trackable_Link_URL}` Unlayer merge tag, they configure the destination URL at campaign compose time. At send time, the system replaces this tag with the recipient-specific redirect URL for that destination.

**Implementation:**
- A Next.js route at `app/r/[send_id]/[url_hash]/route.ts` handles the redirect
- On hit: log to `email_clicks`, then `redirect(originalUrl)`
- The original URL mapping (`url_hash` → `original_url`) is stored as a JSONB field on `email_campaigns.design_json` or as a separate lookup table if there are many tracked links per campaign

**V1 scope:** Manual trackable links via the merge tag only. Automatic tracking of all links in the email body is V2.

---

## 6. Unsubscribe Handling

**Required in every email.** The `{Unsubscribe_Link}` merge tag must resolve to a working link in every sent email. If the sender's template does not include it, warn them before send but do not block sending (they may have it in footer text outside Unlayer's merge tag system).

**Unsubscribe URL format:**
```
https://app.guerrillasuite.com/unsubscribe/{send_id}
```

**Unsubscribe flow:**
- Route: `app/unsubscribe/[send_id]/page.tsx` — a simple, unbranded (or lightly GS-branded) page
- Page shows: "You've been unsubscribed from [Tenant Name] emails. You will no longer receive emails from this organization."
- On load: insert row into `email_unsubscribes` for this contact + tenant
- No re-subscribe option in V1

**Enforcement at send time:**
Before resolving any recipient list, always filter out contacts whose email address appears in `email_unsubscribes` for this tenant. This filter runs at the point of building the send queue — not at the point of hitting Resend's API.

---

## 7. Bounce Handling

Resend delivers bounce notifications via webhook. The app must expose a webhook endpoint that Resend can POST to.

**Webhook endpoint:** `POST /api/resend/webhook`

**Bounce processing:**
- On `email.bounced` event from Resend: update `email_sends.status = 'bounced'`, store `bounce_type` and `bounce_reason`
- Hard bounce (permanent delivery failure): automatically add to `email_unsubscribes` for this tenant — do not attempt to send to this address again
- Soft bounce (temporary failure, e.g. mailbox full): log only, do not add to unsubscribes

**Resend webhook events to handle in V1:**
- `email.sent` — update `email_sends.status = 'sent'`, set `sent_at`
- `email.bounced` — handle as above
- `email.delivery_delayed` — log only, no action required

**Webhook security:** Verify Resend's webhook signature using their signing secret before processing any event. Store the signing secret in environment variables.

---

## 8. Audience Selection

Recipients can be sourced from two places:

**Segment (filtered):**
The sender builds a filter set against `people` records at compose time. Filter options mirror what's available in GroundGame's existing list-building tools. Filters are stored as JSONB in `email_campaigns.audience_segment_filters`. At send time, the filter is re-evaluated against the live database to build the send queue.

Suggested filterable fields for V1:
- Tags / list membership
- Geography (city, state, zip)
- Disposition history (e.g., "contacted at least once")
- Any custom contact fields already supported in GroundGame

**Saved List:**
The sender selects an existing walklist from GroundGame's list management system (`walklists` table). The list's people are resolved at send time via the `walklist_items` table (each item has a `person_id` or `location_id`).

**Both paths:**
- Show a live recipient count preview as filters/list are configured
- Apply unsubscribe suppression before showing final count
- People without a valid email address on their `people` record are excluded silently

---

## 9. URL & Route Structure

```
/crm/dispatch/                          # Campaign list (all campaigns for this tenant)
/crm/dispatch/new/                      # New campaign — step 1: details + audience
/crm/dispatch/[id]/                     # Campaign detail / results view
/crm/dispatch/[id]/edit/                # Edit draft campaign (loads Unlayer with saved design)
/crm/dispatch/[id]/preview/             # Preview rendered HTML before send
/crm/settings/dispatch/                 # Dispatch settings (sending domains, defaults)
/crm/settings/dispatch/domains/         # Sending domain management
/r/[send_id]/[url_hash]/               # Click tracking redirect (outside /crm/)
/unsubscribe/[send_id]/                 # Unsubscribe landing page (outside /crm/)

API routes:
/api/resend/webhook                     # Resend webhook receiver
/api/dispatch/send/[id]                 # Trigger send for a campaign
/api/dispatch/preview/[id]              # Generate preview HTML with dummy merge data
```

---

## 10. Campaign Compose Flow

The compose experience is a multi-step flow. Use a stepped UI (step indicator at top) rather than a single long page.

**Step 1 — Campaign Details**
- Campaign Name (internal, required)
- Subject Line (required) — show character count, flag if over 60 chars
- Preview Text (optional) — the preheader text shown in inbox before opening
- From Name (required) — e.g. "Jessi Cowart for Texas House"
- From Email (required) — dropdown of verified sending domains + free-text input. Warn if domain is not verified.
- Reply-To Email (optional)

**Step 2 — Audience**
- Toggle: "Segment" or "Saved List"
- If Segment: filter builder UI (mirrors existing list-building tools)
- If Saved List: list picker
- Live recipient count updates as filters change
- Shows: "X recipients · Y excluded (unsubscribed)"

**Step 3 — Design**
- Full-page Unlayer embed
- Merge tag picker panel on the side (shows available merge tags with click-to-insert)
- "Preview" button — renders HTML with placeholder merge data and shows in a modal
- Mobile / Desktop preview toggle (Unlayer built-in)
- Warning banner if `{Unsubscribe_Link}` not detected in the design

**Step 4 — Review & Send**
- Summary: recipient count, from/reply-to, subject
- Rendered preview of the email (iframe with the HTML)
- Send options:
  - "Send Now" — confirms and triggers immediately
  - "Schedule" — date/time picker, saves as `scheduled_at`
- Confirmation modal before sending: "You are about to send to X recipients. This cannot be undone."

---

## 11. Campaign Results View

After a campaign is sent, `/crm/dispatch/[id]` becomes the results dashboard.

**Stats to show:**
- Total sent
- Delivered (sent - bounced)
- Bounced (hard + soft, broken out)
- Clicks (total click events — not unique contacts — in V1)
- Unsubscribes triggered by this campaign

**Recipient table (paginated):**
- Person name (linked to their `/crm/people/[id]` record)
- Email address
- Status (Sent / Bounced)
- Bounce reason (if applicable)
- Clicked (yes/no)
- Unsubscribed (yes/no)

**Export:** CSV export of recipient table — name, email, status, clicked, unsubscribed.

---

## 12. Feature Flag & Plan Gating

**Feature key:** `"crm_dispatch"` (add to `@/lib/features`)

Changes to `lib/features.ts`:
1. Add `"crm_dispatch"` to `ALL_FEATURE_KEYS` array
2. Add `"crm_dispatch"` to `PLAN_FEATURES.war_chest` — not to `scout_kit` or `field_pack`
3. Add to `FEATURE_META`:
   ```ts
   crm_dispatch: { label: "Dispatch (Bulk Email)", group: "CRM Data" }
   ```

**Gate behavior:**
- `/crm/dispatch` and all sub-routes: redirect to `/crm` if feature not present
- Nav item: only render if `hasFeature(features, "crm_dispatch")`
- SuperAdmin bypass: `isSuperAdmin` from `getCrmUser()` always has access regardless of tenant plan

---

## 13. HQ Settings — Dispatch

Add a Dispatch section to Settings (`/crm/settings/dispatch/`) with:

The Settings dropdown in `CrmHeader.tsx` (`buildNav()`) already contains Brand Settings, Users, Pipelines, and Dispositions. Add a "Dispatch" item to that dropdown pointing to `/crm/settings/dispatch` — gated behind `crm_dispatch` feature.


**Sending Domains sub-page (`/crm/settings/dispatch/domains/`):**

The GS-managed default domain (`mail.groundgame.digital`) is always shown at the top of the list as a read-only entry with a green Verified badge and a "Default" label. It cannot be removed or modified by the tenant — it is always available.

Below that, tenant-owned domains are listed with full management controls.

**Add Domain flow (for client-owned domains):**
- Enter subdomain (e.g., `mail.freespeechmedia.live`)
- Show subdomain recommendation tip inline: "Using a subdomain like `mail.yourdomain.com` protects your main domain's sending reputation. We recommend this over using your root domain."
- Call Resend API to register domain → get back DNS records
- Display DNS records in a copy-friendly table (record type, name, value, one-click copy button per row)
- Show Cloudflare fast path callout: "Using Cloudflare? You can add these records automatically via Resend's Domain Connect — no manual copy-paste needed."
- Status badge updates automatically via background polling — do not rely on a manual "Check Verification" button alone
- Status states: Pending (amber) | Verified (green) | Failed (red)
- On verified: domain appears in the From Email dropdown for all campaigns in this tenant

**Default domain behavior:**
- `mail.groundgame.digital` is the implicit fallback — always in the dropdown, no configuration needed
- If a tenant has one or more verified client-owned domains, those appear in the dropdown alongside the GS default
- There is no "set as default" control needed — the GS domain is the default, client domains are additional options chosen per campaign

**Delete domain:**
- Only available for client-owned domains, not the GS default
- Show warning if any sent campaigns used this domain

---

## 14. Unlayer Integration Notes for Claude Code

**Install:**
```bash
npm install react-email-editor
```

Note: The npm package name is `react-email-editor`, not `@unlayer/react`. Use `react-email-editor` for the import.

**Lazy loading — required:**
Unlayer is a heavy component and must never be included in the main bundle. Use Next.js dynamic imports with `ssr: false` so it only loads on the compose and edit routes:

```typescript
// In StepDesign.tsx
import dynamic from 'next/dynamic';

const EmailEditor = dynamic(
  () => import('react-email-editor'),
  { ssr: false, loading: () => <div>Loading editor...</div> }
);
```

**Full embed pattern:**
```typescript
import { useRef } from 'react';
import { EditorRef, EmailEditorProps } from 'react-email-editor';

const editorRef = useRef<EditorRef>(null);

const exportHtml = () => {
  const unlayer = editorRef.current?.editor;
  unlayer?.exportHtml((data) => {
    const { design, html } = data;
    // design = JSON to store in email_campaigns.design_json
    // html = rendered HTML to store in email_campaigns.html_body
  });
};

const loadDesign = (design: object) => {
  editorRef.current?.editor?.loadDesign(design);
};

const onReady: EmailEditorProps['onReady'] = (unlayer) => {
  // Load existing design if editing a saved draft
  // If new campaign, do nothing — editor starts blank
  if (existingDesign) {
    unlayer.loadDesign(existingDesign);
  }
};

<EmailEditor
  ref={editorRef}
  onReady={onReady}
  options={{
    projectId: 285907,           // GuerrillaSuite Unlayer project ID — do not change
    displayMode: 'email',
    version: 'latest',
    mergeTags: { /* see Section 3 */ },
    appearance: { /* see Section 3 */ },
    features: {
      preheaderText: false,      // Handled in our own Step 1 UI
    },
    // DO NOT add customJS or customCSS — not available on free plan
  }}
/>
```

**`projectId` is required.** Without it the editor either won't load or loads in a degraded state. Always pass `285907`.

**`onReady` vs `onLoad`:** Use `onReady` (fires when editor is fully initialized and ready for API calls like `loadDesign`). `onLoad` fires earlier and the editor may not be ready for design loading yet.

**`exportHtml` timing:** Call `exportHtml` when the user clicks to advance from Step 3 to Step 4. The callback is async — wait for it before saving and navigating.

---

## 15. Environment Variables Needed

```
RESEND_API_KEY                    # Already exists — auth/reminder emails only, do not use for Dispatch
RESEND_FROM_EMAIL                 # Already exists — e.g. reminders@guerrillasuite.com (auth emails only)
RESEND_DISPATCH_API_KEY           # New — dedicated Resend key for Dispatch bulk sends
RESEND_WEBHOOK_SECRET             # New — Resend webhook signing secret for bounce/delivery events
NEXT_PUBLIC_APP_URL               # New — base URL for redirect/unsubscribe links, e.g. https://app.guerrillasuite.com
                                  #       NOT currently in .env.local — must be added
```

`RESEND_API_KEY` and `RESEND_DISPATCH_API_KEY` are intentionally separate. Auth email sending and bulk campaign sending must never share a key. All Dispatch send logic uses `RESEND_DISPATCH_API_KEY` exclusively.

Note: `NEXT_PUBLIC_APP_URL` is needed server-side only (building unsubscribe/redirect URLs into email bodies), so the `NEXT_PUBLIC_` prefix is not strictly required — a plain `APP_URL` server env var is fine and keeps the value out of the browser bundle.

---

## 16. File Structure

New files to create:
```
app/
  crm/
    dispatch/
      page.tsx                    # Campaign list
      new/
        page.tsx                  # New campaign compose flow
      [id]/
        page.tsx                  # Campaign detail / results
        edit/
          page.tsx                # Edit draft (Unlayer embed)
        preview/
          page.tsx                # Preview rendered email
    settings/
      dispatch/
        page.tsx                  # Dispatch settings root
        domains/
          page.tsx                # Sending domain management
  r/
    [send_id]/
      [url_hash]/
        route.ts                  # Click tracking redirect
  unsubscribe/
    [send_id]/
      page.tsx                    # Unsubscribe landing page
  api/
    resend/
      webhook/
        route.ts                  # Resend webhook handler
    dispatch/
      send/
        [id]/
          route.ts                # Trigger campaign send
      preview/
        [id]/
          route.ts                # Generate preview HTML

app/
  components/
    crm/
      dispatch/                   # CRM-scoped components live here (beside CrmHeader.tsx etc.)
        CampaignList.tsx
        ComposeFlow.tsx           # Step wrapper
        StepDetails.tsx           # Step 1
        StepAudience.tsx          # Step 2
        StepDesign.tsx            # Step 3 — lazy loads Unlayer
        StepReview.tsx            # Step 4
        CampaignResults.tsx
        MergeTagPanel.tsx
        SendingDomainManager.tsx
```

Modified files:
```
lib/features.ts                             # Add "crm_dispatch" feature key
app/components/crm/CrmHeader.tsx            # Add Dispatch nav item to buildNav() (gated by crm_dispatch)
```

New Supabase tables:
```
email_campaigns
email_sends
email_clicks
email_unsubscribes
email_sending_domains
```

---

## 17. V1 vs V2 Boundary

### V1 — Build Now
- Drag-and-drop template builder (Unlayer)
- Dynamic merge fields ({First_Name}, {Unsubscribe_Link}, {Trackable_Link_URL})
- Send to segment or saved list
- Per-campaign from/reply-to configuration
- Sending domain verification via Resend
- Bounce handling (hard bounce → auto-unsubscribe)
- Unsubscribe page and suppression list
- Manual click tracking via {Trackable_Link_URL} merge tag
- Campaign results dashboard (sends, bounces, clicks, unsubscribes)
- Scheduled send
- CSV export of recipient results

### V2 — Do Not Build Now
- Automatic click tracking on all links (not just {Trackable_Link_URL})
- Open tracking (pixel)
- A/B subject line testing
- Drip sequences / automations
- Send/receive email aggregator (full inbox in CRM)
- Template library (saved reusable templates)
- Resend-to-non-openers
- Email analytics over time (multi-campaign trends)

---

## 18. Open Questions for Development

1. ~~**Unlayer license**~~ — **Resolved.** Free plan obtained. Project ID 285907 is in use.

2. **Send queue architecture** — For large sends (5,000+ recipients), sending sequentially in a single API route will timeout. Determine whether a background job approach is needed (Supabase Edge Function, a queue, or chunked sends via a long-running process on Railway). Must be resolved before building the send trigger route.

3. **Resend rate limits** — Resend's paid plan has a sending rate limit (2 requests/second by default per their docs). For large campaigns, implement a send queue with rate limiting and exponential backoff on 429 responses rather than hammering the API.

4. **Merge tag fallback behavior** — Define per-field: if `{City}` is empty, does it render as empty string, or does the whole sentence need to be conditional? V1 = empty string is acceptable. Document this in user-facing help text so senders know to write copy that reads naturally with or without the field.

5. **Audience filter storage** — Confirm the segment filter JSONB schema matches whatever GroundGame's existing list-building tools use, so the same filter engine can power both.

6. **Unlayer wildcard domain** — Confirm that `*.groundgame.digital` is accepted as a wildcard entry in Unlayer's project domain allowlist. If not, tenant subdomains must be added individually as clients are onboarded.

7. **`mail.groundgame.digital` DNS setup** — The GS-managed sending domain must be verified in Resend before any tenant can send. This is a one-time setup task that must be completed before Dispatch goes live for any tenant. SPF, DKIM, and DMARC records need to be added to the `groundgame.digital` DNS.
