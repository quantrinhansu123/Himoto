BEGIN;
SET LOCAL lock_timeout='5s';

ALTER TABLE himoto.gps_devices ADD COLUMN IF NOT EXISTS stopped_since timestamptz;
-- Old position/status timestamps do not establish uninterrupted observation.
-- The next successful poll starts tracking; existing history stays unchanged.

COMMIT;
