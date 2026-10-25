import 'server-only';
import type {ManagementRow} from '@/lib/management/types';
import type {PoolClient} from 'pg';
import {projectManagementTable,type ManagementTableInput} from '@/lib/management/management-table';
import {applyInstallmentBilling} from '@/lib/management/contract-billing';
import {withContractMonitoring} from '@/lib/management/contract-overdue';
import {dateTimeInput} from '@/lib/management/contract-document';
import {BAD_DEBT_CUTOFF_SQL} from './contract-bad-debt';
import {EFFECTIVE_RENTAL_TYPE_SQL,VEHICLE_ORDER_SQL} from './contract-classification';
import {depositReceiptSql,rentalPaidSql} from './contract-deposits';

/** Counts and balances need dates and numeric fields, not every vehicle,
 * customer document or form field from 26,000 historical contracts. */
export function contractStatisticsSql(scopeClause:string,company:boolean){
 const needsPaid=`(o.order_status IN('renting','overdue','wait_payment','reserved','bad_debt') OR o.draft_payload #> '{management_composer,installment_plan}' IS NOT NULL)`;
 return `SELECT o.id,COALESCE(NULLIF(o.contract_number,''),o.draft_reference,'#'||o.id::text) AS code,
   CASE WHEN o.order_status='renting' AND COALESCE(o.return_at,dates.end_date)<now() THEN 'overdue' ELSE o.order_status END AS status,
   o.customer_id,c.status AS customer_status,o.store_id,s.kind AS store_kind,
   ${EFFECTIVE_RENTAL_TYPE_SQL} AS rental_type,
   o.draft_payload #>> '{management_composer,draft,contract_type_id}' AS contract_type_id,
   COALESCE(o.rent_at,dates.start_date) AS start_date,COALESCE(o.return_at,dates.end_date) AS end_date,
   o.contract_signed_on AS signed_on,o.total AS total_amount,
   CASE WHEN ${needsPaid} THEN ${rentalPaidSql()} ELSE NULL END AS paid_amount,
   o.draft_payload #> '{management_composer,installment_plan}' AS installment_plan,
   ${BAD_DEBT_CUTOFF_SQL} AS bad_debt_at,
   ${company?'company.payment_count':'0::int'} AS company_payment_count
   FROM himoto.orders o LEFT JOIN himoto.customers c ON c.id=o.customer_id LEFT JOIN himoto.stores s ON s.id=o.store_id
   LEFT JOIN LATERAL (
     SELECT min(d.rent_at) AS start_date,max(d.return_at) AS end_date FROM himoto.order_vehicle_details d
     WHERE d.order_id=o.id AND d.deleted_at IS NULL AND (o.rent_at IS NULL OR o.return_at IS NULL)
   ) dates ON true
   LEFT JOIN LATERAL (
     SELECT COALESCE(sum(t.value),0) AS paid FROM himoto.transactions t
     WHERE t.order_id=o.id AND t.status='approved' AND t.type IN('in','addon') AND ${depositReceiptSql()} AND ${needsPaid}
   ) dep ON true
   ${company?`LEFT JOIN LATERAL (SELECT count(*)::int AS payment_count FROM himoto.transactions t WHERE t.order_id=o.id
     AND t.status='approved' AND t.type IN('in','addon') AND t.bank_owner_type='company') company ON true`:''}
   WHERE o.deleted_at IS NULL AND ${VEHICLE_ORDER_SQL}${scopeClause}`;
}

/** Keep unknown money as undefined, exactly as the ordinary row mapper does.
 * Installment accrual and bad-debt cutoffs still use the shared billing logic. */
export function mapContractStatistics(raw:Record<string,unknown>):ManagementRow{
 const text=(v:unknown)=>v==null?'':v instanceof Date?v.toISOString():String(v);
 const number=(v:unknown)=>v==null||v===''||!Number.isFinite(Number(v))?undefined:Number(v);
 const id=number(raw.id);if(id===undefined)throw Error('Thống kê hợp đồng thiếu ID.');
 const type=text(raw.rental_type),code=text(raw.code);
 return {id,code,name:code,status:text(raw.status),customer_id:number(raw.customer_id),
   customer_status:raw.customer_status==null?undefined:['2','blacklist','bad_debt'].includes(text(raw.customer_status))?'blacklist':text(raw.customer_status),
   store_id:number(raw.store_id),store_kind:text(raw.store_kind),rental_type:type,contract_type_id:text(raw.contract_type_id)||type,
   ownership_term_months:type==='ownership'?'custom':'',start_date:dateTimeInput(raw.start_date)||text(raw.start_date),end_date:dateTimeInput(raw.end_date)||text(raw.end_date),
   signed_on:text(raw.signed_on),total_amount:number(raw.total_amount),paid_amount:number(raw.paid_amount),company_payment_count:number(raw.company_payment_count),
   billing_plan_json:raw.installment_plan?JSON.stringify(raw.installment_plan):'',bad_debt_at:text(raw.bad_debt_at),
   overdue_items_json:Array.isArray(raw.overdue_items)?JSON.stringify(raw.overdue_items):undefined};
}

