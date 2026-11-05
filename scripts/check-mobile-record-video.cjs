// Disposable PostgreSQL engine; real web writer, bearer adapter and RLS wrapper.
// Cloudinary/S3 are deterministic in-memory fixtures. No environment files.
require('./lib/offline-tests.cjs');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {randomUUID,createHash}=require('node:crypto'),{NextRequest}=require('next/server');
const {load,root}=require('./lib/load-typescript.cjs');
async function run(){
  const at=process.argv.indexOf('--pglite-path');assert(at>=0&&process.argv[at+1]);
  const {PGlite}=require(path.resolve(process.argv[at+1])),pg=new PGlite();let failReceipt=false,loseCommit=false;
  const raw={release(){},async query(sql,values){
    if(failReceipt&&sql.includes('UPDATE himoto.management_mobile_requests SET resource_id')){failReceipt=false;throw Error('QA receipt failure');}
    const r=!values&&sql.includes(';')?(await pg.exec(sql)).at(-1):await pg.query(sql,values);
    if(sql==='COMMIT'&&loseCommit){loseCommit=false;throw Error('QA lost after commit');}
    return{...r,rowCount:r.rows.length||r.affectedRows||0};
  }};
  global.himotoPool={connect:async()=>raw,query:raw.query.bind(raw)};
  Object.assign(process.env,{CLOUDINARY_CLOUD_NAME:'qa-cloud',CLOUDINARY_API_KEY:'123456789',CLOUDINARY_API_SECRET:'qa-only-secret',VIDEO_STORAGE_PROVIDER:'cloudinary',CLOUDFLY_S3_ENDPOINT:'https://s3.cloudfly.vn',CLOUDFLY_S3_BUCKET:'qa-mobile-videos',CLOUDFLY_S3_ACCESS_KEY_ID:'qa-only-access',CLOUDFLY_S3_SECRET_ACCESS_KEY:'qa-only-storage'});
  delete process.env.CLOUDINARY_URL;
  const sdk=require('@aws-sdk/client-s3'),cloudinary=require('cloudinary').v2,objects=new Map();
  const oldSend=sdk.S3Client.prototype.send,oldResource=cloudinary.api.resource,oldDestroy=cloudinary.uploader.destroy;
  const mp4=Buffer.concat([Buffer.from([0,0,0,24]),Buffer.from('ftypisom'),Buffer.alloc(48,7)]);let duration=12,reads=0,cleanup=0,failStorage=false,brokenStream=false;
  cloudinary.api.resource=async()=>{reads++;return{resource_type:'video',format:'mp4',version:1,bytes:mp4.length,duration,video:{codec:'h264'}};};
  cloudinary.uploader.destroy=async()=>{cleanup++;return{result:'ok'};};
  global.fetch=async(url,options)=>{assert.match(String(url),/^https:\/\/api\.cloudinary\.com\/v1_1\/qa-cloud\/video\/download\?/);assert(!options.headers?.Authorization);const range=options.headers?.Range;let a=0,b=mp4.length-1;if(range){const[x,y]=range.slice(6).split('-');a=x?Number(x):Math.max(0,mp4.length-Number(y));b=x&&y?Math.min(Number(y),b):b;}return new Response(brokenStream?mp4.subarray(a,b):mp4.subarray(a,b+1),{status:range?206:200,headers:{'Content-Type':'video/mp4','Content-Length':String(b-a+1),...(range?{'Content-Range':`bytes ${a}-${b}/${mp4.length}`}:{})}});};
  sdk.S3Client.prototype.send=async function(command){const p=command.input;if(command instanceof sdk.HeadObjectCommand){const o=objects.get(p.Key);if(!o)throw Object.assign(Error('missing'),{$metadata:{httpStatusCode:404}});return o.head;}
    if(command instanceof sdk.PutObjectCommand){if(failStorage)throw Error('QA storage failed');assert.equal(p.IfNoneMatch,'*');assert.equal(p.ACL,'private');assert.equal(p.Metadata.sha256,createHash('sha256').update(p.Body).digest('hex'));objects.set(p.Key,{bytes:Buffer.from(p.Body),head:{ContentType:p.ContentType,ContentLength:p.Body.length,ETag:'"qa-etag"',Metadata:p.Metadata}});return{};}
    if(command instanceof sdk.GetObjectCommand){const o=objects.get(p.Key);assert.equal(p.IfMatch,o.head.ETag);let a=0,b=o.bytes.length-1;if(p.Range){const[x,y]=p.Range.slice(6).split('-');a=x?Number(x):Math.max(0,o.bytes.length-Number(y));b=x&&y?Math.min(Number(y),b):b;}return{...o.head,ContentLength:b-a+1,ContentRange:p.Range?`bytes ${a}-${b}/${o.bytes.length}`:undefined,$metadata:{httpStatusCode:p.Range?206:200},Body:{transformToWebStream:()=>new Response(o.bytes.subarray(a,b+1)).body}};}
    throw Error('Unexpected storage call');};
  const writer=load(path.join(root,'lib/server/mobile-record-video-write')),reader=load(path.join(root,'lib/server/mobile-video-read')),media=load(path.join(root,'lib/server/mobile-record-media')),recovery=load(path.join(root,'lib/server/mobile-write-recovery'));
  Object.defineProperty(load(path.join(root,'lib/server/himoto-database')).ownerDatabase,'query',{configurable:true,value:async()=>({rows:[{referenced:false}]})});
  const dto=load(path.resolve('shared/mobile-video')),client=load(path.resolve('mobile/src/lib/api')).createApi('https://fixture.invalid','hm1_'+'a'.repeat(43));
  const user={id:7,name:'QA video',role:'staff',access_role:'custom',store_id:23,scope_all:false,permissions:['contracts.read','vehicles.read']},target={entity:'contracts',id:'101',kind:'rental',referenceId:'101'};
  const request=(method,body,headers={},query='')=>new NextRequest('https://fixture.invalid/video'+query,{method,headers,...(body?{body:JSON.stringify(body)}:{})});
  const prepare=()=>media.readMobileMediaSlotInfo(user,target,'rental-video-1',request('GET'));
  const headers=(info,key)=>({'Content-Type':'application/json','Idempotency-Key':key,'X-Record-Revision':info.target.revision,'X-Reference-Revision':info.target.referenceRevision,'X-Media-Snapshot':info.target.snapshot,'X-Photo-Revision':info.photo?.revision??'0'});
  const cloud=key=>{const public_id=`himoto/management-video/7/${key}`;return{public_id,version:1,resource_type:'video',signature:cloudinary.utils.api_sign_request({public_id,version:1},'qa-only-secret')};};
  const write=(info,key=randomUUID(),actor=user,receipt=cloud(key))=>writer.uploadMobileRecordVideo(actor,target,'rental-video-1',request('PUT',receipt,headers(info,key)));
  const resolve=(key,actor=user)=>recovery.resolveMobileWrite(actor,key,request('POST',{operation:'video.record:101'},{'Content-Type':'application/json'}));
  const play=(proof,range=null,actor=user)=>reader.readMobileVideo(actor,target,proof.slot,request('GET',null,range?{Range:range}:{},'?revision='+proof.photoRevision));
  const state=async()=>({orders:(await pg.query('SELECT *,xmin::text AS revision FROM himoto.orders ORDER BY id')).rows,photos:(await pg.query('SELECT *,xmin::text AS revision FROM himoto.management_record_photos ORDER BY entity_id,slot')).rows,requests:(await pg.query('SELECT * FROM himoto.management_mobile_requests ORDER BY request_id')).rows,proofs:(await pg.query('SELECT * FROM himoto.management_mobile_record_media ORDER BY request_id')).rows});
  const checks=[];
  try{
    await pg.exec(`CREATE SCHEMA himoto;CREATE ROLE himoto_scoped;CREATE ROLE anon;CREATE ROLE authenticated;
      CREATE TABLE himoto.orders(id bigint PRIMARY KEY,store_id bigint,deleted_at timestamptz);
      CREATE TABLE himoto.vehicles(id bigint PRIMARY KEY,deleted_at timestamptz);
      CREATE TABLE himoto.management_record_photos(entity_type text,entity_id bigint,slot text,mime_type text,data bytea,updated_by bigint,updated_at timestamptz DEFAULT now(),cloudinary_public_id text,cloudinary_cloud_name text,cloudinary_version bigint,object_bucket text,object_key text,object_etag text,PRIMARY KEY(entity_type,entity_id,slot));
      CREATE TABLE himoto.management_mobile_requests(user_id bigint,request_id uuid,operation varchar(64),fingerprint char(64),resource_id bigint,resource_revision varchar(32),PRIMARY KEY(user_id,request_id));
      CREATE FUNCTION himoto.access_store(v bigint) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT current_setting('himoto.scope_all',true)='true' OR v=NULLIF(current_setting('himoto.store_id',true),'')::bigint$$;
      GRANT USAGE ON SCHEMA himoto TO himoto_scoped;GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA himoto TO himoto_scoped;
      ALTER TABLE himoto.orders ENABLE ROW LEVEL SECURITY;CREATE POLICY branch_orders ON himoto.orders TO himoto_scoped USING(himoto.access_store(store_id));
      ALTER TABLE himoto.management_record_photos ENABLE ROW LEVEL SECURITY;CREATE POLICY scoped_media ON himoto.management_record_photos TO himoto_scoped USING(EXISTS(SELECT 1 FROM himoto.orders WHERE id=entity_id)) WITH CHECK(EXISTS(SELECT 1 FROM himoto.orders WHERE id=entity_id AND deleted_at IS NULL));
      ALTER TABLE himoto.management_mobile_requests ENABLE ROW LEVEL SECURITY;CREATE POLICY actor_requests ON himoto.management_mobile_requests TO himoto_scoped USING(user_id=NULLIF(current_setting('himoto.actor_id',true),'')::bigint);
      INSERT INTO himoto.orders VALUES(101,23,NULL),(102,24,NULL);`);
    await pg.exec(fs.readFileSync('docs/sql/2026-11-02-mobile-record-media.sql','utf8'));
    const info=await prepare(),key=randomUUID(),initial=await state();
    const signed=await writer.signMobileRecordVideo(user,target,'rental-video-1',request('POST',{uploadId:key},headers(info,key)));assert(dto.isMobileVideoSignature(signed));assert(!JSON.stringify(signed).includes('qa-only-secret'));assert.deepEqual(await state(),initial);
    const proof=await write(info,key);assert(dto.isMobileVideoReceipt(proof));assert(proof.current&&!proof.replayed);assert.equal(proof.bytes,mp4.length);assert.equal(proof.duration,12);assert.deepEqual((await state()).orders,initial.orders);
    const saved=await state(),count=reads;assert.deepEqual(await write(info,key),{...proof,replayed:true});assert.equal(reads,count);assert.deepEqual(await state(),saved);
    assert.equal((await resolve(key)).status,'committed');assert.equal((await writer.readMobileVideoReceipt({...user,id:8},key)).receipt,null);
    await assert.rejects(()=>write(info,key,user,{...cloud(key),version:2}),e=>e.code==='INVALID_VIDEO');
    await assert.rejects(()=>write(info,randomUUID()),e=>e.code==='MEDIA_REVIEW_REQUIRED');
    checks.push('Actual web Cloudinary writer atomically saves video/actor proof with parent/photo CAS; scoped signed capability excludes server secret, UUID replay skips provider calls and preserves all operational rows');
    const beforeFailure=await state(),current=await prepare();failReceipt=true;await assert.rejects(()=>write(current),/QA receipt failure/);assert.deepEqual(await state(),beforeFailure);
    duration=61;await assert.rejects(()=>write(current),e=>e.code==='MEDIA_REVIEW_REQUIRED');assert.deepEqual(await state(),beforeFailure);duration=12;
    const cancelled=randomUUID();assert.equal((await resolve(cancelled)).status,'cancelled');await assert.rejects(()=>write(current,cancelled),e=>e.code==='REQUEST_CANCELLED');
    const lost=randomUUID();loseCommit=true;await assert.rejects(()=>write(current,lost),/QA lost after commit/);const recovered=(await writer.readMobileVideoReceipt(user,lost)).receipt;assert(recovered.current);assert.equal((await resolve(lost)).status,'committed');assert.equal((await write(current,lost)).requestId,lost);
    assert(!(await writer.readMobileVideoReceipt(user,key)).receipt.photoCurrent);
    checks.push('Receipt failure rolls video and request back; actual 60-second web gate rejects oversize duration, tombstone blocks late save, lost COMMIT resolves original UUID and later replacement marks old proof noncurrent');
    for(const actor of [{...user,store_id:24}]){await assert.rejects(async()=>write(await prepare(),randomUUID(),actor),e=>[403,404].includes(e.status));await assert.rejects(()=>writer.readMobileVideoReceipt(actor,lost),e=>e.status===403);await assert.rejects(()=>resolve(lost,actor),e=>e.status===403);}
    await assert.rejects(()=>resolve(lost,{...user,permissions:[]}),e=>e.status===403);
    const playback=await play(recovered,'bytes=4-11');assert.equal(playback.status,206);assert.equal(playback.headers.get('Content-Range'),`bytes 4-11/${mp4.length}`);assert.equal(playback.headers.get('Location'),null);assert.equal(playback.headers.get('Cache-Control'),'private, no-store');assert.deepEqual(Buffer.from(await playback.arrayBuffer()),mp4.subarray(4,12));
    for(const range of ['bytes=10-2','bytes=-0','bytes=-00','bytes=0-1,5-6','words=0-1'])await assert.rejects(()=>play(recovered,range),e=>e.status===416);
    brokenStream=true;const truncated=await play(recovered);await assert.rejects(()=>truncated.arrayBuffer(),/incomplete/);brokenStream=false;
    checks.push('Branch/actor/grant checks protect original receipts; authenticated streaming preserves exact range, private headers and bounded length, rejects invalid ranges/truncation and never redirects Himoto bearer to storage');
    process.env.VIDEO_STORAGE_PROVIDER='cloudfly';const objectKey=randomUUID(),objectInfo=await prepare(),objectProof=await write(objectInfo,objectKey);assert(objectProof.current);assert(objects.size===1);assert.equal(cleanup,1);
    const objectPlayback=await play(objectProof,'bytes=-8');assert.equal(objectPlayback.status,206);assert.deepEqual(Buffer.from(await objectPlayback.arrayBuffer()),mp4.subarray(-8));
    const failed=await state();failStorage=true;await assert.rejects(async()=>write(await prepare()),/QA storage failed/);failStorage=false;assert.deepEqual(await state(),failed);
    const original=(await writer.readMobileVideoReceipt(user,objectKey)).receipt;assert(original.current);await pg.exec('UPDATE himoto.orders SET deleted_at=now() WHERE id=101');assert(!(await writer.readMobileVideoReceipt(user,objectKey)).receipt.parentCurrent);assert.equal((await resolve(objectKey)).status,'committed');
    checks.push('Actual CloudFly conversion/archive writer verifies stored duration/bytes/ETag, cleans temporary conversion only after commit and serves suffix ranges; storage failure rolls DB back and archived parent keeps original receipt recoverable');
    const oldFetch=global.fetch;global.fetch=async(url,options)=>{assert.equal(new URL(url).origin,'https://fixture.invalid');assert.equal(options.redirect,'error');return Response.json({receipt:original});};assert.equal((await client.videoReceipt(objectKey)).receipt.assetHash,objectProof.assetHash);
    global.fetch=async()=>Response.json({receipt:{...original,assetHash:'bad'}});await assert.rejects(()=>client.videoReceipt(objectKey),e=>e.code==='INVALID_RESPONSE');global.fetch=oldFetch;
    const source=client.recordVideoSource(original.target,{slot:original.slot,label:original.label,revision:original.photoRevision,mimeType:'video/mp4',bytes:original.bytes,updatedAt:original.recordedAt,kind:'video',readable:true,blockedReason:null});assert.equal(new URL(source.uri).origin,'https://fixture.invalid');assert(source.headers.Authorization.startsWith('Bearer hm1_'));assert(!source.uri.includes('hm1_'));assert.equal(source.useCaching,false);
    if(process.argv.includes('--synthetic-file'))await require('./lib/mobile_direct_video_sql.cjs')({pg,load,root,user,target,prepare,headers,write,resolve,state,checks,setFailReceipt:()=>{failReceipt=true;}});
    if(process.argv.includes('--history'))await require('./lib/mobile_media_history_sql.cjs')({pg,load,root,user,checks});
    console.log(JSON.stringify({ok:true,groups:checks.length,checks,externalNetworkAllowed:false,operationalWrites:0},null,2));
  }finally{sdk.S3Client.prototype.send=oldSend;cloudinary.api.resource=oldResource;cloudinary.uploader.destroy=oldDestroy;await pg.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
