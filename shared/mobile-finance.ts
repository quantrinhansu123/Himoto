import type { MobileCollectionMethod, MobileWriteReceipt } from "./mobile-contract";

export const MOBILE_PAYMENT_PURPOSES = ["debt", "renewal", "deposit", "extra", "deposit_refund", "rental_refund"] as const;
export type MobilePaymentPurpose = (typeof MOBILE_PAYMENT_PURPOSES)[number];
export const PAYMENT_PURPOSE_LABELS: Record<MobilePaymentPurpose, string> = {
  debt: "Thu tiền thuê / công nợ", deposit: "Thu cọc còn thiếu", extra: "Thu thêm khoản khác",
  renewal: "Thu tiền và gia hạn một hoặc nhiều xe",
  deposit_refund: "Trả cọc cho khách", rental_refund: "Hoàn tiền thuê trả sớm",
};
export interface MobilePaymentInput {
  revision: string;
  expected_total: number | null;
  expected_remaining: number | null;
  purpose: MobilePaymentPurpose;
  amount: string;
  method: MobileCollectionMethod;
  account_id: number;
  paid_at: string;
  note: string;
  acknowledge_overpayment?: true;
  items?: {item_id:number;item_revision:string;return_at:string;amount:string}[];
}
export interface MobilePaymentReceipt extends MobileWriteReceipt { transactionId: number }
export interface MobileFinanceContext {
  id: number; code: string; status: string; storeId: number; revision: string; canWrite: boolean;
  totalAmount: number | null; rentalPaid: number | null; rentalRemaining: number | null;
  depositPaid: number; depositRefunded: number; depositHeld: number; depositRemaining: number; rentalRefundable: number;
  holdActive: boolean; completedFromHold: boolean;
  purposes: MobilePaymentPurpose[];
  accounts: { id: number; method: MobileCollectionMethod; label: string }[];
  billing: null | {
    expectedTotal: number; periodCount: number; paidPeriods: number;
    dueAmount: number | null; remainingToOwn: number | null; nextDueAt: string | null;
  };
  history: {
    page: number; pages: number; total: number;
    rows: { id: number; direction: "in" | "out"; deposit: boolean; amount: number; paidAt: string;
      method: string; account: string; note: string; noteTruncated: boolean; actor: string;
      status: "approved" | "cancelled"; renewalVersion: number | null }[];
  };
  observedAt: string;
  renewalItems?: {id:number;vehicleId:number;name:string;license:string;revision:string;returnAt:string|null;dailyPrice:number|null;renewalAmount:number|null}[];
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const positive = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;
const nonnegative = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const money = (v: unknown) => v === null || nonnegative(v);
const text = (v: unknown, max = 4000): v is string => typeof v === "string" && v.length <= max;
export const validPaymentRevision = (v: unknown): v is string => typeof v === "string" && /^[1-9]\d{0,19}$/.test(v);
export function isMobilePaymentReceipt(v: unknown): v is MobilePaymentReceipt {
  return object(v) && positive(v.id) && positive(v.transactionId) && validPaymentRevision(v.revision) && typeof v.replayed === "boolean";
}
export function isMobileFinanceContext(v: unknown): v is MobileFinanceContext {
  if (!object(v) || !positive(v.id) || !positive(v.storeId) || !text(v.code) || !text(v.status, 60) || !validPaymentRevision(v.revision) ||
      !["canWrite", "holdActive", "completedFromHold"].every((key) => typeof v[key] === "boolean") ||
      !["totalAmount", "rentalPaid", "rentalRemaining"].every((key) => money(v[key])) ||
      !["depositPaid", "depositRefunded", "depositHeld", "depositRemaining", "rentalRefundable"].every((key) => nonnegative(v[key])) ||
      !text(v.observedAt, 40) || !Number.isFinite(Date.parse(v.observedAt)) ||
      !Array.isArray(v.purposes) || !v.purposes.every((p) => MOBILE_PAYMENT_PURPOSES.includes(p)) || new Set(v.purposes).size !== v.purposes.length ||
      !Array.isArray(v.accounts) || v.accounts.length > 10000 || !v.accounts.every((a) => object(a) && positive(a.id) && text(a.label) && ["cash", "transfer", "company_transfer"].includes(String(a.method))) ||
      new Set(v.accounts.map((a) => `${a.method}:${a.id}`)).size !== v.accounts.length) return false;
  if(v.renewalItems!==undefined&&(!Array.isArray(v.renewalItems)||v.renewalItems.length>10000||!v.renewalItems.every(r=>object(r)&&positive(r.id)&&positive(r.vehicleId)&&text(r.name)&&text(r.license)&&validPaymentRevision(r.revision)&&(r.returnAt===null||text(r.returnAt,40)&&Number.isFinite(Date.parse(r.returnAt)))&&money(r.dailyPrice)&&money(r.renewalAmount))||new Set(v.renewalItems.map(r=>r.id)).size!==v.renewalItems.length))return false;
  const billing = v.billing;
  if (billing !== null && (!object(billing) || !nonnegative(billing.expectedTotal) || !positive(billing.periodCount) || !nonnegative(billing.paidPeriods) || billing.paidPeriods > billing.periodCount ||
      !money(billing.dueAmount) || !money(billing.remainingToOwn) || !(billing.nextDueAt === null || text(billing.nextDueAt, 40)))) return false;
  const history = v.history;
  return object(history) && positive(history.page) && positive(history.pages) && history.page <= history.pages && nonnegative(history.total) &&
    Array.isArray(history.rows) && history.rows.length <= 25 && history.rows.every((r) => object(r) && positive(r.id) && ["in", "out"].includes(String(r.direction)) &&
      typeof r.deposit === "boolean" && nonnegative(r.amount) && text(r.paidAt, 40) && Number.isFinite(Date.parse(r.paidAt)) &&
      ["method", "account", "note", "actor"].every((key) => text(r[key])) && typeof r.noteTruncated === "boolean" && ["approved", "cancelled"].includes(String(r.status)) &&
      (r.renewalVersion === null || positive(r.renewalVersion))) && new Set(history.rows.map((r) => r.id)).size === history.rows.length;
}

export function paymentImpact(context: Pick<MobileFinanceContext, "totalAmount" | "rentalRemaining">, purpose: MobilePaymentPurpose, amount: number) {
  const overpayment = purpose === "debt" && context.rentalRemaining !== null && amount > context.rentalRemaining;
  const totalIncrease = purpose === "extra" || purpose === "renewal" ? amount : overpayment && context.rentalRemaining! > 0 ? amount - context.rentalRemaining! : 0;
  return { overpayment, totalIncrease, totalAfter: context.totalAmount === null ? null : context.totalAmount + totalIncrease };
}
