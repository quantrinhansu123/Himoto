BEGIN;
SET LOCAL lock_timeout='5s';

-- Only extend an existing rental line of the caller's own contract. The stock
-- branch, vehicle identity and direct vehicle-write policies remain untouched.
CREATE OR REPLACE FUNCTION himoto.extend_contract_vehicle_line(
  target bigint, contract_id bigint, revision text, deadline timestamptz, fee bigint
) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,himoto AS $$
BEGIN
  IF himoto.access_actor() IS NULL OR deadline IS NULL OR NOT isfinite(deadline)
     OR fee IS NULL OR fee<0 OR fee>9999999999999 THEN
    RAISE EXCEPTION 'invalid renewal' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM himoto.orders o JOIN himoto.order_vehicle_details d ON d.order_id=o.id
    WHERE o.id=contract_id AND d.id=target AND himoto.access_store(o.store_id)
      AND o.deleted_at IS NULL AND d.deleted_at IS NULL AND d.completed_at IS NULL
      AND o.order_status IN('renting','overdue','wait_payment')
      AND o.draft_payload #> '{management_composer,installment_plan}' IS NULL
      AND d.xmin::text=revision AND (d.return_at IS NULL OR deadline>d.return_at)
    FOR UPDATE OF o,d;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rental line unavailable' USING ERRCODE='42501';
  END IF;
  UPDATE himoto.order_vehicle_details SET return_at=deadline,
    total_renewal_amount=COALESCE(total_renewal_amount,0)+fee,updated_at=now()
    WHERE id=target AND order_id=contract_id;
END $$;
REVOKE ALL ON FUNCTION himoto.extend_contract_vehicle_line(bigint,bigint,text,timestamptz,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION himoto.extend_contract_vehicle_line(bigint,bigint,text,timestamptz,bigint) TO himoto_scoped;

COMMIT;
