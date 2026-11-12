import 'server-only';
import { hash } from 'bcryptjs';
import { createHash,randomBytes } from 'node:crypto';
import type { PoolClient } from 'pg';
import { ADMIN_PERMISSIONS,ACCESS_PERMISSIONS, ACCESS_ROLES,canManageAccounts,canRecoverAccountPasswords,canSettleContract,isAdminAccount,isOwnershipManager,type PermissionAccount } from '@/lib/management/permissions';
import { dataAccess } from './access-context';
import { rememberAccountPassword } from './account-passwords';

import { AccountAccessError,parseAccountValues } from '../../../shared/account-management';
export { AccountAccessError,parseAccountValues,type AccountValues } from '../../../shared/account-management';
export function requireAccountScope(user:PermissionAccount) {
  if(!canManageAccounts(user))throw new AccountAccessError('Chỉ quản trị viên được quản lý tài khoản và phân quyền.',403);
}
function requireManagedTarget(user:PermissionAccount|undefined,target:PermissionAccount) {
  if(!isOwnershipManager(user))return;
  if(isAdminAccount(target)||target.scope_all||Number(target.store_id)!==Number(user!.store_id))throw new AccountAccessError('Chỉ quản lý tài khoản trong cơ sở Thuê sở hữu; không được cấp hoặc sửa quyền toàn hệ thống.',403);
}
const ownershipStoreSql="(SELECT min(os.id) FROM himoto.stores os WHERE os.kind='lease_to_own' HAVING count(*)=1)";
const effectiveStoreSql=`CASE WHEN a.access_role='ownership_manager' AND a.store_id IS NULL THEN ${ownershipStoreSql} ELSE a.store_id END`;
export async function listManagedAccounts(client:Pick<PoolClient,'query'>,user?:PermissionAccount,storeId:number|null=null) {
  if(user)requireAccountScope(user);
  if(isOwnershipManager(user)){
    if(storeId!==null&&Number(storeId)!==Number(user!.store_id))throw new AccountAccessError('Cơ sở không thuộc phạm vi tài khoản.',403);
    storeId=Number(user!.store_id);
  }
  if(storeId!==null&&(!Number.isSafeInteger(storeId)||storeId<1))throw new AccountAccessError('Cơ sở không hợp lệ.');
  return (await client.query(`SELECT u.id,u.name,u.email,u.status,a.login_name,COALESCE(a.access_role,CASE WHEN u.role_id=1 THEN 'admin' ELSE 'accounting' END) AS access_role,${effectiveStoreSql} AS store_id,
    CASE WHEN a.access_role='ownership_manager' THEN false ELSE COALESCE(a.scope_all,true) END AS scope_all,COALESCE(a.permissions,CASE WHEN u.role_id=1 THEN $1::jsonb ELSE $2::jsonb END) AS permissions,a.enabled,s.store_name,s.kind AS store_kind,
    p.id AS staff_id,p.staff_code,p.status AS staff_status,u.xmin::text AS revision,u.password AS password_hash,pw.password_fingerprint,
    COALESCE(u.management_password_changed_at,pw.changed_at) AS password_changed_at
    FROM himoto.users u LEFT JOIN himoto.management_account_access a ON a.user_id=u.id
    LEFT JOIN himoto.management_account_passwords pw ON pw.user_id=u.id
    LEFT JOIN himoto.stores s ON s.id=(${effectiveStoreSql}) LEFT JOIN himoto.staff_profiles p ON p.user_id=u.id
    WHERE u.deleted_at IS NULL AND COALESCE(a.login_name,'')<>'system.sepay' AND (a.user_id IS NOT NULL OR u.role_id IN (1,6))
      AND ($3::bigint IS NULL OR (${effectiveStoreSql})=$3 AND (NOT a.scope_all OR a.access_role='ownership_manager') AND a.access_role<>'admin') ORDER BY p.id NULLS LAST,u.id`,[JSON.stringify(ADMIN_PERMISSIONS),JSON.stringify(ACCESS_ROLES.accounting.permissions),storeId])).rows.map(record=>{
        const {password_hash,password_fingerprint,...row}=record,recovery=canRecoverAccountPasswords(user);
        return {...row,id:Number(row.id),store_id:row.store_id==null?null:Number(row.store_id),staff_id:row.staff_id==null?undefined:Number(row.staff_id),...(row.access_role==='admin'?{permissions:[...ADMIN_PERMISSIONS,...(canSettleContract(row)?['contracts.settle']:[])]}:isOwnershipManager(row)?{access_role:'ownership_manager',permissions:[...ACCESS_PERMISSIONS]}:{}),password_available:recovery&&Boolean(password_hash&&password_fingerprint===createHash('sha256').update(password_hash).digest('hex')),can_reset_password:false,
          can_edit:true,can_delete:Number(row.id)!==Number(user?.id)};
      });
}
export async function saveManagedAccount(client:Pick<PoolClient,'query'>,actorId:number,raw:unknown,id?:number,user?:PermissionAccount) {
  if(user)requireAccountScope(user);
  const scopedManager=isOwnershipManager(user??dataAccess.getStore())?user??dataAccess.getStore():undefined;
  const input=parseAccountValues(raw,!id);
  requireManagedTarget(scopedManager,input);
  if(id&&input.password)throw new AccountAccessError('Đã bỏ chức năng đặt lại mật khẩu. Nhân viên tự đổi mật khẩu của mình.',403);
  if(!id){if(!input.login_name)input.login_name='nv.'+randomBytes(6).toString('hex');if(!input.password)input.password=randomBytes(18).toString('base64url');}
  await client.query("SET LOCAL lock_timeout='5s'");
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['management-accounts']);
  const before=id?(await client.query(`SELECT u.id,u.name,u.status,u.xmin::text AS revision,a.login_name,a.access_role,${effectiveStoreSql} AS store_id,CASE WHEN a.access_role='ownership_manager' THEN false ELSE a.scope_all END AS scope_all,a.permissions,a.enabled
    FROM himoto.users u LEFT JOIN himoto.management_account_access a ON a.user_id=u.id WHERE u.id=$1 AND u.deleted_at IS NULL FOR UPDATE OF u`,[id])).rows[0]:null;
  if(id&&!before)throw new AccountAccessError('Không tìm thấy tài khoản.',404);
  if(before)requireManagedTarget(scopedManager,before);
  if(before?.login_name==='system.sepay')throw new AccountAccessError('Tài khoản tích hợp SePay chỉ dùng để ghi log tự động.',403);
  if(id&&String((raw as Record<string,unknown>).revision||'')!==before.revision)throw new AccountAccessError('Tài khoản đã thay đổi. Tải lại danh sách rồi thao tác.',409);
  if(id===actorId&&(!input.enabled||input.access_role!==before.access_role))throw new AccountAccessError('Không được tự khóa hoặc đổi vai trò tài khoản đang đăng nhập.');
  if(id&&input.enabled&&(await client.query("SELECT 1 FROM himoto.staff_profiles WHERE user_id=$1 AND status='leave'",[id])).rowCount)throw new AccountAccessError('Nhân sự đã nghỉ việc; không được mở lại quyền đăng nhập.',409);
  if(input.store_id!==null){const store=(await client.query('SELECT kind FROM himoto.stores WHERE id=$1 FOR SHARE',[input.store_id])).rows[0];
    if(!store)throw new AccountAccessError('Cơ sở không còn tồn tại.');
    if(input.access_role.startsWith('ownership_')&&store.kind!=='lease_to_own')throw new AccountAccessError('Vai trò thuê sở hữu phải gắn cơ sở thuê sở hữu.');
    if(input.access_role==='branch_manager'&&store.kind==='lease_to_own'){
      input.access_role='ownership_manager';input.scope_all=false;input.permissions=[...ACCESS_PERMISSIONS];
    }
  }
  if(input.access_role==='branch_manager'&&input.permissions.includes('contracts.delete'))throw new AccountAccessError('Quản lý cơ sở thường không được cấp quyền xóa hợp đồng.');
  const slug=({branch_staff:'nhan-vien',branch_manager:'quan-ly-cua-hang',ownership_staff:'thue-so-huu-hop-dong',ownership_manager:'thue-so-huu-truong-phong',hr:'nhan-su',headquarters_sales:'telesale',headquarters_debt:'thue-so-huu-thu-hoi-no',accounting:'ke-toan',internal_control:'ke-toan',admin:'quan-tri-vien'})[input.access_role];
  const role=(await client.query('SELECT id FROM himoto.roles WHERE slug=$1',[slug])).rows[0];if(!role)throw new AccountAccessError('Vai trò chưa được cấu hình.');
  const password=input.password?await hash(input.password,12):null;
  if(!id){const created=await client.query(`INSERT INTO himoto.users(name,email,password,role,role_id,status,store_id,created_at,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,now(),now()) RETURNING id`,[input.name,`${input.login_name}@accounts.himoto.local`,password,input.access_role==='admin'?'admin':slug,role.id,input.enabled?'active':'inactive',input.store_id]);id=Number(created.rows[0].id);}
  else await client.query(`UPDATE himoto.users SET name=$2,role=$3,role_id=$4,status=$5,store_id=$6,updated_at=now() WHERE id=$1`,[id,input.name,input.access_role==='admin'?'admin':slug,role.id,input.enabled?'active':'inactive',input.store_id]);
  await client.query(`INSERT INTO himoto.management_account_access(user_id,login_name,access_role,store_id,scope_all,permissions,enabled,created_by,updated_by)
    VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$8) ON CONFLICT(user_id) DO UPDATE SET login_name=EXCLUDED.login_name,access_role=EXCLUDED.access_role,
    store_id=EXCLUDED.store_id,scope_all=EXCLUDED.scope_all,permissions=EXCLUDED.permissions,enabled=EXCLUDED.enabled,updated_by=$8,updated_at=now()`,
    [id,input.login_name,input.access_role,input.store_id,input.scope_all,JSON.stringify(input.permissions),input.enabled,actorId]);
  if(password)await rememberAccountPassword(client,id!,input.password,password,actorId,'create');
  const admins=await client.query(`SELECT 1 FROM himoto.users u LEFT JOIN himoto.management_account_access a ON a.user_id=u.id
    WHERE u.status='active' AND u.deleted_at IS NULL AND (a.access_role='admin' AND a.enabled OR a.user_id IS NULL AND u.role_id=1) LIMIT 1`);
  if(!admins.rowCount)throw new AccountAccessError('Phải giữ ít nhất một tài khoản quản trị đang hoạt động.',409);
  const {password:omitted,...safe}=input;void omitted;
  await client.query(`INSERT INTO himoto.management_access_audit(actor_id,target_user_id,action,before_value,after_value) VALUES($1,$2,$3,$4::jsonb,$5::jsonb)`,
    [actorId,id,before?'update':'create',before?JSON.stringify(before):null,JSON.stringify({...safe,password_changed:Boolean(password)})]);
  return {id,...(!before?{credentials:{login_name:input.login_name,password:input.password,enabled:input.enabled}}:{})};
}

