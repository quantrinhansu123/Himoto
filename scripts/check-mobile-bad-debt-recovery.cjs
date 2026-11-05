require('./lib/offline-tests.cjs');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {NextRequest}=require('next/server'),{load,root}=require('./lib/load-typescript.cjs');
const dto=load(path.resolve(root,'../shared/mobile-bad-debt-recovery'));
const {createApi}=load(path.resolve(root,'../mobile/src/lib/api'));
const server=load(path.join(root,'lib/server/mobile-bad-debt-recovery'));
const writer=load(path.join(root,'lib/server/mobile-recovery-write'));
const {recoveryFormInput}=load(path.resolve(root,'../mobile/src/lib/recovery-form'));
const domain=load(path.join(root,'lib/server/contract-returns'));
const db=load(path.join(root,'lib/server/himoto-database'));
const descriptor=Object.getOwnPropertyDescriptor(db.himotoPool,'connect'),originalFetch=global.fetch;
const at='2026-10-31T03:00:00.000Z',checks=[],calls=[];let connects=0;
const amounts={totalAmount:2000000,rentalPaid:100000,rentalRemaining:1900000,rentalOverpayment:0,depositHeld:500000};
const item={id:1001,vehicleId:201,revision:'101',name:'Xe thu hoi QA',license:'QA-201',startsAt:'2026-08-01T03:00:00.000Z',completedAt:null,available:true,blockedReason:null};
const preparation={id:101,code:'HD-QA-101',storeId:23,revision:'100',status:'bad_debt',ownership:true,hasInstallmentPlan:true,
  available:true,blockedReason:null,badDebtAt:'2026-09-16T03:00:00.000Z',billingStoppedAt:'2026-09-16T03:00:00.000Z',remainingItems:1,amounts,settled:false,
  items:{page:1,pages:1,total:1,rows:[item]},observedAt:at};
const input={revision:'100',item_id:1001,item_revision:'101',recovered_at:'2026-10-31T10:00',note:'  QA note  '};
const preview={id:101,code:'HD-QA-101',storeId:23,revision:'100',status:'bad_debt',ownership:true,hasInstallmentPlan:true,item,recoveredAt:at,note:'QA note',
  badDebtAt:preparation.badDebtAt,billingStoppedAt:preparation.billingStoppedAt,before:amounts,after:{...amounts,status:'bad_debt',remainingItems:0},settled:false,snapshot:'a'.repeat(64),observedAt:at};
