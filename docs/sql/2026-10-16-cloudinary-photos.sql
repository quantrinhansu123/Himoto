BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE himoto.management_record_photos
  ADD COLUMN IF NOT EXISTS cloudinary_public_id text,
  ADD COLUMN IF NOT EXISTS cloudinary_cloud_name text,
  ADD COLUMN IF NOT EXISTS cloudinary_version bigint;
ALTER TABLE himoto.management_record_photos ALTER COLUMN data DROP NOT NULL;
ALTER TABLE himoto.management_record_photos DROP CONSTRAINT IF EXISTS management_record_photos_storage;
ALTER TABLE himoto.management_record_photos ADD CONSTRAINT management_record_photos_storage CHECK (
      (data IS NOT NULL AND cloudinary_public_id IS NULL AND cloudinary_cloud_name IS NULL AND cloudinary_version IS NULL)
      OR (data IS NULL AND cloudinary_public_id IS NOT NULL AND cloudinary_cloud_name IS NOT NULL AND cloudinary_version IS NOT NULL AND cloudinary_version > 0)
    );
COMMIT;
