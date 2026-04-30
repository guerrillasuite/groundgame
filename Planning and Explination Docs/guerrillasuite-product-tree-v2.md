# GuerrillaSuite — Product Tree & Roadmap
## Living Strategy Document
**Last updated:** April 2026
**Status:** Active development — GroundGame v1 shipping end of month

---

## Suite Vision

GuerrillaSuite is an operating system for running an organization. Every product is a first-class tool with its own name, URL, and focused scope. Underneath, they share one database, one auth system, and one design language. Data entered anywhere enriches the whole suite automatically.

The model is Google Workspace — separate apps, seamless experience, one login. The naming convention is tactical and recognizable: names that feel at home in a war movie or a Call of Duty lobby but are legible to anyone and respectful of those who've actually served.

---

## The Three Tiers

GuerrillaSuite is organized into three tiers. Understanding which tier something belongs to determines how it's built, named, marketed, and sold.

**Tier 1 — Products**
Standalone apps. Own URL, own brand, sold separately or in bundles. A client buys a product. Examples: GroundGame, LedgerLine, SupplyLine, Intel Brief (eventually), SitRep/Calendar (eventually).

**Tier 2 — Named Tools**
Have a name and an identity. Live inside products. Never sold standalone. Named because the name does real work — it shows up in marketing, surfaces in onboarding, gets referenced in support. But nobody buys a Named Tool; they buy a product and the tools are in it. Examples: Intel Brief (current), SitRep, FieldRecon, Dossier.

**Tier 3 — Infrastructure**
Unnamed or internally named only. The shared DB layer, auth, ingestion pipelines, scoring engines. Dev team sees these names; users never do.

---

## Architecture Foundation

- **Monorepo** — All products live in one GitHub repository (Turborepo)
- **Shared DB** — One Supabase PostgreSQL instance. No syncing, no duplication. A contact is a contact everywhere. The master contact and company database is called **Dossier** internally.
- **Shared Auth** — One Supabase Auth instance. One login works across every product with no re-authentication.
- **Shared UI** — `@guerrillasuite/ui` design system package. Every product looks and feels like the same suite.
- **Shared DB layer** — `@guerrillasuite/db` package for type-safe database access across all products.
- **Independent deployments** — Each product deploys separately (Railway). Each has its own URL.
- **Feature flagging** — Products and features are gated per tenant. Sold separately or in bundles.

```
guerrillasuite/
├── apps/
│   ├── groundgame/        # GroundGame (field app, CRM, storefront)
│   ├── ledgerline/        # LedgerLine (accounting & financial management)
│   ├── supplyline/        # SupplyLine (inventory, eCommerce, fulfillment) [planned]
│   ├── sitrep/            # SitRep (tasks, reminders, calendar) [planned standalone]
│   └── [future]/
├── packages/
│   ├── ui/                # @guerrillasuite/ui
│   ├── db/                # @guerrillasuite/db (houses Dossier)
│   └── auth/              # @guerrillasuite/auth
└── tooling/
```

---

## HQ — The Settings Shell

**Status: Ships with every product. Not a standalone product.**
**Not sold. Not a feature. It's the shell.**

HQ is the configuration and settings layer that comes with any GuerrillaSuite product a client owns. Think iPhone Settings — it's not an app you buy, it's just there. Currently lives at `crm/admin` inside GroundGame. May eventually move to its own URL (`hq.guerrillasuite.com`) or a consistent path (`/hq`) across all products as the suite grows.

