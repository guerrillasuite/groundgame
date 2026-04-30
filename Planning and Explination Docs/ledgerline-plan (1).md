# LedgerLine — GuerrillaSuite Financial Management Module
## Planning & Architecture Document
**Status:** Pre-development planning  
**Suite:** GuerrillaSuite  
**Companion product:** GroundGame CRM  
**Stack:** Next.js · Supabase (PostgreSQL) · Railway · GitHub  

---

## 0. GuerrillaSuite Platform Architecture

### Suite Vision
GuerrillaSuite is an operating system for running an organization — a suite of first-class products that share a common foundation, similar to Google Workspace or Microsoft 365. Each product has its own URL, its own identity, and its own focused scope. Underneath, they share a single database, a single auth system, and a single design language. Data entered anywhere in the suite enriches the whole suite automatically.

The naming convention reflects this: each product has a tactical, recognizable name (GroundGame, LedgerLine, and others to come). The suite itself is the brand that ties them together.

### Products (Current & Planned)

**GroundGame — v1 LAUNCHING NOW (production-ready, active clients)**
GroundGame v1 is three things shipped together under one product:

1. **Field app (mobile-first, simple)** — Stripped-down canvassing and calling tool. A rep opens it, works their list, logs dispositions, done. Idiot-proof by design. Includes Storefront View: a tablet-facing point-of-sale interface for tabling and street sales — takes orders, tracks customers, handles basic in-field inventory for the table.

2. **Full CRM web portal** — Fleshed-out desktop/web experience for reps and managers. Opportunity tracking, pipeline management, calling, texting, emailing, list working, reporting on field activity.

3. **Admin / list-building layer** — Complex list building, user management, territory management, permissions, app customization, bulk data operations. The management and operations layer. Currently lives under admin roles in GG. May eventually be broken into its own named product (names under consideration: HQ, WarRoom, Command) but ships as part of GroundGame v1.

GroundGame v2 will deepen the mobile CRM experience and expand the field app. Timeline TBD after v1 client feedback.

**LedgerLine (this document) — Phase 2, planned**
The financial management product. Full accounting, budgeting, payroll, invoicing, and reporting. Fed by GroundGame sale completions. Detailed in this document. Deliberately built as a separate product after GroundGame v1 ships and real client usage informs the financial tooling needs.

**[Commerce Product — planned, name TBD]**
Inventory management, barcode scanning, product catalog, online storefront, eCommerce. The Storefront View in GroundGame handles the point-of-sale moment in the field. This product handles everything before and after — stock management, fulfillment, online selling. Feeds revenue into LedgerLine. May be bundled with an eCommerce add-on into one product.

**[Calendar Product — planned]**
The connective tissue of the suite. A Google Calendar-style interface that surfaces reminders and time-sensitive events from every suite product — GroundGame follow-ups, LedgerLine bill due dates, payroll run schedules, report delivery, savings goal check-ins. Not a standalone scheduling tool — a unified view across the whole suite.

**[Future products]**
Each new tool follows the same pattern: its own name, its own URL, its own focused scope, plugged into the shared foundation. Names under consideration for future products: HQ, WarRoom, BaseCamp, Command — held in reserve until the right product calls for them.

### Monorepo Architecture (Option C — Decided)
GuerrillaSuite is built as a monorepo containing multiple Next.js applications and shared packages. This gives each product independence at the application layer while keeping the data layer unified.

**Repository structure:**
```
guerrillasuite/
├── apps/
│   ├── groundgame/          # Mobile-first field app (Next.js or React Native)
│   ├── web/                 # GuerrillaSuite web command center (Next.js)
│   └── [future apps]/
├── packages/
│   ├── ui/                  # @guerrillasuite/ui — shared design system, components, tokens
│   ├── db/                  # @guerrillasuite/db — Supabase client, shared types, DB utilities
│   └── auth/                # @guerrillasuite/auth — session management, tenant switching, cross-app SSO
└── tooling/                 # Turborepo config, shared ESLint, TypeScript config
```

