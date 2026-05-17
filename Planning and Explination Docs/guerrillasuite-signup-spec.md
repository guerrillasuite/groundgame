# GuerrillaSuite — Marketing Site & GroundGame Signup Spec
## For Claude Code Implementation

**Status:** Ready to build  
**Domain:** `guerrillasuite.com` (Railway deployment, separate from `groundgame.digital`)  
**Stack:** Next.js (App Router) · Tailwind CSS · Stripe · Supabase · Resend  
**Priority:** Get campaign client (Field Pack) and B2B client (Scout Kit) through signup ASAP

---

## 0. Repository & Deployment Context

This is a **separate Next.js app** from the existing GroundGame codebase. It lives at `guerrillasuite.com` and handles:
- Suite-level marketing (all products)
- GroundGame pricing and signup flow
- Post-payment onboarding wizard
- Stripe webhook handling
- Nonprofit verification queue

It does NOT share a route namespace with `groundgame.digital`. On signup completion it creates a tenant in the shared Supabase instance and redirects the new user to `[slug].groundgame.digital`.

### Environment Variables Needed
```
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
RESEND_API_KEY
NEXT_PUBLIC_APP_URL=https://guerrillasuite.com
NEXT_PUBLIC_APP_DOMAIN=groundgame.digital
```

---

## 1. Site Structure

```
guerrillasuite.com/
  /                          # Suite homepage
  /groundgame                # GroundGame marketing + pricing
  /groundgame/signup         # Signup flow (multi-step)
  /groundgame/signup/verify  # Nonprofit doc upload + pending state
  /sitrep                    # Coming soon
  /ledgerline                # Coming soon
  /api/stripe/webhook        # Stripe webhook handler
  /api/signup/create-tenant  # Creates tenant in Supabase on payment success
  /api/signup/verify-nonprofit # Handles nonprofit doc upload
  /api/admin/verify-queue    # SuperAdmin nonprofit verification management
```

---

## 2. Design System

The GuerrillaSuite marketing site uses the same dark aesthetic as the app but with more visual drama — this is a sales surface, not a utility interface. Follow the VisualGuide.md token system for colors and components.

### Color Tokens (CSS variables — define in globals.css)
```css
:root {
  --gs-bg: rgb(8 11 18);
  --gs-surface: rgb(13 17 27);
  --gs-card: rgb(19 24 37);
  --gs-border: rgba(255, 255, 255, 0.07);
  --gs-border-bright: rgba(255, 255, 255, 0.12);
  --gs-text: rgb(236 240 245);
  --gs-dim: rgb(100 116 139);
  --gs-dim-bright: rgb(148 163 184);
  --gs-primary: #2563eb;
  --gs-primary-glow: color-mix(in srgb, #2563eb 30%, transparent);
  --gs-green: #22c55e;
  --gs-amber: #f59e0b;
  --gs-red: #ef4444;

  /* Track accent colors */
  --campaign-accent: #3b82f6;   /* blue */
  --business-accent: #8b5cf6;   /* violet */
  --nonprofit-accent: #22c55e;  /* green */
}
```

### Typography
Use `Syne` (display/headings) + `DM Sans` (body). Import via Google Fonts in layout.tsx.

```html
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300&display=swap" rel="stylesheet" />
```

### Shared Component Patterns

**Primary Button:**
```tsx
// style — use for all CTAs
const primaryBtn: React.CSSProperties = {
  background: "linear-gradient(135deg, #2563eb, color-mix(in srgb, #2563eb 68%, #7c3aed))",
  border: "none",
  borderRadius: 10,
  color: "#fff",
  fontFamily: "'Syne', sans-serif",
  fontWeight: 700,
  fontSize: 14,
  padding: "12px 28px",
  cursor: "pointer",
  boxShadow: "0 2px 20px color-mix(in srgb, #2563eb 40%, transparent)",
  transition: "transform .12s ease, box-shadow .12s ease",
  letterSpacing: "0.02em",
};
// hover: translateY(-2px), expanded glow
```

**Card:**
```tsx
const card: React.CSSProperties = {
  background: "rgb(19 24 37)",
  border: "1px solid rgba(255,255,255,.07)",
  borderRadius: 16,
  padding: "28px 32px",
};
```

**Track Badge:**
```tsx
// Pass track: "campaign" | "business" | "nonprofit"
// campaign → blue pill, business → violet pill, nonprofit → green pill
```

---

## 3. Database Schema Changes

Add these columns/tables to the existing Supabase instance before building the signup flow.

### Add to `tenants` table
```sql
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS
  track TEXT CHECK (track IN ('campaign', 'business', 'nonprofit'));

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS
  tier TEXT CHECK (tier IN ('scout_kit', 'field_pack', 'war_chest', 'enterprise', 'national'));

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS
  stripe_customer_id TEXT;

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS
  stripe_subscription_id TEXT;

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS
  billing_type TEXT DEFAULT 'stripe' CHECK (billing_type IN ('stripe', 'mercury'));

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS
  verification_status TEXT DEFAULT 'approved'
    CHECK (verification_status IN ('approved', 'pending', 'rejected', 'resubmit_requested'));

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS
  ein TEXT; -- B2B only

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS
  nonprofit_doc_url TEXT; -- Supabase Storage URL

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS
  verification_requested_at TIMESTAMPTZ;

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS
  verification_reviewed_at TIMESTAMPTZ;

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS
  verification_notes TEXT; -- Internal notes from SuperAdmin review

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS
  onboarding_completed BOOLEAN DEFAULT false;

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS
  onboarding_step INTEGER DEFAULT 0; -- Tracks wizard progress
```

