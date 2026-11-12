BEGIN;
SET LOCAL lock_timeout='5s';

-- FOR SHARE evaluates UPDATE USING in addition to SELECT policies. Preserve
-- the current branch-edit rules and WITH CHECK while allowing reference locks
-- for a transfer request pinned to one vehicle. This grants no new store writes.
DO $$
DECLARE existing_using text;
BEGIN
  SELECT qual INTO STRICT existing_using FROM pg_policies
    WHERE schemaname='himoto' AND tablename='stores'
      AND policyname='management_scoped_update' AND cmd='UPDATE';
  IF position('access_transfer_vehicle' IN existing_using)=0 THEN
    EXECUTE format(
      'ALTER POLICY management_scoped_update ON himoto.stores USING ((%s) OR himoto.access_transfer_vehicle(NULLIF(current_setting(''himoto.transfer_vehicle_id'',true),'''')::bigint))',
      existing_using);
  END IF;
END $$;

COMMIT;