**Shared infrastructure:**
- One Supabase instance — all products read and write to the same PostgreSQL database
- One Supabase Auth instance — one login works across every product with no re-authentication
- One `@guerrillasuite/ui` package — every product looks and feels like part of the same suite
- Suite-level navigation component rendered by every app — shows which products the user has access to and allows seamless switching

**Deployment:**
- Each app in `/apps/` is deployed independently (Railway or Vercel)
- Each gets its own URL (e.g., `app.guerrillasuite.com`, `ledgerline.guerrillasuite.com`, `groundgame.guerrillasuite.com`)
- Shared packages are internal — not published to npm

### Cross-Product Data Philosophy
The shared database is what makes the suite more than the sum of its parts. A contact enriched in the CRM is immediately available in LedgerLine for invoicing. A sale closed in GroundGame becomes a draft income record in LedgerLine via a DB trigger — no API call, no sync, no duplication. A reminder set in LedgerLine for a bill due date surfaces in the calendar product automatically.

Data is entered once and propagates everywhere it is relevant. This is the community enrichment goal: every action anywhere makes the whole suite smarter.

### Mobile Strategy (Open Decision)
Each product will eventually have mobile support. The decision between a single GuerrillaSuite mobile app (with product sections, similar to the Google or Microsoft 365 app) versus individual native apps per product is deliberately deferred. GroundGame as a field tool has the strongest case for its own standalone mobile app given its distinct, simplified audience. Other products may be better served by a unified GuerrillaSuite mobile experience. This decision should be made before any mobile development begins.

---

## 1. Product Overview

LedgerLine is the financial management arm of GuerrillaSuite. It serves as a full-cycle accounting and budgeting tool designed to replace QuickBooks for small businesses, nonprofits, political campaigns, and individual households — while integrating cleanly with GroundGame CRM when both products are in use.

LedgerLine tracks income, expenses, cash on hand, savings, debt, payroll, and net worth. It generates professional financial reports on demand and handles compliance-heavy reporting including FEC and state/local election board filings. It is designed to be approachable enough for someone with no accounting background while being robust enough for a CFO or campaign treasurer.

**Core design philosophy:**
- The user should never need to understand accounting to use accounting software
- Data entered once should propagate automatically throughout the system
- Budgeting should feel like a tool that *helps* people, not just reports what happened
- The product should be genuinely enjoyable to use — visual, motivating, and clear

---

## 2. Naming & Branding

**Product name:** LedgerLine  
**Suite:** GuerrillaSuite  
**Tagline (working):** *"Keep your finances in line."*

LedgerLine fits the GuerrillaSuite naming convention — tactical, precise, and immediately legible. A ledger line in music extends the staff beyond its ordinary range, keeping notes in order that would otherwise fall outside the system. That double meaning fits: it keeps your finances in order and extends visibility beyond what a basic spreadsheet can offer.

Branding should follow the GuerrillaSuite visual language with LedgerLine-specific accent colors. Tone is confident, clear, and approachable — not corporate, not playful to the point of being unserious.

---

## 3. Who It's For

LedgerLine is built to serve four tenant types with distinct default configurations:

**Household** — Personal and family budgeting, savings goals, debt tracking, basic income/expense management. May connect to a GroundGame tenant if a household member runs a side business.

**Small Business / Corporate** — Full accounting suite including payroll, invoicing, P&L, cash flow, multi-employee expense tracking, and tax-ready reporting. Likely connected to a GroundGame tenant for sale-to-income automation.

**Nonprofit** — All small business features plus restricted vs. unrestricted fund tracking, grant income management, program expense allocation, and donor reporting.

**Political Campaign** — Specialized tenant type with built-in FEC-compliant data collection, contribution and expenditure tracking, and report generation for federal, state, and local filing requirements.

---

## 4. Multi-Tenancy & Identity Model

LedgerLine shares GuerrillaSuite's multi-tenant identity architecture. The model has three layers:

**User** — One person, one login, one LedgerLine account. A user can belong to multiple tenants in different roles simultaneously.

