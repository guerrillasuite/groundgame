# GuerrillaSuite — Product Tree & Pricing Updates
## SitRep Standalone Model, Org/Squad Tiers, and Product Registry Changes
**Status:** Planning — updates to guerrillasuite-product-tree-v2.md and guerrillasuite-pricing-v2.md
**Companion spec:** sitrep-calendar-sharing-squad-org-spec.md

---

## 0. What This Document Does

This document specifies the changes needed to the Product Tree and Pricing documents to reflect:

1. SitRep's new standalone product identity with its own account model
2. The introduction of Orgs and Squads as first-class concepts
3. SitRep's new pricing tiers (Personal free, Squad free, Org paid)
4. The correction of the existing "SitRep goes free like Google Calendar" note which is now outdated
5. Updates to the Named Asset Registry and Launch Sequence

This document does NOT rewrite the full product tree or pricing doc — it specifies what changes and what the new content should say. The human will incorporate these changes into the living documents manually.

---

## 1. Product Tree Changes

### 1.1 SitRep — Promote to Tier 1 Product (from Named Tool → Product)

SitRep has crossed the threshold. It is no longer a "Named Tool becoming a product eventually" — it is a product now with its own URL, its own account model, and its own pricing. Update the SitRep entry across the product tree accordingly.

**Update the Three Tiers section:**

SitRep moves from "Named Tool → Product (Phase 3+)" to a full Tier 1 Product alongside GroundGame, LedgerLine, and SupplyLine.

**New SitRep product entry (replaces the current SitRep standalone section):**

```
Product 4: SitRep
Status: Named Tool in GroundGame v1 (shipped) → Standalone product (active)
URL: app.sitrep.digital
Stack: Next.js, Supabase, Railway (shared GuerrillaSuite infrastructure)
```

**What It Is:**

SitRep is GuerrillaSuite's task, event, and calendar product. It operates at three levels simultaneously:

- As a Named Tool inside GroundGame (existing CRM integration, unchanged)
- As a standalone PWA at app.sitrep.digital (active)
- As the shared time and task layer that all GuerrillaSuite products feed into

SitRep's design goal is to reach 2-3x the userbase of GroundGame by spreading organically through Squad sharing. A GroundGame campaign manager invites their spouse to a Family Squad. The spouse starts using SitRep personally. Their network encounters it. None of these users are initially paying — they are future customers for GroundGame, LedgerLine, and other suite products.

SitRep intentionally operates at or near cost for free tier users. It is a user acquisition channel for the broader suite, not a primary revenue driver.

**Account Model:**

SitRep introduces two new concepts that do not exist in other GuerrillaSuite products:

**Org** — A GuerrillaSuite Org is the user-facing name for what the codebase calls a tenant. Every GuerrillaSuite product tenant (GroundGame, LedgerLine, etc.) automatically has a SitRep Org created for it at no additional cost. The Org is the "Work" context in SitRep — it sources that tenant's items into the user's calendar.

Standalone SitRep users (no other GS products) can create an Org directly. An Org is the paid tier of SitRep, available for $5/month (basic) or $10/month (Pro).

**Squad** — A Squad is a free, lightweight shared group. Every SitRep user gets a default "Family" Squad automatically. Squads are how users share calendars, coordinate schedules, and invite people into shared contexts. Squads are always free, have no member limits in v1, and are the primary viral growth mechanism.

Squads can be nested under an Org. When a user upgrades from free Squad usage to a paid Org, their existing Squads are pulled under the new Org as sub-Squads. Nothing is deleted or migrated — Squads retain all members, items, and identity.

**Personal** — Every SitRep account has a Personal context that requires no Org or Squad. Personal items have no tenant, no squad, and are visible only to the owner.

**The growth model:**

```
Free entry point:
  Personal account (automatic) + Family Squad (auto-created) + any additional Squads

Paid upgrade:
  $5/month Org: unlimited members, sub-Squads, booking pages
  $10/month Org Pro: booking pages, embeddable calendars, automations
  (Must have an Org to access $10 features even as a solo user)

GS product bundle:
  SitRep Org included free with any GroundGame or LedgerLine subscription
  GS tenant = SitRep Org, same ID, no additional setup
```

