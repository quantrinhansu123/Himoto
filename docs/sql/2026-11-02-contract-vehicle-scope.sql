-- Align vehicle labels and physical return helpers with the existing ownership/HQ
-- order scope. Apply as owner after the ownership scope-helper migration.
-- No data rows change. Refuse unexpected definitions instead of rewriting them.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $migration$
DECLARE signature text; definition text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'himoto.contract_vehicle_labels()',
    'himoto.complete_contract_vehicle_return(bigint,timestamp with time zone)',
    'himoto.release_returned_contract_vehicle(bigint)'
  ] LOOP
    definition:=pg_get_functiondef(signature::regprocedure);
    IF position('himoto.access_store(o.store_id)' IN definition)>0 THEN
      EXECUTE replace(definition,'himoto.access_store(o.store_id)','himoto.access_order_store(o.store_id)');
    ELSIF position('himoto.access_order_store(o.store_id)' IN definition)=0 THEN
      RAISE EXCEPTION 'Unexpected scope predicate in %',signature;
    END IF;
  END LOOP;
END $migration$;
COMMIT;
