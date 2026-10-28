-- Restore the new application's original host after Vercel passes verification.
-- Retain Vault authentication, nonce protection and the current in-flight job.
BEGIN;
DO $restore$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('himoto.run_integration_schedule()'::regprocedure) INTO definition;
  IF position('https://himoto.vercel.app/api/cron/integrations' IN definition)>0 THEN RETURN; END IF;
  IF position('https://app.himoto.vn/api/cron/integrations' IN definition)=0 THEN
    RAISE EXCEPTION 'Unexpected integration scheduler endpoint';
  END IF;
  EXECUTE replace(definition,'https://app.himoto.vn/api/cron/integrations','https://himoto.vercel.app/api/cron/integrations');
END;
$restore$;
COMMIT;
