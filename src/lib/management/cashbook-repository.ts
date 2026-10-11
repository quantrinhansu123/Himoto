import { createCashbookFixtures } from '@/fixtures/cashbook-data';
import { CashbookRow } from './cashbook';

export interface CashbookRepository { load(signal?: AbortSignal): Promise<CashbookRow[]> }
type ApiRecord = Record<string, unknown>;
const object = (value: unknown): ApiRecord => value && typeof value === 'object' && !Array.isArray(value) ? value as ApiRecord : {};
const optionalText = (value: unknown): string | undefined => value == null || value === '' ? undefined : String(value);

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
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(local);
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
async function writeCashbookAccount(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: CashbookAccountEdits) {
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
