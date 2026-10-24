const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {load,root}=require('./lib/load-typescript.cjs');
const {badDebtCutoff}=load(path.join(root,'lib/management/contract-bad-debt'));
const {withContractOverdue,withContractMonitoring}=load(path.join(root,'lib/management/contract-overdue'));
const billing=load(path.join(root,'lib/management/contract-billing'));
const {projectManagementTable}=load(path.join(root,'lib/management/management-table'));
const {EMPTY_QUERY}=load(path.join(root,'lib/management/table-utils'));
const {summarizeContracts}=load(path.join(root,'lib/management/contract-summary'));
const {readContractResolution}=load(path.join(root,'lib/server/contract-resolution'));
const {readPaymentContext}=load(path.join(root,'lib/server/contract-payments'));
const checks=[],at='2026-10-10T09:00:00+07:00',first=Date.parse('2026-10-20T10:00Z'),later=Date.parse('2026-12-01T10:00Z');
async function main(){
 const row={id:1,name:'QA',code:'QA',status:'bad_debt',rental_type:'daily',total_amount:100000,paid_amount:0,bad_debt_at:at,overdue_items_json:JSON.stringify([{return_at:'2026-10-01T09:00:00+07:00',daily_price:100000}])};
 const before=withContractOverdue(row,first),after=withContractOverdue(row,later);assert.equal(after.overdue_minutes,before.overdue_minutes);assert.equal(after.overdue_fee_estimate,before.overdue_fee_estimate);
 assert(withContractOverdue({...row,status:'overdue'},later).overdue_minutes>before.overdue_minutes);
 assert.equal(withContractOverdue({...row,bad_debt_at:undefined},later).overdue_fee_estimate,undefined);
 checks.push('Bad-debt late age/fee stays fixed at the transition while active overdue contracts keep accruing; unknown legacy cutoff is not invented');
 const plan=billing.createInstallmentPlan('2026-10-01T09:00','2026-12-31T09:00','Theo tuần',100000);assert(plan);
 const planned={...row,rental_type:'ownership',billing_plan_json:JSON.stringify(plan)};
 const accrued=billing.applyInstallmentBilling(planned,first),future=billing.applyInstallmentBilling(planned,later);assert.equal(accrued.total_amount,200000);assert.equal(future.total_amount,200000);assert.equal(withContractMonitoring(future,later).monitoring_amount,200000);
 assert.equal(billing.applyInstallmentBilling({...planned,paid_amount:50000},later).billing_due_amount,150000);
 assert.equal(billing.applyInstallmentBilling({...planned,bad_debt_at:undefined},later).total_amount,undefined);
 assert.equal(summarizeContracts([row,{...row,id:2,status:'overdue',total_amount:300000,paid_amount:100000}],[]).totalAmount,300000);assert.equal(summarizeContracts([row],[]).receivableAmount,0);assert.equal(summarizeContracts([row],[]).badDebtAmount,100000);
 checks.push('Ownership accrual and unpaid installments freeze; later receipts reduce debt; normal revenue/receivables exclude the separate bad-debt balance');
 const payload={management_composer:{installment_plan:plan,lifecycle:{events:[{action:'mark_bad_debt',at}],bad_debt:{at}}}};assert.equal(badDebtCutoff(payload),at);
 const originalNow=Date.now;Date.now=()=>later;
 try{
  const fake={query:async sql=>({rowCount:1,rows:sql.includes('FROM himoto.orders')?[{id:1,code:'QA',order_status:'bad_debt',status:'bad_debt',draft_payload:payload,total:'100000',paid:'0',rental_paid:'0',deposit_paid:'0',deposit_refunded:'0',deposit_amount:'0',item_count:1,returned_count:0,store_id:1,revision:'1'}]:[]})};
  const state=await readContractResolution(fake,1);assert.equal(state.total,200000);assert.equal(state.remaining,200000,'Bad debt must not require future installments');
  const payment=await readPaymentContext(fake,1);assert.equal(payment.total_amount,200000);assert.equal(payment.remaining,200000);
 }finally{Date.now=originalNow;}
 const input={kind:'contracts',scope:'',query:{...EMPTY_QUERY},store:'all',page:1,size:1,sort:'code',direction:'asc'};
 const models=[row,{...row,id:2,status:'overdue'},{...row,id:3,status:'renting',end_date:'2026-12-30'},{...row,id:4,status:'reserved'}];
 const stats=projectManagementTable(models,input,false,first);assert.equal(stats.tabCount,4);assert.equal(new Map(stats.statusCounts).get('bad_debt'),1);assert.equal(new Map(stats.statusCounts).get('reserved'),1);assert.equal(new Map(stats.statusCounts).get('renting'),2);
 const overdue=projectManagementTable(models,{...input,query:{...EMPTY_QUERY,status:'overdue'}},true,first);assert(overdue.rows.every(r=>r.status!=='bad_debt'));assert.equal(overdue.summary.badDebtAmount,0);
 checks.push('Payment, settlement, status-tab counts, pagination and overdue summaries follow the same cutoff and keep bad debt separate');
 require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
 const {ownerDatabase}=load(path.join(root,'lib/server/himoto-database')),c=await ownerDatabase.connect();
 try{
  await c.query('BEGIN');await c.query('CREATE TEMP TABLE qa_bad_debt_orders(id bigint,order_status text,deleted_at timestamptz,draft_payload json,total text) ON COMMIT DROP');
  await c.query(`INSERT INTO qa_bad_debt_orders VALUES(1,'bad_debt',NULL,$1,'100000'),(2,'bad_debt',NULL,NULL,'200000'),(3,'overdue',NULL,NULL,'300000')`,[JSON.stringify(payload)]);
  const sql=fs.readFileSync('docs/sql/2026-10-24-bad-debt-accrual-cutoff.sql','utf8').replaceAll('himoto.orders','pg_temp.qa_bad_debt_orders').replace(/^BEGIN;|^COMMIT;/gm,'');
  await c.query(sql);const once=(await c.query('SELECT id,total,draft_payload FROM qa_bad_debt_orders ORDER BY id')).rows;await c.query(sql);assert.deepEqual((await c.query('SELECT id,total,draft_payload FROM qa_bad_debt_orders ORDER BY id')).rows,once);assert.equal(badDebtCutoff(once[0].draft_payload),at);assert(badDebtCutoff(once[1].draft_payload));assert.equal(once[2].draft_payload,null);
  checks.push('Cutoff migration is idempotent, retains known transition time, snapshots unknown imported records and never changes stored contract money');
 }finally{await c.query('ROLLBACK');c.release();await globalThis.himotoPool?.end();}
 console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0,realSequenceChanges:0},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
