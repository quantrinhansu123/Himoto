import type { ManagementRow } from './types';

// These are estimates from recorded contract amounts, not a settlement ledger.
const RECEIVABLE_STATUSES = new Set(['renting', 'overdue', 'wait_payment', 'bad_debt']);
const EXCLUDED_TOTAL_STATUSES = new Set(['draft', 'cancelled']);

export interface ContractSummary {
  contractCount: number;
  blacklistCount: number;
  totalAmount: number | null;
  receivableAmount: number | null;
  badDebtAmount: number | null;
}

function amount(value: ManagementRow[string]): number | null {
  if (value === undefined || String(value).trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function summarizeContracts(rows: ManagementRow[], customers: ManagementRow[]): ContractSummary {
  const blacklist = new Set(customers.filter(customer => customer.status === 'blacklist').map(customer => customer.id));
  const matchedBlacklist = new Set<number>();
  let totalAmount: number | null = 0, receivableAmount: number | null = 0, badDebtAmount: number | null = 0;
  for (const row of rows) {
    const customerId = Number(row.customer_id);
    if (row.customer_status === undefined ? blacklist.has(customerId) : row.customer_status === 'blacklist') matchedBlacklist.add(customerId);
    if (!EXCLUDED_TOTAL_STATUSES.has(row.status)) {
      const total = amount(row.total_amount);
      totalAmount = totalAmount === null || total === null ? null : totalAmount + total;
    }
    if (!RECEIVABLE_STATUSES.has(row.status)) continue;
    const total = amount(row.total_amount), paid = amount(row.paid_amount);
    const debt = total === null || paid === null ? null : Math.max(total - paid, 0);
    receivableAmount = receivableAmount === null || debt === null ? null : receivableAmount + debt;
    if (row.status === 'bad_debt') badDebtAmount = badDebtAmount === null || debt === null ? null : badDebtAmount + debt;
  }
  return { contractCount: rows.length, blacklistCount: matchedBlacklist.size, totalAmount, receivableAmount, badDebtAmount };
}
