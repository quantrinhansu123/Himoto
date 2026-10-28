-- Apply after app.himoto.vn passes authenticated production checks.
-- Keep the scheduler's Vault authentication, nonce protection and in-flight job.
BEGIN;
DO $cutover$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('himoto.run_integration_schedule()'::regprocedure) INTO definition;
  IF position('https://app.himoto.vn/api/cron/integrations' IN definition)>0 THEN RETURN; END IF;
  IF position('https://himoto.vercel.app/api/cron/integrations' IN definition)=0 THEN
    RAISE EXCEPTION 'Unexpected integration scheduler endpoint';
  END IF;
  EXECUTE replace(definition,'https://himoto.vercel.app/api/cron/integrations','https://app.himoto.vn/api/cron/integrations');
END;
$cutover$;
COMMIT;
