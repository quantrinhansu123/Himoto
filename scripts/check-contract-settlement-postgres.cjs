// Uses an existing synthetic fixture on the dedicated loopback QA cluster only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const openFixture=require('./lib/peak-staging.cjs'),{load,root}=require('./lib/load-typescript.cjs');
async function main(){
 const qa=await openFixture(process.argv[2]),c=await qa.pool.connect(),checks=[],schema='qa_payment_settlement';
 const life=load(path.join(root,'lib/server/contract-lifecycle')),domain=load(path.join(root,'lib/management/contract-lifecycle'));
 const billing=load(path.join(root,'lib/management/contract-billing')),returns=load(path.join(root,'lib/server/contract-returns')),payments=load(path.join(root,'lib/server/contract-payments'));
 const {dataAccess}=load(path.join(root,'lib/server/access-context'));
 const original=billing.createInstallmentPlan('2026-10-01T08:00','2027-04-01T08:00','Theo th\u00e1ng',100000);
 try{
 await c.query('BEGIN');await c.query(`SET LOCAL lock_timeout='5s';CREATE SCHEMA ${schema}`);
 const tables=['users','roles','stores','staff_profiles','customers','orders','vehicles','banks','cash','transactions','order_vehicle_details','activity_logs','battery_contracts','store_duty_schedules','management_contract_payments','management_contract_vehicle_swaps','management_record_photos','gps_devices','gps_positions','vehicle_location_events','vehicle_transfers','management_contract_types','management_contract_notifications','management_account_access','management_access_audit','management_account_passwords'];
 for(const table of tables)await c.query(`CREATE TABLE ${schema}.${table}(LIKE himoto.${table} INCLUDING DEFAULTS INCLUDING INDEXES INCLUDING CONSTRAINTS)`);
 await c.query(`ALTER TABLE ${schema}.management_account_access DROP CONSTRAINT IF EXISTS account_access_admin_management;
   ALTER TABLE ${schema}.management_account_access ADD CONSTRAINT account_access_admin_management CHECK(access_role='admin' OR NOT (permissions ? 'accounts.manage'))`);
 for(const file of ['2026-10-17-account-access.sql','2026-10-24-staff-accounts.sql','2026-10-18-shared-vehicle-inventory.sql','2026-10-20-reservation-window-conflicts.sql','2026-10-20-returned-vehicle-availability.sql','2026-10-20-cross-branch-contract-vehicles.sql','2026-10-21-contract-vehicle-labels.sql','2026-10-21-returned-vehicle-conflicts.sql','2026-10-23-ownership-hq-vehicles.sql','2026-10-24-bad-debt-recovery.sql','2026-10-24-contract-lifecycle.sql','2026-11-01-ownership-hq-customer-source.sql','2026-11-02-ownership-scope-helpers.sql','2026-11-11-access-order-store-inline.sql','2026-10-29-contract-vehicle-owner-labels.sql','2026-11-08-contract-vehicle-label-performance.sql','2026-11-12-bounded-contract-vehicles.sql','2026-11-12-payment-closure-vehicle-holds.sql','2026-11-12-ownership-manager-permissions.sql']){
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
 const settlement=load(path.join(root,'lib/server/contract-settlement')),permissions=load(path.join(root,'lib/management/permissions'));
 const accounts=load(path.join(root,'lib/server/account-management'));
 await db.query("UPDATE himoto.stores SET kind='lease_to_own' WHERE id=80001;UPDATE himoto.stores SET kind='physical' WHERE id=80002");
 await db.query("INSERT INTO himoto.roles(id,name,slug) VALUES(1,'QA administrator','quan-tri-vien'),(3,'QA staff','nhan-vien'),(4,'QA ownership manager','thue-so-huu-truong-phong'),(5,'QA accounting','ke-toan')");
 await db.query("INSERT INTO himoto.users(id,name,email,password,role_id,role,status,store_id) VALUES(202,'QA primary','qa-primary@example.invalid','unused',1,'admin','active',NULL),(70002,'QA secondary admin','qa-other@example.invalid','unused',1,'admin','active',NULL),(70003,'QA foreign staff','qa-foreign@example.invalid','unused',3,'nhan-vien','active',80003)");
 await db.query("INSERT INTO himoto.management_account_access(user_id,login_name,access_role,store_id,scope_all,permissions,enabled) VALUES(70001,'qa.manager','ownership_manager',NULL,true,'[]',true),(202,'qa.primary','admin',NULL,true,'[]',true),(70002,'qa.other','admin',NULL,true,'[]',true),(70003,'qa.foreign','branch_staff',80003,false,'[]',true)");
 const ownerScope={...scope,access_role:'ownership_manager',store_kind:'lease_to_own',permissions:[...permissions.ACCESS_PERMISSIONS]};
 const owner=fn=>staff(()=>dataAccess.run(ownerScope,fn));
 const body=async(id,mode,amount,extra={})=>({request_id:randomUUID(),revision:await rev(id),mode,amount,paid_at:'2026-10-24T12:00',note:'Synthetic settlement QA',confirmed:true,...(Number(amount)>0?{method:'cash',account_id:93001}:{}),...(mode!=='partial'?{vehicles_confirmed:true,vehicles:(await payments.readPaymentContext(db,id)).items.map(item=>({item_id:item.id,revision:item.revision,status:'with_customer'}))}:{}),...extra});
 const applyPayment=(id,value)=>owner(()=>settlement.settleContract(db,id,70001,value));
 const state=async id=>(await db.query('SELECT order_status,total,pid,draft_payload FROM himoto.orders WHERE id=$1',[id])).rows[0];
 const cashCount=async()=>Number((await db.query('SELECT count(*) AS n FROM himoto.transactions')).rows[0].n);
 const existing=(await db.query('SELECT store_id,scope_all,permissions FROM himoto.management_account_access WHERE user_id=70001')).rows[0];
 assert.equal(Number(existing.store_id),80001);assert.equal(existing.scope_all,false);assert(existing.permissions.includes('contracts.delete'));
 const liveSession=await load(path.join(root,'lib/server/management-session')).sessionUserById(70001,0,db);
 assert.equal(liveSession.store_id,80001);assert.equal(liveSession.scope_all,false);assert(permissions.canSettleContract(liveSession));
 assert(permissions.canSettleContract(await load(path.join(root,'lib/server/management-session')).sessionUserById(202,0,db)));
 assert(!permissions.canSettleContract(await load(path.join(root,'lib/server/management-session')).sessionUserById(70002,0,db)));
 checks.push('SQL normalizes existing global ownership-manager accounts into the lease-to-own store; fresh sessions get full local permissions and only the designated global administrator gets settlement rights');
 await isolated(async()=>{
   const first=await body(100,'partial','100000'),result=await applyPayment(100,first);
   assert.equal(result.context.paid_amount,100000);assert.equal(result.context.settlement_remaining,900000);assert.equal((await state(100)).order_status,'renting');assert.equal(await cashCount(),1);
   assert.equal((await applyPayment(100,first)).replayed,true);assert.equal(await cashCount(),1);
   const full=await body(100,'full','900000');const closed=await applyPayment(100,full);
   assert.equal(closed.context.status,'completed');assert.equal(closed.context.remaining,0);assert.equal(closed.context.items.length,2);assert.equal(await cashCount(),2);
   assert.equal((await state(100)).total,'1000000');assert.equal(Number((await state(100)).pid),1000000);
   await db.query("UPDATE himoto.vehicles SET status='ready' WHERE id IN(10,11)");
   assert.equal((await db.query('SELECT available FROM himoto.vehicle_inventory() WHERE id=10')).rows[0].available,false);
   assert.equal((await db.query('SELECT himoto.vehicle_has_open_rental(10) AS blocked')).rows[0].blocked,true);
   assert.equal((await db.query('SELECT * FROM himoto.vehicle_window_conflicts(ARRAY[10::bigint],NULL,now(),now()+interval \'1 day\')')).rowCount,1);
   assert.equal((await db.query('SELECT * FROM himoto.vehicle_rental_sources(ARRAY[10::bigint])')).rowCount,1);
   assert.equal((await db.query('SELECT himoto.vehicle_has_other_rental(10,999999) AS blocked')).rows[0].blocked,true);
   const closure=structuredClone((await state(100)).draft_payload.management_composer.lifecycle.payment_closure);
   const item=(await owner(()=>payments.readPaymentContext(db,100))).items[0];
   await owner(()=>returns.recordBadDebtRecovery(db,70001,{request_id:randomUUID(),item_id:item.id,item_revision:item.revision,recovered_at:'2026-10-25T12:00',note:'Actual recovery after closure'}));
   assert.equal((await owner(()=>payments.readPaymentContext(db,100))).items.length,1);
   assert.equal((await db.query('SELECT available FROM himoto.vehicle_inventory() WHERE id=10')).rows[0].available,true);
   assert.equal((await db.query('SELECT available FROM himoto.vehicle_inventory() WHERE id=11')).rows[0].available,false);
   assert.deepEqual((await state(100)).draft_payload.management_composer.lifecycle.payment_closure,closure);assert.equal(await cashCount(),2);
 });checks.push('A 100,000 partial receipt keeps a 1,000,000 contract open; collecting the remaining 900,000 closes it once. Cars left with the customer remain blocked even if their vehicle status says ready, and later physical recovery releases only the returned car');
 await isolated(async()=>{
   const before=await state(101),count=await cashCount(),value=await body(101,'close_unpaid','0');
   const result=await applyPayment(101,value);assert.equal(result.context.status,'completed');assert.equal(result.context.remaining,1000000);assert.equal(await cashCount(),count);
   assert.equal((await state(101)).total,before.total);assert.equal((await state(101)).pid,before.pid);
   assert.equal((await applyPayment(101,value)).replayed,true);assert.equal(await cashCount(),count);
   await assert.rejects(()=>applyPayment(101,{...value,note:'Different operation'}),e=>e.status===409);
   const stats=load(path.join(root,'lib/server/contract-table-stats'));
   const mapped=stats.mapContractStatistics((await db.query(stats.contractStatisticsSql(' AND o.id=101',false))).rows[0]);
   assert(mapped.bad_debt_closed_at);assert.equal(load(path.join(root,'lib/management/contract-summary')).summarizeContracts([mapped],[]).receivableAmount,1000000);
   await assert.rejects(()=>owner(()=>load(path.join(root,'lib/server/contract-deletion')).deleteContractRecord(db,101,result.context.revision,ownerScope)),e=>e.status===409);
   const collection=await body(101,'partial','250000');delete collection.vehicles;delete collection.vehicles_confirmed;
   const paid=await applyPayment(101,collection);assert.equal(paid.context.remaining,750000);assert.equal(paid.context.status,'completed');
   const final=await body(101,'full','750000');delete final.vehicles;delete final.vehicles_confirmed;
   const done=await applyPayment(101,final);assert.equal(done.context.remaining,0);assert.equal(done.context.status,'completed');
   assert.equal((await state(101)).draft_payload.management_composer.lifecycle.payment_closure.at,value.paid_at+':00+07:00');
 });checks.push('Zero-payment closure creates no transaction and preserves the full receivable in statistics. Closed debt cannot be hidden, replay is safe, and subsequent partial/final receipts reduce the debt without changing the original closure');
 await isolated(async()=>{
   const value=await body(110,'close_unpaid','0');value.vehicles=value.vehicles.map(item=>({...item,status:'returned',returned_at:value.paid_at}));
   const closed=await applyPayment(110,value);assert.equal(closed.context.status,'completed');assert.equal(closed.context.items.length,0);assert.equal(await cashCount(),0);
   assert.equal((await state(110)).draft_payload.management_composer.installment_plan.stopped_at,value.paid_at);
   assert.equal((await db.query('SELECT available FROM himoto.vehicle_inventory() WHERE id=14')).rows[0].available,true);
   const later=await payments.readPaymentContext(db,110,{page:1,size:25,asOf:Date.parse('2028-01-01T00:00Z')});assert.equal(later.total_amount,closed.context.total_amount);
 });checks.push('Closing with explicit returned-car choices records actual physical returns atomically, frees those cars, preserves money and freezes ownership installments against future accrual');
 await isolated(async()=>{
   const before=await owner(()=>payments.readPaymentContext(db,110));
   const value=await body(110,'full',String(before.settlement_remaining)),result=await applyPayment(110,value);
   assert.equal(result.context.remaining,0);assert.equal(result.context.total_amount,before.settlement_total);assert.equal(result.context.deposit_held,0);
   const resolution=await owner(()=>load(path.join(root,'lib/server/contract-resolution')).readContractResolution(db,110));assert.equal(resolution.overpayment,0);assert.equal(resolution.remaining,0);
   const stats=load(path.join(root,'lib/server/contract-table-stats'));
   const row=stats.mapContractStatistics((await db.query(stats.contractStatisticsSql(' AND o.id=110',false))).rows[0]);
   for(const clock of ['2026-11-12T00:00Z','2028-01-01T00:00Z'])assert.equal(billing.applyInstallmentBilling(row,Date.parse(clock)).total_amount,before.settlement_total);
   assert.equal((await state(110)).total,'100000');
 });checks.push('Full ownership settlement pays the complete agreed schedule, preserves the original stored base and records no false overpayment; list/statistics totals stay fixed after closure');
 await isolated(async()=>{
   const value=await body(100,'full','1000000');value.vehicles[0]={...value.vehicles[0],status:'returned',returned_at:'2026-09-01T12:00'};
   await c.query('SAVEPOINT invalid_recovery');
   await assert.rejects(()=>applyPayment(100,value),e=>e.status===400);
   await c.query('ROLLBACK TO SAVEPOINT invalid_recovery');await c.query('RELEASE SAVEPOINT invalid_recovery');
   assert.equal(await cashCount(),0);assert.equal((await state(100)).order_status,'renting');assert.equal(Number((await state(100)).pid),0);
 });checks.push('A failed physical-return validation rolls back the prior receipt and closure together; no partial payment, closed status or duplicate transaction survives');
 await isolated(async()=>{
   const value=await body(100,'close_unpaid','0');delete value.vehicles_confirmed;
   await assert.rejects(()=>applyPayment(100,value),e=>e.status===409);
   const stale={...await body(100,'close_unpaid','0'),revision:'0'};await assert.rejects(()=>applyPayment(100,stale),e=>e.status===409);
   const outdated=await body(100,'full','1000000');outdated.vehicles[0].revision='0';await assert.rejects(()=>applyPayment(100,outdated),e=>e.status===409);
   const foreignBody=await body(101,'close_unpaid','0');await db.query('UPDATE himoto.orders SET store_id=80003 WHERE id=101');await assert.rejects(()=>applyPayment(101,foreignBody),e=>e.status===404);
   assert.equal(await cashCount(),0);assert.equal((await state(100)).order_status,'renting');
 });checks.push('Missing vehicle confirmation, stale contract/vehicle revisions and foreign-store IDs are rejected without receipts or closure');
 await isolated(async()=>{
   const values={name:'QA local manager',login_name:'qa.new.manager',password:'',access_role:'branch_manager',store_id:80001,scope_all:false,permissions:[],enabled:true};
   const saved=await accounts.saveManagedAccount(db,70001,values,undefined,ownerScope);
   const access=(await db.query('SELECT access_role,store_id,scope_all,permissions FROM himoto.management_account_access WHERE user_id=$1',[saved.id])).rows[0];
   assert.equal(access.access_role,'ownership_manager');assert.equal(access.scope_all,false);assert.equal(Number(access.store_id),80001);assert(access.permissions.includes('finance.write'));
   const listed=await accounts.listManagedAccounts(db,ownerScope);assert(listed.some(a=>a.id===saved.id));assert(!listed.some(a=>[202,70002,70003].includes(a.id)));
   await assert.rejects(()=>accounts.listManagedAccounts(db,ownerScope,80003),e=>e.status===403);
   await assert.rejects(()=>accounts.saveManagedAccount(db,70001,{...values,access_role:'admin'},undefined,ownerScope),e=>e.status===403);
   await assert.rejects(()=>accounts.saveManagedAccount(db,70001,{...values,store_id:80003},undefined,ownerScope),e=>e.status===403);
   const foreign=(await db.query('SELECT xmin::text AS revision FROM himoto.users WHERE id=70003')).rows[0].revision;
   await assert.rejects(()=>accounts.deleteManagedAccount(db,70001,70003,foreign,ownerScope),e=>e.status===403);
   await c.query('SAVEPOINT forbidden_account_grant');
   await assert.rejects(()=>db.query(`UPDATE himoto.management_account_access SET permissions='["accounts.manage"]'::jsonb WHERE user_id=70003`),e=>e.code==='23514');
   await c.query('ROLLBACK TO SAVEPOINT forbidden_account_grant');await c.query('RELEASE SAVEPOINT forbidden_account_grant');
   await owner(async()=>{const same=await db.query("UPDATE himoto.stores SET store_phone='QA local only' WHERE id=80001");assert.equal(same.rowCount,1);assert.equal((await db.query("UPDATE himoto.stores SET store_phone='forbidden' WHERE id=80003")).rowCount,0);});
   await db.query("UPDATE himoto.stores SET store_name='Trụ sở chính QA' WHERE id=80003;UPDATE himoto.orders SET store_id=80003 WHERE id=101");
   await owner(async()=>{assert.equal((await db.query('SELECT id FROM himoto.orders WHERE id=101')).rowCount,1);assert.equal((await db.query("UPDATE himoto.orders SET total='0' WHERE id=101")).rowCount,0);});
 });checks.push('A manager created at the lease-to-own store automatically receives the local administrator role; account administration and store-profile writes cannot reach another store or global administrators');
 }finally{await c.query('ROLLBACK').catch(()=>{});c.release();await qa.close();}
 console.log(JSON.stringify({passed:checks.length,checks,fixtureOnly:true,external_network_allowed:false,realBusinessWrites:0},null,2));
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
 const recover=async item=>staff(async()=>returns.recordBadDebtRecovery(db,70001,{item_id:item,item_revision:(await db.query('SELECT xmin::text AS revision FROM himoto.order_vehicle_details WHERE id=$1',[item])).rows[0].revision,request_id:randomUUID(),recovered_at:'2026-10-24T11:00',note:''}));