**Tenant** — An organization (business, household, nonprofit, campaign) that owns its own partitioned data. Each tenant has its own category structure, budget periods, report templates, and feature configuration.

**Membership** — The join between a user and a tenant, with a role (owner, admin, employee, viewer). A user's dashboard shows all tenants they belong to and allows switching between them.

### Key Multi-Tenant Scenario: The Commission Salesman

This scenario drives several architectural decisions and should be kept in mind throughout development:

- **Employer's GroundGame tenant** — Salesman logs sales as an employee
- **Employer's LedgerLine tenant** — Salesman's closed sales auto-create income records; employer runs payroll here; salesman receives paycheck and views his own pay stubs and direct deposit settings
- **Personal LedgerLine tenant** — Salesman tracks household budget, savings goals, personal debt
- **Personal GroundGame tenant** — Salesman runs a side business; closed sales flow into his personal LedgerLine tenant

This means:
- A LedgerLine user can be attached to multiple GroundGame tenants (employer + personal)
- A GroundGame tenant can feed into multiple LedgerLine tenants (employer's books + employee's paycheck record)
- Both products must function fully and independently without the other being present
- The payroll flow is a **LedgerLine-to-LedgerLine relationship**: employer tenant pushes a payroll transaction that creates an income record in the employee's personal tenant

### Tenant ↔ Tenant Connections

Tenants can be linked with explicit relationship types:
- `employer → employee` (payroll push)
- `groundgame_tenant → ledgerline_tenant` (sale-to-income automation)

These connections are opt-in, visible to admins of both tenants, and revocable.

---

## 5. GroundGame Integration

### Philosophy
LedgerLine and GroundGame have zero functionality overlap. GroundGame tracks a sale from lead to close. LedgerLine picks up at close and handles everything financial from that point forward. GroundGame never needs to know LedgerLine exists at the application level.

### Shared Infrastructure
- Monorepo: LedgerLine lives as its own app within the GuerrillaSuite monorepo (see Section 0)
- Same Supabase PostgreSQL database — no data duplication, no sync required, shared by all suite products
- Same Supabase Auth instance — one session works across all suite products seamlessly
- Shared `@guerrillasuite/db` package for type-safe DB access across products
- Feature-gated per tenant via the `tenant.features` system
- Sold separately or as a bundled GuerrillaSuite package

### Sale-to-Income Handoff
When a sale is marked complete in GroundGame, the following occurs:

1. **Auto-create:** A database trigger (Supabase) automatically creates a draft income transaction in the linked LedgerLine tenant. This requires no application-level awareness in GroundGame.
2. **Manual confirm:** The LedgerLine user sees the draft transaction in a "Pending Review" queue. They review, adjust if needed, and confirm. Only confirmed transactions are counted in budgets and reports.

### Data Passed at Handoff
From the GroundGame opportunity record to the LedgerLine income transaction:
- Sale amount
- Sale date
- Linked person or company UUID (name, address, phone pulled via join — not duplicated)
- Product/service category
- Assigned employee (for commission or payroll allocation tracking)
- Payment method (if tracked in GG)
- GroundGame opportunity UUID (stored as `source_opportunity_id` for audit trail)

### Plaid / Bank Linking (v2)
Manual account tracking is built in v1. The data model must be designed from day one to accommodate Plaid integration in v2 without breaking changes. Specifically:
- `accounts` table should include a nullable `plaid_item_id` and `plaid_access_token` column
- `transactions` table should include a nullable `plaid_transaction_id` for deduplication
- Account balance fields should support both manual entry and auto-populated values with a `balance_source` enum (`manual` | `plaid`)

Do not implement Plaid in v1. Do not design around it being absent forever.

---

## 6. Core Feature Areas

### 6.1 Income Tracking
- Manual income entry with source, amount, date, category, payment method, and notes
- Recurring income (salary, retainer, rental) with configurable frequency — auto-populates each period without manual entry
- Draft income from GroundGame sale handoff (pending review queue)
- Income linked to person/company UUID (pulls contact info for tax/payroll purposes)
- Income categorized by type: Salary, Commission, Gift, Grant, Loan, Savings Pull, Other
- Budgeted vs. received status per income record

