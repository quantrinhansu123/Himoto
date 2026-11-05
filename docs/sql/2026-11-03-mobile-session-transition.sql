-- Prepare and validate offline/staging before any real rollout.
-- Supports the colleague's UUID.access/refresh sessions and hm1 sessions side by side.
-- No session/token/account row is updated, deleted, copied or revoked.
-- Run as database owner BEFORE 2026-10-31-mobile-sessions.sql on a legacy DB.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

DO $guard$
DECLARE item record; actual_type text; legacy_count integer; current_count integer;
BEGIN
  IF to_regclass('himoto.management_mobile_sessions') IS NULL THEN
    RAISE EXCEPTION 'Mobile session transition requires an existing legacy or current session table';
  END IF;
  -- Refuse a partial/foreign credential schema; never guess a data conversion.
  SELECT count(*) INTO legacy_count FROM information_schema.columns
    WHERE table_schema='himoto' AND table_name='management_mobile_sessions'
      AND column_name IN('access_token_hash','refresh_token_hash','access_expires_at','refresh_expires_at','rotated_at');
  SELECT count(*) INTO current_count FROM information_schema.columns
    WHERE table_schema='himoto' AND table_name='management_mobile_sessions'
      AND column_name IN('token_hash','password_version','device_name','platform','expires_at');
  IF legacy_count NOT IN(0,5) OR current_count NOT IN(0,5) OR legacy_count+current_count=0 THEN
    RAISE EXCEPTION 'Unsupported partial mobile session schema';
  END IF;
  FOR item IN SELECT * FROM (VALUES
    ('id','uuid',true),('user_id','bigint',true),('created_at','timestamp with time zone',true),('revoked_at','timestamp with time zone',true),
    ('access_token_hash','character(64)',legacy_count=5),('refresh_token_hash','character(64)',legacy_count=5),
    ('access_expires_at','timestamp with time zone',legacy_count=5),('refresh_expires_at','timestamp with time zone',legacy_count=5),('rotated_at','timestamp with time zone',legacy_count=5),
    ('token_hash','character(64)',current_count=5),('password_version','integer',current_count=5),('device_name','character varying(100)',current_count=5),
    ('platform','character varying(10)',current_count=5),('expires_at','timestamp with time zone',current_count=5)
  ) AS fields(name,expected,required) LOOP
    SELECT format_type(a.atttypid,a.atttypmod) INTO actual_type FROM pg_attribute a
      WHERE a.attrelid='himoto.management_mobile_sessions'::regclass AND a.attname=item.name AND a.attnum>0 AND NOT a.attisdropped;
    IF item.required AND actual_type IS DISTINCT FROM item.expected THEN
      RAISE EXCEPTION 'Unsupported mobile session column type: %',item.name;
    END IF;
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='himoto.management_mobile_sessions'::regclass AND contype='p'
    AND pg_get_constraintdef(oid)='PRIMARY KEY (id)') THEN
    RAISE EXCEPTION 'Unsupported mobile session primary key';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='himoto.management_mobile_sessions'::regclass
    AND attname IN('user_id','created_at') AND NOT attnotnull AND NOT attisdropped) THEN
    RAISE EXCEPTION 'Mobile session actor and creation time must remain required';
  END IF;
END $guard$;

-- Existing rows keep their original values, UUIDs, hashes, lifetimes and metadata.
ALTER TABLE himoto.management_mobile_sessions
  ADD COLUMN IF NOT EXISTS access_token_hash char(64),
  ADD COLUMN IF NOT EXISTS refresh_token_hash char(64),
  ADD COLUMN IF NOT EXISTS access_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS refresh_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS rotated_at timestamptz,
  ADD COLUMN IF NOT EXISTS token_hash char(64),
  ADD COLUMN IF NOT EXISTS password_version integer,
  ADD COLUMN IF NOT EXISTS device_name varchar(100),
  ADD COLUMN IF NOT EXISTS platform varchar(10),
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE himoto.management_mobile_sessions
  ALTER COLUMN access_token_hash DROP NOT NULL,
  ALTER COLUMN refresh_token_hash DROP NOT NULL,
  ALTER COLUMN access_expires_at DROP NOT NULL,
  ALTER COLUMN refresh_expires_at DROP NOT NULL,
  ALTER COLUMN token_hash DROP NOT NULL,
  ALTER COLUMN password_version DROP NOT NULL,
  ALTER COLUMN device_name DROP NOT NULL,
  ALTER COLUMN platform DROP NOT NULL,
  ALTER COLUMN expires_at DROP NOT NULL;

