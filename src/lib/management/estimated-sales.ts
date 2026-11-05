export interface EstimatedSalesReport {
  sales: number;
  contracts: number;
  vehicles: number;
  vehicle_days: number;
  active_contracts: number;
  finished_contracts: number;
}

export function emptyEstimatedSales(): EstimatedSalesReport {
  return { sales: 0, contracts: 0, vehicles: 0, vehicle_days: 0, active_contracts: 0, finished_contracts: 0 };
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

const nonnegativeInteger = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;

export function validEstimatedSales(value: unknown): value is EstimatedSalesReport {
  const row = record(value);
  return ['sales', 'contracts', 'vehicles', 'vehicle_days', 'active_contracts', 'finished_contracts']
    .every(key => nonnegativeInteger(row[key]))
    && Number(row.contracts) === Number(row.active_contracts) + Number(row.finished_contracts);
}

export async function loadEstimatedSales(from: string, to: string, store: string, signal?: AbortSignal): Promise<EstimatedSalesReport> {
  const query = new URLSearchParams({ from, to, ...(store === 'all' ? {} : { store_id: store }) });
  const response = await fetch(`/api/auth/rental-revenue/estimated-sales?${query}`, { cache: 'no-store', credentials: 'same-origin', signal });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.status !== 'success') throw Error(body?.message || 'Không tải được doanh số.');
  if (!validEstimatedSales(body.data)) throw Error('Số liệu doanh số chưa hợp lệ. Thử tải lại.');
  return body.data;
}
