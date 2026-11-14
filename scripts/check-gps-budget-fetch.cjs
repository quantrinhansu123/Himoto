require('./lib/offline-tests.cjs');
const assert=require('node:assert/strict'),path=require('node:path');
const{load,root}=require('./lib/load-typescript.cjs'),{gpsBudgetFetch}=load(path.join(root,'lib/server/gps-budget-fetch'));
(async()=>{
 const timed=e=>e.code==='HISTORY_BUDGET';
 await assert.rejects(()=>gpsBudgetFetch(async()=>new Promise(()=>{}),30,'HISTORY_BUDGET')('https://fixture.invalid'),timed);
 await assert.rejects(()=>gpsBudgetFetch(async()=>new Response(new ReadableStream({start(){}})),30,'HISTORY_BUDGET')('https://fixture.invalid'),timed);
 await assert.rejects(()=>gpsBudgetFetch(async()=>new Response(new Uint8Array(8*1024*1024+1)),1000,'HISTORY_BUDGET')('https://fixture.invalid'),e=>e.code==='RESPONSE_TOO_LARGE');
 const headers=new Headers();headers.append('Set-Cookie','JSESSIONID=qa; Path=/');headers.append('Set-Cookie','token=qa-token; Path=/');
 const response=await gpsBudgetFetch(async()=>new Response('{"code":0}',{headers}),1000,'HISTORY_BUDGET')('https://fixture.invalid');
 assert.equal(response.headers.getSetCookie().length,2);assert.deepEqual(await response.json(),{code:0});
 console.log(JSON.stringify({passed:4,checks:['Hanging fetch is bounded','Hanging response body is bounded','Responses above 8 MiB are rejected','Provider JSON and multiple login cookies survive buffering'],externalRequests:0}));
})().catch(e=>{console.error(e);process.exitCode=1});
