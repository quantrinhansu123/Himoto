require('./lib/offline-tests.cjs');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {NextRequest}=require('next/server');
const {load,root}=require('./lib/load-typescript.cjs');
const {createApi}=load(path.resolve(root,'../mobile/src/lib/api'));
const {isMobileRenewalCollectionPreparation,isMobileRenewalCollectionReceipt,isMobileRenewalPeriods}=load(path.resolve(root,'../shared/mobile-renewal-collection'));
const server=load(path.join(root,'lib/server/mobile-renewal-collection'));
const writer=load(path.join(root,'lib/server/mobile-renewal-collection-write'));
const bills=load(path.join(root,'lib/server/mobile-bills'));
const {reviewRenewalCollection}=load(path.resolve(root,'../mobile/src/lib/renewal-collection-form'));
const db=load(path.join(root,'lib/server/himoto-database'));
const descriptor=Object.getOwnPropertyDescriptor(db.himotoPool,'connect'),originalFetch=global.fetch;
const user={id:7,role:'staff',access_role:'custom',store_id:23,scope_all:false,permissions:['contracts.read','finance.write']};
const period={orderId:101,version:2,itemId:301,vehicleId:3,vehicleName:'Xe QA',license:'QA-003',beforeReturnAt:'2026-11-02T08:00:00+07:00',returnAt:'2026-11-03T08:00:00+07:00',createdAt:'2026-11-01T08:00:00+07:00',amount:100000,collected:30000,remaining:70000,snapshot:'a'.repeat(64)};
const data={id:101,code:'HD-QA-101',storeId:23,revision:'100',totalAmount:600000,rentalPaid:130000,rentalRemaining:470000,canWrite:true,available:true,blockedReason:null,period,
  accounts:[{id:1,method:'cash',label:'Két QA'},{id:1,method:'transfer',label:'Cá nhân QA'}],observedAt:'2026-11-01T08:00:00+07:00'};
const checks=[],calls=[];let connects=0;
const key='00000000-0000-4000-8000-000000000001';
const input={version:2,snapshot:period.snapshot,revision:'100',expected_total:600000,expected_remaining:470000,amount:'10000',method:'cash',account_id:1,paid_at:'2026-11-01T08:00',note:'QA',bill_revision:'200'};
const receipt={id:101,revision:'101',replayed:false,version:2,transactionId:9001,amount:10000,periodAmount:100000,collectedBefore:30000,remainingAfter:60000,
  itemId:301,vehicleId:3,beforeReturnAt:period.beforeReturnAt,returnAt:period.returnAt,periodCreatedAt:period.createdAt,method:'cash',accountId:1,paidAt:'2026-11-01T01:00:00Z',billRevision:'200',current:true,billCurrent:true};
const post=(body=input,headers={})=>new NextRequest('https://fixture.invalid/api/mobile/v1/contracts/101/renewals/2/collection',{
  method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key,...headers},body:JSON.stringify(body)});
