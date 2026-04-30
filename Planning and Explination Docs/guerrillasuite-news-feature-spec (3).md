# GuerrillaSuite — Intel Brief Feature Spec
## For use with Claude Code

---

## BUILD STATUS — Updated 2026-04-27

### ✅ Done (shipped to production)

| What | Notes |
|------|-------|
| DB migration applied | 4 tables created in Supabase SQL editor (see Schema Gaps below) |
| `lib/features.ts` | `"news"` added to ALL_FEATURE_KEYS, PLAN_FEATURES.war_chest, FEATURE_META |
| `lib/tenant.ts` | `cowart4texas` added to HARDCODED_TENANTS |
| `lib/intel-brief-colors.ts` | 12-color palette constant (color name → hex) |
| `"news"` feature enabled | Enabled on cowart4texas and fsm tenants in DB |
| `tenant_news_settings` seeded | Keyword profiles for cowart4texas and fsm inserted |
| Global seed feeds | 4 generic Google News RSS feeds added to `alert_feeds` |
| `app/crm/intel-brief/page.tsx` | Main feed page — sticky filter bar, article cards, score badges, live pulse, empty state |
| `app/crm/settings/intel-brief/page.tsx` + panel | Settings page — keywords, threshold slider, category editor, color picker, blocked sources |
| `app/api/crm/intel-brief/settings/route.ts` | GET/PUT API for settings |
| `app/crm/admin/intel-brief-feeds/page.tsx` | Simplified super-admin feed management (add/delete) |
| `app/api/crm/admin/intel-brief-feeds/route.ts` | GET/POST/DELETE API for feeds |
| `CrmHeader.tsx` | Intel Brief nav link (gated on `"news"`) + Settings link + Feeds link for super admin |
| `app/crm/page.tsx` — AdminDashboard widget | Intel Brief widget added to AdminDashboard |
| `scripts/ingest_news.py` | Hourly ingestion pipeline (RSS → trafilatura → rule score → Claude Haiku → DB) |
| `scripts/requirements-ingest.txt` | Python dependencies pinned |
| `.github/workflows/ingest-news.yml` | GitHub Actions cron (every hour) |

---

### ⚠️ Required Before Pipeline Runs

**Add 3 GitHub Actions secrets** — the workflow exists but will fail without these:
1. Go to your GitHub repo → **Settings → Secrets and variables → Actions**
2. Add `NEXT_PUBLIC_SUPABASE_URL` (copy from `.env.local`)
3. Add `SUPABASE_SERVICE_ROLE_KEY` (copy from `.env.local`)
4. Add `ANTHROPIC_API_KEY` (your Anthropic key)

After adding secrets, trigger a manual run: **Actions → Intel Brief — Hourly News Ingestion → Run workflow**

---

### ⏳ Not Yet Built (V1 remaining work)

**Schema gaps — the simplified schema that was applied differs from the full spec:**

The tables were created with a lean schema to ship fast. The following columns from the spec are missing and will need to be added via migration before building the features that depend on them:

| Table | Missing columns |
|-------|----------------|
| `alert_feeds` | `feed_source`, `search_query`, `topic_category`, `status` (`active`/`pending`/`paused`/`rejected`), `keywords[]`, `requested_by_tenant`, `request_note`, `rejection_note`, `last_fetched_at`, `last_fetch_error`, `article_count`, `created_by` |
| `news_articles` | `global_summary`, `full_text_extracted`, `feed_source`, `source_name` (column named `source_domain` not `source_name`), `raw_snippet` (column named `snippet`) |
| `tenant_article_relevance` | `is_notable`, `is_flagged`, `is_suppressed`, `surfaced_at` (column named `scored_at`) |

**Frontend features not yet built:**

| Feature | Spec section | Effort |
|---------|-------------|--------|
| Flag (🚩) + Suppress (🚫) on feed articles | 5.3 | Needs `is_flagged`/`is_suppressed` columns first |
| Feed pagination (25 per page) | 5.3 | Medium |
| Intel Brief widget on **FieldDashboard** | 5.4 | Small — same as AdminDashboard widget |
| Admin feeds — status management (pending/active/paused/rejected queue) | 5.1 | Large — needs schema columns first |
| Admin feeds — source type support (google_news, gdelt query-based) | 5.1 | Large — needs `feed_source`/`search_query` columns |
| Admin feeds — health stats bar | 5.1 | Small |
| Admin feeds — pending approval queue | 5.1 | Medium |
| Settings — tag-style keyword input (vs textarea) | 5.2 | Small |
| Settings — suggested keywords panel | 5.2 | Small |
| Settings — feed request flow (tenant requests a new feed) | 5.2 | Large |
| Cowart4texas specific feeds | Section 6 | Needs alert setup on Google/Talkwalker, then paste URL into admin UI |

**Feeds still needed for cowart4texas** (from Section 6 table):
The 4 seed feeds added are generic. The campaign-specific feeds below need to be added manually via `/crm/admin/intel-brief-feeds` — the query-based ones (marked ✅) can be added immediately; the URL-based ones need alert creation first:
- `"Texas House District 15" OR "HD-15"` — google_news ✅
- `"Montgomery County" AND (election OR politics OR candidate)` — google_news ✅
- `"Libertarian Party Texas" OR "LP Texas"` — google_news ✅
- `"property tax" Texas 2026` — google_news ✅
- `"civil asset forfeiture" Texas` — gdelt ✅
- `"The Woodlands" Texas politics` — gdelt ✅
- Jessi Cowart candidate alert — needs Google Alert setup → paste URL
- Brad Bailey opponent alert — needs Google Alert setup → paste URL

> Note: Until the schema columns (`feed_source`, `search_query`, `status`) are added, all feeds in the admin UI are treated as plain RSS URL feeds. Query-based feeds (google_news, gdelt) can't be supported until the schema is extended.

---

## 0. Product Identity

**Product name:** Intel Brief
**Product family:** GuerrillaSuite (sits alongside GroundGame)
**Tagline:** *Your campaign intelligence, briefed daily.*

Intel Brief is GuerrillaSuite's news monitoring and intelligence product. It aggregates articles from across the web via RSS/Atom feeds, scores each article for relevance against each tenant's campaign profile using a hybrid rule-based + AI scoring engine, and surfaces the most important stories inside GroundGame — in a dashboard widget and a full feed page. Think of it as a campaign manager's morning intelligence briefing, delivered automatically and filtered to what actually matters for their race.

**Voice and copy guidelines for UI text throughout the build:**
- Use "briefed" and "briefing" naturally — "Stay briefed," "Your latest briefing," "You're all caught up"
- The dashboard widget is called the **"Intel Brief widget"** or just **"Intel Brief"** — never "news widget" or "news card"
- The full feed page is the **"Intel Brief feed"** or **"Full Briefing"** — never "news page"
- The settings page is **"Intel Brief Settings"** — never "news settings"
- Articles that clear the relevance threshold are **"briefed"** to the tenant
- Empty states should feel like a confident intelligence officer, not a sad error — e.g. "No new intel since your last briefing" not "No articles found"
- Scores are displayed as-is (e.g. 8.4) — never call them "scores" in user-facing copy, call them **"relevance"** or just show the number with a badge

---

## 1. Project Context

**What this is:** Intel Brief — a global news monitoring and relevance-scoring system built into GuerrillaSuite CRM, targeting libertarian and independent political campaigns and liberty-minded orgs as the primary tenant market.

**Tech stack:** Next.js (App Router), Supabase (Postgres), TypeScript. Existing CRM already uses `getTenant()` and `getCrmUser()` from `@/lib/tenant` and `@/lib/crm-auth`. All existing DB queries use a tenant-scoped Supabase client via a `makeSb(tenantId)` helper that passes `X-Tenant-Id` as a header.

**Source of articles:** Five feed source types are supported, handled by a single ingestion script. Three are traditional RSS/Atom feeds (paste a URL); two are query-based (store a search query string, script hits an API directly). All five write to the same `news_articles` and `tenant_article_relevance` tables through identical downstream logic.

| Source | `feed_source` value | Input type | Cost | Strengths |
|--------|-------------------|------------|------|-----------|
| Google Alerts | `google` | Feed URL | Free | Largest index, most familiar |
| Talkwalker Alerts | `talkwalker` | Feed URL | Free | Includes Twitter/X, Boolean operators |
| Alertmouse | `alertmouse` | Feed URL | $10+/mo | Better signal quality, less noise |
| Google News (PyGoogleNews) | `google_news` | Search query | Free | Programmatic, no manual alert setup, Boolean + geo support |
| GDELT DOC API | `gdelt` | Search query | Free | Independent index, 15-min refresh, catches local outlets Google misses |

**URL-based feeds** (google, talkwalker, alertmouse): Feed URL is pasted into the CRM. The ingestion script fetches and parses the Atom/RSS feed with `feedparser`.

**Query-based feeds** (google_news, gdelt): A search query string is stored instead of a URL. The ingestion script constructs the API call programmatically — no manual paste step required. SuperAdmin enters the query in the feed creation form and the script handles the rest.

**Full article text extraction:** After any new article is discovered (from any source), the ingestion script attempts full-body extraction using **Trafilatura** before scoring begins. This gives the rule scorer and AI summarizer the complete article text rather than just the snippet. Trafilatura is free, open source (Apache 2.0), and consistently ranks first in independent extraction benchmarks. Extraction is attempted silently — if it fails (paywall, JS-rendered page, timeout), the system falls back gracefully to the raw snippet from the feed. No article is ever dropped due to extraction failure.

