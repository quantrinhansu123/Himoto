// Customer document/OCR transport. Synthetic fixtures only; no env files.
require('./lib/offline-tests.cjs');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {randomUUID,createHash}=require('node:crypto');
const {NextRequest}=require('next/server');
const {load,root}=require('./lib/load-typescript.cjs');

async function run(){
  const flag=process.argv.indexOf('--pglite-path');
  const pg=flag<0?null:new(require(path.resolve(process.argv[flag+1])).PGlite)();
  const checks=[];let connections=0,loseCommit=false,failReceipt=false;
  const raw={release(){},async query(sql,values){
    assert(pg,'OCR must not open a DB connection');
    if(failReceipt&&sql.startsWith('INSERT INTO himoto.management_mobile_record_media')){failReceipt=false;throw Error('QA receipt failure');}
    const result=await pg.query(sql,values);
    if(loseCommit&&sql==='COMMIT'){loseCommit=false;throw Error('QA lost commit response');}
    return {...result,rowCount:result.rows.length||result.affectedRows||0};
  }};
  global.himotoPool={async connect(){connections++;return raw;},query:raw.query.bind(raw)};
  const user={id:7,role:'staff',access_role:'branch_staff',store_id:23,scope_all:false,permissions:['customers.read','customers.write']};
  const image=Buffer.from([255,216,255,224,1,2,3,4]);
  try{
    const dto=load(path.resolve(root,'../shared/mobile-record-media'));
    const ocrDto=load(path.resolve(root,'../shared/mobile-customer-ocr'));
    const target={entity:'customers',id:501,kind:'customer',referenceId:501,revision:'100',referenceRevision:'100',label:'QA documents',snapshot:'a'.repeat(64),canWrite:true};
    assert(dto.isMobileMediaTarget(target));assert(!dto.isMobileMediaTarget({...target,canWrite:undefined}));
    for(const slot of ['id_front','id_back','driver_license','id_front-extra-2'])assert(dto.isMobileMediaSlot(target,slot));
    for(const slot of ['plate-1','return-501-1','id_front-extra-1','driver_license-video-1'])assert(!dto.isMobileMediaSlot(target,slot));
    assert(!dto.isMobileMediaIdentity({...target,referenceId:502}));
    assert.equal(dto.mediaOperation('customers',501),'media.customer:501');
    checks.push('Customer identity binds the same profile/reference; only exact document and supplemental image slots are accepted');
    const {emptyCustomer}=load(path.resolve(root,'../mobile/src/lib/customer-form'));
    const webMerge=load(path.join(root,'lib/management/photo-ocr')).mergeOcrCustomer;
    const base={...emptyCustomer(23),name:'Before QA',address:'Manual address QA',id_card:'001234567890'};
    for(const now of [base,{...base,name:'Manual while reading QA'},{...base,id_card:'001234567899'},{...base,name:'PriorAI'}]){
      const result={name:'Read QA',id_card:'001234567890',id_card_issued_by:'QA issuer'};
      const previous={name:'PriorAI'};
      const mobile=ocrDto.mergeCustomerOcr(now,result,base,previous),web=webMerge(now,result,base,previous);
      assert.deepEqual(mobile,web);assert.equal(mobile.customer.address,base.address);
    }
    assert.equal(ocrDto.nextCustomerDocumentSlot('id_front',['id_front','id_front-extra-2']),'id_front-extra-3');
    assert.throws(()=>ocrDto.nextCustomerDocumentSlot('plate-1',[]));
    checks.push('OCR merge matches web rules for unchanged/manual/prior-AI identities and preserves current address; repeated images use supplemental slots');

    const photoService=load(path.join(root,'lib/server/photo-ocr'));
    const original=photoService.extractPhoto;let calls=0,result={fields:{id_card:'001234567890',name:'Synthetic QA'}};
    photoService.extractPhoto=async(kind,mime,bytes,signal,fetcher,options)=>{
      calls++;assert.equal(mime,'image/jpeg');assert.deepEqual(bytes,image);assert.equal(options.expectedIdentity,'001234567890');
      return result;
    };
    const ocr=load(path.join(root,'lib/server/mobile-customer-ocr'));
    const ocrRequest=(kind='cccd_front',id=randomUUID(),headers={},body=image)=>new NextRequest('https://fixture.invalid/api/mobile/v1/customers/documents/ocr',{
      method:'POST',headers:{'Content-Type':'image/jpeg','X-Photo-Kind':kind,'X-Ocr-Request':id,'X-Expected-Identity':'001234567890',...headers},body,
    });
    try{
      for(const who of [{...user,permissions:['customers.read']},{...user,permissions:[]}])
        await assert.rejects(()=>ocr.readMobileCustomerOcr(who,ocrRequest()),e=>e.code==='FORBIDDEN');
      await assert.rejects(()=>ocr.readMobileCustomerOcr(user,ocrRequest('plate')),e=>e.code==='INVALID_OCR_REQUEST');
      await assert.rejects(()=>ocr.readMobileCustomerOcr(user,ocrRequest('cccd_front','invalid')),e=>e.code==='INVALID_OCR_REQUEST');
      await assert.rejects(()=>ocr.readMobileCustomerOcr(user,ocrRequest('cccd_front',randomUUID(),{'Idempotency-Key':randomUUID()})),e=>e.code==='INVALID_OCR_REQUEST');
      await assert.rejects(()=>ocr.readMobileCustomerOcr(user,ocrRequest('cccd_front',randomUUID(),{'Content-Length':String(2*1024*1024+1)})),e=>e.status===413);
      assert.equal(calls,0);assert.equal(connections,0);
      const requestId=randomUUID(),response=await ocr.readMobileCustomerOcr(user,ocrRequest('cccd_front',requestId));
      assert(ocrDto.isMobileCustomerOcr(response,requestId,'cccd_front','001234567890'));
      assert(!ocrDto.isMobileCustomerOcr({...response,requestId:randomUUID()},requestId,'cccd_front','001234567890'));
      assert(!ocrDto.isMobileCustomerOcr({...response,fields:{...response.fields,address:'must not be applied'}},requestId,'cccd_front','001234567890'));
      assert((await ocr.readMobileCustomerOcr({...user,permissions:['customers.write']},ocrRequest())).fields.name);
      result={fields:{name:'Must not escape'}};
      await assert.rejects(()=>ocr.readMobileCustomerOcr(user,ocrRequest('driver_license')),e=>e.code==='INVALID_OCR_RESPONSE');
    checks.push('OCR matches the web customer-write grant, bounded bytes and bound request ID; wrong kinds, mixed responses and unrelated fields fail without DB/provider traffic');
    }finally{photoService.extractPhoto=original;}
    const {createApi}=load(path.resolve(root,'../mobile/src/lib/api'));
    const api=createApi('https://fixture.invalid','qa-token');
    const requestId=randomUUID();let response={requestId,kind:'customer_documents',expectedIdentity:'',fields:{name:'Synthetic QA'},warnings:[]};
    const form=new FormData();form.append('photos',new File([image],'qa.jpg',{type:'image/jpeg'}));
    global.fetch=async(url,options)=>{
      assert.equal(url,'https://fixture.invalid/api/mobile/v1/customers/documents/ocr');
      assert.equal(options.headers.Authorization,'Bearer qa-token');assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');
      assert(!('Content-Type'in options.headers),'Multipart boundary must be supplied by the fetch implementation');
      assert.equal(options.body,form);return new Response(JSON.stringify(response));
    };
    assert.deepEqual(await api.customerOcr('customer_documents',form,requestId),response);
    response={...response,requestId:randomUUID()};
    await assert.rejects(()=>api.customerOcr('customer_documents',form,requestId),e=>e.code==='INVALID_RESPONSE');
    checks.push('OCR client sends bearer multipart without JSON headers/cookies/redirects and rejects a result from another request');
    if(pg)await sqlChecks(pg,user,image,checks,()=>{loseCommit=true;},()=>{failReceipt=true;});
    console.log(JSON.stringify({passed:checks.length,checks,fixtureOnly:true,operationalWrites:0,transport:pg?'PGlite in-memory PostgreSQL, real scopedConnect/RLS':'synthetic guarded OCR/client'},null,2));
  }finally{delete global.himotoPool;if(pg)await pg.close();}
}

