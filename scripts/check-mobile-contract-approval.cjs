// Real web/mobile SQL on isolated PostgreSQL; never load env or a network DB.
require('./lib/offline-tests.cjs');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{randomUUID}=require('node:crypto'),{NextRequest}=require('next/server');
const {load,root}=require('./lib/load-typescript.cjs');
async function run(){
 const at=process.argv.indexOf('--pglite-path');if(at<0||!process.argv[at+1])throw Error('Pass --pglite-path for isolated SQL only.');
 const {PGlite}=require(path.resolve(process.argv[at+1])),pg=new PGlite();let failReceipt=false;
 const raw={release(){},async query(sql,values){
  if(failReceipt&&sql.includes('UPDATE himoto.management_mobile_requests SET resource_id')){failReceipt=false;throw Error('QA receipt rollback');}
  const result=!values&&sql.includes(';')?(await pg.exec(sql)).at(-1):await pg.query(sql,values);
  return{...result,rowCount:result.rows.length||result.affectedRows||0};
 }};
 global.himotoPool={connect:async()=>raw,query:raw.query.bind(raw)};
 const api=load(path.join(root,'lib/server/mobile-contract-approval')),recovery=load(path.join(root,'lib/server/mobile-write-recovery')),web=load(path.join(root,'lib/server/contract-approval')),pure=load(path.join(root,'../shared/contract-approval')),dto=load(path.join(root,'../shared/mobile-contract-approval')),checks=[];
 const manager={id:145,name:'Quản lý QA',role:'staff',access_role:'branch_manager',store_id:23,scope_all:false,permissions:['contracts.read','contracts.finalize']};
 const staff={...manager,id:7,name:'Nhân viên QA',access_role:'branch_staff'},other={...manager,store_id:24};
 const req=(id,revision,key)=>new NextRequest(`https://fixture.invalid/api/mobile/v1/contracts/${id}/approval`,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify({revision})});
 const read=(id,who=manager)=>api.readMobileContractApproval(who,String(id));
 const write=(id,revision,key=randomUUID(),who=manager)=>api.writeMobileContractApproval(who,String(id),req(id,revision,key));
 const resolve=(key,id=9201,who=manager)=>recovery.resolveMobileWrite(who,key,new NextRequest(`https://fixture.invalid/api/mobile/v1/write-requests/${key}/resolve`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:`contract.approve:${id}`})}));
 const history=async id=>(await pg.query("SELECT jsonb_array_length(draft_payload #> '{management_composer,approval_history}') AS n FROM himoto.orders WHERE id=$1",[id])).rows[0].n;
 try{
  await pg.exec(`CREATE SCHEMA himoto;CREATE ROLE himoto_scoped;
   CREATE TABLE himoto.users(id bigint PRIMARY KEY,name text);INSERT INTO himoto.users VALUES(7,'Nhân viên QA'),(145,'Quản lý QA');
   CREATE TABLE himoto.stores(id bigint PRIMARY KEY,kind text,store_name text);INSERT INTO himoto.stores VALUES(23,'lease_to_own','QA Thuê sở hữu'),(24,'rental','QA Cơ sở khác'),(25,'rental','QA Trụ sở chính');
   CREATE TABLE himoto.orders(id bigint PRIMARY KEY,store_id bigint,contract_number text,draft_reference text,order_status text,order_type text,customer_name text,total bigint,
    first_deposit_amount bigint,additional_deposit_amount bigint,pid bigint,draft_payload jsonb,updated_at timestamptz,deleted_at timestamptz);
   INSERT INTO himoto.orders SELECT id,23,'APPROVAL'||id,NULL,'renting','daily','Khách duyệt QA',1000000,200000,50000,300000,'{}',now(),NULL FROM generate_series(9201,9206)id;
   UPDATE himoto.orders SET order_status='draft'WHERE id=9203;UPDATE himoto.orders SET order_status='cancelled'WHERE id=9204;
   INSERT INTO himoto.orders VALUES(9210,24,'OTHER9210',NULL,'renting','daily','Khách khác',500000,0,0,0,'{}',now(),NULL),
    (9211,24,'OWN9211',NULL,'renting','ownership','Khách sở hữu',600000,0,0,0,'{}',now(),NULL),
    (9212,25,'HQ9212',NULL,'renting','daily','Khách trụ sở',600000,0,0,0,'{}',now(),NULL);
   CREATE TABLE himoto.vehicles(id bigint PRIMARY KEY,status text,current_store_id bigint);INSERT INTO himoto.vehicles VALUES(29201,'using',23);
   CREATE TABLE himoto.transactions(id bigint PRIMARY KEY,value bigint,status text);INSERT INTO himoto.transactions VALUES(39201,300000,'approved');
   CREATE TABLE himoto.management_mobile_requests(user_id bigint,request_id uuid,operation text,fingerprint char(64),resource_id bigint,resource_revision text,PRIMARY KEY(user_id,request_id));
   GRANT USAGE ON SCHEMA himoto TO himoto_scoped;GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA himoto TO himoto_scoped;
   ALTER TABLE himoto.orders ENABLE ROW LEVEL SECURITY;CREATE POLICY branch_orders ON himoto.orders TO himoto_scoped USING(current_setting('himoto.scope_all',true)='true'OR store_id=NULLIF(current_setting('himoto.store_id',true),'')::bigint);
   ALTER TABLE himoto.management_mobile_requests ENABLE ROW LEVEL SECURITY;CREATE POLICY actor_receipts ON himoto.management_mobile_requests TO himoto_scoped USING(user_id=NULLIF(current_setting('himoto.actor_id',true),'')::bigint);`);
  const business=async()=>({orders:(await pg.query('SELECT id,store_id,order_status,total,pid,first_deposit_amount,additional_deposit_amount FROM himoto.orders ORDER BY id')).rows,vehicles:(await pg.query('SELECT * FROM himoto.vehicles')).rows,transactions:(await pg.query('SELECT * FROM himoto.transactions')).rows});
  const before=await business(),unapproved=await read(9205),readonly=await read(9205,staff);
  assert(unapproved.approval.can_approve);assert(!readonly.approval.can_approve);
  assert(!pure.canApproveOwnershipContract(staff));assert(pure.canApproveOwnershipContract(manager));
  await assert.rejects(()=>write(9201,'1',randomUUID(),staff),e=>e.status===403);
  await assert.rejects(()=>read(9201,other),e=>e.status===404);
  await assert.rejects(()=>resolve(randomUUID(),9201,staff),e=>e.status===403);
  assert.equal((await read(9210,other)).approval,null);assert((await read(9211,other)).approval.can_approve);
  assert((await read(9212,{...manager,store_id:25})).approval.can_approve);
  checks.push('Actual web eligibility includes daily contracts at ownership/HQ stores; role + grant + current scoped visibility enforced for read/write/recovery');
  const initial=await read(9201),key=randomUUID(),approved=await write(9201,initial.approval.revision,key),replayed=await write(9201,initial.approval.revision,key);
  assert(dto.isMobileContractApprovalResult(approved));assert.equal(approved.receipt.replayed,false);assert.equal(replayed.receipt.replayed,true);assert.equal(await history(9201),1);
  assert.equal(approved.approval.approved_by,manager.name);assert.equal(approved.approval.can_approve,false);assert(approved.approval.approved_at);
  assert.equal((await resolve(key)).status,'committed');assert.deepEqual((await api.readMobileContractApprovalResult(manager,key)).result.receipt,replayed.receipt);
  await assert.rejects(()=>write(9201,'999',key),e=>e.code==='REQUEST_KEY_REUSED');
  const duplicate=await write(9201,'1');assert(duplicate.approval.approved_at);assert.equal(await history(9201),1);
  checks.push('Approve uses actual web writer and named actor; same UUID replays once, changed payload rejects; web repeat after approval adds no history');
  const stale=await read(9202);await pg.query('UPDATE himoto.orders SET updated_at=now()WHERE id=9202');
  await assert.rejects(()=>write(9202,stale.approval.revision),e=>e.status===409&&e.code==='CONTRACT_CHANGED');
  for(const id of[9203,9204])await assert.rejects(async()=>write(id,(await read(id)).approval.revision),e=>e.status===409);
  const cancelledKey=randomUUID();assert.equal((await resolve(cancelledKey,9202)).status,'cancelled');
  await assert.rejects(async()=>write(9202,(await read(9202)).approval.revision,cancelledKey),e=>e.code==='REQUEST_CANCELLED');
  failReceipt=true;await assert.rejects(async()=>write(9202,(await read(9202)).approval.revision),/QA receipt rollback/);assert.equal((await read(9202)).approval.approved_at,null);
  checks.push('Stale review, draft and cancelled orders reject; cancelled key blocks late send; business and receipt rollback together');
  // Simulate the web full editor invalidating an earlier approval. A mobile receipt
  // records the original request while its approval projection reports current state.
  await pg.query("UPDATE himoto.orders SET draft_payload=draft_payload #- '{management_composer,approval}',updated_at=now()WHERE id=9201");
  const changed=(await api.readMobileContractApprovalResult(manager,key)).result;assert.equal(changed.approval.approved_at,null);assert.equal(changed.receipt.revision,approved.receipt.revision);
  await assert.rejects(()=>api.readMobileContractApprovalResult(other,key),e=>e.status===404);
  assert.equal((await api.readMobileContractApprovalResult({...staff,access_role:'ownership_manager'},key)).result,null);
  const eligibilityKey=randomUUID();await write(9211,(await read(9211,other)).approval.revision,eligibilityKey,other);
  await pg.query("UPDATE himoto.orders SET order_type='daily',draft_payload=draft_payload #- '{management_composer,approval}'WHERE id=9211");
  const noLongerEligible=(await api.readMobileContractApprovalResult(other,eligibilityKey)).result;
  assert(dto.isMobileContractApprovalResult(noLongerEligible));assert.equal(noLongerEligible.approval,null);
  assert.deepEqual(await business(),before);
  checks.push('Receipt preserves original revision and actor; current approval can be cleared by subsequent web edit; all money, status, stock and vouchers unchanged');
  const preview=await read(9206),confirmed=await write(9206,preview.approval.revision),approvedView=await read(9206,staff);
  const catalogue=load(path.join(root,'lib/server/mobile-catalogue')),records=(await pg.query(`SELECT o.id,contract_number AS code,customer_name,order_status AS status,o.store_id,s.store_name,total AS total_amount,pid AS paid_amount,order_type AS rental_type FROM himoto.orders o JOIN himoto.stores s ON s.id=o.store_id WHERE o.id IN(9205,9206)ORDER BY o.id`)).rows.map(row=>catalogue.mobileRecord('contracts',row));
  const out=process.argv.indexOf('--fixture-output');if(out>=0){const target=path.resolve(process.argv[out+1]);assert(target.startsWith(path.resolve('.backups')+path.sep)&&!fs.existsSync(target));fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify({fixtureOnly:true,source:'Actual web/mobile approval helpers on isolated PGlite',unapproved,readonly,approved:approvedView,preview,confirmed,records,business:before},null,2));}
  return{passed:checks.length,checks,fixtureOnly:true,operationalDatabaseWrites:0,stagingAcceptance:false,completedAt:new Date().toISOString()};
 }finally{await pg.close();}
}
run().then(result=>process.stdout.write(JSON.stringify(result,null,2)+'\n')).catch(error=>{console.error(error);process.exitCode=1;});
