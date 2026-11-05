-- REVIEW ONLY. Do not apply automatically. After mobile-writes.sql.
-- Global catalogues use real text primary keys; numeric financial receipts stay unchanged.
BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE himoto.management_mobile_requests
  ADD COLUMN IF NOT EXISTS resource_key varchar(160);
COMMENT ON COLUMN himoto.management_mobile_requests.resource_key IS
  'Actual text resource ID for typed mobile receipts. NULL for numeric receipts and cancelled/pending requests.';
COMMIT;
