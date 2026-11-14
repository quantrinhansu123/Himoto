export interface MobileStaffAccount { id: number; login_name: string; enabled: boolean; revision: string; password_available: boolean }
export function isMobileStaffAccounts(value: unknown): value is MobileStaffAccount[] {
  return Array.isArray(value) && value.every(row => row && typeof row === 'object' && Number.isSafeInteger(row.id) && row.id > 0 && typeof row.login_name === 'string' && typeof row.enabled === 'boolean' && typeof row.revision === 'string' && /^\d{1,20}:\d{1,20}$/.test(row.revision) && typeof row.password_available === 'boolean');
}
