// Real deletion/upload/request-row races on the pinned, synthetic QA cluster only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const openQa=require('./lib/mobile_postgres_qa.cjs'),{NextRequest}=require('next/server'),{load,root}=require('./lib/load-typescript.cjs');
const arg=process.argv.indexOf('--output');assert(arg>=0&&process.argv[arg+1]);const output=path.resolve(process.argv[arg+1]);assert(output.startsWith(path.resolve('.backups')+path.sep)&&!fs.existsSync(output));fs.mkdirSync(output,{recursive:true});
const checks=[];let db;const user={id:7,name:'QA delete race',role:'staff',access_role:'custom',permissions:[],store_id:23,scope_all:false},bytes=Buffer.from([255,216,255,2]);
async function run(){
  db=await openQa();fs.writeFileSync(path.join(output,'database.json'),JSON.stringify(db.connection,null,2));
  await db.pool.query(`CREATE SCHEMA himoto;
    CREATE TABLE himoto.users(id bigint PRIMARY KEY,name text);INSERT INTO himoto.users VALUES(7,'QA actor');
    CREATE TABLE himoto.orders(id bigint PRIMARY KEY,store_id bigint,deleted_at timestamptz);INSERT INTO himoto.orders SELECT n,23,NULL FROM generate_series(101,104) n;
    CREATE TABLE himoto.customers(id bigint PRIMARY KEY);CREATE TABLE himoto.vehicles(id bigint PRIMARY KEY,deleted_at timestamptz);
    CREATE TABLE himoto.management_record_photos(entity_type text,entity_id bigint,slot text,mime_type text,data bytea,updated_by bigint,updated_at timestamptz DEFAULT now(),cloudinary_public_id text,cloudinary_cloud_name text,cloudinary_version bigint,object_bucket text,object_key text,object_etag text,PRIMARY KEY(entity_type,entity_id,slot));
    INSERT INTO himoto.management_record_photos(entity_type,entity_id,slot,mime_type,data,updated_by) SELECT 'contracts',n,'rental-document-1','image/jpeg',decode('ffd8ff01','hex'),7 FROM generate_series(101,104) n;
    CREATE FUNCTION himoto.access_store(id bigint) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT current_setting('himoto.scope_all',true)='true' OR id=NULLIF(current_setting('himoto.store_id',true),'')::bigint$$;
    GRANT USAGE ON SCHEMA himoto TO himoto_scoped;GRANT SELECT,UPDATE ON himoto.orders TO himoto_scoped;GRANT SELECT ON himoto.customers,himoto.vehicles TO himoto_scoped;GRANT SELECT,INSERT,UPDATE,DELETE ON himoto.management_record_photos TO himoto_scoped;
    ALTER TABLE himoto.orders ENABLE ROW LEVEL SECURITY;CREATE POLICY orders ON himoto.orders TO himoto_scoped USING(himoto.access_store(store_id)) WITH CHECK(himoto.access_store(store_id));
    ALTER TABLE himoto.management_record_photos ENABLE ROW LEVEL SECURITY;CREATE POLICY photos ON himoto.management_record_photos TO himoto_scoped USING(entity_type='contracts' AND EXISTS(SELECT 1 FROM himoto.orders o WHERE o.id=entity_id)) WITH CHECK(entity_type='contracts' AND EXISTS(SELECT 1 FROM himoto.orders o WHERE o.id=entity_id));
  `);
  for(const file of ['2026-10-31-mobile-writes.sql','2026-11-02-mobile-record-media.sql','2026-11-03-mobile-media-deletions.sql'])await db.pool.query(fs.readFileSync(path.resolve(root,'../docs/sql',file),'utf8'));
  const media=load(path.join(root,'lib/server/mobile-record-media')),del=load(path.join(root,'lib/server/mobile-media-delete')),writer=load(path.join(root,'lib/server/mobile-record-media-write')),resolver=load(path.join(root,'lib/server/mobile-write-recovery'));
  const params=id=>({entity:'contracts',id:String(id),kind:'rental',referenceId:String(id)}),read=id=>media.readMobileMediaSlotInfo(user,params(id),'rental-document-1',new NextRequest('https://fixture.invalid/photo'));
  const headers=(p,key)=>({'Idempotency-Key':key,'X-Record-Revision':p.target.revision,'X-Reference-Revision':p.target.referenceRevision,'X-Media-Snapshot':p.target.snapshot,'X-Photo-Revision':p.photo?.revision||'0'});
  const remove=(p,key)=>del.deleteMobileRecordMedia(user,params(p.target.id),p.slot,new NextRequest('https://fixture.invalid/photo',{method:'DELETE',headers:{...headers(p,key),'Content-Type':'application/json'},body:'{}'}));
  const upload=(p,key=randomUUID())=>writer.uploadMobileRecordMedia(user,params(p.target.id),p.slot,new NextRequest('https://fixture.invalid/photo',{method:'PUT',headers:{...headers(p,key),'Content-Type':'image/jpeg'},body:bytes}));
  const resolve=(id,key)=>resolver.resolveMobileWrite(user,key,new NextRequest('https://fixture.invalid/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:`media.delete.contract:${id}`})}));
  const hex=async id=>(await db.pool.query("SELECT encode(data,'hex') AS hex FROM himoto.management_record_photos WHERE entity_type='contracts' AND entity_id=$1",[id])).rows[0]?.hex;
  {
    const p=await read(101),hold=db.hold('replacing-photo',sql=>sql.startsWith('INSERT INTO himoto.management_mobile_record_media'));
    const replacing=db.task('replacing-photo',()=>upload(p));await hold.entered.promise;const deleting=db.task('stale-delete-after-replace',()=>remove(p,randomUUID()));await db.blocked('stale-delete-after-replace','replacing-photo');hold.release.resolve();
    const [a,b]=await Promise.all([replacing,deleting]);assert(a.ok&&!b.ok);assert.equal(b.error.code,'MEDIA_DELETE_REVIEW_REQUIRED');assert.equal(await hex(101),'ffd8ff02');
    checks.push('Upload wins the real parent/photo lock race; the waiting stale deletion rejects its old photo revision and cannot delete the replacement');
  }
  {
    const p=await read(102),key=randomUUID(),hold=db.hold('deleting-photo',sql=>sql.startsWith('INSERT INTO himoto.management_mobile_media_deletions'));
    const deleting=db.task('deleting-photo',()=>remove(p,key));await hold.entered.promise;const replacing=db.task('stale-upload-after-delete',()=>upload(p));await db.blocked('stale-upload-after-delete','deleting-photo');hold.release.resolve();
    const [a,b]=await Promise.all([deleting,replacing]);assert(a.ok&&!b.ok);assert.equal(b.error.code,'MEDIA_REVIEW_REQUIRED');assert.equal(await hex(102),undefined);
    await upload(await read(102));assert.equal(await hex(102),'ffd8ff02');const replay=await remove(p,key);assert(replay.replayed&&!replay.slotEmpty);assert.equal(await hex(102),'ffd8ff02');
    checks.push('Deletion wins the lock race and rejects a stale upload; after an explicit fresh upload, replaying the old deletion returns its original proof without removing the new file');
  }
  {
    const p=await read(103),key=randomUUID(),hold=db.hold('delete-cancellation',sql=>sql.startsWith('INSERT INTO himoto.management_mobile_requests'));
    const cancelling=db.task('delete-cancellation',()=>resolve(103,key));await hold.entered.promise;const deleting=db.task('late-delete-after-cancel',()=>remove(p,key));await db.blocked('late-delete-after-cancel','delete-cancellation');hold.release.resolve();
    const [a,b]=await Promise.all([cancelling,deleting]);assert(a.ok&&!b.ok);assert.equal(a.value.status,'cancelled');assert.equal(b.error.code,'REQUEST_CANCELLED');assert.equal(await hex(103),'ffd8ff01');
    checks.push('Cancellation wins the actual request-row race; the concurrent old deletion sees its durable tombstone and leaves the image intact');
  }
  {
    const p=await read(104),key=randomUUID(),hold=db.hold('uncommitted-delete',sql=>sql.startsWith('INSERT INTO himoto.management_mobile_media_deletions'));
    const deleting=db.task('uncommitted-delete',()=>remove(p,key));await hold.entered.promise;const resolving=db.task('resolve-deleting-photo',()=>resolve(104,key));await db.blocked('resolve-deleting-photo','uncommitted-delete');hold.release.resolve();
    const [a,b]=await Promise.all([deleting,resolving]);assert(a.ok&&b.ok);assert.equal(b.value.status,'committed');assert((await del.readMediaDeleteReceipt(user,'contracts','104',key)).receipt.slotEmpty);
    checks.push('Resolver waits for an uncommitted deletion and returns the committed original resource/proof after the delete wins');
  }
  assert(db.observations.length===4&&db.sessionPids().length>=2);
  const result={status:'passed',passed:checks.length,checks,fixtureOnly:true,operationalWrites:0,physicalPostgresSessions:db.sessionPids(),realLockObservations:db.observations,connection:db.connection,completedAt:new Date().toISOString()};fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({status:'passed',passed:checks.length,physicalPostgresSessions:db.sessionPids().length,realLockObservations:db.observations.length,fixtureOnly:true},null,2));
}
run().catch(error=>{fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({status:'failed',passed:checks.length,checks,error:String(error),code:error.code},null,2));console.error(error);process.exitCode=1;}).finally(async()=>{if(db)await db.close();});
