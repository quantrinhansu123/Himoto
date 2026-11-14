/** Shared role checks for management UI and API (no server-only imports). */

export type PermissionAccount = {
  id?: number | string;
  role?: string | null;
  role_slug?: string | null;
  role_id?: string | number | null;
  access_role?: string | null;
  permissions?: string[];
  store_id?: number | null;
  store_kind?: string | null;
  scope_all?: boolean;
};

export const ACCESS_PERMISSIONS = ['contracts.read','contracts.draft','contracts.finalize','contracts.renew','contracts.return','contracts.delete','contracts.settle','customers.read','customers.write','vehicles.read','vehicles.transfer','vehicles.receive','vehicles.write','hr.read','hr.write','finance.read','finance.write','shift.review','settings.write','accounts.manage'] as const;
// Settlement is an individual grant for the designated administrator. Creating
// another administrator must not copy that entitlement.
export const ADMIN_PERMISSIONS = ACCESS_PERMISSIONS.filter(permission => permission !== 'contracts.settle');
export type AccessPermission = typeof ACCESS_PERMISSIONS[number];
export const ACCESS_PERMISSION_LABELS:Record<AccessPermission,string>={
  'contracts.delete':'Xóa / ẩn hợp đồng (Admin, kế toán)',
  'contracts.settle':'Thanh toán và đóng hợp đồng',
  'contracts.read':'Xem hợp đồng','contracts.draft':'Lập / sửa hợp đồng','contracts.finalize':'Duyệt và phát hành hợp đồng','contracts.renew':'Gia hạn hợp đồng','contracts.return':'Trả / đổi xe',
  'customers.read':'Xem khách hàng','customers.write':'Thêm / sửa khách hàng','vehicles.read':'Xem xe và lịch sử','vehicles.transfer':'Chuyển xe','vehicles.receive':'Nhận xe','vehicles.write':'Thêm / sửa thông tin xe',
  'hr.read':'Xem nhân sự và lịch trực','hr.write':'Quản lý nhân sự và lịch trực','finance.read':'Xem sổ quỹ','finance.write':'Thu / chi và quản lý TK ngân hàng, két','settings.write':'Quản lý cấu hình và nhập dữ liệu','accounts.manage':'Quản lý tài khoản và phân quyền',
  'shift.review':'KTNB đối soát và xác nhận báo cáo cuối ca',
};
export const ACCESS_ROLES = {
  branch_staff: {label:'Nhân viên cơ sở',permissions:['contracts.read','contracts.draft','contracts.finalize','contracts.renew','contracts.return','customers.read','customers.write','vehicles.read','vehicles.transfer','vehicles.receive']},
  branch_manager: {label:'Quản lý cơ sở',permissions:['contracts.read','contracts.draft','contracts.finalize','contracts.renew','contracts.return','customers.read','customers.write','vehicles.read','vehicles.transfer','vehicles.receive','hr.read','hr.write']},
  ownership_staff: {label:'Nhân viên thuê sở hữu',permissions:['contracts.read','contracts.draft','contracts.return','customers.read','customers.write','vehicles.read','vehicles.transfer','vehicles.receive']},
  ownership_manager: {label:'Quản lý thuê sở hữu',permissions:[...ACCESS_PERMISSIONS]},
  hr: {label:'HCNS',permissions:['hr.read','hr.write']},
  headquarters_sales: {label:'Kinh doanh / Telesale · Trụ sở',permissions:['contracts.read','customers.read','vehicles.read']},
  headquarters_debt: {label:'Quản lý công nợ · Trụ sở',permissions:['contracts.read','customers.read','vehicles.read']},
  accounting: {label:'Kế toán',permissions:['contracts.read','finance.read','finance.write']},
  internal_control: {label:'Kiểm toán nội bộ (KTNB)',permissions:['contracts.read','vehicles.read','finance.read','shift.review']},
  admin: {label:'Quản trị viên',permissions:[...ADMIN_PERMISSIONS]},
} as const;
export type AccessRole = keyof typeof ACCESS_ROLES;
export function canManageAccounts(account:PermissionAccount|null|undefined) {
  return isAdminAccount(account) || isOwnershipManager(account);
}
/** A scoped administrator never acquires the global admin database connection. */
export function isOwnershipManager(account:PermissionAccount|null|undefined) {
  return Boolean(account && ['ownership_manager','branch_manager'].includes(account.access_role || '') &&
    account.store_kind === 'lease_to_own' && Number(account.store_id) > 0 && account.scope_all === false);
}
export function canSettleContract(account:PermissionAccount|null|undefined) {
  // quanlyvanhanhhimoto, confirmed as chị Thủy's account. The database identity
  // is revalidated on every request; display names and supplied grants are not identities.
  return isOwnershipManager(account) || isAdminAccount(account) && Number(account?.id)===202;
}
/** Explicit recovery entitlement for approved administrators, never arbitrary admins. */
export function canRecoverAccountPasswords(account:PermissionAccount|null|undefined) {
  const id=Number(account?.id);
  return isAdminAccount(account)&&(id===145||id===160||id===202);
}
export function hasPermission(account:PermissionAccount|null|undefined,permission:AccessPermission) {
  if(!account)return false;
  // Account administration and settlement are derived from the verified identity/scope.
  if(permission==='accounts.manage')return canManageAccounts(account);
  if(permission==='contracts.settle')return canSettleContract(account);
  if(isOwnershipManager(account))return true;
  if(permission==='contracts.delete')return isAdminAccount(account)||account.access_role==='accounting'&&Boolean(account.permissions?.includes(permission));
  // The customer directory is shared across all authenticated workspaces.
  if(permission==='customers.read')return true;
  // Fleet dispatch and receipt are available to every authenticated workspace
  // account. Profile edits, contracts and money retain their existing grants.
  if(['vehicles.read','vehicles.transfer','vehicles.receive'].includes(permission))return true;
  if(isAdminAccount(account))return true;
  if(account.permissions)return account.permissions.includes(permission);
  return (account.role==='ke-toan'||account.role_slug==='ke-toan')&&['contracts.read','finance.read','finance.write'].includes(permission);
}

export function isAdminAccount(account: PermissionAccount | null | undefined) {
  if (!account) return false;
  return account.access_role === 'admin' || (!account.access_role && (Number(account.role_id) === 1 || account.role === 'admin' || account.role_slug === 'quan-tri-vien'));
}

/** Sổ quỹ / thanh toán hợp đồng: chỉ kế toán và quản trị viên. */
export function canRecordContractPayment(account: PermissionAccount | null | undefined) {
  if (!account) return false;
  return hasPermission(account,'finance.write');
}

export function canSendDebtReminder(account:PermissionAccount|null|undefined) {
  return hasPermission(account,'contracts.read')&&(hasPermission(account,'contracts.draft')||hasPermission(account,'finance.write'));
}

/** Private, read-only report granted to quanlyvanhanh and quantri.
 * This is an individual entitlement; administrators do not inherit it.
 * The API applies it to the authenticated database user, never request input.
 */
export function canViewOwnedFleetRevenue(account:PermissionAccount|null|undefined) {
  return isAdminAccount(account)&&(account?.id===145||account?.id===160);
}
