-- Add custom_fields JSONB column to opportunities
-- Stores arbitrary key/value pairs from form submissions that don't map to
-- a standard column — e.g. pickup address notes, dropoff notes, etc.
ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS custom_fields JSONB;

COMMENT ON COLUMN opportunities.custom_fields IS
  'Freeform key/value pairs from intake form submissions. Populated by crm_field
   mappings of the form "opportunities.custom_fields.<key>".';
