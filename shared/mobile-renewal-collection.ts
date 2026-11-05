import type { MobileCollectionMethod, MobileWriteReceipt } from "./mobile-contract";

export interface MobileRenewalCollectionInput {
  version: number; snapshot: string; revision: string; expected_total: number; expected_remaining: number;
  amount: string; method: MobileCollectionMethod; account_id: number; paid_at: string; note: string;
  bill_revision: string; acknowledge_overpayment?: true;
}
export interface MobileRenewalCollectionReceipt extends MobileWriteReceipt {
  version: number; transactionId: number; amount: number; periodAmount: number; collectedBefore: number; remainingAfter: number;
  itemId: number; vehicleId: number; beforeReturnAt: string | null; returnAt: string; periodCreatedAt: string | null;
  method: MobileCollectionMethod; accountId: number; paidAt: string; billRevision: string;
  current: boolean; billCurrent: boolean;
}

export interface MobileRenewalCollectionPreparation {
  id: number; code: string; storeId: number; revision: string;
  totalAmount: number | null; rentalPaid: number | null; rentalRemaining: number | null;
  canWrite: boolean; available: boolean; blockedReason: string | null;
  period: {
    orderId: number; version: number; itemId: number; vehicleId: number;
    vehicleName: string; license: string; beforeReturnAt: string | null; returnAt: string; createdAt: string | null;
    amount: number; collected: number; remaining: number; snapshot: string;
  };
  accounts: { id: number; method: MobileCollectionMethod; label: string }[];
  observedAt: string;
}
export interface MobileRenewalPeriods {
  id: number; code: string; canWrite: boolean; available: boolean; blockedReason: string | null;
  page: number; pages: number; total: number; rows: MobileRenewalCollectionPreparation["period"][];
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const positive = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const money = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 9_999_999_999_999;
const text = (value: unknown): value is string => typeof value === "string" && value.length <= 4000;
const time = (value: unknown): value is string => typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value));
function isPeriod(period: unknown, id: number): period is MobileRenewalCollectionPreparation["period"] {
  return object(period) && period.orderId === id && positive(period.version) && period.version >= 2 && period.version <= 999999999999999 &&
    positive(period.itemId) && positive(period.vehicleId) && text(period.vehicleName) && text(period.license) &&
    (period.beforeReturnAt === null || time(period.beforeReturnAt)) && time(period.returnAt) &&
    (period.createdAt === null || time(period.createdAt)) && (period.beforeReturnAt !== null || period.createdAt !== null) &&
    money(period.amount) && money(period.collected) && money(period.remaining) && period.collected <= period.amount && period.remaining === period.amount - period.collected &&
    typeof period.snapshot === "string" && /^[a-f0-9]{64}$/.test(period.snapshot);
}
export function isMobileRenewalPeriods(value: unknown): value is MobileRenewalPeriods {
  const rows = object(value) && Array.isArray(value.rows) ? value.rows : null;
  return object(value) && positive(value.id) && text(value.code) && typeof value.canWrite === "boolean" && typeof value.available === "boolean" &&
    (value.blockedReason === null || text(value.blockedReason)) && value.available === (value.blockedReason === null) &&
    positive(value.page) && positive(value.pages) && value.page <= value.pages && money(value.total) && value.total <= 10000 &&
    value.pages === Math.max(1, Math.ceil(value.total / 25)) && Array.isArray(value.rows) &&
    value.rows.length === Math.max(0, Math.min(25, value.total - (value.page - 1) * 25)) &&
    value.rows.every(period => isPeriod(period, value.id as number)) &&
    value.rows.every((period, index) => index === 0 || rows![index - 1].version > period.version);
}
export function isMobileRenewalCollectionReceipt(value: unknown): value is MobileRenewalCollectionReceipt {
  return object(value) && positive(value.id) && typeof value.revision === "string" && /^[1-9]\d{0,19}$/.test(value.revision) && typeof value.replayed === "boolean" &&
    positive(value.version) && value.version >= 2 && value.version <= 999999999999999 && positive(value.transactionId) && positive(value.itemId) && positive(value.vehicleId) &&
    money(value.amount) && value.amount > 0 && money(value.periodAmount) && money(value.collectedBefore) && money(value.remainingAfter) &&
    value.amount + value.collectedBefore <= value.periodAmount && value.remainingAfter === value.periodAmount - value.collectedBefore - value.amount &&
    (value.beforeReturnAt === null || time(value.beforeReturnAt)) && time(value.returnAt) && (value.periodCreatedAt === null || time(value.periodCreatedAt)) &&
    (value.beforeReturnAt !== null || value.periodCreatedAt !== null) &&
    ["cash", "transfer", "company_transfer"].includes(String(value.method)) && positive(value.accountId) && time(value.paidAt) &&
    typeof value.billRevision === "string" && /^[1-9]\d{0,19}$/.test(value.billRevision) && typeof value.current === "boolean" && typeof value.billCurrent === "boolean";
}
export function isMobileRenewalCollectionPreparation(value: unknown): value is MobileRenewalCollectionPreparation {
  if (!object(value) || !positive(value.id) || !positive(value.storeId) || !text(value.code) ||
    typeof value.revision !== "string" || !/^[1-9]\d{0,19}$/.test(value.revision) ||
    ![value.totalAmount, value.rentalPaid, value.rentalRemaining].every(amount => amount === null || money(amount)) ||
    typeof value.canWrite !== "boolean" || typeof value.available !== "boolean" || !(value.blockedReason === null || text(value.blockedReason)) ||
    value.available !== (value.blockedReason === null) || !time(value.observedAt)) return false;
  const period = value.period, accounts = value.accounts;
  return object(period) && period.orderId === value.id && positive(period.version) && period.version >= 2 && period.version <= 999999999999999 &&
    positive(period.itemId) && positive(period.vehicleId) && text(period.vehicleName) && text(period.license) &&
    (period.beforeReturnAt === null || time(period.beforeReturnAt)) && time(period.returnAt) &&
    (period.createdAt === null || time(period.createdAt)) && (period.beforeReturnAt !== null || period.createdAt !== null) &&
    money(period.amount) && money(period.collected) && money(period.remaining) && period.collected <= period.amount && period.remaining === period.amount - period.collected &&
    (!value.available || period.remaining > 0 && value.totalAmount !== null && value.rentalPaid !== null && value.rentalRemaining !== null) &&
    typeof period.snapshot === "string" && /^[a-f0-9]{64}$/.test(period.snapshot) &&
    Array.isArray(accounts) && accounts.length <= 10000 && accounts.every(account => object(account) && positive(account.id) &&
      ["cash", "transfer", "company_transfer"].includes(String(account.method)) && text(account.label)) &&
    new Set(accounts.map(account => `${account.method}:${account.id}`)).size === accounts.length;
}
