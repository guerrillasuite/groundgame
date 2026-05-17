ALTER TABLE standard_field_overrides
  ADD COLUMN IF NOT EXISTS scope_key TEXT NOT NULL DEFAULT '';

ALTER TABLE standard_field_overrides
  DROP CONSTRAINT IF EXISTS standard_field_overrides_tenant_id_record_type_field_key_key;

ALTER TABLE standard_field_overrides
  ADD CONSTRAINT standard_field_overrides_scope_unique
  UNIQUE(tenant_id, record_type, field_key, scope_key);
