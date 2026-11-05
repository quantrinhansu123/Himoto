// Isolated SQL + fake provider only. Never loads env files or sends a message.
require('./lib/offline-tests.cjs');
const assert=require('node:assert/strict'),path=require('node:path'),{randomUUID}=require('node:crypto'),{NextRequest}=require('next/server');
const{load,root}=require('./lib/load-typescript.cjs');
async function main(){
  const at=process.argv.indexOf('--pglite-path');if(at<0)throw Error('Pass the isolated PGlite path; no real DB fallback');
  const sql=new(require(path.resolve(process.argv[at+1])).PGlite)(),db=load(path.join(root,'lib/server/himoto-database')),api=load(path.join(root,'lib/server/mobile-debt-reminders')),web=load(path.join(root,'lib/server/debt-reminders')),dto=load(path.resolve('shared/mobile-debt-reminders'));
  const{resolveMobileWrite}=load(path.join(root,'lib/server/mobile-write-recovery')),{dataAccess}=load(path.join(root,'lib/server/access-context'));
  const actor={id:7,name:'QA Sender',store_id:23,scope_all:false,access_role:'custom',role:'staff',permissions:['contracts.read','contracts.draft']};
  const descriptors=Object.fromEntries(['connect','query'].map(k=>[k,Object.getOwnPropertyDescriptor(db.himotoPool,k)])),oldUrl=process.env.ZALO_REMINDER_WEBHOOK_URL;
  process.env.ZALO_REMINDER_WEBHOOK_URL='https://zalo.example.invalid/qa-only';
  const query=async(text,values)=>{const result=await sql.query(text,values);return{rows:result.rows,rowCount:result.rows.length||result.affectedRows||0};};
  let expectedActorId=7;function scoped(){const a=dataAccess.getStore();assert.equal(a.id,expectedActorId);assert.equal(a.store_id,23);assert.equal(a.scope_all,false);assert.equal(a.operation,'');}
  Object.defineProperty(db.himotoPool,'connect',{configurable:true,value:async()=>{scoped();return{query,release(){}};}});Object.defineProperty(db.himotoPool,'query',{configurable:true,value:async(...args)=>{scoped();return query(...args);}});
  const request=(key,body)=>new NextRequest('https://qa.invalid/api/mobile/v1/debt-reminders',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(body)});
  let count=0,mode='accepted';const provider=async(url,options)=>{assert.equal(url,'https://zalo.example.invalid/qa-only');assert.equal(options.redirect,'error');const form=new URLSearchParams(options.body);assert.deepEqual([...form.keys()],['phone','message']);count++;if(mode==='timeout')throw Error('QA uncertainty');return new Response(JSON.stringify({success:mode!=='failed'}),{status:200});};
  const send=(body,key=randomUUID(),user=actor)=>api.sendMobileReminder(user,request(key,body),provider),checks=[];
  try{
    await sql.exec(`CREATE SCHEMA himoto;
      CREATE TABLE himoto.stores(id bigint PRIMARY KEY,store_name text);CREATE TABLE himoto.users(id bigint PRIMARY KEY,name text);
      CREATE TABLE himoto.customers(id bigint PRIMARY KEY,name text,phone text);
      CREATE TABLE himoto.orders(id bigint PRIMARY KEY,customer_id bigint,customer_name text,customer_phone text,contract_number text,draft_reference text,order_status text,store_id bigint,total text,pid numeric,first_deposit_amount numeric,additional_deposit_amount numeric,total_rental_fees numeric,draft_payload jsonb,return_at timestamptz,deleted_at timestamptz);
      CREATE TABLE himoto.vehicles(id bigint PRIMARY KEY,name text,license text);
      CREATE FUNCTION himoto.vehicle_inventory() RETURNS SETOF himoto.vehicles LANGUAGE SQL AS 'SELECT * FROM himoto.vehicles';
      CREATE FUNCTION himoto.contract_vehicle_labels() RETURNS SETOF himoto.vehicles LANGUAGE SQL AS 'SELECT * FROM himoto.vehicles';
      CREATE TABLE himoto.order_vehicle_details(id bigint PRIMARY KEY,order_id bigint,vehicle_id bigint,type text,hiring_fee numeric,substitute_unit_price numeric,total_renewal_amount numeric,rent_at timestamptz,return_at timestamptz,deleted_at timestamptz,completed_at timestamptz);
      CREATE TABLE himoto.transactions(id bigint PRIMARY KEY,order_id bigint,type text,status text,name text,value numeric,created_at timestamptz,note text,user_id bigint,bank_id bigint,cash_id bigint,payment_method int,bank_owner_type text);
      CREATE TABLE himoto.banks(id bigint PRIMARY KEY,store_id bigint,owner_type text,bank_name text,account_number text,owner_name text,status text);CREATE TABLE himoto.cash(id bigint PRIMARY KEY,store_id bigint,name text,status text);
      CREATE TABLE himoto.management_contract_payments(transaction_id bigint,renewal_payload jsonb);
      CREATE TABLE himoto.management_mobile_requests(user_id bigint,request_id uuid,operation varchar(64),fingerprint text,resource_id bigint,resource_revision text,PRIMARY KEY(user_id,request_id));
      CREATE TABLE himoto.management_debt_reminders(request_id uuid PRIMARY KEY,order_id bigint,store_id bigint,actor_id bigint,fingerprint text,contract_code text,customer_name text,phone text,message text,amount bigint,status text DEFAULT 'pending',provider_status int,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
      INSERT INTO himoto.stores VALUES(23,'Cơ sở nhắc nợ QA');INSERT INTO himoto.users VALUES(7,'Người gửi QA');INSERT INTO himoto.customers VALUES(201,'Khách nhắc nợ QA','(+84) 900.000.001');
      INSERT INTO himoto.orders(id,customer_id,contract_number,order_status,store_id,total,pid,return_at) VALUES(17001,201,'REMIND-QA-17001','renting',23,'1000',300,now()+interval '1 day');
      INSERT INTO himoto.banks VALUES(1,23,'personal','VPBank','000000000001','QA ONLY','Active'),(2,24,'personal','VPBank','000000000002','OTHER QA','Active');`);
    const c=await api.readMobileReminderContext(actor,'17001');assert(dto.isReminderContext(c));assert.equal(c.amount,700);assert.equal(c.phone,'0900000001');assert.equal(c.bank.id,1);assert(c.message.includes('000000000001')&&!c.message.includes('000000000002'));
    const out=process.argv.indexOf('--fixture-output');if(out>=0){const fs=require('node:fs'),file=path.resolve(process.argv[out+1]);assert(file.startsWith(path.resolve('.backups')+path.sep)&&!fs.existsSync(file));const record=load(path.join(root,'lib/server/mobile-catalogue')).mobileRecord('contracts',{id:c.id,code:c.code,status:'renting',customer_name:c.customer_name,customer_phone:c.phone,store_id:c.store_id,store_name:c.store_name,total_amount:1000,paid_amount:300,start_date:new Date().toISOString(),end_date:c.due_at});fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify({fixtureOnly:true,source:'Actual reminder/payment domains on isolated PGlite; synthetic provider and read-only linked record only',context:c,record,options:await api.readMobileReminderOptions(actor)},null,2));}
    assert((await api.readMobileReminderOptions(actor)).canSend);await assert.rejects(async()=>api.readMobileReminderContext({...actor,permissions:['contracts.read']},'17001'),e=>e.status===403);
    checks.push('Actual payment/reminder web context derives due debt700, normalized customer phone and the original branch bank; send requires contracts.read plus draft or finance permission without widened scope');
    const input={order_id:c.id,revision:c.revision,amount:c.amount,phone:c.phone,message:c.message},key=randomUUID();
    assert.equal((await send(input,key)).status,'accepted');assert.equal(count,1);assert((await send(input,key)).replayed);assert.equal(count,1);
    const receipt=await api.readMobileReminderResult(actor,key);assert(dto.isReminderResult(receipt));assert.equal(receipt.receipt.amount,700);assert.equal(receipt.receipt.message,c.message);
    const history=await api.readMobileReminderHistory(actor,new URLSearchParams('store=23&page=1'));assert(dto.isReminderHistory(history));assert.equal(history.total,1);assert.equal((await web.listDebtReminders({query},'23',1)).rows[0].request_id,key);
    expectedActorId=8;await assert.rejects(api.readMobileReminderResult({...actor,id:8},key),e=>e.status===404);expectedActorId=7;
    const resolved=await resolveMobileWrite(actor,key,request(key,{operation:'reminder.send:17001'}));assert.equal(resolved.status,'committed');assert.equal(resolved.receipt.id,17001);assert.equal(resolved.receipt.revision,c.revision);
    checks.push('Mobile and web history share the exact reminder UUID/message/status; receipt and original contract revision commit before one fake provider call; replay and actor-owned recovery never send again');
    await assert.rejects(send({...input,message:'Changed'},key),e=>e.status===409);await assert.rejects(send(input),e=>e.status===429);
    for(const patch of[{amount:701},{phone:'0900000002'},{revision:'0'},{order_id:999},{request_id:randomUUID()},{actor_id:9}])await assert.rejects(send({...input,...patch}));
    await assert.rejects(send(input,randomUUID(),{...actor,permissions:['contracts.read']}),e=>e.status===403);assert.equal(count,1);assert.equal(Number((await query('SELECT count(*) AS n FROM himoto.management_mobile_requests')).rows[0].n),1);
    const cancelKey=randomUUID();assert.equal((await resolveMobileWrite(actor,cancelKey,request(cancelKey,{operation:'reminder.send:17001'}))).status,'cancelled');await assert.rejects(send(input,cancelKey),e=>e.code==='REQUEST_CANCELLED');assert.equal(count,1);
    checks.push('Changed fingerprint/stale debt/phone/revision/extra keys and60-second cooldown reject before I/O; failed reservations roll back; cancellation tombstone blocks a late mobile send');
    for(const behavior of ['failed','timeout']){await query("UPDATE himoto.management_debt_reminders SET created_at=now()-interval '2 minutes'");mode=behavior;const next=randomUUID(),r=await send(input,next);assert.equal(r.status,behavior==='timeout'?'unknown':'failed');const before=count;assert((await send(input,next)).replayed);assert.equal(count,before);assert.equal((await api.readMobileReminderResult(actor,next)).receipt.status,r.status);}
    await query("UPDATE himoto.management_debt_reminders SET created_at=now()-interval '2 minutes'");mode='accepted';const webKey=randomUUID();assert.equal((await load(path.join(root,'lib/server/mobile-context')).withMobileData(actor,'',()=>web.sendDebtReminder(db.himotoPool,actor.id,{...input,request_id:webKey},provider))).status,'accepted');
    assert.equal(Number((await query('SELECT pid FROM himoto.orders WHERE id=17001')).rows[0].pid),300);assert.equal((await query('SELECT * FROM himoto.transactions')).rowCount,0);
    checks.push('Provider rejection and uncertainty remain failed/unknown with no automatic resends; existing web caller without adapter still works; reminders do not alter money, transactions or stock');
    const local=days=>new Date(Date.now()+7*3600000+days*86400000).toISOString().slice(0,16),plan={version:1,start:local(1),end:local(40),interval:'custom',amount:1000,periods:[{due_at:local(1),amount:1000},{due_at:local(20),amount:1000}]};
    await query('UPDATE himoto.orders SET pid=0,draft_payload=$1 WHERE id=17001',[JSON.stringify({management_composer:{installment_plan:plan}})]);await assert.rejects(api.readMobileReminderContext(actor,'17001'),e=>e.status===409);
    plan.start=local(-1);plan.periods[0].due_at=local(-1);await query('UPDATE himoto.orders SET draft_payload=$1 WHERE id=17001',[JSON.stringify({management_composer:{installment_plan:plan}})]);assert.equal((await api.readMobileReminderContext(actor,'17001')).amount,1000);
    checks.push('Actual ownership installment reader rejects future debt and reminds only the accrued due installment; the ordinary contract amount is never substituted for future periods');
    console.log(JSON.stringify({passed:checks.length,checks,fakeProviderCalls:count,operationalWrites:0,realMessagesSent:0,scope:'isolated PGlite, not staging RLS/multi-session/native acceptance'},null,2));
  }finally{for(const[k,d]of Object.entries(descriptors)){if(d)Object.defineProperty(db.himotoPool,k,d);else delete db.himotoPool[k];}if(oldUrl===undefined)delete process.env.ZALO_REMINDER_WEBHOOK_URL;else process.env.ZALO_REMINDER_WEBHOOK_URL=oldUrl;await sql.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
