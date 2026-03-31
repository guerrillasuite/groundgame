-- Make stops walklist columns nullable (quiz/tabling stops have no walklist)
ALTER TABLE stops ALTER COLUMN walklist_id DROP NOT NULL;
ALTER TABLE stops ALTER COLUMN walklist_item_id DROP NOT NULL;

-- Add website_url to surveys for post-quiz "Learn More" button
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS website_url TEXT;
