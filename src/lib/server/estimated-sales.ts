import 'server-only';
import type { PoolClient } from 'pg';
import { emptyEstimatedSales, type EstimatedSalesReport } from '@/lib/management/estimated-sales';
import { VEHICLE_ORDER_SQL } from './contract-classification';
import { dailyPriceSql } from './contract-deposits';
import { RentalRevenueError } from './rental-revenue';

type Database = Pick<PoolClient, 'query'>;

const validDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

const amount = (value: unknown) => {
  if (value == null || !Number.isSafeInteger(Number(value)) || Number(value) < 0) {
    throw new RentalRevenueError('Số liệu doanh số ước tính không hợp lệ. Cần đối chiếu dữ liệu.');
  }
  return Number(value);
};

// Doanh số ước tính: chỉ HĐ có ngày bắt đầu thuê trong bộ lọc (from–to, cơ sở).
// Tiền thuê ước tính theo số ngày·xe còn nằm trong kỳ báo cáo của các HĐ đó.
export async function estimatedSales(db: Database, from: string, to: string, store?: number): Promise<EstimatedSalesReport> {
  if (!validDate(from) || !validDate(to) || from > to || store !== undefined && (!Number.isSafeInteger(store) || store <= 0)) {
    throw new RentalRevenueError('Kiểm tra khoảng ngày và cơ sở của báo cáo.');
  }

  const result = await db.query(`WITH lines AS (
    SELECT d.id,d.order_id,d.vehicle_id,
      (d.rent_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS start_day,
      CASE
        WHEN d.completed_at IS NOT NULL THEN (d.completed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
        WHEN o.order_status IN ('renting','overdue','wait_payment','reserved') THEN GREATEST(
          COALESCE((d.return_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,$2::date),
          LEAST($2::date,(timezone('Asia/Ho_Chi_Minh',now()))::date)
        )
        ELSE COALESCE((d.return_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,(d.rent_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)
      END AS end_day,
      CASE WHEN d.completed_at IS NULL AND o.order_status IN ('renting','overdue','wait_payment','reserved') THEN true ELSE false END AS active,
      ${dailyPriceSql()} AS daily_price,
      COALESCE(NULLIF(d.handler_price,0),NULLIF(d.total_money,0),0)+COALESCE(d.total_renewal_amount,0) AS line_fee,
      COALESCE(NULLIF(o.total_rental_fees,0),NULLIF(o.total::numeric,0),0) AS order_fee,
      (SELECT count(*)::int FROM himoto.order_vehicle_details x WHERE x.order_id=o.id AND x.deleted_at IS NULL) AS line_count
    FROM himoto.order_vehicle_details d
    JOIN himoto.orders o ON o.id=d.order_id
    WHERE d.deleted_at IS NULL AND o.deleted_at IS NULL AND ${VEHICLE_ORDER_SQL}
      AND o.order_status NOT IN ('draft','pending','deposit_contract','cancelled','cancel_pending_settlement')
      AND d.rent_at IS NOT NULL
      AND ($3::bigint IS NULL OR o.store_id=$3)
  ), scoped AS (
    SELECT order_id,vehicle_id,active,
      start_day AS overlap_start,
      LEAST(end_day,$2::date) AS overlap_end,
      GREATEST(end_day-start_day,1) AS scheduled_days,
      daily_price,line_fee,order_fee,line_count
    FROM lines
    WHERE start_day>=$1::date AND start_day<=$2::date AND end_day>=start_day
  ), valued AS (
    SELECT order_id,vehicle_id,active,
      GREATEST((overlap_end-overlap_start)+1,0) AS vehicle_days,
      CASE
        WHEN daily_price IS NOT NULL AND daily_price>0
          THEN round(daily_price::numeric*GREATEST((overlap_end-overlap_start)+1,0))
        WHEN line_fee>0 AND scheduled_days>0
          THEN round(line_fee::numeric*GREATEST((overlap_end-overlap_start)+1,0)/scheduled_days)
        WHEN order_fee>0 AND line_count>0 AND scheduled_days>0
          THEN round((order_fee::numeric/line_count)*GREATEST((overlap_end-overlap_start)+1,0)/scheduled_days)
        ELSE 0
      END AS sales
    FROM scoped
    WHERE overlap_end>=overlap_start
  ), by_order AS (
    SELECT order_id,bool_or(active) AS active,sum(sales) AS sales,sum(vehicle_days) AS vehicle_days,count(DISTINCT vehicle_id)::int AS vehicles
    FROM valued GROUP BY order_id
  )
  SELECT COALESCE(sum(sales),0)::bigint AS sales,
    count(*)::int AS contracts,
    COALESCE(sum(vehicles),0)::int AS vehicles,
    COALESCE(sum(vehicle_days),0)::bigint AS vehicle_days,
    count(*) FILTER (WHERE active)::int AS active_contracts,
    count(*) FILTER (WHERE NOT active)::int AS finished_contracts
  FROM by_order`, [from, to, store ?? null]);

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
