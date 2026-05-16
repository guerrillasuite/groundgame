-- ─────────────────────────────────────────────────────────────────────────────
-- Schema fixes: missing columns that caused silent failures in panel-submit
-- and the automation engine.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Human-readable name/label for a location (e.g. "Airport Terminal 2")
--    Used by opportunity_locations display and automation {{pickup_location}} var.
ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- 2. Tag mapping columns on questions
--    May already exist (added manually) — IF NOT EXISTS is safe either way.
ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS tag_mapping_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tag_prefix TEXT;

-- 3. Unique constraint on opportunity_locations so upsert ON CONFLICT works.
--    Skip if it already exists.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'opportunity_locations_tenant_opp_role_key'
      AND conrelid = 'opportunity_locations'::regclass
  ) THEN
    -- Only add if no existing duplicate rows would violate it
    IF (
      SELECT COUNT(*) FROM (
        SELECT tenant_id, opportunity_id, role, COUNT(*)
        FROM opportunity_locations
        GROUP BY tenant_id, opportunity_id, role
        HAVING COUNT(*) > 1
      ) dupes
    ) = 0 THEN
      ALTER TABLE opportunity_locations
        ADD CONSTRAINT opportunity_locations_tenant_opp_role_key
        UNIQUE (tenant_id, opportunity_id, role);
    END IF;
  END IF;
END $$;
