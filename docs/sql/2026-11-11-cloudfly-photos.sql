BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
ALTER TABLE himoto.management_record_photos ADD COLUMN IF NOT EXISTS storage_sha256 text,
  ADD COLUMN IF NOT EXISTS storage_bytes bigint;
ALTER TABLE himoto.management_shift_media ADD COLUMN IF NOT EXISTS storage_sha256 text,
  ADD COLUMN IF NOT EXISTS storage_bytes bigint;
ALTER TABLE himoto.management_shift_photos ALTER COLUMN data DROP NOT NULL;
ALTER TABLE himoto.management_shift_photos ADD COLUMN IF NOT EXISTS object_bucket text,
  ADD COLUMN IF NOT EXISTS object_key text, ADD COLUMN IF NOT EXISTS object_etag text,
  ADD COLUMN IF NOT EXISTS storage_sha256 text, ADD COLUMN IF NOT EXISTS storage_bytes bigint;

-- Extend only the storage-location check; retain all existing RLS and video-slot checks.
ALTER TABLE himoto.management_record_photos DROP CONSTRAINT IF EXISTS management_record_photos_storage;
ALTER TABLE himoto.management_record_photos ADD CONSTRAINT management_record_photos_storage CHECK (
  (data IS NOT NULL AND cloudinary_public_id IS NULL AND cloudinary_cloud_name IS NULL AND cloudinary_version IS NULL
    AND object_bucket IS NULL AND object_key IS NULL AND object_etag IS NULL)
  OR (data IS NULL AND cloudinary_public_id IS NOT NULL AND cloudinary_cloud_name IS NOT NULL AND cloudinary_version IS NOT NULL AND cloudinary_version>0
    AND object_bucket IS NULL AND object_key IS NULL AND object_etag IS NULL)
  OR (data IS NULL AND cloudinary_public_id IS NULL AND cloudinary_cloud_name IS NULL AND cloudinary_version IS NULL
    AND object_bucket IS NOT NULL AND object_bucket<>'' AND object_key IS NOT NULL AND object_etag IS NOT NULL AND object_etag<>'' AND (
      (mime_type='video/mp4' AND object_key ~ '^himoto/videos/[a-zA-Z0-9_-]+/[1-9][0-9]*/[0-9a-fA-F-]{36}/v[1-9][0-9]*[.]mp4$')
      OR (mime_type IN ('image/jpeg','image/png','image/webp') AND object_key ~ '^himoto/photos/[1-9][0-9]*/[0-9a-fA-F-]{36}/v1[.](jpg|png|webp)$'
        AND storage_sha256 IS NOT NULL AND storage_bytes IS NOT NULL AND storage_sha256 ~ '^[a-f0-9]{64}$' AND storage_bytes BETWEEN 1 AND 2097152)
    ))
);
ALTER TABLE himoto.management_shift_media DROP CONSTRAINT IF EXISTS management_shift_media_check;
ALTER TABLE himoto.management_shift_media ADD CONSTRAINT management_shift_media_check CHECK (
  (data IS NOT NULL AND octet_length(data) BETWEEN 1 AND 2097152 AND cloudinary_public_id IS NULL AND cloudinary_cloud_name IS NULL AND cloudinary_version IS NULL
    AND mime_type IN ('image/jpeg','image/png','image/webp') AND object_bucket IS NULL AND object_key IS NULL AND object_etag IS NULL)
  OR (data IS NULL AND cloudinary_public_id IS NOT NULL AND cloudinary_cloud_name IS NOT NULL AND cloudinary_version IS NOT NULL AND cloudinary_version>0
    AND mime_type IN ('video/mp4','image/jpeg') AND object_bucket IS NULL AND object_key IS NULL AND object_etag IS NULL)
  OR (data IS NULL AND cloudinary_public_id IS NULL AND cloudinary_cloud_name IS NULL AND cloudinary_version IS NULL
    AND object_bucket IS NOT NULL AND object_bucket<>'' AND object_key IS NOT NULL AND object_etag IS NOT NULL AND object_etag<>'' AND (
      (mime_type='video/mp4' AND object_key ~ '^himoto/videos/[a-zA-Z0-9_-]+/[1-9][0-9]*/[0-9a-fA-F-]{36}/v[1-9][0-9]*[.]mp4$')
      OR (mime_type IN ('image/jpeg','image/png','image/webp') AND object_key ~ '^himoto/photos/[1-9][0-9]*/[0-9a-fA-F-]{36}/v1[.](jpg|png|webp)$'
        AND storage_sha256 IS NOT NULL AND storage_bytes IS NOT NULL AND storage_sha256 ~ '^[a-f0-9]{64}$' AND storage_bytes BETWEEN 1 AND 2097152)
    ))
);
ALTER TABLE himoto.management_shift_photos DROP CONSTRAINT IF EXISTS management_shift_photos_storage;
ALTER TABLE himoto.management_shift_photos ADD CONSTRAINT management_shift_photos_storage CHECK (
  (data IS NOT NULL AND object_bucket IS NULL AND object_key IS NULL AND object_etag IS NULL)
  OR (data IS NULL AND mime_type IN ('image/jpeg','image/png','image/webp') AND object_bucket IS NOT NULL
    AND object_etag IS NOT NULL AND object_key IS NOT NULL AND object_key ~ '^himoto/photos/[1-9][0-9]*/[0-9a-fA-F-]{36}/v1[.](jpg|png|webp)$'
    AND storage_sha256 IS NOT NULL AND storage_bytes IS NOT NULL AND storage_sha256 ~ '^[a-f0-9]{64}$' AND storage_bytes BETWEEN 1 AND 2097152)
);
-- Immutable source aliases also resolve photos in historical Telegram snapshots.
-- Application callers first prove record visibility; only ownerDatabase can read aliases.
CREATE TABLE IF NOT EXISTS himoto.management_media_archive (
  source_cloud text NOT NULL, source_public_id text NOT NULL, source_version bigint NOT NULL CHECK(source_version>0),
  mime_type text NOT NULL CHECK(mime_type IN ('image/jpeg','image/png','image/webp','video/mp4')),
  object_bucket text NOT NULL, object_key text NOT NULL, object_etag text NOT NULL,
  storage_sha256 text NOT NULL CHECK(storage_sha256 ~ '^[a-f0-9]{64}$'), storage_bytes bigint NOT NULL CHECK(storage_bytes BETWEEN 1 AND 47185920),
  verified_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(source_cloud,source_public_id,source_version,mime_type), UNIQUE(object_bucket,object_key)
);
ALTER TABLE himoto.management_media_archive ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON himoto.management_media_archive FROM PUBLIC,himoto_scoped;
COMMIT;
