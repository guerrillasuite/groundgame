-- Migration: SitRep v2 — Jira+Calendar+Calendly expansion
-- Missions → type-level flag, custom stages, hierarchy, deps, comments, activity,
-- booking types, automations schema, multi-calendar (types + views + sharing)

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Type-level additions: stages, mission flag, kanban opt-in, roles, booking
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE sitrep_item_types
  ADD COLUMN IF NOT EXISTS stages          JSONB   NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS is_mission_type BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_in_kanban  BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS booking_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_roles    JSONB   NOT NULL DEFAULT '[]';

-- stages shape: [{ "slug":"open","name":"Open","color":"blue","is_terminal":false,"sort_order":0 }]
-- custom_roles shape: [{ "slug":"writer","name":"Writer","max":1 }]

-- Seed default stages for system types + enable missions on task
UPDATE sitrep_item_types SET
  stages = '[
    {"slug":"open","name":"Open","color":"blue","is_terminal":false,"sort_order":0},
    {"slug":"in_progress","name":"In Progress","color":"amber","is_terminal":false,"sort_order":1},
    {"slug":"done","name":"Done","color":"green","is_terminal":true,"sort_order":2},
    {"slug":"cancelled","name":"Cancelled","color":"slate","is_terminal":true,"sort_order":3}
  ]',
  is_mission_type = true
WHERE slug = 'task';

UPDATE sitrep_item_types SET
  stages = '[
    {"slug":"open","name":"Open","color":"violet","is_terminal":false,"sort_order":0},
    {"slug":"confirmed","name":"Confirmed","color":"blue","is_terminal":false,"sort_order":1},
    {"slug":"done","name":"Done","color":"green","is_terminal":true,"sort_order":2},
    {"slug":"cancelled","name":"Cancelled","color":"slate","is_terminal":true,"sort_order":3}
  ]'
WHERE slug IN ('event', 'meeting');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Hierarchy + personal items on sitrep_items
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE sitrep_items
  ADD COLUMN IF NOT EXISTS parent_item_id UUID REFERENCES sitrep_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS depth          INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS owner_user_id  UUID,
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_sitrep_items_parent
  ON sitrep_items(parent_item_id) WHERE parent_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sitrep_items_owner
  ON sitrep_items(owner_user_id) WHERE owner_user_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Migrate sitrep_missions → sitrep_items (reuse UUIDs so mission_id FKs resolve)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO sitrep_items (
  id, tenant_id, title, description, item_type, status,
  due_date, created_by, visibility, depth, created_at, updated_at
)
SELECT
  m.id,
  m.tenant_id,
  m.title,
  m.description,
  'task' AS item_type,
  CASE m.status
    WHEN 'planning'  THEN 'open'
    WHEN 'active'    THEN 'in_progress'
    WHEN 'complete'  THEN 'done'
    WHEN 'archived'  THEN 'cancelled'
    ELSE 'open'
  END AS status,
  m.due_date,
  m.created_by,
  COALESCE(m.visibility, 'team') AS visibility,
  0 AS depth,
  m.created_at,
  m.updated_at
FROM sitrep_missions m
ON CONFLICT (id) DO NOTHING;

-- Re-point mission children to parent_item_id and set depth = 1
UPDATE sitrep_items
SET
  parent_item_id = mission_id,
  depth          = 1
WHERE mission_id IS NOT NULL
  AND mission_id IN (SELECT id FROM sitrep_items);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Dependencies (canonical direction — no inverse rows)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sitrep_dependencies (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    TEXT NOT NULL,
  from_item_id UUID NOT NULL REFERENCES sitrep_items(id) ON DELETE CASCADE,
  to_item_id   UUID NOT NULL REFERENCES sitrep_items(id) ON DELETE CASCADE,
  dep_type     TEXT NOT NULL CHECK (dep_type IN ('blocks','precedes','follows','relates_to','duplicates')),
  lag_days     INTEGER DEFAULT 0,
  created_by   UUID,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, from_item_id, to_item_id, dep_type)
);

