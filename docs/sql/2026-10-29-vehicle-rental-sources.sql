BEGIN;
SET LOCAL lock_timeout='5s';

-- Fleet lists need the current rental's branch even when its contract is outside
-- the reader's branch scope. Expose branch IDs only, never customer or money data.
CREATE OR REPLACE FUNCTION himoto.vehicle_rental_sources(targets bigint[])
RETURNS TABLE(vehicle_id bigint, store_id bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'himoto'
AS $function$
  SELECT DISTINCT ON (d.vehicle_id) d.vehicle_id::bigint, o.store_id::bigint
  FROM himoto.order_vehicle_details d
  JOIN himoto.orders o ON o.id=d.order_id
  WHERE d.vehicle_id=ANY(targets)
    AND d.deleted_at IS NULL AND d.completed_at IS NULL AND o.deleted_at IS NULL
    AND COALESCE(o.draft_payload #>> '{legacy_migration,sourceStoreId}','') <> '30'
    AND o.order_status IN ('renting','overdue','wait_payment','bad_debt')
  ORDER BY d.vehicle_id, d.rent_at DESC NULLS LAST, d.id DESC
$function$;
REVOKE ALL ON FUNCTION himoto.vehicle_rental_sources(bigint[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION himoto.vehicle_rental_sources(bigint[]) TO himoto_scoped;

COMMIT;
