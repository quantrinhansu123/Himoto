BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE himoto.customers
  ADD COLUMN IF NOT EXISTS customer_type text NOT NULL DEFAULT 'vietnam',
  ADD COLUMN IF NOT EXISTS nationality text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS contact_channel text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS contact_detail text NOT NULL DEFAULT '';
ALTER TABLE himoto.customers DROP CONSTRAINT IF EXISTS customers_customer_type_check;
ALTER TABLE himoto.customers ADD CONSTRAINT customers_customer_type_check CHECK(customer_type IN('vietnam','foreign'));
ALTER TABLE himoto.management_record_photos DROP CONSTRAINT IF EXISTS management_record_photos_mime_type_check;
ALTER TABLE himoto.management_record_photos ADD CONSTRAINT management_record_photos_mime_type_check CHECK(mime_type IN('image/jpeg','image/png','image/webp','video/mp4'));
ALTER TABLE himoto.management_record_photos DROP CONSTRAINT IF EXISTS management_record_photos_slots;
ALTER TABLE himoto.management_record_photos ADD CONSTRAINT management_record_photos_slots CHECK(
  (entity_type='customers' AND slot IN('id_front','id_back','driver_license')) OR
  (entity_type='contracts' AND (slot='driver-license' OR slot ~ '^plate-[1-9][0-9]{0,14}$' OR slot ~ '^(rental|handover)-([1-9]|1[0-5]|video-[1-3])$' OR slot ~ '^(return|renewal|renewal-receipt)-[1-9][0-9]{0,14}-([1-9]|1[0-5]|video-[1-3])$'))
);
ALTER TABLE himoto.management_record_photos DROP CONSTRAINT IF EXISTS management_record_photos_video_storage;
ALTER TABLE himoto.management_record_photos ADD CONSTRAINT management_record_photos_video_storage CHECK(
  mime_type<>'video/mp4' OR (entity_type='contracts' AND slot ~ '-video-[1-3]$' AND data IS NULL AND cloudinary_public_id IS NOT NULL)
);
COMMIT;
