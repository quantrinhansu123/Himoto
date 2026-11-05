-- Additive migration. Run as the existing database owner before enabling mobile.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE IF NOT EXISTS himoto.management_mobile_sessions (
  id uuid PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES himoto.users(id),
  token_hash char(64) NOT NULL UNIQUE,
  password_version integer NOT NULL CHECK (password_version >= 0),
  device_name varchar(100) NOT NULL,
  platform varchar(10) NOT NULL CHECK (platform IN ('ios', 'android')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS management_mobile_sessions_user_idx
  ON himoto.management_mobile_sessions(user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS management_mobile_sessions_expiry_idx
  ON himoto.management_mobile_sessions(expires_at);
CREATE TABLE IF NOT EXISTS himoto.management_mobile_login_limits (
  bucket_hash char(64) PRIMARY KEY,
  attempts integer NOT NULL CHECK (attempts > 0),
  expires_at timestamptz NOT NULL
);
-- Only ownerDatabase may access these tables; never expose them through the
-- scoped business role or Supabase client APIs. Store hashes, never raw tokens.
ALTER TABLE himoto.management_mobile_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE himoto.management_mobile_login_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON himoto.management_mobile_sessions FROM PUBLIC, himoto_scoped, anon, authenticated;
REVOKE ALL ON himoto.management_mobile_login_limits FROM PUBLIC, himoto_scoped, anon, authenticated;
COMMIT;
