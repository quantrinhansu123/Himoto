BEGIN;
-- Reference rates imported from the old app; expose only the columns needed
-- for read-only overdue estimates. Contract/customer RLS remains unchanged.
GRANT SELECT (id,type,price_type,price) ON himoto.pricing TO himoto_scoped;
COMMIT;