/** Historical closed rentals have no accrual or receivable. Aggregate those in
 * PostgreSQL and send only open/complex contracts through shared billing code.
 * Unknown/legacy money formats keep the ordinary JS path, never become zero. */
export async function fastContractStatistics(db:Pick<PoolClient,'query'>,input:ManagementTableInput,scope:string,now:number){
 if(!['','vat'].includes(input.scope)||input.query.search.trim()||input.query.startDate||input.query.endDate||input.query.overdueDays||input.query.overdueBucket||Object.values(input.query.filters).some(Boolean)||['overdue','bad_debt'].includes(input.query.status))return;
 const result=(await db.query(`WITH source AS MATERIALIZED (${contractStatisticsSql(scope,input.scope==='vat')}),
   split AS MATERIALIZED (SELECT *,status IN('draft','renting','overdue','wait_payment','reserved','bad_debt') OR installment_plan IS NOT NULL
     OR NOT(total_amount IS NULL OR total_amount='' OR total_amount ~ '^[0-9]{1,13}$') AS needs_detail FROM source),
   closed AS MATERIALIZED (SELECT * FROM split WHERE NOT needs_detail),
   selected AS (SELECT * FROM closed WHERE $1::text='' OR status=$1 OR $1='renting' AND status='overdue')
   SELECT COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM split s WHERE needs_detail),'[]'::jsonb) AS detailed,
     (SELECT count(*)::int FROM closed) AS closed_total,(SELECT count(*)::int FROM selected) AS closed_selected,
     COALESCE((SELECT jsonb_agg(jsonb_build_array(status,n) ORDER BY status) FROM (SELECT status,count(*)::int AS n FROM closed GROUP BY status) c),'[]'::jsonb) AS closed_counts,
     COALESCE((SELECT jsonb_agg(DISTINCT customer_id) FROM selected WHERE customer_status=2),'[]'::jsonb) AS blacklist,
     (SELECT count(*)::int FROM selected WHERE status NOT IN('draft','cancelled','bad_debt') AND (total_amount IS NULL OR total_amount='')) AS unknown_totals,
     (SELECT COALESCE(sum(NULLIF(total_amount,'')::numeric),0) FROM selected WHERE status NOT IN('draft','cancelled','bad_debt')) AS closed_amount`,[input.query.status])).rows[0];
 if(!result||!Array.isArray(result.detailed)||!Array.isArray(result.closed_counts)||!Array.isArray(result.blacklist))throw Error('Không đọc được thống kê hợp đồng.');
 const amount=Number(result.closed_amount);
 if(!Number.isSafeInteger(amount))return; // Preserve the original addition semantics for unusually large totals.
 const detailed=result.detailed.map(mapContractStatistics).map((row:ManagementRow)=>withContractMonitoring(applyInstallmentBilling(row,now),now));
 const stats=projectManagementTable(detailed,{...input,page:1,size:1},true,now);
 const counts=new Map(stats.statusCounts);
 for(const [status,count] of result.closed_counts as [string,number][])counts.set(status,(counts.get(status)||0)+count);
 const blacklist=new Set<number>(result.blacklist.map(Number));
 for(const row of stats.rows)if(row.customer_status==='blacklist')blacklist.add(Number(row.customer_id));
 return {...stats,total:stats.total+result.closed_selected,tabCount:stats.tabCount+result.closed_total,
   statusCounts:[...counts].sort(([a],[b])=>a.localeCompare(b)),statuses:[...new Set([...stats.statuses,...result.closed_counts.map(([status]:[string,number])=>status)])].sort(),
   summary:stats.summary&&{...stats.summary,contractCount:stats.summary.contractCount+result.closed_selected,blacklistCount:blacklist.size,
     totalAmount:stats.summary.totalAmount===null||result.unknown_totals>0?null:stats.summary.totalAmount+amount}};
}