### 6.2 Expense Tracking
- Manual expense entry with description, amount, date, category, payment method, notes, and optional receipt attachment
- Recurring expenses (bills, subscriptions, rent) with configurable frequency — auto-populates each period
- Expense types: one-time, recurring (weekly / semi-monthly / monthly / annual)
- Payment methods: Debit, Credit Card, Cash, EBT, ACH, Savings Pull, Other
- Scheduled vs. paid status per expense
- Link expenses to debt records (loan payments, credit card payments)
- Link expenses to savings records (deposits into savings accounts)
- Attach documents (receipts, invoices, contracts) to any expense record

### 6.3 Budget Engine
- Budget periods are fully customizable per tenant with sensible defaults: Weekly, Monthly, Quarterly, Annual
- Each budget period aggregates income, expenses, savings, and debt automatically
- Budget vs. Actual tracking: user sets a planned budget for each category per period; system compares against actuals in real time
- Variance flagging: visual indicators when a category is over budget or trending toward overage
- Projection mode: user can enter anticipated transactions for a future period to model outcomes before they happen
- The budget dashboard is the primary home view — the "command center" of LedgerLine

### 6.4 Savings
- Multiple named savings accounts/funds per tenant (e.g., "Emergency Fund," "Vacation," "Equipment")
- Each savings account tracks deposits, withdrawals, and running balance
- Monthly savings activity tracked per period per account
- Savings accounts linked to specific savings goals

**Savings Goals Engine:**
- Each goal has: name, target amount, target date, linked savings account, priority level, notes, optional cover photo
- Priority system: higher-priority goals reserve their required monthly contributions first; lower-priority goals calculate what's left
- Progress tracking: visual progress bar, percentage complete, months remaining, required monthly contribution to hit target
- Milestone celebrations: fun messages and visual moments at 25%, 50%, 75%, and 100% — tone matches GuerrillaSuite voice
- Completion state: goal marked achieved, celebration triggered, archived with achievement date

### 6.5 Debt Management
- Track any debt: loans, credit cards, medical debt, collections
- Per debt record: name, creditor, original amount, current balance, interest rate, due date, payoff goal date, priority, ownership (personal / shared / business)
- Payment tracking: each payment logged as an expense, rolls up to reduce balance automatically
- Credit card charge tracking: new charges roll up to increase balance
- Payoff calculator: given a target payoff date, calculates required monthly payment
- Early payoff calculator: given an extra monthly amount, projects new payoff date
- Paid-off celebration state (matches savings goal milestone tone)
- Debt linked to net worth calculation

### 6.6 Net Worth
- Automatically calculated: Total Assets − Total Liabilities
- Assets: manual entry of investments, property, vehicles, equipment, savings balances (auto-populated)
- Liabilities: debt balances (auto-populated from debt records)
- Historical net worth tracking by period — visual trend over time
- Motivational display state ("Crushing it" vs. "Keep going" — customize per brand voice)

### 6.7 Invoicing
Invoicing lives in LedgerLine, not GroundGame. People may use invoicing + accounting without needing a CRM.

- Create and send invoices to clients (linked to person/company UUID if GG is connected, or standalone contact entry)
- Line items with description, quantity, unit price, tax rate
- Invoice status: Draft, Sent, Viewed, Partially Paid, Paid, Overdue, Void
- Payment terms: Net 15, Net 30, Net 60, custom
- Automatic overdue flagging and optional reminder emails (v1 email, v2 in-app)
- Payment recorded against invoice creates income transaction automatically
- Invoice history per client
- Accounts receivable aging report generated from invoice data

### 6.8 Payroll
- Employee records per tenant: name, role, pay type (salary / hourly / commission), pay rate, direct deposit info, tax withholding settings
- Payroll runs: generate payroll for a period, review, approve, and mark as paid
- Each approved payroll run:
  - Creates expense transactions in the employer's LedgerLine tenant
  - Creates income transactions in each employee's personal LedgerLine tenant (if linked)
