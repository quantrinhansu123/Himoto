const assert=require('node:assert/strict'),path=require('node:path');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {load,root}=require('./lib/load-typescript.cjs'),sdk=require('@aws-sdk/client-s3');
const {NextRequest}=require('next/server');
const videos=load(path.join(root,'lib/server/cloudfly-videos'));
const session=load(path.join(root,'lib/server/management-session'));
const originalEnv={...process.env},originalSend=sdk.S3Client.prototype.send,originalFetch=global.fetch;
const originalSession={userFromSession:session.userFromSession,protectDatabaseRequest:session.protectDatabaseRequest};
const checks=[];
async function main(){
  Object.assign(process.env,{VIDEO_STORAGE_PROVIDER:'cloudfly',CLOUDFLY_S3_ENDPOINT:'https://s3.cloudfly.vn',CLOUDFLY_S3_BUCKET:'qa-videos',CLOUDFLY_S3_ACCESS_KEY_ID:'qa-only-key',CLOUDFLY_S3_SECRET_ACCESS_KEY:'qa-only-secret',CLOUDINARY_CLOUD_NAME:'qa-cloud',CLOUDINARY_API_KEY:'qa-cloud-key',CLOUDINARY_API_SECRET:'qa-cloud-secret'});
  delete process.env.CLOUDINARY_URL;
  let data=null,removed=0,publicAccess=false,putTimeout=false;const calls=[];
  sdk.S3Client.prototype.send=async function(command){
    calls.push(command.constructor.name);assert.match(command.input.Key,/^himoto\/storage-checks\/[0-9a-f-]{36}\.bin$/);
    if(command instanceof sdk.PutObjectCommand){assert.equal(command.input.ACL,'private');assert.equal(command.input.IfNoneMatch,'*');data=command.input.Body;if(putTimeout)throw Error('QA timeout after PUT');return{ETag:'qa'};}
    if(command instanceof sdk.HeadObjectCommand)return{ContentLength:data.length,ETag:'qa'};
    if(command instanceof sdk.GetObjectCommand){assert.equal(command.input.Range,'bytes=0-15');return{$metadata:{httpStatusCode:206},ContentLength:16,Body:{transformToByteArray:async()=>data.subarray(0,16)}};}
    if(command instanceof sdk.DeleteObjectCommand){removed++;data=null;return{};}
    throw Error('Unexpected probe command');
  };
  global.fetch=async()=>new Response('qa',{status:publicAccess?200:403});
  assert.equal((await videos.probeCloudflyVideoStorage()).private,true);assert.equal(data,null);assert.equal(removed,1);
  publicAccess=true;await assert.rejects(()=>videos.probeCloudflyVideoStorage());assert.equal(data,null);assert.equal(removed,2);publicAccess=false;
  putTimeout=true;await assert.rejects(()=>videos.probeCloudflyVideoStorage());assert.equal(data,null);assert.equal(removed,3);putTimeout=false;
  checks.push('Probe writes only a generated diagnostic key, verifies byte-range reads and anonymous denial, and removes the key on success, public-access failure and ambiguous PUT timeout');
  let user={id:151,access_role:'branch_staff',permissions:['contracts.draft']};
  session.userFromSession=async()=>user;session.protectDatabaseRequest=async()=>null;
  const route=load(path.join(root,'app/api/auth/photo-uploads/sign/route'));
  const body={upload_id:require('node:crypto').randomUUID(),resource_type:'video'};
  const request=(input=body,origin='http://localhost')=>new NextRequest('http://localhost/api/auth/photo-uploads/sign',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(input)});
  calls.length=0;
  const normal=await route.POST(request());assert.equal(normal.status,200);assert.equal((await normal.json()).data.video_storage_provider,'cloudfly');assert.equal(calls.length,0);
  assert.equal((await route.POST(request({...body,verify_storage:true}))).status,403);assert.equal(calls.length,0);
  user={id:151,access_role:'admin'};
  assert.equal((await route.POST(request({...body,verify_storage:true},'https://foreign.invalid'))).status,403);assert.equal(calls.length,0);
  const verified=await route.POST(request({...body,verify_storage:true}));assert.equal(verified.status,200);assert.equal((await verified.json()).data.storage_check.temporary_file_removed,true);assert.equal(data,null);
  checks.push('Actual upload-sign route reports the selected provider without storage calls on ordinary uploads; a probe requires settings permission and same-origin POST');
  process.env.VIDEO_STORAGE_PROVIDER='cloudinary';calls.length=0;
  const disabled=await route.POST(request({...body,verify_storage:true}));assert.equal(disabled.status,200);assert.equal((await disabled.json()).data.video_storage_provider,'cloudinary');assert.equal(calls.length,0);
  process.env.VIDEO_STORAGE_PROVIDER='cloudfly';delete process.env.CLOUDFLY_S3_SECRET_ACCESS_KEY;
  const missing=await route.POST(request({...body,verify_storage:true}));assert.equal(missing.status,503);assert.equal(calls.length,0);
  user=null;assert.equal((await route.POST(request())).status,401);
  checks.push('Disabled provider is reported explicitly; missing configuration and unauthenticated callers cannot report a successful production storage check');
  console.log(JSON.stringify({passed:checks.length,checks,businessWrites:0,realProviderRequests:0},null,2));
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(()=>{
  sdk.S3Client.prototype.send=originalSend;global.fetch=originalFetch;Object.assign(session,originalSession);
  for(const key of Object.keys(process.env))if(!(key in originalEnv))delete process.env[key];Object.assign(process.env,originalEnv);
});
