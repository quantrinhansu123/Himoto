// Real account services in an isolated, rolled-back schema; no production users changed.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {load,root}=require('./lib/load-typescript.cjs');
const {ownerDatabase}=load(path.join(root,'lib/server/himoto-database'));
const accounts=load(path.join(root,'lib/server/account-management'));
const session=load(path.join(root,'lib/server/management-session'));
const {ACCESS_ROLES,hasPermission,canManageAccounts}=load(path.join(root,'lib/management/permissions'));
const schema='qa_account_global_scope',checks=[];
async function main(){const c=await ownerDatabase.connect();try{
  await c.query('BEGIN');
  await c.query(`CREATE SCHEMA ${schema}`);
  for(const table of ['users','roles','stores','staff_profiles','management_account_access','management_access_audit','management_account_passwords']){
    await c.query(`CREATE TABLE ${schema}.${table}(LIKE himoto.${table} INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES)`);
    if((await c.query("SELECT 1 FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 AND column_name='id'",[schema,table])).rowCount){
      await c.query(`CREATE SEQUENCE ${schema}.${table}_id_seq START 1000000`);
      await c.query(`ALTER TABLE ${schema}.${table} ALTER COLUMN id SET DEFAULT nextval('${schema}.${table}_id_seq')`);
    }
  }
  // Reproduce the former restriction even when production has already migrated.
  await c.query(`ALTER TABLE ${schema}.management_account_access DROP CONSTRAINT IF EXISTS account_access_branch_scope`);
  await c.query(`ALTER TABLE ${schema}.management_account_access ADD CONSTRAINT account_access_branch_scope CHECK(access_role NOT IN('branch_staff','branch_manager','ownership_staff','ownership_manager') OR (NOT scope_all AND (store_id IS NOT NULL OR NOT enabled)))`);
  const migration=fs.readFileSync('docs/sql/2026-10-25-account-global-scope.sql','utf8').replaceAll('himoto.',schema+'.').replace(/^BEGIN;|^COMMIT;/gm,'');
  await c.query(migration);await c.query(migration);
  const constraints=(await c.query('SELECT conname FROM pg_constraint WHERE conrelid=$1::regclass AND contype=\'c\'',[schema+'.management_account_access'])).rows.map(r=>r.conname);
  assert(constraints.includes('account_access_scope'));assert(constraints.includes('account_access_role'));assert(!constraints.includes('account_access_branch_scope'));
  checks.push('Migration runs twice and removes only the old role/global restriction, retaining enabled-local scope and role validation');
  await c.query(`INSERT INTO ${schema}.roles SELECT * FROM himoto.roles`);
  await c.query(`INSERT INTO ${schema}.stores(id,store_name,kind,status) VALUES(80001,'Branch A QA','rental','opening'),(80002,'Branch B QA','rental','opening'),(80003,'Ownership QA','lease_to_own','opening')`);
  const admin={id:70001,access_role:'admin',scope_all:true,permissions:[...ACCESS_ROLES.admin.permissions]};
  await c.query(`INSERT INTO ${schema}.users(id,name,email,password,role_id,status) VALUES(70001,'Admin QA','admin@qa.invalid','unused',1,'active')`);
  const db={query:(sql,args)=>c.query(sql.replaceAll('himoto.',schema+'.'),args)};
  const rejected=async(fn,status)=>{await c.query('SAVEPOINT denied');await assert.rejects(fn,e=>status?e.status===status:e.code==='23514');await c.query('ROLLBACK TO SAVEPOINT denied');};
  const permissionSet=['contracts.read','customers.read'];
  let id=70010;
  for(const role of ['branch_staff','branch_manager','ownership_staff','ownership_manager']){
    id++;
    const localStore=role.startsWith('ownership_')?80003:80001;
    await c.query(`INSERT INTO ${schema}.users(id,name,email,password,role_id,status,store_id) VALUES($1,'Staff QA',$2,'preserved-password-hash-QA',3,'active',$3)`,[id,`qa${id}@qa.invalid`,localStore]);
    await c.query(`INSERT INTO ${schema}.management_account_access(user_id,login_name,access_role,store_id,scope_all,permissions,enabled) VALUES($1,$2,$3,$4,false,$5,true)`,[id,`qa${id}`,role,localStore,JSON.stringify(permissionSet)]);
    const revision=async()=>(await c.query(`SELECT xmin::text AS revision FROM ${schema}.users WHERE id=$1`,[id])).rows[0].revision;
    const input={name:'Staff QA',login_name:`qa${id}`,access_role:role,store_id:localStore,scope_all:true,permissions:permissionSet,enabled:true,password:''};
    await accounts.saveManagedAccount(db,admin.id,{...input,revision:await revision()},id,admin);
    const global=await session.userFromSession(session.signSession(id),db);
    assert(global?.scope_all);assert.equal(global.store_id,null);assert.equal(global.access_role,role);assert.deepEqual(global.permissions,permissionSet);
    for(const permission of ['accounts.manage','finance.write','settings.write','contracts.finalize'])assert(!hasPermission(global,permission));
    const stored=(await c.query(`SELECT password,store_id FROM ${schema}.users WHERE id=$1`,[id])).rows[0];assert.equal(stored.password,'preserved-password-hash-QA');assert.equal(stored.store_id,null);
    await accounts.saveManagedAccount(db,admin.id,{...input,scope_all:false,revision:await revision()},id,admin);
    const local=await session.userFromSession(session.signSession(id),db);assert.equal(local.scope_all,false);assert.equal(local.store_id,localStore);
  }
  checks.push('All four staff/manager roles round-trip local/global scope through real saves and sessions, preserving explicit permissions, role, and password');
  const manager={id:70012,access_role:'branch_manager',scope_all:true,store_id:null,permissions:[...ACCESS_ROLES.branch_manager.permissions]};
  assert(!canManageAccounts(manager));assert(!canManageAccounts({...manager,permissions:['accounts.manage']}));assert(!hasPermission({...manager,permissions:['accounts.manage']},'accounts.manage'));
  const localManager={...manager,store_id:80001,scope_all:false};
  const input={name:'Other branch staff QA',login_name:'qa.other',access_role:'branch_staff',store_id:80002,scope_all:false,permissions:permissionSet,enabled:true,password:''};
  // Guard rejections occur before a query or password generation.
  const noQuery={query:()=>assert.fail('Unauthorized write reached the database')};
  await assert.rejects(()=>accounts.saveManagedAccount(noQuery,localManager.id,input,undefined,localManager),e=>e.status===403);
  for(const patch of [{scope_all:true,store_id:null},{access_role:'branch_manager'},{permissions:['finance.write']},{access_role:'admin',scope_all:true}])await assert.rejects(()=>accounts.saveManagedAccount(noQuery,manager.id,{...input,...patch},undefined,manager),e=>e.status===403);
  // Only admin may manage accounts, even for a manager assigned all branches.
  await c.query(`INSERT INTO ${schema}.users(id,name,email,password,role_id,status) VALUES(70020,'Other branch QA','other@qa.invalid','unused',3,'active')`);
  await c.query(`INSERT INTO ${schema}.management_account_access(user_id,login_name,access_role,store_id,scope_all,permissions,enabled) VALUES(70020,'qa.other','branch_staff',80002,false,$1,true)`,[JSON.stringify(permissionSet)]);
  const revision=(await c.query(`SELECT xmin::text AS revision FROM ${schema}.users WHERE id=70020`)).rows[0].revision;
  await rejected(()=>accounts.saveManagedAccount(db,manager.id,{...input,revision},70020,manager),403);
  await rejected(()=>accounts.listManagedAccounts(db,manager),403);
  await accounts.saveManagedAccount(db,admin.id,{...input,revision,permissions:[...permissionSet,'accounts.manage']},70020,admin);
  const saved=(await c.query(`SELECT permissions FROM ${schema}.management_account_access WHERE user_id=70020`)).rows[0];assert.deepEqual(saved.permissions,permissionSet,'Stale permission forms cannot delegate account management');
  const selected=await accounts.listManagedAccounts(db,admin,80002);assert(selected.length);assert(selected.every(r=>Number(r.store_id)===80002));
  await rejected(()=>accounts.listManagedAccounts(db,localManager,80002),403);
  checks.push('Only admin manages accounts, stale legacy permission forms are normalized, and all-branch manager scope cannot delegate account privileges');
  await c.query(`ALTER TABLE ${schema}.management_account_access DROP CONSTRAINT IF EXISTS account_access_admin_management`);
  await c.query(`UPDATE ${schema}.management_account_access SET permissions=permissions||'["accounts.manage"]'::jsonb WHERE user_id=70020`);
  assert(!(await session.userFromSession(session.signSession(70020),db)).permissions.includes('accounts.manage'),'Existing sessions must sanitize legacy grants before data cleanup');
  const adminMigration=fs.readFileSync('docs/sql/2026-10-25-admin-only-account-management.sql','utf8').replaceAll('himoto.',schema+'.').replaceAll(`${schema}.actor_id'`,"himoto.actor_id'").replace(/^BEGIN;|^COMMIT;/gm,'');
  await c.query("SELECT set_config('himoto.actor_id',$1,true)",[String(admin.id)]);
  await c.query(adminMigration);await c.query(adminMigration);
  assert.deepEqual((await c.query(`SELECT permissions FROM ${schema}.management_account_access WHERE user_id=70020`)).rows[0].permissions,permissionSet);
  assert.equal((await c.query(`SELECT count(*)::int AS n FROM ${schema}.management_access_audit WHERE action='admin_only_permissions'`)).rows[0].n,1);
  await rejected(()=>c.query(`UPDATE ${schema}.management_account_access SET permissions=permissions||'["accounts.manage"]'::jsonb WHERE user_id=70020`));
  checks.push('Admin-only migration runs twice, removes only delegated account management, records one audit entry and prevents reintroduction');
  await rejected(()=>c.query(`UPDATE ${schema}.management_account_access SET store_id=NULL,scope_all=false,enabled=true WHERE user_id=70020`));
  await rejected(()=>c.query(`UPDATE ${schema}.management_account_access SET access_role='unknown' WHERE user_id=70020`));
  checks.push('Database still rejects enabled accounts without any scope and unknown roles');
  await c.query('ROLLBACK');
}finally{await c.query('ROLLBACK').catch(()=>{});c.release();await globalThis.himotoPool?.end();}
console.log(JSON.stringify({passed:checks.length,checks,realAccountChanges:0,realSequenceChanges:0},null,2));}
main().catch(e=>{console.error(e);process.exitCode=1;});
