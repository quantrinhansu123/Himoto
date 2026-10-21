import 'server-only';
import type { PoolClient } from 'pg';
import { MANAGEMENT_CONFIG } from '@/lib/management/config';
import { mapApiRow } from '@/lib/management/repository';
import { EMPTY_QUERY } from '@/lib/management/table-utils';
import { projectManagementTable, type ManagementTableInput, type ManagementTableResult, type TableKind } from '@/lib/management/management-table';
import { CONTRACT_LIST_SQL, contractListScopeClause } from './contract-drafts';
import { CUSTOMER_PROFILE_SQL } from './customer-search';
import { contractVehicleDetailsSql,contractVehicleReadSource } from './contract-vehicle-reads';
import { dailyPriceSql } from './contract-deposits';
import { OVERDUE_BUCKETS,type OverdueBucket } from '@/lib/management/contract-overdue';

export class ManagementTableError extends Error {}
export function parseManagementTable(kind:TableKind,params:URLSearchParams):ManagementTableInput {
  const integer=(key:string,fallback:number,max:number)=>{const value=params.get(key);if(value===null)return fallback;if(!/^[1-9]\d*$/.test(value)||!Number.isSafeInteger(Number(value))||Number(value)>max)throw new ManagementTableError('Phân trang không hợp lệ.');return Number(value);};
  const page=integer('page',1,1000000),size=integer('size',10,50),direction=params.get('direction')||'asc',scope=params.get('scope')||'';
  if(!['asc','desc'].includes(direction)||!['','drafts','vat','overdue','ownership','due','renewable','remindable'].includes(scope)||kind!=='contracts'&&scope)throw new ManagementTableError('Phạm vi hoặc sắp xếp không hợp lệ.');
  const sort=params.get('sort')||'code',allowed=new Set([...MANAGEMENT_CONFIG[kind].columns.map(column=>column.key),'code','contract_type_name','overdue_days','overdue_minutes','overdue_fee_estimate','rental_debt_amount','contract_signed_at','monitoring_amount','contract_gps_status','billing_next_due_at','billing_due_amount','company_paid_amount']);
  if(!allowed.has(sort))throw new ManagementTableError('Cột sắp xếp không hợp lệ.');
  const store=params.get('store')||'all';if(store!=='all'&&(!/^[1-9]\d*$/.test(store)||!Number.isSafeInteger(Number(store))))throw new ManagementTableError('Cơ sở không hợp lệ.');
  const filters:Record<string,string>={};const keys=new Set([...MANAGEMENT_CONFIG[kind].filters.map(filter=>filter.key),'contract_type_id','customer_id','id']);
  for(const[key,value]of params)if(key.startsWith('filter_')){const field=key.slice(7);if(!keys.has(field)||value.length>100)throw new ManagementTableError('Bộ lọc không hợp lệ.');filters[field]=value;}
  const from=params.get('from')||'',to=params.get('to')||'';for(const date of [from,to])if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))))throw new ManagementTableError('Khoảng ngày không hợp lệ.');
  const search=params.get('search')||'',status=params.get('status')||'',days=params.get('overdue_days')||'',compare=params.get('overdue_compare')||'eq';
  const recent=params.get('recent')||'';
  const bucket=params.get('overdue_bucket')||'';
  if(bucket&&(kind!=='contracts'||!OVERDUE_BUCKETS.some(item=>item.key===bucket)))throw new ManagementTableError('Nhóm quá hạn không hợp lệ.');
  if(search.length>500||status.length>100||days&&!/^\d{1,5}$/.test(days)||!['eq','gt','lt'].includes(compare)||params.has('all')&&params.get('all')!=='1')throw new ManagementTableError('Bộ lọc không hợp lệ.');
  if(recent&&(!/^[1-9]\d{0,3}$/.test(recent)||Number(recent)>3660))throw new ManagementTableError('Khoảng ngày gần đây không hợp lệ.');
  return {kind,page,size,sort,direction:direction as 'asc'|'desc',scope,store,...(recent?{recentDays:Number(recent)}:{}),query:{...EMPTY_QUERY,filters,search,status,startDate:from,endDate:to,overdueDays:days,overdueCompare:compare as 'eq'|'gt'|'lt',...(bucket?{overdueBucket:bucket as OverdueBucket}:{})}};
}
function contractScopeClause(scope:string) {
  if(scope==='overdue')return ` AND (o.order_status='bad_debt' OR ${contractStatusClause('overdue').slice(5)})`;
  return scope==='due' ? ` AND o.order_status IN ('renting','overdue','wait_payment','bad_debt') AND o.draft_payload::jsonb #> '{management_composer,installment_plan}' IS NOT NULL`
    : scope==='renewable' ? ` AND o.order_status IN ('renting','overdue') AND o.draft_payload::jsonb #> '{management_composer,installment_plan}' IS NULL` : contractListScopeClause(scope);
}
function contractPageScopeClause(scope:string) {
  if(scope==='overdue')return ` AND o.order_status IN ('overdue','renting','wait_payment','bad_debt')`;
  if(scope==='due')return ` AND o.order_status IN ('renting','overdue','wait_payment','bad_debt')`;
  if(scope==='renewable')return ` AND o.order_status IN ('renting','overdue')`;
  return contractListScopeClause(scope);
}
function contractPageStatusClause(status:string) {
  if(!status)return '';
  if(status==='renting')return ` AND o.order_status IN ('renting','overdue')`;
  if(status==='overdue')return ` AND o.order_status IN ('overdue','renting','wait_payment','bad_debt')`;
  if(!/^[a-z][a-z0-9_]{0,63}$/.test(status))throw new ManagementTableError('Bộ lọc không hợp lệ.');
  return ` AND o.order_status='${status}'`;
}
/** Only the overdue list needs per-line dates/prices. Reuse the return screen's price source. */
function overdueDetailsSql(sql:string) {
  return `SELECT listing.*, (SELECT COALESCE(json_agg(json_build_object(
    'return_at',d.return_at,'daily_price',${dailyPriceSql()} ) ORDER BY d.id),'[]'::json)
    FROM himoto.order_vehicle_details d JOIN himoto.orders o ON o.id=d.order_id
    JOIN ${contractVehicleReadSource()} v ON v.id=d.vehicle_id
    WHERE d.order_id=listing.id AND d.deleted_at IS NULL AND d.completed_at IS NULL) AS overdue_items
    FROM (${sql}) listing`;
}
/** Push status tabs into SQL so Đang thuê does not index every open/historical row first. */
export function contractStatusClause(status:string) {
  if(!status)return '';
  if(status==='renting')return ` AND o.order_status IN ('renting','overdue')`;
  if(status==='overdue')return ` AND (o.order_status='overdue' OR o.order_status='renting' AND o.return_at < now()
    OR o.order_status IN ('renting','wait_payment','bad_debt') AND o.draft_payload::jsonb #> '{management_composer,installment_plan}' IS NOT NULL)`;
  if(!/^[a-z][a-z0-9_]{0,63}$/.test(status))throw new ManagementTableError('Bộ lọc không hợp lệ.');
  return ` AND o.order_status='${status}'`;
}
/** Recent created/started rentals plus every still-open contract so operations are never hidden. */
export function contractRecentClause(days:number) {
  return ` AND (
    o.order_status IN ('draft','renting','overdue','wait_payment','deposit_contract','pending','bad_debt')
    OR o.created_at >= (timezone('Asia/Ho_Chi_Minh', now()) - interval '${days} days')
    OR o.rent_at >= (timezone('Asia/Ho_Chi_Minh', now()) - interval '${days} days')
  )`;
}
function contractStoreSql(store:string) {
  return store==='all' ? '' : ` AND o.store_id=${Number(store)}`;
}
function contractSearchSql(search:string) {
  if(!search.trim())return {sql:'',value:undefined as string|undefined};
  return {sql:` AND (o.contract_number ILIKE $3 OR o.draft_reference ILIKE $3 OR o.customer_name ILIKE $3 OR COALESCE(o.customer_phone,'') ILIKE $3)`,
    value:`%${search.trim().replace(/[%_\\]/g,'')}%`};
}
export function contractPageSql(scopeClause:string) {
  return `SELECT o.id, o.contract_number, o.draft_reference,
    CASE WHEN o.order_status='renting' AND o.return_at < now() THEN 'overdue' ELSE o.order_status END AS status,
    o.customer_id, o.customer_name, o.customer_phone,
    o.store_id, o.rent_at AS start_date, o.return_at AS end_date,
    o.total AS total_amount, '[]'::json AS vehicles
    FROM himoto.orders o
    WHERE o.deleted_at IS NULL${scopeClause}`;
}
function mapManagementRows(kind:TableKind,rows:unknown[]) {
  const mapped=[];
  for(const row of rows){
    try { mapped.push(mapApiRow(kind,row as Parameters<typeof mapApiRow>[1])); }
    catch (error) { console.error('Skipping unreadable management row', error); }
  }
  return mapped;
}
export async function readManagementTable(client:Pick<PoolClient,'query'>,kind:TableKind,params:URLSearchParams) {
  const input=parseManagementTable(kind,params);
  const all=params.get('all')==='1';
  const statusClause=kind==='contracts'?(all?contractStatusClause(input.query.status):contractPageStatusClause(input.query.status)):'';
  const monitoring=kind==='contracts'&&(input.scope==='overdue'||input.scope==='ownership'||input.query.status==='overdue'||input.query.status==='bad_debt'||Boolean(input.query.overdueBucket));
  const recentDays=input.recentDays&&!input.scope&&!input.query.search.trim()&&!input.query.startDate&&!input.query.endDate
    &&!input.query.filters.customer_id&&!input.query.filters.id ? input.recentDays : undefined;
  const storeSql=kind==='contracts'?contractStoreSql(input.store):'';
  const listWindow=all&&recentDays?contractRecentClause(recentDays):'';
  const clause=kind==='contracts'
    ? `${all?contractScopeClause(input.scope):contractPageScopeClause(input.scope)}${statusClause}${listWindow}${storeSql}`
    : '';
  const now=Date.now();
  const overdueSql=(sql:string)=>monitoring?overdueDetailsSql(sql):sql;
  if(kind==='contracts'&&!all){
    const take=input.size+1;
    const offset=Math.max(0,(input.page-1)*input.size);
    const search=contractSearchSql(input.query.search);
    const indexed=await client.query(
      `${contractPageSql(clause)}${search.sql} ORDER BY o.id DESC LIMIT $1 OFFSET $2`,
      search.value?[take,offset,search.value]:[take,offset]);
    const hasMore=indexed.rows.length>input.size;
    const rows=mapManagementRows(kind,indexed.rows.slice(0,input.size));
    const total=offset+rows.length+(hasMore?1:0);
    return {
      rows,total,scopeCount:total,tabCount:total,page:input.page,pages:hasMore?input.page+1:Math.max(1,input.page),
      statusCounts:[],statuses:[...new Set(rows.map(row=>row.status))].sort(),dueCount:0,
      summary:{contractCount:rows.length,blacklistCount:0,totalAmount:null,receivableAmount:null,badDebtAmount:null},
      recentDays:recentDays??null,
    };
  }
  const fullSql=kind==='contracts' ? `${CONTRACT_LIST_SQL}${clause}` : CUSTOMER_PROFILE_SQL;
  const sql=kind==='contracts' ? fullSql
    : `SELECT id,name,phone,id_card,address,status,warning,store_id,store_name,contract_count FROM (${CUSTOMER_PROFILE_SQL}) listing`;
  const result=await client.query(kind==='contracts' ? overdueSql(contractVehicleDetailsSql(sql)) : sql);
  const projected=projectManagementTable(mapManagementRows(kind,result.rows),input,all,now);
  if(kind==='contracts'||!projected.rows.length)return projected;
  const ids=projected.rows.map(row=>row.id);
  const details=await client.query(`${fullSql} WHERE c.id=ANY($1::bigint[])`,[ids]);
  const mapped=new Map(mapManagementRows(kind,details.rows).map(record=>[record.id,record]));
  projected.rows=projected.rows.flatMap(row=>{const detail=mapped.get(row.id);return detail ? [detail] : [];});
  return projected;
}
