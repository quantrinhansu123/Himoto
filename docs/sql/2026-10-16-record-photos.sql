BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE IF NOT EXISTS himoto.management_record_photos (
  entity_type text NOT NULL CHECK (entity_type IN ('customers', 'contracts')),
  entity_id bigint NOT NULL CHECK (entity_id > 0),
  slot text NOT NULL,
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  data bytea NOT NULL CHECK (octet_length(data) BETWEEN 1 AND 2097152),
  updated_by bigint NOT NULL REFERENCES himoto.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_type, entity_id, slot),
  CHECK ((entity_type = 'customers' AND slot IN ('id_front', 'id_back')) OR
    (entity_type = 'contracts' AND slot ~ '^plate-[1-9][0-9]{0,14}$'))
);
-- Generated owner keys keep polymorphic API URLs while enforcing real foreign keys.
ALTER TABLE himoto.management_record_photos ADD COLUMN IF NOT EXISTS customer_id bigint
  GENERATED ALWAYS AS (CASE WHEN entity_type = 'customers' THEN entity_id END) STORED
  REFERENCES himoto.customers(id) ON DELETE CASCADE;
ALTER TABLE himoto.management_record_photos ADD COLUMN IF NOT EXISTS order_id bigint
  GENERATED ALWAYS AS (CASE WHEN entity_type = 'contracts' THEN entity_id END) STORED
  REFERENCES himoto.orders(id) ON DELETE CASCADE;
-- Images are available only through the authenticated management API.
ALTER TABLE himoto.management_record_photos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON himoto.management_record_photos FROM anon, authenticated;
COMMIT;
