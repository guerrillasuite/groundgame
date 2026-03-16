-- Migration: Create survey tables in Supabase
-- Run this in the Supabase SQL Editor or via: supabase db push -p <your-db-password>

CREATE TABLE IF NOT EXISTS surveys (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  description TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  survey_id TEXT NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL,
  options JSONB,
  required BOOLEAN DEFAULT TRUE,
  order_index INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS responses (
  id BIGSERIAL PRIMARY KEY,
  crm_contact_id TEXT NOT NULL,
  survey_id TEXT NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  answer_value TEXT NOT NULL,
  answer_text TEXT,
  original_position INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS survey_sessions (
  id BIGSERIAL PRIMARY KEY,
  crm_contact_id TEXT NOT NULL,
  survey_id TEXT NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  last_question_answered TEXT,
  UNIQUE(crm_contact_id, survey_id)
);

CREATE INDEX IF NOT EXISTS idx_responses_contact ON responses(crm_contact_id);
CREATE INDEX IF NOT EXISTS idx_responses_survey ON responses(survey_id);
CREATE INDEX IF NOT EXISTS idx_responses_question ON responses(question_id);
CREATE INDEX IF NOT EXISTS idx_sessions_contact ON survey_sessions(crm_contact_id);
CREATE INDEX IF NOT EXISTS idx_surveys_tenant ON surveys(tenant_id);
