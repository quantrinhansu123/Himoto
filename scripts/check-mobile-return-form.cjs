require('./lib/offline-tests.cjs');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {load,root}=require('./lib/load-typescript.cjs');
const form=load(path.resolve(root,'../mobile/src/lib/return-form'));
const {parseReturnInput}=load(path.join(root,'lib/server/contract-returns'));
const {parseMobileReturnSettlement}=load(path.join(root,'lib/server/mobile-return-settlement'));
const checks=[],now=Date.parse('2026-11-02T03:00:00Z');
const vehicle={id:301,vehicleId:201,name:'Xe QA',license:'QA-201',revision:'100',startsAt:'2026-10-10T08:00:00+07:00',returnAt:'2026-10-15T08:00:00+07:00',completedAt:null,dailyPrice:100000,available:true,blockedReason:null};
const preparation={id:101,revision:'100',available:true,blockedReason:null,ownership:false,accounts:[{id:1,method:'cash',label:'Két QA'},{id:1,method:'transfer',label:'Cá nhân QA'},{id:2,method:'company_transfer',label:'Công ty QA'}]};
const line={...form.newReturnLine(vehicle,now),returnedAt:'2026-10-15T09:00',repairFee:'00030000',repairNote:' QA sửa chữa ',lateOverride:'0'};
const selected=form.returnFeeInput(preparation,[line],now);
assert.deepEqual(parseReturnInput(selected.items[0]),selected.items[0]);
assert.equal(selected.items[0].repair_fee,'30000');assert.equal(selected.items[0].repair_note,'QA sửa chữa');assert.equal(selected.items[0].fee_override,'0');
const multi=form.returnFeeInput(preparation,[line,{...line,vehicle:{...vehicle,id:326,vehicleId:226}}],now);
assert.deepEqual(multi.items.map(row=>row.item_id),[301,326]);
assert.throws(()=>form.returnFeeInput(preparation,[],now));assert.throws(()=>form.returnFeeInput(preparation,[line,line],now));
assert.throws(()=>form.returnFeeInput(preparation,Array.from({length:51},(_,i)=>({...line,vehicle:{...vehicle,id:100+i}})),now));
checks.push('Explicit selected lines retain revisions across pages and normalize whole-VND values/repair notes into inputs accepted by the shared return parser; empty/duplicate/over-limit selections fail');
for(const patch of [{returnedAt:'2026-10-09T08:00'},{returnedAt:'2026-02-30T08:00'},{returnedAt:'2026-11-03T08:00'},
  {hourlyRate:'5000001'},{hourlyRate:''},{repairFee:'-1'},{earlyDiscount:'1.5'},{repairNote:'x'.repeat(1001)},
  {returnedAt:'2026-10-15T08:00',lateOverride:'0'},{earlyDiscount:'1'}])
  assert.throws(()=>form.returnFeeInput(preparation,[{...line,...patch}],now));
assert.throws(()=>form.returnFeeInput({...preparation,available:false,blockedReason:'Review QA'},[line],now),/Review QA/);
assert.throws(()=>form.returnFeeInput(preparation,[{...line,vehicle:{...vehicle,available:false}}],now));
assert.throws(()=>form.returnFeeInput({...preparation,ownership:true},[{...line,returnedAt:'2026-10-14T08:00',lateOverride:'',earlyDiscount:'1'}],now));
checks.push('Invalid/future/pre-start dates, wrong override/early-discount timing, unavailable lines, ownership discounts and malformed/out-of-range fee values cannot reach preview');
const fees={id:101,revision:'100',snapshot:'a'.repeat(64),after:{depositHeld:100000}};
const money={...form.emptyReturnMoney(now),amount:'00020000',account:'1',paidAt:'2026-10-15T09:00'};
const intent=form.returnSettlementInput(preparation,fees,selected,[{...money,kind:'late_fee'}],{...money,method:'transfer',recipientAccount:' 000.123 456 ',bank:' QA bank '},null,true,now);
assert.equal(intent.settlement.receipts[0].amount,'20000');assert.equal(intent.settlement.rental_refund.recipient_account,'000123456');
assert.equal(intent.settlement.refund_deferred,true);assert.equal(intent.acknowledge_overpayment,true);assert.deepEqual(parseMobileReturnSettlement(intent),intent);
for(const patch of [{account:'2'},{method:'company_transfer'},{amount:'0'},{amount:'99999999999999'},{paidAt:'2026-11-03T08:00'}])
  assert.throws(()=>form.returnSettlementInput(preparation,fees,selected,[{...money,kind:'late_fee',...patch}],null,null,false,now));
assert.throws(()=>form.returnSettlementInput(preparation,fees,selected,[],{...money,method:'transfer',recipientAccount:'bad/$$'},null,false,now));
assert.throws(()=>form.returnSettlementInput({...preparation,revision:'101'},fees,selected,[],null,null,false,now));
const noRefund=form.returnSettlementInput(preparation,{...fees,after:{depositHeld:0}},selected,[],null,null,false,now);
assert.deepEqual(noRefund.settlement,{receipts:[]});
checks.push('Actual income/refund intent validates method-qualified accounts, positive whole amounts, dates and recipients; omitted deposit refund is explicitly deferred while stale fee revision requires review');
const result={passed:checks.length,checks,operationalWrites:0,completedAt:new Date().toISOString()};
fs.mkdirSync('.backups',{recursive:true});fs.writeFileSync('.backups/mobile-return-form-results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
