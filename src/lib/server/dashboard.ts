import 'server-only';
import type { PoolClient } from 'pg';
import type { DashboardStoreRow, DashboardSummary } from '@/lib/management/dashboard';
import { EFFECTIVE_RENTAL_TYPE_SQL, VEHICLE_ORDER_SQL } from './contract-classification';
import { rentalOverview, rentalReportScope, RentalReportError } from './rental-reports';
import { rentalSalesValueSql } from './rental-sales-value';

type Database = Pick<PoolClient, 'query'>;

const amount = (value: unknown) => {
  if (value == null || !Number.isSafeInteger(Number(value))) throw new RentalReportError('Số liệu Dashboard không hợp lệ. Cần đối chiếu dữ liệu.');
  return Number(value);
};

const count = (value: unknown) => {
  if (value == null || !Number.isSafeInteger(Number(value)) || Number(value) < 0) throw new RentalReportError('Số liệu Dashboard không hợp lệ. Cần đối chiếu dữ liệu.');
  return Number(value);
};

function emptyMetrics(): Omit<DashboardStoreRow, 'key' | 'name'> {
  return { contracts: 0, rental_contracts: 0, ownership_contracts: 0, overdue_contracts: 0, sales: 0, revenue: 0, repair: 0 };
}

export async function readDashboardSummary(db: Database, params: URLSearchParams): Promise<DashboardSummary> {
  const { from, to, store } = rentalReportScope(params);

  const [contracts, cash] = await Promise.all([
    db.query(`WITH scoped AS (
      SELECT o.store_id,s.store_name,
        -- orders.total is text in Himoto; never COALESCE it directly with an integer 0.
        ${rentalSalesValueSql()} AS total,
        CASE WHEN ${EFFECTIVE_RENTAL_TYPE_SQL} IN ('ownership','ownership_cd') THEN true ELSE false END AS is_ownership,
        CASE WHEN o.order_status='renting' AND COALESCE(o.return_at,dates.end_date)<now() THEN 'overdue' ELSE o.order_status END AS status
      FROM himoto.orders o
      LEFT JOIN himoto.stores s ON s.id=o.store_id
      LEFT JOIN LATERAL (
        SELECT min(d.rent_at) AS start_date,max(d.return_at) AS end_date
        FROM himoto.order_vehicle_details d WHERE d.order_id=o.id AND d.deleted_at IS NULL
      ) dates ON o.rent_at IS NULL OR o.return_at IS NULL
      WHERE o.deleted_at IS NULL AND ${VEHICLE_ORDER_SQL}
        AND o.order_status NOT IN ('draft','pending','deposit_contract','cancelled','cancel_pending_settlement')
        AND (COALESCE(o.rent_at,dates.start_date) AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $1::date AND $2::date
        AND ($3::bigint IS NULL OR o.store_id=$3)
    )
    SELECT COALESCE(store_id::text,'unassigned') AS key,COALESCE(max(store_name),'Chưa có cơ sở') AS name,
      count(*)::int AS contracts,
      count(*) FILTER (WHERE NOT is_ownership)::int AS rental_contracts,
      count(*) FILTER (WHERE is_ownership)::int AS ownership_contracts,
      count(*) FILTER (WHERE status IN ('overdue','bad_debt'))::int AS overdue_contracts,
      COALESCE(sum(total),0)::bigint AS sales
    FROM scoped GROUP BY store_id ORDER BY name,key`, [from, to, store]),
    rentalOverview(db,new URLSearchParams({from,to,view:'stores',...(store===null?{}:{store_id:String(store)})}))
      .then(report=>({rows:report.rows.map(row=>({key:row.key,name:row.name,revenue:row.revenue,repair:row.breakdown.repair_income}))})),
  ]);

  const rows = new Map<string, DashboardStoreRow>();
  for (const row of contracts.rows) {
    const key = String(row.key);
    rows.set(key, {
      key,
      name: String(row.name || 'Chưa có cơ sở'),
      contracts: count(row.contracts),
      rental_contracts: count(row.rental_contracts),
      ownership_contracts: count(row.ownership_contracts),
      overdue_contracts: count(row.overdue_contracts),
      sales: amount(row.sales),
      revenue: 0,
      repair: 0,
    });
  }
  for (const row of cash.rows) {
    const key = String(row.key);
    const current = rows.get(key) || { key, name: String(row.name || 'Chưa có cơ sở'), ...emptyMetrics() };
    current.name = String(row.name || current.name);
    current.revenue = amount(row.revenue);
    current.repair = amount(row.repair);
    rows.set(key, current);
  }

  const list = [...rows.values()].sort((a, b) => Number(a.key === 'unassigned') - Number(b.key === 'unassigned')
    || a.name.localeCompare(b.name, 'vi') || a.key.localeCompare(b.key));
  const total = list.reduce((sum, row) => ({
    contracts: sum.contracts + row.contracts,
    rental_contracts: sum.rental_contracts + row.rental_contracts,
    ownership_contracts: sum.ownership_contracts + row.ownership_contracts,
    overdue_contracts: sum.overdue_contracts + row.overdue_contracts,
    sales: sum.sales + row.sales,
    revenue: sum.revenue + row.revenue,
    repair: sum.repair + row.repair,
  }), emptyMetrics());

  return { from, to, rows: list, total };
}
