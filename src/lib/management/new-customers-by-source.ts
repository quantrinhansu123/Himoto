export interface NewCustomerBySourceRow {
  customer_id: number;
  customer_name: string;
  phone: string;
  id_card: string;
  customer_source: string;
  store_id: number | null;
  store_name: string;
  started_on: string;
  order_id: number;
  contract_code: string;
  contract_status: string;
}

export interface NewCustomerBySourceTotals {
  customers: number;
  with_source: number;
  without_source: number;
}

export interface NewCustomerBySourceReport {
  rows: NewCustomerBySourceRow[];
  totals: NewCustomerBySourceTotals;
  sources: { name: string; customers: number }[];
}

export interface NewCustomerBySourceFilters {
  search: string;
  source: string;
  /** empty = all, `with` = has source, `without` = missing source, or exact source name via `source` */
  sourcePresence: '' | 'with' | 'without';
}

const tidy = (value: string) => value.normalize('NFC').trim().replace(/\s+/g, ' ');
const digits = (value: string) => value.replace(/\D/g, '');

export function filterNewCustomersBySource(
  report: NewCustomerBySourceReport,
  filters: NewCustomerBySourceFilters,
): NewCustomerBySourceReport {
  const needle = tidy(filters.search).toLocaleLowerCase('vi');
  const phoneNeedle = digits(filters.search);
  const sourceFilter = tidy(filters.source);
  const rows = report.rows.filter(row => {
    if (filters.sourcePresence === 'with' && !row.customer_source) return false;
    if (filters.sourcePresence === 'without' && row.customer_source) return false;
    if (sourceFilter && tidy(row.customer_source).toLocaleLowerCase('vi') !== sourceFilter.toLocaleLowerCase('vi')) return false;
    if (!needle && !phoneNeedle) return true;
    const haystack = `${row.customer_name} ${row.phone} ${row.id_card} ${row.contract_code} ${row.customer_source} ${row.store_name}`.toLocaleLowerCase('vi');
    if (needle && haystack.includes(needle)) return true;
    return Boolean(phoneNeedle) && digits(row.phone).includes(phoneNeedle);
  });
  const sources = new Map<string, number>();
  let withSource = 0;
  for (const row of rows) {
    if (row.customer_source) {
      withSource += 1;
      sources.set(row.customer_source, (sources.get(row.customer_source) || 0) + 1);
    }
  }
  return {
    rows,
    totals: {
      customers: rows.length,
      with_source: withSource,
      without_source: rows.length - withSource,
    },
    sources: [...sources.entries()]
      .map(([name, customers]) => ({ name, customers }))
      .sort((a, b) => b.customers - a.customers || a.name.localeCompare(b.name, 'vi')),
  };
}

export async function loadNewCustomersBySource(
  from: string,
  to: string,
  store: string,
  signal?: AbortSignal,
): Promise<NewCustomerBySourceReport> {
  const query = new URLSearchParams({ from, to, ...(store !== 'all' ? { store_id: store } : {}) });
  const response = await fetch(`/api/auth/staff-sales/new-customers?${query}`, {
    cache: 'no-store',
    credentials: 'same-origin',
    signal,
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.status !== 'success' || !Array.isArray(result.data?.rows) || !result.data?.totals) {
    throw new Error(result?.message || 'Không tải được danh sách khách hàng mới.');
  }
  return result.data;
}
