-- ============================================================
-- Index Optimizations
-- ============================================================
-- Findings:
--   1. pg_trgm not installed → all ILIKE %q% searches are full seq scans on 200K-row tables
--   2. people.household_id not indexed → 200K-row full scan on every household join
--   3. walklist_items.person_id not indexed → person detail page join unindexed
--   4. stops missing (tenant_id, stop_at) composite → stops list sort is post-filter
--   5. opportunities missing (tenant_id, stage) composite → kanban filter is post-scan
--   6. walklist_assignments pkey is (walklist_id, user_id) → user-first lookup unindexed
--   7. questions.survey_id not indexed → FK with no supporting index
--   8. 4 duplicate indexes confirmed → wasting write overhead
-- ============================================================

-- ── 1. Trigram extension + GIN indexes for ILIKE search ─────────────────────

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- People name search (202K rows) — covers first_name.ilike.%q% and last_name.ilike.%q%
CREATE INDEX IF NOT EXISTS idx_people_first_name_trgm
  ON public.people USING gin (first_name gin_trgm_ops)
  WHERE first_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_people_last_name_trgm
  ON public.people USING gin (last_name gin_trgm_ops)
  WHERE last_name IS NOT NULL;

-- Household name search (201K rows) — covers households/search ilike on name
CREATE INDEX IF NOT EXISTS idx_households_name_trgm
  ON public.households USING gin (name gin_trgm_ops)
  WHERE name IS NOT NULL;

-- Location address/city/postal search (204K rows) — covers locations/search OR ilike
CREATE INDEX IF NOT EXISTS idx_locations_address_trgm
  ON public.locations USING gin (address_line1 gin_trgm_ops)
  WHERE address_line1 IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_locations_city_trgm
  ON public.locations USING gin (city gin_trgm_ops)
  WHERE city IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_locations_postal_code_trgm
  ON public.locations USING gin (postal_code gin_trgm_ops)
  WHERE postal_code IS NOT NULL;

-- Company search — name and industry ilike
CREATE INDEX IF NOT EXISTS idx_companies_name_trgm
  ON public.companies USING gin (name gin_trgm_ops)
  WHERE name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_companies_industry_trgm
  ON public.companies USING gin (industry gin_trgm_ops)
  WHERE industry IS NOT NULL;

-- ── 2. Missing btree indexes ─────────────────────────────────────────────────

-- people.household_id: used in import dedup (.in(household_id, chunk)), household
-- detail page (.eq(household_id, hhId)), and search route household-to-person resolution
CREATE INDEX IF NOT EXISTS idx_people_household_id
  ON public.people (household_id)
  WHERE household_id IS NOT NULL;

-- walklist_items.person_id: people detail page fetches walklist memberships by person
CREATE INDEX IF NOT EXISTS idx_wli_person
  ON public.walklist_items (person_id)
  WHERE person_id IS NOT NULL;

-- walklist_items.location_id: walklist build resolution
CREATE INDEX IF NOT EXISTS idx_wli_location_id
  ON public.walklist_items (location_id)
  WHERE location_id IS NOT NULL;

-- stops: (tenant_id, stop_at DESC) composite for the stops list page
-- query: .eq(tenant_id).order(stop_at, desc).limit(200)
CREATE INDEX IF NOT EXISTS idx_stops_tenant_stop_at
  ON public.stops (tenant_id, stop_at DESC);

-- opportunities: (tenant_id, stage) composite for kanban board
-- query: .eq(tenant_id).in(stage, stageKeys)
CREATE INDEX IF NOT EXISTS idx_opp_tenant_stage
  ON public.opportunities (tenant_id, stage)
  WHERE stage IS NOT NULL;

-- walklist_assignments: pkey is (walklist_id, user_id) so user-first lookup is slow
-- query: .eq(user_id, userId).eq(tenant_id, tenantId)
CREATE INDEX IF NOT EXISTS idx_walklist_asgn_user_tenant
  ON public.walklist_assignments (user_id, tenant_id);

-- questions.survey_id: FK with no supporting index; fetched with .eq(survey_id).order(order_index)
CREATE INDEX IF NOT EXISTS idx_questions_survey_order
  ON public.questions (survey_id, order_index);

-- ── 3. Drop confirmed duplicate indexes ──────────────────────────────────────

-- households: households_location_id_idx and idx_households_loc are both btree(location_id)
DROP INDEX IF EXISTS public.households_location_id_idx;

-- locations: idx_locations_geom and locations_geom_gix are both gist(geom)
DROP INDEX IF EXISTS public.locations_geom_gix;

-- stops: idx_stops_tenant and stops_tenant_idx are both btree(tenant_id)
DROP INDEX IF EXISTS public.stops_tenant_idx;

-- tenants: tenants_slug_key backs a UNIQUE constraint; tenants_slug_uq is an
-- equivalent standalone unique index that still enforces the same constraint.
-- Must use ALTER TABLE DROP CONSTRAINT (not DROP INDEX) to remove the constraint-backed one.
ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_slug_key;
