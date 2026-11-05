require('./lib/offline-tests.cjs');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {NextRequest}=require('next/server');
const {load,root}=require('./lib/load-typescript.cjs');
const {createApi}=load(path.resolve(root,'../mobile/src/lib/api'));
const {isMobileReturnPreparation,isMobileReturnPreview}=load(path.resolve(root,'../shared/mobile-returns'));
const server=load(path.join(root,'lib/server/mobile-returns'));
const previewServer=load(path.join(root,'lib/server/mobile-return-preview'));
const settlementServer=load(path.join(root,'lib/server/mobile-return-settlement'));
const writeServer=load(path.join(root,'lib/server/mobile-return-write'));
const {isMobileReturnSettlementPreview}=load(path.resolve(root,'../shared/mobile-return-settlement'));
const {isMobileReturnReceipt}=load(path.resolve(root,'../shared/mobile-return-write'));
const {calculateVehicleReturn,parseReturnInput}=load(path.join(root,'lib/server/contract-returns'));
const db=load(path.join(root,'lib/server/himoto-database'));
const descriptor=Object.getOwnPropertyDescriptor(db.himotoPool,'connect'),originalFetch=global.fetch;
const user={id:7,role:'staff',access_role:'custom',store_id:23,scope_all:false,permissions:['contracts.read','contracts.return']};
const item={id:301,vehicleId:201,name:'Xe QA',license:'QA-201',revision:'100',startsAt:'2026-11-01T08:00:00+07:00',returnAt:'2026-11-03T08:00:00+07:00',completedAt:null,dailyPrice:100000,overdue:false,reconciled:false,available:true,blockedReason:null};
const data={id:101,code:'HD-QA',status:'renting',storeId:23,revision:'100',available:true,blockedReason:null,ownership:false,holdActive:false,completedFromHold:false,
  totalAmount:500000,rentalPaid:100000,rentalRemaining:400000,depositHeld:100000,rentalRefundable:0,items:{page:1,pages:1,total:1,rows:[item]},
  accounts:[{id:1,method:'cash',label:'Két QA'},{id:1,method:'transfer',label:'Cá nhân QA'}],observedAt:'2026-11-02T00:00:00+07:00'};
