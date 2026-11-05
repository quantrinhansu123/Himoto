export const CASHBOOK_DELETE_OPERATION = "cashbook.delete";
export const CASHBOOK_DELETE_BATCH_SIZE = 500;
export interface VoucherDeleteRow { id: string; amount: number }
export interface VoucherDeleteSelection { type: "income" | "expense"; rows: VoucherDeleteRow[] }
export interface VoucherDeletion { key: string; operation: "cashbook.delete"; deletedCount: number; receiptVersion: 1; replayed: boolean }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
export function isVoucherDeleteSelection(value: unknown): value is VoucherDeleteSelection {
  return object(value) && ["income", "expense"].includes(String(value.type)) && Array.isArray(value.rows)
    && value.rows.every(row => object(row) && typeof row.id === "string" && /^[1-9]\d{0,14}$/.test(row.id) && typeof row.amount === "number" && Number.isFinite(row.amount))
    && new Set(value.rows.map(row => row.id)).size === value.rows.length;
}
export function isVoucherDeletion(value: unknown): value is VoucherDeletion {
  return object(value) && typeof value.key === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value.key)
    && value.operation === CASHBOOK_DELETE_OPERATION && Number.isSafeInteger(value.deletedCount) && Number(value.deletedCount) > 0 && Number(value.deletedCount) <= CASHBOOK_DELETE_BATCH_SIZE
    && value.receiptVersion === 1 && typeof value.replayed === "boolean";
}
