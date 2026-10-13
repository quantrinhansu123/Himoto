BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE IF NOT EXISTS himoto.battery_contracts (
  id bigserial PRIMARY KEY,
  code varchar(32) NOT NULL,
  store_id bigint NOT NULL REFERENCES himoto.stores(id),
  customer_id bigint REFERENCES himoto.customers(id) ON DELETE SET NULL,
  status varchar(16) NOT NULL DEFAULT 'renting',
  staff_name varchar(120) NOT NULL DEFAULT '',
  signed_on date NOT NULL,
  signed_place varchar(255) NOT NULL DEFAULT '',
  customer_name varchar(255) NOT NULL,
  customer_phone varchar(32) NOT NULL DEFAULT '',
  customer_address varchar(500) NOT NULL DEFAULT '',
  customer_id_card varchar(32) NOT NULL DEFAULT '',
  id_card_issued_on date,
  id_card_issued_by varchar(255) NOT NULL DEFAULT '',
  battery_name varchar(255) NOT NULL,
  vehicle_license varchar(32) NOT NULL DEFAULT '',
  vehicle_brand varchar(120) NOT NULL DEFAULT '',
  vehicle_type varchar(120) NOT NULL DEFAULT '',
  vehicle_color varchar(60) NOT NULL DEFAULT '',
  vehicle_year varchar(10) NOT NULL DEFAULT '',
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  rent_price bigint,
  price_unit varchar(30) NOT NULL DEFAULT '',
  package_name varchar(120) NOT NULL DEFAULT '',
  paid_amount bigint,
  paid_method varchar(4) NOT NULL DEFAULT '',
  deposit_amount bigint,
  deposit_note varchar(500) NOT NULL DEFAULT '',
  deposit_method varchar(4) NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_by bigint,
  updated_by bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  request_id uuid,
  request_hash char(64),
  CONSTRAINT battery_contract_status CHECK (status IN ('renting', 'returned', 'cancelled')),
  CONSTRAINT battery_contract_period CHECK (ends_at IS NULL OR ends_at > starts_at),
  CONSTRAINT battery_contract_money CHECK ((rent_price IS NULL OR rent_price >= 0) AND (paid_amount IS NULL OR paid_amount >= 0) AND (deposit_amount IS NULL OR deposit_amount >= 0)),
  CONSTRAINT battery_contract_methods CHECK (paid_method IN ('', 'CK', 'TM') AND deposit_method IN ('', 'CK', 'TM'))
);
CREATE UNIQUE INDEX IF NOT EXISTS battery_contracts_code_unique ON himoto.battery_contracts(code);
CREATE UNIQUE INDEX IF NOT EXISTS battery_contracts_request_unique ON himoto.battery_contracts(request_id) WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS battery_contracts_active_store ON himoto.battery_contracts(store_id, starts_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS battery_contracts_customer ON himoto.battery_contracts(customer_id) WHERE customer_id IS NOT NULL;
ALTER TABLE himoto.battery_contracts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON himoto.battery_contracts FROM anon, authenticated;
REVOKE ALL ON SEQUENCE himoto.battery_contracts_id_seq FROM anon, authenticated;
COMMIT;
