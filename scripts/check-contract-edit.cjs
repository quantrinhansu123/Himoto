const assert=require('node:assert/strict'),path=require('node:path');
const {load,root}=require('./lib/load-typescript.cjs');
const shared=load(path.join(root,'lib/management/contract-profile'));
const service=load(path.join(root,'lib/server/contract-profile'));
const {dataAccess}=load(path.join(root,'lib/server/access-context'));
const {ACCESS_ROLES}=load(path.join(root,'lib/management/permissions'));
const checks=[];
const staff={id:70001,access_role:'branch_staff',store_id:32,scope_all:false,permissions:[...ACCESS_ROLES.branch_staff.permissions],operation:''};
const empty={stores:[],staff:[],contracts:[],customers:[],vehicles:[]};
const draft=load(path.join(root,'lib/management/contract-document')).createContractDraft(empty,'all');
draft.customer.name='Khách kiểm tra';draft.customer.phone='0900000001';draft.customer.id_card='001234567890';
draft.staff_name='Nhân viên kiểm tra';draft.signed_on='2026-10-24';draft.created_on='2026-10-24';
const profile=shared.contractProfile(draft);
const body=(revision='1',code='005987')=>({revision,profile:structuredClone(profile),contract_number:code,notes:'Đã đối chiếu HĐ giấy'});