- Payroll summary reports: per employee, per period, YTD
- W-2 and 1099 prep data export (tax-ready summaries, not form generation in v1)
- Commission tracking: pull from GroundGame sale records if integrated

### 6.9 Accounts & Reconciliation (v1 Manual, v2 Plaid)
- Account registry: checking, savings, credit cards, loans, cash
- Manual balance entry and transaction logging per account
- Reconciliation: mark transactions as cleared against a bank statement; flag discrepancies
- Running balance per account
- Account architecture Plaid-ready (see Section 5)

---

## 7. Category System

Categories follow the same pattern as GroundGame dispositions: tenant-scoped, template-based defaults with full add/edit/archive control.

### Setup Flow
On tenant creation, user selects an org type. Each type loads a default category set. User can add, rename, merge, or archive categories at any time. Categories cannot be deleted if transactions are linked — only archived.

### Default Templates

**Household:**
Income: Salary, Freelance, Side Business, Gift, Government Benefit, Investment, Other
Expenses: Housing, Utilities, Groceries, Transportation, Insurance, Healthcare, Subscriptions, Entertainment, Dining Out, Clothing, Childcare, Debt Payment, Savings Deposit, Emergency, Other

**Small Business / Corporate:**
Income: Product Sales, Service Revenue, Consulting, Retainer, Commission, Grant, Loan Proceeds, Other
Expenses: Payroll, Contractor Payments, Inventory, Rent/Lease, Utilities, Software/Subscriptions, Marketing, Travel, Meals & Entertainment, Professional Services, Equipment, Insurance, Taxes, Debt Payment, Other

**Nonprofit:**
Income: Individual Donations, Corporate Sponsorship, Government Grant, Foundation Grant, Event Revenue, Membership Dues, In-Kind Contributions, Other
Expenses: Program Expenses, Payroll, Administrative, Fundraising, Facilities, Technology, Travel, Professional Services, Other
Additional: Restricted Fund tracking overlay per income and expense category

**Political Campaign:**
Income: Individual Contributions, PAC Contributions, Party Contributions, Candidate Self-Funding, Loan to Campaign, Other
Expenses: Advertising, Staffing, Consulting, Event Costs, Travel, Printing/Signage, Technology, Filing Fees, Compliance/Legal, Loan Repayment, Other
Note: All contribution records capture contributor name, address, employer, occupation, and amount — required for FEC compliance

### Category Structure
- Categories have a `type` (income | expense | transfer)
- Categories can be nested one level deep (parent → subcategory) for more granular reporting
- Each tenant's category list is fully isolated — no cross-tenant visibility

---

## 8. Budget Period System

### Defaults (all tenant types)
- Weekly
- Monthly
- Quarterly
- Annual

### Customization
- Tenants can add custom periods (e.g., "Fiscal Q1 Oct–Dec", "Grant Period Jan–June")
- Custom periods have a start date, end date, and label
- Budget periods can overlap (a weekly period exists within a monthly period — both aggregate independently)
- Default period for the main dashboard view is user-configurable

### Budget Period Behavior
- Each period has planned budget amounts per category (set by the user)
- Actuals are aggregated automatically from transactions linked to that period
- A period can be "open" (current, accepting transactions) or "closed" (historical, locked for editing)
- Closing a period generates a period summary snapshot stored for reporting

---

## 9. Reporting Engine

### Philosophy
The user selects a report by plain-English name, chooses their output format, and clicks go. The system handles everything else. The user should never need to understand the accounting mechanics behind the report they are generating.

### Report Generation Flow
1. User navigates to Reports
2. Selects a report from their available list (template defaults + any added reports)
3. Chooses date range or period
4. Chooses output format: PDF, CSV, or Excel (.xlsx)
5. Optionally schedules the report (one-time or recurring)
6. Optionally enters an email address to deliver the report to on generation
7. Clicks Generate — report runs in the background, user is notified when ready
8. Report is stored in report history with download link

### Report Templates by Tenant Type

