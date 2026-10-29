import { CellValue, ManagementRow } from './types';
import { staffRoles } from './staff-positions';
import { matchesOverdueBucket,type OverdueBucket } from './contract-overdue';
import { vehicleMissingOpenContract } from './vehicle-holder';
import { isContractActiveRentalStatus } from './contract-tabs';
import { formatDate, formatDateTime } from '@/lib/formatters';

export type OverdueCompare = 'gt' | 'lt' | 'eq';
export interface TableQuery {
  search: string;
  status: string;
  filters: Record<string, string>;
  startDate: string;
  endDate: string;
  /** Days value for overdue_days comparison filter; empty disables the filter. */
  overdueDays: string;
  /** gt = trên, lt = dưới, eq = bằng. Defaults to eq when days are set. */
  overdueCompare: OverdueCompare | '';
  overdueBucket?:OverdueBucket;
}
export const EMPTY_QUERY: TableQuery = { search: '', status: '', filters: {}, startDate: '', endDate: '', overdueDays: '', overdueCompare: 'eq' };
export const OVERDUE_COMPARE_OPTIONS: { value: OverdueCompare; label: string }[] = [
  { value: 'gt', label: 'Trên' }, { value: 'lt', label: 'Dưới' }, { value: 'eq', label: 'Bằng' },
];
export const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();

function matchesOverdueDays(row: ManagementRow, daysText: string, compare: OverdueCompare | ''): boolean {
  if (!daysText.trim()) return true;
  if (!/^\d{1,5}$/.test(daysText.trim())) return true;
  const target = Number(daysText.trim());
  const actual = row.overdue_days == null || row.overdue_days === '' ? 0 : Number(row.overdue_days);
  if (!Number.isFinite(actual)) return false;
  const op = compare || 'eq';
  if (op === 'gt') return actual > target;
  if (op === 'lt') return actual < target;
  return actual === target;
}

export function filterRows(rows: ManagementRow[], query: TableQuery, storeId: string): ManagementRow[] {
  const needle = normalize(query.search);
  const licenseNeedle = needle.replace(/[\s.-]/g, '');
  return rows.filter(row => {
    if (storeId && storeId !== 'all' && String(row.store_id ?? row.id) !== storeId) return false;
    if (query.status && row.status !== query.status
      && !(query.status==='renting'&&isContractActiveRentalStatus(row.status))
      && !(query.status==='overdue'&&row.collection_overdue===1)) return false;
    if (query.filters.missing_contract === '1' && !vehicleMissingOpenContract(row)) return false;
    if (Object.entries(query.filters).some(([key, value]) => key!=='missing_contract' && value && String(row[key] ?? '') !== value && !(key === 'position' && staffRoles(row.position).includes(value)))) return false;
    const date = String(row.start_date ?? '').slice(0, 10);
    if (query.startDate && (!date || date < query.startDate)) return false;
    if (query.endDate && (!date || date > query.endDate)) return false;
    if (!matchesOverdueDays(row, query.overdueDays || '', query.overdueCompare || '')) return false;
    if (!matchesOverdueBucket(row, query.overdueBucket || '')) return false;
    const searchable = ['code', 'name', 'phone', 'id_card', 'address', 'license', 'customer_name', 'customer_phone', 'vehicle_name', 'holder_name'];
    return !needle || searchable.some(key => normalize(String(row[key] ?? '')).includes(needle)) ||
      /\d/.test(licenseNeedle) && normalize(String(row.license ?? '')).replace(/[\s.-]/g, '').includes(licenseNeedle);
  });
}

const collator = new Intl.Collator('vi', { numeric: true, sensitivity: 'base' });
const numberFormatter = new Intl.NumberFormat('vi-VN');
export function sortRows(rows: ManagementRow[], key: string, direction: 'asc' | 'desc'): ManagementRow[] {
  return [...rows].sort((a, b) => {
    const left = a[key], right = b[key];
    if (left === undefined || left === '') return right === undefined || right === '' ? 0 : 1;
    if (right === undefined || right === '') return -1;
    const result = typeof left === 'number' && typeof right === 'number' ? left - right : collator.compare(String(left), String(right));
    return direction === 'asc' ? result : -result;
  });
}

const ownershipTypeRank = (type: unknown) => type === 'ownership_cd' ? 0 : type === 'ownership' ? 1 : 2;

/** Search may pin current rentals before drafts and the selected column sort. */
export function sortContractRows(
  rows: ManagementRow[],
  key: string,
  direction: 'asc' | 'desc',
  options: { pinDrafts?: boolean; pinOwnershipTypes?: boolean; pinActiveRentals?: boolean } = {},
): ManagementRow[] {
  const sorted = sortRows(rows, key, direction);
  if (!options.pinDrafts && !options.pinOwnershipTypes && !options.pinActiveRentals) return sorted;
  return sorted.sort((a, b) => {
    if (options.pinActiveRentals) {
      const active = (row: ManagementRow) => ['renting','overdue'].includes(row.status);
      const byActive = Number(active(b)) - Number(active(a));
      if (byActive) return byActive;
      if (active(a)) {
        const started = (row: ManagementRow) => Date.parse(String(row.start_date || '')) || 0;
        return started(b) - started(a) || b.id - a.id;
      }
    }
    if (options.pinDrafts) {
      const draftRank = (row: ManagementRow) => row.status === 'draft' ? 0 : 1;
      const byDraft = draftRank(a) - draftRank(b);
      if (byDraft) return byDraft;
    }
    if (options.pinOwnershipTypes) {
      const byType = ownershipTypeRank(a.rental_type) - ownershipTypeRank(b.rental_type);
      if (byType) return byType;
    }
    return 0;
  });
}

export function formatValue(value: CellValue, format?: string): string {
  if (value === undefined || value === '') return '—';
  if (format === 'money') return `${numberFormatter.format(Number(value))} ₫`;
  if (format === 'number') return numberFormatter.format(Number(value));
  if (format === 'duration') {const minutes=Math.max(0,Math.floor(Number(value)));return `${Math.floor(minutes/1440)} ngày ${Math.floor(minutes%1440/60)} giờ${minutes%60?` ${minutes%60} phút`:''}`;}
  if (format === 'date' || format === 'datetime') {
    const raw = String(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
      return match ? `${match[3]}/${match[2]}/${match[1]}` : raw;
    }
    const formatted = format === 'datetime' ? formatDateTime(raw) : formatDate(raw);
    return formatted === '--' ? raw : formatted;
  }
  return String(value);
}

export function csvCell(value: string): string {
  // Prevent user-entered values from becoming spreadsheet formulas.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}
