-- Additive: existing hm1/legacy sessions and their lifetimes remain valid.
-- Apply after the mobile session transition/current schema, before backend v2.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE IF NOT EXISTS himoto.management_mobile_refresh_sessions (
  session_id uuid PRIMARY KEY REFERENCES himoto.management_mobile_sessions(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  CHECK(expires_at<=absolute_expires_at)
);
CREATE TABLE IF NOT EXISTS himoto.management_mobile_used_refresh_tokens (
  token_hash char(64) PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES himoto.management_mobile_sessions(id) ON DELETE CASCADE,
  rotation_id uuid NOT NULL,
  used_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS management_mobile_used_refresh_session_idx ON himoto.management_mobile_used_refresh_tokens(session_id);
ALTER TABLE himoto.management_mobile_refresh_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE himoto.management_mobile_used_refresh_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON himoto.management_mobile_refresh_sessions,himoto.management_mobile_used_refresh_tokens FROM PUBLIC,himoto_scoped,anon,authenticated;
COMMIT;
