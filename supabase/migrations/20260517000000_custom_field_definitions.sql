-- Custom Field Definitions — foundation migration
-- Creates the custom_field_definitions table, adds missing custom data columns
-- to all record types, and adds GIN indexes for JSONB querying.

-- ── 1. Definitions table ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS custom_field_definitions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL,
  record_type       TEXT        NOT NULL,
  -- 'people' | 'companies' | 'households' | 'locations' | 'opportunities' | 'sitrep_items'

  -- Stable key — used as the JSONB property name. Never changes after creation.
  -- Format: cf_{abbrev}__{slugified_label}  e.g. 'cf_ppl__ask_amount'
  field_key         TEXT        NOT NULL,

  label             TEXT        NOT NULL,
  field_type        TEXT        NOT NULL DEFAULT 'text',
  -- 'text' | 'textarea' | 'number' | 'date' | 'boolean' | 'select' | 'multiselect'
  -- | 'email' | 'phone' | 'url'

  -- For select/multiselect: [{value: 'opt_slug', label: 'Option Label'}, ...]
  options           JSONB       NOT NULL DEFAULT '[]',

  -- People only: which contact_type keys show this field. [] = General (all people).
  contact_type_keys TEXT[]      NOT NULL DEFAULT '{}',

  -- Opportunities only: the pipeline type key this field belongs to.
  pipeline_type_key TEXT,

  -- SitRep items only: the item type this field belongs to.
  sitrep_type_id    UUID        REFERENCES sitrep_item_types(id) ON DELETE CASCADE,

  placeholder       TEXT,
  help_text         TEXT,
  required          BOOLEAN     NOT NULL DEFAULT false,
  sort_order        INTEGER     NOT NULL DEFAULT 0,
  is_archived       BOOLEAN     NOT NULL DEFAULT false,
  created_by        UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (tenant_id, record_type, field_key)
);

-- ── 2. Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_cfd_tenant_type
  ON custom_field_definitions(tenant_id, record_type);

CREATE INDEX IF NOT EXISTS idx_cfd_tenant_pipeline
  ON custom_field_definitions(tenant_id, pipeline_type_key)
  WHERE pipeline_type_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cfd_tenant_sitrep
  ON custom_field_definitions(tenant_id, sitrep_type_id)
  WHERE sitrep_type_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cfd_contact_types
  ON custom_field_definitions USING GIN(contact_type_keys)
  WHERE record_type = 'people';

-- ── 3. Storage columns (missing ones only) ────────────────────────────────────

-- tenant_people.custom_data already exists
-- tenant_companies.custom_data may or may not exist
ALTER TABLE tenant_companies ADD COLUMN IF NOT EXISTS custom_data   JSONB NOT NULL DEFAULT '{}';
ALTER TABLE households       ADD COLUMN IF NOT EXISTS custom_data   JSONB NOT NULL DEFAULT '{}';
ALTER TABLE locations        ADD COLUMN IF NOT EXISTS custom_data   JSONB NOT NULL DEFAULT '{}';
ALTER TABLE sitrep_items     ADD COLUMN IF NOT EXISTS custom_fields JSONB NOT NULL DEFAULT '{}';
-- opportunities.custom_fields already exists (20260516000000)

-- ── 4. GIN indexes on custom data columns ────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_tp_custom_data       ON tenant_people    USING GIN(custom_data);
CREATE INDEX IF NOT EXISTS idx_tc_custom_data       ON tenant_companies USING GIN(custom_data);
CREATE INDEX IF NOT EXISTS idx_opp_custom_fields    ON opportunities    USING GIN(custom_fields);
CREATE INDEX IF NOT EXISTS idx_hh_custom_data       ON households       USING GIN(custom_data);
CREATE INDEX IF NOT EXISTS idx_loc_custom_data      ON locations        USING GIN(custom_data);
CREATE INDEX IF NOT EXISTS idx_sitrep_custom_fields ON sitrep_items     USING GIN(custom_fields);
