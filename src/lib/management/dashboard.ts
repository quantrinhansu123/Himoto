import {validDashboardSummary,type DashboardSummary} from '../../../shared/dashboard';
export {validDashboardSummary,type DashboardSummary,type DashboardStoreRow} from '../../../shared/dashboard';

export async function loadDashboardSummary(from: string, to: string, store: string, signal?: AbortSignal): Promise<DashboardSummary> {
  const query = new URLSearchParams({ from, to, ...(store === 'all' ? {} : { store_id: store }) });
  const response = await fetch(`/api/auth/dashboard?${query}`, { credentials: 'same-origin', cache: 'no-store', signal });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.status !== 'success') throw Error(body?.message || 'Không tải được Dashboard giao dịch.');
  if (!validDashboardSummary(body.data)) throw Error('Số liệu Dashboard chưa khớp tổng hoặc thiếu dữ liệu. Thử tải lại.');
  return body.data;
}
