BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE IF NOT EXISTS himoto.management_gps_job_schedule(
  job text PRIMARY KEY CHECK(job IN('gps-live','gps-history')),enabled boolean NOT NULL DEFAULT false,
  last_request_id bigint,last_response_id bigint,last_dispatched_at timestamptz,last_response_at timestamptz,
  last_http_status integer,last_error_code text,next_attempt_at timestamptz
);
INSERT INTO himoto.management_gps_job_schedule(job) VALUES('gps-live'),('gps-history') ON CONFLICT DO NOTHING;
ALTER TABLE himoto.management_gps_job_schedule ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON himoto.management_gps_job_schedule FROM PUBLIC,anon,authenticated,himoto_scoped;

CREATE OR REPLACE FUNCTION himoto.run_gps_schedule(lane text) RETURNS bigint
LANGUAGE plpgsql SET search_path=pg_catalog,himoto,net,vault AS $$
DECLARE
  job himoto.management_gps_job_schedule%ROWTYPE;
  response net._http_response%ROWTYPE;
  settings himoto.management_integration_schedule%ROWTYPE;
  result jsonb;token text;request_id bigint;failure text;
  proof_time text;proof_nonce text;proof_signature text;endpoint text;
BEGIN
  IF lane NOT IN('gps-live','gps-history') THEN RETURN NULL; END IF;
  SELECT * INTO settings FROM himoto.management_integration_schedule WHERE singleton=true;
  IF NOT FOUND OR NOT settings.enabled THEN RETURN NULL; END IF;
  SELECT * INTO job FROM himoto.management_gps_job_schedule WHERE management_gps_job_schedule.job=lane FOR UPDATE SKIP LOCKED;
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
      ELSIF lane='gps-live' AND COALESCE((result->'gps'->>'attempted')::integer,0)>0
        AND COALESCE((result->'gps'->>'succeeded')::integer,0)=0 THEN failure:='GPS_SYNC_FAILED';
      END IF;
    END IF;
    UPDATE himoto.management_gps_job_schedule SET last_response_id=job.last_request_id,last_response_at=clock_timestamp(),
      last_http_status=response.status_code,last_error_code=failure,
      next_attempt_at=CASE WHEN failure IS NOT NULL THEN clock_timestamp()+interval '30 seconds' END,
      enabled=CASE WHEN response.status_code IN(401,403) THEN false ELSE enabled END
      WHERE management_gps_job_schedule.job=lane RETURNING * INTO job;
    IF NOT job.enabled OR failure IS NOT NULL THEN RETURN NULL; END IF;
  END IF;
  IF job.next_attempt_at>clock_timestamp() OR job.last_dispatched_at>clock_timestamp()-interval '4 seconds' THEN RETURN NULL; END IF;
  -- Cron ticks cheaply. Do not start a serverless live collector until an
  -- account is due; the collector's atomic lease remains authoritative.
  IF lane='gps-live' AND NOT EXISTS(SELECT 1 FROM himoto.management_gps_accounts a
    WHERE a.enabled AND (a.last_attempt_at IS NULL OR a.last_attempt_at<clock_timestamp()-interval '60 seconds')
      AND (a.sync_lease_until IS NULL OR a.sync_lease_until<clock_timestamp())
      AND (a.next_attempt_at IS NULL OR a.next_attempt_at<=clock_timestamp())) THEN RETURN NULL; END IF;
  IF lane='gps-history' AND NOT EXISTS(SELECT 1 FROM himoto.management_gps_event_channels c
    JOIN himoto.management_gps_accounts a ON a.id=c.account_id AND a.enabled
    WHERE c.motion_enabled OR c.alarms_enabled OR c.webhook_enabled) THEN RETURN NULL; END IF;
  IF lane='gps-history' AND job.last_dispatched_at>clock_timestamp()-interval '60 seconds'
    AND NOT EXISTS(SELECT 1 FROM himoto.management_gps_webhook_receipts w WHERE w.status IN('pending','awaiting_device') AND w.next_attempt_at<=clock_timestamp())
    AND NOT EXISTS(SELECT 1 FROM himoto.management_gps_history_cursors c
      JOIN himoto.management_gps_accounts a ON a.id=c.account_id AND a.enabled
      JOIN himoto.management_gps_event_channels s ON s.account_id=a.id
      WHERE c.next_attempt_at<=clock_timestamp() AND a.session_expires_at>clock_timestamp()+interval '10 seconds'
        AND a.last_success_at>clock_timestamp()-interval '5 minutes'
        AND a.last_attempt_at BETWEEN clock_timestamp()-interval '45 seconds' AND clock_timestamp()-interval '15 seconds'
        AND (s.history_pause_until IS NULL OR s.history_pause_until<=clock_timestamp())
        AND (s.history_next_request_at IS NULL OR s.history_next_request_at<=clock_timestamp())
        AND (c.stream='motion' AND s.motion_enabled OR c.stream='alarms' AND s.alarms_enabled)) THEN RETURN NULL; END IF;
  SELECT decrypted_secret INTO token FROM vault.decrypted_secrets WHERE id=settings.secret_id;
  IF token IS NULL OR token!~'^[a-f0-9]{64}$' THEN
    UPDATE himoto.management_gps_job_schedule SET enabled=false,last_error_code='SECRET_MISSING' WHERE management_gps_job_schedule.job=lane;
    RETURN NULL;
  END IF;
  endpoint:='/api/cron/'||lane;
  proof_time:=floor(extract(epoch FROM clock_timestamp()))::bigint::text;
  proof_nonce:=gen_random_uuid()::text;
  proof_signature:=encode(extensions.hmac('himoto-scheduler-v1:POST:'||endpoint||':'||proof_time||':'||proof_nonce,token,'sha256'),'hex');
  request_id:=net.http_post(url:='https://himoto.vercel.app'||endpoint,
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Himoto-Scheduler '||proof_time||':'||proof_nonce||':'||proof_signature),
    body:='{"source":"supabase-cron"}'::jsonb,timeout_milliseconds:=55000);
  UPDATE himoto.management_gps_job_schedule SET last_request_id=request_id,last_dispatched_at=clock_timestamp() WHERE management_gps_job_schedule.job=lane;
  RETURN request_id;
END;
$$;
REVOKE ALL ON FUNCTION himoto.run_gps_schedule(text) FROM PUBLIC,anon,authenticated,himoto_scoped;
COMMIT;
