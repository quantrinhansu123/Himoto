import 'server-only';
import { hash } from 'bcryptjs';
import { createHash,randomBytes } from 'node:crypto';
import type { PoolClient } from 'pg';
import { ACCESS_PERMISSIONS, ACCESS_ROLES,canManageAccounts,canRecoverAccountPasswords,isAdminAccount,type PermissionAccount,type AccessRole } from '@/lib/management/permissions';
import { rememberAccountPassword,validateNewPassword } from './account-passwords';

export class AccountAccessError extends Error {constructor(message:string,public status=400){super(message);}}
export interface AccountValues {name:string;login_name:string;password:string;access_role:AccessRole;store_id:number|null;scope_all:boolean;permissions:string[];enabled:boolean}
export function parseAccountValues(raw:unknown,creating:boolean):AccountValues {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new AccountAccessError('Thông tin tài khoản không hợp lệ.');
  const body=raw as Record<string,unknown>,name=String(body.name||'').trim(),login=String(body.login_name||'').trim().toLowerCase(),role=String(body.access_role||''),password=typeof body.password==='string'?body.password:'';
  if(!name||name.length>191||(!creating||login)&&!/^[a-z0-9._-]{3,80}$/.test(login)||!Object.hasOwn(ACCESS_ROLES,role))throw new AccountAccessError('Kiểm tra tên, tài khoản (3–80 ký tự, không dấu) và vai trò.');
  if(body.password!==undefined&&typeof body.password!=='string')throw new AccountAccessError('Mật khẩu chưa hợp lệ.');
  if(password)validateNewPassword(password);
  const scopeAll=role==='admin'||body.scope_all===true,store=scopeAll||body.store_id==null||body.store_id===''?null:Number(body.store_id);
  if(store!==null&&(!Number.isSafeInteger(store)||store<1)||!scopeAll&&store===null&&body.enabled!==false)throw new AccountAccessError('Chọn cơ sở trước khi cho phép đăng nhập.');
  if(['branch_staff','branch_manager','ownership_staff','ownership_manager'].includes(role)&&scopeAll)throw new AccountAccessError('Nhân viên và quản lý cơ sở phải được gắn một cơ sở.');
  if(typeof body.enabled!=='boolean'||!Array.isArray(body.permissions)||body.permissions.some(p=>!ACCESS_PERMISSIONS.includes(p)))throw new AccountAccessError('Quyền hoặc trạng thái tài khoản không hợp lệ.');
  if(!['admin','branch_manager','ownership_manager'].includes(role)&&body.permissions.includes('accounts.manage'))throw new AccountAccessError('Chỉ quản lý được quản lý tài khoản.');
  return {name,login_name:login,password,access_role:role as AccessRole,store_id:store,scope_all:scopeAll,permissions:role==='admin'?[...ACCESS_PERMISSIONS]:[...new Set(body.permissions)] as string[],enabled:body.enabled};
}
export function requireAccountScope(user:PermissionAccount,target?:{store_id?:unknown;scope_all?:unknown;access_role?:unknown}) {
  if(!canManageAccounts(user))throw new AccountAccessError('Chỉ quản lý được quản lý tài khoản và phân quyền.',403);
  if(target&&!isAdminAccount(user)&&(Number(target.store_id)!==Number(user.store_id)||target.scope_all===true||!['branch_staff','ownership_staff'].includes(String(target.access_role))))throw new AccountAccessError('Chỉ được quản lý tài khoản nhân viên trong cơ sở của mình.',403);
}
export async function listManagedAccounts(client:Pick<PoolClient,'query'>,user?:PermissionAccount,storeId:number|null=null) {
  if(user)requireAccountScope(user);
  if(storeId!==null&&(!Number.isSafeInteger(storeId)||storeId<1))throw new AccountAccessError('Cơ sở không hợp lệ.');
  if(storeId!==null&&user&&!isAdminAccount(user)&&storeId!==Number(user.store_id))throw new AccountAccessError('Chỉ được xem tài khoản trong cơ sở của mình.',403);
  return (await client.query(`SELECT u.id,u.name,u.email,u.status,a.login_name,COALESCE(a.access_role,CASE WHEN u.role_id=1 THEN 'admin' ELSE 'accounting' END) AS access_role,a.store_id,
    COALESCE(a.scope_all,true) AS scope_all,COALESCE(a.permissions,CASE WHEN u.role_id=1 THEN $1::jsonb ELSE $2::jsonb END) AS permissions,a.enabled,s.store_name,
    p.id AS staff_id,p.staff_code,p.status AS staff_status,u.xmin::text AS revision,u.password AS password_hash,pw.password_fingerprint,
    COALESCE(u.management_password_changed_at,pw.changed_at) AS password_changed_at
    FROM himoto.users u LEFT JOIN himoto.management_account_access a ON a.user_id=u.id
    LEFT JOIN himoto.management_account_passwords pw ON pw.user_id=u.id
    LEFT JOIN himoto.stores s ON s.id=a.store_id LEFT JOIN himoto.staff_profiles p ON p.user_id=u.id
    WHERE u.deleted_at IS NULL AND COALESCE(a.login_name,'')<>'system.sepay' AND (a.user_id IS NOT NULL OR u.role_id IN (1,6))
      AND ($3::boolean OR a.store_id=$4 AND NOT a.scope_all)
      AND ($5::bigint IS NULL OR a.store_id=$5 AND NOT a.scope_all) ORDER BY p.id NULLS LAST,u.id`,[JSON.stringify(ACCESS_PERMISSIONS),JSON.stringify(ACCESS_ROLES.accounting.permissions),!user||isAdminAccount(user),user?.store_id||null,storeId])).rows.map(record=>{
        const {password_hash,password_fingerprint,...row}=record,recovery=canRecoverAccountPasswords(user);
        return {...row,password_available:recovery&&Boolean(password_hash&&password_fingerprint===createHash('sha256').update(password_hash).digest('hex')),can_reset_password:false,
          can_edit:!user||isAdminAccount(user)||['branch_staff','ownership_staff'].includes(row.access_role),can_delete:Number(row.id)!==Number(user?.id)&&(!user||isAdminAccount(user)||['branch_staff','ownership_staff'].includes(row.access_role))};
      });
}
export async function saveManagedAccount(client:Pick<PoolClient,'query'>,actorId:number,raw:unknown,id?:number,user?:PermissionAccount) {
  const input=parseAccountValues(raw,!id);
  if(id&&input.password)throw new AccountAccessError('Đã bỏ chức năng đặt lại mật khẩu. Nhân viên tự đổi mật khẩu của mình.',403);
  if(user){requireAccountScope(user,input);if(!isAdminAccount(user)&&input.permissions.some(permission=>!user.permissions?.includes(permission)))throw new AccountAccessError('Không được cấp quyền vượt quyền quản lý hiện có.',403);}
  if(!id){if(!input.login_name)input.login_name='nv.'+randomBytes(6).toString('hex');if(!input.password)input.password=randomBytes(18).toString('base64url');}
  await client.query("SET LOCAL lock_timeout='5s'");
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['management-accounts']);
  const before=id?(await client.query(`SELECT u.id,u.name,u.status,u.xmin::text AS revision,a.login_name,a.access_role,a.store_id,a.scope_all,a.permissions,a.enabled
    FROM himoto.users u LEFT JOIN himoto.management_account_access a ON a.user_id=u.id WHERE u.id=$1 AND u.deleted_at IS NULL FOR UPDATE OF u`,[id])).rows[0]:null;
  if(id&&!before)throw new AccountAccessError('Không tìm thấy tài khoản.',404);
  if(before&&user)requireAccountScope(user,before);
  if(before?.login_name==='system.sepay')throw new AccountAccessError('Tài khoản tích hợp SePay chỉ dùng để ghi log tự động.',403);
  if(id&&String((raw as Record<string,unknown>).revision||'')!==before.revision)throw new AccountAccessError('Tài khoản đã thay đổi. Tải lại danh sách rồi thao tác.',409);
  if(id===actorId&&(!input.enabled||input.access_role!==before.access_role))throw new AccountAccessError('Không được tự khóa hoặc đổi vai trò tài khoản đang đăng nhập.');
  if(id&&input.enabled&&(await client.query("SELECT 1 FROM himoto.staff_profiles WHERE user_id=$1 AND status='leave'",[id])).rowCount)throw new AccountAccessError('Nhân sự đã nghỉ việc; không được mở lại quyền đăng nhập.',409);
  if(input.store_id!==null){const store=(await client.query('SELECT kind FROM himoto.stores WHERE id=$1 FOR SHARE',[input.store_id])).rows[0];
    if(!store)throw new AccountAccessError('Cơ sở không còn tồn tại.');
    if(input.access_role.startsWith('ownership_')&&store.kind!=='lease_to_own')throw new AccountAccessError('Vai trò thuê sở hữu phải gắn cơ sở thuê sở hữu.');
  }
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
  const before=(await client.query(`SELECT u.id,u.name,u.xmin::text AS revision,a.login_name,a.access_role,a.store_id,a.scope_all,a.enabled FROM himoto.users u LEFT JOIN himoto.management_account_access a ON a.user_id=u.id WHERE u.id=$1 AND u.deleted_at IS NULL FOR UPDATE OF u`,[id])).rows[0];
  if(!before)throw new AccountAccessError('Không tìm thấy tài khoản.',404);
  requireAccountScope(user,before);
  if(id===actorId||before.login_name==='system.sepay')throw new AccountAccessError('Không được xóa tài khoản đang đăng nhập hoặc tài khoản tích hợp.',403);
  if(revision!==before.revision)throw new AccountAccessError('Tài khoản đã thay đổi. Tải lại rồi thao tác.',409);
  await client.query('UPDATE himoto.management_account_access SET enabled=false,updated_by=$2,updated_at=now() WHERE user_id=$1',[id,actorId]);
  await client.query("UPDATE himoto.users SET status='inactive',deleted_at=now(),updated_at=now() WHERE id=$1",[id]);
  if(!(await client.query(`SELECT 1 FROM himoto.users u LEFT JOIN himoto.management_account_access a ON a.user_id=u.id WHERE u.deleted_at IS NULL AND u.status='active' AND (a.access_role='admin' AND a.enabled OR a.user_id IS NULL AND u.role_id=1) LIMIT 1`)).rowCount)throw new AccountAccessError('Phải giữ ít nhất một quản trị viên đang hoạt động.',409);
  await client.query(`INSERT INTO himoto.management_access_audit(actor_id,target_user_id,action,before_value,after_value) VALUES($1,$2,'delete',$3::jsonb,'{"enabled":false,"deleted":true}'::jsonb)`,[actorId,id,JSON.stringify(before)]);
  return {id};
}
