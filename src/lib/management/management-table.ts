import { EMPTY_QUERY, filterRows, sortContractRows, sortRows, type TableQuery } from './table-utils';
import { summarizeContracts, type ContractSummary } from './contract-summary';
import { applyInstallmentBilling } from './contract-billing';
import { OWNERSHIP_CONTRACT_TYPES } from './config';
import { mapApiRow, READ_ENDPOINTS } from './repository';
import type { ManagementRow } from './types';
import { isRemindableContract } from './debt-reminders';
import { withContractMonitoring,OVERDUE_BUCKETS,matchesOverdueBucket } from './contract-overdue';

export type TableKind = 'contracts' | 'customers';
export interface ManagementTableInput {
  kind: TableKind; query: TableQuery; store: string; scope: string; page: number; size: number;
  sort: string; direction: 'asc' | 'desc';
  /** When set, SQL only indexes recent + open contracts before paging. */
  recentDays?: number;
}
export interface ManagementTableResult {
  rows: ManagementRow[]; total: number; scopeCount: number; tabCount: number;
  page: number; pages: number; statusCounts: [string, number][]; statuses: string[];
  dueCount: number; summary: ContractSummary | null;
  /** Echo of the recent window applied server-side; null means full history. */
  recentDays?: number | null;
  overdueCounts?:Record<string,number>;
}
export function managementTableQuery(input: ManagementTableInput, all = false) {
  const params = new URLSearchParams({table:'1',page:String(input.page),size:String(input.size),sort:input.sort,direction:input.direction,store:input.store});
  if (all) params.set('all','1');
  if (input.scope) params.set('scope',input.scope);
  if(input.query.overdueBucket)params.set('overdue_bucket',input.query.overdueBucket);
  if (input.recentDays) params.set('recent',String(input.recentDays));
  for (const [key,value] of Object.entries({search:input.query.search,status:input.query.status,from:input.query.startDate,to:input.query.endDate,overdue_days:input.query.overdueDays,overdue_compare:input.query.overdueCompare})) if (value) params.set(key,value);
  for (const [key,value] of Object.entries(input.query.filters)) if (value) params.set(`filter_${key}`,value);
  return params;
}
/** Same filters, pinned sorting and totals as the original full list, before slicing the page. */
export function projectManagementTable(source: ManagementRow[], input: ManagementTableInput, all = false, now = Date.now(), ownershipStores: number[] = []): ManagementTableResult {
  // SQL plans may return equal sort values in different orders; use IDs as a stable tie-breaker across pages.
  let rows = [...source].sort((a,b)=>a.id-b.id);
  if(input.kind==='contracts')rows=rows.map(row=>({...applyInstallmentBilling(row,now),contract_signed_at:row.signed_on||row.start_date}));
  const monitoring=input.kind==='contracts'&&(input.scope==='ownership'||input.scope==='overdue'||input.query.status==='overdue'||input.query.status==='bad_debt'||Boolean(input.query.overdueBucket));
  if(monitoring)rows=rows.map(row=>withContractMonitoring(row,now));
  if (input.scope === 'drafts') rows=rows.filter(row=>row.status==='draft');
  if (input.scope === 'vat') rows=rows.filter(row=>Number(row.company_payment_count)>0);
  if (input.scope === 'ownership') rows=rows.filter(row=>row.store_kind==='lease_to_own' || ownershipStores.includes(Number(row.store_id)) || OWNERSHIP_CONTRACT_TYPES.has(String(row.rental_type)));
  if (input.scope === 'due') rows=rows.filter(row=>row.billing_overdue_at && Number(row.billing_due_amount)>0);
  if (input.scope === 'renewable') rows=rows.filter(row=>['renting','overdue'].includes(row.status)&&!row.billing_plan_json);
  if (input.scope === 'remindable') rows=rows.filter(isRemindableContract);
  if (input.scope === 'overdue') rows=rows.filter(row=>row.status==='overdue'||row.status==='bad_debt'||row.collection_overdue===1);
  const bucketRows=filterRows(rows,{...input.query,status:'',overdueBucket:undefined},input.store);
  const overdueCounts=Object.fromEntries(OVERDUE_BUCKETS.map(bucket=>[bucket.key,bucketRows.filter(row=>matchesOverdueBucket(row,bucket.key)).length]));
  const scoped=filterRows(rows,EMPTY_QUERY,input.store),tabRows=filterRows(scoped,{...input.query,status:''},'all');
  const counts=new Map<string,number>();for(const row of tabRows)counts.set(row.status,(counts.get(row.status)||0)+1);
  if(monitoring)for(const row of tabRows)if(row.status!=='overdue'&&row.collection_overdue===1)counts.set('overdue',(counts.get('overdue')||0)+1);
  // Overdue vehicles are still on rent until the actual handover is recorded.
  const overdueOnRent=tabRows.filter(row=>row.status==='overdue').length;
  if(input.kind==='contracts'&&overdueOnRent)counts.set('renting',(counts.get('renting')||0)+overdueOnRent);
  const filtered=input.kind==='contracts'&&input.query.status==='renting'
    ? filterRows(scoped,{...input.query,status:''},'all').filter(row=>['renting','overdue'].includes(row.status)) : filterRows(scoped,input.query,'all');
  const sorted=input.kind==='contracts' && !['overdue','due'].includes(input.scope) && !input.query.overdueBucket && input.query.status!=='overdue'
    ? sortContractRows(filtered,input.sort,input.direction,{pinDrafts:true,pinOwnershipTypes:input.scope==='ownership',pinActiveRentals:!input.scope&&Boolean(input.query.search.trim())}) : sortRows(filtered,input.sort,input.direction);
  const pages=Math.max(1,Math.ceil(sorted.length/input.size)),page=Math.min(input.page,pages),offset=(page-1)*input.size;
  return {rows:all ? sorted : sorted.slice(offset,offset+input.size),total:sorted.length,scopeCount:scoped.length,tabCount:tabRows.length,page,pages,
    statusCounts:[...counts].sort(([a],[b])=>a.localeCompare(b)),statuses:[...new Set(rows.map(row=>row.status))].sort(),dueCount:scoped.filter(row=>row.billing_overdue_at && Number(row.billing_due_amount)>0).length,
    summary:input.kind==='contracts' ? summarizeContracts(filtered,[]) : null,recentDays:input.recentDays??null,...(monitoring?{overdueCounts}:{})};
}
export async function requestManagementTable(input: ManagementTableInput, signal?: AbortSignal, all = false, ownershipStores: number[] = []): Promise<ManagementTableResult> {
  const controller=new AbortController();
  let timedOut=false;
  const cancel=()=>controller.abort(signal?.reason);
  if(signal?.aborted)cancel();else signal?.addEventListener('abort',cancel,{once:true});
  const timer=setTimeout(()=>{timedOut=true;controller.abort();},all?120000:45000);
  try {
  const response=await fetch(`/api${READ_ENDPOINTS[input.kind]}?${managementTableQuery(input,all)}`,{cache:'no-store',credentials:'same-origin',signal:controller.signal});
  const result=await response.json().catch(()=>null);
  if (!response.ok || result?.status!=='success') throw new Error(result?.message || 'Không tải được danh sách. Thử lại.');
  // Old deployments/test fixtures return the original array until their API is upgraded.
  if (Array.isArray(result.data)) return projectManagementTable(result.data.map((row: Record<string,unknown>)=>mapApiRow(input.kind,row)),input,all,Date.now(),ownershipStores);
  if (!Array.isArray(result.data?.rows) || !Number.isSafeInteger(result.data.total) || !Array.isArray(result.data.statusCounts)) throw new Error('Danh sách trả về không hợp lệ.');
  return result.data;
  } catch(error) {
    if(timedOut&&!signal?.aborted)throw new Error('Máy chủ phản hồi quá lâu. Vui lòng bấm Thử lại để tải danh sách.');
    throw error;
  } finally {clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
}
