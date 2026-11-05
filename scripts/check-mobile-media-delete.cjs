// Synthetic deletion/receipt/RLS only; no environment files or providers.
require('./lib/offline-tests.cjs');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const {NextRequest}=require('next/server'),{load,root}=require('./lib/load-typescript.cjs');
async function run(){
  const checks=[],dto=load(path.resolve(root,'../shared/mobile-media-delete')),ops=load(path.resolve(root,'../shared/mobile-write-recovery'));
  assert(ops.isMobileWriteOperation('media.delete.contract:101'));assert(ops.isMobileWriteOperation('media.delete.customer:201'));assert(!ops.isMobileWriteOperation('media.delete.contract:0'));
  assert.deepEqual(dto.mediaMutationOperations('contracts',101),['media.contract:101','media.copy:101','video.record:101','draft.delete:101','media.delete.contract:101']);
  checks.push('Deletion operations bind the parent entity/resource and share the upload/copy intent group');
  const flag=process.argv.indexOf('--pglite-path');if(flag<0){console.log(JSON.stringify({passed:checks.length,checks,fixtureOnly:true,operationalWrites:0},null,2));return;}
  const pg=new(require(path.resolve(process.argv[flag+1])).PGlite)();let lose=false,fail=false,connections=0;
  const raw={release(){},async query(sql,values){if(fail&&sql.startsWith('INSERT INTO himoto.management_mobile_media_deletions')){fail=false;throw Error('QA deletion proof failure');}const r=await pg.query(sql,values);if(lose&&sql==='COMMIT'){lose=false;throw Error('QA lost delete commit');}return{...r,rowCount:r.rows.length||r.affectedRows||0};}};
  global.himotoPool={query:raw.query.bind(raw),connect:async()=>{connections++;return raw;}};
  try{
    await pg.exec(`CREATE SCHEMA himoto;CREATE ROLE himoto_scoped;CREATE ROLE anon;CREATE ROLE authenticated;
      CREATE TABLE himoto.users(id bigint PRIMARY KEY,name text);INSERT INTO himoto.users VALUES(7,'QA actor'),(8,'QA other');
      CREATE TABLE himoto.orders(id bigint PRIMARY KEY,store_id bigint,deleted_at timestamptz,draft_payload jsonb DEFAULT '{}');INSERT INTO himoto.orders VALUES(101,23,NULL,'{}'),(102,24,NULL,'{}');
      CREATE TABLE himoto.customers(id bigint PRIMARY KEY,name text,store_id bigint);INSERT INTO himoto.customers VALUES(201,'QA customer',23),(202,'QA other store',24);
      CREATE TABLE himoto.vehicles(id bigint PRIMARY KEY,name text,license text,store_id bigint,deleted_at timestamptz);INSERT INTO himoto.vehicles VALUES(303,'QA vehicle','50A-123.45',23,NULL),(304,'QA other','51B-678.90',24,NULL);
      CREATE TABLE himoto.order_vehicle_details(id bigint PRIMARY KEY,order_id bigint,vehicle_id bigint,deleted_at timestamptz);INSERT INTO himoto.order_vehicle_details VALUES(301,101,303,NULL),(302,102,304,NULL);
      CREATE TABLE himoto.management_contract_vehicle_swaps(id bigint PRIMARY KEY,order_id bigint,from_vehicle_id bigint,to_vehicle_id bigint);
      CREATE TABLE himoto.vehicle_location_events(id bigint PRIMARY KEY,vehicle_id bigint,event_type text);INSERT INTO himoto.vehicle_location_events VALUES(401,303,'manual_transfer'),(402,303,'manual_transfer_receive');
      CREATE TABLE himoto.management_record_photos(entity_type text,entity_id bigint,slot text,mime_type text,data bytea,updated_by bigint,updated_at timestamptz DEFAULT now(),cloudinary_public_id text,cloudinary_cloud_name text,cloudinary_version bigint,object_bucket text,object_key text,object_etag text,PRIMARY KEY(entity_type,entity_id,slot));
      INSERT INTO himoto.management_record_photos(entity_type,entity_id,slot,mime_type,data,updated_by) VALUES
        ('contracts',101,'rental-document-1','image/jpeg',decode('ffd8ff01','hex'),7),('contracts',101,'rental-document-2','image/png',decode('89504e47','hex'),7),
        ('contracts',101,'return-301-1','image/jpeg',decode('ffd8ff01','hex'),7),('contracts',101,'rental-video-1','video/mp4',NULL,7),
        ('customers',201,'id_front','image/jpeg',decode('ffd8ff01','hex'),7),('vehicles',303,'transfer-401-1','image/jpeg',decode('ffd8ff01','hex'),7);
      CREATE FUNCTION himoto.access_store(id bigint) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT current_setting('himoto.scope_all',true)='true' OR id=NULLIF(current_setting('himoto.store_id',true),'')::bigint$$;
      CREATE FUNCTION himoto.contract_vehicle_labels() RETURNS SETOF himoto.vehicles LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,himoto AS $$SELECT * FROM himoto.vehicles$$;
      GRANT USAGE ON SCHEMA himoto TO himoto_scoped;GRANT SELECT,UPDATE ON himoto.orders,himoto.customers,himoto.vehicles,himoto.order_vehicle_details,himoto.vehicle_location_events,himoto.management_contract_vehicle_swaps TO himoto_scoped;
      GRANT SELECT,INSERT,UPDATE,DELETE ON himoto.management_record_photos TO himoto_scoped;
      ALTER TABLE himoto.orders ENABLE ROW LEVEL SECURITY;CREATE POLICY orders ON himoto.orders TO himoto_scoped USING(himoto.access_store(store_id)) WITH CHECK(himoto.access_store(store_id));
      ALTER TABLE himoto.customers ENABLE ROW LEVEL SECURITY;CREATE POLICY customers ON himoto.customers TO himoto_scoped USING(himoto.access_store(store_id)) WITH CHECK(himoto.access_store(store_id));
      ALTER TABLE himoto.vehicles ENABLE ROW LEVEL SECURITY;CREATE POLICY vehicles ON himoto.vehicles TO himoto_scoped USING(himoto.access_store(store_id)) WITH CHECK(himoto.access_store(store_id));
      ALTER TABLE himoto.management_record_photos ENABLE ROW LEVEL SECURITY;CREATE POLICY photos ON himoto.management_record_photos TO himoto_scoped
        USING((entity_type='contracts' AND EXISTS(SELECT 1 FROM himoto.orders o WHERE o.id=entity_id)) OR (entity_type='customers' AND EXISTS(SELECT 1 FROM himoto.customers c WHERE c.id=entity_id)) OR (entity_type='vehicles' AND EXISTS(SELECT 1 FROM himoto.vehicles v WHERE v.id=entity_id)))
        WITH CHECK((entity_type='contracts' AND EXISTS(SELECT 1 FROM himoto.orders o WHERE o.id=entity_id)) OR (entity_type='customers' AND EXISTS(SELECT 1 FROM himoto.customers c WHERE c.id=entity_id)) OR (entity_type='vehicles' AND EXISTS(SELECT 1 FROM himoto.vehicles v WHERE v.id=entity_id)));
      ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO anon,authenticated;
    `);
    for(const file of ['2026-10-31-mobile-writes.sql','2026-11-03-mobile-media-deletions.sql'])await pg.exec(fs.readFileSync(path.resolve(root,'../docs/sql',file),'utf8'));
    const media=load(path.join(root,'lib/server/mobile-record-media')),service=load(path.join(root,'lib/server/mobile-media-delete')),resolver=load(path.join(root,'lib/server/mobile-write-recovery'));
    const user={id:7,name:'QA actor',role:'staff',access_role:'custom',permissions:[],store_id:23,scope_all:false},get=new NextRequest('https://fixture.invalid/photo');
    const params=t=>({entity:t.entity,id:String(t.id),kind:t.kind,referenceId:String(t.referenceId)}),rental={entity:'contracts',id:101,kind:'rental',referenceId:101};
    const info=(t,slot)=>media.readMobileMediaSlotInfo(user,params(t),slot,get);
    const remove=(prepared,key=randomUUID(),headers={},body={})=>service.deleteMobileRecordMedia(user,params(prepared.target),prepared.slot,new NextRequest('https://fixture.invalid/photo',{method:'DELETE',headers:{'Content-Type':'application/json','Idempotency-Key':key,'X-Record-Revision':prepared.target.revision,'X-Reference-Revision':prepared.target.referenceRevision,'X-Media-Snapshot':prepared.target.snapshot,'X-Photo-Revision':prepared.photo?.revision||'0',...headers},body:JSON.stringify(body)}));
    const resolve=(entity,id,key)=>resolver.resolveMobileWrite(user,key,new NextRequest('https://fixture.invalid/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:dto.mediaDeleteOperation(entity,id)})}));
    const original=await info(rental,'rental-document-1'),before=connections;
    for(const headers of [{'X-Photo-Revision':'0'},{'X-Record-Revision':'bad'},{'X-Media-Snapshot':'bad'},{'Idempotency-Key':'bad'}])await assert.rejects(()=>remove(original,randomUUID(),headers),e=>e.status===400);
    await assert.rejects(()=>remove(original,randomUUID(),{}, {slot:'rental-document-2'}),e=>e.code==='INVALID_MEDIA_DELETE');assert.equal(connections,before);
    const key=randomUUID(),proof=await remove(original,key);assert(dto.isMediaDeleteReceipt(proof)&&proof.current&&proof.slotEmpty);assert.equal((await resolve('contracts',101,key)).status,'committed');
    assert.deepEqual(await remove(original,key),{...proof,replayed:true});assert.equal((await service.readMediaDeleteReceipt({...user,id:8},'contracts','101',key)).receipt,null);
    await pg.query("INSERT INTO himoto.management_record_photos(entity_type,entity_id,slot,mime_type,data,updated_by) VALUES('contracts',101,'rental-document-1','image/jpeg',decode('ffd8ff99','hex'),8)");
    const replay=await remove(original,key);assert.equal(replay.current,false);assert.equal(replay.slotEmpty,false);assert.equal((await info(rental,'rental-document-1')).photo.bytes,4);
    checks.push('Exact reviewed photo is deleted once with immutable proof; replay after replacement never deletes the new image and reports slotEmpty=false; receipts are actor-bound');
    const stale=await info(rental,'rental-document-2');await pg.query("UPDATE himoto.management_record_photos SET data=decode('ffd8ff02','hex') WHERE entity_type='contracts' AND entity_id=101 AND slot='rental-document-2'");
    await assert.rejects(()=>remove(stale),e=>e.code==='MEDIA_DELETE_REVIEW_REQUIRED');
    const rollback=await info(rental,'rental-document-2');fail=true;await assert.rejects(()=>remove(rollback),/QA deletion proof failure/);assert((await info(rental,'rental-document-2')).photo);
    const lost=randomUUID();lose=true;await assert.rejects(()=>remove(rollback,lost),/QA lost delete commit/);assert.equal((await resolve('contracts',101,lost)).status,'committed');assert((await service.readMediaDeleteReceipt(user,'contracts','101',lost)).receipt.slotEmpty);
    const cancel=randomUUID();assert.equal((await resolve('contracts',101,cancel)).status,'cancelled');await assert.rejects(()=>remove(original,cancel),e=>e.code==='REQUEST_CANCELLED');
    checks.push('Malformed requests fail before DB; stale photo cannot be removed; proof failures roll back deletion, lost commits recover, and tombstones block late deletion');
    const returned=await info({...rental,kind:'return',referenceId:301},'return-301-1');assert((await remove(returned)).current); // no contracts.return grant: same as web photo DELETE
    const video=await info(rental,'rental-video-1');assert.equal(video.photo.kind,'video');assert((await remove(video)).current);
    const customer=await info({entity:'customers',id:201,kind:'customer',referenceId:201},'id_front');assert((await remove(customer)).current);
    const vehicleTarget={entity:'vehicles',id:303,kind:'transfer',referenceId:401};
    const vehicle=await media.readMobileMediaSlotInfo({...user,permissions:['vehicles.read']},params(vehicleTarget),'transfer-401-1',get);
    const vehicleRequest=new NextRequest('https://fixture.invalid/photo',{method:'DELETE',headers:{'Content-Type':'application/json','Idempotency-Key':randomUUID(),'X-Record-Revision':vehicle.target.revision,'X-Reference-Revision':vehicle.target.referenceRevision,'X-Media-Snapshot':vehicle.target.snapshot,'X-Photo-Revision':vehicle.photo.revision},body:'{}'});
    assert((await service.deleteMobileRecordMedia({...user,permissions:['vehicles.read']},params(vehicleTarget),vehicle.slot,vehicleRequest)).current);
    await assert.rejects(()=>info({entity:'customers',id:202,kind:'customer',referenceId:202},'id_front'),e=>e.status===404);
    await assert.rejects(()=>info({...rental,id:102,referenceId:102},'rental-document-1'),e=>e.status===404);
    checks.push('Authenticated/RLS photo-delete rights are independent of profile/return transaction grants; images/videos/customer/transfer slots retain exact parent/reference and foreign stores remain inaccessible');
    const api=load(path.resolve(root,'../mobile/src/lib/api')).createApi('https://fixture.invalid','hm1_'+'a'.repeat(43)),savedFetch=global.fetch;
    try{
      for(const changed of [{...proof,requestId:randomUUID()},{...proof,photo:{...proof.photo,mimeType:'image/png'}},{...proof,photo:{...proof.photo,bytes:777}},{...proof,photo:{...proof.photo,updatedAt:'2026-11-01T00:00:00.000Z'}}]){
        global.fetch=async()=>Response.json(changed);await assert.rejects(()=>api.deleteRecordMedia(original,key),e=>e.code==='INVALID_RESPONSE');
      }
    }finally{global.fetch=savedFetch;}
    const grants=(await pg.query("SELECT has_table_privilege('anon','himoto.management_mobile_media_deletions','SELECT') AS anon,has_table_privilege('authenticated','himoto.management_mobile_media_deletions','INSERT') AS auth,has_table_privilege('himoto_scoped','himoto.management_mobile_media_deletions','DELETE') AS deletes")).rows[0];assert.deepEqual(grants,{anon:false,auth:false,deletes:false});
    checks.push('Client rejects substituted deletion proof and metadata journal remains actor-scoped/append-only despite default public grants');
  }finally{await pg.close();delete global.himotoPool;}
  console.log(JSON.stringify({passed:checks.length,checks,fixtureOnly:true,operationalWrites:0},null,2));
}
run().catch(error=>{console.error(error);process.exitCode=1;});
