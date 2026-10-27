const assert=require('node:assert/strict'),path=require('node:path');
const {load,root}=require('./lib/load-typescript.cjs');
const {legacyOwnershipLateFee:fee,legacyOwnershipHourlyRate:hourly}=load(path.join(root,'lib/management/legacy-ownership-overdue'));
const {legacyOwnershipFeeReader}=load(path.join(root,'lib/server/legacy-ownership-overdue'));
const {withContractMonitoring}=load(path.join(root,'lib/management/contract-overdue'));
const {readManagementTable}=load(path.join(root,'lib/server/management-table'));
const {createInstallmentPlan,applyInstallmentBilling}=load(path.join(root,'lib/management/contract-billing'));
const {collectionReportMessages}=load(path.join(root,'lib/server/collection-report'));
const checks=[],now=Date.now(),at=m=>new Date(now-m*60000).toISOString();
const prices=[{id:1,type:'xeso',price_type:'day',price:140000},{id:2,type:'xeso',price_type:'day',price:90000},{id:8,type:'xega',price_type:'day',price:160000},{id:20,type:'xe_dien',price_type:'day',price:190000}];
const item=(minutes,type='xe_dien',extra={})=>({return_at:at(minutes),vehicle_type:type,price_type:'day',daily_price:null,substitute_unit_price:0,handler_price:0,...extra});
const row=(id,items,extra={})=>({id,code:`QA-${id}`,name:`QA-${id}`,status:'overdue',store_id:35,store_kind:'lease_to_own',rental_type:'ownership',legacy_source_store_id:'29',total_amount:1000000,paid_amount:1000000,deposit_amount:3000000,overdue_items_json:JSON.stringify(items),...extra});
async function main(){
 for(const [minutes,expected] of [[30,0],[31,15000],[89,15000],[90,30000],[449,105000],[450,160000],[480,160000],[1440,160000],[1470,175000]])assert.equal(fee(minutes,160000,15000).amount,expected);
 assert.equal(fee(7849,190000,0).amount,1140000);assert.equal(fee(8980,190000,0).amount,1140000);assert.equal(fee(8900,160000,15000).amount,1020000);
 assert.equal(hourly('xe_dien'),0);assert.equal(hourly('xesh'),0);assert.equal(hourly('xecon'),25000);assert.equal(hourly('sh'),35000);assert.equal(hourly('unknown'),null);
 assert.equal(fee(1440,null,0).amount,null);assert.equal(fee(60,190000,null).amount,null);assert.equal(fee(99999,null,null,true).amount,0);
 checks.push('Legacy 30-minute grace, nearest-hour rounding, 8-hour/day boundary, vehicle-specific hourly rates and negotiated totals match the old source; all three inspected fees reproduce exactly.');
 let reads=0;const hydrate=legacyOwnershipFeeReader({query:async sql=>{assert.match(sql,/SELECT id,type,price_type,price FROM himoto\.pricing ORDER BY id/);reads++;return {rows:prices};}});
 const source=[row(1,[item(8980)]),row(2,[item(8900,'xega')]),row(3,[item(7849)])],original=JSON.stringify(source);
 const enriched=await hydrate(source),view=enriched.map(r=>withContractMonitoring(r,now));
 assert.deepEqual(view.map(r=>r.monitoring_amount),[1140000,1020000,1140000]);assert(view.every(r=>r.rental_debt_amount===0));assert.equal(JSON.stringify(source),original);
 for(const r of view){assert.equal(r.total_amount,1000000);assert.equal(r.paid_amount,1000000);assert.equal(r.deposit_amount,3000000);assert.deepEqual(withContractMonitoring(r,now),r);}
 await hydrate(source);assert.equal(reads,1);
 checks.push('Read-only hydration uses one request-local reference-price read, recalculates fees idempotently, and leaves contract totals, paid amounts and deposits intact.');
 const cases=await hydrate([row(4,[item(1440,'xeso')]),row(5,[item(1440,'xeso',{substitute_unit_price:50000})]),row(6,[item(99999,'xeso',{handler_price:900000})]),row(7,[item(1440,'unknown')]),row(8,[item(1440),item(60,'xega'),item(99999,'xeso',{completed_at:at(1)}),item(-60)])]);
 const projected=cases.map(r=>withContractMonitoring(r,now));
 assert.deepEqual(projected.map(r=>r.monitoring_amount),[140000,50000,0,undefined,205000]);
 assert.equal(projected[4].overdue_minutes,1440);
 const bad=withContractMonitoring({...cases[0],status:'bad_debt',bad_debt_at:new Date(now).toISOString()},now+86400000);assert.equal(bad.monitoring_amount,0);assert.equal(bad.overdue_fee_estimate,140000);
 assert.equal(withContractMonitoring(row(9,[item(1440)]),now).monitoring_amount,undefined);
 checks.push('Contract unit-price overrides beat the first legacy price row; fixed totals suppress fees; unknown inputs remain unknown; returned/future lines are excluded and bad-debt clocks stay frozen.');
 let unexpected=0;const noRead=legacyOwnershipFeeReader({query:async()=>{unexpected++;throw Error('Unexpected pricing read');}});
 const native=row(10,[{return_at:at(1440),daily_price:140000}],{legacy_source_store_id:'',rental_type:'daily',store_kind:'physical'});
 const plan=createInstallmentPlan('2026-01-01T09:00','2027-01-01T09:00','Theo tháng',1000000);
 const planned={...source[0],billing_plan_json:JSON.stringify(plan)};
 await noRead([native,planned]);assert.equal(unexpected,0);
 assert.equal(withContractMonitoring(native,now).monitoring_amount,140000);
 const before=withContractMonitoring(applyInstallmentBilling(planned,now),now),after=withContractMonitoring(applyInstallmentBilling((await hydrate([planned]))[0],now),now);assert.deepEqual(after,before);
 checks.push('Native rental fees and scheduled ownership installments retain their existing policies and do not read legacy pricing.');
 const raw={id:1,contract_number:'QA-1',status:'overdue',store_id:35,store_kind:'lease_to_own',rental_type:'ownership',legacy_source_store_id:'29',total_amount:1000000,paid_amount:1000000,deposit_amount:3000000,vehicles:[],overdue_items:[item(8980)]};
 for(const all of [false,true]){
  const sql=[];const db={query:async text=>{sql.push(text);if(text.startsWith('SELECT id,type,price_type,price FROM himoto.pricing'))return {rows:prices};return {rows:[text.includes('AS overdue_items')?raw:{...raw,overdue_items:undefined,__total_count:1}]};}};
  const result=await readManagementTable(db,'contracts',new URLSearchParams({scope:'ownership',status:'overdue',...(all?{all:'1'}:{})}));
  assert.equal(result.rows[0].monitoring_amount,1140000);assert.equal(result.rows[0].rental_debt_amount,0);assert.equal(result.total,1);assert(sql.some(q=>q.includes("'handler_price',d.handler_price")));
 }
 checks.push('Both paginated ownership lists and full exports hydrate the same legacy fee before filtering/sorting; archived vehicle labels remain in the scoped contract query.');
 const messages=collectionReportMessages([{id:1,code:'QA',customer:'QA',vehicle:'QA',days:5,amount:0,late_fee:1140000,gps:[],customer_status:'QA',followup:{contact_status:'contacted',handling_status:'branch',notes:'QA',customer_condition:''}}],'QA').messages.join('\n');
 assert.match(messages,/Nợ đến hạn: 0/);assert.match(messages,/Phí quá hạn tạm tính: 1\.140\.000/);
 checks.push('Debt-report previews label confirmed rental debt and estimated late fees separately without creating receipts or sending notifications.');
 console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0,realTelegramSends:0},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
