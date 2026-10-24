/** Explicitly requested staff login reconciliation. Default is a read-only plan. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {load,root}=require('./lib/load-typescript.cjs');
const {ownerDatabase}=load(path.join(root,'lib/server/himoto-database'));
const {syncStaffAccount}=load(path.join(root,'lib/server/staff-accounts'));
const {deleteManagedAccount}=load(path.join(root,'lib/server/account-management'));
const {ACCESS_ROLES}=load(path.join(root,'lib/management/permissions'));
const issuedLogins=['nv.giapbat','nv.lang','nv.nguyenhoang','nv.hadong','nv.hangbut','nv.thuesohuu','ql.thuesohuu','hcns','ketoan','quantri'];
const headquartersSales=[8,9,32,33],headquartersDebt=[29,30];
const destination='.backups/staff-accounts-20261024';
const actor={id:145,access_role:'admin',scope_all:true,permissions:[...ACCESS_ROLES.admin.permissions]};
function staffRole(staff){
  if(headquartersSales.includes(Number(staff.id)))return 'headquarters_sales';
  if(headquartersDebt.includes(Number(staff.id)))return 'headquarters_debt';
  if(/HCNS/i.test(staff.position||''))return 'hr';
  if(/^(KT|Kế toán)$/i.test(staff.position||''))return 'accounting';
  if(/QLCN|TPKD|QTPGD|QL\s*PTKD/i.test(staff.position||''))return staff.kind==='lease_to_own'?'ownership_manager':'branch_manager';
  return staff.kind==='lease_to_own'?'ownership_staff':'branch_staff';
}
async function main(){const apply=process.argv.includes('--apply'),c=await ownerDatabase.connect();
 try{
  await c.query(apply?'BEGIN':'BEGIN READ ONLY');await c.query("SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='30s'");
  if(apply)await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['management-accounts']);
  const staff=(await c.query(`SELECT p.id,p.staff_code,p.full_name,p.position,p.status,p.store_id,p.user_id,s.kind FROM himoto.staff_profiles p LEFT JOIN himoto.stores s ON s.id=p.store_id ORDER BY p.id${apply?' FOR UPDATE OF p':''}`)).rows;
  assert.equal(staff.length,34,'Staff roster changed; review the new plan');assert.equal(staff.filter(s=>s.status!=='leave').length,33);
  const preserved=(await c.query('SELECT user_id,login_name FROM himoto.management_account_access WHERE login_name=ANY($1::text[])',[issuedLogins])).rows;
  assert.equal(preserved.length,10,'The ten issued logins must all exist');
  assert((await c.query("SELECT 1 FROM himoto.users WHERE id=145 AND deleted_at IS NULL AND status='active'")).rowCount,'Preserved operations manager unavailable');
  const hq=(await c.query("SELECT id FROM himoto.stores WHERE store_name='Trụ Sở Chính'")).rows;assert.equal(hq.length,1,'Headquarters must resolve uniquely');
  const keep=new Set([...preserved.map(r=>Number(r.user_id)),145]);
  const plan=staff.map(s=>({staff_id:Number(s.id),name:s.full_name,status:s.status,role:s.status==='leave'?null:staffRole(s),headquarters:headquartersSales.includes(Number(s.id))||headquartersDebt.includes(Number(s.id))}));
  const users=(await c.query(`SELECT u.id,u.name,u.xmin::text AS revision,a.login_name,a.access_role,a.enabled FROM himoto.users u LEFT JOIN himoto.management_account_access a ON a.user_id=u.id WHERE u.deleted_at IS NULL ORDER BY u.id${apply?' FOR UPDATE OF u':''}`)).rows;
  const candidates=users.filter(u=>!keep.has(Number(u.id))&&u.login_name!=='system.sepay'&&!/^nv\d{4,}$/.test(u.login_name||''));
  fs.mkdirSync(destination,{recursive:true});
  fs.writeFileSync(path.join(destination,'plan.json'),JSON.stringify({staff:plan,preserved:[...preserved,{user_id:'145',login_name:'Quản lý vận hành'}],revoke:candidates},null,2));
  if(!apply){await c.query('ROLLBACK');console.log(JSON.stringify({mode:'plan',staff:staff.length,personal_accounts:33,headquarters_sales:4,headquarters_debt:2,preserved_interactive:11,legacy_to_revoke:candidates.length,plan:path.join(destination,'plan.json')}));return;}
  // Private snapshot contains no password hashes and permits review/recovery of links and grants.
  const snapshotFile=path.join(destination,'before.json');if(!fs.existsSync(snapshotFile))fs.writeFileSync(snapshotFile,JSON.stringify({staff,accounts:users,preserved},null,2));
  const credentialsBefore=(await c.query('SELECT id,md5(password) AS fingerprint FROM himoto.users WHERE id=ANY($1::bigint[]) ORDER BY id',[[...keep]])).rows;
  const credentials=[];
  for(const person of staff){
    const proposed=plan.find(p=>p.staff_id===Number(person.id));
    if(proposed.headquarters)await c.query('UPDATE himoto.staff_profiles SET store_id=$2,updated_at=now() WHERE id=$1',[person.id,hq[0].id]);
    const issued=await syncStaffAccount(c,actor.id,Number(person.id),actor,proposed.role||undefined);
    if(issued)credentials.push({staff_id:Number(person.id),staff_code:person.staff_code,name:person.full_name,role:proposed.role,...issued});
  }
  for(const candidate of candidates){
    const live=(await c.query('SELECT xmin::text AS revision FROM himoto.users WHERE id=$1 AND deleted_at IS NULL',[candidate.id])).rows[0];
    if(live)await deleteManagedAccount(c,actor.id,Number(candidate.id),live.revision,actor);
  }
  const counts=(await c.query(`SELECT count(*)::int AS linked,count(*) FILTER(WHERE p.status='leave' AND u.deleted_at IS NULL AND a.enabled)::int AS departed_enabled FROM himoto.staff_profiles p LEFT JOIN himoto.users u ON u.id=p.user_id LEFT JOIN himoto.management_account_access a ON a.user_id=p.user_id WHERE p.status<>'leave' OR a.enabled`)).rows[0];
  assert.equal(counts.linked,33);assert.equal(counts.departed_enabled,0);
  const valid=(await c.query(`SELECT count(*)::int AS n FROM himoto.staff_profiles p JOIN himoto.users u ON u.id=p.user_id JOIN himoto.management_account_access a ON a.user_id=u.id WHERE p.status<>'leave' AND u.deleted_at IS NULL AND u.status='active' AND a.enabled AND (a.scope_all OR a.store_id=p.store_id)`)).rows[0];
  assert.equal(valid.n,33,'Every current employee must have exactly one enabled personal login');
  const interactive=(await c.query(`SELECT count(*)::int AS n FROM himoto.users u LEFT JOIN himoto.management_account_access a ON a.user_id=u.id WHERE u.deleted_at IS NULL AND COALESCE(a.login_name,'')<>'system.sepay'`)).rows[0];
  assert.equal(interactive.n,44,'Expected 33 personal + 10 issued + operations manager');
  for(const kept of preserved)assert((await c.query('SELECT 1 FROM himoto.users WHERE id=$1 AND deleted_at IS NULL',[kept.user_id])).rowCount);
  const credentialsAfter=(await c.query('SELECT id,md5(password) AS fingerprint FROM himoto.users WHERE id=ANY($1::bigint[]) ORDER BY id',[[...keep]])).rows;
  if(JSON.stringify(credentialsBefore)!==JSON.stringify(credentialsAfter))throw Error('Preserved login credentials unexpectedly changed');
  const jsonFile=path.join(destination,'credentials.private.json');
  // Persist before COMMIT so issued secrets cannot be lost after committing account creation.
  if(credentials.length){fs.writeFileSync(jsonFile,JSON.stringify(credentials,null,2),{mode:0o600,flag:'wx'});const header=['Nhân sự','Mã NV','Tài khoản','Mật khẩu','Vai trò'];const csv=[header,...credentials.map(r=>[r.name,r.staff_code,r.login_name,r.password,r.role])].map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n');fs.writeFileSync(path.join(destination,'credentials.private.csv'),'\uFEFF'+csv,{mode:0o600,flag:'wx'});}
  await c.query('COMMIT');
  const report={mode:'applied',personal_accounts:33,created:credentials.length,headquarters_sales:4,headquarters_debt:2,preserved_interactive:11,legacy_revoked:candidates.length,passwords_printed:false,credentials_file:jsonFile};
  fs.writeFileSync(path.join(destination,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();await globalThis.himotoPool?.end();}
}
main().catch(e=>{console.error(JSON.stringify({name:e.name,code:e.code||null,message:e.message?.slice(0,200)}));process.exitCode=1;});
