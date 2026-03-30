-- Migration: Create reminders table
-- Run in the Supabase SQL Editor or via: supabase db push -p <your-db-password>

CREATE TABLE IF NOT EXISTS reminders (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             TEXT NOT NULL,
  type                  TEXT NOT NULL DEFAULT 'custom',
    -- 'callback' | 'return_visit' | 'opportunity_follow_up' | 'opportunity_stale' | 'custom'
  title                 TEXT NOT NULL,
  notes                 TEXT,
  due_at                TIMESTAMPTZ NOT NULL,
  status                TEXT NOT NULL DEFAULT 'pending',
    -- 'pending' | 'sent' | 'cancelled'
  sent_at               TIMESTAMPTZ,
  -- Assignment
  assigned_to_user_id   UUID,
  created_by_user_id    UUID,
  -- Linked records (all nullable — at least one should be set in practice)
  person_id             TEXT,
  household_id          TEXT,
  opportunity_id        UUID,
  stop_id               UUID,
  walklist_item_id      UUID,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reminders_tenant_status_due
  ON reminders (tenant_id, status, due_at);

CREATE INDEX IF NOT EXISTS idx_reminders_assigned_status
  ON reminders (assigned_to_user_id, status);

CREATE INDEX IF NOT EXISTS idx_reminders_opportunity
  ON reminders (opportunity_id) WHERE opportunity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reminders_person
  ON reminders (person_id) WHERE person_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reminders_household
  ON reminders (household_id) WHERE household_id IS NOT NULL;

-- Enable RLS
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policy (matches pattern used in the rest of the app)
CREATE POLICY "tenant_isolation" ON reminders
  USING (tenant_id = current_setting('request.headers')::json->>'x-tenant-id');
