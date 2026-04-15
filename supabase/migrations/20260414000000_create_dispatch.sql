-- Migration: Create Dispatch (bulk email) tables
-- Feature: crm_dispatch — WarChest tier

-- ─────────────────────────────────────────────────────────────────────────────
-- email_campaigns
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_campaigns (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               TEXT NOT NULL,
  name                    TEXT NOT NULL,           -- Internal campaign name
  subject                 TEXT NOT NULL,
  preview_text            TEXT,                    -- Inbox preheader text
  from_name               TEXT NOT NULL,
  from_email              TEXT NOT NULL,
  reply_to                TEXT,
  design_json             JSONB NOT NULL DEFAULT '{}',   -- Unlayer JSON — for re-editing
  html_body               TEXT NOT NULL DEFAULT '',      -- Rendered HTML — sent via Resend
  status                  TEXT NOT NULL DEFAULT 'draft',
    -- 'draft' | 'scheduled' | 'sending' | 'sent' | 'cancelled'
  audience_type           TEXT NOT NULL DEFAULT 'segment',
    -- 'segment' | 'list'
  audience_segment_filters JSONB,                 -- Filter config when audience_type = 'segment'
  audience_list_id        UUID REFERENCES walklists(id) ON DELETE SET NULL,
  audience_count          INTEGER,                -- Resolved recipient count at send time
  scheduled_at            TIMESTAMPTZ,
  sent_at                 TIMESTAMPTZ,
  created_by              UUID,                   -- auth.users id
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_campaigns_tenant
  ON email_campaigns (tenant_id, status);

-- ─────────────────────────────────────────────────────────────────────────────
-- email_sends  (one row per recipient per campaign)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_sends (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id         UUID NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
  tenant_id           TEXT NOT NULL,
  person_id           UUID NOT NULL,              -- FK into people table
  email_address       TEXT NOT NULL,              -- Captured at send time
  resend_message_id   TEXT,                       -- Resend's message ID
  status              TEXT NOT NULL DEFAULT 'queued',
    -- 'queued' | 'sent' | 'bounced' | 'failed'
  bounced_at          TIMESTAMPTZ,
  bounce_type         TEXT,                       -- 'hard' | 'soft'
  bounce_reason       TEXT,
  sent_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_sends_campaign
  ON email_sends (campaign_id);

CREATE INDEX IF NOT EXISTS idx_email_sends_person
  ON email_sends (person_id);

CREATE INDEX IF NOT EXISTS idx_email_sends_resend_id
  ON email_sends (resend_message_id) WHERE resend_message_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- email_clicks  (one row per click event)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_clicks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     UUID NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
  send_id         UUID NOT NULL REFERENCES email_sends(id) ON DELETE CASCADE,
  person_id       UUID NOT NULL,
  tenant_id       TEXT NOT NULL,
  original_url    TEXT NOT NULL,
  clicked_at      TIMESTAMPTZ DEFAULT NOW(),
  user_agent      TEXT,
  ip_address      TEXT
);

CREATE INDEX IF NOT EXISTS idx_email_clicks_campaign
  ON email_clicks (campaign_id);

CREATE INDEX IF NOT EXISTS idx_email_clicks_send
  ON email_clicks (send_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- email_unsubscribes  (global suppression list per tenant)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_unsubscribes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           TEXT NOT NULL,
  person_id           UUID,                       -- NULL if no person record exists
  email_address       TEXT NOT NULL,
  campaign_id         UUID REFERENCES email_campaigns(id) ON DELETE SET NULL,
  unsubscribed_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, email_address)
);

CREATE INDEX IF NOT EXISTS idx_email_unsubscribes_tenant
  ON email_unsubscribes (tenant_id, email_address);

-- ─────────────────────────────────────────────────────────────────────────────
-- email_sending_domains  (per-tenant verified sending domains)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_sending_domains (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       TEXT NOT NULL,
  domain          TEXT NOT NULL,                  -- e.g. "mail.cowartforhouston.com"
  resend_domain_id TEXT,                          -- Resend's domain ID for API calls
  dns_records     JSONB,                          -- DNS records required (stored for display)
  verified        BOOLEAN DEFAULT false,
  verified_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, domain)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- webhook_dedup  (svix-id deduplication for Resend webhooks)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS webhook_dedup (
  svix_id     TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-expire dedup entries after 7 days to keep the table small.
-- Resend retries within 3 days, so 7 days is a safe window.
CREATE INDEX IF NOT EXISTS idx_webhook_dedup_processed
  ON webhook_dedup (processed_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS: all tables use tenant_id header isolation (service role bypasses)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE email_campaigns      ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_sends          ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_clicks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_unsubscribes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_sending_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON email_campaigns
  USING (tenant_id = current_setting('request.headers')::json->>'x-tenant-id');

CREATE POLICY "tenant_isolation" ON email_sends
  USING (tenant_id = current_setting('request.headers')::json->>'x-tenant-id');

CREATE POLICY "tenant_isolation" ON email_clicks
  USING (tenant_id = current_setting('request.headers')::json->>'x-tenant-id');

CREATE POLICY "tenant_isolation" ON email_unsubscribes
  USING (tenant_id = current_setting('request.headers')::json->>'x-tenant-id');

CREATE POLICY "tenant_isolation" ON email_sending_domains
  USING (tenant_id = current_setting('request.headers')::json->>'x-tenant-id');
