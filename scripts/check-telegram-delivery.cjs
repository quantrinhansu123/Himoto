const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),ts=require('typescript'),sharp=require('sharp');
const {load,root}=require('./lib/load-typescript.cjs');
const delivery=load(path.join(root,'lib/server/telegram-delivery'));
const checks=[];
const photo=(id,size=4,type='image/jpeg')=>({slot:`rental-${id}`,mime_type:type,bytes:Buffer.alloc(size,id%255).toString('base64')});
async function batches(photos){const result=[];for await(const group of delivery.telegramMediaBatches(photos,0,Date.now()+240000))result.push(group);return result;}
async function main(){
  const originalFetch=global.fetch;global.fetch=async()=>{throw Error('Real network disabled during QA');};
  try {
    const files=[...Array.from({length:7},(_,i)=>photo(i,400000)),photo(8,3428871,'video/mp4'),photo(9,3428871,'video/mp4')];
    const split=await batches(files);assert.deepEqual(split.map(group=>group.length),[5,2,1,1]);
    assert(split.filter(group=>group[0].type==='video/mp4').every(group=>group.length===1));
    const pixels=Buffer.alloc(1400*1000*3);let seed=17;for(let i=0;i<pixels.length;i++){seed=(Math.imul(seed,1664525)+1013904223)|0;pixels[i]=seed>>>24;}
    const jpeg=await sharp(pixels,{raw:{width:1400,height:1000,channels:3}}).jpeg({quality:94}).toBuffer();
    const large=await batches(Array.from({length:7},(_,i)=>({...photo(i),bytes:jpeg.toString('base64')})));
    assert.equal(large.flat().length,7);assert(large.length>1);
    assert(large.every(group=>group.reduce((sum,f)=>sum+f.data.length,0)<=delivery.TELEGRAM_ALBUM_BYTES));
    assert.deepEqual((await batches(Array.from({length:23},(_,i)=>photo(i)))).map(group=>group.length),[10,10,3]);
    await assert.rejects(batches([photo(1,2*1024*1024+1)]),/PHOTO_SIZE/);
    const oldEnv={...process.env};
    delete process.env.CLOUDINARY_URL;Object.assign(process.env,{CLOUDINARY_CLOUD_NAME:'qa-cloud',CLOUDINARY_API_KEY:'qa-key',CLOUDINARY_API_SECRET:'qa-media-test-secret'});
    try {
      global.fetch=async()=>new Response(Buffer.from([255,216,255,1]));
      const remote=await batches(Array.from({length:10},(_,i)=>({slot:`rental-${i+1}`,mime_type:'image/jpeg',bytes:null,cloudinary_public_id:`himoto/management/1/${i}`,cloudinary_cloud_name:'qa-cloud',cloudinary_version:1})));
      assert.equal(remote.length,1);assert.equal(remote[0].length,10);
      assert(remote[0].every(file=>file.data&&!file.url),'Uncached photos must not depend on Telegram fetching a private URL');
      const videoRef={slot:'rental-video-1',mime_type:'video/mp4',bytes:null,cloudinary_public_id:'himoto/management-video/1/qa',cloudinary_cloud_name:'qa-cloud',cloudinary_version:1};
      global.fetch=async(_url,options)=>{
        if(options?.method==='HEAD')return new Response(null,{status:200,headers:{'content-length':'1500000'}});
        throw Error('Real network disabled during QA');
      };
      const videoUrl=await batches([videoRef]);
      assert.equal(videoUrl.length,1);assert(videoUrl[0][0].url&&!videoUrl[0][0].data);
      global.fetch=async(_url,options)=>{
        if(options?.method==='HEAD')return new Response(null,{status:200,headers:{'content-length':String(delivery.TELEGRAM_URL_VIDEO_BYTES+1)}});
        return new Response(Buffer.alloc(2048));
      };
      const videoUpload=await batches([videoRef]);
      assert.equal(videoUpload.length,1);assert.equal(videoUpload[0][0].data?.length,2048);assert(!videoUpload[0][0].url);
    } finally { for (const key of Object.keys(process.env)) if (!(key in oldEnv)) delete process.env[key]; Object.assign(process.env,oldEnv); global.fetch=async()=>{throw Error('Real network disabled during QA');}; }
    checks.push('Photo albums obey byte/count caps, uncached photos upload directly and videos ≤20 MB retain their signed URL path');
    const originalTimeout=AbortSignal.timeout,timeouts=[];
    AbortSignal.timeout=ms=>{timeouts.push(ms);return new AbortController().signal;};
    try{
      const send=async(_url,options)=>{assert.equal(options.redirect,'error');return Response.json({ok:true,result:{message_id:123}});};
      assert.deepEqual(await delivery.telegramCall('qa-only','sendVideo',new FormData(),send),[123]);
      assert.deepEqual(await delivery.telegramCall('qa-only','sendPhoto',new FormData(),send),[123]);
      assert.deepEqual(await delivery.telegramCall('qa-only','sendMessage',{text:'QA'},send),[123]);
      assert.deepEqual(timeouts,[180000,120000,30000]);
      const timeout=()=>{const e=new Error('QA timeout');e.name='TimeoutError';return e;};
      await assert.rejects(delivery.telegramCall('qa-only','sendVideo',new FormData(),async()=>{throw timeout();}),e=>e.message==='TELEGRAM_TIMEOUT'&&!e.definiteFailure);
      await assert.rejects(delivery.telegramCall('qa-only','sendVideo',new FormData(),async()=>({json:async()=>{throw timeout();}})),e=>e.message==='TELEGRAM_TIMEOUT'&&!e.definiteFailure);
      await assert.rejects(delivery.telegramCall('qa-only','sendMediaGroup',new FormData(),async()=>Response.json({ok:true,result:[{message_id:1}]}),2),e=>e.message==='TELEGRAM_INVALID_RESPONSE'&&!e.definiteFailure);
      await assert.rejects(delivery.telegramCall('qa-only','sendPhoto',new FormData(),async()=>Response.json({ok:true,result:{message_id:0}})),e=>e.message==='TELEGRAM_INVALID_RESPONSE'&&!e.definiteFailure);
      await assert.rejects(delivery.telegramCall('qa-only','sendPhoto',new FormData(),async()=>Response.json({ok:false,error_code:400},{status:400})),e=>e.message==='TELEGRAM_400'&&e.definiteFailure);
      let attempts=0;await assert.rejects(delivery.telegramCall('qa-only','sendPhoto',new FormData(),async()=>{attempts++;throw timeout();}));assert.equal(attempts,1);
    }finally{AbortSignal.timeout=originalTimeout;}
    checks.push('Video has 180s, other media 120s and text 30s; body-read timeouts and malformed/partial success responses remain uncertain; confirmed API errors are distinguished; no POST automatically retries');
    assert.throws(()=>delivery.requireTelegramTime(Date.now()+1000,120000),delivery.TelegramContinuation);
    checks.push('Delivery stops at a safe checkpoint before its function time budget is exhausted');
    const callbacks=[];let sends=0,gpsReads=0,historyReads=0,pushCalls=0,pushFailure=false;
    const route={exports:{}};
    const source=ts.transpileModule(fs.readFileSync(path.join(root,'app/api/cron/integrations/route.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const dependencies={
      '@/lib/server/public-failure':load(path.join(root,'lib/server/public-failure')),
      'next/server':{after:work=>callbacks.push(work),NextResponse:{json:(body,options)=>Response.json(body,options)}},
      '@/lib/server/integration-worker-auth':{validIntegrationWorker:auth=>auth==='Bearer qa-only',integrationSchedulerNonce:()=>null,claimIntegrationSchedulerNonce:async()=>true},
      '@/lib/server/himoto-database':{ownerDatabase:{}},
      '@/lib/server/integration-jobs':{runIntegrationJob:async(job,lease,run)=>{assert(['telegram','push'].includes(job));assert(lease>0);return{busy:false,result:await run()};}},
      '@/lib/server/gps-sync':{syncGpsAccounts:async()=>{gpsReads++;return{attempted:0};}},
      '@/lib/server/gps-history-sync':{syncGpsEventHistory:async()=>{historyReads++;}},
      '@/lib/server/mobile-push':{dispatchMobilePush:async()=>{pushCalls++;if(pushFailure)throw Error('Synthetic push failure');return{checked:0,sent:0};}},
      '@/lib/server/contract-notifications':{dispatchContractNotifications:async(...args)=>{assert(args[5]<=Date.now()+240000);sends++;return{sent:0};}},
      '@/lib/server/telegram-delivery':{TELEGRAM_DISPATCH_BUDGET_MS:240000},
    };
    new Function('require','module','exports',source)(name=>{assert(name in dependencies,'Unexpected dependency: '+name);return dependencies[name];},route,route.exports);
    assert.equal((await route.exports.POST(new Request('https://qa.invalid/api/cron/integrations',{method:'POST'}))).status,401);assert.equal(callbacks.length,0);
    const cron=await route.exports.POST(new Request('https://qa.invalid/api/cron/integrations',{method:'POST',headers:{Authorization:'Bearer qa-only'}}));
    assert.equal(cron.status,200);assert.deepEqual((await cron.json()).telegram,{queued:true});assert.equal(gpsReads,0);assert.equal(sends,0);assert.equal(callbacks.length,1);
    assert.equal(pushCalls,0);await callbacks[0]();assert.equal(sends,1);assert.equal(historyReads,0);assert.equal(pushCalls,1);
    pushFailure=true;
    const second=await route.exports.POST(new Request('https://qa.invalid/api/cron/integrations',{method:'POST',headers:{Authorization:'Bearer qa-only'}}));
    assert.equal(second.status,200);assert.equal(pushCalls,1);
    const originalError=console.error,errors=[];console.error=(...args)=>errors.push(args);
    try{await callbacks[1]();}finally{console.error=originalError;}
    assert.equal(sends,2);assert.equal(historyReads,0);assert.equal(pushCalls,2);assert.deepEqual(errors,[['Mobile push dispatch failed.']]);
    checks.push('Authenticated scheduler responds before Telegram upload work; a slow delivery no longer holds its 55s HTTP request open');
    checks.push('GPS/live history are absent from notification dispatch; independently leased push and Telegram start after the response and one failure does not block the other');
    const telegramRoute=fs.readFileSync(path.join(root,'app/api/auth/order/car-rental/[id]/telegram/route.ts'),'utf8');
    assert.match(telegramRoute,/!writing&&\(pending\|\|retracting\)/);
    assert.match(fs.readFileSync(path.join(root,'lib/server/contract-notifications.ts'),'utf8'),/n\.status='sending'/);
    checks.push('A pending or orphaned sending notice is dispatched again when staff reopen or refresh the Telegram panel');
  }finally{global.fetch=originalFetch;}
  console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0,realTelegramRequests:0},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