**All Tenant Types (default):**
- Profit & Loss Statement (Income Statement)
- Cash Flow Statement
- Budget vs. Actual Report
- Expense Breakdown by Category
- Income Breakdown by Source
- Net Worth Summary
- Savings Goal Progress Report
- Recurring Transactions Summary

**Small Business / Corporate (additional defaults):**
- Balance Sheet
- Accounts Receivable Aging
- Accounts Payable Aging
- Payroll Summary (by period and YTD)
- Employee Earnings Report
- Invoice History Report
- Tax Expense Summary (by category)
- Profit by Employee / Sales Rep

**Nonprofit (additional defaults):**
- Restricted vs. Unrestricted Fund Report
- Grant Income & Expenditure Report
- Program Expense Allocation Report
- Donor Contribution Summary
- Statement of Functional Expenses (GAAP-compliant format)
- Form 990 Prep Summary (data export, not form generation)

**Political Campaign (additional defaults):**
- FEC Form 3 Data Export (Candidate Committees)
- FEC Form 3X Data Export (PACs and Party Committees)
- Contribution Detail Report (contributor name, address, employer, occupation, amount, date)
- Expenditure Detail Report
- In-Kind Contribution Report
- Loan to Campaign Report
- State Filing Prep Export (captures all required fields; user references for state-specific forms — full state form generation is v2)

### Full Report Library (user-addable)
Any tenant can add any report from the full library regardless of their template type. Full library includes all of the above plus:
- Statement of Retained Earnings
- Debt Payoff Projection
- Cash Flow Forecast (projection mode)
- Category Trend Report (spending/income trends over time)
- Variance Analysis Report
- Year-over-Year Comparison
- Monthly Close Summary
- Transaction Audit Log
- Document Attachment Log
- Payroll Tax Summary (W-2 / 1099 prep data)
- Account Reconciliation Report
- Invoice Aging Detail

### Scheduled Reports
- Any report can be scheduled: daily, weekly, monthly, quarterly, or annually
- Scheduled reports run automatically and are stored in report history
- Optional email delivery: attach generated file to a notification email
- Scheduled reports are managed from a "Report Schedule" settings panel
- Report delivery failures are logged and the user is notified

---

## 10. Audit Trail & Document Management

### Audit Trail
- Every create, update, and delete action on any financial record is logged
- Log captures: user UUID, tenant UUID, timestamp, action type, record type, record UUID, before state, after state
- Audit log is read-only — no record can be modified or deleted from the log
- Audit log is viewable by tenant admins and exportable as a report
- Compliant with standard accounting audit requirements

### Document Attachments
- Any transaction, invoice, payroll record, or debt record can have files attached
- Supported types: PDF, JPG, PNG, XLSX, CSV, DOCX
- Files stored in Supabase Storage, linked to record by UUID
- Document index: searchable list of all attached documents per tenant
- Tax season view: filter all documents by tax year and category

---

## 11. Notifications (v1)

v1 notifications are email-based only. In-app notification center is v2.

Email notification triggers:
- Budget category exceeds planned amount (configurable threshold, e.g., 80% and 100%)
- Upcoming recurring expense (configurable advance notice, e.g., 3 days)
- Invoice overdue
- Savings goal milestone reached (25%, 50%, 75%, 100%)
- Payroll run approved and processed
- GroundGame income draft awaiting review
- Scheduled report generated and ready
- Low account balance warning (manual threshold set by user)
- Debt payoff achieved

Notification preferences are configurable per user per tenant. Each trigger can be enabled or disabled independently.

---

## 12. Data Model (Key Tables)

This is a reference outline for Claude Code. Full schema with constraints and indexes to be developed during implementation.

### Core Tables

**`users`** — Shared with GroundGame. UUID, email, name, auth metadata.

**`tenants`** — UUID, name, org_type (household | small_business | nonprofit | political_campaign), feature flags, created_at.

**`tenant_memberships`** — user_id, tenant_id, role (owner | admin | employee | viewer), active.