async function sqlChecks(pg,user,image,checks,loseResponse,failReceipt){
  await pg.exec(`CREATE SCHEMA himoto; CREATE ROLE himoto_scoped; CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE TABLE himoto.users(id bigint PRIMARY KEY);
    CREATE TABLE himoto.customers(id bigint PRIMARY KEY,name text,store_id bigint);
    CREATE TABLE himoto.orders(id bigint PRIMARY KEY,store_id bigint,deleted_at timestamptz);
    CREATE TABLE himoto.vehicles(id bigint PRIMARY KEY,store_id bigint,deleted_at timestamptz);
    CREATE TABLE himoto.management_record_photos(entity_type text,entity_id bigint,slot text,mime_type text,data bytea,
      updated_by bigint,updated_at timestamptz DEFAULT now(),cloudinary_public_id text,cloudinary_cloud_name text,cloudinary_version bigint,
      object_bucket text,object_key text,object_etag text,PRIMARY KEY(entity_type,entity_id,slot));
    INSERT INTO himoto.users VALUES(7),(8);
    INSERT INTO himoto.customers VALUES(501,'Local QA',23),(502,'Linked other QA',24);
    GRANT USAGE ON SCHEMA himoto TO himoto_scoped;
    GRANT SELECT,UPDATE ON himoto.customers TO himoto_scoped;
    GRANT SELECT ON himoto.orders,himoto.vehicles TO himoto_scoped;
    GRANT SELECT,INSERT,UPDATE ON himoto.management_record_photos TO himoto_scoped;
    ALTER TABLE himoto.customers ENABLE ROW LEVEL SECURITY;
    CREATE POLICY customer_read ON himoto.customers FOR SELECT TO himoto_scoped USING
      (id=502 OR current_setting('himoto.scope_all',true)='true' OR store_id=NULLIF(current_setting('himoto.store_id',true),'')::bigint);
    CREATE POLICY customer_update ON himoto.customers FOR UPDATE TO himoto_scoped USING
      (current_setting('himoto.scope_all',true)='true' OR store_id=NULLIF(current_setting('himoto.store_id',true),'')::bigint);
    ALTER TABLE himoto.management_record_photos ENABLE ROW LEVEL SECURITY;
    CREATE POLICY customer_photos ON himoto.management_record_photos TO himoto_scoped USING
      (entity_type='customers' AND EXISTS(SELECT 1 FROM himoto.customers c WHERE c.id=entity_id))
      WITH CHECK(entity_type='customers' AND EXISTS(SELECT 1 FROM himoto.customers c WHERE c.id=entity_id));`);
  for(const name of ['2026-10-31-mobile-writes.sql','2026-11-02-mobile-record-media.sql','2026-11-03-mobile-customer-documents.sql'])
    await pg.exec(fs.readFileSync(path.resolve(root,'../docs/sql',name),'utf8'));
  const read=load(path.join(root,'lib/server/mobile-record-media'));
  const write=load(path.join(root,'lib/server/mobile-record-media-write'));
  const resolve=load(path.join(root,'lib/server/mobile-write-recovery'));
  const raw=id=>({entity:'customers',id:String(id),kind:'customer',referenceId:String(id)});
  const req=new NextRequest('https://fixture.invalid/media');
  const info=()=>read.readMobileMediaSlotInfo(user,raw(501),'id_front',req);
  const fingerprint=async()=>JSON.stringify({customers:(await pg.query('SELECT id,name,store_id,xmin::text FROM himoto.customers ORDER BY id')).rows,
    photos:(await pg.query('SELECT *,xmin::text FROM himoto.management_record_photos ORDER BY entity_id,slot')).rows,
    requests:(await pg.query('SELECT * FROM himoto.management_mobile_requests ORDER BY request_id')).rows,
    proofs:(await pg.query('SELECT * FROM himoto.management_mobile_record_media ORDER BY request_id')).rows});
  const prepared=await info();assert(prepared.target.canWrite);assert.equal(prepared.photo,null);
  const other=await read.readMobileMediaSlotInfo(user,raw(502),'id_front',req);assert.equal(other.target.canWrite,false);
  await assert.rejects(()=>read.readMobileMediaTargets(user,{entity:'customers',id:'999'},new NextRequest('https://fixture.invalid/media?page=2')),e=>e.status===404);
  const request=(prepared,key)=>new NextRequest('https://fixture.invalid/media',{method:'PUT',headers:{'Content-Type':'image/jpeg','Idempotency-Key':key,
    'X-Record-Revision':prepared.target.revision,'X-Reference-Revision':prepared.target.referenceRevision,'X-Media-Snapshot':prepared.target.snapshot,
    'X-Photo-Revision':prepared.photo?.revision||'0'},body:image});
  const upload=(prepared,key=randomUUID(),who=user)=>write.uploadMobileRecordMedia(who,raw(prepared.target.id),prepared.slot,request(prepared,key));
  const reconcile=(key,operation,who=user)=>resolve.resolveMobileWrite(who,key,new NextRequest('https://fixture.invalid/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation})}));
  const before=await fingerprint();
  await assert.rejects(()=>upload(other),e=>[403,404].includes(e.status));assert.equal(await fingerprint(),before);
  const photoActor={...user,permissions:[]};
  assert.equal((await read.readMobileMediaSlotInfo(photoActor,raw(501),'id_front',req)).target.canWrite,true);
  const key=randomUUID(),proof=await upload(prepared,key,photoActor);
  assert.equal(proof.sha256,createHash('sha256').update(image).digest('hex'));assert(proof.current);assert.equal(proof.target.entity,'customers');
  const saved=await fingerprint();assert.deepEqual(await upload(prepared,key),{...proof,replayed:true});assert.equal(await fingerprint(),saved);
  assert.equal((await write.readMobileMediaReceipt({...user,id:8},key)).receipt,null);
  assert.equal((await reconcile(key,'media.customer:501')).status,'committed');
  assert.equal((await reconcile(key,'media.customer:501',photoActor)).status,'committed');
  assert((await write.readMobileMediaReceipt(photoActor,key)).receipt);
  checks.push('Customer media follows web authenticated/RLS access independently from profile edit grants; linked foreign profiles stay read-only, retries replay once and other actors cannot read proof');
  const cancel=randomUUID();assert.equal((await reconcile(cancel,'media.customer:501')).status,'cancelled');
  await assert.rejects(async()=>upload(await info(),cancel),e=>e.code==='REQUEST_CANCELLED');
  const failed=randomUUID(),next=await info(),snapshot=await fingerprint();failReceipt();
  await assert.rejects(()=>upload(next,failed),/QA receipt failure/);assert.equal(await fingerprint(),snapshot);
  const lost=randomUUID();loseResponse();await assert.rejects(()=>upload(next,lost),/QA lost commit response/);
  const recovered=(await write.readMobileMediaReceipt(user,lost)).receipt;assert(recovered.current);
  assert.equal((await reconcile(lost,'media.customer:501')).status,'committed');
  assert.deepEqual(await upload(next,lost),recovered);
  checks.push('Customer media tombstones block delayed uploads; failed receipts roll back photo/journal and lost commit recovers the original proof');
  const stale=await info();await pg.query("UPDATE himoto.customers SET name='Changed elsewhere QA' WHERE id=501");
  const changed=await fingerprint();await assert.rejects(()=>upload(stale),e=>e.code==='MEDIA_REVIEW_REQUIRED');assert.equal(await fingerprint(),changed);
  const old=(await write.readMobileMediaReceipt(user,key)).receipt;assert(!old.current&&!old.parentCurrent&&!old.referenceCurrent);
  for(const verb of ['UPDATE','DELETE'])assert.equal((await pg.query('SELECT has_table_privilege($1,$2,$3) AS allowed',['himoto_scoped','himoto.management_mobile_record_media',verb])).rows[0].allowed,false);
  checks.push('Changed customer revision rejects stale review without partial write; immutable proof keeps old metadata and current flags, with no receipt UPDATE/DELETE grants');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
