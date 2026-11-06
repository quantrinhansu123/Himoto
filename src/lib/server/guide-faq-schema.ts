import 'server-only';
import { ownerDatabase } from './himoto-database';

// Provision on the same connection configuration used by the deployed FAQ API.
// Only the application owner can access these tables; authenticated routes check permissions.
const FAQ_SCHEMA = "CREATE TABLE IF NOT EXISTS himoto.management_guide_faq (\n  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,\n  request_id uuid NOT NULL UNIQUE,\n  category text NOT NULL,\n  question text NOT NULL,\n  asked_by bigint NOT NULL,\n  asker_name text NOT NULL,\n  answer text NOT NULL DEFAULT '',\n  answered_by bigint,\n  answerer_name text,\n  revision integer NOT NULL DEFAULT 1,\n  created_at timestamptz NOT NULL DEFAULT now(),\n  updated_at timestamptz NOT NULL DEFAULT now()\n);\nCREATE TABLE IF NOT EXISTS himoto.management_guide_faq_images (\n  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,\n  faq_id bigint NOT NULL REFERENCES himoto.management_guide_faq(id) ON DELETE CASCADE,\n  mime text NOT NULL,\n  photo bytea NOT NULL\n);\nCREATE INDEX IF NOT EXISTS guide_faq_images_faq ON himoto.management_guide_faq_images(faq_id);\nALTER TABLE himoto.management_guide_faq ENABLE ROW LEVEL SECURITY;\nALTER TABLE himoto.management_guide_faq_images ENABLE ROW LEVEL SECURITY;\nREVOKE ALL ON himoto.management_guide_faq,himoto.management_guide_faq_images FROM PUBLIC;\n";
let ready: Promise<void> | undefined;
export function ensureGuideFaqSchema(): Promise<void> {
  if (ready) return ready;
  ready = initialize().catch(error => { ready = undefined; throw error; });
  return ready;
}
async function initialize() {
  const existing = (await ownerDatabase.query("SELECT to_regclass('himoto.management_guide_faq') AS faq,to_regclass('himoto.management_guide_faq_images') AS images")).rows[0];
  if (existing?.faq && existing?.images) return;
  const client = await ownerDatabase.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout='10s'");
    await client.query('SELECT pg_advisory_xact_lock(73412, 601106)');
    await client.query(FAQ_SCHEMA);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}
