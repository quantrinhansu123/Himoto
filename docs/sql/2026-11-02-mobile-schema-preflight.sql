-- Read-only catalog inspection before mobile rollout. Returns no business rows,
-- passwords, tokens, connection strings or provider settings. Does not migrate.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '10s';
SET LOCAL lock_timeout = '2s';

WITH session_columns AS (
  SELECT a.attname
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = to_regclass('himoto.management_mobile_sessions')
    AND a.attnum > 0 AND NOT a.attisdropped
), expected AS (
  SELECT ARRAY['id','user_id','token_hash','password_version','device_name',
    'platform','created_at','expires_at','revoked_at']::text[] AS current_columns,
    ARRAY['id','user_id','access_token_hash','refresh_token_hash',
      'access_expires_at','refresh_expires_at','created_at','revoked_at']::text[] AS legacy_columns
), actual AS (
  SELECT COALESCE(array_agg(attname::text), ARRAY[]::text[]) AS columns FROM session_columns
)
SELECT CASE
  WHEN to_regclass('himoto.management_mobile_sessions') IS NULL THEN 'missing'
  WHEN actual.columns @> expected.current_columns AND actual.columns @> expected.legacy_columns
    THEN 'mixed_requires_review'
  WHEN actual.columns @> expected.current_columns THEN 'current_columns_present_requires_constraints_and_grants_review'
  WHEN actual.columns @> expected.legacy_columns THEN 'legacy_requires_transition_before_current_mobile'
  ELSE 'unknown_requires_review'
END AS mobile_session_schema
FROM expected CROSS JOIN actual;

SELECT a.attname AS session_column,
  pg_catalog.format_type(a.atttypid,a.atttypmod) AS data_type,
  a.attnotnull AS required
FROM pg_catalog.pg_attribute a
WHERE a.attrelid=to_regclass('himoto.management_mobile_sessions')
  AND a.attnum>0 AND NOT a.attisdropped
ORDER BY a.attnum;

-- Inspect every existing mobile table, not just tables named in an older handoff.
SELECT c.relname AS table_name,c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='himoto' AND c.relname LIKE 'management\_mobile\_%' ESCAPE '\'
  AND c.relkind IN ('r','p')
ORDER BY c.relname;

SELECT c.relname AS table_name,p.polname AS policy_name,
  p.polcmd AS command,p.polpermissive AS permissive,
  ARRAY(SELECT CASE WHEN role_id=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(role_id)::text END
    FROM unnest(p.polroles) AS role_id) AS roles
FROM pg_catalog.pg_policy p
JOIN pg_catalog.pg_class c ON c.oid=p.polrelid
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='himoto' AND c.relname LIKE 'management\_mobile\_%' ESCAPE '\'
ORDER BY c.relname,p.polname;

SELECT grantee,table_name,privilege_type
FROM information_schema.table_privileges
WHERE table_schema='himoto' AND table_name LIKE 'management\_mobile\_%' ESCAPE '\'
ORDER BY table_name,grantee,privilege_type;

-- Merely finding expected columns does not certify live auth, rollout order,
-- constraints, application feature gates or the actor/scope behavior of RLS.
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema='himoto' AND table_name='management_mobile_requests'
    AND column_name='resource_key' AND data_type='character varying'
    AND character_maximum_length=160 AND is_nullable='YES'
) THEN 'text_receipt_column_present_requires_role_and_transaction_review'
ELSE 'text_receipt_column_missing_or_incompatible_do_not_enable_catalogue_writes'
END AS contract_type_mobile_receipt_readiness;

-- Historical renewal uses the existing web helper; inspect only, never apply it.
WITH target AS (
  SELECT to_regprocedure('himoto.extend_returned_contract_vehicle_line(bigint,bigint,text,timestamptz,bigint,timestamptz)') AS helper,
    to_regrole('himoto_scoped') AS scoped_role
)
SELECT CASE WHEN helper IS NULL THEN 'historical_renewal_helper_missing_do_not_enable_returned_line_writes'
  ELSE 'historical_renewal_helper_present_requires_definition_and_scope_review' END AS historical_renewal_readiness,
  CASE WHEN helper IS NOT NULL AND scoped_role IS NOT NULL
    THEN has_function_privilege(scoped_role::oid,helper::oid,'EXECUTE') END AS scoped_can_execute,
  p.prosecdef AS security_definer,p.proconfig AS function_configuration
FROM target LEFT JOIN pg_catalog.pg_proc p ON p.oid=helper::oid;
ROLLBACK;
