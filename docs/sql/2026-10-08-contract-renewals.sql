BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE himoto.management_contract_payments ADD COLUMN IF NOT EXISTS renewal_payload jsonb;
COMMIT;
