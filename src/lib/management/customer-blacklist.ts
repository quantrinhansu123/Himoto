import type { ManagementRow } from './types';

export async function updateCustomerBlacklist(customer: ManagementRow, blacklisted: boolean) {
  if (!customer.customer_revision) throw new Error('Nhấn Làm mới để tải phiên bản hồ sơ trước khi đổi Blacklist.');
  const response = await fetch(`/api/auth/customers/${customer.id}/blacklist`, {
    method: 'PATCH', credentials: 'same-origin', cache: 'no-store',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ blacklisted, revision: customer.customer_revision }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.status !== 'success') throw new Error(result?.message || 'Chưa xác nhận được thay đổi Blacklist. Nhấn Làm mới để kiểm tra.');
  const row = result.data;
  if (Number(row?.id) !== customer.id || !['active', 'warning', 'draft', 'blacklist'].includes(row?.status) ||
      (row.status === 'blacklist') !== blacklisted || typeof row?.customer_revision !== 'string' || !/^\d+$/.test(row.customer_revision)) throw new Error('Kết quả đổi Blacklist chưa hợp lệ. Nhấn Làm mới để kiểm tra.');
  return { status: String(row.status), customer_revision: row.customer_revision as string };
}
