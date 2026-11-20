// Bounded QR embedding uses synthetic responses only; real sockets stay blocked.
require('./lib/offline-tests.cjs');
const assert=require('node:assert/strict'),path=require('node:path');
const {NextRequest}=require('next/server');
const{load,root}=require('./lib/load-typescript.cjs'),{mobilePrintQrImage}=load(path.join(root,'lib/server/mobile-print-qr'));
async function run(){
 const blocked=global.fetch;let calls=0,cancelled=false;
 try{
  global.fetch=async(url,options)=>{calls++;assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');return new Response(new Uint8Array([137,80,78,71,13,10,26,10]),{headers:{'Content-Type':'image/png'}});};
  await assert.rejects(()=>mobilePrintQrImage('https://other.invalid/img'));assert.equal(calls,0);assert.match(await mobilePrintQrImage('https://vietqr.app/img?acc=QA'),/^data:image\/png;base64,/);
  global.fetch=async()=>new Response(new ReadableStream({cancel(){cancelled=true;}}),{headers:{'Content-Type':'text/html'}});await assert.rejects(()=>mobilePrintQrImage('https://vietqr.app/img'));assert(cancelled);
  cancelled=false;global.fetch=async()=>new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(512*1024+1));},cancel(){cancelled=true;}}),{headers:{'Content-Type':'image/png'}});await assert.rejects(()=>mobilePrintQrImage('https://vietqr.app/img'));assert(cancelled);
  const {previewMobileDraftPrint}=load(path.join(root,'lib/server/mobile-contract-print'));
  const pool=load(path.join(root,'lib/server/himoto-database')).himotoPool,original=Object.getOwnPropertyDescriptor(pool,'connect');
  const actor={id:7,store_id:23,access_role:'custom',permissions:['contracts.read','contracts.draft']};
  const input=structuredClone(require('./fixtures/mobile-draft.json'));
  Object.assign(input.draft,{store_id:'23',vehicle_store_id:'23',customer_id:7,contract_type_id:'daily',total_amount:'100000'});
  Object.assign(input.draft.customer,{name:'QA <script>demo</script>',phone:'0900000000',id_card:'001000000000',address:'Hà Nội'});
  input.draft.relatives=[{name:'QA Mẹ',relationship:'Mẹ',phone:'0900000001'},{name:'QA Anh',relationship:'Anh',phone:'0900000002'}];
  Object.assign(input.draft.vehicles[0],{id:'1',name:'QA Honda',license:'29A1-000.01'});
  const statements=[];
  Object.defineProperty(pool,'connect',{configurable:true,value:async()=>({release(){},async query(text,params){
    statements.push(text);
    if(text.includes('store_directory')){assert.deepEqual(params,[['23','23']]);return{rows:[{id:23,store_name:'Cơ sở QA',store_address:'Hà Nội',store_phone:'0900000000'}]};}
    if(text.startsWith('SELECT id FROM')){assert.deepEqual(params,[['1']]);return{rows:[{id:1}]};}
    assert.match(text,/^(BEGIN|SET LOCAL|COMMIT|ROLLBACK)/);
    return {rows:[]};
  }})});
  const request=body=>new NextRequest('https://qa.invalid/api/mobile/v1/drafts/print-preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  try{
    const {html}=await previewMobileDraftPrint(actor,request(input));
    assert.match(html,/<!doctype html>/);assert.match(html,/29A1-000\.01/);assert.match(html,/Cơ sở QA/);
    assert.match(html,/&lt;script&gt;demo&lt;\/script&gt;/);assert(!html.includes('<script>'));
    await assert.rejects(previewMobileDraftPrint(actor,request({...input,draft:{...input.draft,customer_id:null}})),error=>error.status===422&&!!error.fields.id_card);
    await assert.rejects(previewMobileDraftPrint({...actor,store_id:24},request(input)),error=>error.status===403);
    assert(!statements.some(text=>/\b(INSERT|UPDATE|DELETE)\b/.test(text)));
  }finally{Object.defineProperty(pool,'connect',original);}
  console.log(JSON.stringify({passed:2,checks:[
    'QR embedding permits only the fixed provider with no redirects, validates image magic and cancels non-image/oversize streams without attaching authorization or performing external requests',
    'An unsaved draft renders the web template with escaped data, applies legal field and branch validation, and opens only read transactions',
  ],fixtureOnly:true,externalRequests:0,operationalDatabaseWrites:0},null,2));
 }finally{global.fetch=blocked;}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
