import { ADMIN_PERMISSIONS,ACCESS_PERMISSIONS,ACCESS_ROLES,type AccessRole } from './access-permissions';
import { validateNewPassword } from './account-password-validation';
export class AccountAccessError extends Error {constructor(message:string,public status=400){super(message);}}
export interface AccountValues {name:string;login_name:string;password:string;access_role:AccessRole;store_id:number|null;scope_all:boolean;permissions:string[];enabled:boolean}
export function parseAccountValues(raw:unknown,creating:boolean):AccountValues {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new AccountAccessError('Thông tin tài khoản không hợp lệ.');
  const body=raw as Record<string,unknown>,name=String(body.name||'').trim(),login=String(body.login_name||'').trim().toLowerCase(),role=String(body.access_role||''),password=typeof body.password==='string'?body.password:'';
  if(!name||name.length>191||(!creating||login)&&!/^[a-z0-9._-]{3,80}$/.test(login)||!Object.hasOwn(ACCESS_ROLES,role))throw new AccountAccessError('Kiểm tra tên, tài khoản (3–80 ký tự, không dấu) và vai trò.');
  if(body.password!==undefined&&typeof body.password!=='string')throw new AccountAccessError('Mật khẩu chưa hợp lệ.');
  if(password)validateNewPassword(password);
  const scopeAll=role==='ownership_manager'?false:role==='admin'||role==='headquarters_sales'||role==='headquarters_debt'||body.scope_all===true,store=scopeAll||body.store_id==null||body.store_id===''?null:Number(body.store_id);
  if(store!==null&&(!Number.isSafeInteger(store)||store<1)||!scopeAll&&store===null&&(body.enabled!==false||role==='ownership_manager'))throw new AccountAccessError('Chọn cơ sở trước khi cho phép đăng nhập.');
  if(typeof body.enabled!=='boolean'||!Array.isArray(body.permissions)||body.permissions.some(p=>!ACCESS_PERMISSIONS.includes(p)))throw new AccountAccessError('Quyền hoặc trạng thái tài khoản không hợp lệ.');
  if(body.permissions.includes('contracts.delete')&&!['admin','accounting','ownership_manager','branch_manager'].includes(role))throw new AccountAccessError('Chỉ Admin, quản lý thuê sở hữu hoặc kế toán được cấp quyền xóa hợp đồng.');
  return {name,login_name:login,password,access_role:role as AccessRole,store_id:store,scope_all:scopeAll,permissions:role==='admin'?[...ADMIN_PERMISSIONS]:role==='ownership_manager'?[...ACCESS_PERMISSIONS]:[...new Set(body.permissions.filter(permission=>permission!=='accounts.manage'&&permission!=='contracts.settle'))] as string[],enabled:body.enabled};
}
