// Actual authenticated endpoints + browser CORS, using only generated temporary files.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {randomUUID,createHash}=require('node:crypto'),{spawnSync}=require('node:child_process');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {load,root}=require('./lib/load-typescript.cjs');
const {ownerDatabase}=load(path.join(root,'lib/server/himoto-database'));
const {signSession,SESSION_COOKIE}=load(path.join(root,'lib/server/management-session'));
const {readyBrowserVideo}=load(path.join(root,'lib/server/browser-videos'));
const {cloudflyVideoClient,cloudflyVideoSettings,objectVideoUrl}=load(path.join(root,'lib/server/cloudfly-videos'));
const {DeleteObjectCommand,HeadObjectCommand}=require('@aws-sdk/client-s3');
let stage='prepare';
async function main(){
  const arg=name=>process.argv.includes(name)?process.argv[process.argv.indexOf(name)+1]:null;
  const base=arg('--url')||'https://himoto.vercel.app';
  if(!['https://himoto.vercel.app','http://127.0.0.1:3018'].includes(base))throw Error('Unapproved verification host');
  const filename=arg('--synthetic-file');
  if(!filename||!path.resolve(filename).startsWith(path.resolve('.backups/browser-video-20261025')+path.sep))throw Error('Synthetic fixture required');
  const bytes=fs.readFileSync(filename);assert(bytes.length<1024*1024);
  const actor=(await ownerDatabase.query(`SELECT u.id FROM himoto.users u LEFT JOIN himoto.roles r ON r.id=u.role_id LEFT JOIN himoto.management_account_access a ON a.user_id=u.id
    WHERE u.deleted_at IS NULL AND u.status='active' AND ((a.access_role='admin' AND a.enabled=true) OR (a.access_role IS NULL AND (u.role_id=1 OR u.role='admin' OR r.slug='quan-tri-vien'))) ORDER BY u.id LIMIT 1`)).rows[0];
  if(!actor)throw Error('No authorized verification account');
  const token=signSession(Number(actor.id),undefined,Date.now()-((8*60-10)*60*1000));
  const api=async input=>{
    const r=await fetch(base+'/api/auth/photo-uploads/video',{method:'POST',redirect:'error',headers:{Origin:base,'Content-Type':'application/json',Cookie:`${SESSION_COOKIE}=${token}`},body:JSON.stringify(input),signal:AbortSignal.timeout(130000)});
    const body=await r.json();assert(r.ok&&body.status==='success',`Endpoint status ${r.status}`);return body.data;
  };
  stage='runtime-config';assert.equal((await api({action:'config'})).enabled,true);
  const results=[],Bucket=cloudflyVideoSettings().bucket;
  for(const browser of ['chromium','webkit']){
    const id=randomUUID(),key=`himoto/videos/browser/${actor.id}/${id}/v1.mp4`;
    try{
      stage=browser+'-sign';
      const signed=await api({action:'sign',upload_id:id,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),max_duration:60});
      assert.equal(new URL(signed.url).hostname,'s3.cloudfly.vn');
      stage=browser+'-cors-put';
      const r=spawnSync('python',['scripts/check-browser-direct-put.py'],{input:JSON.stringify({browser,origin:'https://himoto.vercel.app',url:signed.url,headers:signed.headers,bytes:bytes.toString('base64')}),encoding:'utf8',timeout:90000,windowsHide:true});
      const result=JSON.parse(r.stdout||'{}');assert.equal(r.status,0);assert.equal(result.passed,true);
      stage=browser+'-server-verification';
      const ready=await api({action:'verify',ticket:signed.ticket});
      const ref=await readyBrowserVideo(ready.receipt,Number(actor.id),60);assert.equal(ref.object_key,key);
      const url=await objectVideoUrl(ref);
      const range=await fetch(url,{headers:{Range:'bytes=0-31'},signal:AbortSignal.timeout(15000)});assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,32);
      results.push({browser,cors:true,privatePut:true,serverVerification:true,playbackRange:true});
    }finally{
      await cloudflyVideoClient().send(new DeleteObjectCommand({Bucket,Key:key}));
      await assert.rejects(()=>cloudflyVideoClient().send(new HeadObjectCommand({Bucket,Key:key})),e=>e.$metadata?.httpStatusCode===404);
    }
  }
  console.log(JSON.stringify({passed:results.length,base,results,temporaryObjectsRemoved:true,businessWrites:0,telegramRequests:0},null,2));
}
main().catch(error=>{console.error(JSON.stringify({passed:false,stage,code:error.name||'VERIFICATION_FAILED',httpStatus:error.$metadata?.httpStatusCode}));process.exitCode=1;}).finally(async()=>{await globalThis.himotoPool?.end();});
