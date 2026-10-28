// PostgreSQL fixtures are TEMP only. No business rows/sequences or Telegram sends.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const next=require('next/server'),afterOriginal=next.after,callbacks=[];next.after=callback=>callbacks.push(callback);
const {load,root}=require('./lib/load-typescript.cjs');
const db=load(root+'/lib/server/himoto-database'),session=load(root+'/lib/server/management-session');
const ownership=load(root+'/lib/management/ownership-report'),source=load(root+'/lib/server/ownership-report');
const collection=load(root+'/lib/management/collection-report'),collectionServer=load(root+'/lib/server/collection-report');
const {dataAccess}=load(root+'/lib/server/access-context'),telegram=load(root+'/lib/server/report-telegram');
const {sealIntegrationSecret}=load(root+'/lib/server/integration-secrets');
const snapshots=load(root+'/lib/server/shift-audits');snapshots.readShiftSnapshot=async()=>({values:{},assets_total:0});
const {vietnamDate}=load(root+'/lib/management/duty-roster');
let actor={id:1,store_id:35,scope_all:true,access_role:'admin',permissions:['contracts.read','contracts.draft']};
const checks=[],today=vietnamDate(),rewrite=sql=>sql.replaceAll('himoto.','pg_temp.').replaceAll("'pg_temp.scope_all'","'himoto.scope_all'").replaceAll("'pg_temp.store_id'","'himoto.store_id'");
async function main(){const c=await db.ownerDatabase.connect(),descriptors=Object.getOwnPropertyDescriptors(db.himotoPool),originalUser=session.userFromSession,originalRead=session.readSessionUser;
try{
  await c.query('BEGIN');await c.query("SET LOCAL statement_timeout='15s'");
  for(const table of ['stores','users','orders','order_vehicle_details','vehicles','transactions','banks','staff_profiles','management_contract_payments','management_shift_reports','management_shift_requests','management_telegram_settings','management_store_telegram','management_ownership_telegram']){
    await c.query(`CREATE TEMP TABLE ${table} (LIKE himoto.${table})`);
    const required=(await c.query('SELECT attname FROM pg_attribute WHERE attrelid=$1::regclass AND attnum>0 AND attnotnull AND attname<>\'id\'',[`pg_temp.${table}`])).rows;
    for(const {attname} of required)await c.query(`ALTER TABLE pg_temp.${table} ALTER COLUMN "${attname.replaceAll('"','""')}" DROP NOT NULL`);
  }
  for(const table of ['stores','users','orders','vehicles'])await c.query(`ALTER TABLE pg_temp.${table} ADD PRIMARY KEY(id)`);
  await c.query('ALTER TABLE pg_temp.management_shift_reports ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY; ALTER TABLE pg_temp.management_shift_reports ALTER COLUMN revision SET DEFAULT 1; ALTER TABLE pg_temp.management_shift_reports ALTER COLUMN updated_at SET DEFAULT now(); ALTER TABLE pg_temp.management_shift_reports ADD PRIMARY KEY(id); ALTER TABLE pg_temp.management_shift_reports ADD UNIQUE(store_id,report_date); ALTER TABLE pg_temp.management_shift_requests ADD PRIMARY KEY(request_id)');
  await c.query(rewrite(fs.readFileSync('docs/sql/2026-10-24-operating-reports.sql','utf8').replace(/^BEGIN;|^COMMIT;/gm,'')));
  await c.query("INSERT INTO stores(id,store_name,kind) VALUES(35,'QA Ownership','lease_to_own'),(23,'QA Branch','physical'); INSERT INTO users(id,name) VALUES(1,'QA'),(2,'QA Other')");
  await c.query("INSERT INTO vehicles(id,name,license,status,store_id,deleted_at) VALUES(1,'QA','QA-1','using',35,NULL),(2,'QA','QA-2','ready',35,NULL),(3,'QA','QA-3','ready',35,now())");
  for(const [id,store,vehicle,term,anchor] of [[1,35,1,'24',false],[2,35,1,'12',false],[3,35,2,null,true],[4,23,2,'18',false]]){
    const payload={management_composer:{draft:{ownership_term_months:term}},...(anchor?{legacy_migration:{sourceStoreId:'30'}}:{})};
    await c.query(`INSERT INTO orders(id,store_id,order_status,order_type,contract_number,customer_name,draft_payload,rent_at,return_at,total,pid) VALUES($1,$2,'renting','ownership',$3,'QA',$4,$5::date,$5::date+interval '1 year','1000','500')`,[id,store,`QA-${id}`,payload,today]);
    await c.query("INSERT INTO order_vehicle_details(id,order_id,vehicle_id,type,rent_at,return_at) VALUES($1,$1,$2,'day',$3::date,$3::date+interval '1 year')",[id,vehicle,today]);
  }
  for(const [id,order,name,type,value,status] of [[1,1,'addon','addon',100,'approved'],[2,1,'order:rental_fees','in',500,'approved'],[3,1,'order:deposit','in',200,'approved'],[4,1,'order:return_late','in',30,'approved'],[5,1,'order:rental_refund','out',20,'approved'],[6,1,'order:deposit_refund','out',50,'approved'],[7,1,'order:payment','in',999,'pending'],[8,1,'order:payment','in',999,'approved'],[9,null,'battery:rental','in',40,'approved'],[10,3,'addon','addon',70,'approved'],[11,3,'order:deposit:3','in',60,'approved']]){
    await c.query(`INSERT INTO transactions(id,order_id,store_id,name,type,value,status,created_at,object_type,object_id) VALUES($1,$2,35,$3,$4,$5,$6,($7::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')+($8::integer*interval '1 hour'),$9,$10)`,[id,order,name,type,value,status,today,id===8?24:12,id===9?'battery_contract':null,id===9?1:null]);
  }
  const temp={query:(sql,args)=>c.query(rewrite(sql),args)};
  const report=await source.readOwnershipReport(temp,35,today);
  assert.equal(report.app.running,1);assert.equal(report.app.term_12,1);assert.equal(report.app.stock,2);assert.equal(report.app.new_day,3-1); // two vehicle orders, excludes battery anchor
  assert.equal(report.app.rental_day,610);assert.equal(report.app.revenue_month,610);assert.equal(report.app.income_day,830);assert.equal(report.app.deposit_day,200);assert.equal(report.app.refund_day,50);
  assert.equal(report.app.battery_income_day,170);assert.equal(report.app.battery_deposit_day,60);assert.equal(report.app.battery_rental_day,110);
  assert.equal(report.app.reserved,0);assert.equal(report.values.reserved,0);
  for(const key of ['bought_month','battery_sale_day','charger_sale_day','thu_actual','book_income'])assert.equal(report.values[key],null);
  await c.query('SAVEPOINT held_report');await c.query("UPDATE orders SET order_status='reserved' WHERE id=1");assert.equal((await source.readOwnershipReport(temp,35,today)).app.reserved,1);await c.query('ROLLBACK TO SAVEPOINT held_report');
  checks.push('Distinct vehicle counts and explicit terms; approved Vietnam-day receipts include legacy addon renewals, exclude pending/next-day and battery anchors; unknown sources stay null.');
  await c.query('UPDATE orders SET customer_id=111 WHERE id IN(1,2)');await c.query('UPDATE order_vehicle_details SET completed_at=$1::date WHERE id IN(1,2)',[today]);
  assert.equal((await source.readOwnershipReport(temp,35,today)).app.returned_month,1);
  await c.query('UPDATE order_vehicle_details SET completed_at=NULL WHERE id IN(1,2)');
  const past=await source.readOwnershipReport(temp,35,'2026-10-01');assert.equal(past.app.running,null);assert.equal(past.app.stock,null);
  assert.equal(ownership.reconciliation(null,0),'Chưa đối chiếu');assert.equal(ownership.reconciliation(100,100),'Khớp');assert.throws(()=>ownership.validateOwnershipSubmission(report));
  const complete={...report,values:Object.fromEntries(ownership.ownershipKeys.map(key=>[key,report.values[key]??0]))};ownership.validateOwnershipSubmission(complete);ownership.parseOwnershipReport(complete);assert.throws(()=>ownership.parseOwnershipReport({...complete,values:{...complete.values,stock:-1}}));
  const text=ownership.ownershipReportText(today,complete);assert(text.includes('Em gửi a/c báo cáo ngày'));assert(!text.includes('undefined'));assert(text.includes('Chưa đối chiếu'));
  checks.push('Historical inventory is not fabricated; incomplete/invalid reports cannot submit; reconciliations require both independent numbers and preserve mismatches.');
  const scope=load(root+'/lib/server/management-table');
  const total=await scope.readManagementTable(temp,'contracts',new URLSearchParams({scope:'ownership',store:'35',status:'draft',scope_count:'1'}));assert.equal(total.total,0);assert.equal(total.scopeCount,2);
  checks.push('The all-contract tile is exact even on an empty status tab and excludes imported battery receipt anchors.');
  const calls=[];
  Object.defineProperty(db.himotoPool,'connect',{configurable:true,value:async()=>({release(){},async query(sql,args){if(sql==='BEGIN'){await c.query('SAVEPOINT request_test');return {rows:[]};}if(sql==='COMMIT'){await c.query('RELEASE SAVEPOINT request_test');return {rows:[]};}if(sql==='ROLLBACK'){await c.query('ROLLBACK TO SAVEPOINT request_test');await c.query('RELEASE SAVEPOINT request_test');return {rows:[]};}return temp.query(sql,args);}})});
  session.userFromSession=async()=>actor;session.readSessionUser=async()=>actor;
  const routes=load(root+'/app/api/auth/shift-reports/route'),debts=load(root+'/app/api/auth/gps/debts/route'),followups=load(root+'/app/api/auth/order/car-rental/followups/route');
  const request=(url,method,body,key)=>new next.NextRequest('http://localhost'+url,{method,headers:{origin:'http://localhost','content-type':'application/json',...(key?{'x-shift-request-id':key}:{})},body:JSON.stringify(body)});
  const base={store_id:35,date:today,staff:'QA',vehicles:0,batteries:0,charged:0,transfers:0,cash:0,personal:0,company:0,electricity_off:true,notes:'',ownership_report:complete};
  const post=async(body,key=randomUUID())=>{const r=await routes.POST(request('/api/auth/shift-reports','POST',body,key));return {status:r.status,...await r.json()};};
  const draft=await post({payload:base,status:'draft'});assert.equal(draft.status,200,draft.message);
  const key=randomUUID(),body={id:draft.data.id,revision:draft.data.revision,payload:{...base,ownership_report:{...complete,app:{...complete.app,income_day:777},thu_balance:777}},status:'submitted'};
  const saved=await post(body,key);assert.equal(saved.status,200,saved.message);assert.equal(saved.data.ownership_report.app.income_day,830);assert.notEqual(saved.data.ownership_report.thu_balance,777);assert.deepEqual(await post(body,key),saved);
  assert.equal((await c.query('SELECT count(*)::int AS n FROM management_report_deliveries')).rows[0].n,1);
  assert.equal((await post({...body,revision:saved.data.revision,status:'draft'})).status,409);assert(callbacks.length>=1);callbacks.length=0;
  checks.push('Submission uses a fresh server financial source, ignores client-forged app balances, locks the report and queues one notification across a lost-response replay.');
  const f={order_id:1,revision:0,contact_status:'unreachable',handling_status:'escalated',customer_condition:'Khách chưa liên lạc được',notes:'24/10 gọi khách'};
  const patch=async value=>{const r=await followups.PATCH(request('/api/auth/order/car-rental/followups','PATCH',value));return {...await r.json(),status:r.status};};
  assert.equal((await patch(f)).status,200);assert.equal((await patch(f)).status,409);assert.equal((await patch({...f,revision:1,contact_status:'contacted'})).status,200);
  const adminActor=actor;actor={...actor,scope_all:false,access_role:'branch_staff',store_id:23};assert.equal((await patch({...f,revision:2})).status,403);actor=adminActor;
  actor={...adminActor,access_role:'accounting',permissions:['contracts.read','finance.write']};assert.equal((await patch({...f,revision:2,notes:'Read-only role cannot change notes'})).status,403);actor=adminActor;
  assert.equal((await c.query('SELECT count(*)::int AS n FROM management_collection_history')).rows[0].n,2);assert.throws(()=>collection.parseCollectionFollowup({...f,contact_status:'bad'}));
  const notesService=load(root+'/lib/server/collection-followups');
  const noteRows=await notesService.readCollectionFollowups(temp,[1,2]);assert.equal(noteRows[0].followup.notes,f.notes);assert.equal(noteRows[1].followup.notes,'');
  assert.equal((await followups.GET(request('/api/auth/order/car-rental/followups?ids=1,invalid','GET'))).status,400);
  assert.equal((await debts.PATCH(request('/api/auth/gps/debts','PATCH',{...f,revision:1}))).status,409);
  await c.query("SELECT set_config('himoto.scope_all','false',true),set_config('himoto.store_id','23',true)");await c.query('SET LOCAL ROLE himoto_scoped');assert.equal((await c.query('SELECT count(*)::int AS n FROM pg_temp.management_collection_followups')).rows[0].n,0);assert.equal((await c.query('SELECT count(*)::int AS n FROM pg_temp.management_report_deliveries')).rows[0].n,0);await c.query('RESET ROLE');
  checks.push('Customer follow-ups use optimistic revisions and history; read-only roles cannot edit notes and RLS hides notes/history/deliveries outside the branch.');
  const bot=sealIntegrationSecret({token:'QA_TOKEN_NOT_REAL'});await c.query('INSERT INTO management_telegram_settings(singleton,bot_cipher) VALUES(true,$1)',[bot]);await c.query("INSERT INTO management_ownership_telegram(route,chat_id,enabled) VALUES('ownership_new','QA_CHAT',true)");
  const send=async(_url,options)=>{calls.push(JSON.parse(options.body));return new Response(JSON.stringify({ok:true,result:{message_id:11}}),{status:200});};
  await telegram.deliverReportTelegram(`shift:${saved.data.id}`,temp,send);await telegram.deliverReportTelegram(`shift:${saved.data.id}`,temp,send);assert.equal(calls.length,1);
  await telegram.queueReportTelegram(temp,'ambiguous',35,'QA report','ownership_new');await telegram.deliverReportTelegram('ambiguous',temp,async()=>{throw Error('network');});await telegram.deliverReportTelegram('ambiguous',temp,send);assert.equal(calls.length,1);assert.equal((await c.query("SELECT status FROM management_report_deliveries WHERE delivery_key='ambiguous'")).rows[0].status,'unknown');
  await telegram.queueReportTelegram(temp,'definite',35,'QA report','ownership_new');await telegram.deliverReportTelegram('definite',temp,async()=>new Response(JSON.stringify({ok:false,error_code:429}),{status:429}));assert.equal((await c.query("SELECT status FROM management_report_deliveries WHERE delivery_key='definite'")).rows[0].status,'failed');await telegram.deliverReportTelegram('definite',temp,send);assert.equal(calls.length,2);
  checks.push('Telegram requires a valid message ID, sends once, permits retry after a definitive rejection and never retries an ambiguous network response.');
  const chunks=collectionServer.collectionReportMessages(Array.from({length:35},(_,i)=>({id:i,code:`QA-${i}`,customer:'QA',vehicle:'QA',days:5,amount:null,gps:['offline'],customer_status:'Cảnh báo',followup:{...f,notes:'x'.repeat(3000)}})),'QA');assert(chunks.messages.length>1);assert(chunks.messages.every(text=>text.length<=4000));
  checks.push('Daily branch debt reports include customer contact/handling/GPS state and split long reports below Telegram limits.');
  console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0,realTelegramSends:0},null,2));
}finally{next.after=afterOriginal;session.userFromSession=originalUser;session.readSessionUser=originalRead;Object.defineProperties(db.himotoPool,descriptors);await c.query('ROLLBACK').catch(()=>{});c.release();await globalThis.himotoPool?.end();}}
main().catch(e=>{console.error(e);process.exitCode=1;});