What lives in HQ depends on which products a tenant owns:
- User management and permissions
- App customization and dynamic settings
- Feature flag visibility (what's enabled for this tenant)
- Territory and list management (GroundGame)
- Category and budget period configuration (LedgerLine)
- Any per-product admin configuration

HQ is never marketed as a product. It's the place everything is configured.

---

## Named Tools (Tier 2)

These have names and identities. They live inside products. They are never sold standalone.

### 📡 Intel Brief
**Current status: Named Tool inside GroundGame (Pro-gated feature)**
**Long-term: Potential standalone product**

GuerrillaSuite's news monitoring and intelligence layer. Aggregates articles via RSS/Atom feeds and query-based sources, scores each article for relevance against a tenant's campaign profile using a hybrid rule-based and AI scoring engine, and surfaces the most important stories in a dashboard widget and a full feed page.

The Intel Brief widget is a feature. Intel Brief itself is a named tool with product-level identity — it could eventually stand alone as a news aggregator someone uses instead of Apple News, with GuerrillaSuite integration as a superpower. That transition happens when there is client demand for it outside the CRM context.

Currently lives at: `/crm/intel-brief` inside GroundGame
Gated behind: `"news"` feature key (Pro tier only)

### 📋 SitRep
**Current status: Named Tool, v1 in GroundGame**
**Long-term: Standalone Calendar product**

SitRep is GuerrillaSuite's task, reminder, and calendar layer. In v1 it ships as a named tool inside GroundGame — the SitRep widget on the CRM dashboard surfaces upcoming tasks and reminders. Cross-product by design: a user's boss, teammate, and collaborators can all add SitRep items that show up in one view.

As the suite matures, SitRep grows into a full standalone Calendar product — a Google Calendar replacement with shared circles, multiple calendars, and a unified view of everything across work, personal, and family contexts. That transition happens when the suite has enough products that a unified time-based view becomes genuinely valuable as its own destination.

The SitRep widget and task tool ship in GroundGame v1. The standalone Calendar product is Phase 3+.

### 🗺️ FieldRecon
**Current status: Named Tool, infrastructure layer**
**Will never be a standalone product**

FieldRecon is GuerrillaSuite's mapping and GIS layer. It powers territory management, canvass routing, and geography-based list building inside GroundGame. Users never navigate to FieldRecon — it powers features that surface inside other products. Named internally because the name does work in dev conversations, documentation, and eventual "Powered by FieldRecon" attribution in territory views.

### 🗂️ Dossier
**Current status: Infrastructure / Named Tool**
**Will never be a standalone product**

Dossier is the master contact and company database that underlies the entire suite. One record per person or organization, enriched by every product that touches it. A contact created in GroundGame is immediately available in LedgerLine for invoicing. Dossier is the reason data entered anywhere enriches the whole suite — it's the single source of truth for who everyone is.

Named internally. May surface in marketing as a selling point ("One record, everywhere") but is never a product a client buys.

---

## Product 1: GroundGame
**Status: V1 — Production ready, shipping end of month**
**URL:** `app.guerrillasuite.com` (or `groundgame.guerrillasuite.com`)
**Stack:** Next.js, Supabase, Railway

### What It Is
GroundGame is the field and sales CRM. One product that does it all — canvassing, calling, pipeline management, and field point-of-sale. The homepage uses feature gating so each user sees only what's relevant to them. A canvasser sees their list. A sales rep sees their pipeline. A tabling team sees Storefront View. One codebase, one product, clean experience for each audience.

### V1 Ships With Three Layers

**Layer 1 — Field App (mobile-first, simple)**
The stripped-down canvassing and calling experience. Built for reps in the field. Opens fast, works the list, logs the result, done.

Core features:
- Canvassing and calling workflow
- Disposition logging
- List working (assigned lists, not list building)
- **Storefront View** — tablet-facing point-of-sale for tabling and street sales. Takes orders, tracks customers, handles in-field inventory for the table.

**Layer 2 — Full CRM Web Portal**
The fleshed-out desktop experience for reps, team leads, and managers.

Core features:
- Full opportunity tracking and pipeline management
- Calling, texting, emailing from within the CRM
- Contact and household management (powered by Dossier)
- Activity logging and follow-up tracking
- Basic reporting on field activity and pipeline
- **Intel Brief widget** — news and intelligence feed (Pro)
- **SitRep widget** — tasks and reminders

**Layer 3 — Admin & Management (HQ)**
The operations and configuration layer. Currently lives under admin roles in GroundGame at `crm/admin`. This is HQ — the settings shell that comes with the product.

Core features:
- Complex list building and import
- User management and permissions
- Territory management (powered by FieldRecon)
- App customization and dynamic settings
- Bulk data operations
- Advanced reporting and data export

### V2 Roadmap
- More robust mobile CRM experience
- Deeper calling and texting integrations
- Enhanced Storefront View features
- Expanded SitRep (tasks, reminders, calendar view)

### Feeds Into
- **LedgerLine** — Completed sales auto-create draft income records via DB trigger
- **SupplyLine** — Storefront View orders feed into inventory and fulfillment
- **SitRep** — Follow-up reminders and scheduled tasks surface across the suite

---

## Product 2: LedgerLine
**Status: Planned — Phase 2, build after GroundGame v1 ships**
**URL:** `ledgerline.guerrillasuite.com`

### What It Is
LedgerLine is the financial management product. A QuickBooks replacement that ties into the CRM. Full-cycle accounting, budgeting, payroll, invoicing, savings tracking, debt management, and professional reporting — including FEC and campaign finance compliance.

### Who It's For
- **Households** — personal budgeting, savings goals, debt tracking
- **Small businesses / corporate** — full accounting, payroll, invoicing, tax reporting
- **Nonprofits** — restricted fund tracking, grant management, Form 990 prep
- **Political campaigns** — FEC-compliant contribution and expenditure tracking, federal and state filing prep

### Core Features (V1)
- Income and expense tracking with recurring rules
- Budget engine with budget vs. actual and projection mode
- Savings goals with progress tracking and milestone celebrations
- Debt management with payoff calculators
- Net worth tracking
- Invoicing with AR aging
- Payroll runs and employee management
- Manual account tracking and reconciliation (Plaid in v2)
- Report engine: template + full library, PDF/CSV/XLSX, scheduled delivery, email delivery
- FEC and campaign finance data collection and export
- Audit trail and document attachments
- Email notifications
- **SitRep integration** — bill due dates and payroll schedules surface in SitRep

### Feeds Into
- **SupplyLine** — Inventory costs and sales revenue flow as expenses and income
- **SitRep** — Bill due dates, payroll schedules, report delivery

### Receives From
- **GroundGame** — Completed sales become draft income records
- **SupplyLine** — Product sales become income records

---

## Product 3: SupplyLine
**Status: Planned — Phase 3, timeline TBD**
**URL:** `supplyline.guerrillasuite.com`

### What It Is
SupplyLine is the inventory, eCommerce, and fulfillment product. Where GroundGame's Storefront View handles the point-of-sale moment in the field, SupplyLine handles everything before and after — inventory, stock management, product catalog, purchase orders, and online selling.

### The Field/Back-Office Split
- **GroundGame Storefront View** — In the field. The tablet at the table. Takes the order, logs the customer, handles the transaction. Lightweight, fast, field-optimized.
- **SupplyLine** — Back at base. Inventory levels, barcode scanning, stock management, product catalog, purchase orders, online storefront, order fulfillment.

These are complementary, not overlapping. A client can use Storefront View without SupplyLine (field sales only). A client can use SupplyLine with an online store and no field sales. Or both.

### Core Features (Planned)
- Inventory management and stock level tracking
- Barcode scanning
- Product catalog management
- Purchase order tracking
- Order fulfillment workflow
- eCommerce storefront (online selling)
- Integration with Storefront View in GroundGame for unified order history
- Sales feed into LedgerLine as income automatically

### Feeds Into
- **LedgerLine** — Sales become income records automatically

### Receives From
- **GroundGame** — Storefront View orders feed into SupplyLine fulfillment

---

## Product 4: SitRep (Calendar)
**Status: Named Tool in v1 — Standalone product Phase 3+**
**URL (eventual):** `sitrep.guerrillasuite.com`

### What It Is Now (Named Tool)
SitRep ships in GroundGame v1 as a task and reminder tool. Cross-product aware from day one — items from any suite product surface in one view. The SitRep widget lives on the CRM dashboard. Assignable tasks, follow-up reminders, scheduled events.

### What It Becomes (Standalone Product)
A full Google Calendar replacement and task management system. Multiple calendars, shared circles — a user's work calendar, family calendar, and personal calendar all in one view. The place where a boss, a partner, and a best friend can all add something and it shows up in one unified SitRep. Every suite product plugs into SitRep automatically.

### What Surfaces in the Full Product
- GroundGame: follow-up reminders, scheduled calls, canvass events, assigned tasks
- LedgerLine: bill due dates, payroll run dates, invoice due dates, report schedules
- SupplyLine: reorder alerts, fulfillment deadlines
- Personal: any event or task added directly

### The Transition Signal
SitRep becomes a standalone product when the suite has enough interconnected products that a unified time-based view is genuinely valuable as a daily destination — and when there is demand for SitRep from people who aren't GroundGame users.

---

## Mobile Strategy
**Status: Open decision — do not build mobile until this is resolved**

GroundGame v1 is mobile-first for the field app layer. Beyond that, the mobile strategy is deliberately undecided.

- **Option A** — One GuerrillaSuite mobile app with product sections (Google/Microsoft 365 model)
- **Option B** — Individual mobile apps per product
- **Option C (likely)** — GroundGame gets its own standalone mobile app (strongest case — distinct field audience). Other products live in a unified GuerrillaSuite mobile app.

Revisit this decision before any mobile development beyond GroundGame's existing mobile-first web experience begins.

---

## Named Asset Registry

| Name | Tier | Type | Status |
|------|------|------|--------|
| GroundGame | Product | Field CRM + Storefront | Shipping |
| LedgerLine | Product | Financial management | Phase 2 |
| SupplyLine | Product | Inventory + eCommerce | Phase 3 |
| SitRep | Named Tool → Product | Tasks + Calendar | Tool in v1, product later |
| Intel Brief | Named Tool → Product | News + intelligence | Tool now, product eventually |
| Dossier | Named Tool | Master contact/company DB | Active (infrastructure) |
| FieldRecon | Named Tool | Mapping + GIS | Active (infrastructure) |
| HQ | Shell | Settings + config layer | Ships with every product |

### Names Held in Reserve

| Name | Notes |
|------|-------|
| Dispatch | Strong — held for future use |
| Ops | Strong — held for future use |
| Muster | Calendar candidate — held |
| Arsenal | SupplyLine variant — held |
| Cache | SupplyLine variant — held |
| Depot | SupplyLine variant — held |
| LockBox | Strong — held |
| WarRoom | HQ variant — held |
| Command | HQ variant — held |

---

## Launch Sequence

**Now — End of Month**
GroundGame v1 — all three layers — production ready and shipped to active clients.

**Phase 2 — Post GroundGame v1**
LedgerLine. Built as a separate product in the monorepo. Informed by real GroundGame client usage. SitRep widget and Intel Brief continue maturing inside GroundGame.

**Phase 3 — TBD (demand-driven)**
SupplyLine and/or SitRep standalone. Sequence determined by client demand signals from GroundGame and LedgerLine users.

**Ongoing**
- Evaluate Intel Brief as a standalone product when demand exists outside the CRM context.
- Evaluate SitRep as a standalone product when suite breadth makes a unified calendar genuinely valuable.
- Revisit mobile strategy before any new mobile development begins.

---

## Open Questions

1. **Mobile strategy** — Needs a decision before any mobile development beyond GroundGame's existing experience.

2. **Phase 3 sequence** — SupplyLine vs. SitRep standalone: which comes first? Key signal is client demand from GroundGame and LedgerLine users.

3. **Suite-level pricing** — How are products bundled and sold? Per product, per seat, per tenant, or tiered bundles? Pricing tiers exist for GroundGame — LedgerLine and SupplyLine pricing TBD.

4. **GuerrillaSuite brand vs. product brands** — Is the suite the marketing-facing identity (buy GuerrillaSuite, get GroundGame + LedgerLine)? Or are products marketed independently (buy LedgerLine, it happens to connect to GroundGame)?

5. **HQ URL** — Does HQ eventually get its own URL (`hq.guerrillasuite.com`) or does it live at `/hq` inside each product's URL? Decide before Phase 3 when multi-product tenants become common.

6. **Intel Brief standalone trigger** — Define the signal: is it when a non-GroundGame client asks for news monitoring? When a certain number of tenants are using it heavily? Set the criteria now so the decision isn't made ad hoc.