-- One complete credential family per row. NULL never grants a session to either API.
-- Signal an invalid existing row by aborting the entire transaction; do not repair it here.
ALTER TABLE himoto.management_mobile_sessions
  DROP CONSTRAINT IF EXISTS management_mobile_sessions_credential_family;
ALTER TABLE himoto.management_mobile_sessions ADD CONSTRAINT management_mobile_sessions_credential_family CHECK(
  (token_hash IS NULL AND password_version IS NULL AND device_name IS NULL AND platform IS NULL AND expires_at IS NULL
    AND access_token_hash IS NOT NULL AND refresh_token_hash IS NOT NULL AND access_expires_at IS NOT NULL AND refresh_expires_at IS NOT NULL
    AND access_token_hash ~ '^[a-f0-9]{64}$' AND refresh_token_hash ~ '^[a-f0-9]{64}$' AND access_expires_at<=refresh_expires_at)
  OR
  (access_token_hash IS NULL AND refresh_token_hash IS NULL AND access_expires_at IS NULL AND refresh_expires_at IS NULL AND rotated_at IS NULL
    AND token_hash IS NOT NULL AND password_version IS NOT NULL AND device_name IS NOT NULL AND platform IS NOT NULL AND expires_at IS NOT NULL
    AND token_hash ~ '^[a-f0-9]{64}$' AND password_version>=0 AND platform IN('ios','android') AND expires_at>created_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS management_mobile_sessions_transition_access_hash ON himoto.management_mobile_sessions(access_token_hash);
CREATE UNIQUE INDEX IF NOT EXISTS management_mobile_sessions_transition_refresh_hash ON himoto.management_mobile_sessions(refresh_token_hash);
CREATE UNIQUE INDEX IF NOT EXISTS management_mobile_sessions_transition_token_hash ON himoto.management_mobile_sessions(token_hash);
CREATE INDEX IF NOT EXISTS management_mobile_sessions_user_idx ON himoto.management_mobile_sessions(user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS management_mobile_sessions_expiry_idx ON himoto.management_mobile_sessions(expires_at);
CREATE INDEX IF NOT EXISTS management_mobile_sessions_user_active ON himoto.management_mobile_sessions(user_id,refresh_expires_at DESC) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS management_mobile_sessions_expiry ON himoto.management_mobile_sessions(refresh_expires_at);

CREATE TABLE IF NOT EXISTS himoto.management_mobile_login_limits (
  bucket_hash char(64) PRIMARY KEY,
  attempts integer NOT NULL CHECK(attempts>0),
  expires_at timestamptz NOT NULL
);
ALTER TABLE himoto.management_mobile_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE himoto.management_mobile_login_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON himoto.management_mobile_sessions,himoto.management_mobile_login_limits FROM PUBLIC,himoto_scoped,anon,authenticated;
DO $secure$
BEGIN
  IF to_regclass('himoto.management_mobile_login_attempts') IS NOT NULL THEN
    ALTER TABLE himoto.management_mobile_login_attempts ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON himoto.management_mobile_login_attempts FROM PUBLIC,himoto_scoped,anon,authenticated;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='himoto' AND tablename IN('management_mobile_sessions','management_mobile_login_limits','management_mobile_login_attempts')) THEN
    RAISE EXCEPTION 'Credential tables must have no client RLS policies; inspect unexpected policy before rollout';
  END IF;
END $secure$;
COMMIT;