const checks=[],calls=[];let connects=0;
Object.defineProperty(db.himotoPool,'connect',{configurable:true,value:async()=>{connects++;throw Error('Preflight must not connect');}});
async function run(){
 const api=createApi('https://fixture.invalid','hm1_'+'a'.repeat(43)),abort=new AbortController();
 global.fetch=async(url,options)=>{calls.push({url,options});return Response.json(data);};
 assert.deepEqual(await api.returnPreparation('101',1,abort.signal),data);
 assert.equal(calls[0].url,'https://fixture.invalid/api/mobile/v1/contracts/101/returns?page=1');assert.equal(calls[0].options.method,undefined);
 assert.equal(calls[0].options.credentials,'omit');assert.equal(calls[0].options.redirect,'error');assert.equal(calls[0].options.headers.Authorization,'Bearer hm1_'+'a'.repeat(43));assert(calls[0].options.signal instanceof AbortSignal);
 checks.push('Return preparation is a cancellable origin-bound bearer GET with no browser credentials or redirect and an exact contract/page response');
 for(const broken of [{...data,id:102},{...data,revision:'bad'},{...data,depositHeld:-1},{...data,totalAmount:null},{...data,status:'completed'},
   {...data,items:{...data.items,page:2}},{...data,items:{...data.items,total:2}},{...data,items:{...data.items,rows:[{...item,completedAt:item.returnAt}]}},
   {...data,items:{...data.items,rows:[{...item,returnAt:null}]}},{...data,items:{...data.items,rows:[{...item,revision:'bad'}]}},
   {...data,items:{...data.items,total:2,rows:[item,item]}},{...data,accounts:[...data.accounts,data.accounts[0]]}]){
   global.fetch=async()=>Response.json(broken);await assert.rejects(()=>api.returnPreparation('101'),error=>error.code==='INVALID_RESPONSE');
 }
 checks.push('Mismatched contracts/pages, malformed revisions/money, duplicate line/account identities and returned/missing-date lines advertised as writable are rejected');
 for(const valid of [{...data,ownership:true,holdActive:true},{...data,available:false,blockedReason:'QA review',totalAmount:null,items:{page:1,pages:1,total:0,rows:[]}},
   {...data,status:'completed',available:false,blockedReason:'QA completed',items:{...data.items,rows:[{...item,completedAt:item.returnAt,available:false,blockedReason:'Returned QA'}]}}])assert(isMobileReturnPreparation(valid));
 checks.push('Ownership/hold context remains explicit; unavailable balances, empty history and already-returned lines retain clear read-only business gates');
 const request=query=>new NextRequest('https://fixture.invalid/api/mobile/v1/contracts/101/returns'+query);
 for(const permissions of [['contracts.read','finance.write'],['contracts.read'],['contracts.return']])
   await assert.rejects(()=>server.readMobileReturnPreparation({...user,permissions},'101',request('')),error=>error.status===403);
 for(const query of ['?page=0','?page=1&page=2','?page=100001','?page=1.5','?limit=100','?returned_at=2026-11-02'])
   await assert.rejects(()=>server.readMobileReturnPreparation(user,'101',request(query)),error=>error.status===400);
 await assert.rejects(()=>server.readMobileReturnPreparation(user,'bad',request('')),error=>error.status===400);assert.equal(connects,0);
 checks.push('Return/read grants, bounded canonical pagination and unsupported preview filters fail before DB access; finance grants do not imply vehicle-return permission');
 const line={item_id:301,item_revision:'100',returned_at:'2026-11-01T17:00',hourly_rate:'20000',repair_fee:'25000',repair_note:'QA repair'};
 const input={revision:'100',items:[line]},review={phase:'fees',id:101,code:'HD-QA',revision:'100',snapshot:'a'.repeat(64),ownership:false,
   items:[{id:301,vehicleId:201,revision:'100',name:'Xe QA',license:'QA-201',returnAt:'2026-11-01T08:00:00+07:00',returnedAt:'2026-11-01T17:00:00+07:00',
     lateMinutes:540,chargeableHours:9,lateDays:1,lateHours:0,hourlyRate:20000,dailyPrice:100000,suggestedLateFee:100000,lateFee:100000,repairFee:25000,repairNote:'QA repair',earlyDiscount:0,fee:125000,overridden:false}],
   before:{totalAmount:500000,rentalPaid:100000,rentalRemaining:400000,depositHeld:100000,rentalRefundable:0},
   after:{totalAmount:625000,rentalPaid:100000,rentalRemaining:525000,depositHeld:100000,rentalRefundable:0,remainingItems:0,closesRental:true,depositRefundEligible:false,status:'wait_payment'},
   totals:{lateFee:100000,repairFee:25000,earlyDiscount:0,fee:125000},observedAt:'2026-11-02T00:00:00+07:00'};
 global.fetch=async(url,options)=>{calls.push({url,options});return Response.json(review);};
 assert.deepEqual(await api.returnPreview('101',input,abort.signal),review);
 const previewCall=calls.at(-1);assert.equal(previewCall.url,'https://fixture.invalid/api/mobile/v1/contracts/101/returns/preview');
 assert.equal(previewCall.options.method,'POST');assert.deepEqual(JSON.parse(previewCall.options.body),input);assert(!previewCall.options.headers['Idempotency-Key']);
 assert.equal(previewCall.options.credentials,'omit');assert.equal(previewCall.options.redirect,'error');assert(previewCall.options.signal instanceof AbortSignal);
 checks.push('Fee preview posts bounded explicit selections through bearer/no cookies/no redirects, supports cancellation and reserves no write UUID');
 for(const broken of [{...review,phase:'settlement'},{...review,id:0},{...review,revision:'bad'},{...review,snapshot:'bad'},
   {...review,totals:{...review.totals,fee:0}},{...review,after:{...review.after,depositRefundEligible:true}},
   {...review,after:{...review.after,totalAmount:625001,rentalRemaining:525001}},{...review,after:{...review.after,rentalPaid:100001,rentalRemaining:524999}},
   {...review,items:[{...review.items[0],lateHours:9}]},{...review,items:[review.items[0],review.items[0]]}])assert.equal(isMobileReturnPreview(broken),false);
 for(const broken of [{...review,id:102},{...review,revision:'101'}]){
   global.fetch=async()=>Response.json(broken);await assert.rejects(()=>api.returnPreview('101',input),error=>error.code==='INVALID_RESPONSE');
 }
 for(const changed of [{...line,repair_note:'Another QA'},{...line,hourly_rate:'30000'},{...line,repair_fee:'20000'},
   {...line,early_discount:'1000'},{...line,fee_override:'100000'},{...line,returned_at:'2026-11-01T17:01'},
   {...line,item_revision:'101'},{...line,item_id:302}]){
   global.fetch=async()=>Response.json(review);await assert.rejects(()=>api.returnPreview('101',{...input,items:[changed]}),error=>error.code==='INVALID_RESPONSE');
 }
 checks.push('Preview validates fee arithmetic, late-day/hour boundaries, unchanged money and deposit gates; client binds contract/revisions, selected dates, rates, overrides, discounts, repairs and notes');
 const context={startsAt:'2026-10-01T00:00:00+07:00',returnAt:'2026-11-01T00:00:00+07:00',dailyPrice:100000,baseTotal:500000,paid:0,plan:null};
 const calc=(returned_at,extra={},ctx={})=>calculateVehicleReturn({...context,...ctx},parseReturnInput({...line,returned_at,repair_fee:'0',repair_note:'',...extra}));
 for(const [at,minutes,days,hours,amount] of [['00:00',0,0,0,0],['00:01',1,0,1,20000],['08:00',480,0,8,160000],['08:01',481,1,0,100000]]){
   const calculated=calc('2026-11-01T'+at);assert.equal(calculated.lateMinutes,minutes);assert.deepEqual(calculated.suggested,{days,hours,amount});assert.equal(calculated.storedTotalAfter,500000+amount);
 }
 assert.deepEqual(calc('2026-11-01T00:00',{}, {returnAt:'2026-10-31T00:00:00+07:00'}).suggested,{days:1,hours:0,amount:100000});
 assert.throws(()=>calc('2026-11-01T08:01',{}, {dailyPrice:null}),error=>error.status===409);
 assert.equal(calc('2026-11-01T08:01',{fee_override:'50000'},{dailyPrice:null}).fee,50000);
 assert.equal(calc('2026-10-31T12:00',{early_discount:'100000',repair_fee:'25000'}).storedTotalAfter,425000);
 checks.push('Writer/shared calculation covers zero/one minute, exactly eight hours, eight hours plus one minute, 24 hours, unknown daily prices with explicit override, repairs and signed early-return reductions');
 assert.throws(()=>calc('2026-11-01T00:00',{fee_override:'1'}));assert.throws(()=>calc('2026-11-01T08:00',{early_discount:'1'}));
 assert.throws(()=>calc('2026-10-31T12:00',{early_discount:'500001'}));assert.throws(()=>calc('2026-11-01T00:00',{}, {startsAt:'2026-11-02T00:00:00+07:00'}));
 const plan={version:1,start:'2026-10-01T00:00',end:'2026-12-01T00:00',interval:'month',amount:100000};
 assert.throws(()=>calc('2026-10-31T12:00',{early_discount:'1'},{plan}),error=>error.status===409);
 assert.throws(()=>calc('2026-10-31T12:00',{}, {plan:{...plan,start:'2026-11-01T00:00'}}),error=>error.status===409);
 const ownership=calc('2026-11-01T08:00',{}, {plan});assert.equal(ownership.storedTotalAfter,660000);assert.equal(ownership.nextTotal,760000);
 checks.push('Return calculation rejects pre-start dates, inappropriate overrides/discounts, negative totals and ownership early-discount shortcuts; stored ownership base stays separate from accrued installments');
 const previewRequest=(body,query='')=>new NextRequest('https://fixture.invalid/api/mobile/v1/contracts/101/returns/preview'+query,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 for(const permissions of [['contracts.read','finance.write'],['contracts.read'],['contracts.return']])
   await assert.rejects(()=>previewServer.readMobileReturnPreview({...user,permissions},'101',previewRequest(input)),error=>error.status===403);
 for(const body of [{...input,settlements:[]},{...input,revision:'0'},{revision:'100'}, {...input,items:[]}, {...input,items:[line,line]},
   {...input,items:Array.from({length:51},(_,i)=>({...line,item_id:301+i}))},{...input,items:[{...line,returned_at:'2026-02-30T10:00'}]},
   {...input,items:[{...line,request_id:'unexpected'}]}])await assert.rejects(()=>previewServer.readMobileReturnPreview(user,'101',previewRequest(body)),error=>error.status===400);
 await assert.rejects(()=>previewServer.readMobileReturnPreview(user,'101',previewRequest(input,'?page=1')),error=>error.status===400);
 assert.equal(connects,0);
 checks.push('Preview permission, strict payload allowlist, contract revision, 1–50 unique lines, real dates and unsupported query fail before DB access; settlements cannot slip into fee-only review');
 const settlementInput={...input,fee_snapshot:review.snapshot,settlement:{receipts:[{kind:'repair_fee',amount:'525000',method:'cash',account_id:1,paid_at:line.returned_at}],refund:{amount:'100000',method:'cash',account_id:1,paid_at:line.returned_at}}};
 const settled={phase:'settlement',id:101,revision:'100',snapshot:'b'.repeat(64),fees:review,settlement:settlementInput.settlement,
   payments:[{...settlementInput.settlement.receipts[0],label:'Két QA',totalIncrease:0},{...settlementInput.settlement.refund,kind:'deposit_refund',label:'Két QA',totalIncrease:0}],
   totals:{income:525000,rentalRefund:0,depositRefund:100000,totalIncrease:0},overpayment:false,overpaymentAcknowledged:false,
   after:{...review.after,rentalPaid:625000,rentalRemaining:0,depositHeld:0,status:'completed'},observedAt:review.observedAt};
 assert(isMobileReturnSettlementPreview(settled));
 global.fetch=async(url,options)=>{calls.push({url,options});return Response.json(settled);};
 assert.deepEqual(await api.returnSettlementPreview('101',settlementInput,abort.signal),settled);
 const settlementCall=calls.at(-1);assert.equal(settlementCall.url,'https://fixture.invalid/api/mobile/v1/contracts/101/returns/settlement-preview');
 assert.equal(settlementCall.options.method,'POST');assert.deepEqual(JSON.parse(settlementCall.options.body),settlementInput);
 assert.equal(settlementCall.options.credentials,'omit');assert.equal(settlementCall.options.redirect,'error');assert(!settlementCall.options.headers['Idempotency-Key']);
 assert(settlementCall.options.signal instanceof AbortSignal);
 checks.push('Settlement review binds fee fingerprint and actual receipts/refunds through cancellable bearer POST; no write UUID, browser credentials or redirect');
 for(const broken of [{...settled,id:102},{...settled,fees:{...review,id:102}},{...settled,revision:'101'},{...settled,snapshot:'bad'},
   {...settled,overpayment:true},{...settled,totals:{...settled.totals,income:1}},{...settled,after:{...settled.after,depositHeld:1}},
   {...settled,after:{...settled.after,rentalPaid:625001}},{...settled,payments:settled.payments.slice(1)},
   {...settled,payments:[{...settled.payments[0],account_id:2},settled.payments[1]]}]){
   global.fetch=async()=>Response.json(broken);await assert.rejects(()=>api.returnSettlementPreview('101',settlementInput),e=>e.code==='INVALID_RESPONSE');
 }
 for(const changed of [{...settlementInput,fee_snapshot:'f'.repeat(64)},{...settlementInput,acknowledge_overpayment:true},
   {...settlementInput,items:[{...line,repair_note:'Changed QA'}]},
   {...settlementInput,settlement:{...settlementInput.settlement,receipts:[{...settlementInput.settlement.receipts[0],method:'transfer'}]}},
   {...settlementInput,settlement:{...settlementInput.settlement,refund_deferred:true,refund:undefined}}]){
   global.fetch=async()=>Response.json(settled);await assert.rejects(()=>api.returnSettlementPreview('101',changed),e=>e.code==='INVALID_RESPONSE');
 }
 checks.push('Settlement DTO/client reject mismatched fee selections, accounts/methods, acknowledgement, receipt/refund intent, malformed money and broken final balance arithmetic');
 for(const body of [{...settlementInput,request_id:'forbidden'},{...settlementInput,fee_snapshot:'bad'},
   {...settlementInput,acknowledge_overpayment:false},{...settlementInput,settlement:{...settlementInput.settlement,refund_deferred:true}},
   {...settlementInput,settlement:{receipts:[{...settlementInput.settlement.receipts[0],request_id:'forbidden'}]}},
   {...settlementInput,settlement:{receipts:[{...settlementInput.settlement.receipts[0],amount:'0'}]}},
   {...settlementInput,settlement:{receipts:Array.from({length:51},()=>settlementInput.settlement.receipts[0])}},
   {...settlementInput,settlement:{receipts:[],refund_recipient:{account:'000123456'}}}])
   await assert.rejects(()=>settlementServer.readMobileReturnSettlementPreview(user,'101',previewRequest(body)),e=>e.status===400);
 for(const permissions of [['contracts.read','finance.write'],['contracts.read'],['contracts.return']])
   await assert.rejects(()=>settlementServer.readMobileReturnSettlementPreview({...user,permissions},'101',previewRequest(settlementInput)),e=>e.status===403);
 await assert.rejects(()=>settlementServer.readMobileReturnSettlementPreview(user,'101',previewRequest(settlementInput,'?page=1')),e=>e.status===400);
 assert.equal(connects,0);
 checks.push('Settlement strict allowlists, 0–50 receipts, positive amounts, mutually exclusive refund intent, return grants and query validation fail before DB access');
 const parent='00000000-0000-4000-8000-000000000001',child1='00000000-0000-4000-8000-000000000002',child2='00000000-0000-4000-8000-000000000003';
 const recordInput={...settlementInput,settlement_snapshot:settled.snapshot},proof={id:101,revision:'101',requestId:parent,replayed:false,review:settled,recordedAt:review.observedAt,
   returnedItems:[{id:301,vehicleId:201,revision:'101',returnedAt:review.items[0].returnedAt}],
   transactions:[{id:901,requestId:child1,revision:'101',paymentRevision:'101',kind:'repair_fee',amount:525000,method:'cash',accountId:1,paidAt:review.items[0].returnedAt},
     {id:902,requestId:child2,revision:'101',paymentRevision:'101',kind:'deposit_refund',amount:100000,method:'cash',accountId:1,paidAt:review.items[0].returnedAt}],
   current:true,contractCurrent:true,itemsCurrent:true,paymentsCurrent:true};
 assert(isMobileReturnReceipt(proof));
 global.fetch=async(url,options)=>{calls.push({url,options});return Response.json(proof);};
 assert.deepEqual(await api.recordReturn('101',recordInput,parent),proof);
 const writeCall=calls.at(-1);assert.equal(writeCall.url,'https://fixture.invalid/api/mobile/v1/contracts/101/returns');
 assert.equal(writeCall.options.method,'POST');assert.equal(writeCall.options.headers['Idempotency-Key'],parent);assert.deepEqual(JSON.parse(writeCall.options.body),recordInput);
 global.fetch=async()=>Response.json({receipt:proof});assert.deepEqual((await api.returnReceipt(parent)).receipt,proof);
 global.fetch=async()=>Response.json({receipt:null});assert.equal((await api.returnReceipt(parent)).receipt,null);
 checks.push('Return write sends only the parent UUID and reviewed fee/settlement intent; dedicated recovery binds that exact request and supports a missing receipt without inventing success');
 for(const broken of [{...proof,requestId:child1},{...proof,id:102},{...proof,revision:'bad'},{...proof,review:{...settled,snapshot:'c'.repeat(64)}},
   {...proof,returnedItems:[{...proof.returnedItems[0],vehicleId:202}]},{...proof,returnedItems:[]},
   {...proof,transactions:proof.transactions.slice(1)},{...proof,transactions:[{...proof.transactions[0],amount:1},proof.transactions[1]]},
   {...proof,transactions:[{...proof.transactions[0],requestId:parent},proof.transactions[1]]},
   {...proof,transactions:[proof.transactions[0],{...proof.transactions[1],id:901}]},{...proof,paymentsCurrent:false},
   {...proof,review:{...settled,overpayment:true}}]){
   global.fetch=async()=>Response.json(broken);await assert.rejects(()=>api.recordReturn('101',recordInput,parent),e=>e.code==='INVALID_RESPONSE');
 }
 const corrected={...proof,replayed:true,paymentsCurrent:false,current:false};assert(isMobileReturnReceipt(corrected));
 global.fetch=async()=>Response.json({receipt:corrected});assert.equal((await api.returnReceipt(parent)).receipt.current,false);
 global.fetch=async()=>Response.json({receipt:proof});await assert.rejects(()=>api.returnReceipt(child1),e=>e.code==='INVALID_RESPONSE');
 checks.push('Immutable return proof validates every original vehicle/date and exact child receipt amount/method/account/UUID; malformed bindings fail closed while later corrections retain their original proof');
 const writeRequest=(body,key=parent)=>new NextRequest('https://fixture.invalid/api/mobile/v1/contracts/101/returns',
   {method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(body)});
 for(const permissions of [['contracts.read','finance.write','contracts.finalize'],['contracts.read'],['contracts.return']])
   await assert.rejects(()=>writeServer.recordMobileReturn({...user,permissions},'101',writeRequest(recordInput)),e=>e.status===403);
 for(const body of [{...recordInput,settlement_snapshot:undefined},{...recordInput,settlement_snapshot:'bad'},{...recordInput,child_keys:[child1]},
   {...recordInput,settlement:{receipts:[{...recordInput.settlement.receipts[0],request_id:child1}]}}])
   await assert.rejects(()=>writeServer.recordMobileReturn(user,'101',writeRequest(body)),e=>e.status===400);
 await assert.rejects(()=>writeServer.recordMobileReturn(user,'101',writeRequest(recordInput,'bad')),e=>e.status===400);
 await assert.rejects(()=>writeServer.readMobileReturnReceipt(user,'bad'),e=>e.status===400);assert.equal(connects,0);
 checks.push('Return writer preflight rejects unreviewed snapshots, injected child UUIDs/fields, wrong grants and malformed keys before DB access');
 const result={passed:checks.length,checks,operationalWrites:0,limitations:['Client/parser/calculation/receipt covered offline; SQL transaction/replay tests reported separately; editor and native return certification remain unfinished'],completedAt:new Date().toISOString()};
 fs.mkdirSync('.backups',{recursive:true});fs.writeFileSync('.backups/mobile-return-preview-results.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}
run().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{global.fetch=originalFetch;if(descriptor)Object.defineProperty(db.himotoPool,'connect',descriptor);else delete db.himotoPool.connect;});
