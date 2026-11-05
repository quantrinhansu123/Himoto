import type { MobileWriteReceipt } from "./mobile-contract";
export interface MobileDutySchedule {
  id: number; store_id: number; store_name: string; staff_id: number | null;
  staff_name: string; staff_phone: string; duty_date: string; shift_name: string;
  role_in_shift: string; notes: string; starts_at: string | null; ends_at: string | null; revision: string;
}
export interface MobileDutyInput {
  store_id: number; staff_id: number; starts_at: string; ends_at: string;
  shift_name: string; role_in_shift: string; notes: string; revision?: string;
}
export interface MobileDutyRoster { week: string; schedules: MobileDutySchedule[] }
export interface MobileDutyResult {
  key: string; operation: string; receipt: MobileWriteReceipt;
  current: MobileDutySchedule | null; deleted: boolean;
}
export const dutyToday = (now = new Date()) => new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 10);
export function dutyAddDays(date: string, days: number) {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}
export function dutyWeekStart(date: string) {
  return dutyAddDays(date, -(new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7);
}
export const localDutyTime = (value: string | null) => value ? new Date(new Date(value).getTime() + 7 * 3600000).toISOString().slice(0, 16) : "";
export function isDutySchedule(value: unknown): value is MobileDutySchedule {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return ["id", "store_id"].every(key => Number.isSafeInteger(row[key]) && Number(row[key]) > 0)
    && (row.staff_id === null || Number.isSafeInteger(row.staff_id) && Number(row.staff_id) > 0)
    && ["store_name", "staff_name", "staff_phone", "shift_name", "role_in_shift", "notes"].every(key => typeof row[key] === "string")
    && typeof row.duty_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.duty_date)
    && typeof row.revision === "string" && /^[1-9]\d{0,19}$/.test(row.revision)
    && ["starts_at", "ends_at"].every(key => row[key] === null || typeof row[key] === "string" && Number.isFinite(Date.parse(row[key] as string)));
}
export function isDutyRoster(value: unknown): value is MobileDutyRoster {
  if (!value || typeof value !== "object") return false;
  const row = value as MobileDutyRoster;
  return /^\d{4}-\d{2}-\d{2}$/.test(row.week) && Array.isArray(row.schedules) && row.schedules.every(isDutySchedule);
}
export function isDutyResult(value: unknown): value is MobileDutyResult {
  if (!value || typeof value !== "object") return false;
  const row = value as MobileDutyResult;
  return typeof row.key === "string" && /^[0-9a-f-]{36}$/.test(row.key)
    && /^duty\.(create|(?:update|delete):[1-9]\d{0,14})$/.test(row.operation)
    && !!row.receipt && Number.isSafeInteger(row.receipt.id) && row.receipt.id > 0
    && typeof row.receipt.revision === "string" && /^[1-9]\d{0,19}$/.test(row.receipt.revision) && typeof row.receipt.replayed === "boolean"
    && typeof row.deleted === "boolean" && (row.current === null ? row.deleted : isDutySchedule(row.current) && row.current.id === row.receipt.id && !row.deleted)
    && (!row.operation.includes(":") || Number(row.operation.split(":")[1]) === row.receipt.id);
}
