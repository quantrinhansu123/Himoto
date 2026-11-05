-- Apply as DB owner after mobile-writes and current record-photo/supplemental
-- slot/transfer/ownership policies. Metadata only; no operational data backfill.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE IF NOT EXISTS himoto.management_mobile_record_media (
  user_id bigint NOT NULL,
  request_id uuid NOT NULL,
  entity_type text NOT NULL CHECK(entity_type IN('contracts','vehicles')),
  entity_id bigint NOT NULL,
  proof jsonb NOT NULL CHECK(jsonb_typeof(proof)='object' AND octet_length(proof::text)<=16384),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,request_id),
  FOREIGN KEY(user_id,request_id) REFERENCES himoto.management_mobile_requests(user_id,request_id)
);
ALTER TABLE himoto.management_mobile_record_media ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON himoto.management_mobile_record_media FROM PUBLIC,anon,authenticated,himoto_scoped;
GRANT SELECT,INSERT ON himoto.management_mobile_record_media TO himoto_scoped;
DROP POLICY IF EXISTS mobile_record_media_actor ON himoto.management_mobile_record_media;
CREATE POLICY mobile_record_media_actor ON himoto.management_mobile_record_media TO himoto_scoped
  USING(user_id=NULLIF(current_setting('himoto.actor_id',true),'')::bigint)
  WITH CHECK(user_id=NULLIF(current_setting('himoto.actor_id',true),'')::bigint AND
    ((entity_type='contracts' AND EXISTS(SELECT 1 FROM himoto.orders o WHERE o.id=entity_id AND o.deleted_at IS NULL)) OR
     (entity_type='vehicles' AND EXISTS(SELECT 1 FROM himoto.vehicles v WHERE v.id=entity_id AND v.deleted_at IS NULL))));
CREATE INDEX IF NOT EXISTS management_mobile_record_media_record_idx ON himoto.management_mobile_record_media(entity_type,entity_id);
COMMIT;