**`tenant_connections`** — id, from_tenant_id, to_tenant_id, connection_type (employer_employee | groundgame_to_ledger), status, created_at.

**`accounts`** — id, tenant_id, name, type (checking | savings | credit_card | loan | cash | other), current_balance, balance_source (manual | plaid), plaid_item_id (nullable), plaid_access_token (nullable), is_active.

**`categories`** — id, tenant_id, name, type (income | expense | transfer), parent_id (nullable), is_archived.

**`transactions`** — id, tenant_id, type (income | expense | transfer), amount, date, description, category_id, account_id, status (draft | confirmed | cleared | void), payment_method, notes, source_type (manual | groundgame | recurring | payroll), source_opportunity_id (nullable — GG UUID), recurring_rule_id (nullable), created_by, created_at, updated_at. Contains all income and expense records.

**`recurring_rules`** — id, tenant_id, transaction_type, amount, category_id, account_id, description, frequency (weekly | semi_monthly | monthly | quarterly | annual | custom), next_date, end_date (nullable), is_active.

**`budget_periods`** — id, tenant_id, label, period_type (weekly | monthly | quarterly | annual | custom), start_date, end_date, status (open | closed).

**`budget_targets`** — id, budget_period_id, category_id, planned_amount. One row per category per period.

**`savings_accounts`** — id, tenant_id, name, notes, current_balance (rollup), cover_photo_url.

**`savings_goals`** — id, tenant_id, savings_account_id, name, target_amount, target_date, priority (highest | high | low), notes, cover_photo_url, achieved_at (nullable).

**`debts`** — id, tenant_id, name, creditor, original_amount, current_balance, interest_rate, debt_type (loan | credit_card | medical | collections | other), payoff_goal_date, priority, ownership (personal | shared | business), in_collections, is_paid_off.

**`net_worth_snapshots`** — id, tenant_id, snapshot_date, total_assets, total_liabilities, net_worth. Generated on period close.

**`invoices`** — id, tenant_id, contact_id (nullable — person/company UUID), contact_name, contact_email, contact_address, issue_date, due_date, payment_terms, status (draft | sent | viewed | partially_paid | paid | overdue | void), notes, subtotal, tax_total, total.

**`invoice_line_items`** — id, invoice_id, description, quantity, unit_price, tax_rate, line_total.

**`employees`** — id, tenant_id, user_id (nullable — if employee has a LedgerLine account), name, role, pay_type (salary | hourly | commission), pay_rate, direct_deposit_info (encrypted), tax_withholding_settings, is_active.

**`payroll_runs`** — id, tenant_id, period_start, period_end, status (draft | approved | paid), approved_by, approved_at, paid_at.

**`payroll_line_items`** — id, payroll_run_id, employee_id, gross_pay, deductions, net_pay, linked_transaction_id (nullable).

**`audit_log`** — id, tenant_id, user_id, action (create | update | delete), record_type, record_id, before_state (jsonb), after_state (jsonb), created_at.

**`document_attachments`** — id, tenant_id, record_type, record_id, file_name, file_url, file_type, uploaded_by, uploaded_at.

**`report_definitions`** — id, tenant_id (nullable — null = system template), name, description, report_type, query_config (jsonb), is_system_template, is_active.

**`report_runs`** — id, tenant_id, report_definition_id, generated_by, date_range_start, date_range_end, output_format (pdf | csv | xlsx), status (queued | running | complete | failed), file_url, generated_at.

**`report_schedules`** — id, tenant_id, report_definition_id, frequency, next_run_at, delivery_email (nullable), is_active.

**`notification_preferences`** — id, tenant_id, user_id, trigger_type, is_enabled, threshold (nullable).

---

## 13. URL & Route Structure

Following the `/crm/` convention established in GroundGame:

