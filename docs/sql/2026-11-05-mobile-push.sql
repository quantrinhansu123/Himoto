-- Additive notification delivery metadata only. Owner connection only.
-- Review and validate offline before rollout. No operational rows are touched.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE TABLE IF NOT EXISTS himoto.management_mobile_push_devices (
  token_hash char(64) PRIMARY KEY CHECK(token_hash ~ '^[a-f0-9]{64}$'),
  token text NOT NULL CHECK(length(token) BETWEEN 20 AND 4096),
  user_id bigint NOT NULL REFERENCES himoto.users(id),
  session_id uuid NOT NULL REFERENCES himoto.management_mobile_sessions(id),
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  checked_at timestamptz,
  state jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(state)='object'),
  lease_until timestamptz,
  lease_id uuid
);
CREATE INDEX IF NOT EXISTS management_mobile_push_devices_active ON himoto.management_mobile_push_devices(checked_at NULLS FIRST) WHERE enabled;
CREATE TABLE IF NOT EXISTS himoto.management_mobile_push_deliveries (
  id uuid PRIMARY KEY,
  token_hash char(64) NOT NULL REFERENCES himoto.management_mobile_push_devices(token_hash),
  kind varchar(16) NOT NULL CHECK(kind IN('transfer','due','overdue','approval')),
  fingerprint char(64) NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),
  outcome varchar(16) NOT NULL CHECK(outcome IN('sending','sent','unknown','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
ALTER TABLE himoto.management_mobile_push_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE himoto.management_mobile_push_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON himoto.management_mobile_push_devices,himoto.management_mobile_push_deliveries FROM PUBLIC,anon,authenticated,himoto_scoped;
COMMIT;
