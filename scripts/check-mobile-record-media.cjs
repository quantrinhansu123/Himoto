require('./lib/offline-tests.cjs');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {NextRequest}=require('next/server');
const {load,root}=require('./lib/load-typescript.cjs');
const dto=load(path.resolve(root,'../shared/mobile-record-media'));
const api=load(path.resolve(root,'../mobile/src/lib/api')).createApi('https://fixture.invalid','hm1_'+'a'.repeat(43));
const server=load(path.join(root,'lib/server/mobile-record-media')),photos=load(path.join(root,'lib/server/record-photos'));
const writer=load(path.join(root,'lib/server/mobile-record-media-write'));
const pool=load(path.join(root,'lib/server/himoto-database')).himotoPool,descriptor=Object.getOwnPropertyDescriptor(pool,'connect');
const cloud=load(path.join(root,'lib/server/cloudinary-photos')),originalCloud=cloud.readCloudinaryPhoto,originalFetch=global.fetch;
const user={id:7,access_role:'custom',role:'staff',store_id:23,scope_all:false,permissions:['contracts.read']};
const target={entity:'contracts',id:101,kind:'return',referenceId:301},raw={entity:'contracts',id:'101',kind:'return',referenceId:'301'};
const at='2026-11-02T10:00:00.123Z',bytes=Buffer.from([0xff,0xd8,0xff,0]);
let connects=0,stored={slot:'return-301-1',revision:'12',mime_type:'image/jpeg',byte_count:4,updated_at:new Date(at),has_data:true,has_cloud:false,data:bytes};
const checks=[],queries=[];
const req=(query='',headers={})=>new NextRequest('https://fixture.invalid/media'+query,{headers});
Object.defineProperty(pool,'connect',{configurable:true,value:async()=>{connects++;return{release(){},async query(sql,params){
  queries.push({sql,params});
  const rows=sql.startsWith('SELECT COALESCE(max(')?[{largest:'12'}]:sql.includes('FROM himoto.management_record_photos')?stored?[stored]:[]:
    sql.includes('FROM himoto.orders')?[{id:101,revision:'10'}]:
    sql.includes('FROM himoto.order_vehicle_details d')?[{id:301,revision:'11',license:'QA-301'}]:
    sql.includes('FROM himoto.order_vehicle_details')?[{id:301}]:[];
  return{rows,rowCount:rows.length};
}};}});
async function run(){
  for(const [entity,kind,referenceId,good,bad] of [
    ['contracts','return',301,['return-301-1','return-301-18-extra-12','return-301-document-18-extra-2','return-301-video-3'],['return-30-1','return-301-video-1-extra-2','return-301-01']],
    ['contracts','swap',55,['vehicle-swap-55-17-extra-2'],['vehicle-swap-5-1','vehicle-swap-55-video-1','vehicle-swap-55-document-1']],
    ['vehicles','transfer',67,['transfer-67-1-extra-2'],['transfer-67-2','receive-67-1','transfer-6-1']],
    ['vehicles','receive',68,['receive-68-1'],['transfer-68-1','receive-68-1-extra-1']]]){
    const t={entity,id:101,kind,referenceId};assert(dto.isMobileMediaIdentity(t));
    for(const slot of good){assert(dto.isMobileMediaSlot(t,slot));assert.equal(photos.parsePhotoTarget(entity,'101',slot).slot,slot);}
    for(const slot of bad)assert(!dto.isMobileMediaSlot(t,slot));
  }
  for(const broken of [{...raw,entity:'customers'},{...raw,id:'01'},{...raw,referenceId:'1e3'},{...raw,entity:'vehicles'},{...raw,kind:'renewal_unknown'}]){
    await assert.rejects(()=>server.readMobileRecordMedia(user,broken,req()),e=>e.code==='INVALID_MEDIA_TARGET');
  }
  for(const query of ['?page=0','?page=01','?page=10001','?page=1&page=2','?scope_all=true','?slot=return-301-1'])
    await assert.rejects(()=>server.readMobileRecordMedia(user,raw,req(query)),e=>e.code==='INVALID_QUERY');
  await assert.rejects(()=>server.readMobileRecordMedia(user,raw,req('',{'Idempotency-Key':'00112233-4455-4677-8899-aabbccddeeff'})),e=>e.code==='INVALID_QUERY');

  for(const [slot,query,code] of [['return-302-1','?revision=12','INVALID_MEDIA_TARGET'],['return-301-1','','INVALID_QUERY'],['return-301-1','?revision=01','INVALID_QUERY'],
    ['return-301-1','?revision=12&revision=13','INVALID_QUERY'],['return-301-video-1','?revision=12','UNSUPPORTED_MEDIA']]){
    await assert.rejects(()=>server.readMobileRecordMediaImage(user,raw,slot,req(query)),e=>e.code===code);
  }
  assert.equal(connects,0);
  checks.push('Exact parent/kind/reference slot grammar retains supplemental images and matches shared parser; malformed IDs, cross-target slots, queries, UUID reads, video image requests fail before DB');
  const page=await server.readMobileRecordMedia(user,raw,req());assert(dto.isMobileRecordMedia(page));assert.equal(page.rows[0].updatedAt,at);
  assert.equal(page.slots.length,33);assert.equal(page.rows[0].bytes,4);assert(page.rows[0].readable);
  assert(!JSON.stringify(page).includes('cloudinary'));assert(!JSON.stringify(page).includes('data'));
  assert(queries.some(q=>q.sql==='BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'));assert(!queries.some(q=>/FOR (UPDATE|SHARE)|INSERT|UPDATE |DELETE /i.test(q.sql)));
  global.fetch=async(url,options)=>{assert.equal(new URL(url).origin,'https://fixture.invalid');assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert(options.signal instanceof AbortSignal);return Response.json(page);};
  assert.deepEqual(await api.recordMedia(target,1,new AbortController().signal),page);
  checks.push('Read-only preparation projects bounded slot choices and exact JPEG metadata without private storage fields; cancellable bearer client binds target/page, omits cookies and refuses redirects');
  const slotInfo=await server.readMobileMediaSlotInfo(user,raw,'return-301-1',req());
  assert.equal(slotInfo.nextSlot,'return-301-1-extra-13');assert.equal(slotInfo.photo.revision,'12');assert.equal(slotInfo.target.snapshot,page.target.snapshot);
  global.fetch=async()=>Response.json(slotInfo);assert.deepEqual(await api.mediaSlotInfo(target,'return-301-1'),slotInfo);
  global.fetch=async()=>Response.json({...slotInfo,slot:'return-301-2'});await assert.rejects(()=>api.mediaSlotInfo(target,'return-301-1'),e=>e.code==='INVALID_RESPONSE');
  checks.push('Exact slot metadata binds its own current photo revision and derives the next supplemental slot from the entire saved group, independently of paginated gallery rows');
  for(const broken of [{...page,target:{...page.target,id:102}},{...page,target:{...page.target,referenceId:302}},{...page,page:2},
    {...page,rows:[page.rows[0],page.rows[0]]},{...page,hasMore:true},{...page,rows:[{...page.rows[0],slot:'return-302-1'}]},
    {...page,rows:[{...page.rows[0],kind:'video'}]},{...page,rows:[{...page.rows[0],bytes:2*1024*1024+1}]}]){
    global.fetch=async()=>Response.json(broken);await assert.rejects(()=>api.recordMedia(target),e=>e.code==='INVALID_RESPONSE');
  }
  const source=api.recordMediaImageSource(target,page.rows[0]);assert.equal(new URL(source.uri).origin,'https://fixture.invalid');
  assert(source.headers.Authorization.startsWith('Bearer hm1_'));assert.equal(new URL(source.uri).search,'?revision=12');assert(!source.uri.includes('hm1_'));
  assert.throws(()=>api.recordMediaImageSource({...target,referenceId:302},page.rows[0]),e=>e.code==='INVALID_MEDIA_TARGET');
  const video=server.mapMediaPhoto(target,{...stored,slot:'return-301-video-1',mime_type:'video/mp4',has_data:false,has_cloud:true,byte_count:null});
  assert.equal(video.kind,'video');assert(video.readable&&video.blockedReason===null);assert(dto.isMobileMediaPhoto(video,target));
  assert.throws(()=>api.recordMediaImageSource(target,video),e=>e.code==='INVALID_MEDIA_TARGET');
  checks.push('Client rejects substituted parent/reference/page, duplicate/cross-target rows and incoherent MIME/size; native image source keeps bearer at the API origin and excludes videos which use the dedicated player');
  let result=await server.readMobileRecordMediaImage(user,raw,'return-301-1',req('?revision=12'));
  assert.deepEqual(Buffer.from(result.data),bytes);assert.equal(result.revision,'12');
  await assert.rejects(()=>server.readMobileRecordMediaImage(user,raw,'return-301-1',req('?revision=13')),e=>e.code==='MEDIA_REVIEW_REQUIRED');
  stored=null;await assert.rejects(()=>server.readMobileRecordMediaImage(user,raw,'return-301-1',req('?revision=12')),e=>e.code==='NOT_FOUND');
  stored={slot:'return-301-1',revision:'12',mime_type:'image/jpeg',byte_count:null,updated_at:new Date(at),has_data:false,has_cloud:true,
    data:null,cloudinary_public_id:'synthetic-id',cloudinary_cloud_name:'synthetic-cloud',cloudinary_version:1};
  cloud.readCloudinaryPhoto=async photo=>{assert.equal(photo.cloudinary_public_id,'synthetic-id');assert.equal(queries.at(-1).sql,'COMMIT');return new Response(bytes);};
  result=await server.readMobileRecordMediaImage(user,raw,'return-301-1',req('?revision=12'));assert.deepEqual(Buffer.from(result.data),bytes);
  checks.push('Inline and trusted-storage image reads bind the exact photo revision; missing/stale slots fail and external bytes are read only after the scoped read-only transaction commits');
  let cancelled=false;
  cloud.readCloudinaryPhoto=async()=>new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(2*1024*1024+1));},cancel(){cancelled=true;}}));
  await assert.rejects(()=>server.readMobileRecordMediaImage(user,raw,'return-301-1',req('?revision=12')),e=>e.code==='MEDIA_TOO_LARGE');assert(cancelled);
  cloud.readCloudinaryPhoto=async()=>new Response('not a JPEG');
  await assert.rejects(()=>server.readMobileRecordMediaImage(user,raw,'return-301-1',req('?revision=12')),e=>e.code==='MEDIA_REVIEW_REQUIRED');
  checks.push('Proxy bounds actual streamed bytes at 2 MiB, cancels oversize responses and rejects a MIME/signature mismatch without returning any storage URL or allocating a write key');
  const key='00112233-4455-4677-8899-aabbccddeeff',prepared={...target,revision:'10',referenceRevision:'11',label:'Trả xe · QA-301',snapshot:'b'.repeat(64)};
  const proof={id:101,revision:'10',replayed:false,requestId:key,target:prepared,slot:'return-301-1',label:'Toàn cảnh xe',photoRevision:'12',sha256:'a'.repeat(64),bytes:4,
    actorId:7,actorName:'QA',recordedAt:at,parentCurrent:true,referenceCurrent:true,photoCurrent:true,current:true};
  assert(dto.isMobileMediaReceipt(proof));
  global.fetch=async(url,options)=>{assert.equal(options.method,'PUT');assert.equal(options.headers['X-Record-Revision'],'10');assert.equal(options.headers['X-Reference-Revision'],'11');
    assert.equal(options.headers['X-Photo-Revision'],'0');assert.equal(options.headers['Idempotency-Key'],key);assert.equal(options.headers['Content-Type'],'image/jpeg');return Response.json(proof);};
  const uploadBytes=new Uint8Array(bytes).buffer;
  assert.deepEqual(await api.uploadRecordMedia(prepared,'return-301-1',null,uploadBytes,key),proof);
  for(const broken of [{...proof,requestId:'11223344-5566-4788-99aa-bbccddeeff00'},{...proof,target:{...prepared,referenceId:302}},
    {...proof,target:{...prepared,referenceRevision:'13'}},{...proof,target:{...prepared,snapshot:'c'.repeat(64)}},{...proof,slot:'return-301-2'},{...proof,bytes:5},{...proof,current:false}]){
    global.fetch=async()=>Response.json(broken);await assert.rejects(()=>api.uploadRecordMedia(prepared,'return-301-1',null,uploadBytes,key),e=>e.code==='INVALID_RESPONSE');
  }
  global.fetch=async()=>Response.json({receipt:{...proof,current:false,photoCurrent:false}});
  assert.equal((await api.mediaReceipt(key)).receipt.photoRevision,'12');
  await assert.rejects(()=>api.mediaReceipt('11223344-5566-4788-99aa-bbccddeeff00'),e=>e.code==='INVALID_RESPONSE');
  checks.push('Image PUT binds the same UUID, exact target/slot, parent/reference revisions and byte count; client rejects substituted receipts and permits original proof with coherent later-correction flags');
  const priorConnects=connects;
  function put(headers={},data=bytes){return new NextRequest('https://fixture.invalid/media',{method:'PUT',headers:{'Content-Type':'image/jpeg','Idempotency-Key':key,'X-Record-Revision':'10','X-Reference-Revision':'11','X-Photo-Revision':'0','X-Media-Snapshot':'b'.repeat(64),...headers},body:data});}
  for(const [headers,data,code] of [[{'X-Record-Revision':'01'},bytes,'INVALID_MEDIA'],[{'X-Reference-Revision':'0'},bytes,'INVALID_MEDIA'],
    [{'X-Photo-Revision':'none'},bytes,'INVALID_MEDIA'],[{'Idempotency-Key':'bad'},bytes,'INVALID_REQUEST_KEY'],[{'Content-Type':'video/mp4'},bytes,'INVALID_MEDIA'],
    [{},Buffer.from('bad-image'),'INVALID_MEDIA'],[{'Content-Length':String(2*1024*1024+1)},bytes,'MEDIA_TOO_LARGE'],[{},Buffer.alloc(2*1024*1024+1),'MEDIA_TOO_LARGE']]){
    await assert.rejects(()=>writer.uploadMobileRecordMedia(user,raw,'return-301-1',put(headers,data)),e=>e.code===code);
  }
  await assert.rejects(()=>writer.uploadMobileRecordMedia(user,raw,'return-302-1',put()),e=>e.code==='FORBIDDEN');
  await assert.rejects(()=>writer.uploadMobileRecordMedia(user,raw,'return-301-video-1',put()),e=>e.code==='INVALID_MEDIA_TARGET');
  assert.equal(connects,priorConnects);
  checks.push('Writer rejects malformed UUID/revisions, cross-reference slot, video, wrong MIME/signature and declared/actual oversized bodies before opening a DB connection');
  const resultJson={passed:checks.length,checks,fixtureOnly:true,operationalWrites:0,externalNetworkAllowed:false};
  fs.mkdirSync('.backups',{recursive:true});fs.writeFileSync('.backups/mobile-record-media-results.json',JSON.stringify(resultJson,null,2)+'\n');console.log(JSON.stringify(resultJson,null,2));
}
run().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{global.fetch=originalFetch;cloud.readCloudinaryPhoto=originalCloud;Object.defineProperty(pool,'connect',descriptor);});
