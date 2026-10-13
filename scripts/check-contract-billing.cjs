const assert = require('node:assert/strict');
const path = require('node:path');
const {load, root} = require('./lib/load-typescript.cjs');
const billing = load(path.join(root, 'lib/management/contract-billing'));
const at = value => Date.parse(`${value}:00+07:00`);
const start = '2026-10-13T09:00', end = '2027-10-13T09:00';
const checks = [];
const plan = billing.createInstallmentPlan(start, end, 'Theo tháng', 3_000_000);
assert.equal(billing.rentalPeriodCount(start, end, 'month'), 12);
assert.equal(billing.rentalPeriodCount('2023-10-13T09:00', '2024-10-13T09:00', 'month'), 12);
assert.equal(billing.installmentSchedule(plan).length, 12);
assert.equal(billing.installmentSchedule(plan).at(-1).due_at, '2027-09-13T09:00');
checks.push('365/366-day years have 12 calendar-month periods; no thirteenth payment at contract end');
for (const [from, to, expected] of [['2026-01-31T09:00','2026-04-30T09:00',['2026-01-31T09:00','2026-02-28T09:00','2026-03-31T09:00']],
  ['2024-01-31T09:00','2024-04-30T09:00',['2024-01-31T09:00','2024-02-29T09:00','2024-03-31T09:00']]]) {
  assert.deepEqual(billing.installmentSchedule(billing.createInstallmentPlan(from,to,'Theo tháng',100)).map(period=>period.due_at),expected);
}
checks.push('month-end schedules clamp February, restore the original anchor in March and preserve Vietnam time');
const daily = billing.createInstallmentPlan(start,'2027-10-14T09:00','Theo ngày',100_000);
const weekly = billing.createInstallmentPlan(start,'2026-11-10T09:00','Theo tuần',700_000);
assert.equal(billing.installmentSchedule(daily).length,366);
assert.equal(billing.installmentBalance(daily,100_000,0,at(start)).accrued_total,100_000);
assert.equal(billing.installmentSchedule(weekly).length,4);
assert.equal(billing.installmentBalance(weekly,700_000,0,at(start)).accrued_total,700_000);
checks.push('daily and weekly contracts initially charge one period, even when the full term spans a year');
const first = billing.installmentBalance(plan,3_000_000,0,at(start));
assert.equal(first.expected_total,36_000_000); assert.equal(first.accrued_total,3_000_000); assert.equal(first.due_amount,3_000_000);
assert.equal(first.accrued_total + 3_000_000,6_000_000);
const paid = billing.installmentBalance(plan,3_000_000,3_000_000,at(start));
assert.equal(paid.remaining,0); assert.equal(paid.overdue_at,null); assert.equal(paid.next_due_at,'2026-11-13T09:00');
checks.push('3m first rent + separate 3m deposit = 6m initial collection; the 36m schedule is not current debt');
const second = billing.installmentBalance(plan,3_000_000,3_000_000,at('2026-11-13T09:00'));
assert.equal(second.accrued_total,6_000_000); assert.equal(second.due_amount,3_000_000); assert.equal(second.overdue_at,'2026-11-13T09:00');
const late = billing.installmentBalance(plan,3_000_000,4_000_000,at('2026-12-20T09:00'));
assert.equal(late.due_amount,5_000_000); assert.equal(late.next_due_at,'2026-11-13T09:00'); assert.equal(late.paid_periods,1);
const settled = billing.installmentBalance(plan,3_000_000,36_000_000,at(end));
assert.equal(settled.accrued_total,36_000_000); assert.equal(settled.next_due_at,null); assert.equal(settled.remaining_to_own,0);
checks.push('debt appears exactly at the due time; partial and late payments keep the earliest unpaid reminder; accrual stops at term end');
const fees = billing.installmentBalance(plan,3_500_000,3_500_000,at('2026-11-13T09:00'));
assert.equal(fees.accrued_total,6_500_000); assert.equal(fees.due_amount,3_000_000); assert.equal(fees.paid_periods,1);
assert.equal(billing.installmentBalance(plan,3_000_000,null,at(start)).remaining,null);
checks.push('one-time fees are not multiplied by periods; missing payments remain unknown, never zero debt');
const custom = billing.createInstallmentPlan(start,end,'Tùy chọn',100_000,[
  {due_at:'2026-10-20T10:30',amount:'500000'}, {due_at:'2026-11-02T09:15',amount:'1000000'}]);
