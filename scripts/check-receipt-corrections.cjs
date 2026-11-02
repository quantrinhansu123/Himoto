const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {load,root}=require('./lib/load-typescript.cjs'),service=load(path.join(root,'lib/server/receipt-corrections')),db=load(path.join(root,'lib/server/himoto-database')).ownerDatabase;
const user={id:70001,access_role:'branch_staff',store_id:32,permissions:['contracts.read','contracts.draft']};
async function main(){const c=await db.connect(),schema='qa_receipt_corrections';const proxy={query(sql,args){return c.query(sql.replaceAll('himoto.',schema+'.'),args);}};
 const action=async work=>{await c.query('SAVEPOINT edit');try{return await work();}catch(e){await c.query('ROLLBACK TO SAVEPOINT edit');throw e;}finally{await c.query('RELEASE SAVEPOINT edit');}};
 try{
 await c.query('BEGIN');await c.query(`CREATE SCHEMA ${schema};GRANT USAGE ON SCHEMA ${schema} TO himoto_scoped`);
 for(const t of ['orders','transactions','banks','cash','users','vehicles','order_vehicle_details','management_contract_payments','management_contract_notifications'])await c.query(`CREATE TABLE ${schema}.${t}(LIKE himoto.${t} INCLUDING DEFAULTS);GRANT SELECT,INSERT,UPDATE ON ${schema}.${t} TO himoto_scoped`);
 await c.query(`CREATE SEQUENCE ${schema}.receipt_ids START 1000;GRANT USAGE ON SEQUENCE ${schema}.receipt_ids TO himoto_scoped;ALTER TABLE ${schema}.transactions ALTER COLUMN id SET DEFAULT nextval('${schema}.receipt_ids');
 CREATE FUNCTION ${schema}.access_store(target numeric) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT himoto.access_store(target)$$;
 CREATE FUNCTION ${schema}.access_actor() RETURNS bigint LANGUAGE sql STABLE AS $$SELECT himoto.access_actor()$$;`);
 for(const t of ['orders','transactions','banks','cash'])await c.query(`ALTER TABLE ${schema}.${t} ENABLE ROW LEVEL SECURITY;CREATE POLICY branch_scope ON ${schema}.${t} TO himoto_scoped USING(himoto.access_store(store_id)) WITH CHECK(himoto.access_store(store_id))`);
 await c.query(fs.readFileSync('docs/sql/2026-10-29-contract-vehicle-owner-labels.sql','utf8').replaceAll('himoto.',schema+'.').replaceAll('pg_catalog,himoto','pg_catalog,'+schema).replace(/^BEGIN;|^COMMIT;/gm,''));
 await c.query(`INSERT INTO ${schema}.orders(id,store_id,contract_number,order_status,total,pid,first_deposit_amount,draft_payload) VALUES(1,32,'QA-SPLIT','renting','200000',1000000,800000,'{}'),(2,33,'QA-FOREIGN','renting','200000',0,0,'{}');
 INSERT INTO ${schema}.cash(id,store_id,name,status,opening_balance) VALUES(1,32,'Két QA','active',0),(2,33,'Két khác','active',0);
 INSERT INTO ${schema}.banks(id,store_id,bank_name,account_number,owner_name,owner_type,status,opening_balance,account_type) VALUES(1,32,'QA','000','QA','personal','active',0,0),(2,33,'QA','001','QA','personal','active',0,0);
 INSERT INTO ${schema}.transactions(id,order_id,name,type,status,value,store_id,user_id,cash_id,payment_method,note,created_at,updated_at) VALUES(10,1,'order:deposit','in','approved',800000,32,70001,1,1,'QA','2026-11-01T01:15Z',now()),(11,1,'order:rental_fees','in','approved',200000,32,70001,1,1,'QA','2026-11-01T01:15Z',now());`);
 await c.query("SELECT set_config('himoto.store_id','32',true),set_config('himoto.scope_all','false',true),set_config('himoto.actor_id','70001',true)");await c.query('SET LOCAL ROLE himoto_scoped');
 const state=await service.readReceiptCorrections(proxy,1,user);assert.equal(state.receipts.length,2);
 const input={request_id:randomUUID(),revision:state.revision,deposit_amount:'1000000',reason:'Sửa cọc 900 CK + 100 tiền mặt; thuê 200 tiền mặt',receipts:state.receipts.map(r=>r.deposit?{...r,parts:[{amount:'900000',method:'transfer',account_id:1},{amount:'100000',method:'cash',account_id:1}]}:r)};
 for(const patch of [{reason:''},{deposit_amount:'-1'},{receipts:[...input.receipts,input.receipts[0]]},{receipts:[{...input.receipts[0],parts:[]}]}])assert.throws(()=>service.parseReceiptCorrection({...input,...patch}));
 await assert.rejects(()=>action(()=>service.readReceiptCorrections(proxy,1,{...user,permissions:['contracts.read']})),e=>e.status===403);
 await assert.rejects(()=>action(()=>service.readReceiptCorrections(proxy,2,user)),e=>e.status===404);
 await assert.rejects(()=>action(()=>service.updateReceiptCorrections(proxy,1,user,{...input,receipts:input.receipts.map(r=>r.deposit?{...r,parts:[{amount:'1000000',method:'transfer',account_id:2}]}:r)})),/Tài khoản/);
 await assert.rejects(()=>action(()=>service.updateReceiptCorrections(proxy,1,user,{...input,deposit_amount:'800000'})),/Cọc đã thu/);
 const failing={query(sql,args){if(sql.startsWith('UPDATE himoto.orders SET first_deposit_amount'))throw Error('Injected failure');return proxy.query(sql,args);}};
 await assert.rejects(()=>action(()=>service.updateReceiptCorrections(failing,1,user,input)),/Injected/);assert.equal((await proxy.query('SELECT count(*) FROM himoto.transactions')).rows[0].count,'2');
 const saved=await action(()=>service.updateReceiptCorrections(proxy,1,user,input));assert.equal(saved.deposit_amount,'1000000');assert.equal(saved.receipts.length,3);
 const rows=(await proxy.query('SELECT * FROM himoto.transactions ORDER BY id')).rows;assert.equal(rows.reduce((n,r)=>n+Number(r.value),0),1200000);assert.equal(rows.filter(r=>r.cash_id).reduce((n,r)=>n+Number(r.value),0),300000);assert.equal(rows.filter(r=>r.bank_id).reduce((n,r)=>n+Number(r.value),0),900000);
 assert(rows.every(r=>new Date(r.created_at).toISOString()==='2026-11-01T01:15:00.000Z'));
 const order=(await proxy.query('SELECT * FROM himoto.orders WHERE id=1')).rows[0];assert.equal(Number(order.pid),1200000);assert.equal(Number(order.total),200000);assert.equal(order.draft_payload.management_composer.receipt_corrections.length,1);
 const retry=await action(()=>service.updateReceiptCorrections(proxy,1,user,input));assert.deepEqual(retry,saved);assert.equal((await proxy.query('SELECT count(*) FROM himoto.transactions')).rows[0].count,'3');
 await assert.rejects(()=>action(()=>service.updateReceiptCorrections(proxy,1,user,{...input,request_id:randomUUID()})),/vừa thay đổi/);
 console.log(JSON.stringify({passed:true,checks:['staff scope and permission','strict amounts and duplicate IDs','bank and cash IDs remain distinct','foreign account denied','deposit limit','atomic rollback','900k transfer + 300k cash, rental remains 200k','original receipt dates and audit preserved','retry never duplicates receipts','stale revision denied'],realBusinessWrites:0}));
 }finally{await c.query('ROLLBACK');c.release();await globalThis.himotoPool?.end();}}
main().catch(e=>{console.error({message:e.message,code:e.code,stack:e.stack});process.exitCode=1;});


