import 'server-only';
import type { PoolClient } from 'pg';
import { MANAGEMENT_CONFIG } from '@/lib/management/config';
import { mapApiRow } from '@/lib/management/repository';
import { EMPTY_QUERY } from '@/lib/management/table-utils';
import { projectManagementTable, type ManagementTableInput, type TableKind } from '@/lib/management/management-table';
import { CONTRACT_LIST_SQL, contractListScopeClause, contractTableSql } from './contract-drafts';
import { CUSTOMER_PROFILE_SQL } from './customer-search';

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
  if(search.length>500||status.length>100||days&&!/^\d{1,5}$/.test(days)||!['eq','gt','lt'].includes(compare)||params.has('all')&&params.get('all')!=='1')throw new ManagementTableError('Bộ lọc không hợp lệ.');
  return {kind,page,size,sort,direction:direction as 'asc'|'desc',scope,store,query:{...EMPTY_QUERY,filters,search,status,startDate:from,endDate:to,overdueDays:days,overdueCompare:compare as 'eq'|'gt'|'lt'}};
}
export async function readManagementTable(client:Pick<PoolClient,'query'>,kind:TableKind,params:URLSearchParams) {
  const input=parseManagementTable(kind,params);
  const clause=input.scope==='due' ? ` AND o.order_status IN ('renting','overdue','wait_payment','bad_debt') AND o.draft_payload::jsonb #> '{management_composer,installment_plan}' IS NOT NULL`
    : input.scope==='renewable' ? ` AND o.order_status IN ('renting','overdue') AND o.draft_payload::jsonb #> '{management_composer,installment_plan}' IS NULL` : contractListScopeClause(input.scope);
  const all=params.get('all')==='1';
  const fullSql=kind==='contracts' ? `${CONTRACT_LIST_SQL}${clause}` : CUSTOMER_PROFILE_SQL;
  // SQL already narrows specialized contract lists; avoid a second detail query for these scopes.
  const fullDetails=all||Boolean(input.scope);
  const sql=fullDetails ? fullSql : kind==='contracts' ? contractTableSql(clause)
    : `SELECT id,name,phone,id_card,address,status,warning,store_id,store_name,contract_count FROM (${CUSTOMER_PROFILE_SQL}) listing`;
  const result=await client.query(sql);
  const projected=projectManagementTable(result.rows.map(row=>mapApiRow(kind,row)),input,all);
  if(fullDetails||!projected.rows.length)return projected;
  const ids=projected.rows.map(row=>row.id);
  const details=await client.query(`${fullSql}${kind==='contracts' ? ' AND o.id' : ' WHERE c.id'}=ANY($1::bigint[])`,[ids]);
  const mapped=new Map(details.rows.map(row=>{const record=mapApiRow(kind,row);return [record.id,record];}));
  // Keep computed overdue/billing values and ordering from the same list projection.
  projected.rows=projected.rows.flatMap(row=>{const detail=mapped.get(row.id);return detail ? [{...detail,...(input.scope==='overdue'?{overdue_days:row.overdue_days}:{})}] : [];});
  return projected;
}
