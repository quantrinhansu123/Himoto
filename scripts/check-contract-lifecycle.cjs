const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {load,root}=require('./lib/load-typescript.cjs'),{ownerDatabase}=load(path.join(root,'lib/server/himoto-database'));
const life=load(path.join(root,'lib/server/contract-lifecycle')),domain=load(path.join(root,'lib/management/contract-lifecycle'));
const billing=load(path.join(root,'lib/management/contract-billing')),returns=load(path.join(root,'lib/server/contract-returns')),payments=load(path.join(root,'lib/server/contract-payments'));
const {dataAccess}=load(path.join(root,'lib/server/access-context'));
const schema='qa_contract_lifecycle',checks=[];
async function main(){
 const original=billing.createInstallmentPlan('2026-10-01T08:00','2027-04-01T08:00','Theo tháng',100000);
 const moved=domain.resumeInstallmentPlan(original,'2026-10-15T10:00','2026-10-24T10:00');
 assert.equal(moved.periods.length,6);assert.equal(moved.periods[0].due_at,'2026-10-01T08:00');assert.equal(moved.periods[1].due_at,'2026-11-10T08:00');assert.equal(moved.end,'2027-04-10T08:00');assert.equal(moved.periods.reduce((sum,p)=>sum+p.amount,0),600000);
 assert.throws(()=>domain.resumeInstallmentPlan(original,'2026-10-15T10:00','2026-10-15T10:00'));
 const twoMonths=domain.resumeInstallmentPlan(billing.createInstallmentPlan('2026-06-01T08:00','2026-10-01T08:00','Theo tháng',100000),'2026-08-01T08:00','2026-10-01T08:00');assert.equal(twoMonths.end,'2026-12-01T08:00');assert.equal(twoMonths.periods[2].due_at,'2026-10-01T08:00');assert.equal(twoMonths.periods.reduce((s,p)=>s+p.amount,0),400000);
 const lastPeriod=domain.resumeInstallmentPlan(original,'2027-03-15T08:00','2027-03-24T08:00');assert.equal(lastPeriod.end,'2027-04-10T08:00');
 const boundary={...original,stopped_at:'2026-11-01T08:00',paused_at:'2026-11-01T08:00'};assert.equal(billing.installmentBalance(boundary,100000,100000,Date.parse('2027-04-01T08:00+07:00')).accrued_total,100000);
 assert(domain.expiredOwnershipHold({status:'reserved',rental_type:'ownership',hold_until:'2026-10-24T10:00'},Date.parse('2026-10-24T10:00+07:00')));assert(!domain.expiredOwnershipHold({status:'reserved',rental_type:'daily',hold_until:'2026-10-24T10:00'},Date.parse('2026-10-25T10:00+07:00')));
 checks.push('Two-month hold moves October end to December, freezes a due-at-boundary period, and can extend the last paid period without adding fees or installments');
 const legacy=domain.legacyResumePlan(750000,'2026-10-01T08:00','2026-10-24T10:00','2026-11-24T10:00','Theo tháng',350000);
 assert.equal(legacy.base_total,750000);assert.equal(legacy.plan.periods[0].amount,750000);assert.equal(legacy.plan.periods[1].amount,350000);
 assert.equal(billing.installmentBalance(legacy.plan,750000,100000,Date.parse('2026-10-24T12:00+07:00')).remaining,1000000);
 checks.push('Resume preserves prior amounts/periods and shifts only future installments; legacy schedules explicitly retain old debt before new periods');
 const c=await ownerDatabase.connect();try{
 await c.query('BEGIN');await c.query(`SET LOCAL lock_timeout='5s';CREATE SCHEMA ${schema}`);
 const tables=['users','roles','stores','staff_profiles','customers','orders','vehicles','banks','cash','transactions','order_vehicle_details','activity_logs','battery_contracts','store_duty_schedules','management_contract_payments','management_contract_vehicle_swaps','management_record_photos','gps_devices','gps_positions','vehicle_location_events','vehicle_transfers','management_contract_types'];
 for(const table of tables)await c.query(`CREATE TABLE ${schema}.${table}(LIKE himoto.${table} INCLUDING DEFAULTS INCLUDING INDEXES)`);
 for(const file of ['2026-10-17-account-access.sql','2026-10-24-staff-accounts.sql','2026-10-18-shared-vehicle-inventory.sql','2026-10-20-reservation-window-conflicts.sql','2026-10-20-returned-vehicle-availability.sql','2026-10-20-cross-branch-contract-vehicles.sql','2026-10-21-contract-vehicle-labels.sql','2026-10-21-returned-vehicle-conflicts.sql','2026-10-23-ownership-hq-vehicles.sql','2026-10-24-bad-debt-recovery.sql','2026-10-24-contract-lifecycle.sql']){
   let sql=fs.readFileSync(path.join('docs/sql',file),'utf8').replaceAll('himoto.',schema+'.').replaceAll('SCHEMA himoto','SCHEMA '+schema).replaceAll('pg_catalog,himoto','pg_catalog,'+schema).replaceAll("'himoto'","'"+schema+"'").replace(/^BEGIN;|^COMMIT;/gm,'');
   for(const key of ['scope_all','store_id','actor_id','operation','transfer_vehicle_id'])sql=sql.replaceAll(`${schema}.${key}'`,`himoto.${key}'`);
   await c.query(sql);await c.query(sql);
 }
 for(const table of tables){if(!(await c.query("SELECT 1 FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 AND column_name='id'",[schema,table])).rowCount)continue;await c.query(`CREATE SEQUENCE ${schema}.qa_${table}_seq START 1000000;ALTER TABLE ${schema}.${table} ALTER COLUMN id SET DEFAULT nextval('${schema}.qa_${table}_seq')`);}
 await c.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA ${schema} TO himoto_scoped`);
 await c.query(`INSERT INTO ${schema}.stores(id,store_name,status,kind) VALUES(80001,'Lifecycle own QA','opening',DEFAULT),(80002,'Lifecycle ownership QA','opening','lease_to_own'),(80003,'Lifecycle foreign QA','opening',DEFAULT)`);
 await c.query(`INSERT INTO ${schema}.users(id,name,email,password,role_id,status,store_id) VALUES(70001,'Lifecycle operator QA','life@example.invalid','unused',3,'active',80001)`);
 await c.query(`INSERT INTO ${schema}.customers(id,name,status,store_id) VALUES(90001,'Lifecycle customer QA',1,80001)`);
 await c.query(`INSERT INTO ${schema}.cash(id,store_id,name,opening_balance,status) VALUES(93001,80001,'Lifecycle cash QA',0,'Active')`);
 for(let id=10;id<=19;id++)await c.query(`INSERT INTO ${schema}.vehicles(id,name,license,type,brand,year,color,odometer,status,store_id,current_store_id,created_by) VALUES($1,'Lifecycle QA',$2,'xe_dien','VinFast',2026,'Red',0,'using',80003,80003,70001)`,[id,'QA-LIFE-'+id]);
 for(const [id,status,total,paid,type,end,payload]of [[100,'renting',1000000,0,'daily','2026-10-10T08:00+07',{}],[101,'renting',1000000,0,'daily','2027-01-01T08:00+07',{}],[102,'bad_debt',1000000,1000000,'daily','2026-10-10T08:00+07',{}],[110,'renting',100000,100000,'ownership','2027-04-01T08:00+07',{management_composer:{installment_plan:original}}],[111,'renting',750000,100000,'ownership','2027-04-01T08:00+07',{}]]){
   await c.query(`INSERT INTO ${schema}.orders(id,store_id,customer_id,order_type,order_status,order_mode,contract_number,rent_at,return_at,total,pid,first_deposit_amount,draft_payload) VALUES($1,80001,90001,$5,$2,'standard',$6,'2026-10-01T08:00+07',$7,$3::text,$4,0,$8::json)`,[id,status,total,paid,type,'QA-LIFE-'+id,end,JSON.stringify(payload)]);
 }
 for(const [id,order,vehicle,end]of [[1000,100,10,'2026-10-10T08:00+07'],[1001,100,11,'2026-10-10T08:00+07'],[1010,101,12,'2027-01-01T08:00+07'],[1020,102,13,'2026-10-10T08:00+07'],[1100,110,14,'2027-04-01T08:00+07'],[1101,110,15,'2027-04-01T08:00+07'],[1110,111,16,'2027-04-01T08:00+07']])await c.query(`INSERT INTO ${schema}.order_vehicle_details(id,order_id,vehicle_id,rent_at,return_at,total_money,hiring_fee) VALUES($1,$2,$3,'2026-10-01T08:00+07',$4,0,0)`,[id,order,vehicle,end]);
 const db={query:(sql,args)=>c.query(sql.replaceAll('himoto.',schema+'.').replaceAll("'"+schema+'.',"'himoto."),args)};
 const scope={id:70001,store_id:80001,scope_all:false,operation:'',access_role:'branch_staff',permissions:['contracts.read','contracts.return']};
 const staff=async fn=>{await c.query('SAVEPOINT staff');try{await c.query("SELECT set_config('himoto.scope_all','false',true),set_config('himoto.store_id','80001',true),set_config('himoto.actor_id','70001',true),set_config('himoto.operation','',true),set_config('himoto.transfer_vehicle_id','',true)");await c.query('SET LOCAL ROLE himoto_scoped');const value=await dataAccess.run(scope,fn);await c.query('RESET ROLE');await c.query('RELEASE SAVEPOINT staff');return value;}catch(error){await c.query('ROLLBACK TO SAVEPOINT staff');await c.query('RELEASE SAVEPOINT staff');throw error;}};
 const isolated=async fn=>{await c.query('SAVEPOINT example');try{await fn();}finally{await c.query('ROLLBACK TO SAVEPOINT example');await c.query('RELEASE SAVEPOINT example');}};
 const rev=async id=>(await db.query('SELECT xmin::text AS revision FROM himoto.orders WHERE id=$1',[id])).rows[0].revision;
 const input=async(id,action,extra={})=>({action,revision:await rev(id),request_id:randomUUID(),note:'Reviewed physical state and ledger QA',at:'2026-10-24T10:00',confirmed:true,...(action==='hold'?{hold_until:domain.localLifecycleTime(new Date(Date.parse((extra.at||'2026-10-24T10:00')+':00+07:00')+86400000))}:{}),...extra});
 const apply=async(id,action,extra={})=>staff(async()=>life.applyContractLifecycle(db,id,70001,await input(id,action,extra)));
 const recover=async item=>staff(async()=>returns.recordBadDebtRecovery(db,70001,{item_id:item,item_revision:(await db.query('SELECT xmin::text AS revision FROM himoto.order_vehicle_details WHERE id=$1',[item])).rows[0].revision,request_id:randomUUID(),recovered_at:'2026-10-24T11:00',note:'Vehicle physically recovered QA'}));
 await isolated(async()=>{
   await db.query("UPDATE himoto.vehicles SET store_id=0,current_store_id=0,deleted_at=now() WHERE id=16");
   await db.query("UPDATE himoto.orders SET pid=750000 WHERE id=111");
   await db.query("UPDATE himoto.order_vehicle_details SET return_at='2026-10-10T08:00+07' WHERE id=1110");
   const definition=(await c.query("SELECT pg_get_functiondef($1::regprocedure) AS sql",[schema+'.vehicle_inventory()'])).rows[0].sql;
   const filtered=definition.replace('FROM '+schema+'.vehicles v','FROM (SELECT * FROM '+schema+'.vehicles WHERE deleted_at IS NULL AND COALESCE(current_store_id,store_id)>0) v');
   assert.notEqual(filtered,definition);await c.query(filtered);
   assert.equal((await staff(()=>db.query('SELECT id FROM himoto.vehicle_inventory() WHERE id=16'))).rowCount,0);
   const archived=(await staff(()=>returns.loadContractReturnableItems(db,111)))[0];
   assert.equal(archived.item_id,1110);assert.equal(archived.vehicle_id,16);assert.equal(archived.license,'QA-LIFE-16');assert.equal(archived.completed_at,null);
   for(const term of ['QA-LIFE-111','QA-LIFE-16'])assert.deepEqual((await staff(()=>returns.searchReturnableItems(db,term))).map(i=>i.item_id),[1110]);
   await db.query("INSERT INTO himoto.orders(id,store_id,order_status,contract_number,total,pid) VALUES(211,80003,'renting','QA-ARCHIVED-FOREIGN','100000',100000)");
   await db.query("INSERT INTO himoto.order_vehicle_details(id,order_id,vehicle_id,rent_at,return_at,completed_at) VALUES(2110,211,16,'2026-09-01T08:00+07','2026-09-02T08:00+07','2026-09-02T08:00+07')");
   assert.deepEqual(await staff(()=>returns.loadContractReturnableItems(db,211)),[]);
   assert.deepEqual((await staff(()=>returns.searchReturnableItems(db,'QA-LIFE-16'))).map(i=>i.item_id),[1110]);
   const before=(await db.query('SELECT deleted_at,store_id,current_store_id FROM himoto.vehicles WHERE id=16')).rows[0];
   const result=await staff(()=>returns.recordVehicleReturn(db,70001,returns.parseReturnInput({item_id:1110,item_revision:archived.item_revision,returned_at:'2026-10-24T11:00',hourly_rate:'50000',fee_override:'0'})));
   assert.equal(result.status,'completed');
   assert.deepEqual((await db.query('SELECT deleted_at,store_id,current_store_id FROM himoto.vehicles WHERE id=16')).rows[0],before);
   assert.equal((await staff(()=>db.query('SELECT id FROM himoto.vehicle_inventory() WHERE id=16'))).rowCount,0);
 });checks.push('Scoped archived stock stays absent from inventory, but its in-scope rental line and plate search remain returnable; an explicit paid return completes the agreement without restoring the vehicle, exposing foreign contracts or losing its original line ID');
 const reconcile=async(extra={})=>{
   const entry={kind:'confirmed_prior_recovery',item_id:1110,vehicle_id:16,actual_recovery_at:null,release_checkpoint_at:'2026-10-23T13:35:49.848Z',...extra};
   await db.query("UPDATE himoto.order_vehicle_details SET rent_at='2026-06-10T10:55+07',return_at='2026-09-09T10:55+07',completed_at='2026-10-23T13:35:49.848Z' WHERE id=1110");
   await db.query("UPDATE himoto.orders SET order_type='rental',rent_at=NULL,return_at=NULL,total='2500000',pid=9500000,first_deposit_amount=2000000,draft_payload=$1::json WHERE id=111",[JSON.stringify({legacy_migration:{sourceStoreId:'29'},management_composer:{vehicle_reconciliations:[entry]}})]);
   await db.query("INSERT INTO himoto.transactions(id,order_id,name,type,status,value,store_id,user_id,cash_id,note,created_at) VALUES(11110,111,'order:deposit','in','approved',2000000,80001,70001,93001,'Reconciled deposit QA','2026-06-10T10:55+07') ON CONFLICT(id) DO NOTHING");
   return entry;
 };
 await isolated(async()=>{
   await reconcile();
   const context=await staff(()=>life.readContractLifecycle(db,111));
   assert(context.ownership&&context.overdue&&context.all_returned);assert.equal(domain.lifecycleDisplayStatus(context),'overdue');
   assert.equal(context.items[0].return_reconciled,true);assert(domain.canHoldContract(context));assert(!domain.canMarkBadDebtContract(context));
   assert.equal(Date.parse(context.end_at),Date.parse('2026-09-09T10:55:00+07:00'));assert.equal(context.total_amount,2500000);assert.equal(context.paid_amount,7500000);assert.equal(context.deposit_held,2000000);
   await assert.rejects(()=>apply(111,'mark_bad_debt'),e=>e.status===409);
 });checks.push('Reconciled legacy ownership with header dates absent uses the original vehicle deadline for overdue display and hold eligibility, while paid balances do not become bad debt');
 await isolated(async()=>{
   await reconcile();
   await db.query("INSERT INTO himoto.orders(id,store_id,order_status,contract_number,total,pid) VALUES(202,80003,'renting','QA-RECONCILED-NEW-CUSTOMER','100000',0)");
   await db.query("INSERT INTO himoto.order_vehicle_details(id,order_id,vehicle_id,rent_at,return_at) VALUES(2020,202,16,'2026-10-24T08:00+07','2027-01-24T08:00+07')");
   const snapshot=async()=>({order:(await db.query('SELECT total,pid,first_deposit_amount,draft_payload #> \'{management_composer,vehicle_reconciliations}\' AS reconciliations FROM himoto.orders WHERE id=111')).rows[0],vehicles:(await db.query('SELECT *,xmin::text AS revision FROM himoto.vehicles WHERE id=16')).rows,lines:(await db.query('SELECT *,xmin::text AS revision FROM himoto.order_vehicle_details WHERE id IN(1110,2020) ORDER BY id')).rows,transactions:(await db.query('SELECT * FROM himoto.transactions ORDER BY id')).rows});
   const before=await snapshot(),body=await input(111,'hold');
   const held=await staff(()=>life.applyContractLifecycle(db,111,70001,body));
   assert.equal(held.status,'reserved');assert(held.hold_was_overdue&&!held.hold_can_resume);assert.equal(held.events.length,1);assert.deepEqual(held.events[0].reconciled_item_ids,[1110]);
   assert.deepEqual(await snapshot(),before);
   assert.equal((await staff(()=>life.applyContractLifecycle(db,111,70001,body))).events.length,1);
   await assert.rejects(()=>apply(111,'resume',{vehicle_ids:[16]}),e=>e.status===409);
   const closed=await apply(111,'complete_hold',{at:'2026-10-26T10:00'});
   assert.equal(closed.status,'completed');assert(closed.completed_from_hold);assert.equal(closed.waived_amount,0);assert.equal(closed.overpayment,5000000);assert.equal(closed.deposit_held,2000000);
   assert.deepEqual(await snapshot(),before);
 });checks.push('Explicit hold/completion of a reconciled old agreement preserves its original checkpoint, unknown return date, later foreign rental, vehicle revision, receipts, paid amounts and deposit; hold replay is safe and resume is denied');
 await isolated(async()=>{
   for(const extra of [{kind:'other'}, {item_id:9999}, {vehicle_id:9999}, {actual_recovery_at:'2026-09-10T08:00+07'}, {release_checkpoint_at:'2026-10-22T13:35:49.848Z'}]){
     await reconcile(extra);const context=await staff(()=>life.readContractLifecycle(db,111));assert(!context.items[0].return_reconciled);assert(!domain.canHoldContract(context));
     await assert.rejects(()=>apply(111,'hold'),e=>e.status===409);
   }
   await db.query("UPDATE himoto.orders SET draft_payload='{}' WHERE id=111");
   assert(!domain.canHoldContract(await staff(()=>life.readContractLifecycle(db,111))));await assert.rejects(()=>apply(111,'hold'),e=>e.status===409);
 });checks.push('Normal returned vehicles, already corrected recovery dates, mismatched item/vehicle/checkpoint and unrecognized reconciliation records cannot unlock a second hold');
 await isolated(async()=>{
   await reconcile();await db.query("UPDATE himoto.order_vehicle_details SET return_at='2027-04-01T08:00+07' WHERE id=1110");
   const context=await staff(()=>life.readContractLifecycle(db,111));assert(!context.overdue);assert(domain.canHoldContract(context));
   const held=await apply(111,'hold');assert(!held.hold_can_resume);
   await assert.rejects(()=>apply(111,'resume',{vehicle_ids:[16]}),e=>e.status===409);
 });checks.push('A reconciled agreement before its real deadline is not falsely overdue and cannot infer a new rental entitlement from an unknown original recovery date');
 await isolated(async()=>{
   await db.query("UPDATE himoto.stores SET kind='lease_to_own' WHERE id=80001");
   const context=await staff(()=>life.readContractLifecycle(db,100));
   assert.equal(context.rental_type,'daily');assert.equal(context.ownership,false);assert.equal(context.overdue,true);
   assert.equal(context.status,'renting');assert.equal(domain.lifecycleDisplayStatus(context),'overdue');
   await assert.rejects(()=>apply(100,'hold'),e=>e.status===409&&/thuê sở hữu/.test(e.message));
   assert.equal(domain.lifecycleDisplayStatus({...context,status:'bad_debt'}),'bad_debt');
   assert.equal(domain.lifecycleDisplayStatus({...context,status:'wait_payment'}),'wait_payment');
 });checks.push('A daily rental managed by an ownership store keeps its actual type and overdue display, and cannot enter ownership hold');
 await isolated(async()=>{
   const active=await staff(()=>life.readContractLifecycle(db,110));assert(!active.overdue);assert(domain.canHoldContract(active));
   const deadline=domain.contractHoldDeadline(active);assert(domain.canHoldContract(active,deadline));assert(domain.canHoldContract(active,deadline-1));
   assert(domain.canHoldContract({...active,plan:null,end_at:null}));
   const expired=billing.createInstallmentPlan('2026-10-01T08:00','2026-10-24T08:00','Theo tháng',100000);
   await db.query("UPDATE himoto.orders SET return_at='2026-10-24T08:00+07',draft_payload=$2::json WHERE id=$1",[110,JSON.stringify({management_composer:{installment_plan:expired}})]);
   await db.query("UPDATE himoto.order_vehicle_details SET return_at='2026-10-24T08:00+07' WHERE order_id=110");
   const ended=await staff(()=>life.readContractLifecycle(db,110));assert(domain.canHoldContract(ended));
   const held=await apply(110,'hold',{at:'2026-10-24T09:00',hold_until:'2026-10-24T09:30'});assert.equal(held.status,'reserved');assert(!held.hold_can_resume);
   await assert.rejects(()=>apply(110,'resume',{vehicle_ids:[14,15]}),e=>e.status===409);
 });checks.push('Expired ownership contracts can enter hold and remain reserved; expiration does not move them to debt or permit resume');
 await isolated(async()=>{
   const before=(await db.query('SELECT total,pid,customer_id FROM himoto.orders WHERE id=100')).rows[0];
   await staff(async()=>{const body=await input(100,'mark_bad_debt');const result=await life.applyContractLifecycle(db,100,70001,body);assert.equal(result.status,'bad_debt');assert.equal(result.events.length,1);assert.equal((await life.applyContractLifecycle(db,100,70001,body)).events.length,1);await assert.rejects(()=>life.applyContractLifecycle(db,100,70001,{...body,note:'Changed content'}),e=>e.status===409);});
   assert.deepEqual((await db.query('SELECT total,pid,customer_id FROM himoto.orders WHERE id=100')).rows[0],before);
   assert.equal((await db.query('SELECT status FROM himoto.vehicles WHERE id=10')).rows[0].status,'using');
   await assert.rejects(()=>apply(101,'mark_bad_debt'),e=>e.status===409);await assert.rejects(()=>apply(100,'mark_bad_debt',{revision:'99999999'}),e=>e.status===409);
 });checks.push('Only genuinely overdue contracts become bad debt; totals/customer/vehicle remain unchanged; stale revisions and changed/repeated request IDs are safe');
 await isolated(async()=>{
   await apply(100,'mark_bad_debt');await recover(1000);let state=await staff(()=>life.readContractLifecycle(db,100));assert(!state.all_returned&&!state.settled);assert.equal(state.status,'bad_debt');
   assert.equal((await db.query('SELECT status FROM himoto.vehicles WHERE id=10')).rows[0].status,'ready');
   assert.equal((await db.query('SELECT * FROM himoto.vehicle_window_conflicts(ARRAY[10]::bigint[],NULL,now(),now()+interval \'1 day\')')).rowCount,0);
   await recover(1001);state=await staff(()=>life.readContractLifecycle(db,100));assert(state.all_returned);assert.equal(state.status,'bad_debt');assert.equal(state.remaining,1000000);await assert.rejects(()=>apply(100,'settle'),e=>e.status===409);
 });checks.push('Multi-vehicle physical recovery releases each returned vehicle for a new rental, while an unpaid old contract stays bad debt after every vehicle returns');
 await isolated(async()=>{
   const settled=await apply(102,'settle');assert(settled.settled&&!settled.all_returned);assert.equal(settled.status,'bad_debt');
   const body=await staff(async()=>({item_id:1020,item_revision:(await db.query('SELECT xmin::text AS revision FROM himoto.order_vehicle_details WHERE id=1020')).rows[0].revision,request_id:randomUUID(),recovered_at:'2026-10-24T11:00',note:'Last returned vehicle QA'}));
   await staff(()=>returns.recordBadDebtRecovery(db,70001,body));const result=await staff(()=>life.readContractLifecycle(db,102));assert.equal(result.status,'completed');assert(result.settled&&result.all_returned);
   assert((await staff(()=>returns.recordBadDebtRecovery(db,70001,body))).replayed);
 });checks.push('Settled-but-unreturned remains bad debt; the last actual recovery closes it, and recovery replay after closure creates no second event');
 await isolated(async()=>{
   await db.query('UPDATE himoto.orders SET pid=0 WHERE id=102');await recover(1020);
   const pay=amount=>staff(async()=>payments.recordContractPayment(db,102,70001,payments.parseContractPayment({request_id:randomUUID(),revision:await rev(102),amount:String(amount),method:'cash',account_id:93001,paid_at:'2026-10-24T10:00',note:'Approved real receipt fixture QA'})));
   await pay(500000);await assert.rejects(()=>apply(102,'settle'),e=>e.status===409);await pay(500000);
   const result=await apply(102,'settle');assert.equal(result.status,'completed');assert.equal(result.remaining,0);assert.equal((await db.query('SELECT count(*)::int AS n FROM himoto.transactions WHERE order_id=102')).rows[0].n,2);
 });checks.push('After return, partial actual receipts keep bad debt; full receipts plus explicit ledger review close without fabricating additional transactions');
 await isolated(async()=>{
   await db.query('UPDATE himoto.orders SET pid=1200000 WHERE id=102');
   await db.query("INSERT INTO himoto.transactions(order_id,name,type,status,value,store_id,user_id,cash_id,note,created_at) VALUES(102,'order:deposit','in','approved',200000,80001,70001,93001,'Deposit fixture QA',now())");
   await recover(1020);await assert.rejects(()=>apply(102,'settle'),e=>e.status===409&&/cọc/.test(e.message));
   await staff(async()=>payments.recordContractPayment(db,102,70001,payments.parseContractPayment({request_id:randomUUID(),revision:await rev(102),amount:'200000',method:'cash',account_id:93001,paid_at:'2026-10-24T11:00',purpose:'deposit_refund',note:'Deposit refund fixture QA'})));
   assert.equal((await apply(102,'settle')).status,'completed');
 });checks.push('Unresolved deposit blocks settlement; an actual approved deposit refund clears it without reducing the rental paid total');
 await isolated(async()=>{
   await apply(102,'settle');await db.query("UPDATE himoto.orders SET total='1100000' WHERE id=102");await recover(1020);const result=await staff(()=>life.readContractLifecycle(db,102));assert.equal(result.status,'bad_debt');assert(!result.settled);assert.equal(result.remaining,100000);
 });checks.push('A previous settlement confirmation cannot close a contract with newly outstanding fees; fresh ledger checks are mandatory');
 await isolated(async()=>{
   const before=(await db.query('SELECT total,pid FROM himoto.orders WHERE id=110')).rows[0];const held=await apply(110,'hold',{at:'2026-10-15T10:00'});
   assert.equal(held.status,'reserved');assert(held.all_returned);assert.equal(held.plan.stopped_at,'2026-10-15T10:00');assert.equal(held.resume_vehicle_count,2);
   assert.equal(billing.installmentBalance(held.plan,held.base_total,held.paid_amount,Date.parse('2027-02-01T12:00+07:00')).accrued_total,100000);
   assert.deepEqual((await db.query('SELECT total,pid FROM himoto.orders WHERE id=110')).rows[0],before);
   for(const id of [14,15])assert.equal((await db.query('SELECT status FROM himoto.vehicles WHERE id=$1',[id])).rows[0].status,'ready');
   const resumed=await apply(110,'resume',{vehicle_ids:[14,15]});assert.equal(resumed.status,'renting');assert(!resumed.all_returned);assert.equal(resumed.plan.periods[1].due_at,'2026-11-10T08:00');assert.equal(resumed.items.length,4);assert.equal(resumed.items.filter(i=>i.completed_at).length,2);
   assert.deepEqual((await db.query('SELECT total,pid FROM himoto.orders WHERE id=110')).rows[0],before);
 });checks.push('Ownership hold returns every vehicle and freezes future accrual; cross-branch multi-vehicle resume appends new rental lines, preserves old debt/receipts/history, and shifts only remaining periods');
 await isolated(async()=>{
   await apply(110,'hold',{at:'2026-10-15T10:00'});await db.query("INSERT INTO himoto.orders(id,store_id,order_status,contract_number,total,pid) VALUES(200,80003,'renting','QA-NEW-CUSTOMER','100000',0)");await db.query("INSERT INTO himoto.order_vehicle_details(id,order_id,vehicle_id,rent_at,return_at) VALUES(2000,200,15,'2026-10-20T08:00+07','2026-11-20T08:00+07')");
   await assert.rejects(()=>apply(110,'resume',{vehicle_ids:[14,15]}),e=>e.code==='P0001'||e.status===409);
   const state=await staff(()=>life.readContractLifecycle(db,110));assert.equal(state.status,'reserved');assert.equal(state.items.length,2);assert.equal((await db.query('SELECT status FROM himoto.vehicles WHERE id=14')).rows[0].status,'ready');
   await db.query("UPDATE himoto.vehicles SET status='ready' WHERE id IN(17,18)");assert.equal((await apply(110,'resume',{vehicle_ids:[17,18]})).status,'renting');
 });checks.push('A new customer rental blocks reuse during resume; a failure on the second vehicle rolls back the first vehicle and new lines, while different available vehicles can be selected');
 await isolated(async()=>{
   await apply(111,'hold',{at:'2026-10-15T10:00'});await assert.rejects(()=>apply(111,'resume',{vehicle_ids:[16],resume_end:'2026-11-24T10:00',resume_package:'Theo tháng',resume_amount:'350000'}),e=>e.status===409);
   const resumed=await apply(111,'resume',{vehicle_ids:[16]});assert.equal(resumed.status,'renting');assert.equal(resumed.plan,null);assert.equal(Date.parse(resumed.end_at),Date.parse('2027-04-10T08:00:00+07:00'));assert.equal(resumed.remaining,650000);
 });checks.push('Legacy ownership resumes extend the original deadline by the pause without inventing a new installment amount or changing old debt');
 await isolated(async()=>{
   await apply(110,'hold',{at:'2026-10-15T10:00'});
   const result=await life.applyContractLifecycle(db,110,70001,await input(110,'resume',{vehicle_ids:[14,15]}));
   assert.equal(result.status,'renting');assert.equal(result.items.length,4);assert.equal(result.items.filter(i=>i.completed_at).length,2);
 });checks.push('The administrator/owner database path also resumes atomically while preserving both historical vehicle lines');
 await isolated(async()=>{
   await apply(110,'hold',{at:'2026-10-15T10:00'});
   await db.query("INSERT INTO himoto.orders(id,store_id,order_status,contract_number,total,pid) VALUES(201,80003,'completed','QA-HISTORICAL-OVERLAP','100000',100000)");
   await db.query("INSERT INTO himoto.order_vehicle_details(id,order_id,vehicle_id,rent_at,return_at,completed_at) VALUES(2010,201,14,'2026-10-21T08:00+07','2026-10-22T08:00+07','2026-10-22T08:00+07')");
   await assert.rejects(()=>apply(110,'resume',{at:'2026-10-20T10:00',vehicle_ids:[14,15]}),e=>e.code==='P0001'||e.status===409);
   const state=await staff(()=>life.readContractLifecycle(db,110));assert.equal(state.status,'reserved');assert.equal(state.items.length,2);
 });checks.push('Backdated resume cannot overlap another branch historical rental even when the selected vehicle is currently ready');
 await isolated(async()=>{
   await db.query('UPDATE himoto.orders SET pid=0 WHERE id=110');
   const held=await apply(110,'hold',{at:'2026-10-15T10:00'});assert(held.hold_was_overdue);assert(!held.hold_can_resume);assert(held.hold_expired);assert.equal(held.status,'reserved');
   await assert.rejects(()=>staff(()=>payments.recordContractPayment(db,110,70001,payments.parseContractPayment({request_id:randomUUID(),revision:held.revision,amount:'1',method:'cash',account_id:93001,paid_at:'2026-10-24T09:00',purpose:'extra',note:'No extra charge during hold QA'}))),e=>e.status===409);
   const paid=await staff(()=>payments.recordContractPayment(db,110,70001,payments.parseContractPayment({request_id:randomUUID(),revision:held.revision,amount:'100000',method:'cash',account_id:93001,paid_at:'2026-10-24T09:00',note:'Pay old debt during pause QA'})));assert.equal(paid.context.remaining,0);
   await assert.rejects(()=>apply(110,'resume',{vehicle_ids:[14,15]}),e=>e.status===409&&/quá hạn/.test(e.message));
   const closed=await apply(110,'complete_hold');assert.equal(closed.status,'completed');assert.equal(closed.remaining,0);assert(closed.completed_from_hold);assert.equal(closed.waived_amount,0);
 });checks.push('Overdue-at-entry ownership holds remain in hold after expiration and cannot resume even after the old debt is subsequently paid');
 await isolated(async()=>{
   await db.query("INSERT INTO himoto.transactions(order_id,name,type,status,value,store_id,user_id,cash_id,note,created_at) VALUES(110,'order:payment','in','approved',100000,80001,70001,93001,'Later payment QA','2026-10-20T10:00+07')");
   const held=await apply(110,'hold',{at:'2026-10-15T10:00'});assert(held.hold_was_overdue);assert(!held.hold_can_resume);
 });checks.push('Backdated holds classify payment lateness at the actual hold start, without letting a later receipt turn that old overdue case into a resumable one');
 await isolated(async()=>{
   await db.query("UPDATE himoto.orders SET total='200000',pid=200000 WHERE id=110");
   await db.query("INSERT INTO himoto.transactions(order_id,name,type,status,value,store_id,user_id,cash_id,note,created_at) VALUES(110,'order:extra','in','approved',100000,80001,70001,93001,'Extra charged after entered hold date QA','2026-10-20T10:00+07')");
   const held=await apply(110,'hold',{at:'2026-10-15T10:00'});assert(!held.hold_was_overdue);assert(held.hold_can_resume);
 });checks.push('A later one-time charge and its receipt are excluded together when classifying the earlier hold entry');
 await isolated(async()=>{
   await db.query('UPDATE himoto.orders SET pid=1000000 WHERE id=110');
   await db.query("INSERT INTO himoto.transactions(order_id,name,type,status,value,store_id,user_id,cash_id,note,created_at) VALUES(110,'order:deposit','in','approved',1000000,80001,70001,93001,'Real deposit fixture QA','2026-10-01T08:00+07')");
   await apply(110,'hold',{at:'2026-10-15T10:00'});const txBefore=(await db.query('SELECT * FROM himoto.transactions WHERE order_id=110 ORDER BY id')).rows;
   const request=await input(110,'complete_hold'),closed=await staff(()=>life.applyContractLifecycle(db,110,70001,request));assert.equal(closed.status,'completed');assert.equal(closed.waived_amount,100000);assert.equal(closed.total_amount,0);assert.equal(closed.remaining,0);assert.equal(closed.deposit_held,1000000);assert.equal(closed.paid_amount,0);assert.equal(closed.plan,null);
   assert.deepEqual((await db.query('SELECT * FROM himoto.transactions WHERE order_id=110 ORDER BY id')).rows,txBefore);
   const snapshot=(await db.query('SELECT total,pid,draft_payload FROM himoto.orders WHERE id=110')).rows[0];assert.equal(Number(snapshot.pid),1000000);assert.equal(snapshot.draft_payload.management_composer.lifecycle.hold_completion.original_total,100000);assert.equal(snapshot.draft_payload.management_composer.lifecycle.hold_completion.hold.plan.end,original.end);
   const paymentContext=await staff(()=>payments.readPaymentContext(db,110));assert(paymentContext.completed_from_hold);assert(!paymentContext.hold_active);
   const repeated=await staff(()=>life.applyContractLifecycle(db,110,70001,request));assert.equal(repeated.events.filter(e=>e.action==='complete_hold').length,1);
   await assert.rejects(()=>apply(110,'resume',{vehicle_ids:[14,15]}),e=>e.status===409);
   await assert.rejects(()=>staff(()=>payments.recordContractPayment(db,110,70001,payments.parseContractPayment({request_id:randomUUID(),revision:closed.revision,amount:'1',method:'cash',account_id:93001,paid_at:'2026-10-24T11:00',purpose:'extra',note:'Must not revive waived rent QA'}))),e=>e.status===409);
 });checks.push('Explicit completion waives uncollected accrued rent and cancels future periods, preserves every real receipt/deposit and original terms, closes once and cannot revive waived collections');
 await isolated(async()=>{
   await db.query("UPDATE himoto.orders SET total='200000',pid=100000 WHERE id=110");
   await db.query("INSERT INTO himoto.transactions(order_id,name,type,status,value,store_id,user_id,cash_id,note,created_at) VALUES(110,'order:payment','in','approved',100000,80001,70001,93001,'Actual partial rental receipt QA','2026-10-01T08:00+07')");
   await apply(110,'hold',{at:'2026-10-15T10:00'});
   const revenue=load(path.join(root,'lib/server/rental-revenue')).rentalRevenue;
   const before=await revenue(db,'2026-10-01','2026-10-31',80001);assert.equal(before.total.revenue,100000);
   const closed=await apply(110,'complete_hold');assert.equal(closed.waived_amount,100000);assert.equal(closed.paid_amount,100000);assert.equal(closed.total_amount,100000);assert.equal(closed.remaining,0);
   assert.deepEqual(await revenue(db,'2026-10-01','2026-10-31',80001),before);
   const renewals=load(path.join(root,'lib/server/contract-renewals'));
   await assert.rejects(()=>staff(()=>renewals.recordContractRenewal(db,110,70001,renewals.parseRenewalInput({item_id:1100,item_revision:'1',order_revision:closed.revision,return_at:'2027-05-01T08:00',amount:'100000',note:'Cannot revive a closed hold through historical renewal QA',occurred_at:'2026-10-14T10:00'}))),e=>e.status===409&&/hoàn thành sau bảo lưu/.test(e.message));
   const raw=(await db.query(load(path.join(root,'lib/server/contract-drafts')).CONTRACT_LIST_SQL+' AND o.id=$1',[110])).rows[0];
   const row=load(path.join(root,'lib/management/repository')).mapApiRow('contracts',raw);
   const monitored=load(path.join(root,'lib/management/contract-overdue')).withContractMonitoring(row,Date.parse('2027-10-01T08:00+07:00'));
   assert.equal(monitored.status,'completed');assert.equal(monitored.collection_overdue,0);assert.equal(Number(monitored.rental_debt_amount),0);
 });checks.push('Uncollectible accrued debt is a separate loss: partial real revenue stays unchanged, future periods do not become losses, no expense is invented, and the completed contract leaves debt monitoring');
 await isolated(async()=>{
   await apply(110,'hold',{at:'2026-10-15T10:00',hold_until:'2026-10-26T10:00'});
   await assert.rejects(()=>apply(110,'complete_hold'),e=>e.status===409);await assert.rejects(()=>apply(110,'resume',{vehicle_ids:[14,15]}),e=>e.status===409);
   const edited=await apply(110,'update_hold',{hold_until:'2026-10-20T10:00'});assert(edited.hold_expired);assert.equal(edited.held_at,'2026-10-15T10:00');assert.equal(edited.plan.stopped_at,'2026-10-15T10:00');assert.equal(edited.status,'reserved');
   const raw=(await db.query(load(path.join(root,'lib/server/contract-drafts')).CONTRACT_LIST_SQL+' AND o.id=$1',[110])).rows[0];
   const mapped=load(path.join(root,'lib/management/repository')).mapApiRow('contracts',raw);assert.equal(mapped.hold_until,'2026-10-20T10:00');assert(domain.expiredOwnershipHold(mapped));
   const monitored=load(path.join(root,'lib/management/contract-overdue')).withContractMonitoring(mapped,Date.parse('2027-01-01T10:00+07:00'));assert.equal(monitored.status,'reserved');assert.equal(monitored.collection_overdue,0);assert.equal(monitored.total_amount,100000);
 });checks.push('Ending a hold requires its entered deadline; editing that deadline keeps the original freeze and state, and never resumes or completes automatically');
 await isolated(async()=>{
   await db.query('UPDATE himoto.orders SET store_id=80003 WHERE id=100');await assert.rejects(()=>staff(()=>life.readContractLifecycle(db,100)),e=>e.status===404);await assert.rejects(()=>staff(()=>life.applyContractLifecycle(db,100,70001,{action:'mark_bad_debt',revision:'1',request_id:randomUUID(),note:'Foreign contract must fail QA',at:'2026-10-24T10:00',confirmed:true})),e=>e.status===404);
   await assert.rejects(()=>apply(101,'hold'),e=>e.status===409);assert.throws(()=>life.parseContractLifecycle({action:'hold'}));assert.throws(()=>domain.legacyResumePlan(0,'2026-10-01T08:00','2026-10-24T10:00','2026-10-23T10:00','Theo tháng',100000));
 });checks.push('Foreign contract IDs, non-ownership holds and incomplete/date-invalid confirmations fail closed; no blacklist or notification is changed');
 await c.query('ROLLBACK');
 }finally{await c.query('ROLLBACK').catch(()=>{});c.release();await globalThis.himotoPool?.end();}
 console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0,realSequenceChanges:0,realTelegramRequests:0},null,2));
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
