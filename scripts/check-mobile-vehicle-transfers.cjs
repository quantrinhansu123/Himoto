require('./lib/offline-tests.cjs');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {NextRequest}=require('next/server');
const {load,root}=require('./lib/load-typescript.cjs');
const {createApi}=load(path.resolve(root,'../mobile/src/lib/api'));
const dto=load(path.resolve(root,'../shared/mobile-vehicle-transfers'));
const server=load(path.join(root,'lib/server/mobile-vehicle-transfers')),writer=load(path.join(root,'lib/server/mobile-vehicle-transfer-write'));
const db=load(path.join(root,'lib/server/himoto-database'));
const originalFetch=global.fetch,descriptor=Object.getOwnPropertyDescriptor(db.himotoPool,'connect');
const user={id:7,role:'staff',access_role:'custom',store_id:23,scope_all:false,permissions:[]};
const at='2026-11-02T00:00:00+07:00',vehicle={id:101,revision:'100',name:'Xe QA',license:'QA-101',brand:'QA',type:'electric',color:'Đỏ',year:'2026',status:'ready',storeId:24,storeName:'Kho khác QA',ownerStoreId:31,ownerStoreName:'Cơ sở sở hữu QA'};
const from={id:24,name:'Kho khác QA',revision:'100'},to={id:23,name:'Kho QA',revision:'100'};
const data={id:101,vehicle,transfer:null,actions:['transfer','receive','reject','cancel'].map(action=>({action,available:action==='transfer',blockedReason:action==='transfer'?null:'Chưa chuyển'})),observedAt:at};
const input={action:'transfer',revision:'100',note:'  QA  ',to_store_id:23};
const review={id:101,action:'transfer',revision:'100',snapshot:'a'.repeat(64),vehicle,transfer:null,fromStore:from,toStore:to,after:{status:'in_transit',storeId:23,ownerStoreId:23},effect:'awaiting_receipt',note:'QA',observedAt:at};
const key='00112233-4455-4677-8899-aabbccddeeff';
const proof={id:101,revision:'101',requestId:key,replayed:false,action:'transfer',review,recordedAt:at,
  events:[{id:1,revision:'101',type:'manual_transfer',refId:null,fromStoreId:24,toStoreId:23,fromStoreName:from.name,toStoreName:to.name,actorId:7,actorName:'QA',recordedAt:at,note:'QA'}],
  vehicleCurrent:true,eventsCurrent:true,transferCurrent:true,current:true};
