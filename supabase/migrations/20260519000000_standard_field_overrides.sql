CREATE TABLE IF NOT EXISTS standard_field_overrides (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  record_type TEXT NOT NULL CHECK (record_type IN ('people','companies','households','locations')),
  field_key   TEXT NOT NULL,
  custom_label TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, record_type, field_key)
);
CREATE INDEX IF NOT EXISTS idx_standard_field_overrides_lookup
  ON standard_field_overrides(tenant_id, record_type);
