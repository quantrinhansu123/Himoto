import type { MobileWriteReceipt } from "./mobile-contract";
export interface MobileVehicleInput {
  name: string; license: string; brand: string; type: string; year: number | null;
  store_id: number; status: string; color: string; chassis: string; engine: string;
  odometer: number | null; daily_price?: number | null; cost_price?: number | null; note: string; revision?: string;
}
export interface MobileVehicleProfile {
  id: number; revision: string; values: MobileVehicleInput;
  storeName: string; ownerStoreId: number | null; ownerStoreName: string; typeLabel: string;
  hasOpenContract: boolean; inTransit: boolean; canEdit: boolean;
}
export interface MobileVehicleOptions {
  stores: { id: number; name: string }[];
  types: { value: string; label: string }[];
  statuses: { value: string; label: string }[];
}
export interface MobileVehicleResult {
  key: string; operation: string; receipt: MobileWriteReceipt; current: MobileVehicleProfile;
}
export interface MobileVehicleContracts {
  id: number; page: number; pages: number; total: number;
  rows: {id:number;code:string;status:string;customer:string;startsAt:string|null;endsAt:string|null}[];
}
export interface MobileVehicleChange { field: string; label: string; from: string; to: string }
export const VEHICLE_HISTORY_ACTIONS = [
  { value: "rent", label: "Thuê" }, { value: "return", label: "Trả xe" }, { value: "transfer", label: "Chuyển kho" },
  { value: "repair", label: "Sửa chữa" }, { value: "status", label: "Đổi trạng thái" }, { value: "swap", label: "Đổi xe" },
  { value: "note", label: "Ghi chú" }, { value: "edit", label: "Chỉnh sửa thông tin" }, { value: "create", label: "Nhập xe" },
] as const;
export type MobileVehicleEventAction = typeof VEHICLE_HISTORY_ACTIONS[number]["value"];
export interface MobileVehicleEvent {
  key: string; action: MobileVehicleEventAction; label: string; vehicle_name: string; license: string;
  location: string; responsible_store: string; beneficiary_store: string; note: string;
  at: string | null; actor: string; order_id: number | null; changes: MobileVehicleChange[];
  telegram_event_id?:number;
}
export interface MobileVehicleHistory {
  id: number; rows: MobileVehicleEvent[]; page: number; pages: number; total: number;
  sourceLimit: string;
}
export interface MobileTransferHistoryRow {
  id: number; vehicle_id: number; vehicle_name: string; license: string;
  from_store_id: number | null; to_store_id: number | null; from_store: string; to_store: string;
  action: "transfer" | "receive" | "reject" | "cancel"; label: string;
  at: string | null; actor: string; note: string; changes: MobileVehicleChange[];
}
export interface MobileTransferHistory {
  rows: MobileTransferHistoryRow[]; total: number; scopeCount: number; page: number; pages: number; size: number;
  from: string; to: string;
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const integer = (v: unknown, min = 0): v is number => Number.isSafeInteger(v) && Number(v) >= min;
const strings = (v: Record<string, unknown>, keys: string[]) => keys.every(key => typeof v[key] === "string");
const revision = (v: unknown): v is string => typeof v === "string" && /^[1-9]\d{0,19}$/.test(v);
const time = (v: unknown) => v === null || typeof v === "string" && Number.isFinite(Date.parse(v));
const nullableId = (v: unknown) => v === null || integer(v, 1);
export function isVehicleContracts(v:unknown):v is MobileVehicleContracts {
  return object(v)&&integer(v.id,1)&&integer(v.page,1)&&integer(v.pages,1)&&v.page<=v.pages&&integer(v.total)&&Array.isArray(v.rows)&&v.rows.length<=25&&v.rows.every(row=>object(row)&&integer(row.id,1)&&strings(row,['code','status','customer'])&&[row.startsAt,row.endsAt].every(t=>t===null||typeof t==='string'&&t.length<=100));
}
export function isVehicleInput(v: unknown): v is MobileVehicleInput {
  return object(v) && strings(v, ["name", "license", "brand", "type", "status", "color", "chassis", "engine", "note"])
    && (v.year === null || integer(v.year)) && integer(v.store_id, 1) && (v.odometer === null || integer(v.odometer))
    && ['daily_price','cost_price'].every(key => v[key] === undefined || v[key] === null || integer(v[key]))
    && (v.revision === undefined || revision(v.revision));
}
export function isVehicleProfile(v: unknown): v is MobileVehicleProfile {
  return object(v) && integer(v.id, 1) && revision(v.revision) && isVehicleInput(v.values) && v.values.revision === v.revision
    && strings(v, ["storeName", "ownerStoreName", "typeLabel"]) && nullableId(v.ownerStoreId)
    && ["hasOpenContract", "inTransit", "canEdit"].every(key => typeof v[key] === "boolean");
}
export function isVehicleOptions(v: unknown): v is MobileVehicleOptions {
  return object(v) && Array.isArray(v.stores) && v.stores.every(row => object(row) && integer(row.id, 1) && typeof row.name === "string")
    && [v.types, v.statuses].every(rows => Array.isArray(rows) && rows.length > 0 && rows.every(row => object(row) && strings(row, ["value", "label"])));
}
export function isVehicleResult(v: unknown): v is MobileVehicleResult {
  return object(v) && typeof v.key === "string" && /^[0-9a-f-]{36}$/.test(v.key) && typeof v.operation === "string"
    && /^vehicle\.(create|update:[1-9]\d{0,14})$/.test(v.operation)
    && object(v.receipt) && integer(v.receipt.id, 1) && revision(v.receipt.revision) && typeof v.receipt.replayed === "boolean"
    && isVehicleProfile(v.current) && v.current.id === v.receipt.id
    && (!v.operation.includes(":") || Number(v.operation.split(":")[1]) === v.receipt.id);
}
export function isVehicleChanges(v: unknown): v is MobileVehicleChange[] {
  return Array.isArray(v) && v.every(row => object(row) && strings(row, ["field", "label", "from", "to"]));
}
export function isVehicleHistory(v: unknown): v is MobileVehicleHistory {
  return object(v) && integer(v.id, 1) && integer(v.page, 1) && integer(v.pages, 1) && v.page <= v.pages && integer(v.total)
    && typeof v.sourceLimit === "string" && Array.isArray(v.rows) && v.rows.length <= 25 && v.rows.every(row => object(row)
      && strings(row, ["key", "action", "label", "vehicle_name", "license", "location", "responsible_store", "beneficiary_store", "note", "actor"])
      && VEHICLE_HISTORY_ACTIONS.some(action => action.value === row.action) && time(row.at) && nullableId(row.order_id) && (row.telegram_event_id===undefined||integer(row.telegram_event_id,1)) && isVehicleChanges(row.changes));
}
export function isTransferHistory(v: unknown): v is MobileTransferHistory {
  return object(v) && strings(v, ["from", "to"]) && integer(v.page, 1) && integer(v.pages, 1) && v.page <= v.pages && v.size === 25
    && integer(v.total) && integer(v.scopeCount) && v.scopeCount >= v.total && Array.isArray(v.rows) && v.rows.length <= 25
    && v.rows.every(row => object(row) && integer(row.id, 1) && integer(row.vehicle_id, 1)
      && strings(row, ["vehicle_name", "license", "from_store", "to_store", "label", "actor", "note"])
      && nullableId(row.from_store_id) && nullableId(row.to_store_id) && ["transfer", "receive", "reject", "cancel"].includes(String(row.action))
      && time(row.at) && isVehicleChanges(row.changes));
}
export const vehicleProfileOperations = (id: string) => [`vehicle.update:${id}`, `vehicle.status:${id}`, ...["transfer", "receive", "reject", "cancel"].map(action => `vehicle.${action}:${id}`)];
