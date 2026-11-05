// Actual browser MP4 parser/signature + shared web/native writer on disposable SQL.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createHash,randomUUID}=require('node:crypto'),{NextRequest}=require('next/server');
module.exports=async function directVideo({pg,load,root,user,target,prepare,headers,write,resolve,state,checks,setFailReceipt}) {
  const at=process.argv.indexOf('--synthetic-file'),filename=path.resolve(process.argv[at+1]);
  assert(filename.startsWith(path.resolve('.backups')+path.sep));const bytes=fs.readFileSync(filename),sha256=createHash('sha256').update(bytes).digest('hex');
  const sdk=require('@aws-sdk/client-s3'),savedSend=sdk.S3Client.prototype.send,objects=new Map();let calls=0;
  const writer=load(path.join(root,'lib/server/mobile-record-video-write')),dto=load(path.resolve('shared/mobile-video-upload'));
  const cloudEnv=Object.fromEntries(['CLOUDINARY_CLOUD_NAME','CLOUDINARY_API_KEY','CLOUDINARY_API_SECRET','CLOUDINARY_URL'].map(k=>[k,process.env[k]]));
  for(const k of Object.keys(cloudEnv))delete process.env[k];
  process.env.VIDEO_STORAGE_PROVIDER='cloudfly';process.env.MANAGEMENT_SESSION_SECRET='qa-mobile-direct-video-secret-at-least-32-bytes';delete process.env.BROWSER_VIDEO_PROCESSING;
  sdk.S3Client.prototype.send=async function(command){calls++;const p=command.input,o=objects.get(p.Key);
    if(command instanceof sdk.HeadObjectCommand){if(!o)throw Object.assign(Error('missing'),{$metadata:{httpStatusCode:404}});return o.head;}
    if(command instanceof sdk.GetObjectCommand){assert(o);assert.equal(p.IfMatch,o.head.ETag);return{...o.head,Body:{transformToWebStream:()=>new Response(o.bytes).body}};}
    if(command instanceof sdk.CopyObjectCommand){assert(o);assert.equal(p.CopySourceIfMatch,o.head.ETag);assert.equal(p.ACL,'private');assert.equal(p.MetadataDirective,'REPLACE');o.head.Metadata=p.Metadata;return{};}
    throw Error('Unexpected direct storage command');
  };
  const request=(info,key,body)=>new NextRequest('https://fixture.invalid/direct',{method:'POST',headers:headers(info,key),body:JSON.stringify({...body,uploadId:key})});
  const direct=(info,key,body,actor=user)=>writer.directMobileRecordVideo(actor,target,'rental-video-1',request(info,key,body));
  const put=(key,data=bytes)=>objects.set(`himoto/videos/browser/${user.id}/${key}/v1.mp4`,{bytes:data,head:{ContentLength:data.length,ContentType:'video/mp4',ETag:'"qa-direct-etag"',Metadata:{sha256:createHash('sha256').update(data).digest('hex')}}});
  try{
    await pg.exec('UPDATE himoto.orders SET deleted_at=NULL WHERE id=101');
    const before=await state(),info=await prepare(),key=randomUUID();
    assert.deepEqual(await direct(info,key,{action:'config'}),{direct:true});
    const signed=await direct(info,key,{action:'sign',bytes:bytes.length,sha256});assert(dto.isMobileVideoDirectResult(signed,user.id,key,sha256));assert(!signed.receipt);assert(!JSON.stringify(signed).includes('qa-mobile-direct-video-secret'));assert.deepEqual(await state(),before);
    const beforeMismatch=calls;await assert.rejects(()=>direct(info,randomUUID(),{action:'verify',ticket:signed.ticket}),e=>e.status===409);assert.equal(calls,beforeMismatch);
    put(key);const verified=await direct(info,key,{action:'verify',ticket:signed.ticket});assert(dto.isMobileVideoBrowserReceipt(verified.receipt));assert.equal(verified.receipt.upload_id,key);
    const stored=objects.get(`himoto/videos/browser/${user.id}/${key}/v1.mp4`);assert.equal(stored.head.Metadata.codec,'h264');assert.equal(stored.head.Metadata.audio,'none');assert(Number(stored.head.Metadata.duration)>0&&Number(stored.head.Metadata.duration)<=60);assert(/^[a-f0-9]{64}$/.test(stored.head.Metadata.validation));
    const saved=await write(info,key,user,verified.receipt);assert(saved.current&&!saved.replayed);assert.equal(saved.bytes,bytes.length);assert.equal(saved.duration,Number(stored.head.Metadata.duration));assert.deepEqual((await state()).orders,before.orders);
    const count=calls,committed=await state();assert.equal((await write(info,key,user,verified.receipt)).replayed,true);assert.equal(calls,count);assert.deepEqual(await state(),committed);assert.equal((await resolve(key)).status,'committed');
    await assert.rejects(()=>direct(info,key,{action:'sign',bytes:bytes.length,sha256}),e=>e.code==='MEDIA_REVIEW_REQUIRED'||e.code==='REQUEST_KEY_REUSED');
    checks.push('Direct MP4 uses actual web ticket/HMAC/hash/mediabunny AVC+audio+duration inspection and private S3 attestation without Cloudinary configuration; shared native/web photo writer commits CAS/proof once and UUID replay performs no storage request');
    const current=await prepare(),pending=randomUUID(),next=await direct(current,pending,{action:'sign',bytes:bytes.length,sha256});put(pending);
    const invalid=await state();await assert.rejects(()=>write(current,pending,user,{...verified.receipt,upload_id:pending}),e=>e.code==='INVALID_VIDEO');assert.deepEqual(await state(),invalid);
    const done=await direct(current,pending,{action:'verify',ticket:next.ticket});setFailReceipt();await assert.rejects(()=>write(current,pending,user,done.receipt),/QA receipt failure/);assert.deepEqual(await state(),invalid);
    const cancelled=randomUUID();const cancelledSigned=await direct(current,cancelled,{action:'sign',bytes:bytes.length,sha256});put(cancelled);const cancelledReady=await direct(current,cancelled,{action:'verify',ticket:cancelledSigned.ticket});assert.equal((await resolve(cancelled)).status,'cancelled');await assert.rejects(()=>write(current,cancelled,user,cancelledReady.receipt),e=>e.code==='REQUEST_CANCELLED');
    await assert.rejects(()=>direct(current,randomUUID(),{action:'sign',bytes:bytes.length,sha256,max_duration:180}),e=>e.code==='INVALID_VIDEO');
    for(const changed of [{url:signed.url.replace('s3.cloudfly.vn','evil.invalid')},{headers:{...signed.headers,Authorization:'Bearer fake'}},{url:signed.url.replace('/7/','/8/')}])assert(!dto.isMobileVideoDirectResult({...signed,...changed},user.id,key,sha256));
    const bad=randomUUID(),corrupt=Buffer.from('synthetic corrupt MP4'),badHash=createHash('sha256').update(corrupt).digest('hex'),badTicket=await direct(current,bad,{action:'sign',bytes:corrupt.length,sha256:badHash});put(bad,corrupt);await assert.rejects(()=>direct(current,bad,{action:'verify',ticket:badTicket.ticket}),e=>e.code==='VIDEO_CONVERSION_REQUIRED');
    checks.push('Direct upload binds actor/UUID/60 seconds, rejects foreign ticket before storage and forged receipt/URL/headers; invalid bytes require conversion, proof failure rolls DB back and cancelled UUID cannot attach a late validated object');
  }finally{sdk.S3Client.prototype.send=savedSend;for(const [k,v]of Object.entries(cloudEnv)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
};