### New table: `nonprofit_verification_docs`
```sql
CREATE TABLE nonprofit_verification_docs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id),
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'resubmit_requested')),
  reviewer_notes TEXT
);

CREATE INDEX idx_nonprofit_docs_tenant ON nonprofit_verification_docs(tenant_id);
CREATE INDEX idx_nonprofit_docs_status ON nonprofit_verification_docs(status);
```

### New table: `signup_sessions`
Tracks in-progress signups so the wizard can resume if the user refreshes.
```sql
CREATE TABLE signup_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  track TEXT,
  tier TEXT,
  org_name TEXT,
  stripe_customer_id TEXT,
  stripe_session_id TEXT,
  completed BOOLEAN DEFAULT false,
  wizard_data JSONB DEFAULT '{}', -- Stores partial wizard state
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours'
);

CREATE INDEX idx_signup_sessions_token ON signup_sessions(session_token);
CREATE INDEX idx_signup_sessions_email ON signup_sessions(email);
```

---

## 4. Stripe Configuration

### Products to Create in Stripe Dashboard

Create these products ONCE in Stripe. Each product has monthly and annual prices.

**Campaign Track:**
```
Product: GuerrillaSuite Campaign — Scout Kit
  Price (monthly): $25/mo  → price_campaign_scout_monthly
  Price (annual):  $250/yr → price_campaign_scout_annual

Product: GuerrillaSuite Campaign — Field Pack
  Price (monthly): $50/mo  → price_campaign_field_monthly
  Price (annual):  $500/yr → price_campaign_field_annual

Product: GuerrillaSuite Campaign — War Chest
  Price (monthly): $100/mo  → price_campaign_war_monthly
  Price (annual):  $1000/yr → price_campaign_war_annual
```

**Business Track:**
```
Product: GuerrillaSuite Business — Scout Kit
  Price (monthly): $25/mo  → price_business_scout_monthly
  Price (annual):  $250/yr → price_business_scout_annual

Product: GuerrillaSuite Business — Field Pack
  Price (monthly): $50/mo  → price_business_field_monthly
  Price (annual):  $500/yr → price_business_field_annual

Product: GuerrillaSuite Business — War Chest
  Price (monthly): $100/mo  → price_business_war_monthly
  Price (annual):  $1000/yr → price_business_war_annual
```

**Nonprofit Track (50% off — use Stripe Coupons, not separate products):**
```
Coupon: NONPROFIT50
  Type: Percent off
  Amount: 50%
  Duration: Forever
  Apply to: All nonprofit signups during checkout session creation
```

**Seat Add-ons (metered or licensed — create as separate prices):**
```
Product: Additional Operative Seat — B2B
  Scout Kit: $8/seat/mo  → price_operative_scout
  Field Pack: $6/seat/mo → price_operative_field
  War Chest:  $5/seat/mo → price_operative_war

Product: Additional Support Seat — B2B
  Scout Kit: $12/seat/mo  → price_support_scout
  Field Pack: $10/seat/mo → price_support_field
  War Chest:  $8/seat/mo  → price_support_war

Product: Additional Director Seat — All tracks
  Scout Kit: $15/seat/mo  → price_director_scout
  Field Pack: $12/seat/mo → price_director_field
  War Chest:  $10/seat/mo → price_director_war
```

**Promo Coupons:**
```
Coupon: TRIAL14  → 100% off, duration: 14 days (free trial period)
Coupon: TRIAL30  → 100% off, duration: 30 days
Coupon: TRIAL60  → 100% off, duration: 60 days
```

### Price ID Map
Store this in `lib/stripe-prices.ts` in the new codebase:

```typescript
// lib/stripe-prices.ts

export const STRIPE_PRICES = {
  campaign: {
    scout_kit:  { monthly: "price_campaign_scout_monthly",  annual: "price_campaign_scout_annual" },
    field_pack: { monthly: "price_campaign_field_monthly",  annual: "price_campaign_field_annual" },
    war_chest:  { monthly: "price_campaign_war_monthly",    annual: "price_campaign_war_annual" },
  },
  business: {
    scout_kit:  { monthly: "price_business_scout_monthly",  annual: "price_business_scout_annual" },
    field_pack: { monthly: "price_business_field_monthly",  annual: "price_business_field_annual" },
    war_chest:  { monthly: "price_business_war_monthly",    annual: "price_business_war_annual" },
  },
} as const;

export type Track = keyof typeof STRIPE_PRICES;
export type Tier = keyof (typeof STRIPE_PRICES)[Track];
export type BillingInterval = "monthly" | "annual";

export function getPriceId(track: Track, tier: Tier, interval: BillingInterval): string {
  return STRIPE_PRICES[track][tier][interval];
}
```

---

## 5. Feature Flag Map

