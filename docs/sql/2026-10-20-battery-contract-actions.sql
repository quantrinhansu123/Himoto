BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE himoto.battery_contracts ADD COLUMN IF NOT EXISTS workflow_history jsonb NOT NULL DEFAULT '[]'::jsonb;
COMMIT;
