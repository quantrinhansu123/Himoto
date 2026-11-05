import 'server-only';
import type { PoolClient } from 'pg';
import { type EstimatedSalesReport } from '@/lib/management/estimated-sales';
import { VEHICLE_ORDER_SQL } from './contract-classification';
import { RentalRevenueError } from './rental-revenue';
import { rentalSalesValueSql } from './rental-sales-value';

type Database = Pick<PoolClient, 'query'>;

const validDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

const amount = (value: unknown) => {
  if (value == null || !Number.isSafeInteger(Number(value)) || Number(value) < 0) {
    throw new RentalRevenueError('Số liệu doanh số không hợp lệ. Cần đối chiếu dữ liệu.');
  }
  return Number(value);
};

// Sum each contract value once. Dates select contracts; they do not prorate money.
export async function estimatedSales(db: Database, from: string, to: string, store?: number): Promise<EstimatedSalesReport> {
  if (!validDate(from) || !validDate(to) || from > to || store !== undefined && (!Number.isSafeInteger(store) || store <= 0)) {
    throw new RentalRevenueError('Kiểm tra khoảng ngày và cơ sở của báo cáo.');
  }

  const result = await db.query(`WITH scoped AS (
    SELECT o.id,${rentalSalesValueSql()} AS sales,
      COALESCE(lines.vehicles,0) AS vehicles,
      o.order_status IN ('renting','overdue','wait_payment','reserved')
        AND COALESCE(lines.open_lines,0)>0 AS active
    FROM himoto.orders o
    LEFT JOIN LATERAL (
      SELECT min(d.rent_at) AS started_at,count(DISTINCT d.vehicle_id)::int AS vehicles,
        count(*) FILTER (WHERE d.completed_at IS NULL)::int AS open_lines
      FROM himoto.order_vehicle_details d
      WHERE d.order_id=o.id AND d.deleted_at IS NULL
    ) lines ON true
    WHERE o.deleted_at IS NULL AND ${VEHICLE_ORDER_SQL}
      AND o.order_status NOT IN ('draft','pending','deposit_contract','cancelled','cancel_pending_settlement')
      AND (COALESCE(o.rent_at,lines.started_at) AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $1::date AND $2::date
      AND ($3::bigint IS NULL OR o.store_id=$3)
  )
  SELECT COALESCE(sum(sales),0)::bigint AS sales,count(*)::int AS contracts,
    COALESCE(sum(vehicles),0)::int AS vehicles,0::bigint AS vehicle_days,
    count(*) FILTER (WHERE active)::int AS active_contracts,
    count(*) FILTER (WHERE NOT active)::int AS finished_contracts
  FROM scoped`, [from, to, store ?? null]);

  const row = result.rows[0] || {};
  return {
    sales: amount(row.sales),
    contracts: amount(row.contracts),
    vehicles: amount(row.vehicles),
    vehicle_days: amount(row.vehicle_days),
    active_contracts: amount(row.active_contracts),
    finished_contracts: amount(row.finished_contracts),
  };
}
