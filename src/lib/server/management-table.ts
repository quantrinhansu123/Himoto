import 'server-only';
import type { PoolClient } from 'pg';
import { MANAGEMENT_CONFIG } from '@/lib/management/config';
import { mapApiRow } from '@/lib/management/repository';
import { EMPTY_QUERY } from '@/lib/management/table-utils';
import { projectManagementTable, type ManagementTableInput, type TableKind } from '@/lib/management/management-table';
import { CONTRACT_LIST_SQL, contractIndexSql, contractListScopeClause } from './contract-drafts';
import { CUSTOMER_PROFILE_SQL } from './customer-search';
import { contractVehicleDetailsSql } from './contract-vehicle-reads';

export class ManagementTableError extends Error {}
export function parseManagementTable(kind:TableKind,params:URLSearchParams):ManagementTableInput {
  const integer=(key:string,fallback:number,max:number)=>{const value=params.get(key);if(value===null)return fallback;if(!/^[1-9]\d*$/.test(value)||!Number.isSafeInteger(Number(value))||Number(value)>max)throw new ManagementTableError('Phân trang không hợp lệ.');return Number(value);};
  const page=integer('page',1,1000000),size=integer('size',10,50),direction=params.get('direction')||'asc',scope=params.get('scope')||'';
  if(!['asc','desc'].includes(direction)||!['','drafts','vat','overdue','ownership','due','renewable','remindable'].includes(scope)||kind!=='contracts'&&scope)throw new ManagementTableError('Phạm vi hoặc sắp xếp không hợp lệ.');
  const sort=params.get('sort')||'code',allowed=new Set([...MANAGEMENT_CONFIG[kind].columns.map(column=>column.key),'code','contract_type_name','overdue_days','billing_next_due_at','billing_due_amount','company_paid_amount']);
  if(!allowed.has(sort))throw new ManagementTableError('Cột sắp xếp không hợp lệ.');
  const store=params.get('store')||'all';if(store!=='all'&&(!/^[1-9]\d*$/.test(store)||!Number.isSafeInteger(Number(store))))throw new ManagementTableError('Cơ sở không hợp lệ.');
  const filters:Record<string,string>={};const keys=new Set([...MANAGEMENT_CONFIG[kind].filters.map(filter=>filter.key),'contract_type_id','customer_id','id']);
  for(const[key,value]of params)if(key.startsWith('filter_')){const field=key.slice(7);if(!keys.has(field)||value.length>100)throw new ManagementTableError('Bộ lọc không hợp lệ.');filters[field]=value;}
  const from=params.get('from')||'',to=params.get('to')||'';for(const date of [from,to])if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))))throw new ManagementTableError('Khoảng ngày không hợp lệ.');
  const search=params.get('search')||'',status=params.get('status')||'',days=params.get('overdue_days')||'',compare=params.get('overdue_compare')||'eq';
  const recent=params.get('recent')||'';
  if(search.length>500||status.length>100||days&&!/^\d{1,5}$/.test(days)||!['eq','gt','lt'].includes(compare)||params.has('all')&&params.get('all')!=='1')throw new ManagementTableError('Bộ lọc không hợp lệ.');
  if(recent&&(!/^[1-9]\d{0,3}$/.test(recent)||Number(recent)>3660))throw new ManagementTableError('Khoảng ngày gần đây không hợp lệ.');
  return {kind,page,size,sort,direction:direction as 'asc'|'desc',scope,store,...(recent?{recentDays:Number(recent)}:{}),query:{...EMPTY_QUERY,filters,search,status,startDate:from,endDate:to,overdueDays:days,overdueCompare:compare as 'eq'|'gt'|'lt'}};
}
function contractScopeClause(scope:string) {
  return scope==='due' ? ` AND o.order_status IN ('renting','overdue','wait_payment','bad_debt') AND o.draft_payload::jsonb #> '{management_composer,installment_plan}' IS NOT NULL`
    : scope==='renewable' ? ` AND o.order_status IN ('renting','overdue') AND o.draft_payload::jsonb #> '{management_composer,installment_plan}' IS NULL` : contractListScopeClause(scope);
}
/** Push status tabs into SQL so Đang thuê does not index every open/historical row first. */
export function contractStatusClause(status:string) {
  if(!status)return '';
  if(status==='renting')return ` AND o.order_status IN ('renting','overdue')`;
  if(status==='overdue')return ` AND (o.order_status='overdue' OR o.order_status='renting' AND COALESCE(o.return_at, ov.end_date) < now())`;
  if(!/^[a-z][a-z0-9_]{0,63}$/.test(status))throw new ManagementTableError('Bộ lọc không hợp lệ.');
  return ` AND o.order_status='${status}'`;
}
/** Recent created/started rentals plus every still-open contract so operations are never hidden. */
export function contractRecentClause(days:number) {
  return ` AND (
    o.order_status IN ('draft','renting','overdue','wait_payment','deposit_contract','pending','bad_debt')
    OR o.created_at >= (timezone('Asia/Ho_Chi_Minh', now()) - interval '${days} days')
    OR COALESCE(o.rent_at, ov.start_date) >= (timezone('Asia/Ho_Chi_Minh', now()) - interval '${days} days')
  )`;
}
export async function readManagementTable(client:Pick<PoolClient,'query'>,kind:TableKind,params:URLSearchParams) {
  const input=parseManagementTable(kind,params);
  const recentDays=input.recentDays&&!input.scope&&!input.query.search.trim()&&!input.query.startDate&&!input.query.endDate
    &&!input.query.filters.customer_id&&!input.query.filters.id ? input.recentDays : undefined;
  const clause=kind==='contracts'
    ? `${contractScopeClause(input.scope)}${contractStatusClause(input.query.status)}${recentDays?contractRecentClause(recentDays):''}`
    : '';
  const all=params.get('all')==='1';
  // Paged contract lists: lean index for filter/sort/totals, then hydrate only the visible page.
  if(kind==='contracts'&&!all){
    const indexed=await client.query(contractVehicleDetailsSql(contractIndexSql(clause)));
    const projected=projectManagementTable(indexed.rows.map(row=>mapApiRow(kind,row)),recentDays?{...input,recentDays}:input,false);
    if(!projected.rows.length)return projected;
    const ids=projected.rows.map(row=>row.id);
    let details;
    try {
      details=await client.query(contractVehicleDetailsSql(`${CONTRACT_LIST_SQL} AND o.id=ANY($1::bigint[])`),[ids]);
    } catch (cause) {
      console.error('Contract page hydrate failed; serving lean index rows.', cause instanceof Error ? cause.message : cause);
      return {...projected,recentDays:recentDays??null};
    }
    const mapped=new Map(details.rows.map(row=>{const record=mapApiRow(kind,row);return [record.id,record];}));
    // Keep the lean row if detail hydrate misses an id so the Đang thuê page never goes blank.
    projected.rows=projected.rows.map(row=>{
      const detail=mapped.get(row.id);
      if(!detail)return row;
      return {...detail,...(input.scope==='overdue'?{overdue_days:row.overdue_days}:{}),...(row.billing_plan_json?{billing_plan_json:row.billing_plan_json,billing_due_amount:row.billing_due_amount,billing_next_due_at:row.billing_next_due_at,billing_overdue_at:row.billing_overdue_at}:{})};
    });
    return {...projected,recentDays:recentDays??null};
  }
  const fullSql=kind==='contracts' ? `${CONTRACT_LIST_SQL}${clause}` : CUSTOMER_PROFILE_SQL;
  const sql=kind==='contracts' ? fullSql
    : `SELECT id,name,phone,id_card,address,status,warning,store_id,store_name,contract_count FROM (${CUSTOMER_PROFILE_SQL}) listing`;
  const result=await client.query(kind==='contracts' ? contractVehicleDetailsSql(sql) : sql);
  const projected=projectManagementTable(result.rows.map(row=>mapApiRow(kind,row)),input,all);
  if(kind==='contracts'||!projected.rows.length)return projected;
  const ids=projected.rows.map(row=>row.id);
  const details=await client.query(`${fullSql} WHERE c.id=ANY($1::bigint[])`,[ids]);
  const mapped=new Map(details.rows.map(row=>{const record=mapApiRow(kind,row);return [record.id,record];}));
  projected.rows=projected.rows.flatMap(row=>{const detail=mapped.get(row.id);return detail ? [detail] : [];});
  return projected;
}
