import type { MobileWriteReceipt } from "./mobile-contract";
export type { StoreCreation, StoreEdits, StoreManager } from "./store-management";
export { STORE_KINDS, validateStoreCreation, validateStoreEdits } from "./store-management";
export const MOBILE_STORE_STATUSES = [{ value: "active", label: "Hoạt động" }, { value: "inactive", label: "Tạm ngừng" }];
export interface MobileStoreProfile {
  id: number; revision: string; rowRevision: string; code: string; kind: string;
  name: string; phone: string; address: string; status: string;
  managerId: number | null; managerName: string; vehicleCount: number; staffCount: number;
}
export interface MobileStoreResult {
  key: string; operation: string; receipt: MobileWriteReceipt;
  current: MobileStoreProfile | null; deleted: boolean;
}
export interface MobileStoreManagers { managers: { id: number; name: string }[] }
export const storeWriteOperations = (id: string) => [`store.update:${id}`, `store.delete:${id}`];
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
export function isStoreProfile(value: unknown): value is MobileStoreProfile {
  if (!record(value)) return false;
  return Number.isSafeInteger(value.id) && Number(value.id) > 0
    && ["revision", "rowRevision", "code", "kind", "name", "phone", "address", "status", "managerName"].every(key => typeof value[key] === "string")
    && (value.revision as string).length <= 100 && /^[1-9]\d{0,19}$/.test(value.rowRevision as string)
    && (value.managerId === null || Number.isSafeInteger(value.managerId) && Number(value.managerId) > 0)
    && ["vehicleCount", "staffCount"].every(key => Number.isSafeInteger(value[key]) && Number(value[key]) >= 0);
}
export function isStoreManagers(value: unknown): value is MobileStoreManagers {
  return record(value) && Array.isArray(value.managers) && value.managers.every(row => record(row) && Number.isSafeInteger(row.id) && Number(row.id) > 0 && typeof row.name === "string");
}
export function isStoreResult(value: unknown): value is MobileStoreResult {
  if (!record(value) || typeof value.key !== "string" || !/^[0-9a-f-]{36}$/.test(value.key)
    || typeof value.operation !== "string" || !/^store\.(create|(?:update|delete):[1-9]\d{0,14})$/.test(value.operation) || !record(value.receipt)) return false;
  const receipt = value.receipt;
  return Number.isSafeInteger(receipt.id) && Number(receipt.id) > 0 && typeof receipt.revision === "string" && /^[1-9]\d{0,19}$/.test(receipt.revision)
    && typeof receipt.replayed === "boolean" && typeof value.deleted === "boolean"
    && (value.current === null ? value.deleted && value.operation.startsWith("store.delete:") : !value.deleted && isStoreProfile(value.current) && value.current.id === receipt.id)
    && (!value.operation.includes(":") || Number(value.operation.split(":")[1]) === receipt.id);
}
