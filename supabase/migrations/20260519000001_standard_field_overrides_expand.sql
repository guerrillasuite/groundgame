ALTER TABLE standard_field_overrides
  DROP CONSTRAINT IF EXISTS standard_field_overrides_record_type_check;
ALTER TABLE standard_field_overrides
  ADD CONSTRAINT standard_field_overrides_record_type_check
  CHECK (record_type IN ('people','companies','households','locations','opportunities','sitrep_items'));
