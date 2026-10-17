BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE himoto.management_gps_accounts
  ADD COLUMN IF NOT EXISTS sync_lease_token uuid,
  ADD COLUMN IF NOT EXISTS sync_lease_until timestamptz,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;
ALTER TABLE himoto.gps_devices ADD COLUMN IF NOT EXISTS source_account_id uuid REFERENCES himoto.management_gps_accounts(id);

-- Branch queries may read only the account ID and sync timestamp for their visible devices.
-- Passwords, sessions, login names and provider settings remain inaccessible.
GRANT SELECT(id,last_success_at) ON himoto.management_gps_accounts TO himoto_scoped;
DROP POLICY IF EXISTS gps_account_sync_time ON himoto.management_gps_accounts;
CREATE POLICY gps_account_sync_time ON himoto.management_gps_accounts FOR SELECT TO himoto_scoped USING(true);

CREATE TABLE IF NOT EXISTS himoto.management_integration_worker_nonces (
  nonce uuid PRIMARY KEY,expires_at timestamptz NOT NULL DEFAULT now()+interval '2 minutes'
);
ALTER TABLE himoto.management_integration_worker_nonces ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON himoto.management_integration_worker_nonces FROM PUBLIC,anon,authenticated,himoto_scoped;
COMMIT;
