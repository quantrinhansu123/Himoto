const assert = require('node:assert/strict');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
require('@next/env').loadEnvConfig(path.resolve(__dirname,'..'),false,{info(){},error(){}});
const {load,root} = require('./lib/load-typescript.cjs');
const billing=load(path.join(root,'lib/management/contract-billing'));
const finalizer=load(path.join(root,'lib/server/contract-finalize'));
const payments=load(path.join(root,'lib/server/contract-payments'));
const {vietnamPaymentTime}=load(path.join(root,'lib/management/contract-payments'));
const pool=load(path.join(root,'lib/server/himoto-database')).himotoPool;
async function main(){
 const c=await pool.connect(),checks=[];
 const tables=['orders','order_vehicle_details','vehicles','stores','transactions','banks','cash','users','management_contract_payments','staff_profiles'];
 const proxy={query(sql,params){let q=sql;for(const table of tables)q=q.replaceAll(`himoto.${table}`,`pg_temp.qa_bill_${table}`);assert(!q.includes('himoto.'),'Every business query must use TEMP');return c.query(q,params);}};
 const attempt=async work=>{await c.query('SAVEPOINT bill_case');try{const r=await work();await c.query('RELEASE SAVEPOINT bill_case');return r;}catch(error){await c.query('ROLLBACK TO SAVEPOINT bill_case');await c.query('RELEASE SAVEPOINT bill_case');throw error;}};
 const originalNow=Date.now;
 const commission=load(path.join(root,'lib/server/commission-staff')),originalCommission=commission.loadCommissionStaff;
 commission.loadCommissionStaff=async id=>{const row=(await c.query('SELECT id,full_name AS name FROM qa_bill_staff_profiles WHERE id=$1',[id])).rows[0];return row?{staff_id:Number(row.id),name:row.name}:null;};
 try{
  await c.query('BEGIN');
  for(const table of tables)await c.query(`CREATE TEMP TABLE qa_bill_${table} (LIKE himoto.${table} INCLUDING DEFAULTS INCLUDING CONSTRAINTS) ON COMMIT DROP`);
  await c.query('CREATE TEMP SEQUENCE qa_bill_seq START 99000');
  for(const table of ['order_vehicle_details','transactions'])await c.query(`ALTER TABLE qa_bill_${table} ALTER COLUMN id SET DEFAULT nextval('qa_bill_seq')`);
  await c.query("INSERT INTO qa_bill_cash(id,store_id,opening_balance,status) VALUES(5,23,0,'Active')");
  await c.query("INSERT INTO qa_bill_staff_profiles(id,staff_code,full_name,phone,position,status,store_id) VALUES(10,'QA-10','NVKD QA','0900000010','NVKD','active',23)");
  await c.query("INSERT INTO qa_bill_vehicles(id,name,brand,type,year,store_id,current_store_id,license,status,created_by) VALUES(100,'Xe QA','Honda','xeso',2026,23,23,'QA-OWN','ready',143)");
  const start=vietnamPaymentTime(new Date(originalNow()-2*86400000));
  const end=billing.addRentalMonths(start,1);
  const draft={start_date:start,end_date:end,package_name:'Theo tháng',unit_price:'3000000',total_amount:'3000000',deposit_amount:'3000000',ownership:true,ownership_term_months:'12',sales_staff_id:'10',tls_staff_id:'',
   vehicles:[{id:'100',driver_name:'QA',driver_license_number:'QA',driver_license_issued_on:'2020-01-02',borrow_hats:'1',borrow_raincoats:'0'}]};
  // A stale draft schedule must not survive ordinary issuance.
  const payload={management_composer:{version:1,rental_type:'ownership',draft,installment_plan:billing.createInstallmentPlan(start,billing.addRentalMonths(start,12),'Theo tháng',3000000)}};
  await c.query("INSERT INTO qa_bill_orders(id,order_status,order_mode,store_id,customer_id,total,pid,draft_reference,draft_payload) VALUES(1,'draft','draft',23,9,'0',0,'QA-OWN',$1)",[JSON.stringify(payload)]);
  const revision=(await c.query('SELECT xmin::text AS revision FROM qa_bill_orders WHERE id=1')).rows[0].revision;
  const paidAt=vietnamPaymentTime(new Date(originalNow()-60000));
  const issued=await attempt(()=>finalizer.finalizeContractDraft(proxy,1,143,{revision,receipts:[{purpose:'deposit',amount:'3000000',method:'cash',account_id:5,paid_at:paidAt},{purpose:'rental',amount:'3000000',method:'cash',account_id:5,paid_at:paidAt}]}));
  assert.equal(issued.total_amount,3000000);assert.equal(issued.paid_amount,6000000);
  const stored=(await c.query('SELECT total,total_rental_fees,return_at,draft_payload FROM qa_bill_orders WHERE id=1')).rows[0];
  assert.equal(Number(stored.total),3000000);assert.equal(stored.return_at.toISOString(),new Date(`${end}:00+07:00`).toISOString());
  assert.equal(stored.draft_payload.management_composer.draft.ownership_term_months,'12');
  assert.equal(stored.draft_payload.management_composer.installment_plan,undefined);
  checks.push('Ownership issues as an ordinary one-month rental: 3m rent + 3m deposit; 12-month label does not change dates/money or create a schedule');
  Date.now=()=>originalNow()+90*86400000;
  let context=await payments.readPaymentContext(proxy,1);
  assert.equal(context.total_amount,3000000);assert.equal(context.remaining,0);assert.equal(context.billing,undefined);
  checks.push('Advancing the clock by three months never accrues new ownership charges');
  await c.query("UPDATE qa_bill_order_vehicle_details SET type='week' WHERE order_id=1");
  context=await payments.readPaymentContext(proxy,1);
  const item=context.items[0];
  const input={request_id:randomUUID(),revision:context.revision,amount:'3000000',method:'cash',account_id:5,paid_at:vietnamPaymentTime(new Date(originalNow()-60000)),note:'QA gia hạn',purpose:'renewal',item_id:item.id,item_revision:item.revision,return_at:billing.addRentalMonths(end,1)};
  const renewed=await attempt(()=>payments.recordContractPayment(proxy,1,143,input));
  assert.equal(renewed.context.total_amount,6000000);assert.equal(renewed.context.paid_amount,6000000);assert.equal(renewed.context.deposit_held,3000000);assert.equal(renewed.context.billing,undefined);
  const replay=await payments.recordContractPayment(proxy,1,143,input);assert(replay.replayed);
  const receipts=(await c.query('SELECT name,value FROM qa_bill_transactions ORDER BY id')).rows;
  assert.deepEqual(receipts.map(r=>[r.name,Number(r.value)]),[['order:deposit',3000000],['order:rental_fees',3000000],['order:renewal',3000000]]);
  checks.push('Ordinary renewal is available for ownership, credits actual rent once and preserves the separate deposit and retry protection');
  console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0},null,2));
 }finally{Date.now=originalNow;commission.loadCommissionStaff=originalCommission;await c.query('ROLLBACK');c.release();await globalThis.himotoPool?.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
