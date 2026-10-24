-- Controlled historical entry: never change the vehicle's present stock state.
-- Function definitions only; no business rows change during this migration.
BEGIN;
SET LOCAL lock_timeout='5s';

CREATE OR REPLACE FUNCTION himoto.vehicle_history_conflict_ids(targets bigint[], target_order bigint, period_start timestamptz, actual_end timestamptz)
RETURNS TABLE(vehicle_id bigint) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,himoto AS $$
BEGIN
 IF himoto.access_actor() IS NULL OR period_start IS NULL OR actual_end IS NULL OR actual_end<period_start OR actual_end>now()+interval '5 minutes'
   OR NOT EXISTS(SELECT 1 FROM himoto.orders o WHERE o.id=target_order AND o.order_status='draft' AND o.deleted_at IS NULL AND himoto.access_store(o.store_id)) THEN
   RAISE EXCEPTION 'not authorized' USING ERRCODE='42501';
 END IF;
 RETURN QUERY SELECT DISTINCT d.vehicle_id::bigint FROM himoto.order_vehicle_details d JOIN himoto.orders o ON o.id=d.order_id
 WHERE d.vehicle_id=ANY(targets) AND d.order_id<>target_order AND d.deleted_at IS NULL AND o.deleted_at IS NULL
   AND COALESCE(o.draft_payload #>> '{legacy_migration,sourceStoreId}','')<>'30'
   AND o.order_status IN('renting','overdue','wait_payment','pending','bad_debt','completed')
   AND COALESCE(d.rent_at,o.rent_at,'-infinity'::timestamptz)<actual_end
   AND COALESCE(d.completed_at,CASE WHEN o.order_status='completed' THEN COALESCE(d.return_at,o.return_at) END,'infinity'::timestamptz)>period_start;
END $$;
REVOKE ALL ON FUNCTION himoto.vehicle_history_conflict_ids(bigint[],bigint,timestamptz,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION himoto.vehicle_history_conflict_ids(bigint[],bigint,timestamptz,timestamptz) TO himoto_scoped;

CREATE OR REPLACE FUNCTION himoto.extend_returned_contract_vehicle_line(target bigint, target_order bigint, revision text, next_return timestamptz, extra_amount bigint, occurred timestamptz)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,himoto AS $$
BEGIN
 IF himoto.access_actor() IS NULL OR occurred IS NULL OR occurred>now()+interval '5 minutes' OR extra_amount<0 THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
 UPDATE himoto.order_vehicle_details d SET return_at=next_return,total_renewal_amount=COALESCE(d.total_renewal_amount,0)+extra_amount,updated_at=now()
 FROM himoto.orders o WHERE d.id=target AND d.order_id=target_order AND o.id=d.order_id AND himoto.access_store(o.store_id)
   AND o.deleted_at IS NULL AND d.deleted_at IS NULL AND d.completed_at IS NOT NULL AND d.xmin::text=revision
   AND o.order_status IN('completed','wait_payment','bad_debt') AND next_return>d.return_at
   AND occurred<=d.completed_at AND (d.rent_at IS NULL OR occurred>=d.rent_at)
   AND COALESCE(o.draft_payload #>> '{legacy_migration,sourceStoreId}','')<>'30';
 IF NOT FOUND THEN RAISE EXCEPTION 'historical rental line unavailable' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION himoto.extend_returned_contract_vehicle_line(bigint,bigint,text,timestamptz,bigint,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION himoto.extend_returned_contract_vehicle_line(bigint,bigint,text,timestamptz,bigint,timestamptz) TO himoto_scoped;
COMMIT;
