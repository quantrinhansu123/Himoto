BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE himoto.battery_contracts
  ADD COLUMN IF NOT EXISTS vehicle_contract_id bigint REFERENCES himoto.orders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS battery_contracts_vehicle_contract
  ON himoto.battery_contracts(vehicle_contract_id) WHERE deleted_at IS NULL AND vehicle_contract_id IS NOT NULL;
COMMIT;
