// Uses a synthetic MP4 plus mocked storage/routes. No business writes or Telegram calls.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
require('@next/env').loadEnvConfig(process.cwd(), false, { info(){}, error(){} });
const { load, root } = require('./lib/load-typescript.cjs');
const sdk = require('@aws-sdk/client-s3');
const media = load(path.join(root, 'lib/server/browser-videos'));
const photos = load(path.join(root, 'lib/server/cloudinary-photos'));
const session = load(path.join(root, 'lib/server/management-session'));
const { himotoPool } = load(path.join(root, 'lib/server/himoto-database'));
const { NextRequest } = require('next/server');
const env = {...process.env}, originalSend = sdk.S3Client.prototype.send;
const originalUser = session.userFromSession, originalRead = session.readSessionUser;
const originalProtect = session.protectDatabaseRequest, connect = Object.getOwnPropertyDescriptor(himotoPool, 'connect');
const checks = [];
async function main() {
  const filename = process.argv[process.argv.indexOf('--synthetic-file') + 1];
  if (!process.argv.includes('--synthetic-file') || !filename || !path.resolve(filename).startsWith(path.resolve('.backups') + path.sep)) throw Error('Synthetic fixture in .backups required');
  const bytes = fs.readFileSync(filename), sha256 = createHash('sha256').update(bytes).digest('hex');
  assert(bytes.length < 1024 * 1024);
  Object.assign(process.env, { VIDEO_STORAGE_PROVIDER:'cloudfly', CLOUDFLY_S3_ENDPOINT:'https://s3.cloudfly.vn',
    CLOUDFLY_S3_BUCKET:'qa-browser-videos', CLOUDFLY_S3_ACCESS_KEY_ID:'qa-key', CLOUDFLY_S3_SECRET_ACCESS_KEY:'qa-secret',
    MANAGEMENT_SESSION_SECRET:'qa-browser-video-session-key-at-least-32-characters',
    CLOUDINARY_CLOUD_NAME:'qa',CLOUDINARY_API_KEY:'qa',CLOUDINARY_API_SECRET:'qa-secret' });
  delete process.env.BROWSER_VIDEO_PROCESSING; delete process.env.CLOUDINARY_URL;
  const objects = new Map(); let reads = 0, copies = 0;
  sdk.S3Client.prototype.send = async function(command) {
    const i = command.input, object = objects.get(i.Key);
    if (command instanceof sdk.HeadObjectCommand) {
      if (!object) throw Object.assign(Error('Missing synthetic object'), {$metadata:{httpStatusCode:404}});
      return {...object.head};
    }
    if (command instanceof sdk.GetObjectCommand) {
      assert(object); assert.equal(i.IfMatch, object.head.ETag); reads++;
      return {...object.head, Body:{transformToWebStream:()=>new Response(object.bytes).body}};
    }
    if (command instanceof sdk.CopyObjectCommand) {
      assert(object); assert.equal(i.CopySourceIfMatch, object.head.ETag); assert.equal(i.ACL,'private'); copies++;
      object.head = {...object.head, ContentType:i.ContentType, Metadata:i.Metadata}; return {};
    }
    throw Error('Unexpected storage mutation');
  };
  const id = randomUUID(), actor = 151;
  const signInput = {upload_id:id,bytes:bytes.length,sha256,max_duration:60};
  const signed = await media.signBrowserVideo(actor, signInput);
  const url = new URL(signed.url); assert.equal(url.protocol,'https:');
  assert.equal(signed.headers['If-None-Match'],'*'); assert.equal(signed.headers['x-amz-acl'],'private');
  assert.match(url.searchParams.get('X-Amz-SignedHeaders'),/if-none-match/);
  assert.match(url.searchParams.get('X-Amz-SignedHeaders'),/x-amz-meta-sha256/);
  assert.match(url.searchParams.get('X-Amz-SignedHeaders'),/content-length/);
  const key = `himoto/videos/browser/${actor}/${id}/v1.mp4`;
  objects.set(key,{bytes,head:{ContentType:'video/mp4',ContentLength:bytes.length,ETag:'"qa-etag"',Metadata:{sha256}}});
  const completed = await media.completeBrowserVideo(actor,signed.ticket);
  assert.equal(reads,1); assert.equal(copies,1);
  const ref = await media.readyBrowserVideo(completed.receipt,actor,60);
  assert.equal(ref.object_key,key);
  assert.equal(objects.get(key).head.Metadata.codec,'h264');
  assert.equal(objects.get(key).head.Metadata.validation.length,64);
  checks.push('Real synthetic MP4 is parsed, hashed and attested server-side before an actor-bound receipt becomes usable');
  assert.deepEqual(await media.completeBrowserVideo(actor,signed.ticket),completed); assert.equal(reads,1);
  assert.deepEqual((await media.signBrowserVideo(actor,signInput)).receipt,completed.receipt);
  await assert.rejects(()=>media.completeBrowserVideo(actor+1,signed.ticket));
  assert.throws(()=>media.verifyBrowserVideoReceipt(completed.receipt,actor+1));
  assert.throws(()=>media.verifyBrowserVideoReceipt({...completed.receipt,signature:'f'.repeat(64)},actor));
  assert.throws(()=>media.verifyBrowserVideoReceipt({...completed.receipt,object_key:'../another-file'},actor));
  await assert.rejects(()=>media.signBrowserVideo(actor,{...signInput,sha256:'f'.repeat(64)}));
  await assert.rejects(()=>media.completeBrowserVideo(actor,signed.ticket,Date.now()+16*60*1000));
  checks.push('Retries reuse the verified immutable object; another actor, forged receipt, arbitrary key, changed bytes and expired upload ticket are rejected');
  const savedHead = objects.get(key).head;
  objects.get(key).head={...savedHead,Metadata:{...savedHead.Metadata,duration:'1'}};
  await assert.rejects(()=>media.readyBrowserVideo(completed.receipt,actor,60));
  objects.get(key).head=savedHead;
  const badId=randomUUID(),badBytes=Buffer.from('not-a-video'),badHash=createHash('sha256').update(badBytes).digest('hex');
  const badTicket=await media.signBrowserVideo(actor,{upload_id:badId,bytes:badBytes.length,sha256:badHash,max_duration:60});
  objects.set(`himoto/videos/browser/${actor}/${badId}/v1.mp4`,{bytes:badBytes,head:{ContentType:'video/mp4',ContentLength:badBytes.length,ETag:'"bad"',Metadata:{sha256:badHash,duration:'1',codec:'h264',audio:'none',validation:'f'.repeat(64)}}});
  await assert.rejects(()=>media.completeBrowserVideo(actor,badTicket.ticket)); assert.equal(copies,1);
  await assert.rejects(()=>media.inspectBrowserMp4(bytes,0.01));
  await assert.rejects(()=>media.inspectBrowserMp4(new Uint8Array(46*1024*1024),60));
  checks.push('Forged storage metadata cannot bypass parsing; corrupt media, excessive duration and oversized output never obtain a receipt');
  const longPath=path.join(path.dirname(filename),'long61.mp4');
  if(fs.existsSync(longPath)){
    const longBytes=fs.readFileSync(longPath),longHash=createHash('sha256').update(longBytes).digest('hex'),longId=randomUUID();
    const signedLong=await media.signBrowserVideo(actor,{upload_id:longId,bytes:longBytes.length,sha256:longHash,max_duration:180});
    objects.set(`himoto/videos/browser/${actor}/${longId}/v1.mp4`,{bytes:longBytes,head:{ContentType:'video/mp4',ContentLength:longBytes.length,ETag:'"long"',Metadata:{sha256:longHash}}});
    const long=await media.completeBrowserVideo(actor,signedLong.ticket);
    await media.readyBrowserVideo(long.receipt,actor,180);
    await assert.rejects(()=>media.readyBrowserVideo(long.receipt,actor,60));
    checks.push('A real 61-second clip is accepted for shift evidence but its same valid receipt cannot bypass the contract 60-second limit');
  }
  const cloud = photos.signPhotoUpload(actor,randomUUID(),Date.now(),true);
  assert.equal(cloud.params.allowed_formats,'mp4'); assert.match(cloud.params.transformation,/vc_h264/);
  checks.push('Cloudinary fallback forces MOV/WebM into MP4 rather than bypassing conversion through allowed_formats');

  let user={id:actor,access_role:'branch_staff',store_id:23,scope_all:false,permissions:['contracts.read','contracts.draft']};
  session.userFromSession=session.readSessionUser=async()=>user;
  session.protectDatabaseRequest=async()=>null;
  const uploadRoute=load(path.join(root,'app/api/auth/photo-uploads/video/route'));
  const call=async(input,origin='http://localhost')=>uploadRoute.POST(new NextRequest('http://localhost/api/auth/photo-uploads/video',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(input)}),{});
  assert.equal((await call({action:'config'})).status,200);
  user={...user,permissions:['contracts.read']};assert.equal((await call({action:'config'})).status,200);
  user=null; assert.equal((await call({action:'config'})).status,401);
  user={id:actor,access_role:'branch_staff',store_id:23,scope_all:false,permissions:['contracts.read','contracts.draft']};
  assert.equal((await call({action:'config'},'https://other.example')).status,403);
  assert.equal((await call({action:'sign',upload_id:'x'.repeat(3000)})).status,413);
  checks.push('Actual upload endpoint accepts logged-in users and still requires same origin and a bounded JSON body');
  process.env.BROWSER_VIDEO_PROCESSING='off';
  assert.equal((await (await call({action:'config'})).json()).data.enabled,false);
  assert.equal((await call({action:'sign',...signInput})).status,503);
  assert.equal((await media.readyBrowserVideo(completed.receipt,actor,60)).object_key,key);
  delete process.env.BROWSER_VIDEO_PROCESSING;
  checks.push('Rollback disables new direct uploads while verified previously saved objects remain readable');
  let visible=true, writes=0;
  const client={release(){},query:async(sql,values)=>{
    if(/SELECT id FROM himoto.orders/.test(sql))return{rows:visible?[{id:123}]:[],rowCount:visible?1:0};
    if(/INSERT INTO himoto.management_record_photos/.test(sql)){writes++;assert.equal(values[5],key);return{rows:[],rowCount:1};}
    return{rows:[],rowCount:0};
  }};
  Object.defineProperty(himotoPool,'connect',{configurable:true,value:async()=>client});
  const route=load(path.join(root,'app/api/auth/record-photos/[entity]/[id]/[slot]/route'));
  const attach=()=>route.PUT(new NextRequest('http://localhost/api/auth/record-photos/contracts/123/rental-video-1',{method:'PUT',headers:{Origin:'http://localhost','Content-Type':'application/json'},body:JSON.stringify(completed.receipt)}),{params:Promise.resolve({entity:'contracts',id:'123',slot:'rental-video-1'})});
  assert.equal((await attach()).status,200);assert.equal(writes,1);
  visible=false;assert.equal((await attach()).status,404);assert.equal(writes,1);
  checks.push('Actual contract attachment writes only a verified object and enforces record visibility before storage lookup');
  console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0,realTelegramRequests:0},null,2));
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(()=>{
  sdk.S3Client.prototype.send=originalSend;session.userFromSession=originalUser;session.readSessionUser=originalRead;session.protectDatabaseRequest=originalProtect;
  Object.defineProperty(himotoPool,'connect',connect);
  for(const key of Object.keys(process.env))if(!(key in env))delete process.env[key];Object.assign(process.env,env);
});
