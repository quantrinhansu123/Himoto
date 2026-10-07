BEGIN;
SET LOCAL lock_timeout = '5s';
-- The live DB already has color varchar(255); this also supports an older DB.
ALTER TABLE himoto.vehicles ADD COLUMN IF NOT EXISTS color varchar(255);

-- Durable snapshots: backup + import/reset commit or roll back together.
CREATE TABLE IF NOT EXISTS himoto.vehicle_import_backups (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint NOT NULL,
  action text NOT NULL CHECK (action IN ('sync', 'replace', 'reset')),
  row_count integer NOT NULL CHECK (row_count >= 0),
  sha256 char(64) NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'array')
);
ALTER TABLE himoto.vehicle_import_backups ENABLE ROW LEVEL SECURITY;
-- Access only through the authenticated server (DB role has table-owner rights).
REVOKE ALL ON himoto.vehicle_import_backups FROM anon, authenticated;
COMMIT;
