-- Apply only after mobile-record-media and current customer/photo RLS policies.
-- Extend the existing immutable actor/request photo receipt table; no backfill.
BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE himoto.management_mobile_record_media
  DROP CONSTRAINT IF EXISTS management_mobile_record_media_entity_type_check;
ALTER TABLE himoto.management_mobile_record_media ADD CONSTRAINT management_mobile_record_media_entity_type_check
  CHECK(entity_type IN('contracts','vehicles','customers'));
DROP POLICY IF EXISTS mobile_record_media_actor ON himoto.management_mobile_record_media;
CREATE POLICY mobile_record_media_actor ON himoto.management_mobile_record_media TO himoto_scoped
  USING(user_id=NULLIF(current_setting('himoto.actor_id',true),'')::bigint)
  WITH CHECK(user_id=NULLIF(current_setting('himoto.actor_id',true),'')::bigint AND
    ((entity_type='contracts' AND EXISTS(SELECT 1 FROM himoto.orders o WHERE o.id=entity_id AND o.deleted_at IS NULL)) OR
     (entity_type='vehicles' AND EXISTS(SELECT 1 FROM himoto.vehicles v WHERE v.id=entity_id AND v.deleted_at IS NULL)) OR
     (entity_type='customers' AND EXISTS(SELECT 1 FROM himoto.customers c WHERE c.id=entity_id))));
COMMIT;
