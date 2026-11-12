import type { MobileDraftInventory, MobileStore, MobileWriteReceipt } from './mobile-contract';
import { isMobileDraftInventory, validDraftTime } from './mobile-draft-validation';
export const mobileLifecycleActions = ['mark_bad_debt', 'close_bad_debt', 'settle', 'hold', 'resume', 'update_hold', 'complete_hold'] as const;
export type MobileLifecycleAction = typeof mobileLifecycleActions[number];
export interface MobileLifecycleInput { action: MobileLifecycleAction; revision: string; at: string; note: string; confirmed: true; hold_until?: string; vehicle_ids?: number[]; resume_end?: string }
export interface MobileLifecycleContext {
  id: number; code: string; status: string; revision: string; ownership: boolean; overdue: boolean;
  items: { id: number; vehicleId: number; name: string; license: string; startsAt: string | null; endsAt: string | null; completedAt: string | null; reconciled: boolean }[];
  allReturned: boolean; returnedCount: number; totalAmount: number | null; rentalPaid: number | null; remaining: number | null; depositHeld: number; overpayment: number | null;
  settled: boolean; settlementNote: string; heldAt: string | null; holdUntil: string | null; holdExpired: boolean; resumeVehicleCount: number;
  completedFromHold: boolean; waivedAmount: number | null; suggestedResumeEnd: string | null;
  badDebtClosedAt?: string | null;
  actions: { action: MobileLifecycleAction; label: string; enabled: boolean; reason: string }[];
  events: { action: string; label: string; at: string; recordedAt: string; actorId: number; actorName: string; note: string; from: string; to: string }[];
}
export interface MobileLifecyclePreview { id: number; revision: string; at: string; end: string; totalPeriods: number; periods: { dueAt: string; amount: number }[] }
export interface MobileLifecycleInventory extends MobileDraftInventory { stores: MobileStore[] }
export interface MobileLifecycleResult { key: string; operation: string; receipt: MobileWriteReceipt }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const id = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const nonnegative = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const amount = (v: unknown) => v === null || nonnegative(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.length <= 4000;
const revision = (v: unknown) => typeof v === 'string' && /^[1-9]\d{0,19}$/.test(v);
const stamp = (v: unknown) => text(v) && Number.isFinite(Date.parse(v));
export function isMobileLifecycleContext(v: unknown): v is MobileLifecycleContext {
  return object(v) && id(v.id) && text(v.code) && text(v.status) && revision(v.revision) &&
    ['ownership', 'overdue', 'allReturned', 'settled', 'holdExpired', 'completedFromHold'].every(k => typeof v[k] === 'boolean') &&
    ['totalAmount', 'rentalPaid', 'remaining', 'overpayment', 'waivedAmount'].every(k => amount(v[k])) && nonnegative(v.depositHeld) && nonnegative(v.returnedCount) && nonnegative(v.resumeVehicleCount) && text(v.settlementNote) &&
    ['heldAt', 'holdUntil', 'suggestedResumeEnd'].every(k => v[k] === null || validDraftTime(v[k])) &&
    (v.badDebtClosedAt === undefined || v.badDebtClosedAt === null || stamp(v.badDebtClosedAt)) &&
    Array.isArray(v.items) && v.items.length <= 10000 && v.items.every(i => object(i) && id(i.id) && id(i.vehicleId) && text(i.name) && text(i.license) && typeof i.reconciled === 'boolean' && ['startsAt', 'endsAt', 'completedAt'].every(k => i[k] === null || stamp(i[k]))) &&
    Array.isArray(v.actions) && v.actions.every(a => object(a) && mobileLifecycleActions.includes(a.action as never) && text(a.label) && typeof a.enabled === 'boolean' && text(a.reason)) &&
    Array.isArray(v.events) && v.events.length <= 10000 && v.events.every(e => object(e) && ['action', 'label', 'actorName', 'note', 'from', 'to'].every(k => text(e[k])) && id(e.actorId) && stamp(e.at) && stamp(e.recordedAt));
}
export function isMobileLifecyclePreview(v: unknown): v is MobileLifecyclePreview {
  return object(v) && id(v.id) && revision(v.revision) && validDraftTime(v.at) && validDraftTime(v.end) && nonnegative(v.totalPeriods) && Array.isArray(v.periods) && v.periods.length <= 120 && v.periods.length <= v.totalPeriods && v.periods.every(p => object(p) && validDraftTime(p.dueAt) && nonnegative(p.amount));
}
export function isMobileLifecycleInventory(v: unknown): v is MobileLifecycleInventory {
  return isMobileDraftInventory(v) && object(v) && Array.isArray(v.stores) && v.stores.every(s => object(s) && id(s.id) && text(s.name));
}
export function isMobileLifecycleResult(v: unknown): v is MobileLifecycleResult {
  if (!object(v) || typeof v.key !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v.key) || !object(v.receipt)) return false;
  const receipt = v.receipt;
  return id(receipt.id) && revision(receipt.revision) && typeof receipt.replayed === 'boolean' && mobileLifecycleActions.some(action => v.operation === `lifecycle.${action}:${receipt.id}`);
}