export async function deleteManagedAccount(client:Pick<PoolClient,'query'>,actorId:number,id:number,revision:string,user:PermissionAccount) {
  requireAccountScope(user);
  await client.query("SET LOCAL lock_timeout='5s'");
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['management-accounts']);
  const before=(await client.query(`SELECT u.id,u.name,u.xmin::text AS revision,a.login_name,a.access_role,${effectiveStoreSql} AS store_id,CASE WHEN a.access_role='ownership_manager' THEN false ELSE a.scope_all END AS scope_all,a.enabled FROM himoto.users u LEFT JOIN himoto.management_account_access a ON a.user_id=u.id WHERE u.id=$1 AND u.deleted_at IS NULL FOR UPDATE OF u`,[id])).rows[0];
  if(!before)throw new AccountAccessError('Không tìm thấy tài khoản.',404);
  requireManagedTarget(user,before);
  if(id===actorId||before.login_name==='system.sepay')throw new AccountAccessError('Không được xóa tài khoản đang đăng nhập hoặc tài khoản tích hợp.',403);
  if(revision!==before.revision)throw new AccountAccessError('Tài khoản đã thay đổi. Tải lại rồi thao tác.',409);
  await client.query('UPDATE himoto.management_account_access SET enabled=false,updated_by=$2,updated_at=now() WHERE user_id=$1',[id,actorId]);
  await client.query("UPDATE himoto.users SET status='inactive',deleted_at=now(),updated_at=now() WHERE id=$1",[id]);
  if(!(await client.query(`SELECT 1 FROM himoto.users u LEFT JOIN himoto.management_account_access a ON a.user_id=u.id WHERE u.deleted_at IS NULL AND u.status='active' AND (a.access_role='admin' AND a.enabled OR a.user_id IS NULL AND u.role_id=1) LIMIT 1`)).rowCount)throw new AccountAccessError('Phải giữ ít nhất một quản trị viên đang hoạt động.',409);
  await client.query(`INSERT INTO himoto.management_access_audit(actor_id,target_user_id,action,before_value,after_value) VALUES($1,$2,'delete',$3::jsonb,'{"enabled":false,"deleted":true}'::jsonb)`,[actorId,id,JSON.stringify(before)]);
  return {id};
}