CREATE INDEX IF NOT EXISTS idx_sitrep_deps_from ON sitrep_dependencies(from_item_id);
CREATE INDEX IF NOT EXISTS idx_sitrep_deps_to   ON sitrep_dependencies(to_item_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Comments
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sitrep_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  TEXT NOT NULL,
  item_id    UUID NOT NULL REFERENCES sitrep_items(id) ON DELETE CASCADE,
  author_id  UUID NOT NULL,
  body       TEXT NOT NULL,
  edited_at  TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sitrep_comments_item ON sitrep_comments(item_id, created_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Activity log
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sitrep_activity (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  TEXT NOT NULL,
  item_id    UUID NOT NULL REFERENCES sitrep_items(id) ON DELETE CASCADE,
  actor_id   UUID,
  event_type TEXT NOT NULL,
  -- event_type values: created, status_changed, priority_changed, assigned,
  --   commented, due_changed, title_changed, parent_changed, dep_added, dep_removed
  old_value  TEXT,
  new_value  TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sitrep_activity_item ON sitrep_activity(item_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Booking types (Calendly rival — native Supabase)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sitrep_booking_types (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        TEXT NOT NULL,
  owner_id         UUID NOT NULL,
  title            TEXT NOT NULL,
  slug             TEXT NOT NULL,
  description      TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  buffer_before    INTEGER DEFAULT 0,
  buffer_after     INTEGER DEFAULT 0,
  available_days   INTEGER[] DEFAULT '{1,2,3,4,5}',
  available_start  TIME NOT NULL DEFAULT '09:00',
  available_end    TIME NOT NULL DEFAULT '17:00',
  timezone         TEXT NOT NULL DEFAULT 'America/New_York',
  intake_survey_id UUID,
  sitrep_item_type TEXT NOT NULL DEFAULT 'meeting',
  confirmation_msg TEXT,
  is_active        BOOLEAN DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_sitrep_booking_owner ON sitrep_booking_types(tenant_id, owner_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Automations (schema only — engine ships v2.5)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sitrep_automations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      TEXT NOT NULL,
  name           TEXT NOT NULL,
  trigger_type   TEXT NOT NULL,
  trigger_config JSONB NOT NULL DEFAULT '{}',
  action_type    TEXT NOT NULL,
  action_config  JSONB NOT NULL DEFAULT '{}',
  is_active      BOOLEAN DEFAULT true,
  created_by     UUID,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Multi-calendar: Types + Views (two-level model, user-scoped not tenant-scoped)
-- ─────────────────────────────────────────────────────────────────────────────

-- Level 1: Calendar TYPE — defines data sources + permission tier
CREATE TABLE IF NOT EXISTS user_calendar_types (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL,
  name          TEXT NOT NULL,
  color         TEXT NOT NULL DEFAULT 'blue',
  cal_type      TEXT NOT NULL CHECK (cal_type IN ('work','family','personal','custom')),
  -- sources: [{ "type": "tenant", "tenant_id": "xxx" }, { "type": "personal" }]
  sources       JSONB NOT NULL DEFAULT '[]',
  -- delegate_for: secretary mode — pull items for these user IDs too
  delegate_for  JSONB NOT NULL DEFAULT '[]',
  sort_order    INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_cal_types_owner ON user_calendar_types(owner_user_id);

-- Level 2: Calendar VIEW — named, shareable filter lens within a type
CREATE TABLE IF NOT EXISTS user_calendar_views (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_type_id UUID NOT NULL REFERENCES user_calendar_types(id) ON DELETE CASCADE,
  owner_user_id    UUID NOT NULL,
  name             TEXT NOT NULL,
  color            TEXT,
  -- filter_config: {
  --   "assignee_filter": "me" | "all" | ["user_id"],
  --   "show_viewer_items": true,
  --   "item_type_slugs": [],
  --   "stage_slugs": [],
  --   "show_terminal": false
  -- }
  filter_config    JSONB NOT NULL DEFAULT '{}',
  is_default       BOOLEAN DEFAULT false,
  sort_order       INTEGER DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_cal_views_type  ON user_calendar_views(calendar_type_id);
CREATE INDEX IF NOT EXISTS idx_user_cal_views_owner ON user_calendar_views(owner_user_id);

-- View sharing — viewer or editor access to a specific view
CREATE TABLE IF NOT EXISTS calendar_view_shares (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  view_id             UUID NOT NULL REFERENCES user_calendar_views(id) ON DELETE CASCADE,
  shared_with_user_id UUID NOT NULL,
  role                TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer','editor')),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (view_id, shared_with_user_id)
);

CREATE INDEX IF NOT EXISTS idx_cal_view_shares_user ON calendar_view_shares(shared_with_user_id);

-- View invites — invite any email (in-tenant or out) to a specific view
CREATE TABLE IF NOT EXISTS calendar_view_invites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  view_id     UUID NOT NULL REFERENCES user_calendar_views(id) ON DELETE CASCADE,
  invited_by  UUID NOT NULL,
  email       TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer','editor')),
  token       TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cal_view_invites_token ON calendar_view_invites(token);
CREATE INDEX IF NOT EXISTS idx_cal_view_invites_email ON calendar_view_invites(email);
