import 'server-only';
import type { PoolClient } from 'pg';
import type { StaffSalesReport, StaffSalesRow } from '@/lib/management/staff-sales';
import { installmentSchedule, parseInstallmentPlan } from '@/lib/management/contract-billing';

export class StaffSalesError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00Z`)) && new Date(`${value}T00:00Z`).toISOString().slice(0, 10) === value;

// Rank complete rental history before branch/date filters. Allocate known
// initial fees first when collecting combined rent/fee receipts, as billing does.
const SALES_CTE = `WITH eligible AS (
  SELECT o.*, row_number() OVER(PARTITION BY o.customer_id ORDER BY COALESCE(o.rent_at,o.created_at),o.id) AS rental_number,
    COALESCE(f.amount,0) AS initial_fees,
    COALESCE(o.total_rental_fees,
      CASE WHEN o.draft_payload #>> '{management_composer,draft,total_amount}' ~ '^[0-9]{1,13}$'
        THEN GREATEST((o.draft_payload #>> '{management_composer,draft,total_amount}')::numeric - COALESCE(f.amount,0),0)
        WHEN o.total ~ '^[0-9]{1,13}$' THEN GREATEST(o.total::numeric - COALESCE(f.amount,0),0) ELSE 0 END) AS original_rent
  FROM himoto.orders o
  LEFT JOIN LATERAL (
    SELECT SUM(CASE WHEN charge->>'amount' ~ '^[0-9]{1,13}$' THEN (charge->>'amount')::numeric ELSE 0 END) AS amount
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(o.draft_payload::jsonb #> '{management_composer,draft,extra_charges}')='array'
      THEN o.draft_payload::jsonb #> '{management_composer,draft,extra_charges}' ELSE '[]'::jsonb END) charge
  ) f ON true
  WHERE o.customer_id IS NOT NULL AND o.order_status NOT IN ('draft','pending','deposit_contract','cancelled','cancel_pending_settlement')
), receipt_history AS (
  SELECT t.*,o.initial_fees,
    SUM(CASE WHEN t.name='order:renewal' THEN 0 ELSE t.value END)
      OVER(PARTITION BY t.order_id ORDER BY t.created_at,t.id ROWS UNBOUNDED PRECEDING) AS cumulative_regular
  FROM himoto.transactions t JOIN eligible o ON o.id=t.order_id
  WHERE t.status='approved' AND t.type IN ('in','addon')
    AND t.name IN ('order:rental_fees','order:payment','order:renewal')
    AND (t.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= $2::date
), receipts AS (
  SELECT order_id,SUM(CASE WHEN name='order:renewal' THEN value
    ELSE GREATEST(cumulative_regular-initial_fees,0)-GREATEST(cumulative_regular-value-initial_fees,0) END) AS revenue
  FROM receipt_history WHERE (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= $1::date GROUP BY order_id
), attributed AS (
  SELECT o.id,o.customer_id,o.rental_number,a.department,a.staff_id,a.saved_name,
    CASE WHEN a.department='TLS' THEN o.original_rent ELSE COALESCE(r.revenue,0) END AS revenue,
    CASE WHEN a.department='TLS' THEN o.draft_payload #> '{management_composer,installment_plan}' END AS installment_plan,
    (COALESCE(o.rent_at,o.created_at) AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $1::date AND $2::date AS started_in_range
  FROM eligible o LEFT JOIN receipts r ON r.order_id=o.id
  CROSS JOIN LATERAL (SELECT
    COALESCE(o.draft_payload #>> '{management_composer,profile,sales_staff_id}',o.draft_payload #>> '{management_composer,draft,sales_staff_id}') AS sales_id,
    COALESCE(o.draft_payload #>> '{management_composer,profile,tls_staff_id}',o.draft_payload #>> '{management_composer,draft,tls_staff_id}') AS tls_id) ids
  CROSS JOIN LATERAL (VALUES
    ('NVKD',CASE WHEN ids.sales_id ~ '^[1-9][0-9]{0,14}$' THEN ids.sales_id::bigint END,COALESCE(o.draft_payload #>> '{management_composer,profile_attribution,NVKD,name}',o.draft_payload #>> '{management_composer,sales_attribution,NVKD,name}')),
    ('TLS',CASE WHEN ids.tls_id ~ '^[1-9][0-9]{0,14}$' THEN ids.tls_id::bigint END,COALESCE(o.draft_payload #>> '{management_composer,profile_attribution,TLS,name}',o.draft_payload #>> '{management_composer,sales_attribution,TLS,name}'))
  ) a(department,staff_id,saved_name)
  WHERE ($3::bigint IS NULL OR o.store_id=$3) AND a.staff_id IS NOT NULL
    AND (a.department='NVKD' OR o.rental_number=1 AND (COALESCE(o.rent_at,o.created_at) AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $1::date AND $2::date)
)
`;
// Keep rows per contract so ownership uses the same validated calendar/custom
// schedule as debt collection, without changing the amount payable at signing.
export const STAFF_SALES_SQL = `${SALES_CTE}
SELECT a.*,COALESCE(NULLIF(a.saved_name,''),s.full_name,'Nhân viên #' || a.staff_id::text) AS name
FROM attributed a LEFT JOIN himoto.staff_profiles s ON s.id=a.staff_id
WHERE a.started_in_range OR a.revenue <> 0`;

export async function staffSales(client: Pick<PoolClient, 'query'>, from: string, to: string, store?: number): Promise<StaffSalesReport> {
  if (!validDate(from) || !validDate(to) || from > to || store !== undefined && (!Number.isSafeInteger(store) || store <= 0)) throw new StaffSalesError('Kiểm tra khoảng ngày và cơ sở của báo cáo.');
  const params = [from, to, store ?? null];
  const result = await client.query(STAFF_SALES_SQL, params);
  const grouped = new Map<string, { row: StaffSalesRow; customers: Set<number>; newCustomers: Set<number> }>();
  for (const item of result.rows) {
    const key = `${item.department}:${item.staff_id}`;
    const entry = grouped.get(key) ?? { row: { staff_id: Number(item.staff_id), department: item.department, name: String(item.name), contracts: 0, customers: 0, new_customers: 0, revenue: 0 }, customers: new Set<number>(), newCustomers: new Set<number>() };
    let revenue = Number(item.revenue);
    if (item.department === 'TLS' && item.installment_plan) {
      const plan = parseInstallmentPlan(item.installment_plan);
      if (!plan) throw new StaffSalesError('Lịch thuê sở hữu chưa hợp lệ; cần đối chiếu doanh số TLS.', 409);
      // A later vehicle return must not rewrite the value of the original sale.
      revenue = installmentSchedule({ ...plan, stopped_at: undefined }).reduce((sum, period) => sum + period.amount, 0);
    }
    entry.row.revenue += revenue; entry.row.contracts += 1; entry.customers.add(Number(item.customer_id));
    if (Number(item.rental_number) === 1 && item.started_in_range) entry.newCustomers.add(Number(item.customer_id));
    grouped.set(key, entry);
  }
  const missing = await client.query(`${SALES_CTE} SELECT COALESCE(SUM(r.revenue),0) AS revenue,count(DISTINCT o.id)::int AS contracts
    FROM receipts r JOIN eligible o ON o.id=r.order_id WHERE r.revenue<>0
      AND COALESCE(o.draft_payload #>> '{management_composer,profile,sales_staff_id}',o.draft_payload #>> '{management_composer,draft,sales_staff_id}','') !~ '^[1-9][0-9]{0,14}$'
      AND ($3::bigint IS NULL OR o.store_id=$3)`, params);
  const rows = [...grouped.values()].map(entry => ({ ...entry.row, customers: entry.customers.size, new_customers: entry.newCustomers.size })).sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name, 'vi'));
  if (rows.some(row => !Number.isSafeInteger(row.revenue)) || !Number.isSafeInteger(Number(missing.rows[0].revenue))) throw new StaffSalesError('Doanh số vượt giới hạn hiển thị; cần đối chiếu.', 409);
  return { rows, unassigned_revenue: Number(missing.rows[0].revenue), unassigned_contracts: Number(missing.rows[0].contracts) };
}
