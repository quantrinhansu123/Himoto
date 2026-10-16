import 'server-only';
import { hash } from 'bcryptjs';
import type { PoolClient } from 'pg';
import { ACCESS_PERMISSIONS, ACCESS_ROLES,type AccessRole } from '@/lib/management/permissions';

export class AccountAccessError extends Error {constructor(message:string,public status=400){super(message);}}
export interface AccountValues {name:string;login_name:string;password:string;access_role:AccessRole;store_id:number|null;scope_all:boolean;permissions:string[];enabled:boolean}
export function parseAccountValues(raw:unknown,creating:boolean):AccountValues {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new AccountAccessError('Thông tin tài khoản không hợp lệ.');
  const body=raw as Record<string,unknown>,name=String(body.name||'').trim(),login=String(body.login_name||'').trim().toLowerCase(),role=String(body.access_role||''),password=typeof body.password==='string'?body.password:'';
  if(!name||name.length>191||!/^[a-z0-9._-]{3,80}$/.test(login)||!Object.hasOwn(ACCESS_ROLES,role))throw new AccountAccessError('Kiểm tra tên, tài khoản (3–80 ký tự, không dấu) và vai trò.');
  if((creating||password)&& (password.length<8||password.length>128))throw new AccountAccessError('Mật khẩu cần từ 8 đến 128 ký tự.');
  const scopeAll=role==='admin'||body.scope_all===true,store=scopeAll?null:Number(body.store_id);
  if(!scopeAll&&(!Number.isSafeInteger(store)||!store||store<0))throw new AccountAccessError('Chọn cơ sở được phân quyền.');
  if(['branch_staff','ownership_staff','ownership_manager'].includes(role)&&scopeAll)throw new AccountAccessError('Nhân viên và quản lý cơ sở phải được gắn một cơ sở.');
  if(typeof body.enabled!=='boolean'||!Array.isArray(body.permissions)||body.permissions.some(p=>!ACCESS_PERMISSIONS.includes(p)))throw new AccountAccessError('Quyền hoặc trạng thái tài khoản không hợp lệ.');
  if(role!=='admin'&&body.permissions.includes('accounts.manage'))throw new AccountAccessError('Chỉ vai trò quản trị viên được quản lý tài khoản.');
  return {name,login_name:login,password,access_role:role as AccessRole,store_id:store,scope_all:scopeAll,permissions:role==='admin'?[...ACCESS_PERMISSIONS]:[...new Set(body.permissions)] as string[],enabled:body.enabled};
}
export async function listManagedAccounts(client:Pick<PoolClient,'query'>) {
  return (await client.query(`SELECT u.id,u.name,u.email,u.status,a.login_name,COALESCE(a.access_role,CASE WHEN u.role_id=1 THEN 'admin' ELSE 'accounting' END) AS access_role,a.store_id,
    COALESCE(a.scope_all,true) AS scope_all,COALESCE(a.permissions,CASE WHEN u.role_id=1 THEN $1::jsonb ELSE $2::jsonb END) AS permissions,a.enabled,s.store_name,
    u.xmin::text AS revision FROM himoto.users u LEFT JOIN himoto.management_account_access a ON a.user_id=u.id
    LEFT JOIN himoto.stores s ON s.id=a.store_id WHERE u.deleted_at IS NULL AND (a.user_id IS NOT NULL OR u.role_id IN (1,6)) ORDER BY u.id`,[JSON.stringify(ACCESS_PERMISSIONS),JSON.stringify(ACCESS_ROLES.accounting.permissions)])).rows;
}
export async function saveManagedAccount(client:PoolClient,actorId:number,raw:unknown,id?:number) {
  const input=parseAccountValues(raw,!id);
  await client.query("SET LOCAL lock_timeout='5s'");
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['management-accounts']);
  const before=id?(await client.query(`SELECT u.id,u.name,u.status,u.xmin::text AS revision,a.login_name,a.access_role,a.store_id,a.scope_all,a.permissions,a.enabled
    FROM himoto.users u LEFT JOIN himoto.management_account_access a ON a.user_id=u.id WHERE u.id=$1 AND u.deleted_at IS NULL FOR UPDATE OF u`,[id])).rows[0]:null;
  if(id&&!before)throw new AccountAccessError('Không tìm thấy tài khoản.',404);
  if(before?.login_name==='system.sepay')throw new AccountAccessError('Tài khoản tích hợp SePay chỉ dùng để ghi log tự động.',403);
  if(id&&String((raw as Record<string,unknown>).revision||'')!==before.revision)throw new AccountAccessError('Tài khoản đã thay đổi. Tải lại danh sách rồi thao tác.',409);
  if(id===actorId&&(!input.enabled||input.access_role!=='admin'))throw new AccountAccessError('Không được tự khóa hoặc bỏ quyền quản trị của tài khoản đang đăng nhập.');
  if(input.store_id!==null){const store=(await client.query('SELECT kind FROM himoto.stores WHERE id=$1 FOR SHARE',[input.store_id])).rows[0];
    if(!store)throw new AccountAccessError('Cơ sở không còn tồn tại.');
    if(input.access_role.startsWith('ownership_')&&store.kind!=='lease_to_own')throw new AccountAccessError('Vai trò thuê sở hữu phải gắn cơ sở thuê sở hữu.');
  }
  const slug=({branch_staff:'nhan-vien',ownership_staff:'thue-so-huu-hop-dong',ownership_manager:'thue-so-huu-truong-phong',hr:'nhan-su',accounting:'ke-toan',admin:'quan-tri-vien'})[input.access_role];
  const role=(await client.query('SELECT id FROM himoto.roles WHERE slug=$1',[slug])).rows[0];if(!role)throw new AccountAccessError('Vai trò chưa được cấu hình.');
  const password=input.password?await hash(input.password,12):null;
  if(!id){const created=await client.query(`INSERT INTO himoto.users(name,email,password,role,role_id,status,store_id,created_at,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,now(),now()) RETURNING id`,[input.name,`${input.login_name}@accounts.himoto.local`,password,input.access_role==='admin'?'admin':slug,role.id,input.enabled?'active':'inactive',input.store_id]);id=Number(created.rows[0].id);}
  else await client.query(`UPDATE himoto.users SET name=$2,password=COALESCE($3,password),role=$4,role_id=$5,status=$6,store_id=$7,updated_at=now() WHERE id=$1`,[id,input.name,password,input.access_role==='admin'?'admin':slug,role.id,input.enabled?'active':'inactive',input.store_id]);
  await client.query(`INSERT INTO himoto.management_account_access(user_id,login_name,access_role,store_id,scope_all,permissions,enabled,created_by,updated_by)
    VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$8) ON CONFLICT(user_id) DO UPDATE SET login_name=EXCLUDED.login_name,access_role=EXCLUDED.access_role,
    store_id=EXCLUDED.store_id,scope_all=EXCLUDED.scope_all,permissions=EXCLUDED.permissions,enabled=EXCLUDED.enabled,updated_by=$8,updated_at=now()`,
    [id,input.login_name,input.access_role,input.store_id,input.scope_all,JSON.stringify(input.permissions),input.enabled,actorId]);
  const admins=await client.query(`SELECT 1 FROM himoto.users u LEFT JOIN himoto.management_account_access a ON a.user_id=u.id
    WHERE u.status='active' AND u.deleted_at IS NULL AND (a.access_role='admin' AND a.enabled OR a.user_id IS NULL AND u.role_id=1) LIMIT 1`);
  if(!admins.rowCount)throw new AccountAccessError('Phải giữ ít nhất một tài khoản quản trị đang hoạt động.',409);
  const {password:omitted,...safe}=input;void omitted;
  await client.query(`INSERT INTO himoto.management_access_audit(actor_id,target_user_id,action,before_value,after_value) VALUES($1,$2,$3,$4::jsonb,$5::jsonb)`,
    [actorId,id,before?'update':'create',before?JSON.stringify(before):null,JSON.stringify({...safe,password_changed:Boolean(password)})]);
  return {id};
}
