import { CASHBOOK_BREAKDOWN_KEYS, cashbookRentalTotals, type CashbookBreakdown } from './cashbook';

export interface RentalOverviewRow {
  key: string; name: string; breakdown: CashbookBreakdown;
  revenue: number; income: number; expense: number;
}
export interface RentalOverviewReport { rows: RentalOverviewRow[]; total: RentalOverviewRow }
export function rentalOverviewRow(key: string, name: string, breakdown: CashbookBreakdown): RentalOverviewRow {
  return { key, name, breakdown, ...cashbookRentalTotals(breakdown) };
}
export interface VehicleRevenueRow {
  id: number; name: string; license: string; store_name: string; type: string; year: number | null;
  rentals: number; rental: number; renewal: number; adjustment: number; revenue: number;
}
export interface VehicleRevenueReport {
  rows: VehicleRevenueRow[]; total: number; page: number; size: number;
  rentals: number; rental: number; renewal: number; adjustment: number; revenue: number;
}
export interface VehicleRevenueDetail {
  id: number; order_id: number; code: string; rent_at: string | null; return_at: string | null;
  rental: number; renewal: number; adjustment: number; revenue: number;
}
export interface RentalReportScope { from: string; to: string; store: string }
export function rentalReportQuery({ from, to, store }: RentalReportScope) {
  return new URLSearchParams({ from, to, ...(store === 'all' ? {} : { store_id: store }) });
}
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const nonnegativeInteger = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
const validAmounts = (row: Record<string, unknown>) => ['rental', 'renewal', 'adjustment', 'revenue'].every(key => Number.isSafeInteger(row[key]))
  && row.revenue === Number(row.rental) + Number(row.renewal) + Number(row.adjustment);
export function validRentalReport(path: string, value: unknown, query: URLSearchParams) {
  if (path === 'vehicle-revenue' && query.has('vehicle_id')) {
    if (!Array.isArray(value)) return false;
    return new Set(value.map(row => row?.id)).size === value.length && value.every(raw => {
      const row = record(raw);
      return validAmounts(row) && nonnegativeInteger(row.id) && Number(row.id) > 0 && nonnegativeInteger(row.order_id) && Number(row.order_id) > 0
        && typeof row.code === 'string' && [row.rent_at, row.return_at].every(date => date === null || typeof date === 'string' && Number.isFinite(Date.parse(date)));
    });
  }
  const report = record(value);
  if (!Array.isArray(report.rows)) return false;
  const rows = report.rows;
  if (path === 'vehicle-revenue') {
    if (!validAmounts(report) || !nonnegativeInteger(report.total) || !nonnegativeInteger(report.rentals)
      || !nonnegativeInteger(report.page) || Number(report.page) < 1 || !nonnegativeInteger(report.size) || Number(report.size) < 1 || Number(report.size) > 50
      || Number(report.page) > Math.max(1, Math.ceil(Number(report.total) / Number(report.size)))) return false;
    if (new Set(report.rows.map(row => row?.id)).size !== report.rows.length || report.rows.some(raw => {
      const row = record(raw);
      return !validAmounts(row) || !nonnegativeInteger(row.id) || Number(row.id) < 1 || !nonnegativeInteger(row.rentals)
        || !['name', 'license', 'store_name', 'type'].every(key => typeof row[key] === 'string') || row.year !== null && !Number.isSafeInteger(row.year);
    })) return false;
    if (query.get('mode') === 'all') {
      if (report.rows.length !== report.total) return false;
      return ['rental', 'renewal', 'adjustment', 'revenue', 'rentals'].every(key => rows.reduce((sum: number, raw: unknown) => sum + Number(record(raw)[key]), 0) === report[key]);
    }
    return report.rows.length === Math.min(Number(report.size), Math.max(0, Number(report.total) - (Number(report.page) - 1) * Number(report.size)));
  }
  if (path !== 'rental-overview') return false;
  const validOverview = (raw: unknown) => {
    const row = record(raw), breakdown = record(row.breakdown);
    if (typeof row.key !== 'string' || typeof row.name !== 'string' || !CASHBOOK_BREAKDOWN_KEYS.every(key => Number.isSafeInteger(breakdown[key]))) return false;
    const expected = cashbookRentalTotals(breakdown as CashbookBreakdown);
    return (['revenue', 'income', 'expense'] as const).every(key => Number.isSafeInteger(row[key]) && row[key] === expected[key]);
  };
  if (!validOverview(report.total) || report.rows.some(raw => !validOverview(raw)) || new Set(report.rows.map(row => row.key)).size !== report.rows.length) return false;
  const totals = record(record(report.total).breakdown);
  return CASHBOOK_BREAKDOWN_KEYS.every(key => rows.reduce((sum: number, raw: unknown) => sum + Number(record(record(raw).breakdown)[key]), 0) === totals[key]);
}
export async function loadRentalReport<T>(path: string, query: URLSearchParams, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/auth/staff-sales/${path}?${query}`, { credentials: 'same-origin', cache: 'no-store', signal });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.status !== 'success') throw Error(body?.message || 'Không tải được báo cáo thuê xe.');
  if (!validRentalReport(path, body.data, query)) throw Error('Số liệu chi tiết báo cáo chưa khớp tổng hoặc thiếu dữ liệu. Thử tải lại.');
  return body.data as T;
}
