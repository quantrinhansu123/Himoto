import 'server-only';
import type { PoolClient } from 'pg';
import { mapApiRow } from '@/lib/management/repository';
import { summarizeBySalesStaff, summarizeByStore, summarizeSalesKpis } from '@/lib/management/source-sales';
import { contractTableSql } from './contract-drafts';

export class PageSummaryError extends Error {}
export async function readOperationsSummary(client:Pick<PoolClient,'query'>) {
  const result=await client.query(`SELECT o.store_id,count(*)::int AS active,
    count(*) FILTER (WHERE o.order_status='overdue' OR o.order_status='renting' AND COALESCE(o.return_at,ov.end_date)<now())::int AS overdue
    FROM himoto.orders o LEFT JOIN LATERAL (SELECT max(d.return_at) AS end_date FROM himoto.order_vehicle_details d WHERE d.order_id=o.id AND d.deleted_at IS NULL) ov ON o.return_at IS NULL
    WHERE o.deleted_at IS NULL AND o.order_status IN ('renting','overdue','wait_payment') GROUP BY o.store_id`);
  return {stores:result.rows};
}
export async function readSalesSummary(client:Pick<PoolClient,'query'>,params:URLSearchParams) {
  const from=params.get('from')||'',to=params.get('to')||'',store=params.get('store')||'all';
  const realDate=(date:string)=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date;
  if(!realDate(from)||!realDate(to)||from>to||store!=='all'&&(!/^[1-9]\d*$/.test(store)||!Number.isSafeInteger(Number(store))))throw new PageSummaryError('Kiểm tra khoảng ngày và cơ sở.');
  // The original browser summaries compare the UTC ISO start_date prefix.
  const result=await client.query(contractTableSql(` AND (COALESCE(o.rent_at,ov.start_date) AT TIME ZONE 'UTC')::date BETWEEN $1::date AND $2::date
    AND ($3::bigint IS NULL OR o.store_id=$3)`),[from,to,store==='all'?null:Number(store)]);
  const staff=await client.query('SELECT id,full_name AS name FROM himoto.staff_profiles');
  const rows=result.rows.map(row=>mapApiRow('contracts',row));
  return {sources:summarizeBySalesStaff(rows,from,to,store,staff.rows),stores:summarizeByStore(rows,from,to,store),kpis:summarizeSalesKpis(rows,from,to,store)};
}