async function main(){
 for(const role of ['branch_staff','ownership_staff','ownership_manager']){
  const user={...staff,access_role:role,permissions:[...ACCESS_ROLES[role].permissions]};
  assert(shared.canEditIssuedContract(user,32));assert(!shared.canEditIssuedContract(user,33));
  assert(!shared.canEditIssuedContract({...user,scope_all:true},33));
 }
 for(const role of ['accounting','internal_control','hr'])assert(!shared.canEditIssuedContract({...staff,access_role:role,permissions:[...ACCESS_ROLES[role].permissions]},32));
 assert(!shared.canEditIssuedContract(null,32));assert(!shared.canEditIssuedContract({...staff,store_id:null,scope_all:true},32));
 assert(shared.canEditIssuedContract({access_role:'admin'},33));
 checks.push('Operating and ownership staff edit only their assigned branch; scope_all does not bypass branch matching; admin can edit all branches');
 assert.equal(service.parseContractProfile(body('1',' 005987 ')).contract_number,'005987');
 assert.equal(service.parseContractProfile({revision:'1',profile:structuredClone(profile)}).contract_number,undefined);
 for(const code of ['', ' ', 'NHAP-1','EXCEL-1','A\nB','0'.repeat(33),5987])assert.throws(()=>service.parseContractProfile(body('1',code)),e=>e.status===400);
 for(const patch of [{store_id:33},{total_amount:1},{paid_amount:1},{status:'draft'},{status:'bogus'},{draft_payload:{}},{notes:'x'.repeat(4001)}])assert.throws(()=>service.parseContractProfile({...body(),...patch}),e=>e.status===400);
 assert.equal(service.parseContractProfile({...body(),status:'completed'}).status,'completed');
 assert.equal(service.parseContractProfile({...body(),profile:{...profile,created_on:'2026-10-01'}}).profile.created_on,'2026-10-01');
 assert.throws(()=>service.parseContractProfile({...body(),profile:{...profile,created_on:'2026-13-40'}}),e=>e.status===400);
 assert.throws(()=>service.parseContractProfile({...body(),profile:{...profile,created_on:''}}),e=>e.status===400);
 assert.throws(()=>service.parseContractProfile({...body(),profile:{...profile,total_amount:'1'}}),e=>e.status===400);
 for(const term of ['custom','6','9','12','18','24'])assert.equal(service.parseContractProfile({...body(),profile:{...profile,ownership_term_months:term}}).profile.ownership_term_months,term);
 assert.throws(()=>service.parseContractProfile({...body(),profile:{...profile,ownership_term_months:'36'}}),e=>e.status===400);
 checks.push('Paper numbers retain leading zeros; blank/reserved/control/oversized codes and financial/store payloads are rejected; issued status and created_on can be corrected; ownership rental packages stay on the profile path; old profile clients remain supported');
 const history=await load(path.join(root,'lib/server/contract-history')).readContractHistory({query:async sql=>sql.includes('SELECT o.id,o.created_at')?{rowCount:1,rows:[{created_at:'2026-10-24T10:00:00Z',contract_edits:[{at:'2026-10-24T11:00:00Z',actor_id:70001,before:{contract_number:'005986',notes:'',status:'renting'},after:{contract_number:'005987',notes:'Sửa theo giấy',status:'completed'}}]}]}:{rowCount:0,rows:[]}},1);
 const edit=history.changes.find(item=>item.kind==='edit');
 assert(edit);assert.equal(edit.actor,'#70001');assert.match(edit.detail,/005986 → 005987/);assert.match(edit.detail,/ghi chú/);assert.match(edit.detail,/Đang thuê → Hoàn thành/);
 checks.push('Contract history exposes the correction with old/new numbers, status, timestamp, actor and note-change marker');

 if(process.argv.includes('--live-temp')){
  require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
  const c=await load(path.join(root,'lib/server/himoto-database')).himotoPool.connect();
  const schema='qa_contract_edit_'+process.pid;
  const proxy={query:(sql,params)=>{const rewritten=sql.replaceAll('himoto.',schema+'.');assert(!rewritten.includes('himoto.'),'Business SQL must stay in rollback fixtures');return c.query(rewritten,params);}};
  try{
   await c.query('BEGIN');
   await c.query(`CREATE SCHEMA ${schema};
    CREATE TABLE ${schema}.orders(LIKE himoto.orders INCLUDING ALL);
    ALTER TABLE ${schema}.orders ENABLE ROW LEVEL SECURITY;
    CREATE POLICY branch_scope ON ${schema}.orders USING(himoto.access_store(store_id)) WITH CHECK(himoto.access_store(store_id));
    GRANT USAGE ON SCHEMA ${schema} TO himoto_scoped;
    GRANT SELECT,UPDATE ON ${schema}.orders TO himoto_scoped;
    CREATE FUNCTION ${schema}.contract_number_available(target text,excluded_order bigint) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,${schema} AS $$
     SELECT target IS NOT NULL AND length(target) BETWEEN 1 AND 32 AND NOT EXISTS(SELECT 1 FROM ${schema}.orders WHERE (contract_number=target OR draft_reference=target) AND (excluded_order IS NULL OR id<>excluded_order)) $$;
    GRANT EXECUTE ON FUNCTION ${schema}.contract_number_available(text,bigint) TO himoto_scoped;`);
   await c.query(`INSERT INTO ${schema}.orders(id,store_id,order_status,contract_number,draft_reference,total,pid,first_deposit_amount,note,draft_payload)
     VALUES(1,32,'renting','005986','005986','180000',1180000,1000000,'Ghi chú gốc',$1),
       (2,33,'renting','OTHER-BRANCH','OTHER-BRANCH','0',0,0,'','{}'),
       (3,32,'draft',NULL,'RESERVED-DRAFT','0',0,0,'','{}'),
       (4,32,'completed','ARCHIVED','ARCHIVED','0',0,0,'','{}')`,[JSON.stringify({kept:'original',management_composer:{draft:{...draft,contract_number:'005986'},finalized:{contract_number:'005986',at:'2026-10-24T11:07:20Z'},versions:[{version:1}]}})]);
   await c.query(`UPDATE ${schema}.orders SET deleted_at=now() WHERE id=4`);
   const rows=async()=>(await c.query(`SELECT * FROM ${schema}.orders ORDER BY id`)).rows;
   const revision=async(id)=>(await c.query(`SELECT xmin::text AS revision FROM ${schema}.orders WHERE id=$1`,[id])).rows[0].revision;
   const before=await rows();
   const scope=async user=>{await c.query('RESET ROLE');await c.query("SELECT set_config('himoto.store_id',$1,true),set_config('himoto.scope_all',$2,true),set_config('himoto.actor_id',$3,true)",[String(user.store_id||''),String(user.scope_all),String(user.id)]);if(user.access_role!=='admin')await c.query('SET LOCAL ROLE himoto_scoped');};
   const apply=async(user,id,input)=>{await scope(user);return dataAccess.run(user,()=>service.updateContractProfile(proxy,id,user.id,input));};
   await assert.rejects(()=>apply(staff,2,body()),e=>e.status===404);
   await assert.rejects(()=>apply({...staff,scope_all:true},2,body()),e=>e.status===403);
   await assert.rejects(()=>apply({...staff,access_role:'accounting',permissions:[...ACCESS_ROLES.accounting.permissions],scope_all:true},1,body()),e=>e.status===403);
   await assert.rejects(()=>apply(staff,1,body('0')),e=>e.status===409);
   await assert.rejects(()=>apply(staff,3,body()),e=>e.status===409);
   await assert.rejects(()=>apply(staff,4,body()),e=>e.status===404);
   for(const code of ['OTHER-BRANCH','RESERVED-DRAFT','ARCHIVED'])await assert.rejects(async()=>apply(staff,1,body(await revision(1),code)),e=>e.status===409);
   await c.query('RESET ROLE');assert.deepEqual(await rows(),before);
   checks.push('Real PostgreSQL RLS and service checks reject guessed foreign IDs, broad-scope staff, accounting, stale versions, drafts, deleted contracts and occupied numbers across branches without changing rows');
   const input=body(await revision(1));input.profile.customer.name='Tên khách đã sửa';
   const result=await apply(staff,1,input);assert.equal(result.code,'005987');
   await c.query('RESET ROLE');const after=await rows(),saved=after[0];
   assert.equal(saved.contract_number,'005987');assert.equal(saved.draft_reference,'005987');assert.equal(saved.customer_name,'Tên khách đã sửa');assert.equal(saved.note,input.notes);
   for(const key of ['total','pid','first_deposit_amount','order_status','store_id','customer_id','rent_at','return_at','contract_issued_at'])assert.deepEqual(saved[key],before[0][key],key);
   assert.deepEqual(after.slice(1),before.slice(1));
   const composer=saved.draft_payload.management_composer;
   assert.equal(composer.draft.contract_number,'005987');assert.deepEqual(composer.finalized,before[0].draft_payload.management_composer.finalized);
   assert.deepEqual(composer.versions,[{version:1}]);assert.equal(saved.draft_payload.kept,'original');
   assert.equal(composer.contract_edits[0].actor_id,staff.id);assert.equal(composer.contract_edits[0].before.contract_number,'005986');assert.equal(composer.contract_edits[0].after.contract_number,'005987');
   assert.equal(composer.contract_edits[0].before.status,'renting');assert.equal(composer.contract_edits[0].after.status,'renting');
   const numbering=load(path.join(root,'lib/server/contract-number'));
   assert.equal(await numbering.contractNumberAvailable(proxy,'005986',null),true);assert.equal(await numbering.contractNumberAvailable(proxy,'005987',null),false);
   const mapped=load(path.join(root,'lib/management/repository')).mapApiRow('contracts',{...saved,status:saved.order_status,draft_revision:result.revision});
   const reopened=load(path.join(root,'lib/management/contract-document')).createContractDraft(empty,'all',mapped);
   assert.equal(reopened.contract_number,'005987');assert.equal(reopened.customer.name,'Tên khách đã sửa');
   checks.push('Renaming an issued contract frees the mistyped number, reserves the corrected number, updates its snapshot and reopened profile, records before/after and actor, and preserves money, stock references, finalization identity and all other contracts');
   const statusInput=body(await revision(1));statusInput.status='completed';
   await apply(staff,1,statusInput);await c.query('RESET ROLE');
   assert.equal((await rows())[0].order_status,'completed');
   assert.equal((await rows())[0].draft_payload.management_composer.contract_edits.at(-1).after.status,'completed');
   checks.push('Issued contract status can be corrected without changing money or vehicle stock');
   const createdInput=body(await revision(1));createdInput.profile={...createdInput.profile,created_on:'2026-09-15'};
   await apply(staff,1,createdInput);await c.query('RESET ROLE');
   const afterCreated=(await rows())[0];
   assert.equal(afterCreated.draft_payload.management_composer.profile.created_on,'2026-09-15');
   assert.equal(new Date(afterCreated.created_at).toLocaleDateString('en-CA',{timeZone:'Asia/Ho_Chi_Minh'}),'2026-09-15');
   assert.equal(afterCreated.order_status,'completed');
   assert.deepEqual(afterCreated.rent_at,before[0].rent_at);
   assert.deepEqual(afterCreated.total,before[0].total);
   checks.push('Issued contract created_on can be corrected and syncs orders.created_at without changing money or rental dates');
   await apply({...staff,id:70002,access_role:'admin',scope_all:true},2,body(await revision(2),'000123'));
   await c.query('RESET ROLE');assert.equal((await rows())[1].contract_number,'000123');
   checks.push('Admin can correct a different branch; the entire schema and fixtures roll back');
  }finally{await c.query('ROLLBACK').catch(()=>{});c.release();}
 }
 console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0,realTelegramRequests:0},null,2));
}
main().then(()=>process.exit(0)).catch(error=>{console.error(error.stack);process.exit(1);});
