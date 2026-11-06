BEGIN;
CREATE TABLE IF NOT EXISTS himoto.management_guide_faq (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id uuid NOT NULL UNIQUE,
  category text NOT NULL,
  question text NOT NULL,
  asked_by bigint NOT NULL,
  asker_name text NOT NULL,
  answer text NOT NULL DEFAULT '',
  answered_by bigint,
  answerer_name text,
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS himoto.management_guide_faq_images (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  faq_id bigint NOT NULL REFERENCES himoto.management_guide_faq(id) ON DELETE CASCADE,
  mime text NOT NULL,
  photo bytea NOT NULL
);
CREATE INDEX IF NOT EXISTS guide_faq_images_faq ON himoto.management_guide_faq_images(faq_id);
ALTER TABLE himoto.management_guide_faq ENABLE ROW LEVEL SECURITY;
ALTER TABLE himoto.management_guide_faq_images ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON himoto.management_guide_faq,himoto.management_guide_faq_images FROM PUBLIC;
COMMIT;
