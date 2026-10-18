BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE himoto.management_record_photos DROP CONSTRAINT IF EXISTS management_record_photos_slots;
ALTER TABLE himoto.management_record_photos ADD CONSTRAINT management_record_photos_slots CHECK(
  (entity_type='customers' AND slot IN('id_front','id_back','driver_license')) OR
  (entity_type='contracts' AND (slot IN('driver-license','customer-id-front','customer-id-back','customer-driver-license') OR slot ~ '^plate-[1-9][0-9]{0,14}$' OR slot ~ '^(rental|handover)-([1-9]|1[0-5]|video-[1-3]|document-([1-9]|1[0-5]))$' OR slot ~ '^(return|renewal|renewal-receipt)-[1-9][0-9]{0,14}-([1-9]|1[0-5]|video-[1-3]|document-([1-9]|1[0-5]))$'))
);
COMMIT;