const checks=[],calls=[];let connects=0;
Object.defineProperty(db.himotoPool,'connect',{configurable:true,value:async()=>{connects++;throw Error('Expected fixture connection');}});
async function run(){
  const ts=require('typescript'),formModule={exports:{}},lookups=[],scope={origin:'https://fixture.invalid',userId:7,storeId:23,allStores:false};
  const formSource=fs.readFileSync(path.resolve(root,'../mobile/src/lib/vehicle-transfer-form.ts'),'utf8');
  new Function('require','module','exports',ts.transpileModule(formSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(
    name=>name==='./pending-writes'?{pendingWrites:{lookup:async(s,op)=>{assert.deepEqual(s,scope);lookups.push(op);return op==='vehicle.cancel:101'?key:null;}}}:dto,formModule,formModule.exports);
  const form=formModule.exports;
  assert.deepEqual(form.vehicleTransferInput(data,'transfer',to,'  QA  '),{...input,note:'QA'});
  assert.throws(()=>form.vehicleTransferInput(data,'transfer',from,''),/khác kho/);
  assert.throws(()=>form.vehicleTransferInput(data,'transfer',null,''),/Chọn kho/);
  assert.throws(()=>form.vehicleTransferInput(data,'transfer',to,'a'.repeat(501)),/500/);
  for(const action of ['receive','reject','cancel']){
    assert.throws(()=>form.vehicleTransferInput(data,action,null,''),/Chưa chuyển/);
    const transfer={id:19,revision:'23',receivable:true},allowed={...data,transfer,actions:data.actions.map(g=>({...g,available:true,blockedReason:null}))};
    assert.deepEqual(form.vehicleTransferInput(allowed,action,null,'  resolution  '),{action,revision:'100',note:'resolution',transfer_event_id:19,transfer_event_revision:'23'});
    assert.throws(()=>form.vehicleTransferInput({...allowed,transfer:{...transfer,receivable:false}},action,null,''),/không còn chờ/);
  }
  checks.push('Editor input trims and bounds notes, requires a different destination and binds receive/reject/cancel to the exact available dispatch revision');
  assert.deepEqual(form.transferOperations('101'),['vehicle.transfer:101','vehicle.receive:101','vehicle.reject:101','vehicle.cancel:101']);
  assert.deepEqual(await form.lookupTransferPending(scope,'101'),[{action:'cancel',key}]);
  assert.deepEqual(lookups,form.transferOperations('101'));
  checks.push('Editor checks all four actor-scoped vehicle actions before permitting a write and keeps the original pending action/UUID');
  const api=createApi('https://fixture.invalid','hm1_'+'a'.repeat(43)),abort=new AbortController();
  const respond=value=>{global.fetch=async(url,options)=>{calls.push({url,options});return Response.json(value);};};
  respond(data);assert.deepEqual(await api.vehicleTransferPreparation('101',abort.signal),data);
  assert.equal(calls.at(-1).url,'https://fixture.invalid/api/mobile/v1/vehicles/101/transfers');assert.equal(calls.at(-1).options.credentials,'omit');
  assert.equal(calls.at(-1).options.redirect,'error');assert(calls.at(-1).options.signal instanceof AbortSignal);
  for(const broken of [{...data,id:102},{...data,actions:[data.actions[0],data.actions[0],...data.actions.slice(2)]},{...data,actions:[{...data.actions[0],blockedReason:'blocked'},...data.actions.slice(1)]}]){
    respond(broken);await assert.rejects(()=>api.vehicleTransferPreparation('101'),e=>e.code==='INVALID_RESPONSE');
  }
  checks.push('Fleet preparation is a cancellable origin-bound bearer GET with exact vehicle binding and four distinct coherent availability gates');
  const destinations={id:101,revision:'100',page:1,search:'_%',hasMore:false,rows:[to],observedAt:at};
  respond(destinations);assert.deepEqual(await api.transferDestinations('101','100',' _% ',1,abort.signal),destinations);
  assert.equal(new URL(calls.at(-1).url).searchParams.get('search'),'_%');
  for(const broken of [{...destinations,id:102},{...destinations,revision:'101'},{...destinations,page:2},{...destinations,search:'other'},{...destinations,rows:[to,to]},{...destinations,hasMore:true}]){
    respond(broken);await assert.rejects(()=>api.transferDestinations('101','100','_%'),e=>e.code==='INVALID_RESPONSE');
  }
  checks.push('Destination GET binds vehicle/revision/search/page, preserves literal wildcard terms and validates bounded unique rows/hasMore');
  respond(review);assert.deepEqual(await api.vehicleTransferPreview('101',input,abort.signal),review);
  assert.equal(calls.at(-1).options.method,'POST');assert(!calls.at(-1).options.headers['Idempotency-Key']);
  assert.deepEqual(JSON.parse(calls.at(-1).options.body),input);
  for(const broken of [{...review,id:102},{...review,revision:'101'},{...review,note:'other'},{...review,toStore:{...to,id:25},after:{status:'in_transit',storeId:25}},
    {...review,effect:'immediate_transfer'},{...review,after:{status:'ready',storeId:23}}]){
    respond(broken);await assert.rejects(()=>api.vehicleTransferPreview('101',input),e=>e.code==='INVALID_RESPONSE');
  }
  const pending={id:2,revision:'101',type:'manual_transfer',fromStoreId:24,toStoreId:23,fromStoreName:from.name,toStoreName:to.name,actorId:8,recordedAt:at,receivable:true};
  for(const action of ['receive','reject','cancel']){
    const wire={action,revision:'101',note:'QA',transfer_event_id:2,transfer_event_revision:'101'};
    const afterStoreId=action==='receive'?23:24;
    const p={...review,action,revision:'101',vehicle:{...vehicle,revision:'101',status:'in_transit',storeId:23},transfer:pending,after:{status:'ready',storeId:afterStoreId,ownerStoreId:afterStoreId},effect:{receive:'received',reject:'rejected',cancel:'cancelled'}[action]};
    assert(dto.isMobileVehicleTransferPreview(p));respond(p);assert.deepEqual(await api.vehicleTransferPreview('101',wire),p);
    respond({...p,transfer:{...pending,revision:'102'}});await assert.rejects(()=>api.vehicleTransferPreview('101',wire),e=>e.code==='INVALID_RESPONSE');
  }
  checks.push('Preview reserves no UUID, binds normalized note/destination or exact dispatch ID/revision and rejects impossible stock transitions for all four actions');
  const recorded={...input,review_snapshot:review.snapshot};respond(proof);
  assert(dto.isMobileVehicleTransferReceipt(proof));assert.deepEqual(await api.recordVehicleTransfer('101',recorded,key),proof);
  assert.equal(calls.at(-1).options.headers['Idempotency-Key'],key);
  for(const broken of [{...proof,id:102},{...proof,requestId:'11223344-5566-4788-99aa-bbccddeeff00'},{...proof,review:{...review,snapshot:'b'.repeat(64)}},
    {...proof,events:[{...proof.events[0],toStoreId:25}]},{...proof,eventsCurrent:false}]){
    respond(broken);await assert.rejects(()=>api.recordVehicleTransfer('101',recorded,key),e=>e.code==='INVALID_RESPONSE');
  }
  respond({receipt:proof});assert.deepEqual((await api.vehicleTransferReceipt(key)).receipt,proof);
  await assert.rejects(()=>api.vehicleTransferReceipt('11223344-5566-4788-99aa-bbccddeeff00'),e=>e.code==='INVALID_RESPONSE');
  const corrected={...proof,vehicleCurrent:false,current:false};respond({receipt:corrected});assert.deepEqual((await api.vehicleTransferReceipt(key)).receipt,corrected);
  respond({receipt:null});assert.equal((await api.vehicleTransferReceipt(key)).receipt,null);
  const resolved={key,operation:'vehicle.transfer:101',status:'committed',receipt:{id:101,revision:'101',replayed:true}};
  respond(resolved);assert.deepEqual(await api.resolveWrite(key,'vehicle.transfer:101'),resolved);
  respond({...resolved,receipt:{...resolved.receipt,id:102}});await assert.rejects(()=>api.resolveWrite(key,'vehicle.transfer:101'),e=>e.code==='INVALID_RESPONSE');
  checks.push('Recording binds UUID, vehicle, action and reviewed snapshot; exact original event proof is required and later-correction flags remain independently readable');
  const legacy=JSON.parse(JSON.stringify(proof));delete legacy.review.vehicle.ownerStoreId;delete legacy.review.vehicle.ownerStoreName;delete legacy.review.after.ownerStoreId;
  const originalLegacy=JSON.stringify(legacy);
  assert(dto.isMobileVehicleTransferReceipt(legacy));respond({receipt:legacy});assert.deepEqual((await api.vehicleTransferReceipt(key)).receipt,legacy);
  assert.equal(JSON.stringify(legacy),originalLegacy);
  respond(legacy.review);await assert.rejects(()=>api.vehicleTransferPreview('101',input),e=>e.code==='INVALID_RESPONSE');
  respond({...data,vehicle:legacy.review.vehicle});await assert.rejects(()=>api.vehicleTransferPreparation('101'),e=>e.code==='INVALID_RESPONSE');
  for(const broken of [{...review,vehicle:{...vehicle,ownerStoreId:undefined}},{...review,vehicle:{...vehicle,ownerStoreName:undefined}},
    {...review,after:{status:'in_transit',storeId:23}},{...review,after:{...review.after,ownerStoreId:24}},
    {...legacy.review,after:review.after}])assert(!dto.isMobileVehicleTransferPreview(broken));
  assert(dto.isMobileVehicleTransferPreview({...review,vehicle:{...vehicle,ownerStoreId:null,ownerStoreName:''}}));
  const mapped=server.mapTransferVehicle({id:101,revision:'100',current_store:24,store_name:from.name,owner_store_id:31,owner_store_name:'Cơ sở sở hữu QA'});
  assert.equal(mapped.storeId,24);assert.equal(mapped.ownerStoreId,31);assert.equal(mapped.ownerStoreName,'Cơ sở sở hữu QA');
  checks.push('New reviews bind distinct actual ownership before and warehouse/owner after; partial or inconsistent ownership fails, fresh APIs reject legacy projections and old original receipts remain unchanged/readable');
  const immediate={...review,vehicle:{...vehicle,status:'using'},after:{status:'using',storeId:23,ownerStoreId:23},effect:'immediate_transfer'};
  const immediateProof={...proof,review:immediate,events:[proof.events[0],{...proof.events[0],id:2,type:'manual_transfer_receive',refId:1}]};
  assert(dto.isMobileVehicleTransferReceipt(immediateProof));
  assert(!dto.isMobileVehicleTransferReceipt({...immediateProof,events:[proof.events[0],{...immediateProof.events[1],refId:3}]}));
  assert(!dto.isMobileVehicleTransferReceipt({...immediateProof,events:[proof.events[0],{...immediateProof.events[1],actorId:8}]}));
  assert(!dto.isMobileVehicleTransferReceipt({...proof,events:[proof.events[0],proof.events[0]]}));
  checks.push('Immediate transfer proof contains exactly two distinct events linked to the dispatch by the same actor; duplicate/mixed-actor/mislinked events fail closed');
  const req=(body,query='',headers={})=>new NextRequest('https://fixture.invalid/transfers'+query,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  for(const bad of [{...input,action:'status'},{...input,note:'a'.repeat(501)},{...input,amount:'1000'},{...input,to_store_id:'23'},{...input,revision:'01'}]){
    assert.throws(()=>server.parseMobileVehicleTransferInput(bad),e=>e.code==='INVALID_TRANSFER');
    await assert.rejects(()=>server.readMobileVehicleTransferPreview(user,'101',req(bad)),e=>e.code==='INVALID_TRANSFER');
    await assert.rejects(()=>writer.recordMobileVehicleTransfer(user,'101',req({...bad,review_snapshot:review.snapshot},'',{'Idempotency-Key':key})),e=>e.code==='INVALID_TRANSFER');
  }
  await assert.rejects(()=>server.readMobileVehicleTransferPreview(user,'101',req(input,'',{'Idempotency-Key':key})),e=>e.code==='INVALID_QUERY');
  for(const query of ['','?revision=100&page=0','?revision=100&page=01','?revision=100&page=10001','?revision=100&limit=100','?revision=100&revision=101']){
    await assert.rejects(()=>server.readMobileTransferDestinations(user,'101',new NextRequest('https://fixture.invalid/destinations'+query)),e=>e.status===400);
  }
  assert.equal(connects,0);
  await assert.rejects(()=>server.readMobileVehicleTransferPreparation(user,'101',new NextRequest('https://fixture.invalid/transfers')),/Expected fixture connection/);
  assert.equal(connects,1);
  checks.push('Strict preflight blocks status/customer/financial injection, malformed revisions/IDs/query and preview UUIDs before DB; the shared fleet entitlement requires no contract or finance grants');
  const result={passed:checks.length,checks,fixtureOnly:true,externalNetworkAllowed:false};
  fs.mkdirSync('.backups',{recursive:true});fs.writeFileSync('.backups/mobile-vehicle-transfers-results.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}
run().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{global.fetch=originalFetch;Object.defineProperty(db.himotoPool,'connect',descriptor);});
