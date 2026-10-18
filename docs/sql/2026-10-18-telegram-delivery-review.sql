BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE himoto.management_contract_notifications
  ADD COLUMN IF NOT EXISTS delivery_review jsonb NOT NULL DEFAULT '[]'::jsonb;
COMMIT;
