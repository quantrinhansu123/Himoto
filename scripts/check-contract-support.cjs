const assert=require('node:assert/strict'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {load,root}=require('./lib/load-typescript.cjs');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {deleteContractDraft}=load(path.join(root,'lib/server/contract-draft-delete'));
const {readPendingContractTelegram}=load(path.join(root,'lib/server/contract-telegram-pending'));
const {requestPermission}=load(path.join(root,'lib/server/access-request'));
const {hasPermission}=load(path.join(root,'lib/management/permissions'));
const {ownerDatabase}=load(path.join(root,'lib/server/himoto-database'));

(async()=>{const c=await ownerDatabase.connect(),checks=[];
 const tables=['orders','transactions','order_vehicle_details','management_contract_notifications','stores','customers'];
 const proxy={query(sql,args){for(const table of tables)sql=sql.replaceAll(`himoto.${table}`,`pg_temp.qa_support_${table}`);assert(!sql.includes('himoto.'),'All business queries must use TEMP');return c.query(sql,args);}};
 async function revision(id){return (await c.query('SELECT xmin::text AS revision FROM qa_support_orders WHERE id=$1',[id])).rows[0].revision;}
 async function refuse(id,status,rev){await c.query('SAVEPOINT refused');try{await assert.rejects(deleteContractDraft(proxy,id,rev??await revision(id),143),e=>e.status===status);}finally{await c.query('ROLLBACK TO SAVEPOINT refused');await c.query('RELEASE SAVEPOINT refused');}}
 try{
  assert.equal(requestPermission('/api/auth/order/car-rental/100/draft','DELETE'),'contracts.draft');
  assert.equal(requestPermission('/api/auth/contract-telegram-pending','GET'),'contracts.read');
  assert.equal(hasPermission({permissions:['contracts.read']},requestPermission('/api/auth/order/car-rental/100/draft','DELETE')),false);
  checks.push('Draft deletion requires contracts.draft; read-only users cannot delete; pending list requires contracts.read');
  await c.query('BEGIN');
  for(const table of tables){await c.query(`CREATE TEMP TABLE qa_support_${table}(LIKE himoto.${table} INCLUDING DEFAULTS) ON COMMIT DROP`);await c.query(`ALTER TABLE qa_support_${table} ALTER COLUMN id DROP DEFAULT`);}
  await c.query(`INSERT INTO qa_support_stores(id,store_name) VALUES(23,'CS QA A'),(34,'CS QA B');
   INSERT INTO qa_support_orders(id,order_status,store_id,draft_reference,draft_payload) VALUES
   (100,'draft',23,'NHAP-QA-100','{"management_composer":{"draft":{"staff_name":"QA"}}}'),
   (101,'renting',23,'NHAP-QA-101','{}'),(102,'draft',23,'NHAP-QA-102','{}'),(103,'draft',23,'NHAP-QA-103','{}'),
   (104,'draft',23,'NHAP-QA-104','{}'),(105,'draft',23,'NHAP-QA-105','{}'),(106,'draft',23,'NHAP-QA-106','{}');
   UPDATE qa_support_orders SET contract_number='QA-ISSUED' WHERE id=102;
   UPDATE qa_support_orders SET contract_issued_at=now() WHERE id=103;
   UPDATE qa_support_orders SET draft_payload='{"management_composer":{"finalized":{"id":1}}}' WHERE id=104;
   INSERT INTO qa_support_transactions(id,order_id,name,type,value,note,status,user_id,store_id,created_at) VALUES(501,105,'order:deposit','in',100,'QA','approved',143,23,now());
   INSERT INTO qa_support_order_vehicle_details(id,order_id,vehicle_id) VALUES(601,106,999);`);
  await refuse(100,409,'0');await refuse(999,404,'1');
  for(const id of [101,102,103,104,105,106])await refuse(id,409);
  assert.equal((await c.query('SELECT count(*)::int n FROM qa_support_orders WHERE deleted_at IS NOT NULL')).rows[0].n,0);
  checks.push('Stale/nonexistent drafts, issued/finalized contracts, receipts and vehicle history all refuse deletion without changes');
  await deleteContractDraft(proxy,100,await revision(100),143);
  const deleted=(await c.query('SELECT deleted_at,draft_payload,draft_reference FROM qa_support_orders WHERE id=100')).rows[0];assert(deleted.deleted_at);assert.equal(deleted.draft_payload.management_composer.draft.staff_name,'QA');assert.equal(deleted.draft_payload.management_composer.deleted_draft.actor_id,143);
  assert.equal(deleted.draft_reference,'DELETED-100');assert.equal(deleted.draft_payload.management_composer.deleted_draft.original_reference,'NHAP-QA-100');
  const numbering=load(path.join(root,'lib/server/contract-number'));
  assert.equal(await numbering.contractNumberAvailable(proxy,'NHAP-QA-100',null),true);
  assert.equal(await numbering.contractNumberAvailable(proxy,'QA-ISSUED',null),false);
  await c.query("INSERT INTO qa_support_orders(id,order_status,store_id,draft_reference,draft_payload,deleted_at) VALUES(107,'draft',23,'005970','{}',now()),(108,'draft',23,'DO-NOT-FREE','{}',now())");
  await c.query("INSERT INTO qa_support_transactions(id,order_id,name,type,value,note,user_id,store_id,created_at,status) VALUES(502,108,'order:payment','in',100,'QA',143,23,now(),'approved')");
  const archiveMigration=require('node:fs').readFileSync('docs/sql/2026-10-21-contract-return-and-draft-release.sql','utf8').split('-- The order branch')[0].replace(/^BEGIN;/m,'');
  await proxy.query(archiveMigration);await proxy.query(archiveMigration);
  assert.equal(await numbering.contractNumberAvailable(proxy,'005970',null),true);assert.equal(await numbering.contractNumberAvailable(proxy,'DO-NOT-FREE',null),false);
  await c.query('DELETE FROM qa_support_transactions WHERE id=502');
  checks.push('Deleted clean drafts release their paper reference with original-value audit; migration is idempotent and issued/financial drafts stay protected');
  await refuse(100,404,'1');
  assert.equal((await c.query('SELECT count(*)::int n FROM qa_support_transactions')).rows[0].n,1);
  assert.equal((await c.query('SELECT count(*)::int n FROM qa_support_order_vehicle_details')).rows[0].n,1);
  checks.push('Delete hides only an unissued draft, keeps its files/snapshot and audit actor, touches no stock/receipts; repeat delete refuses');
  await c.query(`INSERT INTO qa_support_orders(id,order_status,store_id,contract_number) VALUES
    (200,'renting',23,'QA-200'),(201,'completed',23,'QA-201'),(202,'renting',34,'QA-202'),(203,'draft',23,NULL),(204,'cancelled',23,'QA-204'),(205,'renting',23,'QA-205');
    UPDATE qa_support_orders SET deleted_at=now() WHERE id=205;`);
  async function notice(id,key,status,seconds,mode='auto'){
   await c.query(`INSERT INTO qa_support_management_contract_notifications(id,order_id,store_id,event_key,root_event_key,event_type,payload,status,delivery_mode,created_at)
    SELECT $1,id,store_id,$2,$3,'rental','{}',$4,$5,'2026-10-20T00:00:00Z'::timestamptz+($6||' seconds')::interval FROM qa_support_orders WHERE id=$7`,[randomUUID(),`${key}:${seconds}`,key,status,mode,String(seconds),id]);
  }
  await notice(200,'sent-root','manual',1);await notice(200,'sent-root','sent',2,'manual');
  await notice(200,'unconfirmed-root','manual',3);await notice(200,'unconfirmed-root','unknown',4,'manual');
  await notice(200,'pending-root','manual',5);await notice(200,'pending-root','pending',6,'manual');
  await notice(200,'retry-root','failed',7,'manual');await notice(200,'retry-root','sent',8,'manual');
  await notice(201,'old-completed-root','manual',9);await notice(202,'other-branch-root','awaiting_config',10);
  for(const id of [203,204,205])await notice(id,`excluded-${id}`,'manual',11);
  const branch=await readPendingContractTelegram(proxy,23);assert.equal(branch.total,2);assert.deepEqual(branch.rows.map(r=>r.event_key),['old-completed-root','unconfirmed-root']);assert.equal(branch.rows[1].status,'unknown');
  assert.equal((await readPendingContractTelegram(proxy,34)).total,1);assert.equal((await readPendingContractTelegram(proxy,null)).total,3);
  const emptyPage=await readPendingContractTelegram(proxy,23,2);assert.equal(emptyPage.total,2);assert.equal(emptyPage.rows.length,0);
  checks.push('Pending list includes old completed/unknown sends, removes sent/retried/pending roots, excludes draft/cancelled/deleted and filters branches with stable pagination totals');
  await c.query('ROLLBACK');console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0,realSequenceChanges:0,realTelegramMessages:0},null,2));
 }finally{await c.query('ROLLBACK').catch(()=>{});c.release();await globalThis.himotoPool?.end();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
