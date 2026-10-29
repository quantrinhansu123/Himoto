-- Retain vehicle rows used by historical contracts while removing deleted stock
-- from the shared inventory. Existing function owner, signature and grants stay intact.
BEGIN;
SET LOCAL lock_timeout='5s';

ALTER TABLE himoto.vehicles ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
COMMENT ON COLUMN himoto.vehicles.deleted_at IS
  'Soft deletion: retain historical vehicle labels and references; exclude from active inventory.';

DO $migration$
DECLARE
  definition text;
  source_clause text := 'FROM himoto.vehicles v';
  active_clause text := 'FROM (SELECT * FROM himoto.vehicles WHERE deleted_at IS NULL) v';
BEGIN
  SELECT pg_get_functiondef('himoto.vehicle_inventory()'::regprocedure) INTO definition;
  IF position(active_clause IN definition)>0 THEN
    RETURN;
  END IF;
  IF position(source_clause IN definition)=0
    OR (length(definition)-length(replace(definition,source_clause,'')))/length(source_clause)<>1 THEN
    RAISE EXCEPTION 'Unexpected vehicle_inventory definition; review before changing it';
  END IF;
  EXECUTE replace(definition,source_clause,active_clause);
END
$migration$;

COMMIT;
