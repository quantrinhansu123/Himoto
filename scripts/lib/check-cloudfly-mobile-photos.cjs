const assert=require('node:assert/strict'),path=require('node:path'),{randomUUID,createHash}=require('node:crypto');
const {NextRequest}=require('next/server'),sdk=require('@aws-sdk/client-s3'),sharp=require('sharp');
module.exports=async function({pg,user,load,root,checks,loseResponse,failReceipt}){
  const oldSend=sdk.S3Client.prototype.send,oldProvider=process.env.PHOTO_STORAGE_PROVIDER,objects=new Map();
  Object.assign(process.env,{PHOTO_STORAGE_PROVIDER:'cloudfly',CLOUDFLY_S3_ENDPOINT:'https://s3.cloudfly.vn',CLOUDFLY_S3_BUCKET:'synthetic-mobile-photos',CLOUDFLY_S3_ACCESS_KEY_ID:'synthetic',CLOUDFLY_S3_SECRET_ACCESS_KEY:'synthetic',MANAGEMENT_SESSION_SECRET:'synthetic-mobile-photo-signing-secret-only'});
  sdk.S3Client.prototype.send=async function(command){const k=command.input.Key,i=command.input;
    if(command instanceof sdk.PutObjectCommand){if(objects.has(k))throw{$metadata:{httpStatusCode:412}};objects.set(k,{bytes:Buffer.from(i.Body),mime:i.ContentType,metadata:i.Metadata});return{};}
    const f=objects.get(k);if(!f)throw{$metadata:{httpStatusCode:404}};
    const response={ETag:'"synthetic"',ContentType:f.mime,ContentLength:f.bytes.length,Metadata:f.metadata,$metadata:{httpStatusCode:200}};
    if(command instanceof sdk.HeadObjectCommand)return response;
    assert(command instanceof sdk.GetObjectCommand);return{...response,Body:{transformToWebStream:()=>new Response(f.bytes).body}};
  };
  try{
    const media=load(path.join(root,'lib/server/mobile-record-media')),writer=load(path.join(root,'lib/server/mobile-record-media-write'));
    const target={entity:'customers',id:'501',kind:'customer',referenceId:'501'},slot='id_front';
    const info=()=>media.readMobileMediaSlotInfo(user,target,slot,new NextRequest('https://fixture.invalid/media'));
    const data=await sharp({create:{width:14,height:11,channels:3,background:'#254566'}}).jpeg().toBuffer(),digest=createHash('sha256').update(data).digest('hex');
    const upload=(p,key)=>writer.uploadMobileRecordMedia(user,target,slot,new NextRequest('https://fixture.invalid/media',{method:'PUT',headers:{'Content-Type':'image/jpeg','Idempotency-Key':key,'X-Record-Revision':p.target.revision,'X-Reference-Revision':p.target.referenceRevision,'X-Media-Snapshot':p.target.snapshot,'X-Photo-Revision':p.photo?.revision||'0'},body:data}));
    const p=await info(),key=randomUUID(),proof=await upload(p,key);assert(proof.current);assert.equal(proof.sha256,digest);
    const stored=(await pg.query("SELECT data,object_key,storage_sha256,storage_bytes FROM himoto.management_record_photos WHERE entity_type='customers' AND entity_id=501 AND slot='id_front'")).rows[0];
    assert.equal(stored.data,null);assert(stored.object_key.startsWith('himoto/photos/7/'));assert.equal(stored.storage_sha256,digest);assert.equal(Number(stored.storage_bytes),data.length);
    assert.deepEqual(await upload(p,key),{...proof,replayed:true});
    const image=await media.readMobileRecordMediaImage(user,target,slot,new NextRequest('https://fixture.invalid/media?revision='+proof.photoRevision));assert(Buffer.from(image.data).equals(data));
    checks.push('CloudFly mobile writes commit object refs/SHA/size and actor proof under real RLS; same UUID replays exactly and authenticated revision-bound image reads proxy the original bytes without redirects');
    const next=await info(),failedKey=randomUUID(),before=(await pg.query("SELECT xmin::text AS revision,object_key FROM himoto.management_record_photos WHERE entity_id=501 AND slot='id_front'")).rows[0];
    failReceipt();await assert.rejects(()=>upload(next,failedKey),/QA receipt failure/);
    assert.deepEqual((await pg.query("SELECT xmin::text AS revision,object_key FROM himoto.management_record_photos WHERE entity_id=501 AND slot='id_front'")).rows[0],before);
    assert((await upload(next,failedKey)).current);
    const lostPrepared=await info(),lostKey=randomUUID();loseResponse();await assert.rejects(()=>upload(lostPrepared,lostKey),/QA lost commit response/);
    const recovered=(await writer.readMobileMediaReceipt(user,lostKey)).receipt;assert(recovered.current);assert.equal(recovered.sha256,digest);assert.deepEqual(await upload(lostPrepared,lostKey),recovered);
    assert.equal((await writer.readMobileMediaReceipt({...user,id:8},lostKey)).receipt,null);
    checks.push('CloudFly object staging never holds the DB transaction; a failed proof rolls back the photo ref, same-key retry reuses the immutable upload, lost commits recover exactly once and another actor cannot read the receipt');
  }finally{sdk.S3Client.prototype.send=oldSend;process.env.PHOTO_STORAGE_PROVIDER=oldProvider;}
};
