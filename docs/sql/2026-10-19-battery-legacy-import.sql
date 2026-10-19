BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE himoto.battery_contracts
  ADD COLUMN IF NOT EXISTS legacy_source_order_id bigint,
  ADD COLUMN IF NOT EXISTS legacy_paid_amount bigint NOT NULL DEFAULT 0 CHECK (legacy_paid_amount >= 0),
  ADD COLUMN IF NOT EXISTS legacy_deposit_amount bigint NOT NULL DEFAULT 0 CHECK (legacy_deposit_amount >= 0),
  ADD COLUMN IF NOT EXISTS legacy_source_payload jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS battery_contracts_legacy_source_unique
  ON himoto.battery_contracts(legacy_source_order_id) WHERE legacy_source_order_id IS NOT NULL;
COMMIT;
