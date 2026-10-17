const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {randomUUID}=require('node:crypto');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {load,root}=require('./lib/load-typescript.cjs');
const server=load(path.join(root,'lib/server/debt-reminders'));
const shared=load(path.join(root,'lib/management/debt-reminders'));
const {canSendDebtReminder}=load(path.join(root,'lib/management/permissions'));
const {requestPermission}=load(path.join(root,'lib/server/access-request'));
const {projectManagementTable}=load(path.join(root,'lib/management/management-table'));
const {EMPTY_QUERY}=load(path.join(root,'lib/management/table-utils'));
const pool=load(path.join(root,'lib/server/himoto-database')).ownerDatabase;
const checks=[];
async function main(){
  const oldUrl=process.env.ZALO_REMINDER_WEBHOOK_URL;process.env.ZALO_REMINDER_WEBHOOK_URL='https://zalo.example.invalid/webhook/qa';
  const base={request_id:randomUUID(),order_id:1,revision:'123',amount:700,phone:'(+84) 900.000.001',message:' Nhắc nợ QA\n700 đ '};
  assert.equal(server.parseDebtReminderInput(base).phone,'0900000001');assert.equal(server.parseDebtReminderInput(base).message,'Nhắc nợ QA\n700 đ');
  assert.equal(shared.normalizeReminderPhone('84900000001'),'0900000001');
  for(const patch of [{phone:'0900000001<script>'},{phone:'1234567890'},{message:''},{message:'a'.repeat(4001)},{amount:0},{amount:0.5},{order_id:0},{request_id:'x'},{actor_id:99},{store_id:31},{revision:'x'}])assert.throws(()=>server.parseDebtReminderInput({...base,...patch}));
  for(const url of ['','http://unsafe.example','https://user:pass@example.invalid'])assert.throws(()=>server.reminderWebhookUrl({ZALO_REMINDER_WEBHOOK_URL:url}));
  assert(canSendDebtReminder({permissions:['contracts.read','contracts.draft']}));assert(canSendDebtReminder({permissions:['contracts.read','finance.write']}));
  assert(!canSendDebtReminder({permissions:['contracts.read']}));assert(!canSendDebtReminder({permissions:['hr.write']}));
  assert.equal(requestPermission('/api/auth/debt-reminders','POST'),'contracts.read');
  const eligible={id:1,status:'renting',total_amount:1000,paid_amount:300,store_id:23};
  assert(shared.isRemindableContract(eligible));assert(!shared.isRemindableContract({...eligible,status:'draft'}));assert(!shared.isRemindableContract({...eligible,paid_amount:1000}));
  assert(!shared.isRemindableContract({...eligible,billing_plan_json:'{}',billing_due_amount:0}));
  const projected=projectManagementTable([{...eligible,id:2,status:'draft'},eligible],{kind:'contracts',scope:'remindable',query:EMPTY_QUERY,store:'all',page:1,size:1,sort:'code',direction:'asc'});
  assert.equal(projected.total,1);assert.equal(projected.rows[0].id,1);
  checks.push('Strict phone/content/request validation, send permissions and eligible contract filtering before pagination');
  const sent=[];let behavior='accepted';
  const fakeFetch=async(url,options)=>{
    assert.equal(new URL(url).hostname,'zalo.example.invalid');assert.equal(options.method,'POST');assert.equal(options.redirect,'error');
    assert.equal(options.headers['Content-Type'],'application/x-www-form-urlencoded');const form=new URLSearchParams(options.body);
    assert.deepEqual([...form.keys()],['phone','message']);sent.push(Object.fromEntries(form));
    if(behavior==='timeout')throw new Error('Simulated network uncertainty');
    return new Response(behavior==='false'?JSON.stringify({success:false}):behavior==='http'?'Rejected':JSON.stringify({message:'Workflow was started'}),{status:behavior==='http'?502:200});
  };
  const c=await pool.connect();
  const tables=['orders','transactions','banks','cash','order_vehicle_details','vehicles','users','customers','stores','management_contract_payments','management_debt_reminders'];
  const query=async(sql,params)=>{
    if(sql==='BEGIN')return c.query('SAVEPOINT reminder_send');
    if(sql==='COMMIT')return c.query('RELEASE SAVEPOINT reminder_send');
    if(sql==='ROLLBACK'){await c.query('ROLLBACK TO SAVEPOINT reminder_send');return c.query('RELEASE SAVEPOINT reminder_send');}
    for(const table of tables)sql=sql.replaceAll('himoto.'+table,'pg_temp.qa_reminder_'+table);
    assert(!sql.includes('himoto.'),'Business queries must use TEMP tables');return c.query(sql,params);
  };
  const db={query,connect:async()=>({query,release(){}})};
  try{
    await c.query('BEGIN');
    for(const table of tables.filter(t=>!t.startsWith('management_'))){
      await c.query(`CREATE TEMP TABLE qa_reminder_${table} (LIKE himoto.${table} INCLUDING DEFAULTS) ON COMMIT DROP`);
      await c.query(`ALTER TABLE qa_reminder_${table} ALTER COLUMN id DROP DEFAULT`);
    }
    await c.query('CREATE TEMP TABLE qa_reminder_management_contract_payments(request_id uuid,transaction_id bigint,renewal_payload jsonb) ON COMMIT DROP');
    let migration=fs.readFileSync(path.resolve('docs/sql/2026-10-17-debt-reminders.sql'),'utf8');
    const tableSql=migration.slice(migration.indexOf('CREATE TABLE'),migration.indexOf('CREATE INDEX')).replace('CREATE TABLE IF NOT EXISTS himoto.management_debt_reminders','CREATE TEMP TABLE qa_reminder_management_debt_reminders').replaceAll(/REFERENCES himoto\.[a-z_]+\(id\)/g,'').replace(/\);\s*$/,' ) ON COMMIT DROP;');
    await c.query(tableSql);
    await c.query("INSERT INTO qa_reminder_stores(id,store_name) VALUES(23,'Cơ sở A QA'),(31,'Cơ sở B QA')");
    await c.query("INSERT INTO qa_reminder_users(id,name,email,password,role_id,status) VALUES(143,'Người gửi QA','qa-reminder@example.invalid','unused',6,'active')");
    await c.query("INSERT INTO qa_reminder_customers(id,name,phone,id_card,status,store_id) VALUES(10,'Khách QA','0900000001','000000000001',1,23)");
    await c.query("INSERT INTO qa_reminder_orders(id,customer_id,contract_number,order_status,store_id,total,pid,created_at,return_at) VALUES(1,10,'HD-QA-1','renting',23,'1000',300,now(),now()+interval '1 day')");
    await c.query("INSERT INTO qa_reminder_banks(id,store_id,bank_name,account_number,owner_name,account_type,owner_type,status) VALUES(3,23,'VPBank','000000000001','QA ONLY',1,'unknown','Active'),(4,31,'VPBank','000000000002','OTHER BRANCH QA',1,'unknown','Active')");
    const context=await server.readDebtReminderContext(db,1);
    assert.equal(context.phone,'0900000001');assert.equal(context.amount,700);assert.equal(context.bank.id,3);assert(context.message.includes('000000000001'));assert(!context.message.includes('000000000002'));
    const input={...base,phone:context.phone,revision:context.revision,message:context.message};
    const first=await server.sendDebtReminder(db,143,input,fakeFetch);assert.equal(first.status,'accepted');assert.equal(sent.length,1);assert.equal(sent[0].message,input.message);assert.equal(sent[0].phone,context.phone);
    const replay=await server.sendDebtReminder(db,143,input,fakeFetch);assert.equal(replay.replayed,true);assert.equal(sent.length,1);
    await assert.rejects(()=>server.sendDebtReminder(db,143,{...input,message:'Different'},fakeFetch),e=>e.status===409);
    await assert.rejects(()=>server.sendDebtReminder(db,143,{...input,request_id:randomUUID()},fakeFetch),e=>e.status===429);
    for(const patch of [{phone:'0900000002'},{revision:'0'},{amount:701},{order_id:99}])await assert.rejects(()=>server.sendDebtReminder(db,143,{...input,request_id:randomUUID(),...patch},fakeFetch));
    assert.equal(sent.length,1);checks.push('Contract-derived phone, branch bank and current debt; stale/foreign/missing inputs rejected before outbound I/O; retries and double clicks deliver once');
    for(const [mode,status]of [['false','failed'],['http','failed'],['timeout','unknown']]){
      await c.query("UPDATE qa_reminder_management_debt_reminders SET created_at=now()-interval '2 minutes'");behavior=mode;
      const next={...input,request_id:randomUUID()};assert.equal((await server.sendDebtReminder(db,143,next,fakeFetch)).status,status);
      const n=sent.length;assert.equal((await server.sendDebtReminder(db,143,next,fakeFetch)).replayed,true);assert.equal(sent.length,n);
    }
    assert.equal((await server.listDebtReminders(db,'23',1)).total,4);assert.equal((await server.listDebtReminders(db,'31',1)).total,0);
    assert.equal(Number((await c.query('SELECT pid FROM qa_reminder_orders WHERE id=1')).rows[0].pid),300);assert.equal((await c.query('SELECT * FROM qa_reminder_transactions')).rowCount,0);
    checks.push('HTTP errors, explicit provider failure and timeouts retained accurately; uncertain sends never auto retry; reminders leave contract debt and receipts unchanged');
    for(const status of ['draft','cancelled','completed']){await c.query('UPDATE qa_reminder_orders SET order_status=$1 WHERE id=1',[status]);await assert.rejects(()=>server.readDebtReminderContext(db,1),e=>e.status===409);}
    await c.query("UPDATE qa_reminder_orders SET order_status='renting',pid=1000 WHERE id=1");await assert.rejects(()=>server.readDebtReminderContext(db,1),e=>e.status===409);
    checks.push('Draft, cancelled, completed and fully paid contracts cannot send debt reminders');
    const localDate=days=>new Date(Date.now()+7*3600000+days*86400000).toISOString().slice(0,16);
    const futurePlan={version:1,start:localDate(1),end:localDate(40),interval:'custom',amount:1000,periods:[{due_at:localDate(1),amount:1000},{due_at:localDate(20),amount:1000}]};
    await c.query("UPDATE qa_reminder_orders SET pid=0,total='1000',draft_payload=$1 WHERE id=1",[JSON.stringify({management_composer:{installment_plan:futurePlan}})]);
    await assert.rejects(()=>server.readDebtReminderContext(db,1),e=>e.status===409);
    const duePlan={...futurePlan,start:localDate(-1),periods:[{due_at:localDate(-1),amount:1000},{due_at:localDate(20),amount:1000}]};
    await c.query('UPDATE qa_reminder_orders SET draft_payload=$1 WHERE id=1',[JSON.stringify({management_composer:{installment_plan:duePlan}})]);
    assert.equal((await server.readDebtReminderContext(db,1)).amount,1000);
    checks.push('Ownership reminder context excludes future installments and includes only the already due installment amount');
    // Apply the actual migration twice in an isolated rollback-only schema, then exercise RLS.
    await c.query('CREATE SCHEMA qa_reminder_scope');
    for(const table of ['orders','stores','users'])await c.query(`CREATE TABLE qa_reminder_scope.${table}(id bigint PRIMARY KEY)`);
    await c.query('INSERT INTO qa_reminder_scope.orders VALUES(1),(2); INSERT INTO qa_reminder_scope.stores VALUES(23),(31); INSERT INTO qa_reminder_scope.users VALUES(143)');
    migration=migration.replaceAll('himoto.','qa_reminder_scope.').replaceAll('qa_reminder_scope.access_store','himoto.access_store').replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,'');
    await c.query(migration);await c.query(migration);await c.query('GRANT USAGE ON SCHEMA qa_reminder_scope TO himoto_scoped');
    for(const store of [23,31])await c.query("INSERT INTO qa_reminder_scope.management_debt_reminders(request_id,order_id,store_id,actor_id,fingerprint,contract_code,customer_name,phone,message,amount) VALUES($1,1,$2,143,'qa','QA','QA','0900000001','QA',1)",[randomUUID(),store]);
    await c.query("SELECT set_config('himoto.scope_all','false',true),set_config('himoto.store_id','23',true)");await c.query('SET LOCAL ROLE himoto_scoped');
    assert.equal((await c.query('SELECT * FROM qa_reminder_scope.management_debt_reminders')).rowCount,1);
    assert.equal((await c.query('SELECT * FROM qa_reminder_scope.management_debt_reminders WHERE store_id=31')).rowCount,0);
    await c.query('SAVEPOINT forbidden');await assert.rejects(()=>c.query("INSERT INTO qa_reminder_scope.management_debt_reminders(request_id,order_id,store_id,actor_id,fingerprint,contract_code,customer_name,phone,message,amount) VALUES($1,1,31,143,'qa','QA','QA','0900000001','QA',1)",[randomUUID()]),e=>e.code==='42501');await c.query('ROLLBACK TO SAVEPOINT forbidden');
    await c.query('SAVEPOINT secret_denied');await assert.rejects(()=>c.query('SELECT webhook_url FROM qa_reminder_scope.management_zalo_settings'),e=>e.code==='42501');await c.query('ROLLBACK TO SAVEPOINT secret_denied');
    await c.query('RESET ROLE');checks.push('Migration is idempotent; database RLS hides other branches and rejects foreign-branch inserts');
  }finally{await c.query('ROLLBACK').catch(()=>{});c.release();await globalThis.himotoPool?.end();if(oldUrl===undefined)delete process.env.ZALO_REMINDER_WEBHOOK_URL;else process.env.ZALO_REMINDER_WEBHOOK_URL=oldUrl;}
  console.log(JSON.stringify({passed:checks.length,checks,realZaloRequests:0,realBusinessWrites:0,realSequenceChanges:0},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