This drives what gets written to `tenants.features` when a tenant is provisioned.
Store in `lib/plan-features.ts` in the new codebase (mirrors the pattern in the main app's `lib/features.ts`):

```typescript
// lib/plan-features.ts

export type Track = "campaign" | "business" | "nonprofit";
export type Tier = "scout_kit" | "field_pack" | "war_chest" | "enterprise";

const CAMPAIGN_FEATURES: Record<Tier, string[]> = {
  scout_kit: [
    "crm_core",
    "email",           // Dispatch — all tiers all tracks
    "sitrep_core",
    "sitrep_calendar",
    "sitrep_team",
    "sitrep_missions",
    "news",            // Intel Brief — campaigns get it ALL tiers
    "crm_enrichment",
  ],
  field_pack: [
    "crm_core",
    "email",
    "sitrep_core",
    "sitrep_calendar",
    "sitrep_team",
    "sitrep_missions",
    "news",
    "crm_enrichment",
    "fieldrecon",
    "advanced_reporting",
    "crm_survey_branding",
  ],
  war_chest: [
    "crm_core",
    "email",
    "sitrep_core",
    "sitrep_calendar",
    "sitrep_team",
    "sitrep_missions",
    "news",
    "crm_enrichment",
    "fieldrecon",
    "advanced_reporting",
    "crm_survey_branding",
    "advanced_automation",
    "advanced_permissions",
    "api_access",
  ],
  enterprise: [
    // All war_chest features plus sub-accounts — set manually
    "crm_core", "email", "sitrep_core", "sitrep_calendar", "sitrep_team",
    "sitrep_missions", "news", "crm_enrichment", "fieldrecon",
    "advanced_reporting", "crm_survey_branding", "advanced_automation",
    "advanced_permissions", "api_access", "sub_accounts",
  ],
};

const BUSINESS_FEATURES: Record<Tier, string[]> = {
  scout_kit: [
    "crm_core",
    "email",
    "sitrep_core",
    "sitrep_calendar",
    "sitrep_team",
    "sitrep_missions",
    "crm_enrichment",
    // NO "news" — Intel Brief is War Chest only for B2B
  ],
  field_pack: [
    "crm_core",
    "email",
    "sitrep_core",
    "sitrep_calendar",
    "sitrep_team",
    "sitrep_missions",
    "crm_enrichment",
    "fieldrecon",
    "advanced_reporting",
    "crm_survey_branding",
  ],
  war_chest: [
    "crm_core",
    "email",
    "sitrep_core",
    "sitrep_calendar",
    "sitrep_team",
    "sitrep_missions",
    "crm_enrichment",
    "fieldrecon",
    "advanced_reporting",
    "crm_survey_branding",
    "advanced_automation",
    "advanced_permissions",
    "api_access",
    "news",            // Intel Brief — B2B gets it at War Chest only
  ],
  enterprise: [
    "crm_core", "email", "sitrep_core", "sitrep_calendar", "sitrep_team",
    "sitrep_missions", "crm_enrichment", "fieldrecon", "advanced_reporting",
    "crm_survey_branding", "advanced_automation", "advanced_permissions",
    "api_access", "news", "sub_accounts",
  ],
};

// Nonprofit mirrors campaign features
const NONPROFIT_FEATURES = CAMPAIGN_FEATURES;

export const PLAN_FEATURES: Record<Track, Record<Tier, string[]>> = {
  campaign: CAMPAIGN_FEATURES,
  business: BUSINESS_FEATURES,
  nonprofit: NONPROFIT_FEATURES,
};

export function getFeaturesForPlan(track: Track, tier: Tier): string[] {
  return PLAN_FEATURES[track][tier] ?? [];
}
```

---

## 6. Contact Record Limits

```typescript
// lib/record-limits.ts

export const RECORD_LIMITS: Record<string, Record<string, number>> = {
  campaign: {
    scout_kit:  150_000,
    field_pack: 500_000,
    war_chest:  1_000_000,
  },
  business: {
    scout_kit:  5_000,
    field_pack: 100_000,
    war_chest:  250_000,
  },
  nonprofit: {
    scout_kit:  150_000,
    field_pack: 500_000,
    war_chest:  1_000_000,
  },
};

export function getRecordLimit(track: string, tier: string): number {
  return RECORD_LIMITS[track]?.[tier] ?? 5_000;
}
```

---

## 7. Included Seat Counts

```typescript
// lib/seat-limits.ts

export type SeatRole = "operative" | "support" | "director";

export const INCLUDED_SEATS: Record<string, Record<string, Record<SeatRole, number>>> = {
  campaign: {
    // Campaigns: unlimited operatives and support, directors included per tier
    scout_kit:  { operative: Infinity, support: Infinity, director: 1 },
    field_pack: { operative: Infinity, support: Infinity, director: 2 },
    war_chest:  { operative: Infinity, support: Infinity, director: 3 },
    enterprise: { operative: Infinity, support: Infinity, director: 5 },
  },
  business: {
    scout_kit:  { operative: 3,  support: 2,  director: 1 },
    field_pack: { operative: 5,  support: 3,  director: 2 },
    war_chest:  { operative: 15, support: 5,  director: 3 },
    enterprise: { operative: 20, support: 10, director: 5 },
  },
  nonprofit: {
    // Mirrors campaign
    scout_kit:  { operative: Infinity, support: Infinity, director: 1 },
    field_pack: { operative: Infinity, support: Infinity, director: 2 },
    war_chest:  { operative: Infinity, support: Infinity, director: 3 },
    enterprise: { operative: Infinity, support: Infinity, director: 5 },
  },
};
```

---

## 8. Pricing Page Content

### Tier Descriptions

```typescript
// lib/pricing-content.ts

export const TIER_CONTENT = {
  scout_kit: {
    name: "Scout Kit",
    emoji: "🧭",
    tagline: "Get in the field fast.",
    description: "Everything you need to start running your operation from day one.",
    monthlyPrice: 25,
    annualPrice: 250,
    annualSavings: 50,
  },
  field_pack: {
    name: "Field Pack",
    emoji: "🎒",
    tagline: "Built for teams that move.",
    description: "Territory tools, advanced reporting, and scheduling for growing organizations.",
    monthlyPrice: 50,
    annualPrice: 500,
    annualSavings: 100,
  },
  war_chest: {
    name: "War Chest",
    emoji: "💰",
    tagline: "Full arsenal. No limits.",
    description: "Every tool unlocked. API access, automation, and advanced permissions.",
    monthlyPrice: 100,
    annualPrice: 1000,
    annualSavings: 200,
  },
};

export const TRACK_CONTENT = {
  campaign: {
    name: "Political Campaign",
    accent: "#3b82f6",
    headline: "Built for campaigns that fight to win.",
    subheadline: "Unlimited field reps. Intel Brief on every plan. FEC-ready from day one.",
    keyDiffs: [
      "Unlimited Operatives and Support — free",
      "Intel Brief news intelligence on every plan",
      "Canvassing, phone banking, and voter contact built in",
      "Multi-campaign management (Field Pack+)",
    ],
  },
  business: {
    name: "Business & Sales",
    accent: "#8b5cf6",
    headline: "Your sales team's command center.",
    subheadline: "Pipeline management, bulk email, and territory tools for teams that close.",
    keyDiffs: [
      "Operative and Support seats included per tier",
      "Full pipeline and disposition tracking",
      "Dispatch bulk email on every plan",
      "Intel Brief news intelligence (War Chest)",
    ],
  },
};
```

---

## 9. File Structure

```
apps/guerrillasuite-web/
├── app/
│   ├── layout.tsx                        # Root layout — fonts, globals
│   ├── page.tsx                          # Suite homepage
│   ├── groundgame/
│   │   ├── page.tsx                      # GroundGame marketing + pricing
│   │   └── signup/
│   │       ├── page.tsx                  # Signup flow entry
│   │       ├── verify/
│   │       │   └── page.tsx              # Nonprofit doc upload + pending
│   │       └── complete/
│   │           └── page.tsx              # Post-payment wizard
│   ├── sitrep/
│   │   └── page.tsx                      # Coming soon
│   ├── ledgerline/
│   │   └── page.tsx                      # Coming soon
│   └── api/
│       ├── stripe/
│       │   └── webhook/
│       │       └── route.ts              # Stripe webhook handler
│       ├── signup/
│       │   ├── create-session/
│       │   │   └── route.ts              # Creates Stripe checkout session
│       │   ├── create-tenant/
│       │   │   └── route.ts              # Provisions tenant in Supabase
│       │   └── verify-nonprofit/
│       │       └── route.ts              # Handles doc upload
│       └── admin/
│           └── verify-queue/
│               └── route.ts              # SuperAdmin verification management
├── components/
│   ├── marketing/
│   │   ├── SuiteNav.tsx                  # Top navigation
│   │   ├── SuiteFooter.tsx              # Footer
│   │   ├── HeroSection.tsx              # Suite homepage hero
│   │   ├── ProductCard.tsx              # Suite homepage product cards
│   │   ├── ComingSoonPage.tsx           # Reusable coming soon template
│   │   └── groundgame/
│   │       ├── TrackSelector.tsx         # Campaign / Business / Nonprofit picker
│   │       ├── PricingTable.tsx          # Tier comparison for selected track
│   │       ├── FeatureRow.tsx            # Individual feature row in comparison table
│   │       └── TrackKeyDiffs.tsx         # "Why this track" callout block
│   └── signup/
│       ├── SignupFlow.tsx                # Multi-step signup wrapper
│       ├── StepOrgType.tsx              # Step 1: Track selection
│       ├── StepTierSelect.tsx           # Step 2: Tier selection
│       ├── StepOrgDetails.tsx           # Step 3: Org name, contact, EIN
│       ├── StepPayment.tsx              # Step 4: Stripe checkout redirect
│       ├── StepToS.tsx                  # Step 5: Terms acceptance
│       ├── WizardWrapper.tsx            # Post-payment wizard shell
│       ├── WizardStepBranding.tsx       # Logo + color
│       ├── WizardStepSitRep.tsx         # Item type selection
│       ├── WizardStepIntake.tsx         # Intake template selection
│       ├── WizardStepIntelBrief.tsx     # Intel Brief keywords (campaign only)
│       └── NonprofitVerify.tsx          # Doc upload + pending state
├── lib/
│   ├── stripe-prices.ts                 # Price ID map (Section 4)
│   ├── plan-features.ts                 # Feature flag map (Section 5)
│   ├── record-limits.ts                 # Contact limits (Section 6)
│   ├── seat-limits.ts                   # Seat counts (Section 7)
│   ├── pricing-content.ts               # Marketing copy (Section 8)
│   ├── stripe.ts                        # Stripe client singleton
│   ├── supabase.ts                      # Supabase service role client
│   └── resend.ts                        # Resend email client
└── public/
    └── images/
        └── [logos, og images, etc.]
```

---

## 10. Signup Flow — Step by Step

### Step 1 — Track Selection (`StepOrgType.tsx`)

Three large cards side by side (or stacked on mobile):

```
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  🗳️ Campaign    │  │  💼 Business    │  │  🤝 Nonprofit   │
│                 │  │                 │  │                 │
│  Campaigns,     │  │  Sales teams,   │  │  501(c)(3) and  │
│  PACs, party    │  │  agencies,      │  │  (c)(4) orgs.   │
│  committees     │  │  small biz      │  │  50% off.       │
│                 │  │                 │  │  Verification   │
│                 │  │  Requires EIN   │  │  required.      │
│  [Select]       │  │  [Select]       │  │  [Select]       │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

Each card has the track accent color on hover. Selected card gets accent border + background tint.

### Step 2 — Tier Selection (`StepTierSelect.tsx`)

Shows the three tiers for the selected track with full feature comparison. Toggle between Monthly / Annual billing at the top.

Each tier card shows:
- Tier name, emoji, tagline
- Price (monthly or annual)
- "Save $X/year" badge on annual toggle
- Included seats (formatted for the track — campaigns show "Unlimited Operatives")
- Top 5 features included
- Greyed-out features not included
- "Most Popular" badge on Field Pack

### Step 3 — Org Details (`StepOrgDetails.tsx`)

```
Fields for all tracks:
- Organization Name (required)
- Your Full Name (required)
- Email Address (required)
- Password (required, min 8 chars)
- Phone Number (optional)

Additional field — Business track only:
- EIN (Employer Identification Number) — format: XX-XXXXXXX
  Helper text: "Required for business accounts. Your EIN will be verified."

Additional field — Nonprofit track only:
- Organization Type (radio): 501(c)(3) | 501(c)(4)
  Helper text: "You'll upload your IRS determination letter after payment."
```

### Step 4 — Promo Code (`StepPromo.tsx`)

Simple optional step — shown between details and payment:

```
Have a promo code?
[ Enter code _________________ ] [Apply]

If valid: green checkmark + "X days free applied" or "X% off applied"
If invalid: red message "That code isn't valid"
```

Promo code validation hits Stripe's coupon API server-side before proceeding.

### Step 5 — Terms of Service (`StepToS.tsx`)

```
Before we proceed to payment, please review and accept our terms.

[Scrollable ToS content — ~400px height, must scroll to bottom to enable checkbox]

☐ I have read and agree to the GuerrillaSuite Terms of Service
☐ I have read and agree to the GuerrillaSuite Privacy Policy

[Continue to Payment →]
```

**Note:** ToS and Privacy Policy content are placeholder at build time. Real legal documents must be inserted before any client goes through this flow. The components are built to accept the content as props from a CMS or static file.

### Step 6 — Payment (Stripe Checkout)

On "Continue to Payment" the app:
1. Creates a Stripe Customer with the org details
2. Creates a Stripe Checkout Session with:
   - The correct price ID for track + tier + interval
   - The nonprofit coupon if applicable
   - The promo code coupon if one was entered
   - `success_url`: `https://guerrillasuite.com/groundgame/signup/complete?session_id={CHECKOUT_SESSION_ID}`
   - `cancel_url`: `https://guerrillasuite.com/groundgame/signup`
   - Metadata: `{ track, tier, orgName, ein, nonprofitType, tosAccepted: "true" }`
3. Redirects to Stripe-hosted checkout page

```typescript
// app/api/signup/create-session/route.ts

import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { getPriceId } from "@/lib/stripe-prices";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    track, tier, interval, orgName, email, name,
    ein, nonprofitType, promoCode,
  } = body;

  // Validate required fields
  if (!track || !tier || !interval || !orgName || !email) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Get price ID
  const priceId = getPriceId(track, tier, interval);
  if (!priceId) {
    return NextResponse.json({ error: "Invalid plan selection" }, { status: 400 });
  }

  // Create Stripe customer
  const customer = await stripe.customers.create({
    email,
    name,
    metadata: { orgName, track, tier, ein: ein ?? "", nonprofitType: nonprofitType ?? "" },
  });

  // Build discounts array
  const discounts: Stripe.Checkout.SessionCreateParams.Discount[] = [];

  // Nonprofit always gets NONPROFIT50 coupon
  if (track === "nonprofit") {
    discounts.push({ coupon: "NONPROFIT50" });
  }

  // Add promo code if provided (validate it's a trial code, not NONPROFIT50)
  if (promoCode && promoCode !== "NONPROFIT50") {
    try {
      const coupon = await stripe.coupons.retrieve(promoCode);
      if (coupon.valid) {
        discounts.push({ coupon: coupon.id });
      }
    } catch {
      return NextResponse.json({ error: "Invalid promo code" }, { status: 400 });
    }
  }

  // Create checkout session
  const session = await stripe.checkout.sessions.create({
    customer: customer.id,
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    mode: "subscription",
    discounts: discounts.length > 0 ? discounts : undefined,
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/groundgame/signup/complete?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/groundgame/signup`,
    metadata: {
      track,
      tier,
      orgName,
      email,
      ein: ein ?? "",
      nonprofitType: nonprofitType ?? "",
      tosAccepted: "true",
    },
  });

  return NextResponse.json({ url: session.url });
}
```

---

## 11. Stripe Webhook Handler

```typescript
// app/api/stripe/webhook/route.ts

