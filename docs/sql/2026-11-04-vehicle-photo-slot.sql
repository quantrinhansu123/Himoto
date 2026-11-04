BEGIN;
SET LOCAL lock_timeout='5s';

-- Allow the single primary vehicle photo in the existing vehicle document
-- slot, while preserving all deployed photo slot checks and row policies.
DO $migration$
DECLARE
  current_check text;
  photo_check text := $rule$(entity_type='vehicles' AND slot='vehicle-photo')$rule$;
  photo_scope text := $rule$(entity_type='vehicles' AND slot='vehicle-photo'
    AND EXISTS (SELECT 1 FROM himoto.vehicles v WHERE v.id=entity_id
      AND himoto.access_store(COALESCE(v.current_store_id,v.store_id))))$rule$;
  policy_record record;
  policy_count integer := 0;
BEGIN
  SELECT pg_get_expr(conbin,conrelid) INTO STRICT current_check
    FROM pg_constraint
   WHERE conrelid='himoto.management_record_photos'::regclass
     AND conname='management_record_photos_slots';
  IF position('vehicle-photo' IN current_check)=0 THEN
    ALTER TABLE himoto.management_record_photos DROP CONSTRAINT management_record_photos_slots;
    EXECUTE format('ALTER TABLE himoto.management_record_photos ADD CONSTRAINT management_record_photos_slots CHECK ((%s) OR (%s))',current_check,photo_check);
  END IF;

  FOR policy_record IN
    SELECT polname,pg_get_expr(polqual,polrelid) AS qualification,
           pg_get_expr(polwithcheck,polrelid) AS check_expression
      FROM pg_policy
     WHERE polrelid='himoto.management_record_photos'::regclass
       AND polname IN ('management_scoped_read','management_scoped_insert',
                       'management_scoped_update','management_scoped_delete')
  LOOP
    policy_count := policy_count+1;
    IF policy_record.qualification IS NOT NULL
       AND position('vehicle-photo' IN policy_record.qualification)=0 THEN
      EXECUTE format('ALTER POLICY %I ON himoto.management_record_photos USING ((%s) OR (%s))',
                     policy_record.polname,policy_record.qualification,photo_scope);
    END IF;
    IF policy_record.check_expression IS NOT NULL
       AND position('vehicle-photo' IN policy_record.check_expression)=0 THEN
      EXECUTE format('ALTER POLICY %I ON himoto.management_record_photos WITH CHECK ((%s) OR (%s))',
                     policy_record.polname,policy_record.check_expression,photo_scope);
    END IF;
  END LOOP;
  IF policy_count<>4 THEN
    RAISE EXCEPTION 'Expected four existing record-photo scope policies, found %',policy_count;
  END IF;
END
$migration$;

COMMIT;
