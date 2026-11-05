-- Metadata-only recovery proofs. Requires mobile-writes and current photo/RLS setup.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE IF NOT EXISTS himoto.management_mobile_media_deletions (
  user_id bigint NOT NULL,
  request_id uuid NOT NULL,
  entity_type text NOT NULL CHECK(entity_type IN('contracts','vehicles','customers')),
  entity_id bigint NOT NULL,
  proof jsonb NOT NULL CHECK(jsonb_typeof(proof)='object' AND octet_length(proof::text)<=16384),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,request_id),
  FOREIGN KEY(user_id,request_id) REFERENCES himoto.management_mobile_requests(user_id,request_id)
);
ALTER TABLE himoto.management_mobile_media_deletions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON himoto.management_mobile_media_deletions FROM PUBLIC,anon,authenticated,himoto_scoped;
GRANT SELECT,INSERT ON himoto.management_mobile_media_deletions TO himoto_scoped;
DROP POLICY IF EXISTS mobile_media_deletion_actor ON himoto.management_mobile_media_deletions;
CREATE POLICY mobile_media_deletion_actor ON himoto.management_mobile_media_deletions TO himoto_scoped
  USING(user_id=NULLIF(current_setting('himoto.actor_id',true),'')::bigint)
  WITH CHECK(user_id=NULLIF(current_setting('himoto.actor_id',true),'')::bigint AND
    ((entity_type='contracts' AND EXISTS(SELECT 1 FROM himoto.orders o WHERE o.id=entity_id AND o.deleted_at IS NULL)) OR
     (entity_type='vehicles' AND EXISTS(SELECT 1 FROM himoto.vehicles v WHERE v.id=entity_id AND v.deleted_at IS NULL)) OR
     (entity_type='customers' AND EXISTS(SELECT 1 FROM himoto.customers c WHERE c.id=entity_id))));
CREATE INDEX IF NOT EXISTS management_mobile_media_deletions_record_idx ON himoto.management_mobile_media_deletions(entity_type,entity_id);
COMMIT;
