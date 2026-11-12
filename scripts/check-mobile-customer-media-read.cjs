// Isolated PostgreSQL-compatible fixture, using the actual deployed-policy SQL.
require('./lib/offline-tests.cjs');
const assert = require('node:assert/strict'), path = require('node:path'), fs = require('node:fs');
const { NextRequest } = require('next/server');
const { load, root } = require('./lib/load-typescript.cjs');
const flag = process.argv.indexOf('--pglite-path');
assert(flag >= 0 && process.argv[flag+1], 'Pass --pglite-path to an existing local @electric-sql/pglite installation');
const { PGlite } = require(path.resolve(process.argv[flag+1]));
async function main() {
  const pg = new PGlite(), statements = [], checks = [];
  const raw = { release() {}, async query(sql, values) { statements.push(sql); const r = await pg.query(sql,values); return { ...r, rowCount:r.rows.length || r.affectedRows || 0 }; } };
  global.himotoPool = { connect:async()=>raw, query:raw.query.bind(raw) };
  try {
    await pg.exec(`CREATE SCHEMA himoto; CREATE ROLE himoto_scoped;
      CREATE TABLE himoto.customers(id bigint PRIMARY KEY,name text,store_id bigint);
      INSERT INTO himoto.customers VALUES(201,'Own fixture',23),(202,'Other branch fixture',24);
      CREATE TABLE himoto.orders(id bigint PRIMARY KEY,customer_id bigint,store_id bigint,deleted_at timestamptz);
      CREATE TABLE himoto.management_record_photos(entity_type text,entity_id bigint,slot text,mime_type text,data bytea,updated_at timestamptz DEFAULT now(),cloudinary_public_id text,cloudinary_cloud_name text,cloudinary_version bigint,object_bucket text,object_key text,object_etag text,storage_sha256 text,storage_bytes bigint);
      INSERT INTO himoto.management_record_photos(entity_type,entity_id,slot,mime_type,data) VALUES
        ('customers',201,'id_front','image/jpeg',decode('ffd8ff01','hex')),
        ('customers',202,'id_front','image/jpeg',decode('ffd8ff02','hex'));
      CREATE FUNCTION himoto.access_actor() RETURNS bigint LANGUAGE sql STABLE AS $$SELECT NULLIF(current_setting('himoto.actor_id',true),'')::bigint$$;
      CREATE FUNCTION himoto.access_store(id bigint) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT current_setting('himoto.scope_all',true)='true' OR id=NULLIF(current_setting('himoto.store_id',true),'')::bigint$$;
      GRANT USAGE ON SCHEMA himoto TO himoto_scoped;
      GRANT SELECT ON himoto.customers,himoto.orders,himoto.management_record_photos TO himoto_scoped;
      ALTER TABLE himoto.customers ENABLE ROW LEVEL SECURITY;
      CREATE POLICY management_scoped_gate ON himoto.customers TO himoto_scoped USING(true);
      CREATE POLICY management_scoped_read ON himoto.customers AS RESTRICTIVE FOR SELECT TO himoto_scoped USING(himoto.access_store(store_id));
      ALTER TABLE himoto.orders ENABLE ROW LEVEL SECURITY;
      CREATE POLICY orders ON himoto.orders TO himoto_scoped USING(himoto.access_store(store_id));
      ALTER TABLE himoto.management_record_photos ENABLE ROW LEVEL SECURITY;
      CREATE POLICY photos ON himoto.management_record_photos TO himoto_scoped USING(entity_type='customers' AND EXISTS(SELECT 1 FROM himoto.customers c WHERE c.id=entity_id));`);
    await pg.exec(fs.readFileSync('docs/sql/2026-11-08-global-customer-directory.sql','utf8'));
    const server = load(path.join(root,'lib/server/mobile-record-media'));
    const user = {id:7,name:'Fixture actor',access_role:'custom',role:'staff',store_id:23,scope_all:false,permissions:['customers.read']};
    const req = query => new NextRequest('https://fixture.invalid/media'+(query || ''));
    for (const id of ['201','202']) {
      const list = await server.readMobileMediaTargets(user,{entity:'customers',id},req('?page=1'));
      assert.equal(list.rows.length,1); assert.equal(list.rows[0].canWrite,id==='201');
      const target = {entity:'customers',id,kind:'customer',referenceId:id};
      const gallery = await server.readMobileRecordMedia(user,target,req('?page=1'));
      assert.equal(gallery.rows.length,1); assert(gallery.rows[0].readable);
      const photo = await server.readMobileRecordMediaImage(user,target,'id_front',req('?revision='+gallery.rows[0].revision));
      assert.deepEqual(Buffer.from(photo.data),Buffer.from(id==='201'?'ffd8ff01':'ffd8ff02','hex'));
      await assert.rejects(()=>server.readMobileRecordMediaImage(user,target,'id_front',req('?revision=999999')),e=>e.code==='MEDIA_REVIEW_REQUIRED');
    }
    await assert.rejects(()=>server.readMobileMediaTargets(user,{entity:'customers',id:'999'},req('?page=1')),e=>e.code==='NOT_FOUND');
    assert(!statements.some(sql=>/FOR SHARE|FOR UPDATE|INSERT INTO|UPDATE himoto|DELETE FROM/.test(sql)));
    checks.push('Actual target/gallery/image readers work for own and foreign customer profiles under the global directory policy with SELECT-only grants');
    checks.push('Foreign profiles remain read-only; missing profiles and changed image revisions fail; image reads use no update locks or writes');
    console.log(JSON.stringify({passed:checks.length,checks,engine:'PGlite PostgreSQL',fixtureOnly:true,operationalWrites:0,deployedPolicyVerified:false},null,2));
  } finally { delete global.himotoPool; await pg.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
