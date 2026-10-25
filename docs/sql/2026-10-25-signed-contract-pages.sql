-- Add signed contract pages without replacing any existing photo allowance or data.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='20s';
DO $$
DECLARE current_check text;
BEGIN
  SELECT pg_get_expr(conbin,conrelid) INTO STRICT current_check FROM pg_constraint
    WHERE conrelid='himoto.management_record_photos'::regclass AND conname='management_record_photos_slots';
  IF position('rental-signed-' IN current_check)=0 THEN
    ALTER TABLE himoto.management_record_photos DROP CONSTRAINT management_record_photos_slots;
    EXECUTE format('ALTER TABLE himoto.management_record_photos ADD CONSTRAINT management_record_photos_slots CHECK ((%s) OR (entity_type=''contracts'' AND slot ~ ''^rental-signed-[1-9][0-9]{0,14}$''))',current_check);
  END IF;
END $$;
COMMIT;
