const assert=require('node:assert/strict'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {load,root}=require('./lib/load-typescript.cjs');
const correction=load(path.join(root,'lib/server/renewal-payment-corrections'));
const payments=load(path.join(root,'lib/server/contract-payments'));
const shared=load(path.join(root,'lib/management/contract-payments'));
const base={request_id:randomUUID(),transaction_id:1,revision:'1',method:'transfer',account_id:1,reason:' Chọn nhầm két '};
const checks=[];
async function main(){
  assert.equal(correction.parseRenewalPaymentCorrection(base).reason,'Chọn nhầm két');
  for(const patch of [{request_id:'x'},{transaction_id:0},{transaction_id:'1'},{revision:''},{method:'mixed'},{account_id:'1'},{account_id:0},{reason:''},{reason:'x'.repeat(501)},{amount:'1'},{paid_at:'2026-01-01'},{actor_id:1},{return_at:'2027-01-01'},{order_id:2}])assert.throws(()=>correction.parseRenewalPaymentCorrection({...base,...patch}));
  for(const value of [null,[],{},'x'])assert.throws(()=>correction.parseRenewalPaymentCorrection(value));
  checks.push('Strict correction fields reject amounts, rental dates, actors, invalid account IDs, empty reasons and malformed revisions');
  const originalFetch=global.fetch;try{
    let sent;global.fetch=async(url,options)=>{sent={url,options};return{ok:true,json:async()=>({status:'success',data:{id:1,history:[],accounts:[]}})};};
    await shared.correctRenewalPayment(1,base);assert.equal(sent.options.method,'PATCH');assert.match(sent.url,/\/1\/renewal-payments$/);assert.deepEqual(JSON.parse(sent.options.body),base);
    for(const response of [{ok:false,status:409,json:async()=>({message:'stale'})},{ok:true,json:async()=>({status:'success',data:{id:2,history:[],accounts:[]}})}]){global.fetch=async()=>response;await assert.rejects(()=>shared.correctRenewalPayment(1,base));}
  }finally{global.fetch=originalFetch;}
  checks.push('Client uses PATCH and rejects stale or mismatched responses');
  const {readContractHistory}=load(path.join(root,'lib/server/contract-history'));
  const history=await readContractHistory({query:async sql=>sql.includes('AS payment_corrections')?{rowCount:1,rows:[{id:1,created_at:'2026-10-01T00:00:00Z',payment_corrections:[{request_id:base.request_id,transaction_id:51,actor_id:143,at:'2026-10-28T14:00:00Z',reason:'Chọn nhầm két',before:{method:'Tiền mặt',account:'Két QA'},after:{method:'CK tài khoản cá nhân',account:'Ngân hàng QA'}}]}]}:{rowCount:0,rows:[]}},1);
  const audit=history.changes.find(row=>row.title==='Sửa thanh toán gia hạn');assert(audit);assert.equal(audit.actor,'#143');assert.match(audit.detail,/Phiếu #51: Tiền mặt.*CK tài khoản cá nhân.*Chọn nhầm két/);
  checks.push('Contract history shows receipt ID, before/after accounts, correction reason and authenticated actor');
  await apiChecks();
  if(process.argv.includes('--live-temp'))await databaseChecks();
  console.log(JSON.stringify({passed:checks.length,checks,permanentBusinessWrites:0},null,2));
}
async function apiChecks(){
  const {NextRequest}=require('next/server'),session=load(path.join(root,'lib/server/management-session'));
  const {himotoPool}=load(path.join(root,'lib/server/himoto-database'));
  const route=load(path.join(root,'app/api/auth/order/car-rental/[id]/renewal-payments/route'));
  const descriptors=Object.getOwnPropertyDescriptors(himotoPool),originalRead=session.readSessionUser,originalUser=session.userFromSession,originalUpdate=correction.updateRenewalPayment;
  let actor={id:1,store_id:31,scope_all:false,access_role:'branch_staff',permissions:['contracts.read','contracts.renew']},calls=[],fail=false;
  const request=(body=base,origin='http://localhost')=>new NextRequest('http://localhost/api/auth/order/car-rental/1/renewal-payments',{method:'PATCH',headers:{origin,host:'localhost','Content-Type':'application/json'},body:JSON.stringify(body)});
  const run=(body=base,origin)=>route.PATCH(request(body,origin),{params:Promise.resolve({id:'1'})});
  try{
    session.readSessionUser=session.userFromSession=async()=>actor;
    Object.defineProperty(himotoPool,'connect',{configurable:true,value:async()=>({release(){},async query(sql){calls.push(sql);return{rows:[]};}})});
    correction.updateRenewalPayment=async(_db,id,actorId,input)=>{assert.equal(id,1);assert.equal(actorId,actor.id);assert.equal(input.reason,'Chọn nhầm két');if(fail)throw new payments.ContractPaymentError('stale',409);return{id:1,history:[],accounts:[]};};
    const allowed=actor;actor=null;assert.equal((await run()).status,401);assert.equal(calls.length,0);
    actor={...allowed,permissions:['contracts.read']};assert.equal((await run()).status,403);assert.equal(calls.length,0);
    actor=allowed;assert.equal((await run(base,'https://foreign.invalid')).status,403);assert.equal(calls.length,0);
    assert.equal((await run({...base,amount:'2'})).status,400);assert.equal(calls.length,0);
    const saved=await run();assert.equal(saved.status,200);assert.match(saved.headers.get('cache-control'),/no-store/);assert(calls.includes('COMMIT'));
    actor={...allowed,access_role:'accounting',permissions:['contracts.read','finance.write']};assert.equal((await run()).status,200);
    fail=true;calls=[];assert.equal((await run()).status,409);assert(calls.includes('ROLLBACK'));assert(!calls.includes('COMMIT'));
  }finally{session.readSessionUser=originalRead;session.userFromSession=originalUser;correction.updateRenewalPayment=originalUpdate;Object.defineProperties(himotoPool,descriptors);}
  checks.push('API enforces authentication, renewal/finance permission, same origin, strict input, commit and rollback without expanding branch scope');
}
async function databaseChecks(){
  require('@next/env').loadEnvConfig(path.resolve(__dirname,'..'),false,{info(){},error(){}});
  const c=await load(path.join(root,'lib/server/himoto-database')).ownerDatabase.connect();
  const tables=['management_contract_notifications','management_contract_payments','order_vehicle_details','transactions','orders','banks','cash','users','vehicles'];
  let failAudit=false;
  const db={query(sql,params){let rewritten=sql;for(const table of tables)rewritten=rewritten.replaceAll(`himoto.${table}`,`pg_temp.qa_rpc_${table}`);assert(!rewritten.includes('himoto.'),'Every business query must target isolated fixtures');if(failAudit&&rewritten.startsWith('UPDATE pg_temp.qa_rpc_orders'))throw Error('Audit failure');return c.query(rewritten,params);}};
  const attempt=async fn=>{await c.query('SAVEPOINT correction_case');try{const result=await fn();await c.query('RELEASE SAVEPOINT correction_case');return result;}catch(error){await c.query('ROLLBACK TO SAVEPOINT correction_case');await c.query('RELEASE SAVEPOINT correction_case');throw error;}};
  const receipt=async id=>(await c.query('SELECT *,xmin::text AS revision FROM qa_rpc_transactions WHERE id=$1',[id])).rows[0];
  const edits=async()=>((await c.query('SELECT draft_payload FROM qa_rpc_orders WHERE id=1')).rows[0].draft_payload.management_composer.payment_corrections||[]);
  const change=async(patch={},orderId=1)=>{const row=await receipt(patch.transaction_id||1);return attempt(()=>correction.updateRenewalPayment(db,orderId,143,{...base,request_id:randomUUID(),revision:row.revision,...patch}));};
  const unchanged=async()=>{
    const order=(await c.query('SELECT total,pid,first_deposit_amount,order_status,return_at,draft_payload::jsonb #- \'{management_composer,payment_corrections}\' AS payload FROM qa_rpc_orders WHERE id=1')).rows;
    const lines=(await c.query('SELECT row_to_json(d) AS line FROM qa_rpc_order_vehicle_details d ORDER BY id')).rows;
    const tx=(await c.query("SELECT to_jsonb(t)-ARRAY['bank_id','cash_id','payment_method','bank_owner_type','updated_at'] AS receipt FROM qa_rpc_transactions t ORDER BY id")).rows;
    const ledger=(await c.query('SELECT * FROM qa_rpc_management_contract_payments ORDER BY transaction_id')).rows;
    return{order,lines,tx,ledger};
  };
  try{
    await c.query('BEGIN');
    for(const table of ['orders','transactions','banks','cash','order_vehicle_details','vehicles']){
      await c.query(`CREATE TEMP TABLE qa_rpc_${table} (LIKE himoto.${table} INCLUDING DEFAULTS) ON COMMIT DROP`);
      await c.query(`ALTER TABLE qa_rpc_${table} ALTER COLUMN id DROP DEFAULT`);
    }
    await c.query("ALTER TABLE qa_rpc_transactions ALTER COLUMN note SET DEFAULT 'Gia hạn QA'");
    await c.query(`CREATE TEMP TABLE qa_rpc_users(id bigint,name text) ON COMMIT DROP;
      CREATE TEMP TABLE qa_rpc_management_contract_payments(request_id uuid,order_id bigint,transaction_id bigint,actor_id bigint,request_hash text,renewal_payload jsonb) ON COMMIT DROP;
      CREATE TEMP TABLE qa_rpc_management_contract_notifications(order_id bigint,event_key text,root_event_key text,status text,message_ids jsonb,retraction jsonb) ON COMMIT DROP;
      INSERT INTO qa_rpc_users VALUES(143,'Nhân viên QA');
      INSERT INTO qa_rpc_orders(id,contract_number,order_status,store_id,total,pid,first_deposit_amount,additional_deposit_amount,return_at,draft_payload)
      VALUES(1,'QA-RENEWAL','renting',23,'1500',1500,100,0,'2026-11-22T19:00:00+07:00','{"management_composer":{"versions":[{"kind":"renewal","version":2,"amount":1500,"return_at":"2026-11-22T19:00:00+07:00"}]}}'),
      (2,'QA-OTHER','renting',31,'1500',1500,0,0,'2026-11-22T19:00:00+07:00','{}');
      INSERT INTO qa_rpc_cash(id,store_id,name,opening_balance) VALUES(1,23,'Két QA',0),(2,31,'Két khác',0);
      INSERT INTO qa_rpc_banks(id,store_id,bank_name,account_number,owner_name,account_type,owner_type,status)
      VALUES(1,23,'QA','QA-1','Cá nhân QA',1,'personal','Active'),(2,31,'QA','QA-2','Ngoài cơ sở',1,'personal','Active'),
      (3,0,'QA','QA-3','Công ty QA',1,'company','Active'),(4,23,'QA','QA-4','Đã khóa',1,'personal','Inactive');
      INSERT INTO qa_rpc_vehicles(id,name,brand,type,year,store_id,current_store_id,license,status,created_by) VALUES(1,'Xe QA','Honda','xeso',2026,23,23,'QA-1','using',143);
      INSERT INTO qa_rpc_order_vehicle_details(id,order_id,vehicle_id,rent_at,return_at,total_renewal_amount) VALUES(1,1,1,'2026-10-01T10:00:00+07:00','2026-11-22T19:00:00+07:00',1500);
      INSERT INTO qa_rpc_transactions(id,order_id,name,type,value,status,user_id,store_id,cash_id,payment_method,created_at)
      VALUES(1,1,'order:payment','in',1500,'approved',143,23,1,1,now()),(2,1,'order:deposit','in',100,'approved',143,23,1,1,now()),
      (3,1,'order:renewal','out',10,'approved',143,23,1,1,now()),(4,1,'order:renewal','in',10,'cancelled',143,23,1,1,now()),
      (5,2,'order:renewal','in',10,'approved',143,31,2,1,now()),(6,1,'order:renewal','in',10,'approved',143,23,1,1,now());
      INSERT INTO qa_rpc_management_contract_payments(request_id,order_id,transaction_id,actor_id,request_hash,renewal_payload)
      VALUES('${randomUUID()}',1,1,143,'original-hash','{"version":2,"license":"QA-1","vehicle_name":"Xe QA","return_at":"2026-11-22T19:00:00+07:00"}'),
      ('${randomUUID()}',1,3,143,'out-hash','{"version":2}'),('${randomUUID()}',1,4,143,'cancelled-hash','{"version":2}'),
      ('${randomUUID()}',2,5,143,'other-hash','{"version":2}'),('${randomUUID()}',1,6,143,'legacy-hash','{"license":"QA-1","vehicle_name":"Xe QA","return_at":"2026-11-22T19:00:00+07:00"}');`);
    const before=await unchanged(),firstRequest={...base,revision:(await receipt(1)).revision};
    const saved=await attempt(()=>correction.updateRenewalPayment(db,1,143,firstRequest));
    assert.equal(saved.history.find(t=>t.id===1).payment_method,'transfer');assert.equal((await receipt(1)).cash_id,null);assert.equal(Number((await receipt(1)).bank_id),1);
    assert.deepEqual(await unchanged(),before);assert.equal((await edits()).length,1);assert.equal((await edits())[0].actor_id,143);assert.equal((await edits())[0].before.method,'Tiền mặt');
    await attempt(()=>correction.updateRenewalPayment(db,1,143,{...firstRequest,revision:'0'}));assert.equal((await edits()).length,1);
    await assert.rejects(()=>attempt(()=>correction.updateRenewalPayment(db,1,143,{...firstRequest,reason:'Nội dung khác'})),e=>e.status===409);
    checks.push('TEMP: cash → personal transfer updates the same receipt, records before/after and actor, preserves money/dates/deposit/stock/original payment retry records, and exact retry creates no duplicate audit');
    const company=await change({method:'company_transfer',account_id:3});assert.equal(company.company_payment_count,1);assert.equal(company.company_paid_amount,1500);
    const cash=await change({method:'cash',account_id:1});assert.equal(cash.company_payment_count,0);assert.equal((await receipt(1)).bank_id,null);assert.deepEqual(await unchanged(),before);
    const bankBalance=(await c.query("SELECT COALESCE(sum(value),0)::int AS total FROM qa_rpc_transactions WHERE bank_id=3 AND status='approved' AND type='in'")).rows[0].total;assert.equal(bankBalance,0);
    checks.push('TEMP: personal → company → cash updates company totals and account balances without creating or deleting receipts or changing contract amounts');
    for(const patch of [{revision:'0'},{account_id:2},{account_id:4},{method:'company_transfer',account_id:1},{method:'transfer',account_id:3},{method:'cash',account_id:2},{transaction_id:2},{transaction_id:3},{transaction_id:4},{transaction_id:5}])await assert.rejects(()=>change(patch));
    await assert.rejects(()=>change({},2));
    checks.push('TEMP: stale revisions, inactive/foreign/wrong-kind accounts, deposits, outgoing/cancelled and foreign-contract receipts are rejected');
    for(const [status,ids,retraction]of[['pending',[],null],['sending',[],null],['unknown',[],null],['failed',[1],null],['sent',[1],{state:'pending'}]]){
      await c.query('INSERT INTO qa_rpc_management_contract_notifications VALUES(1,$1,$1,$2,$3::jsonb,$4::jsonb)',['renewal:1:2',status,JSON.stringify(ids),JSON.stringify(retraction)]);
      await assert.rejects(()=>change(),e=>e.status===409);await c.query('DELETE FROM qa_rpc_management_contract_notifications');
    }
    await c.query("INSERT INTO qa_rpc_management_contract_notifications VALUES(1,'renewal:1:2','renewal:1:2','sent','[1]',NULL)");
    await change();assert.equal((await c.query('SELECT status,message_ids FROM qa_rpc_management_contract_notifications')).rows[0].status,'sent');
    checks.push('TEMP: queued, sending, uncertain, partial and retracting Telegram blocks correction; delivered messages remain untouched when receipts are corrected');
    const prior=await receipt(1),auditCount=(await edits()).length;failAudit=true;await assert.rejects(()=>change({method:'cash',account_id:1}),/Audit failure/);failAudit=false;
    assert.deepEqual(await receipt(1),prior);assert.equal((await edits()).length,auditCount);
    await c.query('DELETE FROM qa_rpc_management_contract_notifications');await change({transaction_id:6});assert.equal((await receipt(6)).cash_id,null);
    checks.push('TEMP: audit write failure rolls back the account change; legacy renewal receipts without version IDs remain editable');
    for(const table of ['orders','transactions']){
      await c.query(`ALTER TABLE qa_rpc_${table} ENABLE ROW LEVEL SECURITY`);
      await c.query(`CREATE POLICY qa_correction_branch ON qa_rpc_${table} USING (store_id::text=current_setting('himoto.store_id',true)) WITH CHECK (store_id::text=current_setting('himoto.store_id',true))`);
    }
    const schema=(await c.query('SELECT nspname FROM pg_namespace WHERE oid=pg_my_temp_schema()')).rows[0].nspname;
    assert.match(schema,/^pg_temp_\d+$/);await c.query(`GRANT USAGE ON SCHEMA ${schema} TO himoto_scoped`);
    for(const table of tables)await c.query(`GRANT SELECT,UPDATE ON qa_rpc_${table} TO himoto_scoped`);
    const ownRevision=(await receipt(1)).revision;
    await c.query("SELECT set_config('himoto.store_id','31',true)");await c.query('SET LOCAL ROLE himoto_scoped');
    await assert.rejects(()=>attempt(()=>correction.updateRenewalPayment(db,1,143,{...base,request_id:randomUUID(),revision:ownRevision,method:'cash',account_id:1})),e=>e.status===404);
    await c.query("SELECT set_config('himoto.store_id','23',true)");
    const scoped=await change({method:'cash',account_id:1});assert.equal(scoped.history.find(row=>row.id===1).payment_method,'cash');
    await c.query('RESET ROLE');
    checks.push('TEMP RLS: scoped PostgreSQL role cannot edit another branch and can correct its own branch without owner-pool bypass');
  }finally{await c.query('ROLLBACK');c.release();await globalThis.himotoPool?.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
