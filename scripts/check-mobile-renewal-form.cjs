require('./lib/offline-tests.cjs');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {load,root}=require('./lib/load-typescript.cjs');
const {reviewRenewal,renewalSuggestion}=load(path.resolve(root,'../mobile/src/lib/renewal-form'));
const item={id:301,vehicleId:3,name:'Xe QA',license:'QA-003',revision:'11',returnAt:'2026-11-02T08:00:00+07:00',dailyPrice:100000,renewalAmount:0};
const data={id:101,code:'HD-QA',status:'renting',storeId:23,revision:'100',available:true,blockedReason:null,nextVersion:9,totalAmount:500000,rentalPaid:100000,rentalRemaining:400000,
  items:{page:1,pages:1,total:1,rows:[item]},accounts:[{id:1,method:'cash',label:'Két QA'},{id:1,method:'transfer',label:'Cá nhân QA'},{id:2,method:'company_transfer',label:'Công ty QA'}],
  evidence:{requiredForCollection:true,slot:'renewal-9-document-1',present:true},observedAt:'2026-11-01T00:00:00Z'};
const now=Date.parse('2026-11-01T08:00:00+07:00');
const form={returnAt:'2026-11-03T08:00',amount:'80000',outsideAmount:'20000',outsideName:' Phí QA ',note:' QA ',collected:true,method:'cash',account:'cash:1',paidAt:'2026-11-01T08:00',reviewedBill:{version:9,revision:'199'}};
const checks=[];
assert.equal(renewalSuggestion(item,'2026-11-03T08:00'),100000);assert.equal(renewalSuggestion(item,'2026-11-03T08:01'),200000);
assert.equal(renewalSuggestion(item,'2026-11-02T08:01'),100000);assert.equal(renewalSuggestion(item,'2026-11-02T08:00'),null);
assert.equal(renewalSuggestion({...item,dailyPrice:null},form.returnAt),null);
assert.equal(renewalSuggestion({...item,returnAt:null},form.returnAt),null);
checks.push('The daily suggestion rounds each started extension day consistently, keeps exact minute boundaries and never invents a fee for unknown price/date');
const reviewed=reviewRenewal(data,item,form,now);
assert.deepEqual(reviewed,{item_id:301,item_revision:'11',order_revision:'100',expected_version:9,return_at:form.returnAt,amount:'80000',note:'QA\nPhí thu thêm: Phí QA 20.000 đ (thu ngoài, không cộng tiền hợp đồng)',expected_amount:'100000',
  outside_amount:'20000',outside_name:'Phí QA',receipt:{method:'cash',account_id:1,paid_at:form.paidAt},bill_revision:'199'});
const unpaid=reviewRenewal(data,item,{...form,collected:false,reviewedBill:null,paidAt:'bad',account:''},now);
assert(!('receipt' in unpaid));assert(!('bill_revision' in unpaid));assert.equal(unpaid.amount,'80000');
assert.equal(reviewRenewal(data,item,{...form,amount:'0'},now).amount,'0');
checks.push('Review preserves all three revisions and the prepared version, trims notes, allows an explicit agreed fee, distinguishes unpaid extensions and supports outside-only collection');
for(const patch of [{reviewedBill:null},{reviewedBill:{version:8,revision:'199'}},{reviewedBill:{version:9,revision:'bad'}},{method:'cash',account:'transfer:1'},
  {method:'company_transfer',account:'company_transfer:2'},{paidAt:'2026-11-01T08:06'},{amount:'0',outsideAmount:'0'}])assert.throws(()=>reviewRenewal(data,item,{...form,...patch},now));
checks.push('Collection requires a bill reviewed for the exact version, method-qualified account, valid paid time and positive income; company accounts cannot receive outside fees');
for(const patch of [{returnAt:'2026-02-30T08:00'},{returnAt:'2026-11-02T08:00'},{amount:'-1'},{amount:'1.5'},{outsideName:''},{note:'x'.repeat(2001)},
  {amount:'9999999999999',outsideAmount:'1'}])assert.throws(()=>reviewRenewal(data,item,{...form,...patch},now));
assert.throws(()=>reviewRenewal({...data,available:false,blockedReason:'QA hold'},item,form,now),/QA hold/);
assert.throws(()=>reviewRenewal(data,null,form,now));assert.throws(()=>reviewRenewal({...data,totalAmount:null},item,form,now));
checks.push('Invalid/non-extending dates, malformed/overflowing money, missing vehicles, blocked contracts and oversized/missing text fail before reserving a write key');
const historical={...data,backfill:true},lateItem={...item,startedAt:'2026-10-01T08:00:00+07:00',completedAt:'2026-11-04T08:00:00+07:00'};
const late={...form,collected:false,occurredAt:'2026-11-04T07:00'};
assert.equal(reviewRenewal(historical,lateItem,late,Date.parse('2026-11-05T08:00+07:00')).occurred_at,late.occurredAt);
for(const occurredAt of ['2026-09-30T08:00','2026-11-04T09:00','2026-11-06T08:00'])assert.throws(()=>reviewRenewal(historical,lateItem,{...late,occurredAt},Date.parse('2026-11-05T08:00+07:00')));
checks.push('Pulled late-renewal rule allows recording after scheduled new return but still enforces actual rental start, completion and server-time bounds');
const result={passed:checks.length,checks,operationalWrites:0,completedAt:new Date().toISOString()};
fs.mkdirSync('.backups',{recursive:true});fs.writeFileSync('.backups/mobile-renewal-form-results.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