import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getFeaturesForPlan } from "@/lib/plan-features";
import { getRecordLimit } from "@/lib/record-limits";
import { sendWelcomeEmail } from "@/lib/email/welcome";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature")!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {

    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const meta = session.metadata!;

      const track = meta.track as "campaign" | "business" | "nonprofit";
      const tier = meta.tier as "scout_kit" | "field_pack" | "war_chest";

      // Generate tenant slug from org name
      const slug = meta.orgName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 30);

      const features = getFeaturesForPlan(track, tier);
      const recordLimit = getRecordLimit(track, tier);

      // Determine verification status
      const verificationStatus = track === "nonprofit" ? "pending" : "approved";

      // Create tenant in Supabase
      const { data: tenant, error } = await supabase
        .from("tenants")
        .insert({
          name: meta.orgName,
          slug,
          track,
          tier,
          features,
          stripe_customer_id: session.customer as string,
          stripe_subscription_id: session.subscription as string,
          billing_type: "stripe",
          verification_status: verificationStatus,
          ein: meta.ein || null,
          settings: { recordLimit },
          onboarding_completed: false,
          onboarding_step: 0,
        })
        .select()
        .single();

      if (error) {
        console.error("Tenant creation failed:", error);
        return NextResponse.json({ error: "Tenant creation failed" }, { status: 500 });
      }

      // Create auth user in Supabase
      const { data: authUser } = await supabase.auth.admin.createUser({
        email: meta.email,
        email_confirm: true,
        user_metadata: { full_name: meta.name, tenant_id: tenant.id },
      });

      if (authUser?.user) {
        // Create tenant membership as Director
        await supabase.from("tenant_memberships").insert({
          tenant_id: tenant.id,
          user_id: authUser.user.id,
          role: "director",
          active: true,
        });
      }

      // Send welcome email
      await sendWelcomeEmail({
        to: meta.email,
        orgName: meta.orgName,
        track,
        tier,
        wizardUrl: `${process.env.NEXT_PUBLIC_APP_URL}/groundgame/signup/complete?tenant=${tenant.id}`,
        isNonprofit: track === "nonprofit",
      });

      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      // Handle plan changes — update features and tier in tenant record
      // Look up tenant by stripe_customer_id and update accordingly
      // Implementation: query tenants by stripe_customer_id, update tier + features
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      // Mark tenant as inactive or downgrade to free
      // Implementation: query by stripe_subscription_id, set active = false
      break;
    }

    case "invoice.payment_failed": {
      // Send payment failed email via Resend
      // Implementation: look up tenant, send dunning email
      break;
    }
  }

  return NextResponse.json({ received: true });
}
```

---

## 12. Post-Payment Onboarding Wizard

### Wizard Shell (`WizardWrapper.tsx`)

The wizard loads at `/groundgame/signup/complete` after Stripe redirects back. It reads the `session_id` from the URL, fetches the tenant, and walks through the steps.

```
Step indicator at top: ● ● ○ ○ ○  "Step 2 of 5 — Branding"

