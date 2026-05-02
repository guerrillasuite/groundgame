-- Add conflict_item_types to booking types
-- NULL = no filter (all item types can conflict, preserves existing behaviour)
-- Array = only items of those types block booking slots
ALTER TABLE sitrep_booking_types
  ADD COLUMN IF NOT EXISTS conflict_item_types TEXT[];
