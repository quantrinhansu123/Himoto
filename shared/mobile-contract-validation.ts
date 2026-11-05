import type { MobileContractPreparation } from "./mobile-contract";
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, max = 4000): v is string =>
  typeof v === "string" && v.length <= max;
const positive = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v > 0;
const money = (v: unknown) =>
  v === null || (typeof v === "number" && Number.isSafeInteger(v) && v >= 0);
export const contractFields = (v: unknown): v is Record<string, string> =>
  object(v) &&
  Object.keys(v).length <= 80 &&
  Object.entries(v).every(
    ([key, value]) => /^[a-zA-Z0-9_]{1,100}$/.test(key) && text(value, 1000),
  );
export function isMobileContractPreparation(
  v: unknown,
): v is MobileContractPreparation {
  return (
    object(v) &&
    positive(v.id) &&
    positive(v.storeId) &&
    text(v.storeName) &&
    text(v.code) &&
    text(v.status, 60) &&
    typeof v.revision === "string" &&
    /^[1-9]\d{0,19}$/.test(v.revision) &&
    ["canFinalize", "requiresManager", "reservation", "historical"].every(
      (key) => typeof v[key] === "boolean",
    ) &&
    text(v.customerName) &&
    text(v.startsAt, 40) &&
    text(v.endsAt, 40) &&
    [v.totalAmount, v.depositAmount, v.rentalPaid].every(money) &&
    money(v.depositPaid) &&
    v.depositPaid !== null &&
    Array.isArray(v.vehicles) &&
    v.vehicles.length <= 50 &&
    v.vehicles.every(
      (row) => object(row) && positive(row.id) && text(row.label),
    ) &&
    new Set(v.vehicles.map((row) => row.id)).size === v.vehicles.length &&
    Array.isArray(v.accounts) &&
    v.accounts.length <= 10000 &&
    v.accounts.every(
      (row) =>
        object(row) &&
        positive(row.id) &&
        text(row.label) &&
        ["cash", "transfer", "company_transfer"].includes(String(row.method)),
    ) &&
    new Set(v.accounts.map((row) => `${row.method}:${row.id}`)).size ===
      v.accounts.length &&
    object(v.issues) &&
    contractFields(v.issues.rental) &&
    contractFields(v.issues.reservation)
  );
}
