const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
require('@next/env').loadEnvConfig(path.resolve(__dirname,'..'),false,{info(){},error(){}});
const {load,root} = require('./lib/load-typescript.cjs');
const server = load(path.join(root,'lib/server/contract-types'));
const client = load(path.join(root,'lib/management/contract-types'));
const documents = load(path.join(root,'lib/management/contract-document'));
const drafts = load(path.join(root,'lib/server/contract-drafts'));
const billing = load(path.join(root,'lib/management/contract-billing'));
const permissions = load(path.join(root,'lib/management/permissions'));
const repository = load(path.join(root,'lib/management/repository'));
const checks=[];
const input={label:'Thuê 24 tháng',rental_type:'monthly',term_months:24,active:true};
assert.equal(permissions.canRecordContractPayment({role:'ke-toan'}),true);
assert.equal(permissions.canRecordContractPayment({role:'admin'}),true);
assert.equal(permissions.canRecordContractPayment({role:'staff'}),false);
assert.deepEqual(client.initialContractTypes().filter(t=>t.active).map(t=>t.id),['daily','monthly','ownership']);
assert.deepEqual(server.parseContractType({...input,label:'  Thuê 24 tháng  '}),input);
for(const patch of [{term_months:0},{term_months:121},{term_months:'24'},{rental_type:'invalid'},{label:' '},{label:'a\n'},{label:'a'.repeat(81)},{unexpected:true},{rental_type:'daily',term_months:24}]) {
  // Trailing whitespace is normalized; embedded control characters are rejected.
  if(patch.label==='a\n')patch.label='a\nb';
  assert.throws(()=>server.parseContractType({...input,...patch}),server.ContractTypeError);
}
assert.throws(()=>server.parseContractType({id:'daily',revision:'1',label:'Changed',active:true,rental_type:'monthly'},true),server.ContractTypeError);
checks.push('Only three initial choices; strict names, billing modes, months and immutable billing on edit');
const draft=()=>({...documents.createContractDraft({stores:[],staff:[],customers:[],contracts:[],vehicles:[]},'all'),contract_type_id:'custom_test',contract_type_name:'Untrusted client name',contract_type_months:'12',package_name:'Theo tháng'});
async function core(){
  let type={id:'custom_test',...input,revision:'1'};
  const db={query:async()=>({rows:[type]})};
  const d=draft();await server.resolveDraftContractType(db,d,'monthly');
  assert.equal(d.contract_type_name,input.label);assert.equal(d.contract_type_months,'24');
  const old={...d};type={...type,label:'New name',active:false};
  const reopened={...d};await server.resolveDraftContractType(db,reopened,'monthly',old);
  assert.equal(reopened.contract_type_name,input.label);assert.equal(reopened.contract_type_months,'24');
  await assert.rejects(()=>server.resolveDraftContractType(db,draft(),'monthly'),server.ContractTypeError);
  await assert.rejects(()=>server.resolveDraftContractType(db,{...draft(),package_name:'Theo ngày'},'monthly',old),server.ContractTypeError);
  await assert.rejects(()=>server.resolveDraftContractType(db,draft(),'ownership',old),server.ContractTypeError);
  const legacy=draft();delete legacy.contract_type_id;delete legacy.contract_type_name;delete legacy.contract_type_months;
  await server.resolveDraftContractType({query(){throw Error('Legacy saves must not require catalog');}},legacy,'daily');
  drafts.parseDraftEdits({draft:legacy,status:'draft',rental_type:'daily',notes:''});
  const legacyRow=repository.mapApiRow('contracts',{id:800,draft_reference:'NHAP-800',status:'draft',rental_type:'monthly_12',draft_payload:{management_composer:{version:1,rental_type:'monthly_12',draft:legacy}}});
  const historical=documents.createContractDraft({stores:[],staff:[],customers:[],contracts:[],vehicles:[]},'all',legacyRow);
  assert.equal(historical.contract_type_id,'monthly_12');assert.equal(historical.contract_type_name,'Thuê 12 tháng');assert.equal(historical.contract_type_months,'12');
  assert.throws(()=>drafts.parseDraftEdits({draft:{...legacy,contract_type_name:'Forged'},status:'draft',rental_type:'daily',notes:''}));
  const end=billing.addRentalMonths('2024-02-29T13:46',24);
  assert.equal(end,'2026-02-28T13:46');assert.equal(billing.rentalPeriodCount('2024-02-29T13:46',end,'month'),24);
  checks.push('Server resolves trusted snapshots; hidden historical types keep names; tampered billing is blocked; 24-month leap-day dates remain correct');
  type={...type,label:input.label,active:true};
  let payload;
  const capture={query:async(sql,params)=>{
    if(sql.startsWith(drafts.CONTRACT_LIST_SQL))return {rows:[{id:999,draft_payload:payload}]};
    if(sql.includes('FROM himoto.management_contract_types'))return {rows:[type],rowCount:1};
    if(sql.includes('FROM himoto.stores') || sql.includes('FROM himoto.staff_profiles') || sql.includes('FROM himoto.vehicles'))return {rows:[],rowCount:0};
    if(sql.startsWith('INSERT INTO himoto.orders')){payload=JSON.parse(params[9]);return {rows:[{id:999}],rowCount:1};}
    if(sql.startsWith('UPDATE himoto.orders SET draft_reference'))return {rows:[],rowCount:1};
    throw Error('Unexpected SQL in draft integration check');
  }};
  const persisted=await drafts.saveDatabaseDraft(capture,null,{draft:draft(),rental_type:'monthly',status:'draft',notes:''});
  assert.equal(persisted.draft_payload.management_composer.draft.contract_type_name,input.label);
  assert.equal(persisted.draft_payload.management_composer.draft.contract_type_months,'24');
  assert.equal(persisted.draft_payload.management_composer.draft.paid_amount,'0');
  checks.push('Draft save resolves catalog before persisting the trusted name and months; received money stays zero');
}
async function live(){
  const pool=load(path.join(root,'lib/server/himoto-database')).himotoPool,c=await pool.connect();
  const rewrite=sql=>sql.replaceAll('himoto.management_contract_types','pg_temp.qa_types').replaceAll('himoto.users','pg_temp.qa_type_users');
  const db={query(sql,params){const rewritten=rewrite(sql);assert(!rewritten.includes('himoto.'),'Only TEMP writes');return c.query(rewritten,params);}};
  const attempt=async work=>{await c.query('SAVEPOINT type_case');try{const r=await work();await c.query('RELEASE SAVEPOINT type_case');return r;}catch(e){await c.query('ROLLBACK TO SAVEPOINT type_case');await c.query('RELEASE SAVEPOINT type_case');throw e;}};
  try{
    await c.query('BEGIN');await c.query('CREATE TEMP TABLE qa_type_users(id bigint PRIMARY KEY) ON COMMIT DROP');await c.query('INSERT INTO qa_type_users VALUES(143)');
    const migration=fs.readFileSync(path.join(__dirname,'../docs/sql/2026-10-16-contract-types.sql'),'utf8').replace(/^BEGIN;\s*/,'').replace(/COMMIT;\s*$/,'');
    await db.query(migration);
    let types=await server.listContractTypes(db);assert.equal(types.length,9);assert.equal(types.filter(t=>t.active).length,3);
    types=await server.saveContractType(db,input,143);
    const added=types.find(t=>t.label===input.label);assert(added.id.startsWith('custom_'));assert.equal(added.term_months,24);
    await assert.rejects(()=>attempt(()=>server.saveContractType(db,{...input,label:input.label.toUpperCase()},143)),e=>e.code==='23505');
    const saved=draft();saved.contract_type_id=added.id;await server.resolveDraftContractType(db,saved,'monthly');
    types=await server.saveContractType(db,{id:added.id,revision:added.revision,label:'Thuê dài hạn',active:false},143,true);
    assert.equal(types.find(t=>t.id===added.id).active,false);
    const reopened={...saved};await server.resolveDraftContractType(db,reopened,'monthly',saved);assert.equal(reopened.contract_type_name,input.label);
    await assert.rejects(()=>attempt(()=>server.resolveDraftContractType(db,{...draft(),contract_type_id:added.id},'monthly')),server.ContractTypeError);
    await assert.rejects(()=>attempt(()=>server.saveContractType(db,{id:added.id,revision:'0',label:'Stale name',active:true},143,true)),e=>e.status===409);
    const legacyMonthly={...draft(),contract_type_id:'monthly_12',contract_type_name:'Thuê 12 tháng',contract_type_months:'12'};
    await server.resolveDraftContractType(db,{...legacyMonthly},'monthly_12',legacyMonthly);
    checks.push('TEMP migration and CRUD: persistent custom types, duplicate names, stale revisions, archived legacy types and snapshot retention');
  }finally{await c.query('ROLLBACK');c.release();await globalThis.himotoPool?.end();}
}
(async()=>{await core();if(process.argv.includes('--live-temp'))await live();console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0},null,2));})().catch(e=>{console.error(e);process.exitCode=1;});