### 1.2 Named Asset Registry — Updates

**Remove from "Named Tool → Product" status:**

| Name | Old Status | New Status |
|------|-----------|------------|
| SitRep | Named Tool → Product (eventually) | Tier 1 Product (active) |

**Add new entries:**

| Name | Tier | Type | Status |
|------|------|------|--------|
| Org | Concept | GS tenant user-facing name | Active (UI rename, not a product) |
| Squad | Feature | Shared group within SitRep | Active |

**Names Held in Reserve — add:**

| Name | Notes |
|------|-------|
| Platoon | Squad variant — held |
| Fireteam | Squad variant — held |
| Unit | Squad/Org variant — held |

### 1.3 Launch Sequence — Updates

**Replace the current SitRep Phase 3+ standalone entry with:**

```
Active — SitRep PWA
SitRep standalone is live at app.sitrep.digital. The Org/Squad model is 
being built now (see sitrep-calendar-sharing-squad-org-spec.md). 
SitRep is no longer a future phase item — it is an active product.
```

**Update Phase 3 to read:**

```
Phase 3 — TBD (demand-driven)
SupplyLine inventory/eCommerce product. Sequence confirmed: SupplyLine 
ships before SitRep standalone pricing is formalized, as SupplyLine 
demand signals are clearer from current GroundGame clients. SitRep 
pricing infrastructure (Org billing, Squad invite flows) ships as part 
of the SitRep standalone build, not as a Phase 3 item.
```

### 1.4 Open Questions — Add

Add the following to the Open Questions section of the product tree:

```
7. SitRep Org billing — SitRep Org ($5/$10/month) requires its own 
   billing flow separate from GroundGame and LedgerLine. Standalone 
   SitRep users have no existing GS billing relationship. Determine 
   payment processor approach (Stripe direct, existing GS billing, 
   or manual for early customers) before building the Org upgrade flow.

8. Squad invite for non-GS users — Inviting someone to a Squad via 
   email sends them to app.sitrep.digital to create a free account. 
   This is the primary organic growth mechanism. The invite email 
   and onboarding flow for new-to-SitRep invitees needs to be 
   designed as part of the Squad spec.

9. Org terminology rollout — "Org" is the user-facing term for 
   what the codebase calls a "tenant." Full internal rename 
   (tenant_id → org_id, getTenant() → getOrg(), etc.) is deferred 
   to a dedicated refactor. Track this as technical debt.
```

---

## 2. Pricing Document Changes

### 2.1 Correct the Resolved Decisions section

The current Resolved Decisions item 3 reads:

> **SitRep standalone pricing** — Free to all users when it spins off as a standalone product, including Operatives on Scout Kit and anyone outside GuerrillaSuite entirely. Modeled after Google Calendar.

**Replace with:**

> **SitRep standalone pricing** — SitRep uses a freemium model with paid Org tiers. Personal accounts and Squads are always free. The "free like Google Calendar" model does not apply — SitRep is a coordination and scheduling product with real infrastructure costs that scale with usage. The free tier is a deliberate user acquisition investment, not an indefinite commitment to fully free operation. See SitRep Pricing section below.

### 2.2 Add new SitRep Pricing section

Add as a new section in the pricing document, after the Arsenal Pricing section:

---

**SitRep Pricing**

SitRep uses a three-tier model. Personal and Squad tiers are always free. Org tiers are paid.

**Personal — Free, always**

Every SitRep account is a Personal account. No credit card, no expiry.

