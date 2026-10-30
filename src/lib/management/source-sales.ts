import type { ManagementRow } from './types';

export interface SourceSalesRow { key: string; name: string; contracts: number; customers: number; rent: number; paid: number; deposit: number; progress: number[] }
export interface SourceSalesSummary { rows: SourceSalesRow[]; total: Omit<SourceSalesRow, 'key' | 'name' | 'progress'>; days: string[] }
const MAX_DAYS = 400;

// Long ranges keep the most recent MAX_DAYS days; earlier revenue seeds the first point.
export function reportDays(from: string, to: string): string[] {
  const days: string[] = [];
  const cursor = new Date(`${to}T00:00:00Z`);
  if (!Number.isFinite(cursor.getTime()) || !from || from > to) return days;
  for (let day = to; day >= from && days.length < MAX_DAYS; day = cursor.toISOString().slice(0, 10)) {
    days.push(day);
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return days.reverse();
}

const EXCLUDED_STATUSES = new Set(['draft', 'pending', 'deposit_contract', 'cancelled', 'cancel_pending_settlement']);
export const UNASSIGNED_SOURCE = 'Chưa phân công NVKD';
export const UNASSIGNED_STORE = 'Chưa có cơ sở doanh thu';

const RECEIVABLE_STATUSES = new Set(['renting', 'overdue', 'wait_payment', 'bad_debt','reserved']);
const OVERDUE_STATUSES = new Set(['overdue', 'bad_debt']);

const tidy = (value: unknown) => String(value ?? '').normalize('NFC').trim().replace(/\s+/g, ' ');
const startedInPeriod = (contract: ManagementRow, from: string, to: string, store: string) => {
  if (EXCLUDED_STATUSES.has(contract.status) || store !== 'all' && String(contract.store_id ?? '') !== store) return false;
  const date = String(contract.start_date ?? '').slice(0, 10);
  return Boolean(date) && date >= from && date <= to;
};

export interface SalesKpis { contracts: number; revenue: number; paid: number; debt: number; debtContracts: number; overdueDebt: number; overdueContracts: number; badDebt: number }

export function summarizeSalesKpis(contracts: readonly ManagementRow[], from: string, to: string, store: string): SalesKpis {
  const kpis: SalesKpis = { contracts: 0, revenue: 0, paid: 0, debt: 0, debtContracts: 0, overdueDebt: 0, overdueContracts: 0, badDebt: 0 };
  for (const contract of contracts) {
    if (!startedInPeriod(contract, from, to, store)) continue;
    const total = Number(contract.total_amount) || 0, paid = Number(contract.paid_amount) || 0;
    kpis.contracts += 1; kpis.revenue += total; kpis.paid += paid;
    const debt = RECEIVABLE_STATUSES.has(contract.status) ? Math.max(total - paid, 0) : 0;
    if (!debt) continue;
    kpis.debt += debt; kpis.debtContracts += 1;
    if (OVERDUE_STATUSES.has(contract.status)) { kpis.overdueDebt += debt; kpis.overdueContracts += 1; }
    if (contract.status === 'bad_debt') kpis.badDebt += debt;
  }
  return kpis;
}

function summarize(contracts: readonly ManagementRow[], from: string, to: string, store: string, group: (contract: ManagementRow) => { key: string; name: string }, unassigned: string): SourceSalesSummary {
  const groups = new Map<string, { row: SourceSalesRow; customers: Set<string>; names: Map<string, number>; daily: Map<string, number> }>();
  const allCustomers = new Set<string>();
  for (const contract of contracts) {
    if (!startedInPeriod(contract, from, to, store)) continue;
    const date = String(contract.start_date).slice(0, 10);
    const { key, name } = group(contract);
    const entry = groups.get(key) ?? { row: { key, name: name || unassigned, contracts: 0, customers: 0, rent: 0, paid: 0, deposit: 0, progress: [] }, customers: new Set<string>(), names: new Map<string, number>(), daily: new Map<string, number>() };
    const rent = Number(contract.total_amount) || 0;
    entry.row.contracts += 1;
    entry.row.rent += rent;
    entry.daily.set(date, (entry.daily.get(date) || 0) + rent);
    entry.row.paid += Number(contract.paid_amount) || 0;
    entry.row.deposit += Number(contract.deposit_amount) || 0;
    const customer = contract.customer_id != null ? `id:${contract.customer_id}` : `name:${contract.customer_name || contract.id}`;
    entry.customers.add(customer); allCustomers.add(customer);
    if (name) entry.names.set(name, (entry.names.get(name) || 0) + 1);
    groups.set(key, entry);
  }
  const days = reportDays(from, to);
  const rows = [...groups.values()].map(({ row, customers, names, daily }) => {
    let running = [...daily].reduce((sum, [day, value]) => day < days[0] ? sum + value : sum, 0);
    return { ...row, customers: customers.size,
      name: [...names].sort((a, b) => b[1] - a[1])[0]?.[0] || row.name,
      progress: days.map(day => (running += daily.get(day) || 0)) };
  }).sort((a, b) => Number(!a.key) - Number(!b.key) || b.rent - a.rent || a.name.localeCompare(b.name, 'vi'));
  const total = rows.reduce((sum, row) => ({ ...sum, contracts: sum.contracts + row.contracts, rent: sum.rent + row.rent, paid: sum.paid + row.paid, deposit: sum.deposit + row.deposit }),
    { contracts: 0, customers: allCustomers.size, rent: 0, paid: 0, deposit: 0 });
  return { rows, total, days };
}

// Grouped by the contract's "NVKD ghi nhận doanh số"; the label prefers the name saved when the NVKD was assigned.
export function summarizeBySalesStaff(contracts: readonly ManagementRow[], from: string, to: string, store: string, staff: readonly ManagementRow[] = []): SourceSalesSummary {
  const staffNames = new Map(staff.map(person => [String(person.id), tidy(person.name)]));
  return summarize(contracts, from, to, store, contract => {
    const name = tidy(contract.sales_staff_name);
    const key = contract.sales_staff_id != null ? String(contract.sales_staff_id) : name ? `name:${name.toLocaleLowerCase('vi')}` : '';
    return { key, name: key ? name || staffNames.get(key) || `Nhân viên #${key}` : '' };
  }, UNASSIGNED_SOURCE);
}

export function summarizeByStore(contracts: readonly ManagementRow[], from: string, to: string, store: string): SourceSalesSummary {
  return summarize(contracts, from, to, store, contract => ({
    key: contract.store_id != null ? String(contract.store_id) : '',
    name: tidy(contract.store_name) || (contract.store_id != null ? `Cơ sở #${contract.store_id}` : ''),
  }), UNASSIGNED_STORE);
}
