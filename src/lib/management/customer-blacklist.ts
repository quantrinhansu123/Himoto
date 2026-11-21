import type { ManagementRow } from './types';

export async function updateCustomerBlacklist(customer: ManagementRow, blacklisted: boolean) {
  const url = `/api/auth/customers/${customer.id}/blacklist`;
  let revision = customer.customer_revision;
  if (typeof revision !== 'string' || !/^\d{1,20}$/.test(revision)) {
    const response = await fetch(url, { method: 'GET', credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
    const result = await response.json().catch(() => null);
    const row = result?.data;
    if (!response.ok || result?.status !== 'success' || Number(row?.id) !== customer.id ||
        typeof row?.blacklisted !== 'boolean' || typeof row?.customer_revision !== 'string' || !/^\d{1,20}$/.test(row.customer_revision)) {
      throw new Error(result?.message || 'Không tải được phiên bản hồ sơ khách hàng. Nhấn Làm mới rồi thử lại.');
    }
    if (row.blacklisted !== (customer.status === 'blacklist')) throw new Error('Trạng thái Blacklist đã thay đổi. Nhấn Làm mới trước khi thử lại.');
    revision = row.customer_revision;
  }
  const response = await fetch(url, {
    method: 'PATCH', credentials: 'same-origin', cache: 'no-store',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ blacklisted, revision }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.status !== 'success') throw new Error(result?.message || 'Chưa xác nhận được thay đổi Blacklist. Nhấn Làm mới để kiểm tra.');
  const row = result.data;
  if (Number(row?.id) !== customer.id || !['active', 'warning', 'draft', 'blacklist'].includes(row?.status) ||
      (row.status === 'blacklist') !== blacklisted || typeof row?.customer_revision !== 'string' || !/^\d+$/.test(row.customer_revision)) throw new Error('Kết quả đổi Blacklist chưa hợp lệ. Nhấn Làm mới để kiểm tra.');
  return { status: String(row.status), customer_revision: row.customer_revision as string };
}