Includes:
- Personal calendar (items visible only to you)
- Unlimited Squads (create or join)
- Default Family Squad (auto-created)
- All four calendar views (Day, Week, Month, List)
- Saved Views (toggle presets)
- Favorites (see others' availability as busy/basic/full)
- SitRep PWA access at app.sitrep.digital

**Squad — Free, always**

A Squad is a shared group. Free to create, free to join, no member limits.

Includes:
- Shared Squad calendar
- Assign items to Squad members
- Invite anyone by email (invitees get a free Personal account)
- Collaborator and Viewer roles
- Nesting under an Org (when Org exists)

Squads are the primary viral growth mechanism. They must remain free permanently. This is a strategic decision, not a temporary promotion.

**Org — $5/month**

An Org is a paid shared workspace for teams. Required for users who need team coordination features beyond what a Squad provides.

Includes:
- Everything in Personal + Squad
- Unlimited Org members
- Sub-Squads within the Org
- Team roles (Owner, Admin, Member, Viewer — mirrors GS role structure)
- Booking pages (Calendly rival — create and share booking links)
- Org-wide calendar
- SitRep Org is included free with any active GroundGame or LedgerLine subscription

**Org Pro — $10/month**

Includes everything in Org plus:
- Embeddable public calendars (iFrame embed for websites)
- Automations (WHEN → THEN rules for items and reminders)
- Priority support

**GuerrillaSuite bundle:**

Any active GroundGame or LedgerLine subscription automatically includes a SitRep Org at no additional cost. The GS tenant and the SitRep Org are the same entity — no separate signup or configuration required.

| Feature | Personal | Squad | Org ($5) | Org Pro ($10) | With GS Product |
|---------|----------|-------|----------|---------------|-----------------|
| Personal calendar | ✅ | ✅ | ✅ | ✅ | ✅ |
| Squads (create/join) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Favorites / availability | ✅ | ✅ | ✅ | ✅ | ✅ |
| Saved Views | ✅ | ✅ | ✅ | ✅ | ✅ |
| Sub-Squads | ❌ | ❌ | ✅ | ✅ | ✅ |
| Booking pages | ❌ | ❌ | ✅ | ✅ | ✅ |
| Embeddable calendars | ❌ | ❌ | ❌ | ✅ | ✅ (Pro GS tiers) |
| Automations | ❌ | ❌ | ❌ | ✅ | ✅ (War Chest+) |

Note on GS product bundle: Embeddable calendars and Automations are included for GuerrillaSuite subscribers at War Chest tier or higher, consistent with existing feature gating in GroundGame.

### 2.3 Add to Resolved Decisions

Add the following new resolved decisions:

> **4. SitRep Squads are permanently free.** This is a strategic user acquisition decision. Squads must never be paywalled. The cost of supporting free Squad users is the cost of growing the GuerrillaSuite ecosystem.

> **5. SitRep Org is included with GS products.** Any GroundGame or LedgerLine subscriber gets a SitRep Org at their existing tier's equivalent level. GroundGame War Chest = SitRep Org Pro. GroundGame Scout Kit or Field Pack = SitRep Org ($5 equivalent). This is included at no additional charge — it is a retention and cross-sell feature, not a revenue line.

> **6. Must have an Org to access Org Pro features.** A solo user who wants booking pages or embeddable calendars must be on the $5 Org tier first, then upgrade to $10. There is no way to access Org Pro features without an Org, even as a single-person operation. This encourages the team coordination mental model even for solo users and sets up the natural upgrade path.

---

## 3. Product Tree — SitRep Named Tool Entry (keep, update)

The existing SitRep Named Tool entry inside GroundGame remains accurate and does not need to change. SitRep as a Named Tool inside GroundGame is separate from SitRep as a standalone product. The CRM integration (`/crm/sitrep/`) continues to exist and function. The Named Tool and the standalone product share the same backend infrastructure.

Update only the status line:

```
Old: Status: Named Tool, v1 in GroundGame — Standalone product Phase 3+
New: Status: Named Tool in GroundGame (v2 shipped May 2026) — Also active as standalone product at app.sitrep.digital
```

---

## 4. What Does NOT Change

- GroundGame pricing tiers (Scout Kit, Field Pack, War Chest, Enterprise, National) — unchanged
- LedgerLine pricing tiers — unchanged  
- Arsenal pricing — unchanged
- Bundle pricing table — add one line: "GroundGame or LedgerLine (any tier) + SitRep Org: SitRep Org included free"
- Multi-tenant discount rules — unchanged
- The four user role tiers (Operative, Support, Director, General) — unchanged in GroundGame; SitRep uses its own simpler role model (Owner, Admin, Member, Viewer) internally but does not expose these as named roles in marketing
- Intel Brief standalone pricing note — unchanged ("free when it spins off")