Progress saves to signup_sessions.wizard_data on each step
so the user can refresh without losing progress.
```

### Wizard Steps

**Step 1 — Welcome & Org Confirmation**
```
Welcome to GuerrillaSuite, [Org Name]!

You're on the [Tier] plan — [Track] track.
[Features summary — 4-5 bullet points for their plan]

[Let's get you set up →]
```

**Step 2 — Branding (`WizardStepBranding.tsx`)**
```
Make it yours.

Logo: [Upload area — drag & drop or click, accepts PNG/JPG/SVG, max 5MB]
     Required — this is the logo your team will see every time they log in.

Primary Color:
[Color swatches — 12 options matching the GS palette]
[Custom hex input]

Preview: [Live preview of how the app header will look with their logo + color]

[Save & Continue →]
```

Logo uploads to Supabase Storage at `tenant-logos/[tenant_id]/logo.[ext]`.
Color is saved to `tenants.branding.primaryColor`.

**Step 3 — SitRep Item Types (`WizardStepSitRep.tsx`)**

Campaign / Nonprofit track shows:
```
Set up your SitRep.
Check everything your team will track. You can add more later.

☑ Tasks          ☑ Events         ☑ Meetings
☐ Canvass Shifts ☐ Phone Banks    ☐ Door Knocks
☐ Volunteer Shifts ☐ Trainings    ☐ Deadlines

+ Add your own: [________________] [Add]
                                    ↑ typing here and hitting enter
                                      adds a custom checked item below

[Save & Continue →]
```

Business track shows:
```
☑ Tasks          ☑ Meetings       ☐ Calls
☐ Demos          ☐ Follow-ups     ☐ Deadlines
☐ Site Visits    ☐ Client Reviews ☐ Deliverables

+ Add your own: [________________] [Add]
```

On save, selected item types are written to `sitrep_item_types` for this tenant via the existing SitRep API.

**Step 4 — Intake Templates (`WizardStepIntake.tsx`)**

Campaign / Nonprofit track:
```
Choose your intake templates.
These are the scripts and forms your team will use in the field.
Select all that apply — you can customize them after setup.

☐ Door Knock Script
☐ Phone Bank Script
☐ Tabling Sign-Up
☐ Volunteer Sign-Up
☐ Donor Intake

[Save & Continue →]
```

Business track:
```
☐ Sales Lead Intake
☐ Customer Inquiry
☐ Demo Request

[Save & Continue →]
```

Templates selected here are created from a pre-built template library stored in Supabase. On save, selected templates are copied into the tenant's contact type / disposition system.

**Step 5 — Intel Brief Keywords (`WizardStepIntelBrief.tsx`)**
*Campaign and Nonprofit tracks only — Business track skips this step.*

```
Set up your Intel Brief.
Intel Brief monitors the news for your campaign. Add keywords and we'll
surface relevant stories automatically.

[Keyword tag input — type and press Enter or comma to add]

Suggested for your campaign:
[Candidate Name] [Opponent Name] [District Name] [Key Issues] [Local Geography]
(Click any suggestion to add it)

You can adjust these anytime in Intel Brief Settings.

[Save & Continue →]
```

Keywords saved to `tenant_news_settings` for this tenant via the existing Intel Brief API.

**Step 6 — Done**
```
You're all set, [Org Name]! 🎉

Your GroundGame account is ready.

[Campaign track only if nonprofit — pending verification notice:]
  ⚠️ Your account is pending nonprofit verification.
  Upload your IRS determination letter to activate your 50% discount.
  [Upload Documentation →]

[Go to your GroundGame dashboard →]
  (links to [slug].groundgame.digital)
```

---

## 13. Nonprofit Verification Flow

### Document Upload (`NonprofitVerify.tsx`)

```
Upload your IRS Determination Letter

To receive your 50% nonprofit discount, we need to verify your
501(c)(3) or (c)(4) status.

[Upload area — PDF only, max 10MB]

Your account is active while we review your documentation.
Reviews typically complete within 1-2 business days.

If you don't have your determination letter handy, you can
upload it later from your account settings.

[Upload & Submit] [I'll do this later]
```

File uploads to Supabase Storage at `nonprofit-verification/[tenant_id]/[filename]`.
A row is inserted into `nonprofit_verification_docs`.
Tenant's `verification_status` stays `pending`.
You receive a Resend notification email with a link to the verification queue.

### Verification States

**Pending** — account active, charged at 50% off (Stripe coupon already applied), awaiting your review.

**Approved** — discount confirmed, status flipped to `approved`, confirmation email sent to client.

**Resubmit Requested** — you send an email explaining what's missing, 7-day clock starts, status set to `resubmit_requested`.

**Rejected (Discount Removed)** — if they don't qualify or don't resubmit in 7 days, the `NONPROFIT50` coupon is removed from their Stripe subscription via the API, status set to `approved` (they keep their account at full price), email explains the outcome.

### SuperAdmin Verification Queue (`/api/admin/verify-queue`)

This endpoint is called by a simple internal admin page (can live at `guerrillasuite.com/admin/verify` behind basic auth for now, or inside the existing SuperAdmin panel in the main app).

```typescript
// app/api/admin/verify-queue/route.ts

// GET — returns all pending verification requests
// POST — takes action: approve | request_resubmit | reject_discount

// approve:
//   - Update nonprofit_verification_docs.status = 'approved'
//   - Update tenants.verification_status = 'approved'
//   - Send approval email via Resend

// request_resubmit:
//   - Update status = 'resubmit_requested'
//   - Send resubmit email with explanation
//   - Set 7-day deadline in tenants.verification_notes

// reject_discount:
//   - Remove NONPROFIT50 coupon from Stripe subscription
//   - Update tenants.verification_status = 'approved' (account stays active)
//   - Send email explaining they're on standard pricing
```

---

## 14. Email Templates (Resend)

### Welcome Email
Sent immediately after `checkout.session.completed`.

Subject: `Welcome to GuerrillaSuite — let's get [Org Name] set up`

Content:
- Welcome + org name
- Their plan summary
- Link to complete the onboarding wizard
- If nonprofit: note that verification is pending

### Nonprofit Verification Notification (to you)
Sent when a nonprofit uploads their document.

Subject: `[Nonprofit Verification] [Org Name] submitted documentation`

Content:
- Org name, email, 501(c) type
- Link to the verification queue

### Verification Approved Email (to client)
Subject: `Your nonprofit discount is confirmed — [Org Name]`

### Resubmission Request Email (to client)
Subject: `Action needed — nonprofit verification for [Org Name]`

Content:
- What was missing / why it needs resubmission
- Link to upload new document
- 7-day deadline noted

### Discount Removed Email (to client)
Subject: `Update on your GuerrillaSuite account — [Org Name]`

Content:
- Empathetic explanation that they don't qualify for the nonprofit rate
- Their account remains active at standard pricing
- Encourage them to contact support if they have questions

### Payment Failed Email (to client)
Subject: `Action needed — payment failed for [Org Name]`

Content:
- Clear explanation
- Link to update payment method in Stripe customer portal
- Account will remain active for X days

---

## 15. Marketing Pages

### Suite Homepage (`app/page.tsx`)

**Hero:**
```
GuerrillaSuite
One platform. Every mission.

[Subheadline: The integrated operating system for campaigns,
businesses, and organizations that run to win.]

[Explore GroundGame →]  [See all products ↓]
```

**Product Cards (3 cards):**
```
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  GroundGame      │  │  SitRep          │  │  LedgerLine      │
│  Field CRM       │  │  Tasks &         │  │  Financial       │
│  + Canvassing    │  │  Calendar        │  │  Management      │
│                  │  │                  │  │                  │
│  [Get Started →] │  │  [Coming Soon]   │  │  [Coming Soon]   │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

**Suite value props (below cards):**
- One login across all products
- Data entered anywhere enriches the whole suite
- Built for organizations that move fast

### GroundGame Page (`app/groundgame/page.tsx`)

**Hero:**
```
GroundGame
Your field operation, command center, and CRM — in one.

[Subheadline: Built for political campaigns and sales teams
that need to move fast and win.]

[Get Started →]  [See pricing ↓]
```

**Track Selector (Tab UI):**
```
[🗳️ Campaign]  [💼 Business]  [🤝 Nonprofit]
```

Clicking a tab swaps the pricing table and feature comparison below.

**Pricing Table:**
Three tier cards for the selected track — full feature comparison with ✅ / ❌ per row.

**Key Differentiators Block:**
Below pricing — 3-4 bullet points specific to the selected track (from `TRACK_CONTENT`).

**"Get Started" button** on each tier card links to:
`/groundgame/signup?track=[track]&tier=[tier]`

Pre-selecting the track and tier when the user arrives at the signup flow.

### Coming Soon Pages (`app/sitrep/page.tsx`, `app/ledgerline/page.tsx`)

Use a shared `ComingSoonPage` component:

```tsx
// components/marketing/ComingSoonPage.tsx

export default function ComingSoonPage({
  productName,
  tagline,
  description,
  emoji,
}: {
  productName: string;
  tagline: string;
  description: string;
  emoji: string;
}) {
  // Dark hero with product name, tagline, description
  // Email capture form: "Get notified when [productName] launches"
  // Saves email to a simple `waitlist` table in Supabase
  // Back link to guerrillasuite.com
}
```

**SitRep:**
- Tagline: "Tasks, reminders, and calendar — built for how your team actually works."
- Description: "SitRep keeps your whole operation on schedule, from campaign events to team meetings to personal deadlines. One view for everything."

**LedgerLine:**
- Tagline: "Financial management built for organizations that run lean."
- Description: "Full-cycle accounting, budgeting, payroll, and compliance reporting — including FEC filings for campaigns."

### Navigation (`components/marketing/SuiteNav.tsx`)

```
GuerrillaSuite logo    Products ▾    [Sign In]    [Get Started →]

Products dropdown:
  GroundGame (live)
  SitRep (coming soon)
  LedgerLine (coming soon)
```

---

## 16. Waitlist Table

For the coming soon email captures:

```sql
CREATE TABLE waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  product TEXT NOT NULL CHECK (product IN ('sitrep', 'ledgerline')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (email, product)
);
```

---

## 17. Open Items Before Launch

These are not blocking the build but must be resolved before real clients go through the flow:

1. **Terms of Service** — placeholder component is built. Real legal document must be inserted before any client signs up. Strongly recommend a lawyer review given the campaign/FEC context.

2. **Privacy Policy** — same as above.

3. **`guerrillasuite.com` DNS** — point to Railway deployment. Separate service from `groundgame.digital`.

4. **Stripe price IDs** — the constants in `lib/stripe-prices.ts` use placeholder strings. Replace with real Stripe price IDs after creating products in the Stripe dashboard.

5. **Stripe webhook endpoint** — register `https://guerrillasuite.com/api/stripe/webhook` in the Stripe dashboard after deployment. Add the signing secret to Railway env vars.

6. **Nonprofit coupon `NONPROFIT50`** — create this coupon in Stripe dashboard before any nonprofit can sign up.

7. **Trial coupons** — create `TRIAL14`, `TRIAL30`, `TRIAL60` coupons in Stripe dashboard.

8. **Supabase Storage buckets** — create `tenant-logos` and `nonprofit-verification` buckets with appropriate RLS policies.

9. **Resend sending domain** — `mail.guerrillasuite.com` needs DNS setup and Resend verification for the welcome and verification emails.

10. **Slug collision handling** — the webhook generates a slug from org name. Add collision detection (append a number if slug exists).

11. **SuperAdmin verification UI** — the `/api/admin/verify-queue` API is specced but the UI for reviewing nonprofit documents needs to be built. Can be a simple internal page at `guerrillasuite.com/admin` behind basic auth, or integrated into the existing SuperAdmin panel in the main app.

---

## 18. Two Live Clients — Immediate Path

For the campaign client (Field Pack) and B2B client (Scout Kit), you can take them through the signup page as soon as it's deployed. No special handling needed — they go through the same flow as any other client.

If you want to give either of them a trial period, apply a `TRIAL14`, `TRIAL30`, or `TRIAL60` promo code during their checkout. They enter it in the promo code step.

**Manual fallback** if the signup page isn't ready in time:
1. Create them as customers in Stripe dashboard manually
2. Create their subscription on the correct price
3. Insert their tenant row in Supabase manually with the correct `features` array from `lib/plan-features.ts`
4. Create their auth user and `tenant_memberships` row
5. They skip the signup flow and go straight to their app subdomain

This is clean and requires no code — just 15 minutes of Supabase and Stripe dashboard work per client.
