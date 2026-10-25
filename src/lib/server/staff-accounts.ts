import 'server-only';
import { randomBytes } from 'node:crypto';
import type { PoolClient } from 'pg';
import { ACCESS_ROLES,hasPermission,isAdminAccount,type AccessRole,type PermissionAccount } from '@/lib/management/permissions';
import type { IssuedAccountCredentials } from '@/lib/management/accounts';
import { AccountAccessError,saveManagedAccount } from './account-management';
type Database=Pick<PoolClient,'query'>;

export function requireStaffAccountScope(user:PermissionAccount,store:unknown) {
  if(!hasPermission(user,'hr.write'))throw new AccountAccessError('Không có quyền quản lý nhân sự.',403);
  if(!isAdminAccount(user)&&!user.scope_all&&Number(store)!==Number(user.store_id))throw new AccountAccessError('Nhân sự không thuộc cơ sở của tài khoản.',403);
}
/** An employee change and its login change are committed together. No password enters the audit. */
export async function syncStaffAccount(db:Database,actorId:number,staffId:number,user:PermissionAccount,initialRole?:AccessRole,rehire=false):Promise<IssuedAccountCredentials|null> {
  if(initialRole&&!isAdminAccount(user))throw new AccountAccessError('Chỉ quản trị được đặt vai trò khi cấp tài khoản.',403);
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['management-accounts']);
  const staff=(await db.query('SELECT id,full_name,store_id,status,user_id FROM himoto.staff_profiles WHERE id=$1 FOR UPDATE',[staffId])).rows[0];
  if(!staff)throw new AccountAccessError('Không tìm thấy nhân sự.',404);
  requireStaffAccountScope(user,staff.store_id);
  const before=staff.user_id?(await db.query(`SELECT u.id,u.name,u.role,u.role_id,u.deleted_at,u.xmin::text AS revision,a.login_name,a.access_role,a.store_id,a.scope_all,a.permissions,a.enabled FROM himoto.users u LEFT JOIN himoto.management_account_access a ON a.user_id=u.id WHERE u.id=$1 FOR UPDATE OF u`,[staff.user_id])).rows[0]:null;
  if(before&&!isAdminAccount(user)){
    if(isAdminAccount(before)||before.login_name==='system.sepay')throw new AccountAccessError('Chỉ quản trị viên được cập nhật nhân sự gắn tài khoản quản trị hoặc tích hợp.',403);
    if(!user.scope_all&&(before.scope_all||Number(before.store_id)!==Number(user.store_id)||!['branch_staff','ownership_staff'].includes(before.access_role)))throw new AccountAccessError('Chỉ được cập nhật tài khoản nhân viên trong cơ sở của mình.',403);
  }
  if(staff.status==='leave'){
    if(before){
      if(Number(before.id)===actorId)throw new AccountAccessError('Không được tự chuyển nghỉ việc khi đang đăng nhập.',409);
      if(isAdminAccount(before)||before.login_name==='system.sepay')throw new AccountAccessError('Tài khoản quản trị/tích hợp cần được quản trị đối chiếu trước khi xóa.',409);
      await db.query('UPDATE himoto.management_account_access SET enabled=false,updated_by=$2,updated_at=now() WHERE user_id=$1',[before.id,actorId]);
      await db.query("UPDATE himoto.users SET status='inactive',deleted_at=COALESCE(deleted_at,now()),updated_at=now() WHERE id=$1",[before.id]);
      await audit(db,actorId,Number(before.id),'staff_left',before,{enabled:false,deleted:true,staff_id:staffId});
    }return null;
  }
  const login=before?.access_role&&before.login_name?String(before.login_name):`nv${String(staff.id).padStart(4,'0')}`;
  if(before?.login_name===login&&before.deleted_at&&!rehire)return null;
  if(before?.login_name===login&&(!before.deleted_at||rehire)){
    const enabled=staff.status==='active'&&(before.enabled===true||rehire)&&(before.scope_all||staff.store_id!=null);
    await db.query(`UPDATE himoto.users SET name=$2,status=$3,store_id=$4,
      management_password_version=management_password_version+CASE WHEN $5::boolean AND deleted_at IS NOT NULL THEN 1 ELSE 0 END,
      deleted_at=CASE WHEN $5::boolean THEN NULL ELSE deleted_at END,updated_at=now() WHERE id=$1`,[before.id,staff.full_name,enabled?'active':'inactive',before.scope_all?null:staff.store_id,rehire]);
    await db.query('UPDATE himoto.management_account_access SET store_id=CASE WHEN scope_all THEN NULL ELSE $2::bigint END,enabled=$3,updated_at=now(),updated_by=$4 WHERE user_id=$1',[before.id,staff.store_id,enabled,actorId]);
    await audit(db,actorId,Number(before.id),'staff_sync',before,{enabled,staff_id:staffId,previous_store_id:before.store_id,store_id:before.scope_all?null:staff.store_id,scope_all:before.scope_all===true});return null;
  }
  const kind=staff.store_id?(await db.query('SELECT kind FROM himoto.stores WHERE id=$1',[staff.store_id])).rows[0]?.kind:null;
  const accessRole=initialRole||(kind==='lease_to_own'?'ownership_staff':'branch_staff');
  const scopeAll=['admin','hr','accounting','internal_control','headquarters_sales','headquarters_debt'].includes(accessRole);
  const password=randomBytes(18).toString('base64url'),enabled=staff.status==='active'&&(scopeAll||staff.store_id!=null);
  // New personal logins receive initial credentials; existing passwords are preserved above.
  const previous=(await db.query('SELECT user_id FROM himoto.management_account_access WHERE login_name=$1',[login])).rows[0];
  let accountId=previous?Number(previous.user_id):undefined,revision:string|undefined;
  if(accountId){
    if(Number(staff.user_id)!==accountId)throw new AccountAccessError('Tên đăng nhập nhân sự đang gắn tài khoản khác; cần đối chiếu.',409);
    revision=(await db.query('UPDATE himoto.users SET deleted_at=NULL,updated_at=now() WHERE id=$1 RETURNING xmin::text AS revision',[accountId])).rows[0].revision;
  }
  // Values are derived here, never from the employee form. HR cannot grant management rights.
  const result=await saveManagedAccount(db,actorId,{name:staff.full_name,login_name:login,password,access_role:accessRole,store_id:scopeAll?null:staff.store_id==null?null:Number(staff.store_id),scope_all:scopeAll,permissions:[...ACCESS_ROLES[accessRole].permissions],enabled,...(revision?{revision}:{})},accountId);
  accountId=result.id;
  if(staff.user_id&&Number(staff.user_id)!==accountId)await db.query('INSERT INTO himoto.management_staff_user_links(user_id,staff_id) VALUES($1,$2) ON CONFLICT(user_id) DO NOTHING',[staff.user_id,staff.id]);
  await db.query('UPDATE himoto.staff_profiles SET user_id=$2,updated_at=now() WHERE id=$1',[staff.id,accountId]);
  return {login_name:login,password,enabled};
}
async function audit(db:Database,actor:number,target:number,action:string,before:unknown,after:unknown){
  await db.query('INSERT INTO himoto.management_access_audit(actor_id,target_user_id,action,before_value,after_value) VALUES($1,$2,$3,$4::jsonb,$5::jsonb)',[actor,target,action,JSON.stringify(before),JSON.stringify(after)]);
}
