require('./lib/offline-tests.cjs');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {NextRequest}=require('next/server');
const {load,root}=require('./lib/load-typescript.cjs');
const {createApi}=load(path.resolve(root,'../mobile/src/lib/api'));
const {isMobileSwapPreparation,isMobileSwapCandidates,isMobileSwapReceipt,isMobileSwapPreview}=load(path.resolve(root,'../shared/mobile-swaps'));
const server=load(path.join(root,'lib/server/mobile-swaps'));
const writer=load(path.join(root,'lib/server/mobile-swap-write'));
const db=load(path.join(root,'lib/server/himoto-database'));
const descriptor=Object.getOwnPropertyDescriptor(db.himotoPool,'connect'),originalFetch=global.fetch;
const user={id:7,role:'staff',access_role:'custom',store_id:23,scope_all:false,permissions:['contracts.read','contracts.return','vehicles.read']};
const line={id:301,vehicleId:201,name:'Xe QA',license:'QA-201',revision:'100',startsAt:null,returnAt:null,completedAt:null,available:true,blockedReason:null};
const data={id:101,code:'HD-QA',status:'renting',storeId:23,revision:'100',ownership:false,available:true,blockedReason:null,
  items:{page:1,pages:1,total:1,rows:[line]},observedAt:'2026-11-02T00:00:00+07:00'};
