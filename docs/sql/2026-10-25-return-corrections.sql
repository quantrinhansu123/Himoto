-- Only definitions: no existing returns, receipts or inventory are changed.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE OR REPLACE FUNCTION himoto.correct_returned_contract_time(target bigint, actual timestamptz)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,himoto AS $$
DECLARE vehicle bigint; previous timestamptz;
BEGIN
 IF himoto.access_actor() IS NULL OR actual IS NULL OR actual>now()+interval '5 minutes' THEN
   RAISE EXCEPTION 'not authorized' USING ERRCODE='42501';
 END IF;
 SELECT d.vehicle_id,d.completed_at INTO vehicle,previous FROM himoto.order_vehicle_details d JOIN himoto.orders o ON o.id=d.order_id
 WHERE d.id=target AND d.deleted_at IS NULL AND d.completed_at IS NOT NULL AND o.deleted_at IS NULL AND himoto.access_store(o.store_id);
 IF NOT FOUND THEN RAISE EXCEPTION 'returned line unavailable' USING ERRCODE='42501'; END IF;
 -- Look across branches: a corrected time cannot overlap a later handover.
 PERFORM 1 FROM himoto.vehicles v WHERE v.id=vehicle FOR UPDATE;
 IF actual>previous AND EXISTS(SELECT 1 FROM himoto.order_vehicle_details d JOIN himoto.orders o ON o.id=d.order_id
   WHERE d.vehicle_id=vehicle AND d.id<>target AND d.deleted_at IS NULL AND o.deleted_at IS NULL
     AND o.order_status NOT IN('draft','cancelled') AND d.rent_at>=previous AND d.rent_at<actual) THEN
   RAISE EXCEPTION 'return overlaps subsequent handover' USING ERRCODE='22023';
 END IF;
 UPDATE himoto.order_vehicle_details d SET completed_at=actual,updated_at=now()
 FROM himoto.orders o WHERE d.id=target AND o.id=d.order_id AND himoto.access_store(o.store_id)
   AND o.deleted_at IS NULL AND d.deleted_at IS NULL AND d.completed_at IS NOT NULL
   AND o.order_status IN('renting','overdue','wait_payment','completed')
   AND COALESCE(o.draft_payload #>> '{legacy_migration,sourceStoreId}','')<>'30'
   AND (d.rent_at IS NULL OR actual>=d.rent_at);
 IF NOT FOUND THEN RAISE EXCEPTION 'returned line unavailable' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION himoto.correct_returned_contract_time(bigint,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION himoto.correct_returned_contract_time(bigint,timestamptz) TO himoto_scoped;
COMMIT;
