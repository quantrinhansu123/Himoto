import type { MobileWriteReceipt } from "./mobile-contract";
import type { StaffProfileInput } from "./staff-profile";
export type { StaffProfileInput } from "./staff-profile";
export { STAFF_PROFILE_STATUSES, staffProfileValues, validateStaffProfile } from "./staff-profile";
export { normalizeStaffPosition } from "./staff-positions";
export interface MobileStaffProfile {
  id: number; revision: string; code: string; name: string; phone: string; email: string; position: string;
  storeId: number | null; storeName: string; status: string; joinedAt: string; notes: string; userId: number | null;
}
export interface MobileStaffOptions { stores: { id: number; name: string }[]; positions: string[] }
export interface MobileStaffCredentials { login_name: string; password: string; enabled: boolean }
export interface MobileStaffWriteResult extends MobileWriteReceipt { credentials: MobileStaffCredentials | null }
export interface MobileStaffResult { key: string; operation: string; receipt: MobileWriteReceipt; current: MobileStaffProfile | null; deleted: boolean }
export type MobileStaffInput = StaffProfileInput & { revision?: string };
export const staffWriteOperations = (id: string) => [`staff.update:${id}`, `staff.delete:${id}`];
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const id = (value: unknown) => Number.isSafeInteger(value) && Number(value) > 0;
const receipt = (value: unknown): value is MobileWriteReceipt => object(value) && id(value.id) && typeof value.revision === "string" && /^[1-9]\d{0,19}$/.test(value.revision) && typeof value.replayed === "boolean";
export function isStaffProfile(value: unknown): value is MobileStaffProfile {
  return object(value) && id(value.id) && typeof value.revision === "string" && /^[1-9]\d{0,19}$/.test(value.revision)
    && ["code", "name", "phone", "email", "position", "storeName", "status", "joinedAt", "notes"].every(key => typeof value[key] === "string")
    && (value.storeId === null || id(value.storeId)) && (value.userId === null || id(value.userId));
}
export function isStaffOptions(value: unknown): value is MobileStaffOptions {
  return object(value) && Array.isArray(value.stores) && value.stores.every(row => object(row) && id(row.id) && typeof row.name === "string")
    && Array.isArray(value.positions) && value.positions.every(row => typeof row === "string");
}
export function isStaffCredentials(value: unknown): value is MobileStaffCredentials {
  return object(value) && typeof value.login_name === "string" && /^[a-z0-9._-]{3,80}$/.test(value.login_name)
    && typeof value.password === "string" && value.password.length >= 8 && value.password.length <= 128 && typeof value.enabled === "boolean";
}
export function isStaffWriteResult(value: unknown): value is MobileStaffWriteResult {
  return receipt(value) && object(value) && (value.credentials === null || !value.replayed && isStaffCredentials(value.credentials));
}
export function isStaffResult(value: unknown): value is MobileStaffResult {
  return object(value) && typeof value.key === "string" && /^[0-9a-f-]{36}$/.test(value.key) && typeof value.operation === "string" && /^staff\.(create|(?:update|delete):[1-9]\d{0,14})$/.test(value.operation)
    && receipt(value.receipt) && typeof value.deleted === "boolean" && (value.current === null ? value.deleted && value.operation.startsWith("staff.delete:") : !value.deleted && isStaffProfile(value.current) && value.current.id === value.receipt.id)
    && (!value.operation.includes(":") || Number(value.operation.split(":")[1]) === value.receipt.id);
}
