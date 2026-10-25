BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE OR REPLACE FUNCTION himoto.photo_base_slot(value text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT regexp_replace(value,'-extra-([2-9]|[1-9][0-9]{1,14})$','')
$$;
GRANT EXECUTE ON FUNCTION himoto.photo_base_slot(text) TO himoto_scoped;
DO $$
DECLARE current_check text; normalized_check text; p record; qualified text; checked text;
BEGIN
  SELECT pg_get_expr(conbin,conrelid) INTO STRICT current_check FROM pg_constraint
    WHERE conrelid='himoto.management_record_photos'::regclass AND conname='management_record_photos_slots';
  IF position('photo_base_slot' IN current_check)=0 THEN
    current_check:=format('(%s) OR (entity_type=''contracts'' AND slot ~ ''^vehicle-swap-[1-9][0-9]{0,14}-[1-9][0-9]{0,14}$'')',current_check);
    normalized_check:=regexp_replace(current_check,'\m(management_record_photos\.)?slot\M','himoto.photo_base_slot(slot)','g');
    ALTER TABLE himoto.management_record_photos DROP CONSTRAINT management_record_photos_slots;
    EXECUTE format('ALTER TABLE himoto.management_record_photos ADD CONSTRAINT management_record_photos_slots CHECK ((%s) OR (slot ~ ''-extra-([2-9]|[1-9][0-9]{1,14})$'' AND slot !~ ''-video-'' AND (%s)))',current_check,normalized_check);
  END IF;
  -- Supplemental transfer images must retain the exact event/branch RLS checks.
  FOR p IN SELECT polname,pg_get_expr(polqual,polrelid) AS using_clause,pg_get_expr(polwithcheck,polrelid) AS check_clause
    FROM pg_policy WHERE polrelid='himoto.management_record_photos'::regclass
  LOOP
    qualified:=p.using_clause;checked:=p.check_clause;
    IF qualified IS NOT NULL AND position('photo_base_slot' IN qualified)=0 THEN qualified:=regexp_replace(qualified,'\m(management_record_photos\.)?slot\M','himoto.photo_base_slot(slot)','g'); END IF;
    IF checked IS NOT NULL AND position('photo_base_slot' IN checked)=0 THEN checked:=regexp_replace(checked,'\m(management_record_photos\.)?slot\M','himoto.photo_base_slot(slot)','g'); END IF;
    EXECUTE format('ALTER POLICY %I ON himoto.management_record_photos%s%s',p.polname,
      CASE WHEN qualified IS NULL THEN '' ELSE format(' USING (%s)',qualified) END,
      CASE WHEN checked IS NULL THEN '' ELSE format(' WITH CHECK (%s)',checked) END);
  END LOOP;
END $$;
COMMIT;
