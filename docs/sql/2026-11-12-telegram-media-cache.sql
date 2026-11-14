BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE IF NOT EXISTS himoto.management_telegram_media_cache(
  bot_id text NOT NULL CHECK(bot_id ~ '^[a-f0-9]{64}$'),
  media_key text NOT NULL CHECK(media_key ~ '^[a-f0-9]{64}$'),
  mime_type text NOT NULL,
  file_id text NOT NULL CHECK(length(file_id) BETWEEN 1 AND 4096),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(bot_id,media_key)
);
ALTER TABLE himoto.management_telegram_media_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON himoto.management_telegram_media_cache FROM PUBLIC,anon,authenticated,himoto_scoped;
COMMIT;