const user={id:7,store_id:23,scope_all:false,role:'staff',access_role:'custom',permissions:['contracts.read','contracts.return']};
Object.defineProperty(db.himotoPool,'connect',{configurable:true,value:async()=>{connects++;throw Error('Expected no DB');}});
async function run(){
  const formNow=Date.parse(at);
  assert.deepEqual(recoveryFormInput(preparation,item,input.recovered_at,input.note,formNow),{...input,note:input.note.trim()});
  for(const badDate of ['2026-02-30T10:00','2026-10-31T25:00','2026-10-31T10:06','2026-07-31T10:00','2026-10-31 10:00',''])
    assert.throws(()=>recoveryFormInput(preparation,item,badDate,'',formNow));
  assert.throws(()=>recoveryFormInput({...preparation,available:false,blockedReason:'blocked'},item,input.recovered_at,'',formNow));
  assert.throws(()=>recoveryFormInput(preparation,{...item,revision:'102'},input.recovered_at,'',formNow));
  assert.throws(()=>recoveryFormInput(preparation,{...item,completedAt:at},input.recovered_at,'',formNow));
  assert.throws(()=>recoveryFormInput(preparation,item,input.recovered_at,'x'.repeat(1001),formNow));
  assert.equal(recoveryFormInput(preparation,item,input.recovered_at,'x'.repeat(1000),formNow).note.length,1000);
  assert.equal(recoveryFormInput({...preparation,amounts:{totalAmount:null,rentalPaid:null,rentalRemaining:null,rentalOverpayment:null,depositHeld:0}},item,input.recovered_at,'',formNow).item_id,item.id);
  checks.push('Recovery form preserves the actual Vietnam minute and normalized note without money fields; impossible/future/pre-hire dates, completed/stale/out-of-page rows and overlong notes cannot be previewed');
  assert(dto.isMobileRecoveryPreparation(preparation));assert(dto.isMobileRecoveryPreview(preview));
  for(const broken of [{...preparation,available:false},{...preparation,status:'renting'},{...preparation,billingStoppedAt:null},{...preparation,remainingItems:2},
    {...preparation,items:{...preparation.items,pages:2}},{...preparation,items:{...preparation.items,rows:[item,item]}},
    {...preparation,items:{...preparation.items,rows:[{...item,completedAt:at}]}},{...preparation,amounts:{...amounts,rentalRemaining:1}}])assert(!dto.isMobileRecoveryPreparation(broken));
  for(const broken of [{...preview,item:{...item,available:false,blockedReason:'done'}},{...preview,recoveredAt:'2026-07-01T00:00:00Z'},
    {...preview,after:{...preview.after,status:'completed'}},{...preview,after:{...preview.after,totalAmount:3000000,rentalRemaining:2900000}},
    {...preview,billingStoppedAt:null},{...preview,note:' QA note'},{...preview,snapshot:'bad'}])assert(!dto.isMobileRecoveryPreview(broken));
  assert(dto.isMobileRecoveryAmounts({totalAmount:null,rentalPaid:0,rentalRemaining:null,rentalOverpayment:null,depositHeld:0}));
  assert(!dto.isMobileRecoveryAmounts({...amounts,rentalPaid:null}));
  checks.push('DTOs validate paging/gates, frozen installment cutoff, original nullable balances and unchanged recovery money; impossible completion/chronology fail closed');
  const api=createApi('https://fixture.invalid','hm1_'+'a'.repeat(43)),abort=new AbortController();
  const respond=value=>{global.fetch=async(url,options)=>{calls.push({url,options});return Response.json(value);};};
  respond(preparation);assert.deepEqual(await api.recoveryPreparation('101',1,abort.signal),preparation);
  assert.equal(calls.at(-1).url,'https://fixture.invalid/api/mobile/v1/contracts/101/recoveries?page=1');
  assert.equal(calls.at(-1).options.credentials,'omit');assert.equal(calls.at(-1).options.redirect,'error');assert(calls.at(-1).options.signal instanceof AbortSignal);
  for(const broken of [{...preparation,id:102},{...preparation,items:{...preparation.items,page:2,pages:2,total:26}}]){
    respond(broken);await assert.rejects(()=>api.recoveryPreparation('101'),e=>e.code==='INVALID_RESPONSE');
  }
  checks.push('Preparation is an origin-bound bearer GET with cancellation and exact contract/page validation; it projects no customer documents or bank details');
  respond(preview);assert.deepEqual(await api.recoveryPreview('101',input,abort.signal),preview);
  assert.equal(calls.at(-1).options.method,'POST');assert.deepEqual(JSON.parse(calls.at(-1).options.body),input);assert(!calls.at(-1).options.headers['Idempotency-Key']);
  for(const broken of [{...preview,id:102},{...preview,revision:'102'},{...preview,item:{...item,id:1002}},{...preview,item:{...item,revision:'102'}},
    {...preview,recoveredAt:'2026-10-31T04:00:00Z'},{...preview,note:'Other'}]){
    respond(broken);await assert.rejects(()=>api.recoveryPreview('101',input),e=>e.code==='INVALID_RESPONSE');
  }
  checks.push('Readonly preview creates no write UUID and binds contract/item revisions, exact Vietnam recovery minute and normalized note before returning a snapshot');
  const {revision,...details}=input;const parsed=server.parseMobileRecoveryInput(input);
  assert.deepEqual(parsed,{...input,note:'QA note'});
  const key='00112233-4455-4677-8899-aabbccddeeff';
  assert.deepEqual(domain.parseBadDebtRecovery({...details,request_id:key.toUpperCase()}),{...details,note:'QA note',request_id:key});
  const request=(body,query='',headers={})=>new NextRequest('https://fixture.invalid/recoveries/preview'+query,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  for(const bad of [{...input,revision:'01'},{...input,item_revision:'01'},{...input,item_id:'1001'},{...input,request_id:key},{...input,amount:'10'},
    {...input,note:'x'.repeat(1001)},{...input,recovered_at:'2026-02-30T10:00'},{...input,recovered_at:'2026-10-31T10:00Z'}]){
    assert.throws(()=>server.parseMobileRecoveryInput(bad),e=>e.status===400);
    await assert.rejects(()=>server.readMobileRecoveryPreview(user,'101',request(bad)),e=>e.status===400);
  }
  for(const permissions of [[],['contracts.read'],['contracts.return'],['contracts.read','finance.write']]){
    await assert.rejects(()=>server.readMobileRecoveryPreview({...user,permissions},'101',request(input)),e=>e.status===403);
    await assert.rejects(()=>server.readMobileRecoveryPreparation({...user,permissions},'101',new NextRequest('https://fixture.invalid/recoveries')),e=>e.status===403);
  }
  for(const query of ['?page=0','?page=1&page=2','?search=QA','?page=100001'])
    await assert.rejects(()=>server.readMobileRecoveryPreparation(user,'101',new NextRequest('https://fixture.invalid/recoveries'+query)),e=>e.status===400);
  for(const [query,headers] of [['?page=1',{}],['',{'Idempotency-Key':key}]])
    await assert.rejects(()=>server.readMobileRecoveryPreview(user,'101',request(input,query,headers)),e=>e.status===400);
  assert.equal(connects,0);
  checks.push('Shared web validation and strict mobile preflight reject impossible dates, money/UUID injection, wrong grants and duplicate/filter parameters before any DB connection');
  const proof={id:101,revision:'102',requestId:key,replayed:false,review:preview,itemRevision:'102',actorId:7,actorName:'QA',recordedAt:at,
    event:{itemId:item.id,vehicleId:item.vehicleId,recoveredAt:at,recordedAt:at,actorId:7,note:'QA note',requestHash:'c'.repeat(64)},
    financialFingerprint:'d'.repeat(64),itemCurrent:true,historyCurrent:true,moneyCurrent:true,contractCurrent:true,current:true};
  const recordInput={...input,review_snapshot:preview.snapshot};assert(dto.isMobileRecoveryReceipt(proof));
  respond(proof);assert.deepEqual(await api.recordRecovery('101',recordInput,key),proof);assert.equal(calls.at(-1).options.headers['Idempotency-Key'],key);
  for(const broken of [{...proof,id:102},{...proof,requestId:'11223344-5566-4788-99aa-bbccddeeff00'},
    {...proof,review:{...preview,snapshot:'b'.repeat(64)}},{...proof,event:{...proof.event,actorId:8}},{...proof,event:{...proof.event,note:'other'}},
    {...proof,itemRevision:'0'},{...proof,moneyCurrent:false}]){
    respond(broken);await assert.rejects(()=>api.recordRecovery('101',recordInput,key),e=>e.code==='INVALID_RESPONSE');
  }
  respond({receipt:proof});assert.deepEqual((await api.recoveryReceipt(key)).receipt,proof);
  await assert.rejects(()=>api.recoveryReceipt('11223344-5566-4788-99aa-bbccddeeff00'),e=>e.code==='INVALID_RESPONSE');
  const corrected={...proof,moneyCurrent:false,current:false,replayed:true};respond({receipt:corrected});assert.deepEqual((await api.recoveryReceipt(key)).receipt,corrected);
  respond({receipt:null});assert.equal((await api.recoveryReceipt(key)).receipt,null);
  checks.push('Writer/receipt clients bind request UUID, contract/item and reviewed snapshot to original actor/history proof; independent later corrections remain readable without accepting mismatched acknowledgements');
  const writeRequest=(body,requestKey=key)=>new NextRequest('https://fixture.invalid/recoveries',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':requestKey},body:JSON.stringify(body)});
  for(const body of [{...recordInput,review_snapshot:undefined},{...recordInput,review_snapshot:'bad'},{...recordInput,request_id:key},{...recordInput,amount:'100'},
    {...recordInput,item_id:'1001'},{...recordInput,revision:'01'}])
    await assert.rejects(()=>writer.recordMobileRecovery(user,'101',writeRequest(body)),e=>e.status===400);
  await assert.rejects(()=>writer.recordMobileRecovery(user,'101',writeRequest(recordInput,'bad')),e=>e.status===400);
  await assert.rejects(()=>writer.recordMobileRecovery({...user,permissions:['contracts.read','finance.write']},'101',writeRequest(recordInput)),e=>e.status===403);
  await assert.rejects(()=>writer.readMobileRecoveryReceipt(user,'bad'),e=>e.status===400);assert.equal(connects,0);
  checks.push('Recovery writer requires reviewed snapshot, exact key and contracts.return; client-supplied audit UUID/money or malformed fields cannot reach the database');
  const result={passed:checks.length,checks,fixtureOnly:true,externalNetworkAllowed:false,operationalWrites:0};
  fs.writeFileSync('.backups/mobile-bad-debt-recovery-results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}
run().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{global.fetch=originalFetch;if(descriptor)Object.defineProperty(db.himotoPool,'connect',descriptor);else delete db.himotoPool.connect;});
