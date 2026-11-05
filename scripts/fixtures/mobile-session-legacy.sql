BEGIN;
SET LOCAL lock_timeout = '5s';

-- Owner-only mobile credentials. The scoped role and browser clients have no access.
CREATE TABLE IF NOT EXISTS himoto.management_mobile_sessions (
  id uuid PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES himoto.users(id),
  access_token_hash char(64) NOT NULL UNIQUE,
  refresh_token_hash char(64) NOT NULL UNIQUE,
  access_expires_at timestamptz NOT NULL,
  refresh_expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  rotated_at timestamptz,
  revoked_at timestamptz,
  CHECK (access_expires_at <= refresh_expires_at)
);

CREATE INDEX IF NOT EXISTS management_mobile_sessions_user_active
  ON himoto.management_mobile_sessions(user_id, refresh_expires_at DESC)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS management_mobile_sessions_expiry
  ON himoto.management_mobile_sessions(refresh_expires_at);

ALTER TABLE himoto.management_mobile_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON himoto.management_mobile_sessions FROM PUBLIC;

-- Shared rate limit across serverless instances. Only the backend owner reads it.
CREATE TABLE IF NOT EXISTS himoto.management_mobile_login_attempts (
  login_hash char(64) PRIMARY KEY,
  attempts smallint NOT NULL CHECK (attempts BETWEEN 1 AND 11),
  window_expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS management_mobile_login_attempts_expiry
  ON himoto.management_mobile_login_attempts(window_expires_at);
ALTER TABLE himoto.management_mobile_login_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON himoto.management_mobile_login_attempts FROM PUBLIC;

COMMIT;
