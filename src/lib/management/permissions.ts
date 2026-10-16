/** Shared role checks for management UI and API (no server-only imports). */

export type PermissionAccount = {
  role?: string | null;
  role_slug?: string | null;
  role_id?: string | number | null;
};

export function isAdminAccount(account: PermissionAccount | null | undefined) {
  if (!account) return false;
  return Number(account.role_id) === 1 || account.role === 'admin' || account.role_slug === 'quan-tri-vien';
}

/** Sổ quỹ / thanh toán hợp đồng: chỉ kế toán và quản trị viên. */
export function canRecordContractPayment(account: PermissionAccount | null | undefined) {
  if (!account) return false;
  return isAdminAccount(account) || account.role === 'ke-toan' || account.role_slug === 'ke-toan';
}
