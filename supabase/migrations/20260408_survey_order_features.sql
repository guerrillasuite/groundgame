-- ─────────────────────────────────────────────────────────────────────────────
-- Survey Order Features: conditional questions, storefront channel, delivery
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Conditional display logic on questions
ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS conditions JSONB DEFAULT NULL;

COMMENT ON COLUMN questions.conditions IS
  'Per-question conditional display logic. NULL = always visible.
   Shape: { "show_if": { "question_id": TEXT, "operator": "equals|not_equals|contains", "value": TEXT } }';

-- 2. Storefront channel support on surveys
ALTER TABLE surveys
  ADD COLUMN IF NOT EXISTS storefront_mode TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS delivery_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS order_products JSONB DEFAULT NULL;

COMMENT ON COLUMN surveys.storefront_mode IS
  'Storefront form mode. NULL = not a storefront form. Values: ''take_order''';

COMMENT ON COLUMN surveys.delivery_enabled IS
  'When true, SurveyPanel injects a Pickup/Delivery toggle before the submit button.
   Delivery selection makes address fields visible and required.';

COMMENT ON COLUMN surveys.order_products IS
  'Curated product IDs for product_picker questions. NULL = all active products.
   Shape: ["product-id-1", "product-id-2"]';

-- 3. crm_field column is already TEXT — no structural change needed.
--    New application-level convention: "table.column" namespace (e.g. "people.first_name").
--    Legacy bare values (e.g. "first_name") are treated as "people.*" at runtime.
COMMENT ON COLUMN questions.crm_field IS
  'Namespaced CRM field: "table.column" (e.g. "people.first_name", "locations.city").
   Legacy bare values like "first_name" are treated as "people.first_name" for backward compat.';
