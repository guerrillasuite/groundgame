-- ─────────────────────────────────────────────────────────────────────────────
-- SitRep Automations v1
-- Extends the schema-only placeholder created in 20260501000000_sitrep_v2.sql
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE sitrep_automations
  ADD COLUMN IF NOT EXISTS conditions   JSONB        NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ  DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS last_run_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS run_count    INTEGER      DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_sitrep_automations_lookup
  ON sitrep_automations(tenant_id, is_active, trigger_type);

-- Execution log: per-run audit trail and cron dedup
CREATE TABLE IF NOT EXISTS sitrep_automation_runs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id UUID        NOT NULL REFERENCES sitrep_automations(id) ON DELETE CASCADE,
  item_id       UUID,       -- triggering sitrep_item id (null for CRM/scheduled triggers)
  record_id     UUID,       -- triggering CRM record id (opportunity, person, etc.)
  trigger_data  JSONB,      -- snapshot of what triggered it
  status        TEXT        NOT NULL CHECK (status IN ('success', 'error', 'skipped')),
  error_msg     TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_runs_lookup
  ON sitrep_automation_runs(automation_id, created_at DESC);

-- Used for cron dedup: "did this automation already fire for this item today?"
CREATE INDEX IF NOT EXISTS idx_automation_runs_dedup
  ON sitrep_automation_runs(automation_id, item_id, created_at DESC);
