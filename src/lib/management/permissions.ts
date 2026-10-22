/** Shared role checks for management UI and API (no server-only imports). */

export type PermissionAccount = {
  role?: string | null;
  role_slug?: string | null;
  role_id?: string | number | null;
  access_role?: string | null;
  permissions?: string[];
  store_id?: number | null;
  scope_all?: boolean;
};

export const ACCESS_PERMISSIONS = ['contracts.read','contracts.draft','contracts.finalize','contracts.renew','contracts.return','customers.read','customers.write','vehicles.read','vehicles.transfer','vehicles.receive','vehicles.write','hr.read','hr.write','finance.read','finance.write','shift.review','settings.write','accounts.manage'] as const;
export type AccessPermission = typeof ACCESS_PERMISSIONS[number];
export const ACCESS_PERMISSION_LABELS:Record<AccessPermission,string>={
  'contracts.read':'Xem hợp đồng','contracts.draft':'Lập / sửa hợp đồng nháp','contracts.finalize':'Duyệt và phát hành hợp đồng','contracts.renew':'Gia hạn hợp đồng','contracts.return':'Trả / đổi xe',
  'customers.read':'Xem khách hàng','customers.write':'Thêm / sửa khách hàng','vehicles.read':'Xem xe và lịch sử','vehicles.transfer':'Chuyển xe','vehicles.receive':'Nhận xe','vehicles.write':'Thêm / sửa thông tin xe',
  'hr.read':'Xem nhân sự và lịch trực','hr.write':'Quản lý nhân sự và lịch trực','finance.read':'Xem sổ quỹ','finance.write':'Thu / chi và quản lý TK ngân hàng, két','settings.write':'Quản lý cấu hình và nhập dữ liệu','accounts.manage':'Quản lý tài khoản và phân quyền',
  'shift.review':'KTNB đối soát và xác nhận báo cáo cuối ca',
};
export const ACCESS_ROLES = {
  branch_staff: {label:'Nhân viên cơ sở',permissions:['contracts.read','contracts.draft','contracts.finalize','contracts.renew','contracts.return','customers.read','customers.write','vehicles.read','vehicles.transfer','vehicles.receive']},
  ownership_staff: {label:'Nhân viên thuê sở hữu',permissions:['contracts.read','contracts.draft','customers.read','customers.write','vehicles.read','vehicles.receive']},
  ownership_manager: {label:'Quản lý thuê sở hữu',permissions:['contracts.read','contracts.draft','contracts.finalize','contracts.renew','contracts.return','customers.read','customers.write','vehicles.read','vehicles.transfer','vehicles.receive']},
  hr: {label:'HCNS',permissions:['hr.read','hr.write']},
  accounting: {label:'Kế toán',permissions:['contracts.read','finance.read','finance.write']},
  internal_control: {label:'Kiểm toán nội bộ (KTNB)',permissions:['contracts.read','vehicles.read','finance.read','shift.review']},
  admin: {label:'Quản trị viên',permissions:[...ACCESS_PERMISSIONS]},
} as const;
export type AccessRole = keyof typeof ACCESS_ROLES;
export function hasPermission(account:PermissionAccount|null|undefined,permission:AccessPermission) {
  if(!account)return false;
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
