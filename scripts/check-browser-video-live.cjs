// Reserved synthetic actor and temporary objects only. Never attaches to a business record.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {load,root}=require('./lib/load-typescript.cjs');
const media=load(path.join(root,'lib/server/browser-videos'));
const videos=load(path.join(root,'lib/server/cloudfly-videos'));
const {DeleteObjectCommand,HeadObjectCommand}=require('@aws-sdk/client-s3');
let stage='prepare';
async function main(){
  const filename=process.argv[process.argv.indexOf('--synthetic-file')+1];
  if(!process.argv.includes('--synthetic-file')||!filename||!path.resolve(filename).startsWith(path.resolve('.backups/browser-video-20261025')+path.sep))throw Error('Synthetic fixture required');
  const bytes=fs.readFileSync(filename);assert(bytes.length<1024*1024);
  const actor=999999999,id=randomUUID(),key=`himoto/videos/browser/${actor}/${id}/v1.mp4`;
  const Bucket=videos.cloudflyVideoSettings().bucket,checks=[];
  try{
    stage='signed-upload';
    const signed=await media.signBrowserVideo(actor,{upload_id:id,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),max_duration:60});
    const response=await fetch(signed.url,{method:'PUT',headers:signed.headers,body:bytes,signal:AbortSignal.timeout(45000)});
    await response.body?.cancel();assert(response.ok,`PUT status ${response.status}`);
    stage='parse-and-verify';const result=await media.completeBrowserVideo(actor,signed.ticket);
    const ref=await media.readyBrowserVideo(result.receipt,actor,60);
    assert.equal(ref.object_key,key);assert.deepEqual(await media.completeBrowserVideo(actor,signed.ticket),result);
    assert.deepEqual((await media.signBrowserVideo(actor,{upload_id:id,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),max_duration:60})).receipt,result.receipt);
    checks.push('Real signed browser-style PUT, private copy-to-self metadata, full MP4 parsing and deterministic verification/retry pass');
    stage='private-playback';
    const url=await videos.objectVideoUrl(ref);
    const partial=await fetch(url,{headers:{Range:'bytes=0-31'},signal:AbortSignal.timeout(15000)});
    assert.equal(partial.status,206);assert.equal((await partial.arrayBuffer()).byteLength,32);
    const unsigned=new URL(url);unsigned.search='';const anonymous=await fetch(unsigned,{signal:AbortSignal.timeout(15000)});await anonymous.body?.cancel();assert([403,404].includes(anonymous.status));
    assert.deepEqual(await videos.readObjectVideo(ref),bytes);
    checks.push('Private CloudFly playback supports ranges; anonymous reads fail and the existing Telegram reader returns identical bytes without sending');
    if(process.argv.includes('--browser')){
      stage='browser-playback';const r=require('node:child_process').spawnSync('python',['scripts/check-cloudfly-video-playback.py'],{input:JSON.stringify({url}),encoding:'utf8',timeout:180000,windowsHide:true});
      const report=JSON.parse(r.stdout||'{}');
      if(r.status!==0||report.passed!==4)throw Object.assign(Error('Browser playback failed'),{browser:report.browser,phase:report.phase,details:report.result});
      checks.push('Chromium/WebKit desktop/mobile decode, seek and play the actual private output');
    }
  }finally{
    await videos.cloudflyVideoClient().send(new DeleteObjectCommand({Bucket,Key:key}));
    await assert.rejects(()=>videos.cloudflyVideoClient().send(new HeadObjectCommand({Bucket,Key:key})),e=>e.$metadata?.httpStatusCode===404);
  }
  console.log(JSON.stringify({passed:checks.length,checks,temporaryObjectsRemoved:true,businessWrites:0,telegramRequests:0},null,2));
}
main().catch(error=>{console.error(JSON.stringify({passed:false,stage,code:error.name||'LIVE_CHECK_FAILED',httpStatus:error.$metadata?.httpStatusCode,browser:error.browser,phase:error.phase,details:error.details,message:/^(PUT status|Expected values)/.test(error.message||'')?error.message.slice(0,100):undefined}));process.exitCode=1;});