Object.defineProperty(db.himotoPool,'connect',{configurable:true,value:async()=>{connects++;throw Error('Preflight must not connect');}});
const request=query=>new NextRequest('https://fixture.invalid/api/mobile/v1/contracts/101/renewals/2/collection'+(query||''));
async function run(){
  const api=createApi('https://fixture.invalid','hm1_'+'a'.repeat(43)),abort=new AbortController();
  global.fetch=async(url,options)=>{calls.push({url,options});return Response.json(data);};
  assert.deepEqual(await api.renewalCollection('101',2,abort.signal),data);
  assert.equal(calls[0].url,'https://fixture.invalid/api/mobile/v1/contracts/101/renewals/2/collection');
  assert.equal(calls[0].options.credentials,'omit');assert.equal(calls[0].options.redirect,'error');assert(calls[0].options.signal instanceof AbortSignal);
  assert.equal(calls[0].options.headers.Authorization,'Bearer hm1_'+'a'.repeat(43));
  checks.push('Collection preparation uses an origin-bound bearer request with cancellation, no browser credentials and no redirects');
  for(const broken of [{...data,id:102},{...data,period:{...period,version:3}},{...data,period:{...period,orderId:102}},
    {...data,period:{...period,remaining:1}},{...data,period:{...period,collected:100001}},{...data,period:{...period,snapshot:'bad'}},
    {...data,period:{...period,returnAt:'bad'}},{...data,available:false},{...data,accounts:[...data.accounts,data.accounts[0]]}]){
    global.fetch=async()=>Response.json(broken);await assert.rejects(()=>api.renewalCollection('101',2),error=>error.code==='INVALID_RESPONSE');
  }
  checks.push('The client rejects wrong contracts/versions, inconsistent period balances, malformed review hashes/dates, duplicate account identities and contradictory business gates');
  for(const valid of [data,{...data,canWrite:false},{...data,available:false,blockedReason:'Settled QA',period:{...period,collected:100000,remaining:0}},
    {...data,period:{...period,beforeReturnAt:null}},{...data,period:{...period,createdAt:null}}])assert(isMobileRenewalCollectionPreparation(valid));
  assert.equal(isMobileRenewalCollectionPreparation({...data,period:{...period,beforeReturnAt:null,createdAt:null}}),false);
  assert.equal(isMobileRenewalCollectionPreparation({...data,period:{...period,collected:100000,remaining:0}}),false);
  checks.push('Read-only grants, explicitly settled periods and stable open-ended original periods remain distinguishable from unavailable or ambiguous data');
  for(const who of [{...user,permissions:['contracts.read','contracts.renew']},{...user,permissions:['finance.write']}])await assert.rejects(()=>server.readMobileRenewalCollection(who,'101','2',request()),error=>error.status===403);
  for(const [id,version,query] of [['bad','2',''],['101','1',''],['101','2?bad',''],['101','2','?page=1'],['101','2','?revision=100']])
    await assert.rejects(()=>server.readMobileRenewalCollection(user,id,version,request(query)),error=>error.status===400);
  assert.equal(connects,0);
  checks.push('Current finance/read permissions, valid resource/version identifiers and unsupported filters are checked before DB access');
  calls.length=0;global.fetch=async(url,options)=>{calls.push({url,options});return Response.json(receipt);};
  assert.deepEqual(await api.recordRenewalCollection('101',2,input,key),receipt);
  assert.equal(calls[0].url,'https://fixture.invalid/api/mobile/v1/contracts/101/renewals/2/collection');
  assert.equal(calls[0].options.method,'POST');assert.deepEqual(JSON.parse(calls[0].options.body),input);
  assert.equal(calls[0].options.headers['Idempotency-Key'],key);assert.equal(calls[0].options.credentials,'omit');assert.equal(calls[0].options.redirect,'error');
  assert.equal(calls[0].options.headers.Authorization,'Bearer hm1_'+'a'.repeat(43));
  checks.push('Linked collection preserves the exact period snapshot, contract/bill revisions, balance review, amount and UUID in an origin-bound bearer POST');
  for(const broken of [{...receipt,id:102},{...receipt,version:3},{...receipt,remainingAfter:1},{...receipt,amount:0},{...receipt,collectedBefore:100000},
    {...receipt,transactionId:null},{...receipt,billRevision:'bad'},{...receipt,beforeReturnAt:null,periodCreatedAt:null},{...receipt,paidAt:'bad'},{...receipt,billCurrent:undefined}]){
    global.fetch=async()=>Response.json(broken);await assert.rejects(()=>api.recordRenewalCollection('101',2,input,key),error=>error.code==='INVALID_RESPONSE');
  }
  assert(isMobileRenewalCollectionReceipt({...receipt,current:false,billCurrent:false,replayed:true}));
  global.fetch=async(url)=>{assert.equal(url,'https://fixture.invalid/api/mobile/v1/renewal-collections/requests/'+key);return Response.json({receipt:{...receipt,current:false,billCurrent:false,replayed:true}});};
  assert.equal((await api.renewalCollectionReceipt(key)).receipt.transactionId,9001);
  global.fetch=async()=>Response.json({receipt:null});assert.equal((await api.renewalCollectionReceipt(key)).receipt,null);
  checks.push('Malformed or mismatched collection receipts cannot count as success; recovery preserves original period/money/transaction even after later cashbook or image changes');
  for(const who of [{...user,permissions:['contracts.read','finance.read']},{...user,permissions:['contracts.read','contracts.renew']},{...user,permissions:['finance.write']}]){
    await assert.rejects(()=>writer.recordMobileRenewalCollection(who,'101','2',post()),error=>error.status===403);
    await assert.rejects(()=>bills.uploadMobileRenewalBill(who,'101','2',new NextRequest('https://fixture.invalid',{method:'PUT'}),'collection'),error=>error.status===403);
  }
  for(const broken of [{...input,version:3},{...input,version:'2'},{...input,snapshot:'bad'},{...input,bill_revision:'0'},{...input,expected_total:null},
    {...input,expected_remaining:-1},{...input,amount:'0'},{...input,amount:'1.5'},{...input,method:'card'},{...input,paid_at:'2026-02-30T08:00'},
    {...input,request_id:key},{...input,purpose:'rental'},{...input,renewal_version:2},{...input,acknowledge_overpayment:false},{...input,note:'x'.repeat(17000)}])
    await assert.rejects(()=>writer.recordMobileRenewalCollection(user,'101','2',post(broken)),error=>error.status===400||error.status===413);
  await assert.rejects(()=>writer.recordMobileRenewalCollection(user,'101','2',post(input,{'Idempotency-Key':'bad'})),error=>error.status===400);
  await assert.rejects(()=>writer.readMobileRenewalCollectionReceipt(user,'bad'),error=>error.status===400);
  checks.push('Write grants, strict version/snapshot/bill/balance review, domain money/date rules, input whitelist and bounded bodies fail before connecting to PostgreSQL');
  const image=new ArrayBuffer(1000),billReceipt={id:101,revision:'100',replayed:false,version:2,slot:'renewal-2-document-1',sha256:'b'.repeat(64),photoRevision:'200',bytes:1000,current:true};
  calls.length=0;global.fetch=async(url,options)=>{calls.push({url,options});return Response.json(billReceipt);};
  assert.equal((await api.uploadCollectionBill('101',2,'100',null,image,key)).photoRevision,'200');
  assert.equal(calls[0].url,'https://fixture.invalid/api/mobile/v1/contracts/101/renewals/2/collection/bill');assert.equal(calls[0].options.body,image);
  assert.equal(calls[0].options.headers['Content-Type'],'image/jpeg');assert.equal(calls[0].options.headers['X-Bill-Revision'],'0');
  global.fetch=async(url)=>{assert.equal(url,'https://fixture.invalid/api/mobile/v1/renewal-collection-bills/requests/'+key);return Response.json({receipt:billReceipt});};
  assert.equal((await api.collectionBillReceipt(key)).receipt.version,2);
  checks.push('Historical bill upload keeps binary JPEG and reviewed revisions and recovers through its own finance-scoped receipt endpoint');
  const list={id:101,code:'HD-QA-101',canWrite:true,available:true,blockedReason:null,page:1,pages:1,total:1,rows:[period]};
  assert(isMobileRenewalPeriods(list));global.fetch=async(url)=>{assert.equal(url,'https://fixture.invalid/api/mobile/v1/contracts/101/renewals/periods?page=1');return Response.json(list);};
  assert.deepEqual(await api.renewalPeriods('101',1),list);
  for(const broken of [{...list,id:102},{...list,page:2},{...list,total:2},{...list,rows:[period,period],total:2},{...list,rows:[{...period,orderId:102}]},{...list,pages:2}]){
    global.fetch=async()=>Response.json(broken);await assert.rejects(()=>api.renewalPeriods('101',1),error=>error.code==='INVALID_RESPONSE');
  }
  assert(isMobileRenewalPeriods({...list,total:0,rows:[]}));assert(isMobileRenewalPeriods({...list,canWrite:false}));
  for(const query of ['?page=0','?page=1&page=2','?page=1&limit=100','?page=1.5'])
    await assert.rejects(()=>server.readMobileRenewalPeriods(user,'101',request(query)),error=>error.status===400);
  assert.equal(connects,0);
  checks.push('Saved-period discovery binds contract/page, validates balances, descending unique versions and exact page lengths, and rejects ambiguous filters before DB access');
  const form={amount:'10000',method:'cash',account:'cash:1',paidAt:input.paid_at,note:' QA ',reviewedBill:{version:2,revision:'200'}},now=Date.parse('2026-11-01T08:00:00+07:00');
  assert.deepEqual(reviewRenewalCollection(data,form,now),input);
  assert.equal(reviewRenewalCollection(data,{...form,amount:'70000'},now).amount,'70000');
  assert(!('acknowledge_overpayment' in reviewRenewalCollection(data,form,now)));
  assert.equal(reviewRenewalCollection({...data,rentalRemaining:5000},form,now).acknowledge_overpayment,true);
  checks.push('Form review binds the selected saved period, exact amount and qualified account and explicitly flags income above the whole-contract remaining balance without changing the fee');
  for(const patch of [{amount:'0'},{amount:'70001'},{amount:'1.5'},{amount:'1e3'},{amount:'99999999999999'},{account:'transfer:1'},{paidAt:'2026-11-01T08:06'},
    {paidAt:'2026-02-30T08:00'},{note:'x'.repeat(2001)},{reviewedBill:null},{reviewedBill:{version:3,revision:'200'}},{reviewedBill:{version:2,revision:'bad'}}])
    assert.throws(()=>reviewRenewalCollection(data,{...form,...patch},now));
  for(const patch of [{canWrite:false},{available:false,blockedReason:'QA blocked'},{totalAmount:null},{rentalRemaining:null}])assert.throws(()=>reviewRenewalCollection({...data,...patch},form,now));
  checks.push('Form review rejects stale/missing bill review, over-period or malformed money, future/invalid dates, method/account mismatch, oversized text and unavailable balances before reserving a UUID');
  const result={passed:checks.length,checks,operationalWrites:0,sql:'Actual partial-collection/RLS/aggregation cases are in test:mobile:sql',completedAt:new Date().toISOString()};
  fs.mkdirSync('.backups',{recursive:true});fs.writeFileSync('.backups/mobile-renewal-collection-results.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}
run().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{global.fetch=originalFetch;if(descriptor)Object.defineProperty(db.himotoPool,'connect',descriptor);else delete db.himotoPool.connect;});
