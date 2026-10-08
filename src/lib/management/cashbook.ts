import { normalize, csvCell } from './table-utils';

export type VoucherType = 'income' | 'expense';
export interface CashbookRow {
  id: string;
  date?: string;
  time?: string;
  type: VoucherType;
  actor_id?: string;
  actor_name?: string;
  reason?: string;
  content?: string;
  store_id?: string;
  store_name?: string;
  amount?: number;
  order_id?: string;
  contract_code?: string;
  payment_method?: string;
  account?: string;
}
export const VOUCHER_LABELS: Record<VoucherType, string> = { income: 'Phiếu thu', expense: 'Phiếu chi' };
export const CASHBOOK_COLUMNS = [
  { key: 'id', label: 'ID' }, { key: 'date', label: 'Ngày' }, { key: 'time', label: 'Giờ' },
  { key: 'type', label: 'Loại phiếu' }, { key: 'actor_name', label: 'Người thực hiện' },
  { key: 'amount', label: 'Số tiền' }, { key: 'contract_code', label: 'Mã hợp đồng' },
  { key: 'payment_method', label: 'Hình thức thanh toán' }, { key: 'account', label: 'Tài khoản nhận / chi' },
  { key: 'store_name', label: 'Cơ sở' },
  { key: 'reason', label: 'Lý do' }, { key: 'content', label: 'Nội dung' },
] as const;
export type CashbookColumnKey = (typeof CASHBOOK_COLUMNS)[number]['key'];
export interface CashbookFilters { search: string; actor: string; startDate: string; endDate: string }
export const EMPTY_CASHBOOK_FILTERS: CashbookFilters = { search: '', actor: '', startDate: '', endDate: '' };
export const actorKey = (row: CashbookRow) => row.actor_id ? `id:${row.actor_id}` : row.actor_name ? `name:${row.actor_name}` : '';
export function filterCashbookRows(rows: CashbookRow[], filters: CashbookFilters, storeId: string): CashbookRow[] {
  const needle = normalize(filters.search);
  return rows.filter(row => {
    if (storeId && storeId !== 'all' && row.store_id !== storeId) return false;
    if (filters.actor && actorKey(row) !== filters.actor) return false;
    if (filters.startDate && (!row.date || row.date < filters.startDate)) return false;
    if (filters.endDate && (!row.date || row.date > filters.endDate)) return false;
    return !needle || [row.id, row.actor_name, row.reason, row.content, row.contract_code, row.payment_method, row.account, row.store_name, VOUCHER_LABELS[row.type]].some(value => normalize(value || '').includes(needle));
  });
}
const collator = new Intl.Collator('vi', { numeric: true, sensitivity: 'base' });
export function sortCashbookRows(rows: CashbookRow[], key: CashbookColumnKey, direction: 'asc' | 'desc'): CashbookRow[] {
  return [...rows].sort((a, b) => {
    const left = a[key], right = b[key];
    if (left === undefined || left === '') return right === undefined || right === '' ? 0 : 1;
    if (right === undefined || right === '') return -1;
    const result = (typeof left === 'number' && typeof right === 'number' ? left - right : collator.compare(String(left), String(right))) || (key === 'date' ? collator.compare(a.time || '', b.time || '') : 0);
    return direction === 'asc' ? result : -result;
  });
}
export function cashbookCell(row: CashbookRow, key: CashbookColumnKey): string {
  if (key === 'type') return VOUCHER_LABELS[row.type];
  if (key === 'date' && row.date) return row.date.split('-').reverse().join('/');
  if (key === 'amount') return row.amount === undefined ? '—' : `${new Intl.NumberFormat('vi-VN').format(row.amount)} ₫`;
  return String(row[key] || '—');
}
export function cashbookCsv(rows: CashbookRow[]): string {
  return [CASHBOOK_COLUMNS.map(column => csvCell(column.label)).join(','),
    ...rows.map(row => CASHBOOK_COLUMNS.map(column => csvCell(cashbookCell(row, column.key))).join(','))].join('\r\n');
}
