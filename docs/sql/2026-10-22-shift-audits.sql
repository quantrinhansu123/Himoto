BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE himoto.management_shift_reports ADD COLUMN IF NOT EXISTS app_snapshot jsonb;
ALTER TABLE himoto.management_shift_reports ADD COLUMN IF NOT EXISTS submitted_at timestamptz;
CREATE TABLE IF NOT EXISTS himoto.management_shift_audits (
  report_id bigint PRIMARY KEY REFERENCES himoto.management_shift_reports(id),
  store_id bigint NOT NULL REFERENCES himoto.stores(id),
  input jsonb NOT NULL, app_snapshot jsonb NOT NULL,
  status text NOT NULL CHECK(status IN('draft','confirmed')), result text NOT NULL CHECK(result IN('pending','matched','explained')),
  revision integer NOT NULL DEFAULT 1, reviewer_id bigint NOT NULL REFERENCES himoto.users(id),reviewer_name text,
  updated_at timestamptz NOT NULL DEFAULT now(), confirmed_at timestamptz
);
ALTER TABLE himoto.management_shift_audits ADD COLUMN IF NOT EXISTS reviewer_name text;
CREATE TABLE IF NOT EXISTS himoto.management_shift_media (
  id uuid PRIMARY KEY, report_id bigint NOT NULL REFERENCES himoto.management_shift_reports(id), store_id bigint NOT NULL REFERENCES himoto.stores(id),
  category text NOT NULL CHECK(category IN('vehicles','batteries','cash','personal','company','door')),
  stage text NOT NULL CHECK(stage IN('pgd','audit')), filename text NOT NULL, mime_type text NOT NULL,
  data bytea, cloudinary_public_id text, cloudinary_cloud_name text, cloudinary_version bigint,
  created_by bigint NOT NULL REFERENCES himoto.users(id), created_at timestamptz NOT NULL DEFAULT now(),
  CHECK((data IS NOT NULL AND octet_length(data) BETWEEN 1 AND 2097152 AND cloudinary_public_id IS NULL AND mime_type IN('image/jpeg','image/png','image/webp'))
     OR (data IS NULL AND cloudinary_public_id IS NOT NULL AND cloudinary_cloud_name IS NOT NULL AND cloudinary_version>0 AND mime_type IN('video/mp4','image/jpeg')))
);
CREATE INDEX IF NOT EXISTS shift_media_report ON himoto.management_shift_media(report_id,stage);
ALTER TABLE himoto.management_shift_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE himoto.management_shift_media ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shift_audit_scope ON himoto.management_shift_audits;
CREATE POLICY shift_audit_scope ON himoto.management_shift_audits TO himoto_scoped
 USING (himoto.access_store(store_id)) WITH CHECK (himoto.access_store(store_id));
DROP POLICY IF EXISTS shift_media_scope ON himoto.management_shift_media;
CREATE POLICY shift_media_scope ON himoto.management_shift_media TO himoto_scoped
 USING (himoto.access_store(store_id)) WITH CHECK (himoto.access_store(store_id));
REVOKE ALL ON himoto.management_shift_audits,himoto.management_shift_media FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON himoto.management_shift_audits TO himoto_scoped;
GRANT SELECT,INSERT,DELETE ON himoto.management_shift_media TO himoto_scoped;
ALTER TABLE himoto.management_account_access DROP CONSTRAINT IF EXISTS management_account_access_access_role_check;
ALTER TABLE himoto.management_account_access ADD CONSTRAINT management_account_access_access_role_check
 CHECK(access_role IN('branch_staff','ownership_staff','ownership_manager','hr','accounting','internal_control','admin'));
COMMIT;
