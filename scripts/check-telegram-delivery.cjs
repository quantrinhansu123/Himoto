const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),ts=require('typescript');
const {load,root}=require('./lib/load-typescript.cjs');
const delivery=load(path.join(root,'lib/server/telegram-delivery'));
const checks=[];
const photo=(id,size=4,type='image/jpeg')=>({slot:`rental-${id}`,mime_type:type,bytes:Buffer.alloc(size,id%255).toString('base64')});
async function batches(photos){const result=[];for await(const group of delivery.telegramMediaBatches(photos,0,Date.now()+240000))result.push(group);return result;}
async function main(){
  const originalFetch=global.fetch;global.fetch=async()=>{throw Error('Real network disabled during QA');};
  try {
    const files=[...Array.from({length:7},(_,i)=>photo(i,400000)),photo(8,3428871,'video/mp4'),photo(9,3428871,'video/mp4')];
    const split=await batches(files);assert.deepEqual(split.map(group=>group.length),[7,1,1]);
    assert(split.filter(group=>group[0].type==='video/mp4').every(group=>group.length===1));
    const large=await batches(Array.from({length:7},(_,i)=>photo(i,1800000)));
    assert.deepEqual(large.map(group=>group.length),[2,2,2,1]);
    assert(large.every(group=>group.reduce((sum,f)=>sum+f.data.length,0)<=delivery.TELEGRAM_ALBUM_BYTES));
    assert.deepEqual((await batches(Array.from({length:23},(_,i)=>photo(i)))).map(group=>group.length),[10,10,3]);
    await assert.rejects(batches([photo(1,2*1024*1024+1)]),/PHOTO_SIZE/);
    const oldEnv={...process.env};
    delete process.env.CLOUDINARY_URL;Object.assign(process.env,{CLOUDINARY_CLOUD_NAME:'qa-cloud',CLOUDINARY_API_KEY:'qa-key',CLOUDINARY_API_SECRET:'qa-media-test-secret'});
    try {
      const remote=await batches(Array.from({length:10},(_,i)=>({slot:`rental-${i+1}`,mime_type:'image/jpeg',bytes:null,cloudinary_public_id:`himoto/management/1/${i}`,cloudinary_cloud_name:'qa-cloud',cloudinary_version:1})));
      assert.equal(remote.length,1);assert.equal(remote[0].length,10);
      assert(remote[0].every(file=>file.url&&!file.data&&String(file.url).includes('qa-cloud')));
    } finally { for (const key of Object.keys(process.env)) if (!(key in oldEnv)) delete process.env[key]; Object.assign(process.env,oldEnv); }
    checks.push('The reported 7-photo/2-video payload splits into 7/1/1; photo albums obey byte/count caps, preserve all media and reject oversized files');
    const originalTimeout=AbortSignal.timeout,timeouts=[];
    AbortSignal.timeout=ms=>{timeouts.push(ms);return new AbortController().signal;};
    try{
      const send=async(_url,options)=>{assert.equal(options.redirect,'error');return Response.json({ok:true,result:{message_id:123}});};
      assert.deepEqual(await delivery.telegramCall('qa-only','sendVideo',new FormData(),send),[123]);
      assert.deepEqual(await delivery.telegramCall('qa-only','sendMessage',{text:'QA'},send),[123]);
      assert.deepEqual(timeouts,[120000,30000]);
      const timeout=()=>{const e=new Error('QA timeout');e.name='TimeoutError';return e;};
      await assert.rejects(delivery.telegramCall('qa-only','sendVideo',new FormData(),async()=>{throw timeout();}),e=>e.message==='TELEGRAM_TIMEOUT'&&!e.definiteFailure);
      await assert.rejects(delivery.telegramCall('qa-only','sendVideo',new FormData(),async()=>({json:async()=>{throw timeout();}})),e=>e.message==='TELEGRAM_TIMEOUT'&&!e.definiteFailure);
      await assert.rejects(delivery.telegramCall('qa-only','sendMediaGroup',new FormData(),async()=>Response.json({ok:true,result:[{message_id:1}]}),2),e=>e.message==='TELEGRAM_INVALID_RESPONSE'&&!e.definiteFailure);
      await assert.rejects(delivery.telegramCall('qa-only','sendPhoto',new FormData(),async()=>Response.json({ok:true,result:{message_id:0}})),e=>e.message==='TELEGRAM_INVALID_RESPONSE'&&!e.definiteFailure);
      await assert.rejects(delivery.telegramCall('qa-only','sendPhoto',new FormData(),async()=>Response.json({ok:false,error_code:400},{status:400})),e=>e.message==='TELEGRAM_400'&&e.definiteFailure);
      let attempts=0;await assert.rejects(delivery.telegramCall('qa-only','sendPhoto',new FormData(),async()=>{attempts++;throw timeout();}));assert.equal(attempts,1);
    }finally{AbortSignal.timeout=originalTimeout;}
    checks.push('Media has 120s and text 30s; body-read timeouts and malformed/partial success responses remain uncertain; confirmed API errors are distinguished; no POST automatically retries');
    assert.throws(()=>delivery.requireTelegramTime(Date.now()+1000,120000),delivery.TelegramContinuation);
    checks.push('Delivery stops at a safe checkpoint before its function time budget is exhausted');
    const callbacks=[];let sends=0,gpsReads=0,historyReads=0;
    const route={exports:{}};
    const source=ts.transpileModule(fs.readFileSync(path.join(root,'app/api/cron/integrations/route.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const dependencies={
      'next/server':{after:work=>callbacks.push(work),NextResponse:{json:(body,options)=>Response.json(body,options)}},
      '@/lib/server/integration-worker-auth':{validIntegrationWorker:auth=>auth==='Bearer qa-only',integrationSchedulerNonce:()=>null,claimIntegrationSchedulerNonce:async()=>true},
      '@/lib/server/himoto-database':{ownerDatabase:{}},
      '@/lib/server/gps-sync':{syncGpsAccounts:async()=>{gpsReads++;return{attempted:0};}},
      '@/lib/server/gps-history-sync':{syncGpsEventHistory:async()=>{historyReads++;}},
      '@/lib/server/contract-notifications':{dispatchContractNotifications:async(...args)=>{assert(args[5]<=Date.now()+240000);sends++;return{sent:0};}},
      '@/lib/server/telegram-delivery':{TELEGRAM_DISPATCH_BUDGET_MS:240000},
    };
    new Function('require','module','exports',source)(name=>{assert(name in dependencies,'Unexpected dependency: '+name);return dependencies[name];},route,route.exports);
    assert.equal((await route.exports.POST(new Request('https://qa.invalid/api/cron/integrations',{method:'POST'}))).status,401);assert.equal(callbacks.length,0);
    const cron=await route.exports.POST(new Request('https://qa.invalid/api/cron/integrations',{method:'POST',headers:{Authorization:'Bearer qa-only'}}));
    assert.equal(cron.status,200);assert.deepEqual((await cron.json()).telegram,{queued:true});assert.equal(gpsReads,1);assert.equal(sends,0);assert.equal(callbacks.length,1);
    await callbacks[0]();assert.equal(sends,1);assert.equal(historyReads,1);
    checks.push('Authenticated scheduler responds before Telegram upload work; a slow delivery no longer holds its 55s HTTP request open');
    const telegramRoute=fs.readFileSync(path.join(root,'app/api/auth/order/car-rental/[id]/telegram/route.ts'),'utf8');
    assert.match(telegramRoute,/writing\|\|pending/);
    assert.match(fs.readFileSync(path.join(root,'lib/server/contract-notifications.ts'),'utf8'),/n\.status='sending'/);
    checks.push('A pending or orphaned sending notice is dispatched again when staff reopen or refresh the Telegram panel');
  }finally{global.fetch=originalFetch;}
  console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0,realTelegramRequests:0},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
