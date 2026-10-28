import 'server-only';
import type { PoolClient } from 'pg';
import { mapApiRow } from '@/lib/management/repository';
import { summarizeBySalesStaff, summarizeByStore, summarizeSalesKpis } from '@/lib/management/source-sales';
import { depositLateral,rentalPaidSql } from './contract-deposits';
import { VEHICLE_ORDER_SQL } from './contract-classification';

export class PageSummaryError extends Error {}
export async function readOperationsSummary(client:Pick<PoolClient,'query'>) {
  const result=await client.query(`SELECT o.store_id,count(*)::int AS active,
    count(*) FILTER (WHERE o.order_status='overdue' OR o.order_status='renting' AND COALESCE(o.return_at,ov.end_date)<now())::int AS overdue
    FROM himoto.orders o LEFT JOIN LATERAL (SELECT max(d.return_at) AS end_date FROM himoto.order_vehicle_details d WHERE d.order_id=o.id AND d.deleted_at IS NULL) ov ON o.return_at IS NULL
    WHERE o.deleted_at IS NULL AND ${VEHICLE_ORDER_SQL} AND o.order_status IN ('renting','overdue','wait_payment') GROUP BY o.store_id`);
  return {stores:result.rows};
}
export async function readSalesSummary(client:Pick<PoolClient,'query'>,params:URLSearchParams) {
  const from=params.get('from')||'',to=params.get('to')||'',store=params.get('store')||'all';
  const realDate=(date:string)=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date;
  if(!realDate(from)||!realDate(to)||from>to||store!=='all'&&(!/^[1-9]\d*$/.test(store)||!Number.isSafeInteger(Number(store))))throw new PageSummaryError('Kiểm tra khoảng ngày và cơ sở.');
  // Resolve dates and scope first. A summary does not need every customer's
  // documents, vehicle payload, company receipts or representative joins.
  const draftAmount=(path:string)=>`CASE WHEN o.draft_payload #>> '{management_composer,draft,${path}}' ~ '^[0-9]{1,13}$'
    THEN (o.draft_payload #>> '{management_composer,draft,${path}}')::numeric ELSE NULL END`;
  const orderTotal=`CASE WHEN o.total::text ~ '^[0-9]{1,13}$' THEN o.total::numeric ELSE NULL END`;
  const draftMoney=`COALESCE(${draftAmount('total_amount')},${orderTotal})`;
  const result=await client.query(`WITH scoped AS MATERIALIZED (
    SELECT o.*,COALESCE(o.rent_at,dates.start_date) AS started_at,COALESCE(o.return_at,dates.end_date) AS ended_at
    FROM himoto.orders o LEFT JOIN LATERAL (
      SELECT min(d.rent_at) AS start_date,max(d.return_at) AS end_date FROM himoto.order_vehicle_details d
      WHERE d.order_id=o.id AND d.deleted_at IS NULL
    ) dates ON o.rent_at IS NULL OR o.return_at IS NULL
    WHERE o.deleted_at IS NULL AND ${VEHICLE_ORDER_SQL}
      AND (o.order_status NOT IN ('draft','pending','deposit_contract','cancelled','cancel_pending_settlement')
        OR o.order_status='draft' AND ${draftMoney} IS NOT NULL)
      AND (COALESCE(o.rent_at,dates.start_date) AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $1::date AND $2::date
      AND ($3::bigint IS NULL OR o.store_id=$3)
  ) SELECT o.id,o.customer_id,COALESCE(c.name,o.customer_name) AS customer_name,o.store_id,s.store_name,
    CASE WHEN o.order_status='renting' AND o.ended_at<now() THEN 'overdue' ELSE o.order_status END AS status,
    o.started_at AS start_date,
    CASE WHEN o.order_status='draft' THEN ${draftMoney}::text ELSE o.total END AS total_amount,
    ${rentalPaidSql()} AS paid_amount,
    CASE WHEN o.order_status='draft' THEN COALESCE(${draftAmount('deposit_amount')},
        CASE WHEN o.first_deposit_amount IS NULL AND o.additional_deposit_amount IS NULL THEN NULL
          ELSE COALESCE(o.first_deposit_amount,0)+COALESCE(o.additional_deposit_amount,0) END)
      WHEN o.first_deposit_amount IS NULL AND o.additional_deposit_amount IS NULL THEN NULL
      ELSE COALESCE(o.first_deposit_amount,0)+COALESCE(o.additional_deposit_amount,0) END AS deposit_amount,
    COALESCE(o.draft_payload #>> '{management_composer,profile,sales_staff_id}',o.draft_payload #>> '{management_composer,draft,sales_staff_id}') AS sales_staff_id,
    COALESCE(o.draft_payload #>> '{management_composer,profile_attribution,NVKD,name}',o.draft_payload #>> '{management_composer,sales_attribution,NVKD,name}') AS sales_staff_name
    FROM scoped o LEFT JOIN himoto.customers c ON c.id=o.customer_id LEFT JOIN himoto.stores s ON s.id=o.store_id
    ${depositLateral()}`,[from,to,store==='all'?null:Number(store)]);
  const staff=await client.query('SELECT id,full_name AS name FROM himoto.staff_profiles');
  const rows=result.rows.map(row=>mapApiRow('contracts',row));
  return {sources:summarizeBySalesStaff(rows,from,to,store,staff.rows),stores:summarizeByStore(rows,from,to,store),kpis:summarizeSalesKpis(rows,from,to,store)};
}
