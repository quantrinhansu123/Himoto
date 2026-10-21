import { createCashbookFixtures } from '@/fixtures/cashbook-data';
import { CASHBOOK_BREAKDOWN_KEYS, type CashbookBreakdown, CashbookColumnKey, CashbookFilters, CashbookRow, VoucherType } from './cashbook';

export interface CashbookRepository { load(signal?: AbortSignal): Promise<CashbookRow[]> }
type ApiRecord = Record<string, unknown>;
const object = (value: unknown): ApiRecord => value && typeof value === 'object' && !Array.isArray(value) ? value as ApiRecord : {};
const optionalText = (value: unknown): string | undefined => value == null || value === '' ? undefined : String(value);
const voucherDateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });

export function cashbookDateTime(value: unknown): { date?: string; time?: string } {
  const timestamp = optionalText(value);
  if (!timestamp) return {};
  const match = timestamp.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2})?)(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/i);
  if (!match || (match[3] && !match[2])) throw new Error('API trả về ngày/giờ phiếu không hợp lệ.');
  const day = new Date(`${match[1]}T00:00:00Z`);
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== match[1]) throw new Error('API trả về ngày phiếu không hợp lệ.');
  if (!match[2]) return { date: match[1] };
  const local = new Date(`${match[1]}T${match[2]}${match[3] || 'Z'}`);
  if (!Number.isFinite(local.getTime()) || Number(match[2].slice(0, 2)) > 23 || Number(match[2].slice(3, 5)) > 59 || Number(match[2].slice(6, 8) || 0) > 59) throw new Error('API trả về giờ phiếu không hợp lệ.');
  if (!match[3]) return { date: match[1], time: match[2] };
  const parts = voucherDateFormatter.formatToParts(local);
  const part = (name: string) => parts.find(item => item.type === name)?.value;
  return { date: `${part('year')}-${part('month')}-${part('day')}`, time: `${part('hour')}:${part('minute')}:${part('second')}` };
}
export function mapCashbookRow(raw: ApiRecord): CashbookRow {
  const id = optionalText(raw.id);
  if (!id) throw new Error('API trả về phiếu thiếu ID.');
  const type = String(raw.type || '');
  if (!['in', 'addon', 'out'].includes(type)) throw new Error(`Loại giao dịch “${type || 'chưa có'}” chưa được xác nhận là phiếu thu/chi.`);
  const user = object(raw.user);
  return { id, ...cashbookDateTime(raw.occurred_at ?? raw.created_at), type: type === 'out' ? 'expense' : 'income',
    actor_id: optionalText(raw.created_by ?? raw.user_id ?? user.id), actor_name: optionalText(raw.user_name ?? user.name),
    reason: optionalText(raw.reason), content: optionalText(raw.content ?? raw.note), store_id: optionalText(raw.store_id),
    amount: raw.amount == null || raw.amount === '' || !Number.isFinite(Number(raw.amount)) ? undefined : Number(raw.amount),
    order_id: optionalText(raw.order_id), contract_code: optionalText(raw.contract_code), payment_method: optionalText(raw.payment_method),
    account: optionalText(raw.account), store_name: optionalText(raw.store_name) };
}
export function createDemoCashbookRepository(): CashbookRepository {
  return { async load(signal) { signal?.throwIfAborted(); return structuredClone(createCashbookFixtures()); } };
}
export interface CashbookPagination { page: number; pageSize: number; key: CashbookColumnKey; direction: 'asc' | 'desc' }
export const DEFAULT_CASHBOOK_PAGINATION: CashbookPagination = { page: 1, pageSize: 5, key: 'date', direction: 'desc' };
export interface CashbookPageResult { rows: CashbookRow[]; total: number; amount: number; page: number; pageSize: number }
export interface CashbookListResult { total: number; income: CashbookPageResult; expense: CashbookPageResult; actors: [string, string][]; breakdown?: CashbookBreakdown }
export function cashbookQuery(filters: CashbookFilters, storeId: string): URLSearchParams {
  const query = new URLSearchParams();
  if (storeId && storeId !== 'all') query.set('store_id', storeId);
  if (filters.search) query.set('search', filters.search);
  if (filters.actor) query.set('actor', filters.actor);
  if (filters.startDate) query.set('from', filters.startDate);
  if (filters.endDate) query.set('to', filters.endDate);
  return query;
}
async function readCashbook(query: URLSearchParams, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(`/api/auth/cashbook/vouchers?${query}`, { method: 'GET', cache: 'no-store', signal, credentials: 'same-origin', headers: { Accept: 'application/json' } });
  const envelope = object(await response.json().catch(() => ({})));
  if (!response.ok || envelope.status !== 'success') throw new Error(optionalText(envelope.message) || `Không tải được sổ quỹ (HTTP ${response.status}).`);
  return envelope.data;
}
export async function loadCashbookPage(filters: CashbookFilters, storeId: string, income: CashbookPagination, expense: CashbookPagination, signal?: AbortSignal): Promise<CashbookListResult> {
  const query = cashbookQuery(filters, storeId);
  for (const [kind, config] of [['income', income], ['expense', expense]] as const) {
    query.set(`${kind}_page`, String(config.page)); query.set(`${kind}_limit`, String(config.pageSize));
    query.set(`${kind}_sort`, config.key); query.set(`${kind}_direction`, config.direction);
  }
  const data = object(await readCashbook(query, signal));
  const page = (value: unknown): CashbookPageResult => {
    const raw = object(value);
    if (!Array.isArray(raw.rows) || !Number.isSafeInteger(raw.total) || Number(raw.total) < 0 || !Number.isSafeInteger(raw.page) || Number(raw.page) < 1 || !Number.isSafeInteger(raw.pageSize) || Number(raw.pageSize) < 1 || Number(raw.pageSize) > 50 || raw.rows.length > Number(raw.pageSize) || !Number.isFinite(Number(raw.amount))) throw new Error('API sổ quỹ trả về phân trang không hợp lệ.');
    return { rows: raw.rows.map(item => mapCashbookRow(object(item))), total: Number(raw.total), amount: Number(raw.amount), page: Number(raw.page), pageSize: Number(raw.pageSize) };
  };
  if (!Number.isSafeInteger(data.total) || Number(data.total) < 0 || !Array.isArray(data.actors) || !data.actors.every(actor => Array.isArray(actor) && actor.length === 2 && actor.every(item => typeof item === 'string'))) throw new Error('API sổ quỹ thiếu tổng số phiếu hoặc người thực hiện.');
  const incomePage = page(data.income), expensePage = page(data.expense);
  let breakdown: CashbookBreakdown | undefined;
  if (data.breakdown !== undefined) {
    const raw = object(data.breakdown);
    if (CASHBOOK_BREAKDOWN_KEYS.some(key => typeof raw[key] !== 'number' || !Number.isFinite(raw[key]))) throw new Error('API sổ quỹ trả về tổng chi tiết không hợp lệ.');
    breakdown = Object.fromEntries(CASHBOOK_BREAKDOWN_KEYS.map(key => [key, raw[key]])) as CashbookBreakdown;
    const sum = (keys: (keyof CashbookBreakdown)[]) => keys.reduce((total, key) => total + breakdown![key], 0);
    if (Math.abs(sum(CASHBOOK_BREAKDOWN_KEYS.filter(key => key.endsWith('_income'))) - incomePage.amount) > 0.01 ||
        Math.abs(breakdown.deposit_refund_expense + breakdown.rental_refund_expense + breakdown.other_expense - expensePage.amount) > 0.01) throw new Error('Tổng chi tiết sổ quỹ không khớp tổng thu / chi.');
  }
  return { total: Number(data.total), income: incomePage, expense: expensePage, actors: (data.actors as [string, string][]).sort((a, b) => a[1].localeCompare(b[1], 'vi')), ...(breakdown ? { breakdown } : {}) };
}
// Full filtered records are fetched only when the user explicitly exports them.
export async function loadCashbookExport(filters: CashbookFilters, storeId: string): Promise<CashbookRow[]> {
  const query = cashbookQuery(filters, storeId); query.set('mode', 'all');
  const rows = await readCashbook(query);
  if (!Array.isArray(rows)) throw new Error('API xuất sổ quỹ trả về cấu trúc không hợp lệ.');
  return rows.map(item => mapCashbookRow(object(item)));
}
export async function loadCashbookDeleteIds(filters: CashbookFilters, storeId: string, type: VoucherType, signal?: AbortSignal): Promise<{ id: string; amount: number }[]> {
  const query = cashbookQuery(filters, storeId); query.set('mode', 'ids'); query.set('type', type);
  const rows = await readCashbook(query, signal);
  if (!Array.isArray(rows)) throw new Error('API trả về danh sách phiếu không hợp lệ.');
  return rows.map(item => {
    const raw = object(item), id = optionalText(raw.id), amount = Number(raw.amount);
    if (!id || !/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || !Number.isFinite(amount)) throw new Error('API trả về ID hoặc số tiền phiếu không hợp lệ.');
    return { id, amount };
  });
}
export interface CashbookAccount {
  key: string; kind: 'bank' | 'cash'; id: string; label: string; store_id?: string; store_name?: string; owner_type: string; status: string;
  name?: string; bank_name?: string; owner_name?: string; account_number?: string;
  opening_balance: number; income: number; expense: number; balance: number; voucher_count: number;
}
export interface CashbookAccountEdits { status: 'active' | 'inactive'; opening_balance: number; store_id?: string; owner_type?: 'company' | 'store'; name?: string; bank_name?: string; owner_name?: string; account_number?: string }
const amount = (value: unknown, field: string): number => {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) throw new Error(`API trả về ${field} tài khoản không hợp lệ.`);
  return parsed;
};
export function mapCashbookAccount(raw: ApiRecord): CashbookAccount {
  const id = optionalText(raw.id), kind = raw.kind;
  if (!id || (kind !== 'bank' && kind !== 'cash')) throw new Error('API trả về tài khoản thiếu ID hoặc loại.');
  return { key: `${kind}:${id}`, kind, id, label: optionalText(raw.label) || (kind === 'cash' ? `Két tiền mặt #${id}` : `Tài khoản #${id}`),
    name: optionalText(raw.name), bank_name: optionalText(raw.bank_name), owner_name: optionalText(raw.owner_name), account_number: optionalText(raw.account_number),
    store_id: optionalText(raw.store_id), store_name: optionalText(raw.store_name), owner_type: String(raw.owner_type || ''), status: String(raw.status || ''),
    opening_balance: amount(raw.opening_balance, 'số dư đầu kỳ'), income: amount(raw.income, 'tổng thu'), expense: amount(raw.expense, 'tổng chi'),
    balance: amount(raw.balance, 'số dư'), voucher_count: amount(raw.voucher_count, 'số phiếu') };
}
export async function loadCashbookAccounts(baseUrl = '/api', signal?: AbortSignal): Promise<CashbookAccount[]> {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/auth/cashbook/accounts`, { method: 'GET', cache: 'no-store', signal, credentials: 'same-origin', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Không tải được danh sách tài khoản (HTTP ${response.status}).`);
  const envelope = object(await response.json());
  if (envelope.status !== 'success' || !Array.isArray(envelope.data)) throw new Error('API tài khoản trả về cấu trúc chưa được hỗ trợ.');
  return envelope.data.map(item => mapCashbookAccount(object(item)));
}
async function writeCashbookAccount(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: CashbookAccountEdits | Pick<CashbookAccountEdits,'status'>) {
  const response = await fetch(`/api/auth/cashbook/accounts/${path}`, { method, cache: 'no-store', credentials: 'same-origin',
    headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const envelope = object(await response.json().catch(() => ({})));
  if (!response.ok || envelope.status !== 'success') throw new Error(optionalText(envelope.message) || `Không thực hiện được thao tác (HTTP ${response.status}).`);
}
export interface CashbookAccountVoucher { id: string; date?: string; time?: string; type: 'income' | 'expense'; amount: number; user_name?: string; contract_code?: string; content?: string }
export async function loadCashbookAccountVouchers(account: CashbookAccount, range: { from: string; to: string }, signal?: AbortSignal): Promise<CashbookAccountVoucher[]> {
  const query = new URLSearchParams(); if (range.from) query.set('from', range.from); if (range.to) query.set('to', range.to);
  const response = await fetch(`/api/auth/cashbook/accounts/${account.kind}/${encodeURIComponent(account.id)}/transactions?${query}`, { cache: 'no-store', signal, credentials: 'same-origin', headers: { Accept: 'application/json' } });
  const envelope = object(await response.json().catch(() => ({})));
  if (!response.ok || envelope.status !== 'success' || !Array.isArray(envelope.data)) throw new Error(optionalText(envelope.message) || `Không tải được danh sách thu chi (HTTP ${response.status}).`);
  return envelope.data.map(item => {
    const raw = object(item), id = optionalText(raw.id), type = String(raw.type || '');
    if (!id || !['in', 'addon', 'out'].includes(type)) throw new Error('API trả về phiếu của tài khoản không hợp lệ.');
    return { id, ...cashbookDateTime(raw.created_at), type: type === 'out' ? 'expense' : 'income', amount: amount(raw.amount, 'số tiền'),
      user_name: optionalText(raw.user_name), contract_code: optionalText(raw.contract_code), content: optionalText(raw.content) } as CashbookAccountVoucher;
  });
}
const accountPath = (account: CashbookAccount) => `${account.kind}/${encodeURIComponent(account.id)}`;
export const createCashbookAccount = (kind: CashbookAccount['kind'], values: CashbookAccountEdits) => writeCashbookAccount(kind, 'POST', values);
export const updateCashbookAccount = (account: CashbookAccount, edits: CashbookAccountEdits) => writeCashbookAccount(accountPath(account), 'PATCH', edits);
export const deleteCashbookAccount = (account: CashbookAccount) => writeCashbookAccount(accountPath(account), 'DELETE');
export const setCashbookAccountStatus=(account:CashbookAccount,status:'active'|'inactive')=>writeCashbookAccount(`${accountPath(account)}/status`,'PATCH',{status});

// Verified in apps/api/src/modules/finance/finance.controller.ts. This adapter performs GET only.
export const CASHBOOK_ENDPOINT = '/auth/transactions';
export function createApiCashbookRepository(baseUrl = '/api'): CashbookRepository {
  return { async load(signal) {
    const records: CashbookRow[] = []; const ids = new Set<string>();
    for (let page = 1; page <= 1000; page++) {
      signal?.throwIfAborted();
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') || localStorage.getItem('jwt_token') : null;
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}${CASHBOOK_ENDPOINT}?${new URLSearchParams({ page: String(page), limit: '100' })}`, {
        method: 'GET', cache: 'no-store', signal, credentials: 'same-origin', headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (!response.ok) throw new Error(`Không tải được sổ quỹ (HTTP ${response.status}). Kiểm tra kết nối và quyền tra cứu.`);
      const envelope = object(await response.json());
      if (envelope.status !== 'success') throw new Error('API sổ quỹ trả về trạng thái lỗi.');
      const payload = envelope.data; const pagination = object(payload);
      const rows = Array.isArray(payload) ? payload : pagination.data;
      if (!Array.isArray(rows)) throw new Error('API sổ quỹ trả về cấu trúc chưa được hỗ trợ.');
      for (const item of rows) {
        const row = mapCashbookRow(object(item));
        if (ids.has(row.id)) throw new Error('API trả về ID phiếu trùng giữa các trang. Hãy tải lại danh sách.');
        ids.add(row.id); records.push(row);
      }
      if (Array.isArray(payload)) return records;
      if (pagination.last_page == null || pagination.total == null) throw new Error('API sổ quỹ thiếu thông tin phân trang hợp lệ.');
      const lastPage = Number(pagination.last_page);
      const total = Number(pagination.total);
      if (!Number.isSafeInteger(lastPage) || lastPage < 1 || !Number.isSafeInteger(total) || total < 0) throw new Error('API sổ quỹ thiếu thông tin phân trang hợp lệ.');
      if (page >= lastPage) {
        if (records.length !== total) throw new Error('API sổ quỹ trả về số phiếu không khớp tổng phân trang. Hãy tải lại.');
        return records;
      }
      if (!rows.length || records.length >= total) throw new Error('API sổ quỹ trả về phân trang không nhất quán.');
    }
    throw new Error('Sổ quỹ vượt giới hạn tải. Cần tích hợp phân trang server cho dữ liệu lớn.');
  } };
}
