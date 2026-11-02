import 'server-only';
import type { PoolClient } from 'pg';
import type { NewCustomerBySourceReport, NewCustomerBySourceRow } from '@/lib/management/new-customers-by-source';

export class NewCustomersBySourceError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00Z`)) && new Date(`${value}T00:00Z`).toISOString().slice(0, 10) === value;

// First completed rental system-wide, then keep those that started in the period.
// Matches "Khách mới" on the staff-sales contracts tab.
const NEW_CUSTOMERS_SQL = `WITH ranked AS MATERIALIZED (
  SELECT o.id, o.customer_id, o.store_id, o.order_status, o.rent_at, o.created_at, o.contract_number, o.draft_reference,
    NULLIF(BTRIM(COALESCE(NULLIF(o.customer_source, ''), o.draft_payload #>> '{management_composer,draft,customer_source}', '')), '') AS customer_source,
    row_number() OVER (PARTITION BY o.customer_id ORDER BY COALESCE(o.rent_at, o.created_at), o.id) AS rental_number
  FROM himoto.orders o
  WHERE o.customer_id IS NOT NULL
    AND o.deleted_at IS NULL
    AND o.order_status NOT IN ('draft', 'pending', 'deposit_contract', 'cancelled', 'cancel_pending_settlement')
), first_rentals AS (
  SELECT ranked.*,
    (COALESCE(ranked.rent_at, ranked.created_at) AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS started_on
  FROM ranked
  WHERE ranked.rental_number = 1
    AND (COALESCE(ranked.rent_at, ranked.created_at) AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $1::date AND $2::date
    AND ($3::bigint IS NULL OR ranked.store_id = $3)
)
SELECT c.id AS customer_id, c.name AS customer_name, COALESCE(c.phone, '') AS phone,
  COALESCE(c.id_card, '') AS id_card, first_rentals.customer_source,
  first_rentals.store_id, COALESCE(s.store_name, '') AS store_name,
  first_rentals.started_on::text AS started_on,
  first_rentals.id AS order_id,
  COALESCE(NULLIF(first_rentals.contract_number, ''), NULLIF(first_rentals.draft_reference, ''), '#' || first_rentals.id::text) AS contract_code,
  first_rentals.order_status AS contract_status
FROM first_rentals
JOIN himoto.customers c ON c.id = first_rentals.customer_id
LEFT JOIN himoto.stores s ON s.id = first_rentals.store_id
ORDER BY first_rentals.started_on DESC, c.name ASC, c.id ASC`;

function mapRow(raw: Record<string, unknown>): NewCustomerBySourceRow {
  const customerId = Number(raw.customer_id);
  const orderId = Number(raw.order_id);
  if (!Number.isSafeInteger(customerId) || customerId <= 0 || !Number.isSafeInteger(orderId) || orderId <= 0) {
    throw new NewCustomersBySourceError('Danh sách khách mới trả về dữ liệu không hợp lệ.', 409);
  }
  return {
    customer_id: customerId,
    customer_name: String(raw.customer_name || ''),
    phone: String(raw.phone || ''),
    id_card: String(raw.id_card || ''),
    customer_source: String(raw.customer_source || ''),
    store_id: raw.store_id == null ? null : Number(raw.store_id),
    store_name: String(raw.store_name || ''),
    started_on: String(raw.started_on || ''),
    order_id: orderId,
    contract_code: String(raw.contract_code || ''),
    contract_status: String(raw.contract_status || ''),
  };
}

export async function newCustomersBySource(
  client: Pick<PoolClient, 'query'>,
  from: string,
  to: string,
  store?: number,
): Promise<NewCustomerBySourceReport> {
  if (!validDate(from) || !validDate(to) || from > to || store !== undefined && (!Number.isSafeInteger(store) || store <= 0)) {
    throw new NewCustomersBySourceError('Kiểm tra khoảng ngày và cơ sở của danh sách khách mới.');
  }
  const result = await client.query(NEW_CUSTOMERS_SQL, [from, to, store ?? null]);
  const rows = result.rows.map(mapRow);
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
