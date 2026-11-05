import type { MobileCollectionMethod } from "./mobile-contract";

/** Preparation only. Saving/collecting remains unavailable until durable recovery and bill uploads are integrated. */
export interface MobileRenewalPreparation {
  id: number;
  code: string;
  status: string;
  storeId: number;
  revision: string;
  available: boolean;
  blockedReason: string | null;
  nextVersion: number;
  totalAmount: number | null;
  rentalPaid: number | null;
  rentalRemaining: number | null;
  items: {
    page: number;
    pages: number;
    total: number;
    rows: { id: number; vehicleId: number; name: string; license: string; revision: string; returnAt: string | null; dailyPrice: number | null; renewalAmount: number | null; startedAt?: string | null; completedAt?: string | null }[];
  };
  accounts: { id: number; method: MobileCollectionMethod; label: string }[];
  evidence: { requiredForCollection: true; slot: string; present: boolean };
  observedAt: string;
  backfill?: true;
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const positive = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const amount = (value: unknown) => value === null || (typeof value === "number" && Number.isSafeInteger(value) && value >= 0);
const text = (value: unknown, length = 4000): value is string => typeof value === "string" && value.length <= length;
export function isMobileRenewalPreparation(value: unknown): value is MobileRenewalPreparation {
  if (!object(value) || !positive(value.id) || !positive(value.storeId) || !text(value.code) || !text(value.status, 60) ||
    !text(value.revision, 20) || !/^[1-9]\d{0,19}$/.test(value.revision) || !positive(value.nextVersion) || value.nextVersion < 2 ||
    (value.backfill !== undefined && value.backfill !== true) || typeof value.available !== "boolean" || !(value.blockedReason === null || text(value.blockedReason)) ||
    value.available !== (value.blockedReason === null) || ![value.totalAmount, value.rentalPaid, value.rentalRemaining].every(amount) ||
    !text(value.observedAt, 40) || !Number.isFinite(Date.parse(value.observedAt))) return false;
  const items = value.items, evidence = value.evidence, accounts = value.accounts;
  return object(items) && positive(items.page) && positive(items.pages) && items.page <= items.pages &&
    typeof items.total === "number" && Number.isSafeInteger(items.total) && items.total >= 0 && items.pages === Math.max(1, Math.ceil(items.total / 25)) &&
    Array.isArray(items.rows) && items.rows.length === Math.min(25, Math.max(0, items.total - (items.page - 1) * 25)) &&
    items.rows.every(row => object(row) && positive(row.id) && positive(row.vehicleId) && text(row.name) && text(row.license) &&
      text(row.revision, 20) && /^[1-9]\d{0,19}$/.test(row.revision) &&
      (row.returnAt === null || (text(row.returnAt, 40) && Number.isFinite(Date.parse(row.returnAt)))) && amount(row.dailyPrice) && amount(row.renewalAmount) && [row.startedAt,row.completedAt].every(v => v === undefined || v === null || text(v,40) && Number.isFinite(Date.parse(v)))) &&
    new Set(items.rows.map(row => row.id)).size === items.rows.length &&
    Array.isArray(accounts) && accounts.length <= 10000 && accounts.every(row => object(row) && positive(row.id) && text(row.label) && ["cash", "transfer", "company_transfer"].includes(String(row.method))) &&
    new Set(accounts.map(row => `${row.method}:${row.id}`)).size === accounts.length && object(evidence) &&
    evidence.requiredForCollection === true && evidence.slot === `renewal-${value.nextVersion}-document-1` && typeof evidence.present === "boolean";
}
