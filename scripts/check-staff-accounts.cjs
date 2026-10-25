const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{compare}=require('bcryptjs');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {load,root}=require('./lib/load-typescript.cjs');
const {ownerDatabase}=load(path.join(root,'lib/server/himoto-database'));
const {ACCESS_ROLES,canManageAccounts,hasPermission}=load(path.join(root,'lib/management/permissions'));
const accounts=load(path.join(root,'lib/server/account-management')),staffAccounts=load(path.join(root,'lib/server/staff-accounts'));
const session=load(path.join(root,'lib/server/management-session'));
const schema='qa_staff_accounts',checks=[];
const admin={id:70001,access_role:'admin',scope_all:true,permissions:[...ACCESS_ROLES.admin.permissions]},manager={id:70002,access_role:'branch_manager',store_id:80001,scope_all:false,permissions:[...ACCESS_ROLES.branch_manager.permissions]},hr={id:70004,access_role:'hr',scope_all:true,permissions:[...ACCESS_ROLES.hr.permissions]};
async function main(){const c=await ownerDatabase.connect();
 try{
  await c.query('BEGIN');await c.query(`CREATE SCHEMA ${schema}`);
  for(const table of ['users','roles','stores','staff_profiles','management_account_access','management_access_audit']){
    await c.query(`CREATE TABLE ${schema}.${table}(LIKE himoto.${table} INCLUDING DEFAULTS INCLUDING INDEXES)`);
    if((await c.query("SELECT 1 FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 AND column_name='id'",[schema,table])).rowCount){await c.query(`CREATE SEQUENCE ${schema}.${table}_id_seq START 1000000;ALTER TABLE ${schema}.${table} ALTER COLUMN id SET DEFAULT nextval('${schema}.${table}_id_seq')`);}
  }
  await c.query(`INSERT INTO ${schema}.roles SELECT * FROM himoto.roles`);
  for(let repeat=0;repeat<2;repeat++)await c.query(fs.readFileSync('docs/sql/2026-10-24-staff-accounts.sql','utf8').replaceAll('himoto.',schema+'.').replace(/^BEGIN;|^COMMIT;/gm,''));
  for(let repeat=0;repeat<2;repeat++)await c.query(fs.readFileSync('docs/sql/2026-10-25-account-passwords.sql','utf8').replaceAll('himoto.',schema+'.').replace(/^BEGIN;|^COMMIT;/gm,''));
  await c.query(`INSERT INTO ${schema}.stores(id,store_name,status) VALUES(80001,'A QA','opening'),(80002,'B QA','opening'),(80003,'HQ QA','opening')`);
  await c.query(`INSERT INTO ${schema}.users(id,name,email,password,role_id,status,store_id) VALUES(70001,'Admin QA','admin@qa.invalid','unused',1,'active',NULL),(70002,'Manager QA','manager@qa.invalid','unused',2,'active',80001),(70003,'Legacy QA','legacy@qa.invalid','unused',3,'active',80001),(70004,'HR QA','hr@qa.invalid','unused',7,'active',NULL)`);
  await c.query(`INSERT INTO ${schema}.management_account_access(user_id,login_name,access_role,store_id,scope_all,permissions,enabled) VALUES(70002,'qa.manager','branch_manager',80001,false,$1,true)`,[JSON.stringify(manager.permissions)]);
  const rewrite=sql=>sql.replaceAll('himoto.',schema+'.');
  const db={query:(sql,args)=>c.query(rewrite(sql),args)};
  const staff=async(id,patch={})=>{const value={name:`Employee ${id} QA`,store:80001,status:'active',user:null,...patch};await c.query(`INSERT INTO ${schema}.staff_profiles(id,staff_code,full_name,phone,position,store_id,status,user_id) VALUES($1,$2,$3,'0900000000','NVKD',$4,$5,$6)`,[id,`QA-${id}`,value.name,value.store,value.status,value.user]);};
  const user=async id=>(await c.query(`SELECT u.id,u.status,u.deleted_at,u.password,a.* FROM ${schema}.users u LEFT JOIN ${schema}.management_account_access a ON a.user_id=u.id WHERE u.id=$1`,[id])).rows[0];
  const rejected=async(fn,status)=>{await c.query('SAVEPOINT denied_account');await assert.rejects(fn,e=>e.status===status);await c.query('ROLLBACK TO SAVEPOINT denied_account');};
  await staff(1001,{user:70003});
  const issued=await staffAccounts.syncStaffAccount(db,admin.id,1001,admin);assert(issued);assert.equal(issued.login_name,'nv1001');assert.equal(issued.password.length,24);assert(issued.enabled);
  const current=Number((await c.query(`SELECT user_id FROM ${schema}.staff_profiles WHERE id=1001`)).rows[0].user_id);let personal=await user(current);
  assert(await compare(issued.password,personal.password));assert(!personal.password.includes(issued.password));assert.equal(personal.scope_all,false);assert.equal(Number(personal.store_id),80001);assert.equal(personal.access_role,'branch_staff');assert(!personal.permissions.includes('accounts.manage'));
  assert.equal(await staffAccounts.syncStaffAccount(db,admin.id,1001,admin),null);assert.equal((await user(current)).password,personal.password);
  await c.query(`UPDATE ${schema}.management_account_access SET enabled=false WHERE user_id=$1`,[current]);
  await staffAccounts.syncStaffAccount(db,admin.id,1001,admin);assert.equal((await user(current)).enabled,false,'Editing an active employee cannot reopen a manually disabled account');
  await c.query(`UPDATE ${schema}.management_account_access SET enabled=true WHERE user_id=$1`,[current]);await c.query(`UPDATE ${schema}.users SET status='active' WHERE id=$1`,[current]);
  await c.query(`UPDATE ${schema}.management_account_access SET login_name='renamed.employee.qa' WHERE user_id=$1`,[current]);
  await staffAccounts.syncStaffAccount(db,admin.id,1001,admin);assert.equal((await user(current)).login_name,'renamed.employee.qa');assert.equal(Number((await c.query(`SELECT user_id FROM ${schema}.staff_profiles WHERE id=1001`)).rows[0].user_id),current,'Renaming a personal login cannot create a second account');
  const oldNames=await c.query(`SELECT full_name FROM ${schema}.staff_account_attribution WHERE user_id=70003`);assert.equal(oldNames.rows[0].full_name,'Employee 1001 QA');
  checks.push('New employee gets one unique login and strong generated bcrypt password; repeated sync keeps credentials, and legacy attribution survives relinking');

  assert(canManageAccounts(manager));assert(!canManageAccounts({...manager,access_role:'branch_staff'}));assert(!canManageAccounts({...manager,scope_all:true}));
  const visible=await accounts.listManagedAccounts(db,manager);assert(visible.every(u=>Number(u.store_id)===80001&&!u.scope_all));assert(!visible.find(u=>Number(u.id)===70001));
  const input={name:'Created by manager QA',login_name:'',password:'',access_role:'branch_staff',store_id:80001,scope_all:false,permissions:[...ACCESS_ROLES.branch_staff.permissions],enabled:true};
  const ordinary=await accounts.saveManagedAccount(db,manager.id,input,undefined,manager);assert(ordinary.credentials.password.length>=24);assert(ordinary.credentials.login_name.startsWith('nv.'));
  for(const patch of [{access_role:'admin',scope_all:true,store_id:null,permissions:[...ACCESS_ROLES.admin.permissions]},{store_id:80002},{access_role:'hr',scope_all:true},{permissions:['finance.write']}])await rejected(()=>accounts.saveManagedAccount(db,manager.id,{...input,...patch},undefined,manager),403);
  await rejected(()=>accounts.listManagedAccounts(db,{...manager,access_role:'branch_staff'}),403);
  await rejected(()=>accounts.saveManagedAccount(db,manager.id,{...input,login_name:'qa.manager',id:70002,revision:'0'},70002,manager),403);
  checks.push('Branch manager lists only own branch, creates ordinary users, and cannot grant admin/global/foreign/finance access or edit peer managers; forged permission alone is rejected');

  const revision=(await c.query(`SELECT xmin::text AS revision FROM ${schema}.users WHERE id=$1`,[ordinary.id])).rows[0].revision;
  await rejected(()=>accounts.deleteManagedAccount(db,manager.id,ordinary.id,'0',manager),409);
  await accounts.deleteManagedAccount(db,manager.id,ordinary.id,revision,manager);assert((await user(ordinary.id)).deleted_at);assert.equal((await user(ordinary.id)).enabled,false);
  await rejected(()=>accounts.deleteManagedAccount(db,admin.id,admin.id,'0',admin),403);
  await rejected(()=>accounts.deleteManagedAccount(db,manager.id,admin.id,(undefined),manager),403);
  const sessionToken=session.signSession(current);assert(await session.userFromSession(sessionToken,db));
  await c.query(`UPDATE ${schema}.staff_profiles SET status='leave' WHERE id=1001`);await staffAccounts.syncStaffAccount(db,admin.id,1001,admin);assert.equal(await session.userFromSession(sessionToken,db),null);assert((await user(current)).deleted_at);
  const beforeLeave=(await user(current)).password;
  await c.query(`UPDATE ${schema}.staff_profiles SET status='active' WHERE id=1001`);assert.equal(await staffAccounts.syncStaffAccount(db,admin.id,1001,admin),null);assert((await user(current)).deleted_at,'Editing a removed employee must not silently reopen access');
  await rejected(()=>staffAccounts.syncStaffAccount(db,admin.id,1001,admin,undefined,true),403);
  await c.query(`INSERT INTO ${schema}.users(id,name,email,password,role_id,status) VALUES(145,'Recovery QA','recovery@qa.invalid','unused',1,'active')`);
  const rehired=await staffAccounts.syncStaffAccount(db,145,1001,{...admin,id:145},undefined,true);assert(rehired);assert.notEqual((await user(current)).password,beforeLeave);assert(await compare(rehired.password,(await user(current)).password));
  checks.push('Delete uses optimistic revision, blocks self/foreign accounts and revokes live sessions; resignation removes login atomically and only explicit rehire issues fresh credentials');

  await staff(1002,{store:80002});await rejected(()=>staffAccounts.syncStaffAccount(db,manager.id,1002,manager),403);
  await staff(1003,{store:null});const pending=await staffAccounts.syncStaffAccount(db,hr.id,1003,hr);assert(!pending.enabled);const pendingId=(await c.query(`SELECT user_id FROM ${schema}.staff_profiles WHERE id=1003`)).rows[0].user_id;assert.equal(await session.userFromSession(session.signSession(Number(pendingId)),db),null);
  for(const [id,role] of [[1004,'headquarters_sales'],[1005,'headquarters_debt']]){
    await staff(id,{store:80003});const issued=await staffAccounts.syncStaffAccount(db,admin.id,id,admin,role);assert(issued.enabled);
    const uid=Number((await c.query(`SELECT user_id FROM ${schema}.staff_profiles WHERE id=$1`,[id])).rows[0].user_id),account=await session.userFromSession(session.signSession(uid),db);
    assert(account.scope_all);assert(hasPermission(account,'contracts.read'));assert(hasPermission(account,'customers.read'));for(const permission of ['accounts.manage','finance.write','finance.read','contracts.draft','contracts.return','contracts.finalize'])assert(!hasPermission(account,permission));
  }
  await rejected(()=>staffAccounts.syncStaffAccount(db,hr.id,1003,hr,'admin'),403);
  const logs=JSON.stringify((await c.query(`SELECT before_value,after_value FROM ${schema}.management_access_audit`)).rows);assert(!logs.includes(issued.password));assert(!logs.includes(rehired.password));assert(!logs.includes('$2b$'));
  checks.push('Missing branch stays disabled; headquarters Sales/Debt get exactly approved read-only global access; HR cannot issue manager/admin roles, and audit never contains password/hash');
  const staffApi=load(path.join(root,'lib/server/staff-management')),{dataAccess}=load(path.join(root,'lib/server/access-context'));
  const connect=Object.getOwnPropertyDescriptor(ownerDatabase,'connect');let failAccount=false;
  Object.defineProperty(ownerDatabase,'connect',{configurable:true,value:async()=>({release(){},query:async(sql,args)=>{
    if(sql==='BEGIN')return c.query('SAVEPOINT staff_api');
    if(sql==='COMMIT')return c.query('RELEASE SAVEPOINT staff_api');
    if(sql==='ROLLBACK'){await c.query('ROLLBACK TO SAVEPOINT staff_api');return c.query('RELEASE SAVEPOINT staff_api');}
    if(failAccount&&sql.startsWith('INSERT INTO himoto.management_account_access'))throw Error('QA account creation interrupted');
    return db.query(sql,args);
  }})});
  try{
    const body={name:'Created through staff API QA',phone:'0900000000',email:'',position:'TPKD',store_id:80001,status:'active'};
    const req=value=>new Request('http://localhost/api/auth/hr/staff',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
    const response=await dataAccess.run(admin,()=>staffApi.createStaff(req(body)));assert.equal(response.status,201);const created=(await response.json()).data;assert(created.credentials);assert.match(response.headers.get('cache-control'),/private, no-store/);
    const linked=Number((await c.query(`SELECT user_id FROM ${schema}.staff_profiles WHERE id=$1`,[created.id])).rows[0].user_id);assert.equal((await user(linked)).access_role,'branch_staff','A staff position does not automatically grant management rights');
    assert.equal((await dataAccess.run(manager,()=>staffApi.createStaff(req({...body,store_id:80002})))).status,403);
    assert.equal((await dataAccess.run(admin,()=>staffApi.updateStaff(created.id,req({...body,status:'leave'})))).status,200);assert((await user(linked)).deleted_at);
    const beforeCounts=(await c.query(`SELECT (SELECT count(*) FROM ${schema}.staff_profiles) AS staff,(SELECT count(*) FROM ${schema}.users) AS users`)).rows;
    failAccount=true;assert.equal((await dataAccess.run(admin,()=>staffApi.createStaff(req({...body,name:'Failed atomic creation QA'})))).status,500);
    assert.deepEqual((await c.query(`SELECT (SELECT count(*) FROM ${schema}.staff_profiles) AS staff,(SELECT count(*) FROM ${schema}.users) AS users`)).rows,beforeCounts);
    checks.push('Actual staff create/update handlers issue credentials and offboard atomically; a failed account insert rolls back the employee and user, and branch scope cannot be forged');
  }finally{Object.defineProperty(ownerDatabase,'connect',connect);}
  const snapshot=(await c.query(`SELECT count(*)::int AS n FROM ${schema}.users`)).rows[0].n;assert(snapshot>4);
 }finally{await c.query('ROLLBACK').catch(()=>{});c.release();await globalThis.himotoPool?.end();}
 console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0,realSequenceChanges:0,passwordsPrinted:false},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
