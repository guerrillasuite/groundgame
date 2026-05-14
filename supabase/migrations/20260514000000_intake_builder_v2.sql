-- ─────────────────────────────────────────────────────────────────────────────
-- Intake Builder V2: new columns for form_type, status, and builder settings
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. form_type — tracks which Intake type created this survey
--    Existing surveys default to 'custom' so nothing changes for them.
ALTER TABLE surveys
  ADD COLUMN IF NOT EXISTS form_type TEXT NOT NULL DEFAULT 'custom';

COMMENT ON COLUMN surveys.form_type IS
  'Intake type: person | company | opportunity | event | survey | custom | wspq';

-- 2. status — replaces the implicit active/active_channels "is published" signal
--    We add with DEFAULT ''live'' so all existing rows are instantly live.
--    Then flip the default to ''draft'' so new surveys start unpublished.
ALTER TABLE surveys
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'live';

-- Mark surveys with no active channels as draft (inactive surveys).
-- active = FALSE means the admin had deactivated it; keep as draft.
UPDATE surveys
  SET status = 'draft'
  WHERE status = 'live'
    AND (active = FALSE OR active IS NULL)
    AND (active_channels IS NULL OR active_channels::text = '[]' OR active_channels::text = 'null');

-- From now on, new surveys default to draft.
ALTER TABLE surveys ALTER COLUMN status SET DEFAULT 'draft';

COMMENT ON COLUMN surveys.status IS
  'Publication state: draft (not publicly accessible) | live | closed';

-- 3. Builder appearance / UX settings
ALTER TABLE surveys
  ADD COLUMN IF NOT EXISTS button_label            TEXT,
  ADD COLUMN IF NOT EXISTS logo_display_enabled    BOOLEAN NOT NULL DEFAULT TRUE;

-- 4. Notification settings
ALTER TABLE surveys
  ADD COLUMN IF NOT EXISTS staff_notification_emails                  TEXT[],
  ADD COLUMN IF NOT EXISTS respondent_confirmation_email_enabled      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS respondent_confirmation_email_subject      TEXT;

-- 5. Submission control
ALTER TABLE surveys
  ADD COLUMN IF NOT EXISTS allow_multiple_submissions BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS require_contact_id_url     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS submission_limit           INTEGER,
  ADD COLUMN IF NOT EXISTS expiration_at              TIMESTAMPTZ;

COMMENT ON COLUMN surveys.submission_limit IS
  'Max total submissions. NULL = unlimited.';

-- 6. Access control
ALTER TABLE surveys
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

COMMENT ON COLUMN surveys.password_hash IS
  'bcrypt hash of access password. NULL = no password required.';

-- 7. Post-submission behaviour
ALTER TABLE surveys
  ADD COLUMN IF NOT EXISTS post_submission_redirect_url   TEXT,
  ADD COLUMN IF NOT EXISTS show_results_after_submission  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS results_display_mode           TEXT NOT NULL DEFAULT 'none';

COMMENT ON COLUMN surveys.post_submission_redirect_url IS
  'If set, redirect respondent here instead of showing the thank-you message.
   Distinct from post_submit_survey_id (which chains to another form).';

COMMENT ON COLUMN surveys.results_display_mode IS
  'How to show results post-submission when show_results_after_submission=true.
   Values: none | count | aggregate | your_response';

-- 8. Webhook
ALTER TABLE surveys
  ADD COLUMN IF NOT EXISTS webhook_url TEXT;

COMMENT ON COLUMN surveys.webhook_url IS
  'POST this URL with session data on every completed submission. Fire-and-forget.';
