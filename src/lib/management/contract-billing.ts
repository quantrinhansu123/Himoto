import type { ManagementRow } from './types';

export type BillingInterval = 'day' | 'week' | 'month' | 'custom';
export const OWNERSHIP_TERM_MONTHS = ['6', '9', '12', '18', '24'] as const;
export type OwnershipTerm = typeof OWNERSHIP_TERM_MONTHS[number] | 'custom';
export const OWNERSHIP_TERMS = [{value:'custom',label:'Chưa phân loại'}, ...OWNERSHIP_TERM_MONTHS.map(value => ({value,label:`${value} tháng`}))];
export const validOwnershipTerm = (value: unknown): value is OwnershipTerm => value === 'custom' || OWNERSHIP_TERM_MONTHS.includes(value as typeof OWNERSHIP_TERM_MONTHS[number]);
export function isHeadquartersStore(name: unknown) {
  const normalized = String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return normalized.includes('nguyen hoang') || normalized.includes('tru so chinh');
}
export interface CustomInstallment { due_at: string; amount: string }
export interface InstallmentPlan {
  version: 1; start: string; end: string; interval: BillingInterval; amount: number;
  periods?: { due_at: string; amount: number }[];
  stopped_at?: string;
}
export interface InstallmentBalance {
  expected_total: number; period_count: number; paid_periods: number;
  accrued_total: number | null; remaining: number | null; due_amount: number | null;
  next_due_at: string | null; overdue_at: string | null; remaining_to_own: number | null;
  stopped_at?: string;
}
const MAX_AMOUNT = 9_999_999_999_999;
const DAY = 86_400_000;

function localDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 16) === value ? date : null;
}
export const billingInterval = (name: string): BillingInterval | null =>
  name === 'Theo tháng' ? 'month' : name === 'Theo tuần' ? 'week' : name === 'Theo ngày' ? 'day' : name === 'Tùy chọn' ? 'custom' : null;
export const billingUnitLabel = (name: string) => billingInterval(name) === 'month' ? 'tháng' : billingInterval(name) === 'week' ? 'tuần' : billingInterval(name) === 'custom' ? 'kỳ đầu' : 'ngày';
export const isOwnershipStore = (name: unknown) => String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes('thue so huu');

