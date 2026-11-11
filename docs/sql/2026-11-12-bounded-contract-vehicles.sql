BEGIN;
SET LOCAL lock_timeout='5s';
-- Match contract_vehicle_labels visibility, including archived vehicle labels.
-- Warehouse fields match vehicle_inventory's non-deleted stock locations only.
CREATE OR REPLACE FUNCTION himoto.contract_vehicles_for_orders(order_ids bigint[])
RETURNS TABLE(id bigint,name text,license text,brand text,type text,year integer,color text,store_id bigint,
  warehouse_id bigint,warehouse_store_id bigint,warehouse_store_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,himoto AS $$
  WITH visible_vehicles AS MATERIALIZED (
    SELECT DISTINCT d.vehicle_id
    FROM himoto.orders o JOIN himoto.order_vehicle_details d ON d.order_id=o.id
    WHERE o.id=ANY(order_ids) AND o.deleted_at IS NULL AND d.deleted_at IS NULL
      AND himoto.access_actor() IS NOT NULL AND himoto.access_order_store(o.store_id)
  )
  SELECT v.id::bigint,v.name::text,v.license::text,v.brand::text,v.type::text,v.year::integer,v.color::text,v.store_id::bigint,
    CASE WHEN v.deleted_at IS NULL THEN v.id::bigint END,
    CASE WHEN v.deleted_at IS NULL THEN COALESCE(v.current_store_id,v.store_id)::bigint END,
    CASE WHEN v.deleted_at IS NULL THEN s.store_name::text END
  FROM visible_vehicles visible JOIN himoto.vehicles v ON v.id=visible.vehicle_id
  LEFT JOIN himoto.stores s ON s.id=COALESCE(v.current_store_id,v.store_id)
$$;
REVOKE ALL ON FUNCTION himoto.contract_vehicles_for_orders(bigint[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION himoto.contract_vehicles_for_orders(bigint[]) TO himoto_scoped;
-- List filters need labels/locations, not availability, blocking rentals or
-- transfer history. Match those three projections of vehicle_inventory().
CREATE OR REPLACE FUNCTION himoto.contract_vehicle_locations()
RETURNS TABLE(id bigint,store_id bigint,store_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,himoto AS $$
  SELECT v.id::bigint,COALESCE(v.current_store_id,v.store_id)::bigint,s.store_name::text
  FROM himoto.vehicles v LEFT JOIN himoto.stores s ON s.id=COALESCE(v.current_store_id,v.store_id)
  WHERE v.deleted_at IS NULL AND himoto.access_actor() IS NOT NULL
$$;
CREATE OR REPLACE FUNCTION himoto.contract_search_vehicles(needle text)
RETURNS TABLE(id bigint,license text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,himoto AS $$
  SELECT v.id::bigint,v.license::text FROM himoto.vehicles v
  WHERE v.deleted_at IS NULL AND himoto.access_actor() IS NOT NULL
    AND (v.license ILIKE needle OR regexp_replace(upper(COALESCE(v.license,'')),'[^A-Z0-9]','','g')
      LIKE '%'||regexp_replace(upper(needle),'[^A-Z0-9]','','g')||'%')
$$;
REVOKE ALL ON FUNCTION himoto.contract_vehicle_locations(),himoto.contract_search_vehicles(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION himoto.contract_vehicle_locations(),himoto.contract_search_vehicles(text) TO himoto_scoped;
CREATE OR REPLACE FUNCTION himoto.contract_read_store_ids() RETURNS bigint[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,himoto AS $$
  WITH stores AS MATERIALIZED (SELECT DISTINCT o.store_id FROM himoto.orders o WHERE o.deleted_at IS NULL)
  SELECT COALESCE(array_agg(s.store_id),'{}'::bigint[]) FROM stores s
  WHERE himoto.access_actor() IS NOT NULL AND himoto.access_order_store(s.store_id)
$$;
REVOKE ALL ON FUNCTION himoto.contract_read_store_ids() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION himoto.contract_read_store_ids() TO himoto_scoped;
CREATE OR REPLACE FUNCTION himoto.contract_search_order_ids(needle text) RETURNS TABLE(id bigint)
LANGUAGE sql STABLE SECURITY DEFINER ROWS 10 SET search_path=pg_catalog,himoto AS $$
  WITH permitted AS MATERIALIZED (SELECT himoto.contract_read_store_ids() AS stores),
  orders AS MATERIALIZED (
    SELECT o.id,o.contract_number,o.draft_reference,o.customer_name,o.customer_phone,o.customer_idnumber,o.customer_id
    FROM himoto.orders o CROSS JOIN permitted p WHERE o.deleted_at IS NULL
      AND (o.store_id=ANY(p.stores) OR o.store_id IS NULL AND array_position(p.stores,NULL) IS NOT NULL)
  ), plates AS MATERIALIZED (
    SELECT DISTINCT d.order_id FROM himoto.order_vehicle_details d
    JOIN himoto.contract_search_vehicles(needle) v ON v.id=d.vehicle_id WHERE d.deleted_at IS NULL
  )
  SELECT o.id FROM orders o LEFT JOIN himoto.customers c ON c.id=o.customer_id
  WHERE o.contract_number ILIKE needle OR o.draft_reference ILIKE needle
    OR lower(translate(regexp_replace(normalize(COALESCE(o.customer_name,''),NFD) COLLATE "C",'[̀-ͯ]','','g'),'đĐ','dD')) LIKE lower(translate(regexp_replace(normalize(COALESCE(needle,''),NFD) COLLATE "C",'[̀-ͯ]','','g'),'đĐ','dD'))
    OR COALESCE(o.customer_phone,'') ILIKE needle OR COALESCE(o.customer_idnumber,'') ILIKE needle
    OR lower(translate(regexp_replace(normalize(COALESCE(c.name,''),NFD) COLLATE "C",'[̀-ͯ]','','g'),'đĐ','dD')) LIKE lower(translate(regexp_replace(normalize(COALESCE(needle,''),NFD) COLLATE "C",'[̀-ͯ]','','g'),'đĐ','dD'))
    OR COALESCE(c.phone,'') ILIKE needle OR COALESCE(c.id_card,'') ILIKE needle
    OR o.id IN(SELECT p.order_id FROM plates p)
$$;
REVOKE ALL ON FUNCTION himoto.contract_search_order_ids(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION himoto.contract_search_order_ids(text) TO himoto_scoped;
COMMIT;
