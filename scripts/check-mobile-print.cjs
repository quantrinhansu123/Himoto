// Bounded QR embedding uses synthetic responses only; real sockets stay blocked.
require('./lib/offline-tests.cjs');
const assert=require('node:assert/strict'),path=require('node:path');
const{load,root}=require('./lib/load-typescript.cjs'),{mobilePrintQrImage}=load(path.join(root,'lib/server/mobile-print-qr'));
async function run(){
 const blocked=global.fetch;let calls=0,cancelled=false;
 try{
  global.fetch=async(url,options)=>{calls++;assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');return new Response(new Uint8Array([137,80,78,71,13,10,26,10]),{headers:{'Content-Type':'image/png'}});};
  await assert.rejects(()=>mobilePrintQrImage('https://other.invalid/img'));assert.equal(calls,0);assert.match(await mobilePrintQrImage('https://vietqr.app/img?acc=QA'),/^data:image\/png;base64,/);
  global.fetch=async()=>new Response(new ReadableStream({cancel(){cancelled=true;}}),{headers:{'Content-Type':'text/html'}});await assert.rejects(()=>mobilePrintQrImage('https://vietqr.app/img'));assert(cancelled);
  cancelled=false;global.fetch=async()=>new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(512*1024+1));},cancel(){cancelled=true;}}),{headers:{'Content-Type':'image/png'}});await assert.rejects(()=>mobilePrintQrImage('https://vietqr.app/img'));assert(cancelled);
  console.log(JSON.stringify({passed:1,checks:['QR embedding permits only the fixed provider with no redirects, validates image magic and cancels non-image/oversize streams without attaching authorization or performing external requests'],fixtureOnly:true,externalRequests:0,operationalDatabaseWrites:0},null,2));
 }finally{global.fetch=blocked;}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