```
/ledger/                          # Dashboard (budget command center)
/ledger/income/                   # Income log
/ledger/expenses/                 # Expense log
/ledger/invoices/                 # Invoice list
/ledger/invoices/[id]/            # Invoice detail / editor
/ledger/budget/                   # Budget planner (period view)
/ledger/savings/                  # Savings accounts & goals
/ledger/debt/                     # Debt tracker
/ledger/networth/                 # Net worth overview
/ledger/payroll/                  # Payroll runs
/ledger/payroll/employees/        # Employee management
/ledger/accounts/                 # Account registry
/ledger/reports/                  # Report center
/ledger/reports/schedule/         # Scheduled reports management
/ledger/audit/                    # Audit log (admin only)
/ledger/documents/                # Document index
/ledger/settings/                 # Tenant settings
/ledger/settings/categories/      # Category management
/ledger/settings/periods/         # Budget period configuration
/ledger/settings/notifications/   # Notification preferences
/ledger/settings/connections/     # GroundGame & tenant connections
```

---

## 14. Feature Flags & Tenant Gating

LedgerLine features are gated via the existing GuerrillaSuite `tenant.features` system.

Suggested feature flags:
- `ledger_core` — income, expenses, budget, savings, debt, net worth
- `ledger_invoicing` — invoicing and AR aging
- `ledger_payroll` — payroll runs and employee management
- `ledger_reports_basic` — standard report templates
- `ledger_reports_advanced` — full report library + scheduled reports
- `ledger_political` — FEC and campaign finance reporting
- `ledger_nonprofit` — restricted funds, grant tracking, Form 990 prep
- `ledger_plaid` — bank account linking via Plaid (v2, build flag now)

These flags allow LedgerLine to be sold in tiers (e.g., Core, Pro, Campaign) and mixed with GroundGame flags for bundle pricing.

---

## 15. v1 vs. v2 Scope

### v1 (Build Now)
- Full income and expense tracking with recurring rules
- Budget engine with budget vs. actual and projection mode
- Savings accounts and goals engine with milestone celebrations
- Debt tracking with payoff calculators
- Net worth tracking
- Invoicing (create, send via email, mark paid)
- Basic payroll (runs, line items, employee records)
- Manual account tracking and reconciliation
- Report engine: all template reports + full library, PDF/CSV/XLSX output, scheduled delivery, email delivery
- FEC and campaign finance data collection and export
- Audit trail
- Document attachments
- Email notifications (all triggers)
- GroundGame sale-to-income handoff (DB trigger + manual confirm queue)
- Multi-tenant identity model with tenant connections
- Category system (templates + customizable)
- Budget period system (defaults + customizable)

### v2 (Architect For, Build Later)
- Plaid bank account linking (data model ready in v1)
- In-app notification center
- Full state-by-state campaign finance form generation
- Multi-currency support
- Mobile app (React Native or PWA)
- AI-assisted budget recommendations
- Advanced forecasting and scenario modeling

---

## 16. Open Questions for Development

These items need decisions during implementation but do not block planning:

1. **Report generation infrastructure** — Run reports server-side in Next.js API routes or use a background job queue (e.g., Supabase Edge Functions or a separate worker)? For large tenants with heavy data, a queue is more resilient.

2. **PDF generation library** — Likely Puppeteer or a React-to-PDF approach. Confirm which fits better within the Railway deployment constraints.

3. **Email delivery** — Confirm email provider (Resend, SendGrid, Postmark). Should match whatever GroundGame uses for consistency.

4. **Payroll direct deposit** — v1 marks payroll as paid and creates records. Actual ACH/direct deposit processing requires a payment processor (e.g., Stripe, Gusto API, or Dwolla). Define the v1/v2 boundary here explicitly.

5. **FEC e-filing** — FEC accepts electronic filing via their systems. v1 generates the data export; v2 could submit directly. Confirm if direct e-filing integration is a priority.

6. **Encryption for sensitive payroll data** — Direct deposit account numbers require encryption at rest. Confirm Supabase column-level encryption approach before building the employee table.

7. **Invoice email delivery** — Invoices sent to clients need a clean, branded email template. Confirm this is in v1 scope and design the template early.

8. **Tenant onboarding flow** — The category template selection and initial budget setup should feel guided and simple. A short onboarding wizard (org type → category template → first budget period) is worth designing before building the settings pages.
