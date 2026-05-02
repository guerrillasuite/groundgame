-- Add conflict_item_types to booking types
-- NULL = no filter (all item types can conflict, preserves existing behaviour)
-- Array = only items of those types block booking slots
ALTER TABLE sitrep_booking_types
  ADD COLUMN IF NOT EXISTS conflict_item_types TEXT[];

-- Add created_by_id to allow directors to create booking pages on behalf of other users
-- owner_id = whose availability is checked; created_by_id = who manages the page
ALTER TABLE sitrep_booking_types
  ADD COLUMN IF NOT EXISTS created_by_id UUID;

-- Back-fill: existing booking types were created by their owner
UPDATE sitrep_booking_types
  SET created_by_id = owner_id
  WHERE created_by_id IS NULL;
