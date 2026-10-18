BEGIN;
SET LOCAL lock_timeout='5s';
-- Exact reference lookup on the caller's connection. Customer writers hold a
-- table lock; borrowing another pooled connection here can starve that pool.
CREATE OR REPLACE FUNCTION himoto.find_customer_duplicate(document text,phone_digits text,excluded_id bigint)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,himoto AS $$
  SELECT c.id FROM himoto.customers c
  WHERE (excluded_id IS NULL OR c.id<>excluded_id)
    AND ((document<>'' AND upper(regexp_replace(COALESCE(c.id_card,''),'[[:space:]]','','g'))=upper(document))
      OR (document='' AND phone_digits<>'' AND regexp_replace(COALESCE(c.phone,''),'[^0-9]','','g')=phone_digits))
  ORDER BY c.id LIMIT 1
$$;
REVOKE ALL ON FUNCTION himoto.find_customer_duplicate(text,text,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION himoto.find_customer_duplicate(text,text,bigint) TO himoto_scoped;
COMMIT;