/** Every month is anchored to the original day, including month-end and leap years. */
function boundary(start: Date, interval: BillingInterval, index: number): Date {
  if (interval !== 'month') return new Date(start.getTime() + index * DAY * (interval === 'week' ? 7 : 1));
  const date = new Date(start);
  date.setUTCDate(1); date.setUTCMonth(start.getUTCMonth() + index);
  const last = new Date(date); last.setUTCMonth(last.getUTCMonth() + 1); last.setUTCDate(0);
  date.setUTCDate(Math.min(start.getUTCDate(), last.getUTCDate()));
  return date;
}
export function addRentalMonths(value: string, months: number): string {
  const start = localDate(value);
  return start && Number.isInteger(months) && months > 0 && months <= 120 ? boundary(start, 'month', months).toISOString().slice(0,16) : '';
}
export function ownershipTerm(start: string, end: string): OwnershipTerm {
  return OWNERSHIP_TERM_MONTHS.find(term => addRentalMonths(start, Number(term)) === end && Boolean(end)) || 'custom';
}
export function rentalPeriodCount(startValue: string, endValue: string, interval: BillingInterval): number {
  const start = localDate(startValue), end = localDate(endValue);
  if (!start || !end || end <= start || interval === 'custom') return 0;
  if (interval !== 'month') return Math.ceil((end.getTime() - start.getTime()) / DAY / (interval === 'week' ? 7 : 1));
  const months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth();
  return Math.max(1, months + (boundary(start, interval, months) < end ? 1 : 0));
}
export function createInstallmentPlan(start: string, end: string, packageName: string, amount: number, custom: CustomInstallment[] = []): InstallmentPlan | null {
  const interval = billingInterval(packageName);
  if (interval === 'custom') {
    if (!localDate(start) || !localDate(end) || end <= start || !Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_AMOUNT || !Array.isArray(custom) || custom.length > 3659) return null;
    const periods = [{ due_at: start, amount }];
    let total = amount;
    for (const item of custom) {
      if (!item || typeof item !== 'object' || Object.keys(item).some(key => !['due_at', 'amount'].includes(key)) || typeof item.due_at !== 'string' ||
          !localDate(item.due_at) || item.due_at <= periods[periods.length - 1].due_at || item.due_at >= end || typeof item.amount !== 'string' || !/^[1-9]\d{0,12}$/.test(item.amount)) return null;
      const nextAmount = Number(item.amount);
      total += nextAmount;
      if (!Number.isSafeInteger(total) || total > MAX_AMOUNT) return null;
      periods.push({ due_at: item.due_at, amount: nextAmount });
    }
    return { version: 1, start, end, interval, amount, periods };
  }
  const count = interval ? rentalPeriodCount(start, end, interval) : 0;
  if (!interval || !count || count > 3660 || !Number.isSafeInteger(amount) || amount <= 0 || amount * count > MAX_AMOUNT) return null;
  return { version: 1, start, end, interval, amount };
}
export function parseInstallmentPlan(value: unknown): InstallmentPlan | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const plan = value as InstallmentPlan;
  if (Object.keys(plan).some(key => !['version', 'start', 'end', 'interval', 'amount', 'periods', 'stopped_at'].includes(key)) || plan.version !== 1 ||
      typeof plan.start !== 'string' || typeof plan.end !== 'string' || !['day', 'week', 'month', 'custom'].includes(plan.interval)) return null;
  if (plan.stopped_at !== undefined && (typeof plan.stopped_at !== 'string' || !localDate(plan.stopped_at) || plan.stopped_at < plan.start || plan.stopped_at > plan.end)) return null;
  const stopped = plan.stopped_at ? { stopped_at: plan.stopped_at } : {};
  if (plan.interval === 'custom') {
    if (!Array.isArray(plan.periods) || !plan.periods.length || plan.periods[0]?.due_at !== plan.start || plan.periods[0]?.amount !== plan.amount ||
        plan.periods.some(item => !item || typeof item !== 'object' || Object.keys(item).some(key => !['due_at', 'amount'].includes(key)) || !Number.isSafeInteger(item.amount))) return null;
    const valid = createInstallmentPlan(plan.start, plan.end, 'Tùy chọn', plan.amount, plan.periods.slice(1).map(item => ({ due_at: item.due_at, amount: String(item.amount) })));
    return valid ? { ...valid, ...stopped } : null;
  }
  if (plan.periods !== undefined) return null;
  const valid = createInstallmentPlan(plan.start, plan.end, plan.interval === 'month' ? 'Theo tháng' : plan.interval === 'week' ? 'Theo tuần' : 'Theo ngày', plan.amount);
  return valid ? { ...valid, ...stopped } : null;
}
export function installmentSchedule(plan: InstallmentPlan) {
  if (plan.interval === 'custom') return plan.periods!.map((period, index) => ({ ...period, number: index + 1, end_at: plan.periods![index + 1]?.due_at || plan.end }));
  const start = localDate(plan.start)!;
  return Array.from({ length: rentalPeriodCount(plan.start, plan.end, plan.interval) }, (_, index) => ({
    number: index + 1, due_at: boundary(start, plan.interval, index).toISOString().slice(0, 16),
    end_at: new Date(Math.min(boundary(start, plan.interval, index + 1).getTime(), localDate(plan.end)!.getTime())).toISOString().slice(0, 16), amount: plan.amount,
  }));
}
/** Deposit never enters this calculation. Receipts pay fees, then installments in date order. */
export function installmentBalance(plan: InstallmentPlan, baseTotal: number | null, paid: number | null, now = Date.now()): InstallmentBalance {
  const schedule = installmentSchedule(plan), realNow = new Date(now + 7 * 3600000).toISOString().slice(0, 16);
  const localNow = plan.stopped_at && plan.stopped_at < realNow ? plan.stopped_at : realNow;
  const duePeriods = schedule.filter(period => period.due_at <= localNow);
  const expectedTotal = schedule.reduce((sum, period) => sum + period.amount, 0);
  const valid = baseTotal !== null && paid !== null && Number.isSafeInteger(baseTotal) && baseTotal >= plan.amount && Number.isSafeInteger(paid) && paid >= 0;
  const accrued = valid ? baseTotal + Math.max(0, duePeriods.reduce((sum, period) => sum + period.amount, 0) - plan.amount) : null;
  const total = accrued !== null && accrued <= MAX_AMOUNT ? accrued : null;
  const rentalPaid = valid ? Math.max(paid - (baseTotal - plan.amount), 0) : 0;
  let paidPeriods = 0, unallocated = rentalPaid;
  while (paidPeriods < schedule.length && unallocated >= schedule[paidPeriods].amount) { unallocated -= schedule[paidPeriods].amount; paidPeriods += 1; }
  const pending = schedule[paidPeriods];
  const next = plan.stopped_at && pending?.due_at > plan.stopped_at ? undefined : pending;
  const remaining = total === null || paid === null ? null : Math.max(total - paid, 0);
  return { expected_total: expectedTotal, period_count: schedule.length, paid_periods: paidPeriods,
    accrued_total: total, remaining, due_amount: duePeriods.length ? remaining : remaining === null ? null : 0,
    next_due_at: next?.due_at || null, overdue_at: valid && next && next.due_at <= localNow ? next.due_at : null,
    remaining_to_own: valid ? Math.max(expectedTotal - rentalPaid, 0) : null, ...(plan.stopped_at ? {stopped_at: plan.stopped_at} : {}) };
}
export function applyInstallmentBilling(row: ManagementRow, now = Date.now()): ManagementRow {
  if (!row.billing_plan_json || !['renting', 'overdue', 'wait_payment', 'bad_debt', 'completed','reserved'].includes(row.status)) return row;
  let plan: InstallmentPlan | null = null;
  try { plan = parseInstallmentPlan(JSON.parse(String(row.billing_plan_json))); } catch { /* Invalid schedules never become zero debt. */ }
  if (!plan) return { ...row, total_amount: undefined, billing_due_amount: undefined, billing_error: 'Lịch thanh toán chưa hợp lệ; cần đối chiếu.' };
  if (row.status === 'completed' && !plan.stopped_at) return row;
  const base = row.billing_base_total ?? row.total_amount;
  const balance = installmentBalance(plan, base == null ? null : Number(base), row.paid_amount == null ? null : Number(row.paid_amount), now);
  return { ...row, billing_base_total: base, total_amount: balance.accrued_total ?? undefined,
    billing_due_amount: balance.due_amount ?? undefined, billing_next_due_at: balance.next_due_at || '', billing_overdue_at: balance.overdue_at || '',
    billing_expected_total: balance.expected_total, billing_paid_periods: balance.paid_periods, billing_period_count: balance.period_count };
}
