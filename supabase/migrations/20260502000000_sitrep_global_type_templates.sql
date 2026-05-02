-- Migration: SitRep Global Type Templates
-- Stores the default item type definitions that are seeded to every new tenant.
-- Managed via /admin in sitrep-pwa (SuperAdmin only).

CREATE TABLE IF NOT EXISTS sitrep_global_type_templates (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT        NOT NULL,
  slug             TEXT        NOT NULL UNIQUE,
  color            TEXT        NOT NULL DEFAULT 'blue',
  icon             TEXT,
  is_mission_type  BOOLEAN     NOT NULL DEFAULT false,
  show_in_kanban   BOOLEAN     NOT NULL DEFAULT true,
  booking_enabled  BOOLEAN     NOT NULL DEFAULT false,
  stages           JSONB       NOT NULL DEFAULT '[]',
  sort_order       INTEGER     NOT NULL DEFAULT 0,
  is_active        BOOLEAN     NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the three system defaults that were previously hardcoded in types/route.ts
INSERT INTO sitrep_global_type_templates (name, slug, color, is_mission_type, show_in_kanban, booking_enabled, stages, sort_order)
VALUES
  (
    'Task', 'task', 'blue', true, true, false,
    '[
      {"slug":"open",        "name":"Open",        "color":"blue",  "is_terminal":false,"sort_order":0},
      {"slug":"in_progress", "name":"In Progress", "color":"amber", "is_terminal":false,"sort_order":1},
      {"slug":"done",        "name":"Done",        "color":"green", "is_terminal":true, "sort_order":2},
      {"slug":"cancelled",   "name":"Cancelled",   "color":"slate", "is_terminal":true, "sort_order":3}
    ]',
    0
  ),
  (
    'Event', 'event', 'violet', false, true, false,
    '[
      {"slug":"open",      "name":"Open",      "color":"violet","is_terminal":false,"sort_order":0},
      {"slug":"confirmed", "name":"Confirmed", "color":"blue",  "is_terminal":false,"sort_order":1},
      {"slug":"done",      "name":"Done",      "color":"green", "is_terminal":true, "sort_order":2},
      {"slug":"cancelled", "name":"Cancelled", "color":"slate", "is_terminal":true, "sort_order":3}
    ]',
    1
  ),
  (
    'Meeting', 'meeting', 'teal', false, true, false,
    '[
      {"slug":"open",      "name":"Open",      "color":"teal",  "is_terminal":false,"sort_order":0},
      {"slug":"confirmed", "name":"Confirmed", "color":"blue",  "is_terminal":false,"sort_order":1},
      {"slug":"done",      "name":"Done",      "color":"green", "is_terminal":true, "sort_order":2},
      {"slug":"cancelled", "name":"Cancelled", "color":"slate", "is_terminal":true, "sort_order":3}
    ]',
    2
  )
ON CONFLICT (slug) DO NOTHING;

-- Index for active-only queries
CREATE INDEX IF NOT EXISTS idx_sgtt_active ON sitrep_global_type_templates(is_active) WHERE is_active = true;
