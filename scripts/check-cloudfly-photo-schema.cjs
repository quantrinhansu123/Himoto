const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require(path.resolve(process.argv[2]||'.backups/mobile-sql-qa/node_modules/@electric-sql/pglite'));
async function main(){const pg=new PGlite();try{
  await pg.exec(`CREATE SCHEMA himoto;CREATE ROLE himoto_scoped;
    CREATE TABLE himoto.management_record_photos(entity_type text,entity_id bigint,slot text,mime_type text,data bytea,updated_by bigint,updated_at timestamptz DEFAULT now(),cloudinary_public_id text,cloudinary_cloud_name text,cloudinary_version bigint,object_bucket text,object_key text,object_etag text,PRIMARY KEY(entity_type,entity_id,slot));
    CREATE TABLE himoto.management_shift_media(id uuid PRIMARY KEY,mime_type text,data bytea,cloudinary_public_id text,cloudinary_cloud_name text,cloudinary_version bigint,object_bucket text,object_key text,object_etag text);
    CREATE TABLE himoto.management_shift_photos(report_id bigint,store_id bigint,slot text,mime_type text,data bytea NOT NULL,PRIMARY KEY(report_id,slot));
    INSERT INTO himoto.management_record_photos(entity_type,entity_id,slot,mime_type,data) VALUES('customers',1,'id_front','image/jpeg',decode('ffd8ff','hex'));
    GRANT USAGE ON SCHEMA himoto TO himoto_scoped;`);
  await pg.exec(fs.readFileSync('docs/sql/2026-11-11-cloudfly-photos.sql','utf8'));
  const before=(await pg.query('SELECT xmin::text AS revision,data FROM himoto.management_record_photos')).rows[0];
  await pg.exec(fs.readFileSync('docs/sql/2026-11-11-cloudfly-photos.sql','utf8'));
  assert.deepEqual((await pg.query('SELECT xmin::text AS revision,data FROM himoto.management_record_photos')).rows[0],before);
  const ref=['bucket','himoto/photos/7/00112233-4455-4677-8899-aabbccddeeff/v1.jpg','"etag"','a'.repeat(64),400];
  const insert=`INSERT INTO himoto.management_record_photos(entity_type,entity_id,slot,mime_type,object_bucket,object_key,object_etag,storage_sha256,storage_bytes) VALUES('customers',2,'id_front','image/jpeg',$1,$2,$3,$4,$5)`;
  await pg.query(insert,ref);
  await pg.exec("DELETE FROM himoto.management_record_photos WHERE entity_id=2");
  for(const field of [0,1,2,3,4]){const invalid=[...ref];invalid[field]=null;await assert.rejects(()=>pg.query(insert,invalid),e=>e.code==='23514');}
  await assert.rejects(()=>pg.query(insert,[...ref.slice(0,4),2097153]),e=>e.code==='23514');
  await pg.exec('SET ROLE himoto_scoped');await assert.rejects(()=>pg.query('SELECT * FROM himoto.management_media_archive'),e=>e.code==='42501');await pg.exec('RESET ROLE');
  console.log('PASS: repeatable schema migration preserves historical data/revisions, accepts valid object photos, rejects incomplete/oversized storage and denies scoped archive reads');
}finally{await pg.close();}}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
