const assert=require('node:assert/strict'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {load,root}=require('./lib/load-typescript.cjs');
const sdk=require('@aws-sdk/client-s3'),sharp=require('sharp');
async function main(){
  Object.assign(process.env,{PHOTO_STORAGE_PROVIDER:'cloudfly',MEDIA_ARCHIVE_ENABLED:'on',CLOUDFLY_S3_ENDPOINT:'https://s3.cloudfly.vn',CLOUDFLY_S3_BUCKET:'synthetic-himoto',CLOUDFLY_S3_ACCESS_KEY_ID:'synthetic-key',CLOUDFLY_S3_SECRET_ACCESS_KEY:'synthetic-secret',MANAGEMENT_SESSION_SECRET:'synthetic-session-secret-for-local-tests-only'});
  const oldSend=sdk.S3Client.prototype.send,oldFetch=global.fetch,store=new Map();let corrupt=false,alias=null;
  global.himotoPool={query:async(sql,args)=>{assert(sql.includes('management_media_archive'));assert.equal(args[0],'synthetic-cloud');assert.equal(args[2],1);return{rows:alias?[alias]:[]};}};
  sdk.S3Client.prototype.send=async function(command){const k=command.input.Key,input=command.input;
    if(command instanceof sdk.PutObjectCommand){if(store.has(k))throw{$metadata:{httpStatusCode:412}};assert.equal(input.ACL,'private');assert.equal(input.IfNoneMatch,'*');store.set(k,{bytes:Buffer.from(input.Body),mime:input.ContentType,metadata:input.Metadata,etag:'"synthetic-etag"'});return{};}
    const found=store.get(k);if(!found)throw{$metadata:{httpStatusCode:404}};
    const headers={ETag:found.etag,ContentType:found.mime,ContentLength:found.bytes.length,Metadata:found.metadata,$metadata:{httpStatusCode:200}};
    if(command instanceof sdk.HeadObjectCommand)return headers;
    assert(command instanceof sdk.GetObjectCommand);assert.equal(input.IfMatch,found.etag);
    return{...headers,Body:{transformToWebStream:()=>new Response(corrupt?Buffer.from('wrong'):found.bytes).body}};
  };
  try{
    const objects=load(path.join(root,'lib/server/object-media')),cloud=load(path.join(root,'lib/server/cloudinary-photos'));
    const image=await sharp({create:{width:12,height:8,channels:3,background:{r:30,g:80,b:120}}}).jpeg().toBuffer(),id=randomUUID();
    const receipt=await objects.uploadObjectPhoto(image,'image/jpeg',7,id);
    assert.equal(receipt.signature.length,64);assert.deepEqual(cloud.verifyPhotoReceipt(receipt,7),receipt);
    assert.throws(()=>cloud.verifyPhotoReceipt(receipt,8));assert.throws(()=>cloud.verifyPhotoReceipt({...receipt,version:2},7));assert.throws(()=>cloud.verifyPhotoReceipt({...receipt,url:'https://invalid.test'},7));
    const stored=await objects.readyObjectPhoto(receipt,7);assert.equal(stored.storage_bytes,image.length);
    assert.deepEqual(await objects.uploadObjectPhoto(image,'image/jpeg',7,id),receipt);
    const other=await sharp({create:{width:12,height:8,channels:3,background:'red'}}).jpeg().toBuffer();
    await assert.rejects(()=>objects.uploadObjectPhoto(other,'image/jpeg',7,id),/chưa khớp/);
    const read=await objects.readObjectMedia(stored,'image/jpeg');assert(Buffer.from(await read.arrayBuffer()).equals(image));
    const signed=new URL(await objects.objectMediaUrl(stored,'image/jpeg'));assert.equal(signed.hostname,'s3.cloudfly.vn');assert.equal(signed.searchParams.get('X-Amz-Expires'),'300');
    let previewReads=0;
    const preview=await objects.photoPreviewUrl('synthetic-preview',async()=>{previewReads++;return image;});
    assert(new URL(preview).pathname.includes('/himoto/previews/'));
    await objects.photoPreviewUrl('synthetic-preview',async()=>{throw Error('Cached preview must not read the original');});
    assert.equal(previewReads,1);
    await assert.rejects(()=>objects.objectMediaUrl({...stored,object_bucket:'foreign'},'image/jpeg'));
    await assert.rejects(()=>objects.objectMediaUrl({...stored,object_key:'../../private'},'image/jpeg'));
    await assert.rejects(()=>objects.uploadObjectPhoto(Buffer.from([255,216,255,0]),'image/jpeg',7,randomUUID()),/không đọc được/);
    corrupt=true;await assert.rejects(()=>objects.uploadObjectPhoto(image,'image/jpeg',7,randomUUID()),/chưa khớp/);corrupt=false;
    const source={cloudinary_cloud_name:'synthetic-cloud',cloudinary_public_id:'synthetic/photo',cloudinary_version:1,mime_type:'image/jpeg'};
    const legacyKey='himoto/legacy/cloudinary/'+'a'.repeat(64)+'.jpg';store.set(legacyKey,store.get(stored.object_key));
    alias={...stored,object_key:legacyKey};global.fetch=async()=>{throw Error('Migrated reads must never contact Cloudinary');};
    assert(Buffer.from(await(await cloud.readCloudinaryPhoto(source)).arrayBuffer()).equals(image));
    assert.equal(new URL(await cloud.legacyMediaUrl(source)).hostname,'s3.cloudfly.vn');
    assert(await objects.legacyMediaObject({...source,cloudinary_version:'1'}));
    const delivery=load(path.join(root,'lib/server/telegram-delivery'));
    const videoKey='himoto/legacy/cloudinary/'+'b'.repeat(64)+'.mp4';
    alias={...alias,object_key:videoKey,storage_bytes:1024};
    const batches=[];for await(const b of delivery.telegramMediaBatches([{...source,slot:'rental-video-1',mime_type:'video/mp4'}],0,Date.now()+300000))batches.push(b);
    assert.equal(batches.length,1);assert.equal(batches[0][0].type,'video/mp4');assert.equal(new URL(batches[0][0].url).hostname,'s3.cloudfly.vn');
    alias={...alias,object_key:legacyKey};
    const snapshots=load(path.join(root,'lib/server/contract-notification-content'));
    const payload={code:'SYNTHETIC',at:new Date().toISOString(),actor:'QA',photos:[source]};const before=snapshots.notificationHash('rental',payload);await cloud.legacyMediaUrl(source);assert.equal(snapshots.notificationHash('rental',payload),before);
    console.log('PASS: private immutable upload, full hash verification, actor-bound receipts, replay/conflicts, bounded valid images, legacy alias reads and immutable notification hashes');
  }finally{sdk.S3Client.prototype.send=oldSend;global.fetch=oldFetch;}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
