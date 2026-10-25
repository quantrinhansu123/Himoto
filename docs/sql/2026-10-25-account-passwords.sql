BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE himoto.users ADD COLUMN IF NOT EXISTS management_password_version integer NOT NULL DEFAULT 0;
ALTER TABLE himoto.users ADD COLUMN IF NOT EXISTS management_password_changed_at timestamptz;
CREATE OR REPLACE FUNCTION himoto.bump_account_password_version() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,himoto AS $$
BEGIN
  IF NEW.password IS DISTINCT FROM OLD.password THEN
    NEW.management_password_version=OLD.management_password_version+1;
    NEW.management_password_changed_at=clock_timestamp();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS management_password_version ON himoto.users;
CREATE TRIGGER management_password_version BEFORE UPDATE OF password ON himoto.users FOR EACH ROW EXECUTE FUNCTION himoto.bump_account_password_version();
CREATE TABLE IF NOT EXISTS himoto.management_account_passwords (
  user_id bigint PRIMARY KEY REFERENCES himoto.users(id),
  password_cipher text NOT NULL,
  password_fingerprint text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by bigint NOT NULL REFERENCES himoto.users(id),
  change_kind text NOT NULL CHECK(change_kind IN ('create','change','reset'))
);
ALTER TABLE himoto.management_account_passwords ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON himoto.management_account_passwords FROM PUBLIC,himoto_scoped;
DO $$ DECLARE role_name text; BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('REVOKE ALL ON himoto.management_account_passwords FROM %I',role_name);
    END IF;
  END LOOP;
END $$;
COMMIT;
