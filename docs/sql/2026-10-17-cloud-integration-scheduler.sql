BEGIN;
SET LOCAL lock_timeout='5s';
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Managed pg_net may retain PUBLIC queue access. Queue only a signed, expiring,
-- single-use proof; never put the reusable Vault key in HTTP headers or SQL text.
REVOKE ALL ON SCHEMA cron FROM PUBLIC,anon,authenticated,himoto_scoped;
REVOKE ALL ON ALL TABLES IN SCHEMA cron FROM PUBLIC,anon,authenticated,himoto_scoped;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA cron FROM PUBLIC,anon,authenticated,himoto_scoped;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA cron FROM PUBLIC,anon,authenticated,himoto_scoped;
REVOKE ALL ON vault.decrypted_secrets FROM PUBLIC,anon,authenticated,himoto_scoped;

CREATE TABLE IF NOT EXISTS himoto.management_integration_schedule (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  enabled boolean NOT NULL DEFAULT false,
  secret_id uuid REFERENCES vault.secrets(id),
  last_request_id bigint,last_response_id bigint,
  last_dispatched_at timestamptz,last_response_at timestamptz,
  last_http_status integer,last_error_code text,next_attempt_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO himoto.management_integration_schedule(singleton) VALUES(true) ON CONFLICT DO NOTHING;
ALTER TABLE himoto.management_integration_schedule ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON himoto.management_integration_schedule FROM PUBLIC,anon,authenticated,himoto_scoped;

-- Invoker permissions: only the database owner may run this function. Cron stores
-- only the function name; its bearer token is read from encrypted Supabase Vault.
CREATE OR REPLACE FUNCTION himoto.run_integration_schedule() RETURNS bigint
LANGUAGE plpgsql SET search_path=pg_catalog,himoto,net,vault AS $$
DECLARE
  job himoto.management_integration_schedule%ROWTYPE;
  response net._http_response%ROWTYPE;
  result jsonb;
  token text;
  request_id bigint;
  failure text;
  proof_time text;
  proof_nonce text;
  proof_signature text;
BEGIN
  SELECT * INTO job FROM himoto.management_integration_schedule WHERE singleton=true FOR UPDATE SKIP LOCKED;
  IF NOT FOUND OR NOT job.enabled THEN RETURN NULL; END IF;
  IF job.last_request_id IS NOT NULL AND job.last_response_id IS DISTINCT FROM job.last_request_id THEN
    SELECT * INTO response FROM net._http_response WHERE id=job.last_request_id;
    IF NOT FOUND THEN
      IF job.last_dispatched_at>clock_timestamp()-interval '70 seconds' THEN RETURN NULL; END IF;
      failure:='HTTP_TIMEOUT';
    ELSE
      BEGIN result:=response.content::jsonb; EXCEPTION WHEN others THEN result:=NULL; END;
      IF response.timed_out OR response.error_msg IS NOT NULL THEN failure:='HTTP_FAILED';
      ELSIF response.status_code IS DISTINCT FROM 200 OR result->>'status' IS DISTINCT FROM 'success' THEN failure:='HTTP_REJECTED';
      ELSIF COALESCE((result->'gps'->>'attempted')::integer,0)>0 AND COALESCE((result->'gps'->>'succeeded')::integer,0)=0 THEN failure:='GPS_SYNC_FAILED';
      END IF;
    END IF;
    UPDATE himoto.management_integration_schedule SET last_response_id=job.last_request_id,last_response_at=clock_timestamp(),
      last_http_status=response.status_code,last_error_code=failure,
      next_attempt_at=CASE WHEN failure IS NOT NULL THEN clock_timestamp()+interval '30 seconds' END,
      enabled=CASE WHEN response.status_code IN(401,403) THEN false ELSE enabled END,updated_at=clock_timestamp() WHERE singleton=true RETURNING * INTO job;
    IF NOT job.enabled OR failure IS NOT NULL THEN RETURN NULL; END IF;
  END IF;
  IF job.next_attempt_at>clock_timestamp() OR job.last_dispatched_at>clock_timestamp()-interval '4 seconds' THEN RETURN NULL; END IF;
  SELECT decrypted_secret INTO token FROM vault.decrypted_secrets WHERE id=job.secret_id;
  IF token IS NULL OR token!~'^[a-f0-9]{64}$' THEN
    UPDATE himoto.management_integration_schedule SET enabled=false,last_error_code='SECRET_MISSING',updated_at=clock_timestamp() WHERE singleton=true;
    RETURN NULL;
  END IF;
  proof_time:=floor(extract(epoch FROM clock_timestamp()))::bigint::text;
  proof_nonce:=gen_random_uuid()::text;
  proof_signature:=encode(extensions.hmac('himoto-scheduler-v1:POST:/api/cron/integrations:'||proof_time||':'||proof_nonce,token,'sha256'),'hex');
  request_id:=net.http_post(
    url:='https://himoto.vercel.app/api/cron/integrations',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Himoto-Scheduler '||proof_time||':'||proof_nonce||':'||proof_signature),
    body:='{"source":"supabase-cron"}'::jsonb,timeout_milliseconds:=55000
  );
  UPDATE himoto.management_integration_schedule SET last_request_id=request_id,last_dispatched_at=clock_timestamp(),updated_at=clock_timestamp() WHERE singleton=true;
  RETURN request_id;
END;
$$;
REVOKE ALL ON FUNCTION himoto.run_integration_schedule() FROM PUBLIC,anon,authenticated,himoto_scoped;
COMMIT;
