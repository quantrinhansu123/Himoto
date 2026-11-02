export interface DashboardStoreRow {
  key: string;
  name: string;
  contracts: number;
  rental_contracts: number;
  ownership_contracts: number;
  overdue_contracts: number;
  sales: number;
  revenue: number;
  repair: number;
}

export interface DashboardSummary {
  from: string;
  to: string;
  rows: DashboardStoreRow[];
  total: Omit<DashboardStoreRow, 'key' | 'name'>;
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

const nonnegativeInteger = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
const moneyInteger = (value: unknown) => Number.isSafeInteger(value);

function validRow(raw: unknown): raw is DashboardStoreRow {
  const row = record(raw);
  return typeof row.key === 'string'
    && typeof row.name === 'string'
    && ['contracts', 'rental_contracts', 'ownership_contracts', 'overdue_contracts', 'sales', 'repair']
      .every(key => nonnegativeInteger(row[key]))
    && moneyInteger(row.revenue)
    && Number(row.contracts) === Number(row.rental_contracts) + Number(row.ownership_contracts);
}

export function validDashboardSummary(value: unknown): value is DashboardSummary {
  const report = record(value);
  const rows = report.rows;
  if (typeof report.from !== 'string' || typeof report.to !== 'string' || !Array.isArray(rows)) return false;
  if (!validRow({ key: 'total', name: 'Tổng', ...record(report.total) })) return false;
  const list = rows as unknown[];
  if (list.some(row => !validRow(row)) || new Set(list.map(row => record(row).key)).size !== list.length) return false;
  const total = record(report.total);
  return (['contracts', 'rental_contracts', 'ownership_contracts', 'overdue_contracts', 'sales', 'revenue', 'repair'] as const)
    .every(key => list.reduce((sum: number, raw: unknown) => sum + Number(record(raw)[key]), 0) === Number(total[key]));
}

export async function loadDashboardSummary(from: string, to: string, store: string, signal?: AbortSignal): Promise<DashboardSummary> {
  const query = new URLSearchParams({ from, to, ...(store === 'all' ? {} : { store_id: store }) });
  const response = await fetch(`/api/auth/dashboard?${query}`, { credentials: 'same-origin', cache: 'no-store', signal });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.status !== 'success') throw Error(body?.message || 'Không tải được Dashboard giao dịch.');
  if (!validDashboardSummary(body.data)) throw Error('Số liệu Dashboard chưa khớp tổng hoặc thiếu dữ liệu. Thử tải lại.');
  return body.data;
}
