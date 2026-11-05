require('./lib/offline-tests.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {NextRequest}=require('next/server');
const {load,root}=require('./lib/load-typescript.cjs');
const {createApi}=load(path.resolve(root,'../mobile/src/lib/api'));
const {isMobileBillReceipt,isMobileBillInfo}=load(path.resolve(root,'../shared/mobile-bills'));
const server=load(path.join(root,'lib/server/mobile-bills'));
const db=load(path.join(root,'lib/server/himoto-database'));
const descriptor=Object.getOwnPropertyDescriptor(db.himotoPool,'connect'),originalFetch=global.fetch;
const key='00000000-0000-4000-8000-000000000001';
const receipt={id:101,revision:'100',replayed:false,version:9,slot:'renewal-9-document-1',sha256:'a'.repeat(64),photoRevision:'200',bytes:1000,current:true};
const missing={id:101,version:9,slot:'renewal-9-document-1',photoRevision:null,mimeType:null,bytes:null,updatedAt:null};
const existing={...missing,photoRevision:'200',mimeType:'image/jpeg',bytes:1000,updatedAt:'2026-11-01T10:00:00Z'};
const user={id:7,role:'staff',access_role:'custom',store_id:23,scope_all:false,permissions:['contracts.read','contracts.renew']};
const checks=[],calls=[];let connects=0;
Object.defineProperty(db.himotoPool,'connect',{configurable:true,value:async()=>{connects++;throw Error('Preflight must not connect');}});
const request=(patch={},bytes=Uint8Array.from([255,216,255,224]))=>new NextRequest('https://fixture.invalid/api/mobile/v1/contracts/101/renewals/9/bill',{
  method:'PUT',headers:{'Content-Type':'image/jpeg','Idempotency-Key':key,'X-Contract-Revision':'100','X-Bill-Revision':'0',...patch},body:bytes,
});
async function run(){
  const client=createApi('https://fixture.invalid','hm1_'+'a'.repeat(43));
  const bytes=new ArrayBuffer(1000);
  global.fetch=async(url,options)=>{calls.push({url,options});return Response.json(receipt);};
  assert.equal((await client.uploadRenewalBill('101',9,'100',null,bytes,key)).photoRevision,'200');
  const sent=calls[0];assert.equal(sent.url,'https://fixture.invalid/api/mobile/v1/contracts/101/renewals/9/bill');
  assert.equal(sent.options.method,'PUT');assert.equal(sent.options.body,bytes);assert.equal(sent.options.headers['Content-Type'],'image/jpeg');
  assert.equal(sent.options.headers['Idempotency-Key'],key);assert.equal(sent.options.headers['X-Contract-Revision'],'100');assert.equal(sent.options.headers['X-Bill-Revision'],'0');
  assert.equal(sent.options.headers.Authorization,'Bearer hm1_'+'a'.repeat(43));assert.equal(sent.options.credentials,'omit');assert.equal(sent.options.redirect,'error');
  checks.push('Bill upload preserves binary JPEG/body, reviewed contract/photo revisions and the original UUID in an origin-bound bearer request without browser credentials or redirects');

  for(const broken of [{...receipt,id:102},{...receipt,version:10},{...receipt,sha256:'bad'},{...receipt,bytes:2097153},{...receipt,photoRevision:'bad'},{...receipt,slot:'renewal-8-document-1'}]){
    assert.equal(isMobileBillReceipt(broken)&&broken.id===101&&broken.version===9,false);
    global.fetch=async()=>Response.json(broken);await assert.rejects(()=>client.uploadRenewalBill('101',9,'100','199',bytes,key),error=>error.code==='INVALID_RESPONSE');
  }
  global.fetch=async()=>Response.json({receipt:{...receipt,replayed:true,current:false}});
  assert.equal((await client.billReceipt(key)).receipt.current,false);
  global.fetch=async()=>Response.json({receipt:null});assert.equal((await client.billReceipt(key)).receipt,null);
  checks.push('Bill acknowledgements reject another contract/version, invalid hashes/limits/slots/revisions and preserve a recovered receipt whose image was later replaced');

  for(const info of [missing,existing]){assert(isMobileBillInfo(info));global.fetch=async()=>Response.json(info);assert.equal((await client.renewalBill('101',9)).photoRevision,info.photoRevision);}
  for(const broken of [{...existing,id:102},{...existing,version:10},{...missing,mimeType:'image/jpeg'},{...existing,updatedAt:'bad'},{...existing,bytes:0}]){
    global.fetch=async()=>Response.json(broken);await assert.rejects(()=>client.renewalBill('101',9),error=>error.code==='INVALID_RESPONSE');
  }
  checks.push('Bill metadata distinguishes an absent image from an existing image, binds contract/version and rejects contradictory or malformed metadata');

  for(const who of [{...user,permissions:['contracts.read','finance.write']},{...user,permissions:['contracts.renew']}])await assert.rejects(()=>server.uploadMobileRenewalBill(who,'101','9',request()),error=>error.status===403);
  for(const [patch,bytes,code] of [[{'X-Contract-Revision':'bad'},undefined,'INVALID_BILL'],[{'X-Bill-Revision':'bad'},undefined,'INVALID_BILL'],[{'Content-Type':'application/json'},undefined,'INVALID_BILL'],[{'Content-Length':'2097153'},undefined,'BILL_TOO_LARGE'],[{},Buffer.from('not jpeg'),'INVALID_BILL'],[{},Buffer.alloc(2097153),'BILL_TOO_LARGE']]){
    await assert.rejects(()=>server.uploadMobileRenewalBill(user,'101','9',request(patch,bytes)),error=>error.code===code);
  }
  assert.equal(connects,0);
  checks.push('Missing renewal grants, malformed reviewed revisions, wrong MIME, invalid signatures and excessive bodies fail before DB access');
  const result={passed:checks.length,checks,operationalWrites:0,sql:'Actual transaction/RLS/receipt tests are in test:mobile:sql',completedAt:new Date().toISOString()};
  fs.mkdirSync('.backups',{recursive:true});fs.writeFileSync('.backups/mobile-bills-api-results.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}
run().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{global.fetch=originalFetch;if(descriptor)Object.defineProperty(db.himotoPool,'connect',descriptor);else delete db.himotoPool.connect;});
