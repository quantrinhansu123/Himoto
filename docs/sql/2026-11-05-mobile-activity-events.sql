-- New events only. Business writes and their event are committed together.
-- Apply as owner after reviewing and testing against the target schema.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS himoto.management_mobile_activity_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_key text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('contract_created','renewal','return','payment','transfer')),
  action text CHECK(action IS NULL OR action IN ('sent','received','rejected','cancelled')),
  resource_id bigint NOT NULL CHECK (resource_id > 0),
  store_id bigint,
  other_store_id bigint,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS mobile_activity_events_time ON himoto.management_mobile_activity_events(created_at DESC,id DESC);
ALTER TABLE himoto.management_mobile_activity_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON himoto.management_mobile_activity_events FROM PUBLIC,anon,authenticated,himoto_scoped;
GRANT SELECT ON himoto.management_mobile_activity_events TO himoto_scoped;
DROP POLICY IF EXISTS mobile_activity_scoped_read ON himoto.management_mobile_activity_events;
CREATE POLICY mobile_activity_scoped_read ON himoto.management_mobile_activity_events FOR SELECT TO himoto_scoped
  USING ((himoto.access_store(store_id) OR himoto.access_store(other_store_id)) AND
    ((kind='transfer' AND EXISTS(SELECT 1 FROM himoto.vehicles v WHERE v.id=resource_id AND v.deleted_at IS NULL)) OR
     (kind<>'transfer' AND EXISTS(SELECT 1 FROM himoto.orders o WHERE o.id=resource_id AND o.deleted_at IS NULL))));

ALTER TABLE himoto.management_mobile_push_devices ADD COLUMN IF NOT EXISTS activity_enabled_at timestamptz;
ALTER TABLE himoto.management_mobile_push_devices ADD COLUMN IF NOT EXISTS test_sent_at timestamptz;
CREATE TABLE IF NOT EXISTS himoto.management_mobile_activity_deliveries (
  token_hash char(64) NOT NULL REFERENCES himoto.management_mobile_push_devices(token_hash),
  event_id bigint NOT NULL REFERENCES himoto.management_mobile_activity_events(id),
  outcome text NOT NULL CHECK(outcome IN ('sending','sent','unknown','failed','ignored')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  PRIMARY KEY(token_hash,event_id)
);
ALTER TABLE himoto.management_mobile_activity_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON himoto.management_mobile_activity_deliveries FROM PUBLIC,anon,authenticated,himoto_scoped;

CREATE OR REPLACE FUNCTION himoto.mobile_activity_order() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,himoto AS $$
DECLARE entry jsonb; version text; position bigint; previous_returns integer;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;
  IF (TG_OP='INSERT' OR OLD.order_status='draft') AND NEW.order_status IN ('renting','pending','deposit_contract','wait_payment','completed') THEN
    INSERT INTO himoto.management_mobile_activity_events(event_key,kind,resource_id,store_id)
      VALUES('contract:'||NEW.id,'contract_created',NEW.id,NEW.store_id) ON CONFLICT(event_key) DO NOTHING;
  END IF;
  IF TG_OP='UPDATE' AND NEW.draft_payload::jsonb IS DISTINCT FROM OLD.draft_payload::jsonb THEN
    FOR entry IN SELECT value FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(NEW.draft_payload::jsonb #> '{management_composer,versions}')='array'
        THEN NEW.draft_payload::jsonb #> '{management_composer,versions}' ELSE '[]'::jsonb END)
    LOOP
      version := entry->>'version';
      IF entry->>'kind'='renewal' AND version ~ '^[1-9][0-9]{0,14}$' AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(OLD.draft_payload::jsonb #> '{management_composer,versions}')='array'
          THEN OLD.draft_payload::jsonb #> '{management_composer,versions}' ELSE '[]'::jsonb END) old_entry
        WHERE old_entry->>'kind'='renewal' AND old_entry->>'version'=version)
      THEN
        INSERT INTO himoto.management_mobile_activity_events(event_key,kind,resource_id,store_id)
          VALUES('renewal:'||NEW.id||':'||version,'renewal',NEW.id,NEW.store_id) ON CONFLICT(event_key) DO NOTHING;
      END IF;
    END LOOP;
    previous_returns := jsonb_array_length(CASE WHEN jsonb_typeof(OLD.draft_payload::jsonb #> '{management_composer,return_adjustments}')='array'
      THEN OLD.draft_payload::jsonb #> '{management_composer,return_adjustments}' ELSE '[]'::jsonb END);
    FOR entry,position IN SELECT value,ordinality FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(NEW.draft_payload::jsonb #> '{management_composer,return_adjustments}')='array'
        THEN NEW.draft_payload::jsonb #> '{management_composer,return_adjustments}' ELSE '[]'::jsonb END) WITH ORDINALITY
    LOOP
      IF position>previous_returns AND entry->>'item_id' ~ '^[1-9][0-9]{0,14}$' THEN
        INSERT INTO himoto.management_mobile_activity_events(event_key,kind,resource_id,store_id)
          VALUES('return:'||NEW.id||':'||position,'return',NEW.id,NEW.store_id) ON CONFLICT(event_key) DO NOTHING;
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION himoto.mobile_activity_payment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,himoto AS $$
BEGIN
  IF NEW.order_id IS NOT NULL AND NEW.status='approved' AND NEW.type IN ('in','addon')
    AND (NEW.name LIKE 'order:%' OR NEW.type='addon' AND NEW.name='addon')
    AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN
    INSERT INTO himoto.management_mobile_activity_events(event_key,kind,resource_id,store_id)
      VALUES('payment:'||NEW.id,'payment',NEW.order_id,NEW.store_id) ON CONFLICT(event_key) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION himoto.mobile_activity_transfer() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,himoto AS $$
BEGIN
  IF NEW.event_type IN ('manual_transfer','transfer_dispatch','manual_transfer_receive','transfer_receive','manual_transfer_reject','manual_transfer_cancel') THEN
    INSERT INTO himoto.management_mobile_activity_events(event_key,kind,action,resource_id,store_id,other_store_id)
      VALUES('transfer:'||NEW.id,'transfer',CASE WHEN NEW.event_type IN ('manual_transfer','transfer_dispatch') THEN 'sent'
        WHEN NEW.event_type IN ('manual_transfer_receive','transfer_receive') THEN 'received'
        WHEN NEW.event_type='manual_transfer_reject' THEN 'rejected' ELSE 'cancelled' END,
        NEW.vehicle_id,NEW.from_store_id,NEW.to_store_id) ON CONFLICT(event_key) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION himoto.mobile_activity_order(),himoto.mobile_activity_payment(),himoto.mobile_activity_transfer() FROM PUBLIC,anon,authenticated,himoto_scoped;
DROP TRIGGER IF EXISTS mobile_activity_order ON himoto.orders;
CREATE TRIGGER mobile_activity_order AFTER INSERT OR UPDATE OF order_status,draft_payload ON himoto.orders FOR EACH ROW EXECUTE FUNCTION himoto.mobile_activity_order();
DROP TRIGGER IF EXISTS mobile_activity_payment ON himoto.transactions;
CREATE TRIGGER mobile_activity_payment AFTER INSERT OR UPDATE OF status ON himoto.transactions FOR EACH ROW EXECUTE FUNCTION himoto.mobile_activity_payment();
DROP TRIGGER IF EXISTS mobile_activity_transfer ON himoto.vehicle_location_events;
CREATE TRIGGER mobile_activity_transfer AFTER INSERT ON himoto.vehicle_location_events FOR EACH ROW EXECUTE FUNCTION himoto.mobile_activity_transfer();
COMMIT;