assert.equal(billing.installmentBalance(custom,100_000,100_000,at('2026-10-20T10:29')).due_amount,0);
const customDue = billing.installmentBalance(custom,100_000,100_000,at('2026-10-20T10:30'));
assert.equal(customDue.expected_total,1_600_000); assert.equal(customDue.accrued_total,600_000); assert.equal(customDue.due_amount,500_000);
assert.equal(billing.installmentBalance(custom,100_000,400_000,at('2026-11-02T09:15')).due_amount,1_200_000);
assert.deepEqual(billing.parseInstallmentPlan(JSON.parse(JSON.stringify(custom))),custom);
checks.push('custom dates and unequal amounts persist unchanged; only scheduled, due installments enter debt');
for (const customRows of [[{due_at:start,amount:'1'}],[{due_at:end,amount:'1'}],[{due_at:'2026-02-30T09:00',amount:'1'}],
  [{due_at:'2026-11-01T09:00',amount:'0'}],[{due_at:'2026-11-01T09:00',amount:'1'},{due_at:'2026-10-20T09:00',amount:'1'}]]) {
  assert.equal(billing.createInstallmentPlan(start,end,'Tùy chọn',100,customRows),null);
}
assert.equal(billing.createInstallmentPlan(start,end,'Theo tháng',0),null);
assert.equal(billing.createInstallmentPlan(start,end,'Theo tháng',9_999_999_999_999),null);
assert.equal(billing.parseInstallmentPlan({...plan,amount:-1}),null);
assert.equal(billing.parseInstallmentPlan({...plan,unexpected:true}),null);
assert.equal(billing.rentalPeriodCount('2026-02-30T09:00',end,'month'),0);
checks.push('invalid dates, duplicate/reversed custom dates, zero/negative amounts and overflowing schedules are rejected');
const row={id:1,code:'QA',name:'QA',status:'renting',total_amount:3_000_000,paid_amount:3_000_000,deposit_paid:3_000_000,billing_plan_json:JSON.stringify(plan)};
const projected=billing.applyInstallmentBilling(row,at('2026-11-13T09:00'));
assert.equal(projected.total_amount,6_000_000); assert.equal(projected.billing_due_amount,3_000_000);
assert.deepEqual(billing.applyInstallmentBilling(projected,at('2026-11-13T09:00')),projected);
assert.equal(billing.applyInstallmentBilling(projected,at('2026-12-13T09:00')).total_amount,9_000_000);
assert.equal(billing.applyInstallmentBilling({...row,billing_plan_json:'{broken'}).total_amount,undefined);
checks.push('list/summary projection is idempotent across refreshes and clock ticks; deposit never cancels rental debt');
const stopped = {...plan,stopped_at:'2026-12-20T09:00'};
assert.deepEqual(billing.parseInstallmentPlan(stopped),stopped);
assert.equal(billing.installmentBalance(stopped,3_000_000,6_000_000,at('2028-01-01T09:00')).remaining,3_000_000);
assert.equal(billing.installmentBalance(stopped,3_000_000,9_000_000,at('2028-01-01T09:00')).next_due_at,null);
checks.push('returning every vehicle freezes new installments while retaining unpaid installments already due');
async function main(){
  for (const months of [6,12,24]) {
    const end = billing.addRentalMonths('2024-08-31T10:30',months);
    assert.equal(billing.ownershipTerm('2024-08-31T10:30',end),String(months));
    assert.equal(billing.rentalPeriodCount('2024-08-31T10:30',end,'month'),months);
  }
  assert.equal(billing.addRentalMonths('2024-01-31T10:30',1),'2024-02-29T10:30');
  assert.equal(billing.addRentalMonths('2026-01-31T10:30',1),'2026-02-28T10:30');
  assert.equal(billing.ownershipTerm(start,'2027-12-01T09:00'),'custom');
  checks.push('ownership 6/12/24 month classification and suggested end dates use calendar months, including leap days and month ends');
  const server=load(path.join(root,'lib/server/contract-finalize'));
  const client={query:async sql=>({rowCount:sql.includes('SELECT id, order_status') ? 1 : 0,rows:sql.includes('SELECT id, order_status') ? [{id:1,order_status:'draft',revision:'1',store_id:1,customer_id:1,
    draft_payload:{management_composer:{rental_type:'ownership',draft:{start_date:start,end_date:end,package_name:'Theo tháng',unit_price:'3000000',total_amount:'39000000',deposit_amount:'3000000',vehicles:[{id:'1'}]}}}}] : []})};
  await assert.rejects(()=>server.finalizeContractDraft(client,1,1,{revision:'1',receipts:[]}),/một kỳ thuê/);
  checks.push('server rejects a stale/tampered 39m ownership draft before creating any vehicle line or receipt');
  console.log(JSON.stringify({passed:checks.length,checks},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
