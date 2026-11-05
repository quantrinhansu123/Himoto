export interface MobileHistoryChange {
  id: string; kind: string; at: string; actor: string; title: string; detail: string; amount: number | null;
  version?: { label: string; return_at: string | null; total: number | null; paid: number | null };
}
export interface MobileHistoryCashflow { id: number; at: string; type: 'income' | 'expense'; reason: string; note: string; amount: number | null; method: string; account: string; actor: string; status: string; status_code: string; category: string }
export interface MobileContractHistory {
  id: number; code: string; tab: 'changes' | 'cashflow'; search: string; page: number; pages: number; total: number; changeCount: number; cashflowCount: number;
  changes: MobileHistoryChange[]; cashflow: MobileHistoryCashflow[];
  receipts: { received: number; spent: number; net: number; receipt_count: number; rental_received: number; renewal_received: number; other_received: number; rental_refunded: number; deposit_received: number; deposit_refunded: number; deposit_held: number };
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const integer = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v);
const nonnegative = (v: unknown): v is number => integer(v) && v >= 0;
const amount = (v: unknown) => v === null || integer(v);
const text = (v: unknown): v is string => typeof v === 'string';
const nullableText = (v: unknown) => v === null || text(v);
export function isMobileContractHistory(v: unknown): v is MobileContractHistory {
  if (!object(v) || !integer(v.id) || v.id <= 0 || !text(v.code) || !text(v.search) || !['changes', 'cashflow'].includes(String(v.tab)) || !integer(v.page) || !integer(v.pages) || v.page < 1 || v.page > v.pages || !nonnegative(v.total) || v.pages !== Math.max(1, Math.ceil(v.total / 25)) || !nonnegative(v.changeCount) || !nonnegative(v.cashflowCount)) return false;
  if (!Array.isArray(v.changes) || !Array.isArray(v.cashflow) || v.changes.length + v.cashflow.length !== Math.max(0, Math.min(25, v.total - (v.page - 1) * 25)) || (v.tab === 'changes' ? v.cashflow.length : v.changes.length)) return false;
  return v.changes.every(c => object(c) && ['id', 'kind', 'at', 'actor', 'title', 'detail'].every(k => text(c[k])) && amount(c.amount) && (c.version === undefined || object(c.version) && text(c.version.label) && nullableText(c.version.return_at) && amount(c.version.total) && amount(c.version.paid))) &&
    v.cashflow.every(c => object(c) && integer(c.id) && c.id > 0 && ['at', 'reason', 'note', 'method', 'account', 'actor', 'status', 'status_code', 'category'].every(k => text(c[k])) && ['income', 'expense'].includes(String(c.type)) && amount(c.amount)) &&
    object(v.receipts) && ['received', 'spent', 'receipt_count', 'rental_received', 'renewal_received', 'other_received', 'rental_refunded', 'deposit_received', 'deposit_refunded', 'deposit_held'].every(k => nonnegative((v.receipts as Record<string, unknown>)[k])) && integer(v.receipts.net);
}
