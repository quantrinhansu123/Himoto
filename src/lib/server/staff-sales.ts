import 'server-only';
import type { PoolClient } from 'pg';
import type { StaffSalesReport, StaffSalesRow } from '@/lib/management/staff-sales';
import { renewalReceiptSql } from './contract-receipts';

export class StaffSalesError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00Z`)) && new Date(`${value}T00:00Z`).toISOString().slice(0, 10) === value;

// Rank complete rental history before branch/date filters. Allocate known
// initial fees first when collecting combined rent/fee receipts, as billing does.
const SALES_CTE = `WITH eligible AS (
  SELECT o.id,o.customer_id,o.store_id,o.rent_at,o.created_at,o.draft_payload,o.customer_source,
    row_number() OVER(PARTITION BY o.customer_id ORDER BY COALESCE(o.rent_at,o.created_at),o.id) AS rental_number,
    (COALESCE(NULLIF(o.draft_payload #>> '{management_composer,rental_type}',''),o.order_type,'')='ownership'
      OR COALESCE(o.draft_payload #>> '{management_composer,draft,ownership}','false')='true'
      OR o.draft_payload #> '{management_composer,installment_plan}' IS NOT NULL) AS ownership,
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
    ${renewalReceiptSql()} AS is_renewal,
    SUM(CASE WHEN ${renewalReceiptSql()} THEN 0 ELSE t.value END)
      OVER(PARTITION BY t.order_id ORDER BY t.created_at,t.id ROWS UNBOUNDED PRECEDING) AS cumulative_regular
  FROM himoto.transactions t JOIN eligible o ON o.id=t.order_id
  WHERE t.status='approved' AND t.type IN ('in','addon')
    AND (t.name IN ('order:rental_fees','order:payment') OR ${renewalReceiptSql()})
    AND (t.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= $2::date
), receipts AS (
  SELECT order_id,SUM(CASE WHEN is_renewal THEN value
    ELSE GREATEST(cumulative_regular-initial_fees,0)-GREATEST(cumulative_regular-value-initial_fees,0) END) AS revenue
  FROM receipt_history WHERE (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= $1::date GROUP BY order_id
), attributed AS (
  SELECT o.id,o.customer_id,o.rental_number,a.department,a.staff_id,a.saved_name,
    CASE WHEN a.department='TLS' THEN o.original_rent ELSE COALESCE(r.revenue,0) END AS revenue,
    (COALESCE(o.rent_at,o.created_at) AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $1::date AND $2::date AS started_in_range
  FROM eligible o LEFT JOIN receipts r ON r.order_id=o.id
  CROSS JOIN LATERAL (SELECT
    COALESCE(o.draft_payload #>> '{management_composer,profile,sales_staff_id}',o.draft_payload #>> '{management_composer,draft,sales_staff_id}') AS sales_id,
    COALESCE(o.draft_payload #>> '{management_composer,profile,tls_staff_id}',o.draft_payload #>> '{management_composer,draft,tls_staff_id}') AS tls_id) ids
  CROSS JOIN LATERAL (VALUES
    ('NVKD',CASE WHEN ids.sales_id ~ '^[1-9][0-9]{0,14}$' THEN ids.sales_id::bigint END,COALESCE(o.draft_payload #>> '{management_composer,profile_attribution,NVKD,name}',o.draft_payload #>> '{management_composer,sales_attribution,NVKD,name}')),
    ('TLS',CASE WHEN ids.tls_id ~ '^[1-9][0-9]{0,14}$' THEN ids.tls_id::bigint END,COALESCE(o.draft_payload #>> '{management_composer,profile_attribution,TLS,name}',o.draft_payload #>> '{management_composer,sales_attribution,TLS,name}'))
  ) a(department,staff_id,saved_name)
  WHERE ($3::bigint IS NULL OR o.store_id=$3) AND (a.staff_id IS NOT NULL OR a.department='TLS'
    AND upper(trim(COALESCE(NULLIF(o.customer_source,''),o.draft_payload #>> '{management_composer,draft,customer_source}',''))) IN ('TLS','TELESALE','TELESALES'))
    AND (a.department='NVKD' OR NOT o.ownership AND o.rental_number=1 AND (COALESCE(o.rent_at,o.created_at) AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $1::date AND $2::date)
)
`;
export const STAFF_SALES_SQL = `${SALES_CTE}
SELECT a.*,COALESCE(NULLIF(a.saved_name,''),s.full_name,'Nhân viên #' || a.staff_id::text) AS name
FROM attributed a LEFT JOIN himoto.staff_profiles s ON s.id=a.staff_id
WHERE a.started_in_range OR a.revenue <> 0`;
const STAFF_SALES_REPORT_SQL=`${SALES_CTE}
SELECT COALESCE((SELECT jsonb_agg(to_jsonb(a)||jsonb_build_object('name',COALESCE(NULLIF(a.saved_name,''),s.full_name,'Nhân viên #'||a.staff_id::text)))
  FROM attributed a LEFT JOIN himoto.staff_profiles s ON s.id=a.staff_id WHERE a.started_in_range OR a.revenue<>0),'[]'::jsonb) AS items,
  missing.revenue,missing.contracts
FROM (SELECT COALESCE(SUM(r.revenue),0) AS revenue,count(DISTINCT o.id)::int AS contracts
  FROM receipts r JOIN eligible o ON o.id=r.order_id WHERE r.revenue<>0
    AND COALESCE(o.draft_payload #>> '{management_composer,profile,sales_staff_id}',o.draft_payload #>> '{management_composer,draft,sales_staff_id}','') !~ '^[1-9][0-9]{0,14}$'
    AND ($3::bigint IS NULL OR o.store_id=$3)) missing`;

export async function staffSales(client: Pick<PoolClient, 'query'>, from: string, to: string, store?: number): Promise<StaffSalesReport> {
  if (!validDate(from) || !validDate(to) || from > to || store !== undefined && (!Number.isSafeInteger(store) || store <= 0)) throw new StaffSalesError('Kiểm tra khoảng ngày và cơ sở của báo cáo.');
  const params = [from, to, store ?? null];
  const result = await client.query(STAFF_SALES_REPORT_SQL, params);
  const report=result.rows[0];
  const grouped = new Map<string, { row: StaffSalesRow; customers: Set<number>; newCustomers: Set<number> }>();
  for (const item of report.items) {
    const key = item.department==='TLS' ? 'TLS' : `${item.department}:${item.staff_id}`;
    const entry = grouped.get(key) ?? { row: { staff_id: item.department==='TLS'?0:Number(item.staff_id), department: item.department, name: item.department==='TLS'?'TLS':String(item.name), contracts: 0, customers: 0, new_customers: 0, revenue: 0 }, customers: new Set<number>(), newCustomers: new Set<number>() };
    entry.row.revenue += Number(item.revenue); entry.row.contracts += 1; entry.customers.add(Number(item.customer_id));
    if (Number(item.rental_number) === 1 && item.started_in_range) entry.newCustomers.add(Number(item.customer_id));
    grouped.set(key, entry);
  }
  const rows = [...grouped.values()].map(entry => ({ ...entry.row, customers: entry.customers.size, new_customers: entry.newCustomers.size })).sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name, 'vi'));
  if (rows.some(row => !Number.isSafeInteger(row.revenue)) || !Number.isSafeInteger(Number(report.revenue))) throw new StaffSalesError('Doanh số vượt giới hạn hiển thị; cần đối chiếu.', 409);
  return { rows, unassigned_revenue: Number(report.revenue), unassigned_contracts: Number(report.contracts) };
}
