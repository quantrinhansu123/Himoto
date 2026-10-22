BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
ALTER TABLE himoto.management_record_photos
  ADD COLUMN IF NOT EXISTS object_bucket text,
  ADD COLUMN IF NOT EXISTS object_key text,
  ADD COLUMN IF NOT EXISTS object_etag text;
ALTER TABLE himoto.management_shift_media
  ADD COLUMN IF NOT EXISTS object_bucket text,
  ADD COLUMN IF NOT EXISTS object_key text,
  ADD COLUMN IF NOT EXISTS object_etag text;

ALTER TABLE himoto.management_record_photos DROP CONSTRAINT IF EXISTS management_record_photos_storage;
ALTER TABLE himoto.management_record_photos ADD CONSTRAINT management_record_photos_storage CHECK (
  (data IS NOT NULL AND cloudinary_public_id IS NULL AND cloudinary_cloud_name IS NULL AND cloudinary_version IS NULL
    AND object_bucket IS NULL AND object_key IS NULL AND object_etag IS NULL)
  OR (data IS NULL AND cloudinary_public_id IS NOT NULL AND cloudinary_cloud_name IS NOT NULL AND cloudinary_version IS NOT NULL AND cloudinary_version>0
    AND object_bucket IS NULL AND object_key IS NULL AND object_etag IS NULL)
  OR (data IS NULL AND cloudinary_public_id IS NULL AND cloudinary_cloud_name IS NULL AND cloudinary_version IS NULL
    AND mime_type='video/mp4' AND object_bucket IS NOT NULL AND object_bucket<>'' AND object_key IS NOT NULL
    AND object_key ~ '^himoto/videos/[a-zA-Z0-9_-]+/[1-9][0-9]*/[0-9a-fA-F-]{36}/v[1-9][0-9]*[.]mp4$'
    AND object_etag IS NOT NULL AND object_etag<>'')
);
ALTER TABLE himoto.management_record_photos DROP CONSTRAINT IF EXISTS management_record_photos_video_storage;
ALTER TABLE himoto.management_record_photos ADD CONSTRAINT management_record_photos_video_storage CHECK (
  mime_type<>'video/mp4' OR (entity_type='contracts' AND slot ~ '-video-[1-3]$' AND data IS NULL
    AND (cloudinary_public_id IS NOT NULL OR object_key IS NOT NULL))
);

ALTER TABLE himoto.management_shift_media DROP CONSTRAINT IF EXISTS management_shift_media_check;
ALTER TABLE himoto.management_shift_media ADD CONSTRAINT management_shift_media_check CHECK (
  (data IS NOT NULL AND octet_length(data) BETWEEN 1 AND 2097152 AND cloudinary_public_id IS NULL
    AND cloudinary_cloud_name IS NULL AND cloudinary_version IS NULL AND mime_type IN('image/jpeg','image/png','image/webp')
    AND object_bucket IS NULL AND object_key IS NULL AND object_etag IS NULL)
  OR (data IS NULL AND cloudinary_public_id IS NOT NULL AND cloudinary_cloud_name IS NOT NULL AND cloudinary_version IS NOT NULL AND cloudinary_version>0
    AND mime_type IN('video/mp4','image/jpeg') AND object_bucket IS NULL AND object_key IS NULL AND object_etag IS NULL)
  OR (data IS NULL AND cloudinary_public_id IS NULL AND cloudinary_cloud_name IS NULL AND cloudinary_version IS NULL
    AND mime_type='video/mp4' AND object_bucket IS NOT NULL AND object_bucket<>'' AND object_key IS NOT NULL
    AND object_key ~ '^himoto/videos/[a-zA-Z0-9_-]+/[1-9][0-9]*/[0-9a-fA-F-]{36}/v[1-9][0-9]*[.]mp4$'
    AND object_etag IS NOT NULL AND object_etag<>'')
);
COMMIT;