**Ingestion engine:** A Python script run on a schedule via GitHub Actions cron (free tier). It pulls feeds, scores articles, and writes to Supabase. This is NOT a Next.js API route — it is a standalone Python script in the repo.

**Reference implementation:** https://github.com/caseycrowe/google-alerts-to-web — this repo shows the feed-pulling and deduplication pattern. We are adapting it to write to Supabase instead of CSV, adding multi-tenant relevance scoring, and adding AI scoring via Claude API.

---

## 2. Core Architectural Decisions (Do Not Deviate)

### 2.1 Global Articles, Per-Tenant Relevance

**Articles are stored ONCE globally.** There is NO `tenant_id` on the `news_articles` table. This is intentional.

- Multiple tenants may care about the same article
- Deduplication works on article URL as a unique key — first tenant's feed to find it wins, but ALL tenants still get scored against it
- The `tenant_article_relevance` table is where all tenant-specific data lives

**Feeds are also global.** There is NO `tenant_id` on `alert_feeds`. Feeds are platform-level assets managed only by SuperAdmin. Every new article ingested from any feed gets scored against every active tenant automatically.

**Why this matters:** If Tenant A's feed pulls in an article about "civil asset forfeiture Texas," Tenant B (a different LP campaign) will also get that article scored against their keyword profile even though their feed didn't find it. This is the desired behavior — GuerrillaSuite becomes the central aggregator.

### 2.2 Scoring Architecture

Three-phase pipeline:

**Phase 0 — Full text extraction (free, always attempted):**
- After a new article is discovered, Trafilatura fetches and extracts the full article body
- Gracefully falls back to the raw snippet if extraction fails (paywall, JS-rendered, timeout)
- Result stored in `news_articles.full_text` and `full_text_extracted` boolean
- All downstream scoring uses `full_text` when available, `raw_snippet` otherwise — referred to as `scoring_text`

**Phase 1 — Rule-based scoring (free, always runs):**
- Check headline and `scoring_text` for tenant keyword matches:
  - Headline match: +3 pts (strongest signal)
  - Body/snippet match: +1 pt per keyword
