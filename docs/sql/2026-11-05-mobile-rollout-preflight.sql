-- Catalogs only. No business records, credentials, data writes or DDL.
BEGIN READ ONLY;
SET LOCAL statement_timeout='10s';
SET LOCAL lock_timeout='2s';
WITH expected(name) AS (VALUES
 ('management_mobile_sessions'),('management_mobile_login_limits'),('management_mobile_requests'),
 ('management_mobile_bills'),('management_mobile_renewals'),('management_mobile_renewal_collections'),
 ('management_mobile_returns'),('management_mobile_swaps'),('management_mobile_recoveries'),
 ('management_mobile_vehicle_transfers'),('management_mobile_record_media'),('management_mobile_customer_photo_copies'),
 ('management_mobile_media_deletions'),('management_mobile_gps_mappings'),
 ('users'),('stores'),('customers'),('vehicles'),('orders'),('order_vehicle_details'),('transactions'),
 ('management_record_photos'),('vehicle_location_events'),('management_contract_types'),('management_account_access'),
 ('management_contract_payments'),('management_contract_vehicle_swaps'),('battery_contracts'),('staff_profiles'),
 ('store_duty_schedules'),('management_shift_reports'),('management_shift_audits'),('management_shift_media'),('management_shift_photos'),('management_shift_requests')
)
SELECT e.name AS table_name,c.oid IS NOT NULL AS present,c.relrowsecurity AS rls_enabled,
 CASE WHEN c.oid IS NOT NULL AND to_regrole('himoto_scoped') IS NOT NULL
 THEN has_table_privilege('himoto_scoped',c.oid,'SELECT') END AS scoped_select,
 CASE WHEN c.oid IS NOT NULL AND to_regrole('himoto_scoped') IS NOT NULL
 THEN has_table_privilege('himoto_scoped',c.oid,'INSERT') END AS scoped_insert,
 CASE WHEN c.oid IS NOT NULL AND to_regrole('himoto_scoped') IS NOT NULL
 THEN has_table_privilege('himoto_scoped',c.oid,'UPDATE') END AS scoped_update
FROM expected e LEFT JOIN pg_catalog.pg_class c ON c.oid=to_regclass('himoto.'||e.name)
ORDER BY e.name;

SELECT table_name,column_name,data_type,character_maximum_length,is_nullable
FROM information_schema.columns
WHERE table_schema='himoto' AND (
 table_name LIKE 'management\_mobile\_%' ESCAPE '\'
 OR table_name='users' AND column_name='management_password_version'
 OR table_name='vehicles' AND column_name IN('daily_price','cost_price','current_store_id')
 OR table_name='vehicle_location_events' AND column_name IN('audit_snapshot','created_by','created_at','customer_id_card')
 OR table_name='management_record_photos' AND column_name IN('object_bucket','object_key','object_etag','cloudinary_public_id')
)
ORDER BY table_name,ordinal_position;

WITH expected(signature) AS (VALUES
 ('himoto.vehicle_inventory()'),('himoto.vehicle_other_rental_conflicts(bigint[],bigint)'),
 ('himoto.actor_owns_lease_store()'),('himoto.is_headquarters_store(bigint)'),
 ('himoto.contract_vehicle_labels()'),('himoto.complete_contract_vehicle_return(bigint,timestamptz)'),('himoto.release_returned_contract_vehicle(bigint)'),
 ('himoto.ownership_may_use_headquarters_vehicle(bigint)'),('himoto.ownership_may_use_headquarters_customer_source(bigint)'),
 ('himoto.lock_customer_for_rental(bigint)'),('himoto.staff_for_contract(bigint)'),
 ('himoto.extend_returned_contract_vehicle_line(bigint,bigint,text,timestamptz,bigint,timestamptz)')
)
SELECT e.signature,p.oid IS NOT NULL AS present,p.prosecdef AS security_definer,p.proconfig AS configuration,
 CASE WHEN p.oid IS NOT NULL AND to_regrole('himoto_scoped') IS NOT NULL
 THEN has_function_privilege('himoto_scoped',p.oid,'EXECUTE') END AS scoped_execute
FROM expected e LEFT JOIN pg_catalog.pg_proc p ON p.oid=to_regprocedure(e.signature)
ORDER BY e.signature;

SELECT
 EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('himoto.management_record_photos') AND conname='management_record_photos_slots') AS photo_slot_constraint_present,
 (SELECT count(*) FROM pg_policy WHERE polrelid=to_regclass('himoto.management_record_photos')
   AND polname IN('management_scoped_read','management_scoped_insert','management_scoped_update','management_scoped_delete')) AS photo_scoped_policy_count;

WITH targets(signature) AS(VALUES
 ('himoto.contract_vehicle_labels()'),('himoto.complete_contract_vehicle_return(bigint,timestamptz)'),('himoto.release_returned_contract_vehicle(bigint)')
)
SELECT signature,CASE WHEN p.oid IS NOT NULL THEN
 position('himoto.access_store(o.store_id)' IN pg_get_functiondef(p.oid))>0 OR position('himoto.access_order_store(o.store_id)' IN pg_get_functiondef(p.oid))>0
 END AS scope_patch_guard_matches
FROM targets LEFT JOIN pg_proc p ON p.oid=to_regprocedure(signature)
ORDER BY signature;
ROLLBACK;