const vehicle={id:202,revision:'101',name:'Xe mới QA',license:'QA-202',brand:'QA',type:'electric',color:'Đỏ',year:'2026',storeId:23,storeName:'Kho QA'};
const list={id:101,revision:'100',itemId:301,itemRevision:'100',ownership:false,page:1,search:'QA %_',hasMore:false,rows:[vehicle],observedAt:data.observedAt};
const calls=[],checks=[];let connects=0;
Object.defineProperty(db.himotoPool,'connect',{configurable:true,value:async()=>{connects++;throw Error('Preflight must not connect');}});
async function run(){
  const api=createApi('https://fixture.invalid','hm1_'+'a'.repeat(43)),abort=new AbortController();
  global.fetch=async(url,options)=>{calls.push({url,options});return Response.json(data);};
  assert.deepEqual(await api.swapPreparation('101',1,abort.signal),data);
  assert.equal(calls[0].url,'https://fixture.invalid/api/mobile/v1/contracts/101/swaps?page=1');
  assert.equal(calls[0].options.credentials,'omit');assert.equal(calls[0].options.redirect,'error');
  assert.equal(calls[0].options.headers.Authorization,'Bearer hm1_'+'a'.repeat(43));assert(calls[0].options.signal instanceof AbortSignal);
  for(const broken of [{...data,id:102},{...data,items:{...data.items,page:2}},{...data,items:{...data.items,rows:[line,line]}},
    {...data,available:false},{...data,items:{...data.items,rows:[{...line,completedAt:data.observedAt}]}}]){
    global.fetch=async()=>Response.json(broken);await assert.rejects(()=>api.swapPreparation('101'),e=>e.code==='INVALID_RESPONSE');
  }
  checks.push('Swap preparation is an origin-bound cancellable bearer GET and validates gates, unique lines, requested contract and exact 25-row pagination');
  global.fetch=async(url,options)=>{calls.push({url,options});return Response.json(list);};
  assert.deepEqual(await api.swapCandidates('101','100',301,'100',' QA %_ ',1,abort.signal),list);
  const url=new URL(calls.at(-1).url);assert.equal(url.searchParams.get('search'),'QA %_');assert.equal(url.searchParams.get('item_id'),'301');
  assert.equal(calls.at(-1).options.method,undefined);assert(!calls.at(-1).options.headers['Idempotency-Key']);
  for(const broken of [{...list,id:102},{...list,revision:'101'},{...list,itemId:302},{...list,itemRevision:'101'},
    {...list,search:'other'},{...list,page:2},{...list,rows:[vehicle,vehicle]},{...list,hasMore:true}]){
    global.fetch=async()=>Response.json(broken);await assert.rejects(()=>api.swapCandidates('101','100',301,'100','QA %_'),e=>e.code==='INVALID_RESPONSE');
  }
  assert(isMobileSwapPreparation(data));assert(isMobileSwapCandidates(list));
  checks.push('Candidate responses bind the contract/line revisions, selection, literal search and page; malformed stock and short hasMore pages fail closed without reserving a write key');
  const request=query=>new NextRequest('https://fixture.invalid/swaps'+query);
  for(const permission of ['contracts.read','contracts.return'])await assert.rejects(()=>server.readMobileSwapPreparation({...user,permissions:user.permissions.filter(p=>p!==permission)},'101',request('')),e=>e.code==='FORBIDDEN');
  for(const query of ['?page=0','?page=01','?page=1&page=2','?page=100001','?limit=100'])
    await assert.rejects(()=>server.readMobileSwapPreparation(user,'101',request(query)),e=>e.status===400);
  const valid='?revision=100&item_id=301&item_revision=100';
  for(const query of ['','?item_id=301',valid+'&page=0',valid+'&page=10001',valid+'&search='+('a'.repeat(121)),valid+'&item_id=302',valid+'&all=true'])
    await assert.rejects(()=>server.readMobileSwapCandidates(user,'101',request(query)),e=>e.status===400);
  assert.equal(connects,0);
  checks.push('Preparation/candidates require contract read/return and the shared fleet-read entitlement; malformed IDs, revisions, duplicate parameters, unsupported filters and oversized queries reject before DB access');
  const input={revision:'100',item_id:301,item_revision:'100',vehicle_id:202,vehicle_revision:'101'};
  const preview={id:101,code:'HD-QA',revision:'100',ownership:false,item:line,vehicle,observedAt:data.observedAt};
  assert(isMobileSwapPreview(preview));
  global.fetch=async(url,options)=>{calls.push({url,options});return Response.json(preview);};
  assert.deepEqual(await api.swapPreview('101',input,abort.signal),preview);
  const previewCall=calls.at(-1);assert.equal(previewCall.options.method,'POST');assert(!previewCall.options.headers['Idempotency-Key']);
  assert(previewCall.options.signal instanceof AbortSignal);assert.deepEqual(JSON.parse(previewCall.options.body),input);
  for(const broken of [{...preview,id:102},{...preview,revision:'101'},{...preview,item:{...line,id:302}},{...preview,item:{...line,revision:'101'}},
    {...preview,vehicle:{...vehicle,id:203}},{...preview,vehicle:{...vehicle,revision:'102'}},{...preview,item:{...line,available:false,blockedReason:'Đã trả'}}]){
    global.fetch=async()=>Response.json(broken);await assert.rejects(()=>api.swapPreview('101',input),e=>e.code==='INVALID_RESPONSE');
  }
  checks.push('Read-only swap preview sends no UUID, is cancellable and binds contract/line/stock IDs and reviewed revisions before confirmation');
  const key='00112233-4455-4677-8899-aabbccddeeff';
  const proof={id:101,revision:'103',requestId:key,replayed:false,code:'HD-QA',swapId:12,swapRevision:'103',itemId:301,itemRevision:'103',
    reviewedRevision:'100',reviewedItemRevision:'100',reviewedVehicleRevision:'101',
    from:{id:201,name:'Xe QA',license:'QA-201'},to:{...vehicle,revision:'103'},recordedAt:data.observedAt,
    itemCurrent:true,historyCurrent:true,vehicleCurrent:true,contractCurrent:true,current:true};
  assert(isMobileSwapReceipt(proof));
  global.fetch=async(url,options)=>{calls.push({url,options});return Response.json(proof);};
  assert.deepEqual(await api.recordSwap('101',input,key),proof);
  const call=calls.at(-1);assert.equal(call.options.method,'POST');assert.equal(call.options.headers['Idempotency-Key'],key);
  assert.deepEqual(JSON.parse(call.options.body),input);
  for(const broken of [{...proof,id:102},{...proof,requestId:'11223344-5566-4788-99aa-bbccddeeff00'},{...proof,itemId:302},
    {...proof,reviewedRevision:'101'},{...proof,reviewedItemRevision:'101'},{...proof,reviewedVehicleRevision:'102'},
    {...proof,to:{...proof.to,id:203}},{...proof,vehicleCurrent:false},{...proof,swapRevision:'bad'},{...proof,from:{...proof.from,id:202}}]){
    global.fetch=async()=>Response.json(broken);await assert.rejects(()=>api.recordSwap('101',input,key),e=>e.code==='INVALID_RESPONSE');
  }
  global.fetch=async()=>Response.json({receipt:proof});assert.deepEqual((await api.swapReceipt(key)).receipt,proof);
  await assert.rejects(()=>api.swapReceipt('11223344-5566-4788-99aa-bbccddeeff00'),e=>e.code==='INVALID_RESPONSE');
  global.fetch=async()=>Response.json({receipt:null});assert.equal((await api.swapReceipt(key)).receipt,null);
  const corrected={...proof,vehicleCurrent:false,current:false};
  global.fetch=async()=>Response.json({receipt:corrected});assert.deepEqual((await api.swapReceipt(key)).receipt,corrected);
  checks.push('Swap writes bind key, contract/line/vehicle and all reviewed revisions; original-proof lookup rejects another key and retains explicit later-correction flags');
  for(const bad of [{...input,amount:'1'},{...input,item_id:'301'},{...input,vehicle_id:0},{...input,vehicle_revision:'01'},{...input,revision:undefined}]){
    assert.throws(()=>writer.parseMobileSwapInput(bad),e=>e.code==='INVALID_SWAP');
    await assert.rejects(()=>writer.recordMobileSwap(user,'101',new NextRequest('https://fixture.invalid/swaps',
      {method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(bad)})),e=>e.code==='INVALID_SWAP');
    await assert.rejects(()=>server.readMobileSwapPreview(user,'101',new NextRequest('https://fixture.invalid/swaps/preview',
      {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(bad)})),e=>e.code==='INVALID_SWAP');
  }
  await assert.rejects(()=>server.readMobileSwapPreview(user,'101',new NextRequest('https://fixture.invalid/swaps/preview',
    {method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(input)})),e=>e.code==='INVALID_QUERY');
  assert.equal(connects,0);
  checks.push('Writer accepts exactly the five reviewed fields and rejects injected amounts, malformed IDs/revisions and missing values before acquiring a connection or reserving a key');
  const result={passed:checks.length,checks,fixtureOnly:true,externalNetworkAllowed:false};
  fs.mkdirSync('.backups',{recursive:true});fs.writeFileSync('.backups/mobile-swaps-results.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}
run().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{global.fetch=originalFetch;Object.defineProperty(db.himotoPool,'connect',descriptor);});