- Check source domain against tenant blacklist (if blacklisted, score = 0, don't write row)
- Apply recency modifier based on `published_at` (see section 4.9 for exact logic)
- Max rule score: 10

**Phase 2 — AI scoring (paid, conditional):**
- Only runs if rule_score >= 7
- Uses Claude Haiku (cheapest, fast enough)
- Prompt passes `full_text` truncated to ~5,000 chars when available (vs. just snippet previously) — dramatically improves summary quality and relevance accuracy
- The summary is stored ONCE on `news_articles.global_summary` — it is NOT per-tenant
- The AI relevance score IS per-tenant — the same article may score differently for different tenants based on their keyword profile context passed in the prompt
- If an article already has a `global_summary` (scored for a previous tenant), skip summary generation but still run the relevance score for the new tenant

**Final score formula:** `(rule_score * 0.4) + (ai_relevance_score * 0.6)` — rounded to 1 decimal

**is_notable flag:** Set to `true` if `final_score >= tenant's display_threshold` (stored in `tenant_news_settings`). This is what controls whether an article appears in the tenant's feed UI.

### 2.3 Access Control Levels

| Role | Feed Management | Intel Brief Settings | Intel Brief Feed | Intel Brief Widget | Personal Prefs |
|------|----------------|-----------------|----------------|------------------|----------------|
| SuperAdmin | ✅ Full | ✅ Any tenant | ✅ Any tenant | ✅ | ✅ |
| Tenant Admin | ❌ | ✅ Own tenant only | ✅ Read + flag/suppress | ✅ | ✅ |
| Field User | ❌ | ❌ | ✅ Read only | ✅ | ✅ (widget prefs only) |

SuperAdmin is identified via `user.isSuperAdmin` from `getCrmUser()` — this pattern already exists in the codebase (see `CrmHeader` receiving `isSuperAdmin` prop in `layout.tsx`).

### 2.4 Plan Gating — Pro Only

**The entire news feature is gated behind the `"news"` feature key, which is a War Chest+ feature.**

The feature flag system lives in `@/lib/features`. It exports:
- `ALL_FEATURE_KEYS` — array of all valid feature key strings
- `PLAN_FEATURES` — map of `{ scout_kit, field_pack, war_chest, enterprise }` (actual plan tier names — no "basic" or "pro")
- `FEATURE_META` — map of `{ [key]: { label: string, group: string } }` used to render toggle UI
- `hasFeature(features, key)` — boolean check helper (prefer this over `.includes()`)
- `planFromFeatures(features: FeatureKey[])` — derives the plan name from a feature array
- `type FeatureKey` — union type of all valid feature key strings

**What needs to change in `@/lib/features`:**

1. Add `"news"` to `ALL_FEATURE_KEYS` (this automatically extends the `FeatureKey` union type)
2. Add `"news"` to `PLAN_FEATURES.war_chest` — also in `enterprise` automatically (enterprise uses `ALL_FEATURE_KEYS`). Do NOT add to `scout_kit` or `field_pack`.
3. Add an entry to `FEATURE_META`:
   ```ts
   news: { label: "Intel Brief", group: "CRM Core" }
   ```
   The group `"CRM Core"` already exists in the `FEATURE_META` entries, so it will automatically appear in the feature toggle grid on the tenant edit page (`app/crm/admin/tenants/[id]/`) under that section.

**How to check the gate in each surface:**

The tenant object returned by `getTenant()` already includes a `features: FeatureKey[]` array. Import and use the `hasFeature` helper:

```typescript
import { hasFeature } from "@/lib/features";
const hasNews = hasFeature(tenant.features, "news");
```

Apply this gate as follows:

| Surface | Gate behavior |
|---------|--------------|
| `/crm/intel-brief` | If `!hasNews`, redirect to `/crm` |
| `/crm/settings/intel-brief` | If `!hasNews`, redirect to `/crm` |
| Intel Brief widget (AdminDashboard) | If `!hasNews`, skip the DB fetch entirely and don't render the widget card |
| Intel Brief widget (FieldDashboard) | If `!hasNews`, skip the DB fetch entirely and don't render the widget card |
| `/crm/admin/intel-brief-feeds` | SuperAdmin only — no feature gate needed, SuperAdmin always has access |
| Ingestion script | No gate — the Python script scores all tenants that have `tenant_news_settings` rows; tenants without the feature simply won't have a settings row and won't be scored |

**Upgrade prompt (optional but recommended):** On the dashboard pages, if `!hasNews` and the user is an admin, render a small "unlock" card in the Intel Brief widget position — something like "📡 Intel Brief is available on the War Chest plan. Contact your administrator to upgrade." Use the same `card` style. This is optional — if it adds complexity, skip it for now.

**SuperAdmin bypass:** SuperAdmin (`crmUser.isSuperAdmin === true`) always bypasses feature gates on all `/crm/` routes. They can access news settings and the news feed for any tenant regardless of that tenant's plan, for support and testing purposes.

---

## 3. Database Schema

All tables go in the existing Supabase project. Use the existing RLS patterns already in place for other tables.

### 3.1 `alert_feeds`
```sql
CREATE TABLE alert_feeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,                          -- Human-readable name, e.g. "Jessi Cowart - Candidate Name"
  feed_source TEXT NOT NULL DEFAULT 'google',   -- 'google' | 'talkwalker' | 'alertmouse' | 'google_news' | 'gdelt'
  
  -- URL-based sources (google, talkwalker, alertmouse): store the feed URL here
  -- Query-based sources (google_news, gdelt): leave NULL
  feed_url TEXT UNIQUE,

  -- Query-based sources (google_news, gdelt): store the search query string here
  -- URL-based sources: leave NULL
  -- e.g. "Jessi Cowart OR HD-15 OR \"Texas House District 15\""
  search_query TEXT,

  topic_category TEXT NOT NULL,                 -- 'candidate' | 'opponent' | 'issue' | 'local' | 'lp_ecosystem' | 'race'
  keywords TEXT[] DEFAULT '{}',                 -- Keywords for context/display — NOT the search query
  status TEXT NOT NULL DEFAULT 'pending',       -- 'pending' | 'active' | 'paused' | 'rejected'
                                                -- NOTE: 'pending' = awaiting SuperAdmin approval
                                                --       'active'  = ingestion script picks this up
                                                --       'paused'  = SuperAdmin manually paused
                                                --       'rejected'= SuperAdmin rejected the request
  requested_by_tenant TEXT,                     -- Tenant slug of the admin who submitted the request (null if SuperAdmin created directly)
  request_note TEXT,                            -- Optional note from the tenant admin explaining the request
  rejection_note TEXT,                          -- Optional note from SuperAdmin explaining a rejection
  last_fetched_at TIMESTAMPTZ,
  last_fetch_error TEXT,                        -- Store last error message for debugging
  article_count INTEGER DEFAULT 0,              -- Running total of articles ingested from this feed
  created_by UUID REFERENCES auth.users(id),    -- User who created the record (SuperAdmin or tenant admin)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Enforce: URL-based sources must have feed_url, query-based must have search_query
  CONSTRAINT chk_feed_source_input CHECK (
    (feed_source IN ('google', 'talkwalker', 'alertmouse') AND feed_url IS NOT NULL)
    OR
    (feed_source IN ('google_news', 'gdelt') AND search_query IS NOT NULL)
    OR
    -- Allow both null during pending state (tenant submitted without completing Google step)
    (status = 'pending')
  )
);

CREATE INDEX idx_alert_feeds_status ON alert_feeds(status);
CREATE INDEX idx_alert_feeds_source ON alert_feeds(feed_source);

-- RLS: DISABLED. alert_feeds is a global platform table with no tenant_id.
-- All access is via the service role key (Next.js server + Python script). No public/anon access needed.
ALTER TABLE alert_feeds DISABLE ROW LEVEL SECURITY;
```

### 3.2 `news_articles`
```sql
CREATE TABLE news_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL UNIQUE,                     -- The dedupe key — never store two rows for same URL
  headline TEXT NOT NULL,
  source_domain TEXT NOT NULL,                  -- e.g. "chron.com", "texastribune.org"
  source_name TEXT,                             -- Human-readable source name if parseable
  published_at TIMESTAMPTZ,                     -- From the feed entry, may be null if not provided
  ingested_at TIMESTAMPTZ DEFAULT NOW(),        -- When our system first saw it
  raw_snippet TEXT,                             -- The raw description/snippet from the Atom/RSS feed or API response
  full_text TEXT,                               -- Full article body extracted by Trafilatura. NULL if extraction
                                                -- failed (paywall, JS-rendered, timeout). Rule scoring and AI
                                                -- summarization use this when available, fall back to raw_snippet.
  full_text_extracted BOOLEAN DEFAULT false,    -- true if Trafilatura successfully extracted body text
  global_summary TEXT,                          -- AI-generated summary, set once, reused for all tenants.
                                                -- Generated from full_text when available, raw_snippet otherwise.
  feed_id UUID REFERENCES alert_feeds(id) ON DELETE SET NULL,  -- Which feed first surfaced this article; null if feed deleted
  feed_source TEXT                              -- Copied from alert_feeds.feed_source at ingestion time
);

-- RLS: DISABLED. news_articles is a global table with no tenant_id.
-- All access is via the service role key. Tenants read articles only through tenant_article_relevance joins.
ALTER TABLE news_articles DISABLE ROW LEVEL SECURITY;
```

### 3.3 `tenant_article_relevance`
```sql
CREATE TABLE tenant_article_relevance (
  tenant_id TEXT NOT NULL,                      -- Stores the tenant UUID (e.g. "f1a15d20-..."), NOT the slug.
                                                -- The ingestion script pulls this from tenant_news_settings.tenant_id.
  article_id UUID NOT NULL REFERENCES news_articles(id) ON DELETE CASCADE,
  rule_score NUMERIC(4,1),                      -- Phase 1 score, 0-10
  ai_relevance_score NUMERIC(4,1),              -- Phase 2 score, 0-10, null if rule_score < 7
  final_score NUMERIC(4,1),                     -- Combined score
  is_notable BOOLEAN DEFAULT false,             -- true if final_score >= tenant's display_threshold
  is_flagged BOOLEAN DEFAULT false,             -- Manually flagged by tenant admin for comms team attention
  is_suppressed BOOLEAN DEFAULT false,          -- Admin suppressed this article (domain blacklisted via UI)
  surfaced_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (tenant_id, article_id)
);

CREATE INDEX idx_tar_tenant_notable ON tenant_article_relevance(tenant_id, is_notable, final_score DESC);
CREATE INDEX idx_tar_tenant_surfaced ON tenant_article_relevance(tenant_id, surfaced_at DESC);

-- RLS: ENABLED. Rows are scoped by tenant_id UUID.
-- All Next.js queries use the service role key with X-Tenant-Id header — RLS is enforced via header check.
ALTER TABLE tenant_article_relevance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_scoped" ON tenant_article_relevance
  USING (tenant_id = current_setting('request.headers')::json->>'x-tenant-id');
```

### 3.4 `tenant_news_settings`
```sql
CREATE TABLE tenant_news_settings (
  tenant_id TEXT PRIMARY KEY,                   -- Stores the tenant UUID (same value as tenants.id), NOT the slug.
  keywords TEXT[] DEFAULT '{}',                 -- Tenant's keyword profile for relevance scoring
  display_threshold NUMERIC(3,1) DEFAULT 6.5,   -- Minimum final_score to show in feed
  widget_count INTEGER DEFAULT 5,               -- How many articles to show in dashboard widget
  news_feed_enabled_for_field BOOLEAN DEFAULT true,  -- Whether field users can see /crm/news
  blacklisted_domains TEXT[] DEFAULT '{}',      -- Domains to suppress entirely for this tenant
  categories JSONB DEFAULT '[
    {"key":"candidate","label":"Candidate","color":"blue"},
    {"key":"opponent","label":"Opponent","color":"red"},
    {"key":"issue","label":"Issue","color":"purple"},
    {"key":"local","label":"Local","color":"teal"},
    {"key":"lp_ecosystem","label":"LP Ecosystem","color":"amber"},
    {"key":"race","label":"Race","color":"orange"}
  ]',                                           -- Tenant-configurable category definitions.
                                                -- key: matches alert_feeds.topic_category value
                                                -- label: display name shown in UI
                                                -- color: one of the 12 palette names (see section 5.0)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: ENABLED. Scoped by tenant_id UUID.
ALTER TABLE tenant_news_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_scoped" ON tenant_news_settings
  USING (tenant_id = current_setting('request.headers')::json->>'x-tenant-id');
```

### 3.5 `user_news_prefs` — SKIPPED FOR V1

Per-user widget preferences (show/hide, count override) are out of scope for V1. All users within a tenant share the same feed and widget settings. The `user_news_prefs` table will be added in a future release. Do not create this table or reference it in any V1 code.

---

## 4. Python Ingestion Script

### 4.1 Location in Repo
`/scripts/ingest_news.py`

### 4.2 Dependencies
```
feedparser          # RSS/Atom parsing — used for URL-based feeds AND google_news (direct RSS URL construction)
trafilatura         # Full article text extraction (free, Apache 2.0)
requests            # HTTP for GDELT API calls
supabase            # Supabase client (pip package is "supabase", not "supabase-py")
anthropic           # Claude API for AI scoring
python-dotenv       # Environment variable loading
```

Note: `pygooglenews` is NOT used. It is unmaintained and fragile. Google News queries are handled by
constructing the RSS URL directly with `feedparser` — no wrapper library needed (see section 4.6).

Install command for GitHub Actions:
```
pip install feedparser trafilatura requests supabase anthropic python-dotenv
```

### 4.3 Environment Variables Needed
```
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
```

### 4.4 Feed Source Architecture

The ingestion script handles five distinct feed source types. All five funnel into the same article upsert → Trafilatura extraction → scoring pipeline. The only difference is how entries are initially fetched.

```
┌─────────────────────────────────────────────────────────────┐
│                     FEED SOURCES                            │
│                                                             │
│  URL-based (feedparser)    Query-based (API calls)          │
│  ─────────────────────    ─────────────────────────         │
│  google     → feedparser   google_news → PyGoogleNews        │
│  talkwalker → feedparser   gdelt       → GDELT DOC API       │
│  alertmouse → feedparser                                    │
└──────────────────────────┬──────────────────────────────────┘
                           │  entries: [{url, headline, snippet, published_at}]
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  SHARED PIPELINE (all sources)              │
│                                                             │
│  1. clean_url()           strip Google redirect wrappers    │
│  2. upsert_article()      dedupe on URL, skip if exists     │
│  3. trafilatura_extract()  fetch full body, fallback to snip│
│  4. calculate_rule_score() score vs each tenant's keywords  │
│  5. get_ai_score()        Claude Haiku if rule_score >= 7   │
│  6. upsert_relevance()    write per-tenant scores to DB     │
└─────────────────────────────────────────────────────────────┘
```

### 4.5 Main Script Logic (Pseudocode — implement exactly this flow)

```python
def main():
    # 1. Fetch all active feeds, grouped by source type
    feeds = supabase.table('alert_feeds').select('*').eq('status', 'active').execute().data
    
    # 2. Fetch all tenants with news settings
    tenant_settings = supabase.table('tenant_news_settings').select('*').execute().data
    
    if not tenant_settings:
        print("No tenants configured — nothing to score. Exiting.")
        return
    
    # 3. Collect all entries from all sources
    all_entries = []  # list of dicts: {url, headline, snippet, published_at, feed_id, feed_source}
    
    for feed in feeds:
        try:
            if feed['feed_source'] in ('google', 'talkwalker', 'alertmouse'):
                entries = fetch_rss_entries(feed)
            elif feed['feed_source'] == 'google_news':
                entries = fetch_google_news_entries(feed)
            elif feed['feed_source'] == 'gdelt':
                entries = fetch_gdelt_entries(feed)
            else:
                continue
            
            all_entries.extend(entries)
            update_feed_last_fetched(feed['id'])
            
        except Exception as e:
            update_feed_error(feed['id'], str(e))
            continue
    
    # 4. Deduplicate entries by URL before processing
    seen_urls = set()
    unique_entries = []
    for entry in all_entries:
        clean = clean_url(entry['url'])
        if clean not in seen_urls:
            seen_urls.add(clean)
            entry['url'] = clean
            unique_entries.append(entry)
    
    # 5. Process each unique entry through the shared pipeline
    for entry in unique_entries:
        # Upsert article — returns None if URL already exists in DB
        article = upsert_article_if_new(entry)
        if article is None:
            continue  # Already processed, skip all scoring
        
        # Trafilatura extraction — attempt full body text
        full_text, extracted = extract_full_text(article['url'])
        if extracted:
            update_article_full_text(article['id'], full_text)
            article['full_text'] = full_text
            article['full_text_extracted'] = True
        
        # Scoring text = full_text if available, else raw_snippet
        scoring_text = article.get('full_text') or article.get('raw_snippet') or ''
        
        # Score against every tenant
        for tenant in tenant_settings:
            if is_domain_blacklisted(article['url'], tenant['blacklisted_domains']):
                continue
            
            rule_score = calculate_rule_score(article['headline'], scoring_text, tenant['keywords'])
            rule_score = apply_recency_modifier(rule_score, article.get('published_at'))
            
            ai_score = None
            if rule_score >= 7:
                if not article.get('global_summary'):
                    ai_score, summary = get_ai_score_and_summary(article, tenant['keywords'])
                    update_global_summary(article['id'], summary)
                    article['global_summary'] = summary
                else:
                    ai_score = get_ai_score_only(article, tenant['keywords'])
            
            final_score = calculate_final_score(rule_score, ai_score)
            is_notable = final_score >= tenant['display_threshold']
            
            if rule_score >= 3:
                upsert_tenant_relevance(tenant['tenant_id'], article['id'], rule_score, ai_score, final_score, is_notable)
```

### 4.6 Fetch Functions by Source Type

```python
import feedparser
import requests
from urllib.parse import quote_plus

def fetch_rss_entries(feed):
    """Handles google, talkwalker, alertmouse — all standard Atom/RSS."""
    parsed = feedparser.parse(feed['feed_url'])
    entries = []
    for e in parsed.entries:
        entries.append({
            'url': e.get('link', ''),
            'headline': e.get('title', ''),
            'snippet': e.get('summary', '') or e.get('description', ''),
            'published_at': e.get('published', None),
            'feed_id': feed['id'],
            'feed_source': feed['feed_source'],
        })
    return entries

def fetch_google_news_entries(feed):
    """
    Handles google_news — constructs a Google News RSS URL directly and parses it with feedparser.
    No external wrapper library needed. Google News RSS is stable and well-supported by feedparser.
    
    URL format: https://news.google.com/rss/search?q=QUERY&hl=en-US&gl=US&ceid=US:en
    """
    from urllib.parse import quote_plus
    query_encoded = quote_plus(feed['search_query'])
    rss_url = f"https://news.google.com/rss/search?q={query_encoded}&hl=en-US&gl=US&ceid=US:en"
    parsed = feedparser.parse(rss_url)
    entries = []
    for e in parsed.entries:
        entries.append({
            'url': e.get('link', ''),
            'headline': e.get('title', ''),
            'snippet': e.get('summary', '') or e.get('description', ''),
            'published_at': e.get('published', None),
            'feed_id': feed['id'],
            'feed_source': 'google_news',
        })
    return entries

def fetch_gdelt_entries(feed):
    """Handles gdelt — hits the GDELT DOC 2.0 API with the stored search query."""
    # GDELT DOC API — free, no API key required, updates every 15 minutes
    params = {
        'query': feed['search_query'],
        'mode': 'ArtList',          # Return individual articles (not timeline)
        'maxrecords': 75,           # Max per call
        'timespan': '1d',           # Last 24 hours
        'sort': 'DateDesc',
        'format': 'json',
    }
    response = requests.get('https://api.gdeltproject.org/api/v2/doc/doc', params=params, timeout=30)
    response.raise_for_status()
    data = response.json()
    
    entries = []
    for article in data.get('articles', []):
        entries.append({
            'url': article.get('url', ''),
            'headline': article.get('title', ''),
            'snippet': '',  # GDELT doesn't provide article snippets — scoring falls back to Trafilatura full_text or empty
            'published_at': article.get('seendate', None),
            'feed_id': feed['id'],
            'feed_source': 'gdelt',
        })
    return entries
```

### 4.7 URL Cleaning

```python
from urllib.parse import urlparse, parse_qs, unquote

SUPPORTED_FEED_PREFIXES = [
    'https://www.google.com/alerts/feeds/',
    'https://www.talkwalker.com/alerts/',
    'https://alertmouse.com/',
]

def clean_url(raw_url):
    """
    Google Alerts wraps article URLs in a redirect.
    PyGoogleNews may also return Google-wrapped URLs.
    Talkwalker, Alertmouse, and GDELT return clean URLs directly.
    """
    parsed = urlparse(raw_url)
    if parsed.netloc == 'www.google.com' and 'url' in parse_qs(parsed.query):
        return unquote(parse_qs(parsed.query)['url'][0])
    return raw_url

def is_valid_feed_url(url):
    """Used in UI validation for URL-based feed types only."""
    return any(url.startswith(prefix) for prefix in SUPPORTED_FEED_PREFIXES)
```

### 4.8 Trafilatura Full Text Extraction

```python
import trafilatura

def extract_full_text(url):
    """
    Attempt to fetch and extract the full article body using Trafilatura.
    
    Returns: (full_text: str | None, success: bool)
    
    Graceful failure cases (all return (None, False)):
    - Paywalled articles
    - JavaScript-rendered pages
    - Network timeouts
    - Any other extraction error
    
    Never raises — always returns a tuple.
    """
    try:
        downloaded = trafilatura.fetch_url(url)
        if downloaded is None:
            return None, False
        
        text = trafilatura.extract(
            downloaded,
            include_comments=False,    # Skip comment sections
            include_tables=False,      # Skip data tables
            no_fallback=False,         # Allow jusText fallback for better recall
            favor_recall=True,         # Prefer more text over less (better for scoring)
        )
        
        if text and len(text.strip()) > 100:  # Minimum viable article length
            return text.strip(), True
        return None, False
        
    except Exception:
        return None, False  # Silent failure — never crash the pipeline
```

### 4.9 Rule Score Calculation

The rule scorer now uses `scoring_text` which is `full_text` when available, otherwise `raw_snippet`. This means keyword matches in the article body count, not just the headline and snippet — significantly improving accuracy.

```python
def calculate_rule_score(headline, scoring_text, tenant_keywords):
    score = 0
    headline_lower = headline.lower()
    body_lower = scoring_text.lower()
    
    for keyword in tenant_keywords:
        kw = keyword.lower()
        if kw in headline_lower:
            score += 3      # Headline match = strongest signal
        elif kw in body_lower:
            score += 1      # Body/snippet match = weaker signal
    
    return max(0, min(10, score))  # Clamp to 0-10 before recency modifier


def apply_recency_modifier(score, published_at_str):
    """
    Recency modifier — applied AFTER keyword scoring, in the main loop.
    published_at_str: ISO 8601 string or None.
    Returns adjusted score (still clamped 0-10).
    """
    if not published_at_str:
        return score  # No publish date — no adjustment
    try:
        from datetime import datetime, timezone
        pub_dt = datetime.fromisoformat(published_at_str.replace('Z', '+00:00'))
        age_hours = (datetime.now(timezone.utc) - pub_dt).total_seconds() / 3600
        if age_hours < 6:
            score += 1    # Very fresh — boost
        elif age_hours > 720:  # 30 days
            score -= 2    # Stale — significant penalty
        elif age_hours > 168:  # 7 days
            score -= 1    # Getting old — mild penalty
    except Exception:
        pass  # Malformed date — no adjustment
    return max(0, min(10, score))
```

Note: headline weight increased from 2 to 3 now that body matches are available, to preserve relative signal strength.

### 4.10 AI Scoring Prompt

The prompt now passes `full_text` (truncated to ~800 words) when available instead of just the snippet, giving Claude far more context for accurate relevance scoring and better summaries.

```python
def get_ai_score_and_summary(article, tenant_keywords):
    # Use full text if available, truncated to ~800 words to control token cost
    article_content = article.get('full_text') or article.get('raw_snippet') or ''
    if len(article_content) > 5000:
        article_content = article_content[:5000] + '...'
    
    prompt = f"""You are analyzing a news article for relevance to a libertarian or independent political campaign in Texas.

Article headline: {article['headline']}
Source: {article['source_domain']}
Article content: {article_content}

Campaign's key topics: {', '.join(tenant_keywords)}

Please respond with ONLY a JSON object in this exact format, no other text:
{{
  "relevance_score": <integer 1-10>,
  "summary": "<2-3 sentence neutral factual summary of what this article is about>"
}}

Relevance score guide:
- 9-10: Directly about the campaign, candidate, or a core campaign issue
- 7-8: Closely related to campaign issues or local political context
- 5-6: Tangentially related, may be useful for context
- 3-4: Loosely related topic, unlikely to be actionable
- 1-2: Not relevant to this campaign"""

    response = anthropic_client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=300,
        messages=[{"role": "user", "content": prompt}]
    )
    
    result = json.loads(response.content[0].text)
    return result['relevance_score'], result['summary']
```

### 4.11 Backfill for New Tenants

**The problem:** The main ingestion loop skips any article URL that already exists in `news_articles` (`if article is None: continue`). A tenant added after articles are ingested will have zero `tenant_article_relevance` rows — they'll see an empty feed on day one.

**The solution:** A separate backfill function that runs at the end of `main()` after the normal ingest loop. It finds any article that has no `tenant_article_relevance` row for a given tenant and scores it.

```python
def backfill_unscored_articles(tenant_settings):
    """
    For each tenant, find news_articles rows with no corresponding tenant_article_relevance entry
    and score them. Runs after the normal ingest loop. Capped at 500 articles per tenant per run
    to avoid timeout on large backlogs — subsequent runs will catch the rest.
    """
    for tenant in tenant_settings:
        # Find articles not yet scored for this tenant
        scored_ids = supabase.table('tenant_article_relevance') \
            .select('article_id') \
            .eq('tenant_id', tenant['tenant_id']) \
            .execute().data
        scored_set = {r['article_id'] for r in scored_ids}

        all_articles = supabase.table('news_articles') \
            .select('id, url, headline, raw_snippet, full_text, global_summary, published_at, source_domain') \
            .order('ingested_at', desc=True) \
            .limit(500) \
            .execute().data

        unscored = [a for a in all_articles if a['id'] not in scored_set]
        if not unscored:
            continue

        print(f"Backfilling {len(unscored)} articles for tenant {tenant['tenant_id']}")
        for article in unscored:
            if is_domain_blacklisted(article['url'], tenant['blacklisted_domains']):
                continue
            scoring_text = article.get('full_text') or article.get('raw_snippet') or ''
            rule_score = calculate_rule_score(article['headline'], scoring_text, tenant['keywords'])
            rule_score = apply_recency_modifier(rule_score, article.get('published_at'))
            ai_score = None
            if rule_score >= 7:
                if not article.get('global_summary'):
                    ai_score, summary = get_ai_score_and_summary(article, tenant['keywords'])
                    update_global_summary(article['id'], summary)
                    article['global_summary'] = summary
                else:
                    ai_score = get_ai_score_only(article, tenant['keywords'])
            final_score = calculate_final_score(rule_score, ai_score)
            is_notable = final_score >= tenant['display_threshold']
            if rule_score >= 3:
                upsert_tenant_relevance(tenant['tenant_id'], article['id'], rule_score, ai_score, final_score, is_notable)
```

Call `backfill_unscored_articles(tenant_settings)` at the end of `main()`, after the normal ingest loop completes.

---

### 4.12 GitHub Actions Workflow

**⚠️ Before this workflow can run, you must add three secrets to the GitHub repository:**

1. Go to your GitHub repo → **Settings** → **Secrets and variables** → **Actions**
2. Click **"New repository secret"** for each of the following:
   - `NEXT_PUBLIC_SUPABASE_URL` — your Supabase project URL (same as in `.env.local`)
   - `SUPABASE_SERVICE_ROLE_KEY` — your Supabase service role key (same as in `.env.local`)
   - `ANTHROPIC_API_KEY` — your Anthropic API key for Claude Haiku scoring
3. The workflow will fail silently (or error on first DB call) if any of these are missing.

You can trigger a manual run immediately after adding secrets via **Actions** → **"Ingest Intel Brief Feeds"** → **"Run workflow"** to verify everything works before waiting for the hourly cron.

```yaml
name: Ingest Intel Brief Feeds
on:
  schedule:
    - cron: '0 * * * *'  # Every hour
  workflow_dispatch:       # Allow manual trigger from GitHub UI

jobs:
  ingest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - name: Install dependencies
        run: |
          pip install feedparser trafilatura requests supabase anthropic python-dotenv
      - name: Run ingestion script
        run: python scripts/ingest_news.py
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

---

## 5. UI Surfaces

### 5.0 Design Language — Intel Brief Visual Identity

Intel Brief is a premium intelligence product inside a political ops platform. It should feel like a command center briefing, not a news aggregator. Every design decision should reinforce: *this is filtered, curated, high-signal information — not the internet.*

**Color system for relevance scores** — scores are the core data point and should be instantly scannable:
| Score | Color | Vibe |
|-------|-------|------|
| 9.0 – 10.0 | Bright green `#22c55e` with a subtle pulse ring | Hot — act on this |
| 7.5 – 8.9 | Solid green `#16a34a` | Notable |
| 6.5 – 7.4 | Amber `#d97706` | Worth watching |
| 5.0 – 6.4 | Muted gray — shown only in "all" view | Low signal |

Score badge design: a small pill `[8.4]` with colored background at ~15% opacity and full-saturation colored text. Not just a number — a signal.

**Category badge colors** — categories and their colors are tenant-configurable in Intel Brief Settings (see section 5.2). Default categories ship pre-configured but can be renamed, recolored, added to, or deleted. The color for each category is stored in `tenant_news_settings.categories` JSONB.

Default category set:
| Key | Default Label | Default Color |
|-----|--------------|---------------|
| `candidate` | Candidate | Blue |
| `opponent` | Opponent | Red |
| `issue` | Issue | Purple |
| `local` | Local | Teal |
| `lp_ecosystem` | LP Ecosystem | Gold |
| `race` | Race | Orange |

The 12 available palette colors (referenced by name in the DB, resolved to hex in the UI):
| Name | Hex |
|------|-----|
| blue | `#3b82f6` |
| indigo | `#6366f1` |
| purple | `#8b5cf6` |
| pink | `#ec4899` |
| red | `#ef4444` |
| orange | `#f97316` |
| amber | `#f59e0b` |
| yellow | `#eab308` |
| lime | `#84cc16` |
| green | `#22c55e` |
| teal | `#14b8a6` |
| cyan | `#06b6d4` |

Colors are stored by name (e.g. `"blue"`), never by hex. The hex values above are the single source of truth — defined once as a constant in the frontend code and the Python ingestion script never touches colors at all.

**Typography hierarchy on the feed:**
- Headline: `15px`, `font-weight: 600`, `color: rgb(var(--text-100))` — link that turns primary color on hover, no underline until hover
- Source + time: `12px`, `color: rgb(var(--text-300))`, same line, separated by ` · `
- Summary: `13px`, `color: rgb(var(--text-300))`, `line-height: 1.55`, max 3 lines, no truncation — let it breathe

**Article cards, not rows:**
Each article is a card (`background: rgb(var(--card-700))`, `border: 1px solid rgb(var(--border-600))`, `border-radius: 10px`, `padding: 16px 20px`). On hover: `border-color` shifts to `rgb(var(--border-500))` and `background` lightens very slightly (`rgba(255,255,255,0.02)` overlay). Transition `150ms ease`. No box-shadow — flat and clean.

**"Live" indicator for fresh articles:**
Any article with `surfaced_at` within the last 2 hours gets a small animated green dot (`width: 7px`, `height: 7px`, `border-radius: 50%`, `background: #22c55e`) with a `@keyframes pulse` ring expanding and fading. This is the single most impactful micro-interaction — it makes the feed feel alive.

**Score breakdown tooltip:**
Hovering the score badge shows a tiny tooltip: `Rule: 6.0 · AI: 9.2 → 8.0` — the three numbers that compose the final score. Makes the system feel transparent and trustworthy, not a black box.

**Skeleton loading:**
All data surfaces (widget, feed, admin table) show shimmer skeleton placeholders while loading — never a blank page or spinner alone. Skeleton cards match the shape of real content: a wide headline bar, two short bars for source/time, three lines for summary.

**Suppress animation:**
When an admin clicks Suppress, the article card slides up and fades out (`transform: translateY(-8px); opacity: 0; transition: 200ms ease`) before being removed from the DOM. Satisfying, not jarring.

**Flag state:**
The flag button (`🚩`) renders as a ghost icon button. On click: icon fills to full color, background gets a faint red tint (`rgba(239,68,68,0.1)`), tooltip changes to "Flagged for comms team." Click again to unflag. No page reload — optimistic update.

**Empty state personality:**
Use a centered layout with the 📡 emoji at `48px`, a bold one-liner, and a muted sub-line. Never a sad icon. Examples:
- Feed: *"No new intel since your last briefing."* / `Feeds are checked hourly — check back soon or lower your relevance threshold.`
- Widget: *"You're all caught up."* / No sub-line needed — confidence, not explanation.
- Admin (no feeds): *"No feeds configured yet."* / `Add a feed above to start ingesting articles.`

**Page header for `/crm/intel-brief`:**
```
📡 Intel Brief                              ⚙ Settings
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  14 stories briefed this week  ·  Last updated 12m ago
```
The stat line uses `rgb(var(--text-300))` for the labels, accent color for the numbers. "Last updated Xm ago" is computed from the most recent `surfaced_at` in the results. The gear icon links to `/crm/settings/intel-brief`.

**Sticky filter bar:**
The filter bar on the feed page is `position: sticky; top: 0; z-index: 10` with a `backdrop-filter: blur(8px)` background so content scrolls behind it cleanly. Filter pills are tab-style buttons — active state uses `background: rgb(var(--primary-600)); color: #fff`. The keyword search input is inline, right-aligned, expands on focus.

**Mobile:**
The article card layout is column-first. Score badge and category badge stack above the headline on small screens. The filter bar collapses to a single "Filters" button that opens a bottom drawer on mobile. Widget shows 3 articles max on mobile regardless of widget_count setting.

---

### 5.1 SuperAdmin Feed Management — `/crm/admin/intel-brief-feeds`

**File location:** `app/crm/admin/intel-brief-feeds/page.tsx`

This page lives inside the `/crm/admin/` route (same as the existing tenant management at `app/crm/admin/tenants/`). It should check `getCrmUser()` and redirect to `/crm` if not `isSuperAdmin`. It does NOT use the tenant-scoped Supabase client — it uses a plain service role client (no `X-Tenant-Id` header) to query global tables.

**Page layout:**

Top section — **Health Stats Bar** (4 stat cards in a row):
- Total articles ingested today (count from `news_articles` where `ingested_at >= today`)
- Active feeds count (where `status = 'active'`)
- Pending approval count (where `status = 'pending'`) — show in amber if count > 0
- Feeds with errors (where `last_fetch_error IS NOT NULL` and `last_fetched_at > 24hrs ago`)

**Section 1 — Pending Approval Queue** (only rendered if any feeds have `status = 'pending'`)

A visually distinct card with an amber left border to draw attention. Each pending row shows:
- Label and topic category badge
- Requesting tenant slug (from `requested_by_tenant`)
- Request note from the tenant admin (from `request_note`)
- Feed URL — shown as truncated text if present, or an amber "Awaiting URL" badge if null (tenant submitted the request before completing the Google Alerts step)
- Keywords array as small pills
- `created_at` timestamp
- Three action buttons: **Approve** (sets `status = 'active'`), **Edit & Approve** (opens edit modal pre-filled, saves as `active`), **Reject** (opens a small inline form to enter a `rejection_note`, then sets `status = 'rejected'`)

Rejected feeds disappear from the pending queue. SuperAdmin can view them in the main table by toggling the status filter.

**Section 2 — All Feeds Table**

Columns: Label | Topic Category | Status badge | Requested By | Articles Ingested | Last Fetched | Error indicator

Status badge colors: `active` → green | `pending` → amber | `paused` → gray | `rejected` → red

Default filter: show `active` and `paused` only. A status filter control to also show `pending` and `rejected`.

Actions per row (in a `...` menu):
- Edit (opens modal pre-filled with all fields)
- Pause / Activate toggle (only for `active` and `paused` feeds)
- Reject (only for `pending` feeds)
- Delete with confirmation (only for `rejected` or `paused` — prevent accidental deletion of active feeds)

**NO "Duplicate to tenant" button** — feeds are global, this function is not needed.

**"Add New Feed" button** — SuperAdmin direct creation modal. The form is dynamic based on the selected source type.

**Step 1 — Always visible fields:**
- Label (text input, required)
- Source Type (select, required) — selecting this changes what fields appear below:
  - `Google Alerts (RSS)` → show Feed URL field
  - `Talkwalker Alerts (RSS — includes Twitter/X)` → show Feed URL field
  - `Alertmouse (RSS — best signal quality, paid)` → show Feed URL field
  - `Google News (query-based, no setup required)` → show Search Query field
  - `GDELT (query-based, independent index, 15-min refresh)` → show Search Query field
- Topic Category (select): `candidate` | `opponent` | `issue` | `local` | `lp_ecosystem` | `race`
- Keywords (tag input, optional) — stored as `TEXT[]`, used for display/context, NOT as the search query

**Step 2a — If URL-based source selected:**
- Feed URL (text input, required)
- Helper link: "How do I get my feed URL? →" expands inline tip per provider
- Validation: URL must start with the correct prefix for the selected source

**Step 2b — If query-based source selected (google_news or gdelt):**
- Search Query (text input, required) — the query sent to the API
- Helper text below field: "Supports Boolean operators: AND, OR, NOT, quotes for phrases. Example: `\"Jessi Cowart\" OR \"Texas House District 15\" OR HD-15`"
- For GDELT: additional note "GDELT searches across an independent global news index updated every 15 minutes — great for catching local outlets Google misses"
- For Google News: additional note "Google News queries the same Google index as Google Alerts, but programmatically — no manual setup required"
- No feed URL needed — the script constructs API calls from the query automatically
- A **"Test Query →"** link that opens a preview in the GDELT DOC viewer or Google News for google_news, so SuperAdmin can verify results before saving

**Status defaults to `active`** on SuperAdmin direct creation — no approval step needed.

**Source badge:** Each feed row in the table shows a small color-coded provider badge:
- `G` (blue) = Google Alerts
- `TW` (purple) = Talkwalker
- `AM` (orange) = Alertmouse
- `GN` (green) = Google News
- `GDELT` (teal) = GDELT

**Style notes:**
- Health stat cards: same 4-up grid used in other CRM dashboards. Each card has a large number in accent color, small label below in muted text, and a subtle icon (e.g. 📥 for articles today, ✅ for active, ⏳ for pending, ⚠️ for errors). The pending card and error card conditionally use amber/red text when count > 0.
- Pending queue card: `border-left: 3px solid #d97706` (amber), slightly elevated background `rgb(var(--card-700))`. Each pending row is its own sub-card inside the queue card.
- Feed table rows: source badges (G / TW / AM / GN / GDELT) are rendered as tiny monospace pill badges — use the exact colors from the category badge system in section 5.0.
- The `...` actions menu per row uses the same pattern as other CRM tables — a `gg-btn-icon` button that opens a small dropdown positioned via `getBoundingClientRect()`.
- The "Add New Feed" modal is full-screen on mobile, centered 600px max-width on desktop. Form fields animate in/out as source type changes (fade + height transition, not instant swap).

---

### 5.2 Intel Brief Settings — `/crm/settings/intel-brief`

**File location:** `app/crm/settings/intel-brief/page.tsx`

**Auth:** Uses `getTenant()` and `getCrmUser()`. Redirect to `/crm` if `!crmUser.isAdmin`. Tenant is always scoped from the URL slug — do not add a tenant picker here. Only SuperAdmin sees a tenant picker on their own views.

**Page title:** "Intel Brief Settings"

**Upsert behavior:** On load, try to fetch `tenant_news_settings` for this tenant. If no row exists (new tenant), show defaults and create the row on first save.

**Page sections:**

**Section 1 — Keyword Profile**
- Heading: "Your Intelligence Keywords"
- Description text: "Intel Brief scores articles for relevance based on these terms. Add your candidate name, opponent name, district, key issues, and local geography. The more specific, the better your briefing."
- Tag-style input component — user types a keyword and hits Enter or comma to add it, X to remove
- Stored as `keywords TEXT[]` in `tenant_news_settings`
- Show a "Suggested keywords" helper panel (static, not dynamic yet) with placeholder suggestions grouped by: Candidate, Opponent, District/Local, Issues

**Section 2 — Briefing Display**
- "Minimum Relevance" — a slider from 4.0 to 9.0, step 0.5, default 6.5. Show the current value next to the slider. Below the slider, show helper text: "Articles below this relevance threshold won't appear in your briefing."
- "Intel Brief Widget — Stories to Show" — a segmented control or select: 3 | 5 | 7 (default 5)
- "Show Intel Brief to Field Users" — toggle (boolean), default true

**Section 3 — Source Blacklist**
- Heading: "Blacklisted Sources"
- Description: "Articles from these domains will never appear in your briefing."
- Same tag-style input as keywords but for domains
- Stored as `blacklisted_domains TEXT[]`

**Save button** — single `gg-btn-primary` at the bottom that upserts all three sections at once. Show a success toast: "Intel Brief settings saved." The button shows a brief loading spinner while saving, then snaps back to normal — never disable it for so long the user wonders if it worked.

**Keyword tag visual:** Each keyword renders as a dark pill: `background: rgba(255,255,255,0.06)`, `border: 1px solid rgb(var(--border-600))`, `border-radius: 6px`, `padding: 3px 10px`, `font-size: 13px`. An `×` button on the right removes it. Typing and hitting Enter or comma adds a new tag with a brief scale-in pop (`transform: scale(0.85) → scale(1)`, `100ms`). Tags wrap naturally — no horizontal scroll.

**Suggested keywords panel:** Rendered as a collapsible section (`▸ Suggested keywords` toggle). Inside: four labeled groups (`Candidate name`, `Opponent name`, `Geography`, `Key issues`) each with 2–3 clickable suggestion pills. Clicking a suggestion adds it to the keywords list immediately (same pop animation) and grays out the suggestion so the user knows it's been added. Suggestions are static placeholder text — future feature will generate them from the tenant's CRM data.

**Relevance slider:** The track has a subtle gradient — left end gray, right end green — so "higher threshold = more selective" is visually intuitive. Current value displayed as a colored badge next to the slider handle that moves with it.

**Field Users toggle:** Render as a proper iOS-style toggle switch (common in settings pages): rounded pill track, sliding circle, green when on. Label to the left, toggle to the right, aligned in a flex row.

**Section 4 — Category Management**
- Heading: "Intel Categories"
- Description: "Categories tag each article by topic. Customize the label and color for each category, or add your own."
- Each existing category renders as a row: `[color swatch] [label text input] [color picker button] [delete button]`
- The color picker button shows the current color as a filled circle. Clicking it opens an inline popover with the 12 palette swatches arranged in a 3×4 grid. Each swatch is a `32px` circle. Clicking one selects it, closes the popover, and updates the row's color swatch immediately. No hex input, no RGB sliders — just the 12 circles.
- An `+ Add Category` button below the list appends a new row with a blank label and blue as the default color.
- Category `key` is auto-derived from the label (lowercased, spaces → underscores) on save. Users never see or edit the key.
- Deleting a category: a confirmation inline (`"This will un-categorize articles tagged with this category. Remove it?"` with Confirm/Cancel) — not a modal, just an inline expand on the row.
- Categories are saved as part of the main save action (same save button as sections 1–3). No separate save per category.
- SuperAdmin note: the `topic_category` value on `alert_feeds` is set by SuperAdmin when creating/editing a feed. When a tenant renames a category key via settings, old articles tagged with the old key will no longer match — SuperAdmin should use stable key names. This constraint is documented in the admin feed form helper text.

**Section 5 — Request a New Intel Feed**

This section lets tenant admins request a new global feed without ever leaving the CRM. It is a two-step flow rendered as a single card.

**Step 1 — Describe the alert (always visible):**
- Label (text input, required) — e.g. "Brad Bailey — Property Tax Statements"
- Topic Category (select): `candidate` | `opponent` | `issue` | `local` | `lp_ecosystem` | `race`
- **Alert Source** (select, required):
  - `Google Alerts (Free)` — RSS, manual setup required
  - `Talkwalker Alerts (Free — includes Twitter/X)` — RSS, manual setup required
  - `Alertmouse (Paid — best signal quality)` — RSS, manual setup required
  - `Google News (Free — no setup required)` — query-based, simplest option
  - `GDELT (Free — catches local outlets Google misses)` — query-based, independent index
- Keywords (tag input, optional) — helps SuperAdmin understand the intent
- Request Note (textarea, optional) — "Why should this be added to Intel Brief?"
- A **"Continue →"** button

**Step 2 — Source-specific flow (shown after clicking "Continue →"):**

**If Google Alerts, Talkwalker, or Alertmouse selected:**

The CRM shows a pre-filled link for the chosen provider with step-by-step instructions to create the alert and copy back the feed URL (same as existing flow per provider). A Feed URL paste field appears. The tenant pastes the URL and submits.

**If Google News or GDELT selected (query-based):**

No external setup needed. The CRM shows:
- A **Search Query** text input — pre-filled from the label/keywords they entered in Step 1 as a starting suggestion they can edit
- Helper text: "Supports AND, OR, NOT, and quotes. Example: `\"Brad Bailey\" OR \"Bailey Texas House\"`"
- A **"Preview Results →"** button that opens a new tab showing live results from that provider for the query, so they can verify before submitting
- A **"Submit Request"** button — no feed URL needed

**For all source types on submit:**
- Inserts a row into `alert_feeds` with `status = 'pending'`, `requested_by_tenant = tenantId`, and all form data
- For URL-based: stores in `feed_url`, leaves `search_query` null
- For query-based: stores in `search_query`, leaves `feed_url` null
- Shows success: "Feed request submitted! A GuerrillaSuite admin will review and add it to Intel Brief shortly."
- Feed URL is optional at submit time for URL-based sources — tenant can submit without it if they haven't completed the provider step yet

**Pending requests list** — below the request form, show any existing pending or rejected feed requests from this tenant:
- Pending: show label, submitted date, and "Awaiting review" badge
- Rejected: show label, rejection note from SuperAdmin, and a "Resubmit" button that pre-fills the form

This gives the tenant admin full visibility into their Intel Brief feed requests without needing to contact SuperAdmin directly.

---

### 5.3 Intel Brief Feed — `/crm/intel-brief`

**File location:** `app/crm/intel-brief/page.tsx`

**Page title:** "Intel Brief" with a subtitle showing the article count stat.

**Auth:** Uses `getTenant()` and `getCrmUser()`. If `crmUser.isAdmin` is false AND `tenant_news_settings.news_feed_enabled_for_field` is false, redirect to `/crm`.

**Data query:** Join `tenant_article_relevance` with `news_articles` where `tenant_id = tenantId` and `final_score >= tenant.display_threshold` and `is_suppressed = false`. Do NOT filter on `is_notable` alone — `is_notable` was set at ingestion time and becomes stale if the tenant later changes their threshold. Always compare `final_score` directly against the current `display_threshold` from `tenant_news_settings`. Default sort: `final_score DESC`. Pagination: 25 per page.

**Filter controls (shown as a filter bar above the list):**
- Date range picker (last 24h | last 7 days | last 30 days | all time) — default: last 7 days
- Relevance filter (All | 7+ | 8+ | 9+) — label as "Relevance" not "Score"
- Topic category filter (All | candidate | opponent | issue | local | lp_ecosystem | race) — pulled from `alert_feeds.topic_category` via join
- Keyword search (searches `news_articles.headline` via Supabase ilike)

**Article list item — each row shows:**
- Relevance badge (colored pill): green for 8.0+, yellow/amber for 6.5–7.9
- Headline (as an external link, `target="_blank"`, `rel="noopener noreferrer"`)
- Source name / domain
- Time ago (use existing `timeAgo()` helper already in `page.tsx`)
- Topic category badge (small pill matching the feed's category)
- The `global_summary` from `news_articles` — shown as 2-3 lines of muted text below the headline
- Admin-only action buttons (hidden for field users):
  - 🚩 Flag — sets `is_flagged = true` on `tenant_article_relevance`, button turns active/highlighted state. Tooltip: "Flag for comms team"
  - 🚫 Suppress — sets `is_suppressed = true`, article disappears immediately (optimistic UI). Tooltip: "Remove from briefing"

**Page header stat:** "X stories briefed this week" — count of articles where `surfaced_at >= 7 days ago` and `final_score >= display_threshold` and `is_suppressed = false`.

**Article card layout (detailed):**
```
┌─────────────────────────────────────────────────────────────────┐
│ [8.4] candidate  ●  Texas Tribune  ·  2h ago              🚩 🚫 │  ← score badge | category badge | live dot if <2h | admin actions
│                                                                 │
│  Bailey criticized over property tax stance, says rival…        │  ← headline, 15px bold, links out
│                                                                 │
│  State Rep. Brad Bailey came under fire Tuesday after…          │  ← global_summary, 13px muted, 3 lines max
│  campaign rival Jessi Cowart called his…                        │
└─────────────────────────────────────────────────────────────────┘
```
Score badge and category badge sit on the same line as the source/time. Admin action buttons (🚩 flag, 🚫 suppress) are right-aligned on that same line — hidden for field users. All baseline-aligned.

**Pagination:** Simple `← Prev  Page 2 of 7  Next →` at the bottom. No complex page number grid — keep it minimal. Current page number centered, Prev/Next as ghost buttons.

**Empty state:** Centered, `📡` at 48px, bold "No new intel since your last briefing." below in `rgb(var(--text-100))`, then `font-size: 13px` muted line: "Feeds are checked hourly — or lower your relevance threshold in Settings." The word "Settings" is a link to `/crm/settings/intel-brief`.

---

### 5.4 Intel Brief Widget

**Where it lives:** Added to BOTH `AdminDashboard` and `FieldDashboard` components in `app/crm/page.tsx`.

**Widget label:** `📡 Intel Brief` — use the satellite dish emoji specifically. It signals "receiving intel" and fits the GuerrillaSuite military ops aesthetic perfectly. Never use 📰 (newspaper) — that's generic news, not intelligence.

**Data fetch:** Add to the existing `Promise.all` parallel fetch block in each dashboard function. Filter on `final_score` directly — do not use `is_notable` alone, as it becomes stale when the tenant changes their threshold.
```typescript
sb
  .from('tenant_article_relevance')
  .select('final_score, surfaced_at, article_id, news_articles(headline, url, source_name, global_summary)')
  .eq('tenant_id', tenantId)
  .gte('final_score', newsSettings?.display_threshold ?? 6.5)
  .eq('is_suppressed', false)
  .order('final_score', { ascending: false })
  .limit(newsSettings?.widget_count ?? 5)
```
`newsSettings` is the tenant's `tenant_news_settings` row, fetched in the same `Promise.all` batch.

**Widget card structure** (matches existing card style in `page.tsx`):
```
📡 Intel Brief                          Full Briefing →
────────────────────────────────────────────────────────
[9.1] Texas Tribune · 2h ago
      Libertarian candidate gains traction in HD-15...

[8.4] Houston Chronicle · 5h ago
      Bailey criticized over property tax stance...

[7.6] Woodlands Online · 1d ago
      HD-15 race draws three-way field as Cowart...
```

- Relevance badge is a small colored pill: green for 8.0+, amber for 6.5–7.9
- Headline is a link to the original article (`target="_blank"`)
- Source name and time ago on the same line, small muted text
- `global_summary` is NOT shown in the widget — headline only to keep it compact and scannable
- Link in top right reads **"Full Briefing →"** and goes to `/crm/intel-brief`

**Widget row layout (detailed):**
```
[9.1] Texas Tribune · 2h ago  ●
      Libertarian candidate gains traction in HD-15
```
Score badge left-aligned. Source name + time ago right of it on the same line. Live dot (●, green, 6px, pulsing) if article is < 2 hours old — same pulse animation as the feed page. Headline on the next line, slightly indented to align under source text. No summary in the widget — headline only. Headline is an external link. Subtle `border-bottom: 1px solid rgb(var(--border-600))` between rows, no border after the last row.

**Widget header row:**
```
📡 Intel Brief          Full Briefing →
```
`📡 Intel Brief` in `font-weight: 700`, `font-size: 14px`. `Full Briefing →` right-aligned as a small ghost link in `rgb(var(--primary-600))`, `font-size: 12px`. Both on the same flex row.

**Widget skeleton:** While `newsSettings` or articles are loading, show 3 skeleton rows: a short wide bar (score + source line) and a longer bar (headline). Shimmer animation. Never show an empty card.

**Empty state for widget:** `📡` at 24px inline, then `"You're all caught up."` — single line, `font-size: 13px`, `color: rgb(var(--text-300))`. No button, no sub-line. Confident silence.

**For field users:** Widget is always visible to all users within the tenant in V1. Per-user show/hide preference is a future feature.

**Widget placement in AdminDashboard:** After the pipeline funnel section, before the lists section — high-priority intel for an admin.

**Widget placement in FieldDashboard:** After the Quick Stats row, before My Lists — visible but not dominant.

**Widget count:** Use `tenant_news_settings.widget_count` (default 5). No per-user override in V1.

---

## 6. Seed Data — Alert Feeds for HD-15 / Jessi Cowart

**Initial tenants to enable `"news"` feature on:** `cowart4texas` and `fsm`.

**Seed keyword profiles** (written to `tenant_news_settings` at migration time):

`cowart4texas`:
```
["Jessi Cowart", "Texas House District 15", "HD-15", "Brad Bailey", "Moniqua Scott",
 "Montgomery County", "The Woodlands", "property tax", "civil asset forfeiture",
 "Defend the Guard", "ballot access", "Libertarian Party Texas", "Steve Toth"]
```

`fsm`:
```
["breaking news", "media industry", "journalism", "newsroom", "local news", "press freedom",
 "news organization", "broadcast", "media company", "camera", "RED camera", "Blackmagic",
 "Sony camera", "Arri", "broadcast equipment", "production company", "film equipment",
 "community activist", "small business owner", "entrepreneur", "grassroots", "underreported",
 "independent media", "citizen journalist", "polling", "poll results", "approval rating"]
```

**Note on URL-based feed setup:** Google Alerts, Talkwalker, and Alertmouse feeds require creating an alert on the provider's website first, then copying the RSS/Atom feed URL into the admin UI. Steps to create a Google Alert feed URL:
1. Go to https://www.google.com/alerts
2. Enter your search term (e.g. "Jessi Cowart")
3. Click "Show options" → set Delivery to "RSS feed"
4. Click "Create Alert" — Google gives you a feed URL starting with `https://www.google.com/alerts/feeds/...`
5. Copy that URL into the Feed URL field in `/crm/admin/intel-brief-feeds`

**Query-based feeds (google_news, gdelt) need no external setup** — enter the search query directly into the admin UI and the ingestion script handles the rest. These can be activated immediately after the feature is built.

The table below distinguishes which feeds can be activated immediately vs. which require alert creation first:

| Label | Source | Topic Category | Feed Input | Ready? |
|-------|--------|---------------|------------|--------|
| Jessi Cowart - Candidate | `google` | candidate | Google Alert feed URL for "Jessi Cowart" | Needs alert setup |
| Brad Bailey - Opponent | `google` | opponent | Google Alert feed URL for "Brad Bailey Texas" | Needs alert setup |
| Moniqua Scott - Opponent | `google` | opponent | Google Alert feed URL for "Moniqua Scott" | Needs alert setup |
| Steve Toth - Context | `google` | candidate | Google Alert feed URL for "Steve Toth" | Needs alert setup |
| LP Texas 2026 | `talkwalker` | lp_ecosystem | Talkwalker alert feed URL for "libertarian texas 2026" | Needs alert setup |
| Texas House District 15 - Race | `google_news` | race | `"Texas House District 15" OR "HD-15" OR "House District 15 Texas"` | ✅ Immediate |
| Montgomery County Politics | `google_news` | local | `"Montgomery County" AND (election OR politics OR candidate OR voting)` | ✅ Immediate |
| Libertarian Party Texas | `google_news` | lp_ecosystem | `"Libertarian Party Texas" OR "LP Texas" OR "Texas LP"` | ✅ Immediate |
| Texas Property Tax | `google_news` | issue | `"property tax" Texas elimination OR abolish OR reform 2026` | ✅ Immediate |
| Defend the Guard Texas | `google_news` | issue | `"Defend the Guard" Texas` | ✅ Immediate |
| Texas Overcriminalization | `google_news` | issue | `"criminal justice reform" Texas OR "overcriminalization" Texas` | ✅ Immediate |
| Texas Government Spending | `google_news` | issue | `"Texas budget" OR "Texas spending" OR "Texas fiscal" 2026` | ✅ Immediate |
| The Woodlands - Local | `gdelt` | local | `"The Woodlands" Texas politics` | ✅ Immediate |
| Civil Asset Forfeiture Texas | `gdelt` | issue | `"civil asset forfeiture" Texas` | ✅ Immediate |
| Texas Ballot Access | `gdelt` | lp_ecosystem | `"ballot access" Texas "third party" OR Libertarian` | ✅ Immediate |

---

## 7. File Structure Summary

New files to create:
```
app/
  crm/
    admin/
      intel-brief-feeds/
        page.tsx                  # SuperAdmin feed management (mirrors existing app/crm/admin/tenants/)
    intel-brief/
      page.tsx                    # Full Intel Brief feed
    settings/
      intel-brief/
        page.tsx                  # Intel Brief settings (mirrors existing app/crm/settings/dispatch/)

scripts/
  ingest_news.py                  # Python ingestion script

.github/
  workflows/
    ingest-news.yml               # GitHub Actions cron
```

Modified files:
```
app/crm/page.tsx                  # Add Intel Brief widget to AdminDashboard and FieldDashboard
app/components/crm/CrmHeader.tsx  # Add 📡 Intel Brief flat nav link (gated on hasNews)
lib/features.ts                   # Add "news" to ALL_FEATURE_KEYS, PLAN_FEATURES.war_chest, FEATURE_META
lib/tenant.ts                     # Add cowart4texas → f1a15d20-de55-48b6-abfe-22b557d6812b to HARDCODED_TENANTS
```

New Supabase tables (run as migrations):
```
alert_feeds                 -- global, RLS disabled
news_articles               -- global, RLS disabled
tenant_article_relevance    -- per-tenant, RLS enabled
tenant_news_settings        -- per-tenant, RLS enabled
```

---

## 8. Important Patterns to Follow

- **Always use `getTenant()` and `getCrmUser()`** for auth in `/crm/` routes — do not reinvent auth
- **Always use `makeSb(tenantId)`** for tenant-scoped queries within the CRM
- **For global tables** (`alert_feeds`, `news_articles`) accessed from the admin route, use a plain service role Supabase client without the `X-Tenant-Id` header
- **Match existing visual style** — use the `card`, `sectionLabel` CSS variable patterns from `page.tsx`. No new design systems.
- **The `timeAgo()` helper** is already defined in `page.tsx` — import or copy it for the news feed page
- **No form tags** — use onClick handlers and controlled state for all interactive elements
- **Dashboard fetches are all parallel** via `Promise.all` — add the news widget query to the existing batch, don't add a second waterfall fetch
- **Field user check** is `!crmUser.isAdmin` — field users are any non-admin, non-superadmin users
- **SuperAdmin check** is `crmUser.isSuperAdmin` — already used in `CrmHeader` and passed through layout
- **Feature gate check** is `hasFeature(tenant.features, "news")` (import from `@/lib/features`) — do this AFTER the auth check, redirect to `/crm` if false (unless `crmUser.isSuperAdmin`)
- **Always filter on `final_score >= display_threshold`** in UI queries — never rely solely on `is_notable`, which is a stale ingestion-time snapshot. Fetch `tenant_news_settings` first (in the same `Promise.all`), then use its `display_threshold` in the query.
- **`tenant_id` in DB tables is the UUID** (e.g. `f1a15d20-...`), not the slug. The ingestion script uses `tenant_news_settings.tenant_id` which stores the UUID.
- **Never add feature gate logic to the ingestion script** — gating is UI/route-only; the Python script is driven purely by which tenants have a `tenant_news_settings` row
- **Route naming** — all Intel Brief routes use `intel-brief` as the slug: `/crm/intel-brief`, `/crm/settings/intel-brief`, `/crm/admin/intel-brief-feeds`
- **CrmHeader nav link** — add `📡 Intel Brief` as a flat nav link in `CrmHeader.tsx`, gated on `hasNews`. Exact nav position doesn't need to be perfect — a full header reorganization is planned separately.
- **No per-user widget prefs in V1** — skip all `user_news_prefs` logic. Widget visibility and count come from `tenant_news_settings` only.
- **Widget label** — always `📡 Intel Brief` with the satellite dish emoji in the dashboard card header. Never "News," "Top News," or any other generic label.
- **Feed source types** — `google`, `talkwalker`, `alertmouse` are URL-based (use `feed_url`); `google_news` and `gdelt` are query-based (use `search_query`). The ingestion script branches on `feed_source` to determine fetch strategy. Never mix these up.
- **Trafilatura extraction** — always attempt extraction after upsert, before scoring. Never let extraction failure block the scoring pipeline. The `full_text_extracted` boolean is purely informational — scoring always has a fallback.
- **Scoring text precedence** — always use `full_text` over `raw_snippet` when available. The variable in the script should be named `scoring_text` to make this clear.
- **GDELT API** — no API key needed, no rate limit documentation, but be respectful: one call per active GDELT feed per run is fine. Do not loop or retry aggressively.

---

## 9. What NOT to Build (Explicitly Out of Scope)

- ❌ No "duplicate alert" function — feeds are global, duplication is unnecessary
- ❌ No per-tenant AI summary — `global_summary` only, per-tenant tailored summaries are a future Intel Brief feature
- ❌ No "why this matters to you" blurb — future feature when platform is profitable
- ❌ No tenant picker on the Intel Brief settings page — tenant admins are always scoped to their own slug
- ❌ No in-app alert creation — none of the three providers have a public API for this; the guided flow with the pre-filled link + feed URL paste is the correct and intentional solution
- ❌ No tenant-level feed activation — tenant admins can REQUEST feeds for Intel Brief, but only SuperAdmin can approve and activate them
- ❌ No email digest / "morning briefing" email — future Intel Brief feature
- ❌ No CSV export — future feature
