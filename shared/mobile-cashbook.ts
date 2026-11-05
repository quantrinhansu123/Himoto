import type { MobileWriteReceipt } from "./mobile-contract";
import { CASHBOOK_BREAKDOWN_KEYS, type CashbookBreakdown } from "./cashbook-summary";
export { CASHBOOK_BREAKDOWN_KEYS, cashbookRentalTotals, type CashbookBreakdown } from "./cashbook-summary";
export { cashbookAccountValues, validateCashbookAccount, type CashbookAccountKind, type CashbookAccountInput } from "./cashbook-account";
export interface MobileCashbookVoucher {
  id: string; date: string; time: string; type: "income" | "expense"; actorId: string; actorName: string;
  reason: string; content: string; storeId: string; storeName: string; amount: number | null;
  contractId: string; contractCode: string; paymentMethod: string; account: string;
}
export interface MobileCashbookPage {
  total: number; income: MobileCashbookVoucherPage; expense: MobileCashbookVoucherPage;
  actors: [string, string][]; breakdown: CashbookBreakdown;
}
export interface MobileCashbookVoucherPage { rows: MobileCashbookVoucher[]; total: number; amount: number; page: number; pageSize: number }
export interface MobileCashbookAccount {
  id: number; kind: "bank" | "cash"; revision: string; label: string; storeId: number | null; storeName: string; ownerType: string; status: string;
  name: string; bankName: string; ownerName: string; accountNumber: string;
  opening: number; income: number; expense: number; balance: number; voucherCount: number;
}
export interface MobileCashbookAccounts { rows: MobileCashbookAccount[] }
export interface MobileCashbookTransactions { kind: "bank" | "cash"; id: number; rows: { id: string; date: string; time: string; type: "income" | "expense"; amount: number; actorName: string; contractCode: string; content: string }[]; sourceLimit: number }
export interface MobileCashbookAccountResult { key: string; operation: string; kind: "bank" | "cash"; receipt: MobileWriteReceipt; current: MobileCashbookAccount | null; deleted: boolean }
export const cashbookAccountOperations = (kind: "bank" | "cash", id: string) => [`${kind}.update:${id}`, `${kind}.status:${id}`, `${kind}.delete:${id}`];
export const CASHBOOK_SORTS = [{ value: "date", label: "Ngày" }, { value: "time", label: "Giờ" }, { value: "id", label: "ID" }, { value: "type", label: "Loại phiếu" }, { value: "actor_name", label: "Người thực hiện" }, { value: "amount", label: "Số tiền" }, { value: "contract_code", label: "Mã hợp đồng" }, { value: "payment_method", label: "Hình thức thanh toán" }, { value: "account", label: "Tài khoản nhận / chi" }, { value: "store_name", label: "Cơ sở" }, { value: "reason", label: "Lý do" }, { value: "content", label: "Nội dung" }];
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const id = (value: unknown) => Number.isSafeInteger(value) && Number(value) > 0;
const numericId = (value: unknown) => typeof value === "string" && /^[1-9]\d{0,14}$/.test(value);
const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value);
const count = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
export function isCashbookVoucher(value: unknown): value is MobileCashbookVoucher {
  return object(value) && numericId(value.id) && ["date", "time", "actorId", "actorName", "reason", "content", "storeId", "storeName", "contractId", "contractCode", "paymentMethod", "account"].every(key => typeof value[key] === "string")
    && (value.type === "income" || value.type === "expense") && (value.amount === null || finite(value.amount));
}
export function isCashbookPage(value: unknown): value is MobileCashbookPage {
  if (!object(value) || !count(value.total) || !object(value.breakdown) || !CASHBOOK_BREAKDOWN_KEYS.every(key => finite((value.breakdown as Record<string, unknown>)[key]))) return false;
  const page = (value: unknown) => object(value) && Array.isArray(value.rows) && id(value.pageSize) && Number(value.pageSize) <= 50 && value.rows.length <= Number(value.pageSize)
    && value.rows.every(isCashbookVoucher) && count(value.total) && id(value.page) && Number(value.page) <= Math.max(1, Math.ceil(Number(value.total) / Number(value.pageSize))) && finite(value.amount);
  if (!page(value.income) || !page(value.expense) || !Array.isArray(value.actors) || !value.actors.every(row => Array.isArray(row) && row.length === 2 && row.every(item => typeof item === "string"))) return false;
  const result = value as unknown as MobileCashbookPage;
  const income = CASHBOOK_BREAKDOWN_KEYS.filter(key => key.endsWith("_income")).reduce((sum, key) => sum + result.breakdown[key], 0);
  const expense = result.breakdown.deposit_refund_expense + result.breakdown.rental_refund_expense + result.breakdown.other_expense;
  return Math.abs(income - result.income.amount) <= 0.01 && Math.abs(expense - result.expense.amount) <= 0.01;
}
export function isCashbookAccount(value: unknown): value is MobileCashbookAccount {
  return object(value) && id(value.id) && ["bank", "cash"].includes(String(value.kind)) && typeof value.revision === "string" && /^[1-9]\d{0,19}$/.test(value.revision)
    && ["label", "storeName", "ownerType", "status", "name", "bankName", "ownerName", "accountNumber"].every(key => typeof value[key] === "string")
    && (value.storeId === null || count(value.storeId)) && ["opening", "income", "expense", "balance"].every(key => finite(value[key])) && count(value.voucherCount);
}
export function isCashbookAccounts(value: unknown): value is MobileCashbookAccounts { return object(value) && Array.isArray(value.rows) && value.rows.every(isCashbookAccount); }
export function isCashbookTransactions(value: unknown): value is MobileCashbookTransactions {
  return object(value) && id(value.id) && ["bank", "cash"].includes(String(value.kind)) && value.sourceLimit === 2000 && Array.isArray(value.rows) && value.rows.length <= 2000
    && value.rows.every(row => object(row) && numericId(row.id) && ["date", "time", "actorName", "contractCode", "content"].every(key => typeof row[key] === "string") && ["income", "expense"].includes(String(row.type)) && finite(row.amount));
}
export function isCashbookAccountResult(value: unknown): value is MobileCashbookAccountResult {
  return object(value) && typeof value.key === "string" && /^[0-9a-f-]{36}$/.test(value.key) && typeof value.operation === "string" && /^(bank|cash)\.(create|(?:update|status|delete):[1-9]\d{0,14})$/.test(value.operation)
    && value.operation.startsWith(String(value.kind) + ".") && object(value.receipt) && id(value.receipt.id) && typeof value.receipt.revision === "string" && /^[1-9]\d{0,19}$/.test(value.receipt.revision) && typeof value.receipt.replayed === "boolean" && typeof value.deleted === "boolean"
    && (value.current === null ? value.deleted && value.operation.includes(".delete:") : !value.deleted && isCashbookAccount(value.current) && value.current.id === value.receipt.id && value.current.kind === value.kind)
    && (!value.operation.includes(":") || Number(value.operation.split(":")[1]) === value.receipt.id);
}
