require('./lib/offline-tests.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {NextRequest}=require('next/server');
const {load,root}=require('./lib/load-typescript.cjs');
const {createApi}=load(path.resolve(root,'../mobile/src/lib/api'));
const {isMobileRenewalReceipt}=load(path.resolve(root,'../shared/mobile-renewal-write'));
const server=load(path.join(root,'lib/server/mobile-renewal-write'));
const db=load(path.join(root,'lib/server/himoto-database'));
const descriptor=Object.getOwnPropertyDescriptor(db.himotoPool,'connect'),originalFetch=global.fetch;
const key='00000000-0000-4000-8000-000000000001';
const user={id:7,role:'staff',access_role:'custom',store_id:23,scope_all:false,permissions:['contracts.read','contracts.renew']};
const input={item_id:1,item_revision:'99',order_revision:'100',expected_version:9,return_at:'2026-11-05T08:00',amount:'250000',expected_amount:'300000',note:'QA',
  outside_amount:'50000',outside_name:'Phí QA',receipt:{method:'cash',account_id:4,paid_at:'2026-11-01T08:00'},bill_revision:'199'};
const receipt={id:101,revision:'200',replayed:false,version:9,returnAt:'2026-11-05T01:00:00Z',amount:250000,totalAmount:1250000,collected:true,
  collection:{method:'cash',accountId:4,paidAt:'2026-11-01T01:00:00Z'},transactionId:9001,outsideAmount:50000,outsideTransactionId:9002,billRevision:'199',warning:'QA fee warning',current:true};
const checks=[],calls=[];let connects=0;
Object.defineProperty(db.himotoPool,'connect',{configurable:true,value:async()=>{connects++;throw Error('Preflight must not connect');}});
const request=(body=input,headers={})=>new NextRequest('https://fixture.invalid/api/mobile/v1/contracts/101/renewals',{
  method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key,...headers},body:JSON.stringify(body),
});
async function run(){
  const client=createApi('https://fixture.invalid','hm1_'+'a'.repeat(43));
  global.fetch=async(url,options)=>{calls.push({url,options});return Response.json(receipt);};
  assert.deepEqual(await client.recordRenewal('101',input,key),receipt);
  const sent=calls[0];assert.equal(sent.url,'https://fixture.invalid/api/mobile/v1/contracts/101/renewals');
  assert.equal(sent.options.method,'POST');assert.deepEqual(JSON.parse(sent.options.body),input);
  assert.equal(sent.options.headers['Idempotency-Key'],key);assert.equal(sent.options.headers.Authorization,'Bearer hm1_'+'a'.repeat(43));
  assert.equal(sent.options.credentials,'omit');assert.equal(sent.options.redirect,'error');
  checks.push('The origin-bound renewal client preserves the reviewed version, line/contract/bill revisions, collection and UUID without browser credentials or redirects');

  const unpaid={...receipt,collected:false,collection:null,transactionId:null,outsideTransactionId:null,billRevision:null};
  const outsideOnly={...receipt,amount:0,transactionId:null};
  for(const value of [receipt,unpaid,outsideOnly,{...receipt,current:false,replayed:true}])assert(isMobileRenewalReceipt(value));
  for(const value of [{...receipt,version:1},{...receipt,returnAt:'bad'},{...receipt,amount:-1},{...receipt,collection:null},{...receipt,transactionId:null},
    {...receipt,outsideTransactionId:null},{...receipt,billRevision:null},{...receipt,collection:{...receipt.collection,method:'card'}},
    {...receipt,collection:{...receipt.collection,accountId:0}},{...receipt,outsideTransactionId:9001},{...receipt,amount:9999999999999},
    {...unpaid,transactionId:9001},{...unpaid,billRevision:'199'}])assert.equal(isMobileRenewalReceipt(value),false);
  checks.push('Paid, unpaid and outside-only receipts keep independent transaction IDs and reject contradictory bill, account, money and date acknowledgements');

  for(const broken of [{...receipt,id:102},{...receipt,version:10},{...receipt,revision:'bad'},{...receipt,current:undefined}]){
    global.fetch=async()=>Response.json(broken);await assert.rejects(()=>client.recordRenewal('101',input,key),error=>error.code==='INVALID_RESPONSE');
  }
  global.fetch=async()=>Response.json({receipt:{...receipt,replayed:true,current:false}});
  assert.equal((await client.renewalReceipt(key)).receipt.current,false);
  global.fetch=async()=>Response.json({receipt:null});assert.equal((await client.renewalReceipt(key)).receipt,null);
  checks.push('A mismatched contract/version never counts as success; recovery retains the original receipt even after later cashbook changes and supports a not-yet-found result');

  for(const who of [{...user,permissions:['contracts.read','finance.write']},{...user,permissions:['contracts.renew']}]){
    await assert.rejects(()=>server.recordMobileRenewal(who,'101',request()),error=>error.status===403);
    await assert.rejects(()=>server.readMobileRenewalReceipt(who,key),error=>error.status===403);
  }
  for(const broken of [{...input,expected_version:1},{...input,expected_version:'9'},{...input,bill_revision:undefined},{...input,bill_revision:'bad'},
    {...input,request_id:key},{...input,occurred_at:'2099-10-01T08:00'},{...input,receipt:{...input.receipt,paid_at:'2099-10-01T08:00'}},{...input,return_at:'2026-02-30T08:00'},
    {...input,receipt:{...input.receipt,method:'company_transfer'}},{...input,amount:'-1'},{...input,item_revision:'bad'},
    {...input,receipt:undefined},{...input,note:'x'.repeat(17000)}]){
    await assert.rejects(()=>server.recordMobileRenewal(user,'101',request(broken)),error=>error.status===400||error.status===413);
  }
  await assert.rejects(()=>server.recordMobileRenewal(user,'101',request(input,{'Idempotency-Key':'bad'})),error=>error.status===400);
  await assert.rejects(()=>server.readMobileRenewalReceipt(user,'bad'),error=>error.status===400);
  assert.equal(connects,0);
  checks.push('Renewal grants, exact reviewed version/bill, valid local dates, domain collection rules, bounded bodies and server-controlled UUIDs are checked before any DB connection');
  const result={passed:checks.length,checks,operationalWrites:0,sql:'Actual renewal/domain/RLS/rollback/replay checks are in test:mobile:sql',completedAt:new Date().toISOString()};
  fs.mkdirSync('.backups',{recursive:true});fs.writeFileSync('.backups/mobile-renewal-write-results.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}
run().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{global.fetch=originalFetch;if(descriptor)Object.defineProperty(db.himotoPool,'connect',descriptor);else delete db.himotoPool.connect;});
