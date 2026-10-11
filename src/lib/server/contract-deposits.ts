import type { PoolClient } from 'pg';

// orders.pid is every approved receipt of the contract, deposit included. Deposit receipts are
// 'order:deposit' (legacy 'order:deposit:<id>'); refunds are 'order:deposit_refund' (legacy 'order:complete:<id>').
export const DEPOSIT_REFUND_NAME = 'order:deposit_refund';

export const depositLateral = (order = 'o') => `LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(t.value) FILTER (WHERE t.type IN ('in','addon') AND (t.name='order:deposit' OR t.name LIKE 'order:deposit:%')),0) AS paid,
      COALESCE(SUM(t.value) FILTER (WHERE t.type='out' AND (t.name='${DEPOSIT_REFUND_NAME}' OR t.name LIKE 'order:complete:%')),0) AS refunded
    FROM himoto.transactions t WHERE t.order_id=${order}.id AND t.status='approved'
  ) dep ON true`;

export const rentalPaidSql = (order = 'o') => `CASE WHEN NULLIF(${order}.pid::text,'') IS NULL THEN NULL ELSE GREATEST(${order}.pid::numeric - dep.paid, 0) END`;

// Daily price of a vehicle line: its hiring_fee, else the original rental fee spread over the
// original days (draft start/end) and the contract's vehicle lines.
const LOCAL_TIME = `'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$'`;
export const dailyPriceSql = (line = 'd', order = 'o') => {
  const field = (key: string) => `(${order}.draft_payload::jsonb #>> '{management_composer,draft,${key}}')`;
  return `CASE WHEN ${line}.type<>'day' THEN NULL WHEN ${line}.hiring_fee > 0 THEN ${line}.hiring_fee
    WHEN ${order}.total_rental_fees > 0 AND ${field('start_date')} ~ ${LOCAL_TIME} AND ${field('end_date')} ~ ${LOCAL_TIME}
      THEN round(${order}.total_rental_fees::numeric / NULLIF(GREATEST(ceil(extract(epoch FROM (${field('end_date')}::timestamp - ${field('start_date')}::timestamp)) / 86400), 1)
        * (SELECT count(*) FROM himoto.order_vehicle_details x WHERE x.order_id=${order}.id AND x.deleted_at IS NULL), 0))
  END`;
};

export async function rentalPaid(client: Pick<PoolClient, 'query'>, orderId: number, pid: unknown): Promise<number | null> {
  if (pid == null || pid === '') return null;
  const result = await client.query(`SELECT COALESCE(SUM(value),0) AS paid FROM himoto.transactions
    WHERE order_id=$1 AND status='approved' AND type IN ('in','addon') AND (name='order:deposit' OR name LIKE 'order:deposit:%')`, [orderId]);
  return Math.max(Number(pid) - Number(result.rows[0].paid), 0);
}
