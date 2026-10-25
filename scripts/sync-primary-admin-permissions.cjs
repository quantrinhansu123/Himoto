/* Synchronize only the two explicitly authorized primary administrator identities. */
const fs=require('node:fs'),path=require('node:path');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {load,root}=require('./lib/load-typescript.cjs');
const db=load(path.join(root,'lib/server/himoto-database')).ownerDatabase;
const {ACCESS_PERMISSIONS}=load(path.join(root,'lib/management/permissions'));
async function main(){
  const action=process.argv[2]||'--check';if(!['--check','--apply'].includes(action))throw Error('Use --check or --apply');
  const c=await db.connect();
  try{
    await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='15s'");
    const rows=(await c.query(`SELECT u.id,u.email,u.role_id,u.status,a.login_name,a.access_role,a.store_id,a.scope_all,a.permissions,a.enabled
      FROM himoto.users u LEFT JOIN himoto.management_account_access a ON a.user_id=u.id
      WHERE u.id=ANY($1::bigint[]) AND u.deleted_at IS NULL ORDER BY u.id FOR UPDATE OF u`,[[145,160]])).rows;
    const expected=new Map([[145,'quanlyvanhanh'],[160,'quantri']]);
    if(rows.length!==2||rows.some(r=>r.status!=='active'||Number(r.role_id)!==1||r.access_role&&r.access_role!=='admin'
      ||(r.login_name||r.email.split('@')[0]).toLowerCase()!==expected.get(Number(r.id))))throw Error('Primary administrator identities do not match');
    if(action==='--apply'){
      const directory=path.resolve('.backups/primary-admins-20261025');fs.mkdirSync(directory,{recursive:true});
      fs.writeFileSync(path.join(directory,`permissions-before-${Date.now()}.json`),JSON.stringify(rows,null,2));
      for(const row of rows){
        const after={login_name:expected.get(Number(row.id)),access_role:'admin',store_id:null,scope_all:true,permissions:[...ACCESS_PERMISSIONS],enabled:true};
        const saved=(await c.query(`INSERT INTO himoto.management_account_access(user_id,login_name,access_role,store_id,scope_all,permissions,enabled,created_by,updated_by)
          VALUES($1,$2,'admin',NULL,true,$3::jsonb,true,145,145) ON CONFLICT(user_id) DO UPDATE SET permissions=EXCLUDED.permissions,
          access_role='admin',store_id=NULL,scope_all=true,enabled=true,updated_by=145,updated_at=now()
          WHERE management_account_access.permissions IS DISTINCT FROM EXCLUDED.permissions OR management_account_access.access_role<>'admin'
            OR management_account_access.store_id IS NOT NULL OR NOT management_account_access.scope_all OR NOT management_account_access.enabled RETURNING user_id`,[row.id,after.login_name,JSON.stringify(ACCESS_PERMISSIONS)])).rowCount;
        if(saved)await c.query(`INSERT INTO himoto.management_access_audit(actor_id,target_user_id,action,before_value,after_value)
          VALUES(145,$1,'primary_admin_permissions_sync',$2::jsonb,$3::jsonb)`,[row.id,JSON.stringify(row),JSON.stringify(after)]);
      }
    }
    const grants=(await c.query('SELECT user_id,login_name,access_role,scope_all,jsonb_array_length(permissions) AS permission_count FROM himoto.management_account_access WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',[[145,160]])).rows;
    await c.query(action==='--apply'?'COMMIT':'ROLLBACK');console.log(JSON.stringify({action,accounts:grants,passwordsChanged:false},null,2));
  }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
}
main().catch(e=>{console.error({message:e.message,code:e.code});process.exitCode=1;}).finally(()=>globalThis.himotoPool?.end());
