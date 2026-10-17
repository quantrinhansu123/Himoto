BEGIN;
SET LOCAL lock_timeout='5s';

ALTER TABLE himoto.gps_devices ADD COLUMN IF NOT EXISTS provider_device_id text;
ALTER TABLE himoto.management_gps_status_events
  ALTER COLUMN to_status DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS event_kind text NOT NULL DEFAULT 'state_change',
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'poll',
  ADD COLUMN IF NOT EXISTS source_event_key text;
CREATE UNIQUE INDEX IF NOT EXISTS management_gps_events_source_key
  ON himoto.management_gps_status_events(gps_device_id,source_event_key) WHERE source_event_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS management_gps_events_occurred_idx
  ON himoto.management_gps_status_events((COALESCE(provider_recorded_at,observed_at)) DESC);

CREATE TABLE IF NOT EXISTS himoto.management_gps_account_devices (
  account_id uuid NOT NULL REFERENCES himoto.management_gps_accounts(id),
  gps_device_id bigint NOT NULL REFERENCES himoto.gps_devices(id),
  PRIMARY KEY(account_id,gps_device_id)
);
INSERT INTO himoto.management_gps_account_devices(account_id,gps_device_id)
  SELECT source_account_id,id FROM himoto.gps_devices WHERE source_account_id IS NOT NULL ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS himoto.management_gps_event_channels (
  account_id uuid PRIMARY KEY REFERENCES himoto.management_gps_accounts(id),
  motion_enabled boolean NOT NULL DEFAULT false,alarms_enabled boolean NOT NULL DEFAULT false,
  webhook_cipher text,webhook_rules jsonb NOT NULL DEFAULT '{}',webhook_enabled boolean NOT NULL DEFAULT false,
  last_webhook_at timestamptz,last_error text,updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO himoto.management_gps_event_channels(account_id)
  SELECT id FROM himoto.management_gps_accounts ON CONFLICT DO NOTHING;
ALTER TABLE himoto.management_gps_event_channels
  ADD COLUMN IF NOT EXISTS rules_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS webhook_covered_until timestamptz,
  ADD COLUMN IF NOT EXISTS webhook_log_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS webhook_log_success_at timestamptz,
  ADD COLUMN IF NOT EXISTS webhook_log_error text;

CREATE TABLE IF NOT EXISTS himoto.management_gps_history_cursors (
  gps_device_id bigint NOT NULL REFERENCES himoto.gps_devices(id),stream text NOT NULL CHECK(stream IN('motion','alarms')),
  account_id uuid NOT NULL REFERENCES himoto.management_gps_accounts(id),
  coverage_started_at timestamptz NOT NULL,covered_until timestamptz NOT NULL,
  last_attempt_at timestamptz,last_success_at timestamptz,last_error text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),records_received bigint NOT NULL DEFAULT 0,
  PRIMARY KEY(gps_device_id,stream)
);
CREATE INDEX IF NOT EXISTS management_gps_history_due_idx ON himoto.management_gps_history_cursors(next_attempt_at,covered_until);

CREATE TABLE IF NOT EXISTS himoto.management_gps_event_worker (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),lease_token uuid,lease_until timestamptz
);
INSERT INTO himoto.management_gps_event_worker(singleton) VALUES(true) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS himoto.management_gps_webhook_receipts (
  account_id uuid NOT NULL REFERENCES himoto.management_gps_accounts(id),event_id text NOT NULL,
  payload jsonb NOT NULL,status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','processed','unsupported','awaiting_device')),
  received_at timestamptz NOT NULL DEFAULT now(),processed_at timestamptz,next_attempt_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(account_id,event_id)
);
ALTER TABLE himoto.management_gps_webhook_receipts ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'webhook';
CREATE INDEX IF NOT EXISTS management_gps_webhook_pending_idx ON himoto.management_gps_webhook_receipts(next_attempt_at) WHERE status IN('pending','awaiting_device');

-- Only the server owner can read provider sessions, cursor leases or webhook keys.
ALTER TABLE himoto.management_gps_account_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE himoto.management_gps_event_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE himoto.management_gps_history_cursors ENABLE ROW LEVEL SECURITY;
ALTER TABLE himoto.management_gps_event_worker ENABLE ROW LEVEL SECURITY;
ALTER TABLE himoto.management_gps_webhook_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON himoto.management_gps_account_devices,himoto.management_gps_event_channels,
  himoto.management_gps_history_cursors,himoto.management_gps_event_worker,himoto.management_gps_webhook_receipts
  FROM PUBLIC,anon,authenticated,himoto_scoped;
COMMIT;
