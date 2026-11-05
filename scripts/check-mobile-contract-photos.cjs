// Synthetic contract/plate media and OCR only. No environment files or providers.
require('./lib/offline-tests.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {NextRequest}=require('next/server'),{load,root}=require('./lib/load-typescript.cjs');
async function run(){
  const checks=[],dto=load(path.resolve(root,'../shared/mobile-record-media')),ocrDto=load(path.resolve(root,'../shared/mobile-plate-ocr'));
  const rental={entity:'contracts',id:101,kind:'rental',referenceId:101},plate={...rental,kind:'plate',referenceId:303};
  for(const slot of ['rental-document-1','rental-signed-2','rental-16','handover-1','customer-id-front-extra-2','driver-license'])assert(dto.isMobileMediaSlot(rental,slot));
  for(const slot of ['plate-303','return-301-1','renewal-1-document-1','rental-signed-0','rental-video-1-extra-2'])assert(!dto.isMobileMediaSlot(rental,slot));
  assert(dto.isMobileMediaSlot(plate,'plate-303-extra-2'));assert(!dto.isMobileMediaSlot(plate,'plate-304'));assert(!dto.isMobileMediaIdentity({...rental,referenceId:102}));
  assert.equal(ocrDto.plateSelectionIndex([''],[''],'303',true),0);
  for(const task of [()=>ocrDto.plateSelectionIndex(['301'],['301'],'303',true),()=>ocrDto.plateSelectionIndex([''],['302'],'303',true),()=>ocrDto.plateSelectionIndex([''],[''],'303',false)])assert.throws(task);
  assert.equal(ocrDto.plateSelectionIndex(['301'],['303'],'303',false),0);
  checks.push('Rental/plate/signed/supplemental slots bind exact order/vehicle; OCR preserves empty-line and concurrent-selection rules from web');
  const {orderContractPhotoUploads}=load(path.resolve(root,'../shared/mobile-contract-photo-order'));
  const selected=['rental-document-1','rental-signed-2','driver-license','handover-1','plate-304','driver-license-extra-2','customer-id-back-extra-2','plate-303','customer-id-front','rental-1'].map((slot,index)=>({slot,index,phase:'untrusted'}));
  const ordered=orderContractPhotoUploads(selected,101,['303','304']);
  assert.deepEqual(ordered.map(row=>row.slot),['customer-id-back-extra-2','customer-id-front','plate-304','plate-303','driver-license','driver-license-extra-2','rental-document-1','rental-signed-2','handover-1','rental-1']);
  assert.equal(selected[0].slot,'rental-document-1');assert.strictEqual(ordered[6],selected[0]);
  // A receipt from the old selection order remains saved; it is never replayed to repair history.
  assert.deepEqual(orderContractPhotoUploads(selected.map((row,index)=>index===0?{...row,savedTo:101}:row),101,['303','304']).map(row=>row.slot),ordered.map(row=>row.slot).filter(slot=>slot!=='rental-document-1'));
  for(const slot of ['scan_plate','scan_plate-extra-2','plate-305','plate-303-extra-1','return-1-1','renewal-1-document-1','rental-video-1','driver-license-extra-2-extra-3'])assert.throws(()=>orderContractPhotoUploads([...selected,{slot}],101,['303','304']));
  assert.throws(()=>orderContractPhotoUploads([{slot:'rental-document-1',savedTo:102}],101,[]));
  assert.deepEqual(orderContractPhotoUploads([{slot:'plate-305',savedTo:101}],101,[]),[]);
  checks.push('Web photo phases derive from validated slots, preserve order within each collection and skip original receipts; unbound/removed vehicles, wrong-contract receipts and unsupported slots stop the entire queue before HTTP');
  let backing=null,connections=0;
  global.himotoPool={query:async(...args)=>{assert(backing,'OCR must not query a database');return backing.query(...args);},connect:async()=>{connections++;assert(backing,'OCR must not open a database');return backing;}};
  const photo=load(path.join(root,'lib/server/photo-ocr')),originalExtract=photo.extractPhoto;let calls=0;
  const reader=load(path.join(root,'lib/server/mobile-plate-ocr')),bytes=Buffer.from([255,216,255,224,1,2,3]);
  const user={id:7,name:'QA',role:'staff',access_role:'custom',permissions:[],store_id:23,scope_all:false};
  const ocrRequest=(key=randomUUID(),headers={})=>new NextRequest('https://fixture.invalid/ocr',{method:'POST',headers:{'Content-Type':'image/jpeg','X-Photo-Kind':'plate','X-Ocr-Request':key,...headers},body:bytes});
  photo.extractPhoto=async(kind,mime,data)=>{calls++;assert.equal(kind,'plate');assert.equal(mime,'image/jpeg');assert.deepEqual(data,bytes);return{fields:{license:'50A-123.45'},warnings:[]};};
  try{
    await assert.rejects(()=>reader.readMobilePlateOcr(user,ocrRequest()),e=>e.code==='FORBIDDEN');
    const allowed={...user,permissions:['customers.write']};
    for(const headers of [{'X-Ocr-Request':'bad'},{'X-Photo-Kind':'customer_documents'},{'X-Expected-Identity':'001234567890'},{'Idempotency-Key':randomUUID()}])await assert.rejects(()=>reader.readMobilePlateOcr(allowed,ocrRequest(randomUUID(),headers)),e=>e.code==='INVALID_OCR_REQUEST');
    assert.equal(calls,0);const key=randomUUID(),result=await reader.readMobilePlateOcr(allowed,ocrRequest(key));assert(ocrDto.isMobilePlateOcr(result,key));assert(!ocrDto.isMobilePlateOcr(result,randomUUID()));
  }finally{photo.extractPhoto=originalExtract;}
  checks.push('Plate OCR matches the web customers.write entitlement, bounded image reader and request binding; kind/identity/write-key spoofing fails without provider calls');
  const flag=process.argv.indexOf('--pglite-path');
  if(flag>=0){
    const pg=new(require(path.resolve(process.argv[flag+1])).PGlite)();let lose=false,fail=false;
    const raw={release(){},async query(sql,values){if(fail&&sql.startsWith('INSERT INTO himoto.management_mobile_record_media')){fail=false;throw Error('QA proof failure');}
      const r=await pg.query(sql,values);if(lose&&sql==='COMMIT'){lose=false;throw Error('QA lost commit');}return {...r,rowCount:r.rows.length||r.affectedRows||0};}};
    backing=raw;
    try{
      await pg.exec(`CREATE SCHEMA himoto;CREATE ROLE himoto_scoped;CREATE ROLE anon;CREATE ROLE authenticated;
        CREATE TABLE himoto.users(id bigint PRIMARY KEY,name text);INSERT INTO himoto.users VALUES(7,'QA actor'),(8,'QA other');
        CREATE TABLE himoto.stores(id bigint PRIMARY KEY,store_name text);INSERT INTO himoto.stores VALUES(23,'QA A'),(24,'QA B');
        CREATE TABLE himoto.orders(id bigint PRIMARY KEY,customer_id bigint,store_id bigint,draft_payload jsonb,deleted_at timestamptz);
        INSERT INTO himoto.orders VALUES(101,NULL,23,'{"management_composer":{"draft":{"vehicles":[{"id":"303"},{"id":"304"}]}}}',NULL),(999,NULL,24,'{}',NULL);
        CREATE TABLE himoto.customers(id bigint PRIMARY KEY,store_id bigint,name text);
        CREATE TABLE himoto.vehicles(id bigint PRIMARY KEY,name text,license text,type text,status text,store_id bigint,brand text,color text,year integer,deleted_at timestamptz);
        INSERT INTO himoto.vehicles VALUES(303,'QA first','50A-123.45','motorbike','ready',23,'QA','Red',2025,NULL),(304,'QA foreign stock','51B-678.90','motorbike','ready',24,'QA','Blue',2026,NULL),(505,'QA unrelated','59C-222.22','motorbike','ready',24,'QA','Green',2026,NULL);
        CREATE TABLE himoto.order_vehicle_details(id bigint PRIMARY KEY,order_id bigint,vehicle_id bigint,deleted_at timestamptz);INSERT INTO himoto.order_vehicle_details VALUES(301,101,303,NULL);
        CREATE TABLE himoto.management_contract_vehicle_swaps(id bigint PRIMARY KEY,order_id bigint,from_vehicle_id bigint,to_vehicle_id bigint);
        CREATE TABLE himoto.management_record_photos(entity_type text,entity_id bigint,slot text,mime_type text,data bytea,updated_by bigint,updated_at timestamptz NOT NULL DEFAULT now(),
          cloudinary_public_id text,cloudinary_cloud_name text,cloudinary_version bigint,object_bucket text,object_key text,object_etag text,PRIMARY KEY(entity_type,entity_id,slot));
        CREATE FUNCTION himoto.access_actor() RETURNS bigint LANGUAGE sql STABLE AS $$SELECT NULLIF(current_setting('himoto.actor_id',true),'')::bigint$$;
        CREATE FUNCTION himoto.access_store(id bigint) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT current_setting('himoto.scope_all',true)='true' OR id=NULLIF(current_setting('himoto.store_id',true),'')::bigint$$;
        CREATE FUNCTION himoto.vehicle_inventory() RETURNS TABLE(id bigint,name text,license text,type text,status text,store_id bigint,store_name text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,himoto AS $$SELECT v.id,v.name,v.license,v.type,v.status,v.store_id,s.store_name FROM himoto.vehicles v LEFT JOIN himoto.stores s ON s.id=v.store_id WHERE himoto.access_actor() IS NOT NULL$$;
        CREATE FUNCTION himoto.contract_vehicle_labels() RETURNS TABLE(id bigint,name text,license text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,himoto AS $$SELECT v.id,v.name,v.license FROM himoto.vehicles v WHERE EXISTS(SELECT 1 FROM himoto.order_vehicle_details d JOIN himoto.orders o ON o.id=d.order_id WHERE d.vehicle_id=v.id AND himoto.access_store(o.store_id))$$;
        GRANT USAGE ON SCHEMA himoto TO himoto_scoped;GRANT SELECT,UPDATE ON himoto.orders TO himoto_scoped;GRANT SELECT ON himoto.vehicles,himoto.order_vehicle_details,himoto.management_contract_vehicle_swaps,himoto.customers TO himoto_scoped;
        GRANT SELECT,INSERT,UPDATE,DELETE ON himoto.management_record_photos TO himoto_scoped;
        ALTER TABLE himoto.orders ENABLE ROW LEVEL SECURITY;CREATE POLICY scoped ON himoto.orders TO himoto_scoped USING(himoto.access_store(store_id)) WITH CHECK(himoto.access_store(store_id));
        ALTER TABLE himoto.management_record_photos ENABLE ROW LEVEL SECURITY;
        CREATE POLICY photos ON himoto.management_record_photos TO himoto_scoped USING(entity_type='contracts' AND EXISTS(SELECT 1 FROM himoto.orders o WHERE o.id=entity_id)) WITH CHECK(entity_type='contracts' AND EXISTS(SELECT 1 FROM himoto.orders o WHERE o.id=entity_id));
      `);
      for(const name of ['2026-10-31-mobile-writes.sql','2026-11-02-mobile-record-media.sql'])await pg.exec(fs.readFileSync(path.resolve(root,'../docs/sql',name),'utf8'));
      const service=load(path.join(root,'lib/server/mobile-record-media')),writer=load(path.join(root,'lib/server/mobile-record-media-write')),resolve=load(path.join(root,'lib/server/mobile-write-recovery'));
      const rawTarget=t=>({...t,id:String(t.id),referenceId:String(t.referenceId)}),req=new NextRequest('https://fixture.invalid/read');
      const targets=await service.readMobileMediaTargets(user,{entity:'contracts',id:'101'},req);assert.deepEqual(targets.rows.map(r=>[r.kind,r.referenceId]),[['rental',101],['plate',304],['plate',303],['return',301]]);
      const gallery=await service.readMobileRecordMedia(user,rawTarget(rental),req);assert(dto.isMobileRecordMedia(gallery));assert.equal(gallery.slots.length,70);
      const info=await service.readMobileMediaSlotInfo(user,rawTarget(plate),'plate-303',req);assert.equal(info.target.referenceRevision,info.target.revision);
      assert((await service.readMobileMediaSlotInfo(user,rawTarget({...plate,referenceId:304}),'plate-304',req)).target.label.includes('51B'));
      await assert.rejects(()=>service.readMobileMediaSlotInfo(user,rawTarget({...plate,referenceId:505}),'plate-505',req),e=>e.status===404);
      await assert.rejects(()=>service.readMobileMediaSlotInfo(user,rawTarget({...rental,id:999,referenceId:999}),'rental-document-1',req),e=>e.status===404);
      await pg.exec("INSERT INTO himoto.orders VALUES(102,NULL,23,'{}',NULL);INSERT INTO himoto.order_vehicle_details VALUES(302,102,303,NULL)");
      for(const payload of [null,{}, {management_composer:{draft:{vehicles:null}}}, {management_composer:{draft:{vehicles:{id:'304'}}}}, {management_composer:{draft:{vehicles:'304'}}}]){
        await pg.query('UPDATE himoto.orders SET draft_payload=$1::jsonb WHERE id=102',[payload===null?null:JSON.stringify(payload)]);
        const legacy=await service.readMobileMediaTargets(user,{entity:'contracts',id:'102'},req);
        assert.deepEqual(legacy.rows.map(r=>[r.kind,r.referenceId]),[['rental',102],['plate',303],['return',302]]);
        assert((await service.readMobileMediaSlotInfo(user,rawTarget({...plate,id:102}),'plate-303',req)).target.label.includes('50A'));
        await assert.rejects(()=>service.readMobileMediaSlotInfo(user,rawTarget({...plate,id:102,referenceId:304}),'plate-304',req),e=>e.status===404);
      }
      checks.push('Scoped SQL lists rental/plate/return without duplicate targets; cross-store draft stock works before issued lines; null/missing/scalar/object legacy drafts preserve issued vehicles without granting unrelated vehicle access; foreign orders stay inaccessible');
      const save=(prepared,key=randomUUID())=>writer.uploadMobileRecordMedia(user,rawTarget(prepared.target),prepared.slot,new NextRequest('https://fixture.invalid/photo',{method:'PUT',headers:{'Content-Type':'image/jpeg','Idempotency-Key':key,'X-Record-Revision':prepared.target.revision,'X-Reference-Revision':prepared.target.referenceRevision,'X-Media-Snapshot':prepared.target.snapshot,'X-Photo-Revision':prepared.photo?.revision||'0'},body:bytes}));
      const getInfo=()=>service.readMobileMediaSlotInfo(user,rawTarget(rental),'rental-document-1',req);
      const prepared=await getInfo(),key=randomUUID(),proof=await save(prepared,key);assert(proof.current);assert.deepEqual(await save(prepared,key),{...proof,replayed:true});
      assert((await service.readMobileRecordMedia(user,rawTarget(rental),req)).slots.some(s=>s.slot==='rental-signed-2'));
      const reconcile=key=>resolve.resolveMobileWrite(user,key,new NextRequest('https://fixture.invalid/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'media.contract:101'})}));
      assert.equal((await reconcile(key)).status,'committed');assert.equal((await writer.readMobileMediaReceipt({...user,id:8},key)).receipt,null);
      const drop=randomUUID();assert.equal((await reconcile(drop)).status,'cancelled');await assert.rejects(async()=>save(await getInfo(),drop),e=>e.code==='REQUEST_CANCELLED');
      const photoCount=async()=>Number((await pg.query('SELECT count(*) AS n FROM himoto.management_record_photos')).rows[0].n);
      fail=true;await assert.rejects(()=>save(info),/QA proof failure/);assert.equal(await photoCount(),1);
      const lostKey=randomUUID();lose=true;await assert.rejects(()=>save(info,lostKey),/QA lost commit/);assert.equal(await photoCount(),2);assert((await writer.readMobileMediaReceipt(user,lostKey)).receipt.current);assert.equal((await reconcile(lostKey)).status,'committed');
      const before=await getInfo();await pg.query("UPDATE himoto.orders SET draft_payload=jsonb_set(draft_payload,'{management_composer,draft,vehicles}','[{\"id\":\"304\"}]') WHERE id=101");
      await assert.rejects(()=>save(before),e=>e.code==='MEDIA_REVIEW_REQUIRED');assert(!(await writer.readMobileMediaReceipt(user,key)).receipt.current);assert(!(await writer.readMobileMediaReceipt(user,lostKey)).receipt.current);
      checks.push('Authenticated/RLS contract photo rights match web without profile edit grants; upload/replay/actor isolation, rollback, lost commit, tombstones and later-parent changes preserve original proof');
      const lookups=load(path.join(root,'lib/server/mobile-draft-lookups')),draftActor={...user,permissions:['contracts.read','contracts.draft']};
      let match=await lookups.lookupMobileDraftPlate(draftActor,new URLSearchParams({license:'50A12345'}));assert.equal(match.match,'unique');assert.equal(match.vehicle.vehicle.id,'303');
      const client=load(path.resolve(root,'../mobile/src/lib/api')).createApi('https://fixture.invalid','hm1_'+'a'.repeat(43)),savedFetch=global.fetch;
      try{
        global.fetch=async()=>Response.json({...match,license:'51B67890'});await assert.rejects(()=>client.plateLookup('50A12345'),e=>e.code==='INVALID_RESPONSE');
        const ocrKey=randomUUID();global.fetch=async()=>Response.json({requestId:randomUUID(),kind:'plate',fields:{license:'50A-123.45'},warnings:[]});
        await assert.rejects(()=>client.plateOcr(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),ocrKey),e=>e.code==='INVALID_RESPONSE');
      }finally{global.fetch=savedFetch;}
      await pg.query("UPDATE himoto.vehicles SET license='50A 12345' WHERE id=304");match=await lookups.lookupMobileDraftPlate(draftActor,new URLSearchParams({license:'50A-123.45'}));assert.equal(match.match,'ambiguous');assert.equal(match.vehicle,null);
      assert.equal((await lookups.lookupMobileDraftPlate(draftActor,new URLSearchParams({license:'50A99999'}))).match,'none');
      const beforeConnections=connections;await assert.rejects(()=>lookups.lookupMobileDraftPlate(user,new URLSearchParams({license:'50A12345'})),e=>e.code==='FORBIDDEN');await assert.rejects(()=>lookups.lookupMobileDraftPlate(draftActor,new URLSearchParams('license=50A12345&scope_all=true')),e=>e.code==='INVALID_PLATE');assert.equal(connections,beforeConnections);
      checks.push('Exact plate lookup normalizes punctuation, detects ambiguity across fleet stores, returns no arbitrary candidate, keeps draft entitlement and rejects query scope injection; native transport rejects substituted license/request IDs');
    }finally{await pg.close();delete global.himotoPool;}
  }
  delete global.himotoPool;console.log(JSON.stringify({passed:checks.length,checks,fixtureOnly:true,operationalWrites:0},null,2));
}
run().catch(error=>{console.error(error);process.exitCode=1;});
