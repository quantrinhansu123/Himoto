BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE himoto.management_contract_notifications
  ADD COLUMN IF NOT EXISTS delivery_review jsonb NOT NULL DEFAULT '[]'::jsonb;
GRANT UPDATE(status,error_code,delivery_review) ON himoto.management_contract_notifications TO himoto_scoped;
COMMIT;
