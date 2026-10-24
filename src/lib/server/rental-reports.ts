import 'server-only';
import type { PoolClient } from 'pg';
import { CASHBOOK_BREAKDOWN_KEYS, type CashbookBreakdown } from '@/lib/management/cashbook';
import { rentalOverviewRow, type VehicleRevenueRow, type VehicleRevenueDetail } from '@/lib/management/rental-reports';
import { CASHBOOK_LIST_SQL } from './cashbook-list';
import { VEHICLE_ORDER_SQL } from './contract-classification';

type Database = Pick<PoolClient, 'query'>;
export class RentalReportError extends Error {}
const invalid = () => new RentalReportError('Bộ lọc báo cáo không hợp lệ.');
function integer(value: string, min: number, max: number) {
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < min || Number(value) > max) throw invalid();
  return Number(value);
}
export function rentalReportScope(params: URLSearchParams) {
  const from = params.get('from') || '', to = params.get('to') || '';
  for (const value of [from, to]) {
    const parsed = new Date(`${value}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw invalid();
  }
  if (from > to) throw invalid();
  const store = params.has('store_id') ? integer(params.get('store_id') || '', 1, Number.MAX_SAFE_INTEGER) : null;
  return { from, to, store };
}
const amount = (value: unknown) => {
  if (value == null || !Number.isSafeInteger(Number(value))) throw new RentalReportError('Số tiền báo cáo không hợp lệ. Cần đối chiếu dữ liệu.');
  return Number(value);
};
// Legacy rows preserve handler_price or total_money + money_out_date exactly.
// Native finalize writes the whole contract on its first line: distribute its
// rental-only base equally (the composer has one shared rate), then add each
// line's renewals/return adjustments. No business record is rewritten.
export const VEHICLE_REVENUE_LINES_CTE = `WITH lines AS (
  SELECT d.id,d.vehicle_id,d.order_id,o.store_id AS operating_store_id,d.rent_at,d.return_at,COALESCE(o.contract_number,o.draft_reference,'#'||o.id::text) AS code,
    CASE WHEN n.native AND o.total_rental_fees IS NOT NULL THEN
      trunc(o.total_rental_fees::numeric/c.quantity) + CASE WHEN c.position < mod(o.total_rental_fees::numeric,c.quantity) THEN 1 ELSE 0 END
      WHEN COALESCE(d.handler_price,0)<>0 THEN d.handler_price ELSE COALESCE(d.total_money,0) END AS rental,
    CASE WHEN n.native THEN COALESCE(d.total_renewal_amount,0) ELSE 0 END AS renewal,
    CASE WHEN n.native THEN COALESCE(a.adjustment,0)
      WHEN COALESCE(d.handler_price,0)<>0 THEN 0 ELSE COALESCE(d.money_out_date,0) END AS adjustment
  FROM himoto.order_vehicle_details d JOIN himoto.orders o ON o.id=d.order_id
  CROSS JOIN LATERAL (SELECT o.draft_payload::jsonb->'legacy_migration' IS NULL
    AND jsonb_typeof(o.draft_payload::jsonb #> '{management_composer,draft}')='object' AS native) n
  LEFT JOIN LATERAL (SELECT count(*) AS quantity,count(*) FILTER(WHERE sibling.id<d.id) AS position
    FROM himoto.order_vehicle_details sibling WHERE sibling.order_id=d.order_id AND sibling.deleted_at IS NULL) c ON n.native
  LEFT JOIN LATERAL (SELECT sum(CASE WHEN change->>'late_fee' ~ '^[0-9]{1,13}$' THEN (change->>'late_fee')::numeric
      - CASE WHEN change->>'early_discount' ~ '^[0-9]{1,13}$' THEN (change->>'early_discount')::numeric ELSE 0 END
      WHEN change->>'fee' ~ '^-?[0-9]{1,13}$' THEN (change->>'fee')::numeric
      - CASE WHEN change->>'repair_fee' ~ '^[0-9]{1,13}$' THEN (change->>'repair_fee')::numeric ELSE 0 END ELSE 0 END) AS adjustment
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(o.draft_payload::jsonb #> '{management_composer,return_adjustments}')='array'
      THEN o.draft_payload::jsonb #> '{management_composer,return_adjustments}' ELSE '[]'::jsonb END) change
    WHERE change->>'item_id'=d.id::text) a ON n.native
  WHERE d.deleted_at IS NULL AND o.deleted_at IS NULL AND ${VEHICLE_ORDER_SQL}
    AND o.order_status NOT IN ('draft','cancelled','cancel_pending_settlement','pending','deposit_contract')
    AND d.rent_at >= ($1::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
    AND d.rent_at < (($2::date+1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
)`;
export const VEHICLE_REVENUE_CTE = `${VEHICLE_REVENUE_LINES_CTE}, totals AS (
  SELECT vehicle_id,count(*)::int AS rentals,sum(rental) AS rental,sum(renewal) AS renewal,sum(adjustment) AS adjustment,sum(rental+renewal+adjustment) AS revenue
  FROM lines GROUP BY vehicle_id
), matched AS (
  SELECT v.id,v.name,v.license,COALESCE(s.store_name,'Chưa có cơ sở') AS store_name,v.type,v.year,
    COALESCE(t.rentals,0)::int AS rentals,COALESCE(t.rental,0) AS rental,COALESCE(t.renewal,0) AS renewal,COALESCE(t.adjustment,0) AS adjustment,COALESCE(t.revenue,0) AS revenue
  FROM himoto.vehicles v LEFT JOIN totals t ON t.vehicle_id=v.id LEFT JOIN himoto.stores s ON s.id=COALESCE(v.current_store_id,v.store_id)
  WHERE ($3::bigint IS NULL OR COALESCE(v.current_store_id,v.store_id)=$3)
    AND ($4='' OR strpos(lower(concat_ws(' ',v.name,v.license,v.id::text)),$4)>0)
)`;
function vehicleRow(row: Record<string, unknown>): VehicleRevenueRow {
  return { id: amount(row.id), name: String(row.name || ''), license: String(row.license || ''), store_name: String(row.store_name || ''),
    type: String(row.type || ''), year: row.year == null ? null : amount(row.year), rentals: amount(row.rentals),
    rental: amount(row.rental), renewal: amount(row.renewal), adjustment: amount(row.adjustment), revenue: amount(row.revenue) };
}
export async function vehicleRevenue(db: Database, params: URLSearchParams) {
  const { from, to, store } = rentalReportScope(params), search = (params.get('search') || '').trim().toLowerCase();
  if (search.length > 255) throw invalid();
  const page = integer(params.get('page') || '1', 1, 1_000_000), size = integer(params.get('size') || '10', 1, 50);
  const sort = params.get('sort') || 'revenue', direction = params.get('direction') || 'desc', mode = params.get('mode') || 'page';
  if (!['revenue', 'rentals', 'license'].includes(sort) || !['asc', 'desc'].includes(direction) || !['page', 'all'].includes(mode)) throw invalid();
  const values = [from, to, store, search];
  if (params.has('vehicle_id')) {
    const id = integer(params.get('vehicle_id') || '', 1, Number.MAX_SAFE_INTEGER);
    const result = await db.query(`${VEHICLE_REVENUE_CTE} SELECT l.* FROM lines l JOIN matched m ON m.id=l.vehicle_id WHERE m.id=$5 ORDER BY l.rent_at DESC,l.id DESC`, [...values, id]);
    return result.rows.map((row): VehicleRevenueDetail => ({ id: amount(row.id), order_id: amount(row.order_id), code: String(row.code),
      rent_at: row.rent_at ? new Date(row.rent_at).toISOString() : null, return_at: row.return_at ? new Date(row.return_at).toISOString() : null,
      rental: amount(row.rental), renewal: amount(row.renewal), adjustment: amount(row.adjustment), revenue: amount(row.rental) + amount(row.renewal) + amount(row.adjustment) }));
  }
  const result = await db.query(`${VEHICLE_REVENUE_CTE}, summary AS (
    SELECT count(*)::int AS total,COALESCE(sum(rentals),0) AS rentals,COALESCE(sum(rental),0) AS rental,COALESCE(sum(renewal),0) AS renewal,
      COALESCE(sum(adjustment),0) AS adjustment,COALESCE(sum(revenue),0) AS revenue FROM matched
  ), page AS (SELECT * FROM matched ORDER BY ${sort} ${direction},id DESC
    ${mode === 'page' ? 'LIMIT $5 OFFSET (SELECT (LEAST($6,GREATEST(1,ceil(total::numeric/$5)))::int-1)*$5 FROM summary)' : ''})
  SELECT summary.*,COALESCE((SELECT json_agg(p) FROM page p),'[]'::json) AS rows FROM summary`, mode === 'page' ? [...values, size, page] : values);
  const data = result.rows[0];
  return { total: amount(data.total), page: mode === 'all' ? 1 : Math.min(page, Math.max(1, Math.ceil(Number(data.total) / size))), size,
    rentals: amount(data.rentals), rental: amount(data.rental), renewal: amount(data.renewal), adjustment: amount(data.adjustment), revenue: amount(data.revenue), rows: data.rows.map(vehicleRow) };
}

// Same approved vouchers and categories as Cashbook. No per-contract snapshots
// are added to received money; daily/store subtotals reconcile to the overview.
export async function rentalOverview(db: Database, params: URLSearchParams) {
  const { from, to, store } = rentalReportScope(params), view = params.get('view') || 'stores';
  if (!['stores', 'days'].includes(view)) throw invalid();
  const key = view === 'days' ? "to_char(v.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh','YYYY-MM-DD')" : "COALESCE(v.store_id::text,'unassigned')";
  const name = view === 'days' ? key : "COALESCE(max(v.store_name),'Chưa có cơ sở')";
  const result = await db.query(`WITH vouchers AS (${CASHBOOK_LIST_SQL}) SELECT ${key} AS key,${name} AS name,
    ${CASHBOOK_BREAKDOWN_KEYS.map(field => `COALESCE(sum(v.amount) FILTER (WHERE v.amount_category='${field}'),0) AS ${field}`).join(',')}
    FROM vouchers v WHERE v.type IN ('in','addon','out')
      AND v.created_at>=($1::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
      AND v.created_at<(($2::date+1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
      AND ($3::bigint IS NULL OR v.store_id=$3)
      AND EXISTS(SELECT 1 FROM himoto.orders o WHERE o.id=v.order_id AND o.deleted_at IS NULL AND ${VEHICLE_ORDER_SQL})
    GROUP BY ${key} ORDER BY ${view === 'days' ? 'key DESC' : 'name,key'}`, [from, to, store]);
  const total = Object.fromEntries(CASHBOOK_BREAKDOWN_KEYS.map(field => [field, 0])) as CashbookBreakdown;
  const rows = result.rows.map(row => {
    const breakdown = Object.fromEntries(CASHBOOK_BREAKDOWN_KEYS.map(field => [field, amount(row[field])])) as CashbookBreakdown;
    for (const field of CASHBOOK_BREAKDOWN_KEYS) total[field] += breakdown[field];
    return rentalOverviewRow(String(row.key), String(row.name), breakdown);
  });
  for (const field of CASHBOOK_BREAKDOWN_KEYS) amount(total[field]);
  const summary = rentalOverviewRow('total', 'Tổng', total);
  for (const value of [summary.revenue, summary.income, summary.expense]) amount(value);
  return { rows, total: summary };
}
