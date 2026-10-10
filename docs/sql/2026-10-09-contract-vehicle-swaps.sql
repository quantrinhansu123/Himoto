BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS himoto.management_contract_vehicle_swaps (
  id bigserial PRIMARY KEY,
  order_id bigint NOT NULL REFERENCES himoto.orders(id),
  order_item_id bigint NOT NULL REFERENCES himoto.order_vehicle_details(id),
  from_vehicle_id bigint NOT NULL REFERENCES himoto.vehicles(id),
  to_vehicle_id bigint NOT NULL REFERENCES himoto.vehicles(id),
  actor_id bigint NOT NULL REFERENCES himoto.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS management_contract_vehicle_swaps_order_idx ON himoto.management_contract_vehicle_swaps(order_id, order_item_id);
ALTER TABLE himoto.management_contract_vehicle_swaps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON himoto.management_contract_vehicle_swaps FROM anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE himoto.management_contract_vehicle_swaps_id_seq TO service_role;

COMMIT;
