BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE IF NOT EXISTS himoto.management_battery_media (
  battery_contract_id bigint NOT NULL REFERENCES himoto.battery_contracts(id),
  event_key text NOT NULL CHECK(event_key='rental' OR event_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  id uuid NOT NULL,request_id uuid NOT NULL,created_by bigint NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
  mime_type text NOT NULL CHECK(mime_type IN('image/jpeg','image/png','image/webp')),
  sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'),bytes integer NOT NULL CHECK(bytes BETWEEN 1 AND 2097152),
  data bytea,object_bucket text,object_key text,object_etag text,
  PRIMARY KEY(battery_contract_id,event_key,id),UNIQUE(created_by,request_id),
  CHECK((data IS NOT NULL AND octet_length(data)=bytes AND object_key IS NULL) OR (data IS NULL AND object_bucket IS NOT NULL AND object_key IS NOT NULL AND object_etag IS NOT NULL))
);
ALTER TABLE himoto.management_battery_media ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON himoto.management_battery_media FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,DELETE ON himoto.management_battery_media TO himoto_scoped;
DROP POLICY IF EXISTS battery_media_scope ON himoto.management_battery_media;
CREATE POLICY battery_media_scope ON himoto.management_battery_media TO himoto_scoped
 USING(EXISTS(SELECT 1 FROM himoto.battery_contracts b WHERE b.id=battery_contract_id AND b.deleted_at IS NULL))
 WITH CHECK(created_by=NULLIF(current_setting('himoto.actor_id',true),'')::bigint AND EXISTS(SELECT 1 FROM himoto.battery_contracts b WHERE b.id=battery_contract_id AND b.deleted_at IS NULL));
ALTER TABLE himoto.management_report_deliveries ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE himoto.management_report_deliveries ADD COLUMN IF NOT EXISTS media_ids jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE himoto.management_report_deliveries ADD COLUMN IF NOT EXISTS text_sent boolean NOT NULL DEFAULT false;
COMMIT;
