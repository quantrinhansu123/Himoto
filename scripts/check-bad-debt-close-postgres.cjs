// Uses an existing synthetic fixture on the dedicated loopback QA cluster only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const openFixture=require('./lib/peak-staging.cjs'),{load,root}=require('./lib/load-typescript.cjs');
async function main(){
 const qa=await openFixture(process.argv[2]),c=await qa.pool.connect(),checks=[],schema='qa_bad_debt_close';
 const life=load(path.join(root,'lib/server/contract-lifecycle')),domain=load(path.join(root,'lib/management/contract-lifecycle'));
 const billing=load(path.join(root,'lib/management/contract-billing')),returns=load(path.join(root,'lib/server/contract-returns')),payments=load(path.join(root,'lib/server/contract-payments'));
 const {dataAccess}=load(path.join(root,'lib/server/access-context'));
 const original=billing.createInstallmentPlan('2026-10-01T08:00','2027-04-01T08:00','Theo th\u00e1ng',100000);
 try{
 await c.query('BEGIN');await c.query(`SET LOCAL lock_timeout='5s';CREATE SCHEMA ${schema}`);
 const tables=['users','roles','stores','staff_profiles','customers','orders','vehicles','banks','cash','transactions','order_vehicle_details','activity_logs','battery_contracts','store_duty_schedules','management_contract_payments','management_contract_vehicle_swaps','management_record_photos','gps_devices','gps_positions','vehicle_location_events','vehicle_transfers','management_contract_types','management_contract_notifications'];
 for(const table of tables)await c.query(`CREATE TABLE ${schema}.${table}(LIKE himoto.${table} INCLUDING DEFAULTS INCLUDING INDEXES)`);
 for(const file of ['2026-10-17-account-access.sql','2026-10-24-staff-accounts.sql','2026-10-18-shared-vehicle-inventory.sql','2026-10-20-reservation-window-conflicts.sql','2026-10-20-returned-vehicle-availability.sql','2026-10-20-cross-branch-contract-vehicles.sql','2026-10-21-contract-vehicle-labels.sql','2026-10-21-returned-vehicle-conflicts.sql','2026-10-23-ownership-hq-vehicles.sql','2026-10-24-bad-debt-recovery.sql','2026-10-24-contract-lifecycle.sql','2026-11-01-ownership-hq-customer-source.sql','2026-11-11-access-order-store-inline.sql','2026-10-29-contract-vehicle-owner-labels.sql','2026-11-08-contract-vehicle-label-performance.sql','2026-11-12-bounded-contract-vehicles.sql']){
   let sql=fs.readFileSync(path.join('docs/sql',file),'utf8').replaceAll('himoto.',schema+'.').replaceAll('SCHEMA himoto','SCHEMA '+schema).replaceAll('pg_catalog,himoto','pg_catalog,'+schema).replaceAll("'himoto'","'"+schema+"'").replace(/^BEGIN;|^COMMIT;/gm,'');
   sql=sql.replaceAll('GRANT himoto_scoped TO postgres;','GRANT himoto_scoped TO CURRENT_USER;');
   for(const key of ['scope_all','store_id','actor_id','operation','transfer_vehicle_id'])sql=sql.replaceAll(`${schema}.${key}'`,`himoto.${key}'`);
   await c.query(sql);await c.query(sql);
 }
 for(const table of tables){if(!(await c.query("SELECT 1 FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 AND column_name='id' AND data_type IN ('integer','bigint','smallint')",[schema,table])).rowCount)continue;await c.query(`CREATE SEQUENCE ${schema}.qa_${table}_seq START 1000000;ALTER TABLE ${schema}.${table} ALTER COLUMN id SET DEFAULT nextval('${schema}.qa_${table}_seq')`);}
 await c.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA ${schema} TO himoto_scoped`);
 await c.query(`ALTER TABLE ${schema}.management_contract_notifications ENABLE ROW LEVEL SECURITY;
   GRANT SELECT ON ${schema}.management_contract_notifications TO himoto_scoped;
   CREATE POLICY qa_notification_read ON ${schema}.management_contract_notifications TO himoto_scoped
     USING(EXISTS(SELECT 1 FROM ${schema}.orders o WHERE o.id=order_id AND ${schema}.access_order_store(o.store_id)))`);
 await c.query(`INSERT INTO ${schema}.stores(id,store_name,status,kind) VALUES(80001,'Lifecycle own QA','opening',DEFAULT),(80002,'Lifecycle ownership QA','opening','lease_to_own'),(80003,'Lifecycle foreign QA','opening',DEFAULT)`);
 await c.query(`INSERT INTO ${schema}.users(id,name,email,password,role_id,status,store_id) VALUES(70001,'Lifecycle operator QA','life@example.invalid','unused',3,'active',80001)`);
 await c.query(`INSERT INTO ${schema}.customers(id,name,status,store_id) VALUES(90001,'Lifecycle customer QA',1,80001)`);
 await c.query(`INSERT INTO ${schema}.cash(id,store_id,name,opening_balance,status) VALUES(93001,80001,'Lifecycle cash QA',0,'Active')`);
 for(let id=10;id<=19;id++)await c.query(`INSERT INTO ${schema}.vehicles(id,name,license,type,brand,year,color,odometer,status,store_id,current_store_id,created_by) VALUES($1,'Lifecycle QA',$2,'xe_dien','VinFast',2026,'Red',0,'using',80003,80003,70001)`,[id,'QA-LIFE-'+id]);
 for(const [id,status,total,paid,type,end,payload]of [[100,'renting',1000000,0,'daily','2026-10-10T08:00+07',{}],[101,'renting',1000000,0,'daily','2027-01-01T08:00+07',{}],[102,'bad_debt',1000000,1000000,'daily','2026-10-10T08:00+07',{}],[110,'renting',100000,100000,'ownership','2027-04-01T08:00+07',{management_composer:{installment_plan:original}}],[111,'renting',750000,100000,'ownership','2027-04-01T08:00+07',{}]]){
   await c.query(`INSERT INTO ${schema}.orders(id,store_id,customer_id,order_type,order_status,order_mode,contract_number,rent_at,return_at,total,pid,first_deposit_amount,draft_payload) VALUES($1,80001,90001,$5,$2,'standard',$6,'2026-10-01T08:00+07',$7,$3::text,$4,0,$8::json)`,[id,status,total,paid,type,'QA-LIFE-'+id,end,JSON.stringify(payload)]);
 }
 for(const [id,order,vehicle,end]of [[1000,100,10,'2026-10-10T08:00+07'],[1001,100,11,'2026-10-10T08:00+07'],[1010,101,12,'2027-01-01T08:00+07'],[1020,102,13,'2026-10-10T08:00+07'],[1100,110,14,'2027-04-01T08:00+07'],[1101,110,15,'2027-04-01T08:00+07'],[1110,111,16,'2027-04-01T08:00+07']])await c.query(`INSERT INTO ${schema}.order_vehicle_details(id,order_id,vehicle_id,rent_at,return_at,total_money,hiring_fee) VALUES($1,$2,$3,'2026-10-01T08:00+07',$4,0,0)`,[id,order,vehicle,end]);
 const db={query:(sql,args)=>c.query(sql.replaceAll('himoto.',schema+'.'),args)};
 const scope={id:70001,store_id:80001,scope_all:false,operation:'',access_role:'branch_staff',permissions:['contracts.read','contracts.return']};
 const staff=async fn=>{await c.query('SAVEPOINT staff');try{await c.query("SELECT set_config('himoto.scope_all','false',true),set_config('himoto.store_id','80001',true),set_config('himoto.actor_id','70001',true),set_config('himoto.operation','',true),set_config('himoto.transfer_vehicle_id','',true)");await c.query('SET LOCAL ROLE himoto_scoped');const value=await dataAccess.run(scope,fn);await c.query('RESET ROLE');await c.query('RELEASE SAVEPOINT staff');return value;}catch(error){await c.query('ROLLBACK TO SAVEPOINT staff');await c.query('RELEASE SAVEPOINT staff');throw error;}};
 const isolated=async fn=>{await c.query('SAVEPOINT example');try{await fn();}finally{await c.query('ROLLBACK TO SAVEPOINT example');await c.query('RELEASE SAVEPOINT example');}};
 const rev=async id=>(await db.query('SELECT xmin::text AS revision FROM himoto.orders WHERE id=$1',[id])).rows[0].revision;
 const input=async(id,action,extra={})=>({action,revision:await rev(id),request_id:randomUUID(),note:'',at:'2026-10-24T10:00',confirmed:true,...(action==='hold'?{hold_until:domain.localLifecycleTime(new Date(Date.parse((extra.at||'2026-10-24T10:00')+':00+07:00')+86400000))}:{}),...extra});
 const apply=async(id,action,extra={})=>staff(async()=>life.applyContractLifecycle(db,id,70001,await input(id,action,extra)));
 const adminScope={...scope,access_role:'admin',scope_all:true};
 const adminApply=async(id,action,extra={})=>dataAccess.run(adminScope,async()=>life.applyContractLifecycle(db,id,70001,await input(id,action,extra)));
 const recover=async item=>staff(async()=>returns.recordBadDebtRecovery(db,70001,{item_id:item,item_revision:(await db.query('SELECT xmin::text AS revision FROM himoto.order_vehicle_details WHERE id=$1',[item])).rows[0].revision,request_id:randomUUID(),recovered_at:'2026-10-24T11:00',note:''}));
 await isolated(async()=>{
   await apply(100,'mark_bad_debt');
   await assert.rejects(()=>apply(100,'close_bad_debt'),e=>e.status===403);
   await assert.rejects(()=>adminApply(100,'close_bad_debt'),e=>e.status===409);
   await recover(1000);await assert.rejects(()=>adminApply(100,'close_bad_debt'),e=>e.status===409);
   await recover(1001);
   const before=(await db.query('SELECT total,pid,first_deposit_amount FROM himoto.orders WHERE id=100')).rows[0];
   const transactions=(await db.query('SELECT * FROM himoto.transactions ORDER BY id')).rows;
   const request=await input(100,'close_bad_debt',{at:'2026-10-24T12:00'});
   const result=await dataAccess.run(adminScope,()=>life.applyContractLifecycle(db,100,70001,request));
   assert.equal(result.status,'completed');assert.equal(result.remaining,1000000);assert(!result.settled);assert(result.bad_debt_closed_at);
   assert.deepEqual((await db.query('SELECT total,pid,first_deposit_amount FROM himoto.orders WHERE id=100')).rows[0],before);
   assert.deepEqual((await db.query('SELECT * FROM himoto.transactions ORDER BY id')).rows,transactions);
   await assert.rejects(()=>load(path.join(root,'lib/server/contract-deletion')).deleteContractRecord(db,100,result.revision,adminScope),e=>e.status===409);
   const closedLine=(await staff(()=>returns.loadContractReturnableItems(db,100,true)))[0];
   await assert.rejects(()=>staff(()=>load(path.join(root,'lib/server/contract-renewals')).recordContractRenewal(db,100,70001,{item_id:closedLine.item_id,item_revision:closedLine.item_revision,order_revision:closedLine.order_revision,return_at:'2026-11-01T10:00',occurred_at:'2026-10-20T10:00',amount:'100000',note:'Cannot reopen closed debt QA'})),e=>e.status===409);
   assert.equal((await dataAccess.run(adminScope,()=>life.applyContractLifecycle(db,100,70001,request))).events.length,result.events.length);
   const stats=load(path.join(root,'lib/server/contract-table-stats'));
   const raw=(await db.query(stats.contractStatisticsSql(' AND o.id=100',false))).rows[0];
   const mapped=stats.mapContractStatistics(raw);assert(mapped.bad_debt_closed_at);assert.equal(mapped.paid_amount,0);
   assert.equal(load(path.join(root,'lib/management/contract-summary')).summarizeContracts([mapped],[]).receivableAmount,1000000);
   const tableInput={kind:'contracts',scope:'',query:load(path.join(root,'lib/management/table-utils')).EMPTY_QUERY,store:'all',page:1,size:10,sort:'code',direction:'asc'};
   const fast=await stats.fastContractStatistics(db,tableInput,' AND o.id=100',Date.now());assert.equal(fast.summary.receivableAmount,1000000);
   const listed=await staff(()=>load(path.join(root,'lib/server/management-table')).readManagementTable(db,'contracts',new URLSearchParams({scope:'collection',all:'1',store:'80001'})));
   assert(listed.rows.some(row=>row.id===100&&row.bad_debt_closed_at&&row.rental_debt_amount===1000000));
   const page=await staff(()=>load(path.join(root,'lib/server/management-table')).readManagementTable(db,'contracts',new URLSearchParams({scope:'collection',store:'80001',filter_id:'100',page:'1',size:'1'})));
   assert.equal(page.total,1);assert.equal(page.rows[0].bad_debt_closed_at,result.bad_debt_closed_at);
   await staff(async()=>payments.recordContractPayment(db,100,70001,payments.parseContractPayment({request_id:randomUUID(),revision:await rev(100),amount:'250000',method:'cash',account_id:93001,paid_at:'2026-10-24T12:00',note:'Collect outstanding debt after admin close QA'})));
   const paid=await staff(()=>life.readContractLifecycle(db,100));assert.equal(paid.status,'completed');assert.equal(paid.remaining,750000);
   await db.query("UPDATE himoto.orders SET rent_at='2026-09-01T08:00+07' WHERE id<>100");
   const sales=await staff(()=>load(path.join(root,'lib/server/page-summaries')).readSalesSummary(db,new URLSearchParams({from:'2026-10-01',to:'2026-10-31',store:'80001'})));
   assert.equal(sales.kpis.debt,750000);assert.equal(sales.kpis.revenue,1000000);assert.equal(sales.kpis.paid,250000);
   await db.query('UPDATE himoto.orders SET store_id=80003 WHERE id=100');await assert.rejects(()=>staff(()=>life.readContractLifecycle(db,100)),e=>e.status===404);
 });checks.push('PostgreSQL: only admin closes fully returned unpaid debt; money is unchanged, request replay is safe, scoped collection/statistics retain the debt and later actual receipts reduce it');
 await isolated(async()=>{
   const settled=await apply(102,'settle');assert(settled.settled);await recover(1020);
   assert.equal((await staff(()=>life.readContractLifecycle(db,102))).status,'bad_debt');
   assert.equal((await adminApply(102,'settle')).status,'completed');
 });checks.push('PostgreSQL: staff cannot automatically close a settled contract by returning its last vehicle; a subsequent admin action closes it');
 await isolated(async()=>{
   const weekly=billing.createInstallmentPlan('2026-10-01T08:00','2027-04-01T08:00','Theo tu\u1ea7n',100000);
   await db.query("UPDATE himoto.orders SET pid=0,draft_payload=$1::json WHERE id=110",[JSON.stringify({management_composer:{installment_plan:weekly}})]);
   await apply(110,'mark_bad_debt');await recover(1100);await recover(1101);
   const before=(await db.query('SELECT total,pid,draft_payload FROM himoto.orders WHERE id=110')).rows[0];
   const closed=await adminApply(110,'close_bad_debt',{at:'2026-10-24T12:00'});assert.equal(closed.remaining,400000);assert.equal(closed.total_amount,400000);
   const after=(await db.query('SELECT total,pid,draft_payload FROM himoto.orders WHERE id=110')).rows[0];
   assert.equal(after.total,before.total);assert.equal(after.pid,before.pid);assert.deepEqual(after.draft_payload.management_composer.installment_plan,before.draft_payload.management_composer.installment_plan);
   const stats=load(path.join(root,'lib/server/contract-table-stats'));
   const mapped=stats.mapContractStatistics((await db.query(stats.contractStatisticsSql(' AND o.id=110',false))).rows[0]);
   assert.equal(billing.applyInstallmentBilling(mapped,Date.parse('2028-01-01T00:00Z')).total_amount,400000);
   await db.query("UPDATE himoto.orders SET rent_at='2026-09-01T08:00+07' WHERE id<>110");
   const sales=await staff(()=>load(path.join(root,'lib/server/page-summaries')).readSalesSummary(db,new URLSearchParams({from:'2026-10-01',to:'2026-10-31',store:'80001'})));
   assert.equal(sales.kpis.debt,400000);assert.equal(sales.kpis.revenue,100000);assert.equal(sales.kpis.paid,0);
 });checks.push('PostgreSQL: closing ownership bad debt preserves its stored amount and stopped schedule; future clocks cannot add installments');
 }finally{await c.query('ROLLBACK').catch(()=>{});c.release();await qa.close();}
 console.log(JSON.stringify({passed:checks.length,checks,fixtureOnly:true,external_network_allowed:false,realBusinessWrites:0},null,2));
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
