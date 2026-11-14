-- Every authenticated workspace may read the shared customer directory.
-- Update/insert/delete and contract/finance policies retain their existing scope.
BEGIN;
SET LOCAL lock_timeout='5s';
DROP POLICY IF EXISTS management_scoped_read ON himoto.customers;
CREATE POLICY management_scoped_read ON himoto.customers AS RESTRICTIVE
FOR SELECT TO himoto_scoped USING (himoto.access_actor() IS NOT NULL);
COMMIT;
