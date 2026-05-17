-- Add display_scope to custom field definitions
-- snapshot = shown in both the bottom sheet summary card AND full detail view
-- detail   = shown only in the expanded detail view (default)
ALTER TABLE custom_field_definitions
  ADD COLUMN IF NOT EXISTS display_scope TEXT DEFAULT 'detail'
    CHECK (display_scope IN ('snapshot', 'detail'));

CREATE INDEX IF NOT EXISTS idx_cfd_display_scope
  ON custom_field_definitions(tenant_id, record_type, display_scope);

-- Add display_scope to standard field overrides
-- snapshot = shown everywhere (default for standard fields)
-- detail   = shown only in the expanded detail view
ALTER TABLE standard_field_overrides
  ADD COLUMN IF NOT EXISTS display_scope TEXT DEFAULT 'snapshot'
    CHECK (display_scope IN ('snapshot', 'detail'));
