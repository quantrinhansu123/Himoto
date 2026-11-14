BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE IF NOT EXISTS himoto.management_integration_workers(
  job text PRIMARY KEY CHECK(job IN('gps-live','telegram','push')),
  lease_token uuid,lease_until timestamptz,last_started_at timestamptz,last_finished_at timestamptz,
  last_status text NOT NULL DEFAULT 'idle' CHECK(last_status IN('idle','running','success','error')),
  runs bigint NOT NULL DEFAULT 0
);
INSERT INTO himoto.management_integration_workers(job) VALUES('gps-live'),('telegram'),('push') ON CONFLICT DO NOTHING;
ALTER TABLE himoto.management_integration_workers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON himoto.management_integration_workers FROM PUBLIC,anon,authenticated,himoto_scoped;
ALTER TABLE himoto.management_gps_event_channels ADD COLUMN IF NOT EXISTS history_failures integer NOT NULL DEFAULT 0;
ALTER TABLE himoto.management_gps_event_channels ADD COLUMN IF NOT EXISTS history_next_request_at timestamptz;
ALTER TABLE himoto.management_gps_history_cursors ADD COLUMN IF NOT EXISTS window_minutes integer NOT NULL DEFAULT 58
  CHECK(window_minutes BETWEEN 5 AND 1438);
COMMIT;
