'use client';
import { useEffect,useState } from 'react';
import { Dialog } from './Dialog';
import { useManagement } from './ManagementProvider';
import { requestManagementTable } from '@/lib/management/management-table';
import { EMPTY_QUERY } from '@/lib/management/table-utils';
import type { ManagementRow } from '@/lib/management/types';
import { MANAGEMENT_CONFIG,optionLabel } from '@/lib/management/config';

export type BackfillAction='contract'|'renewal'|'payment';
export function ContractBackfillDialog({onClose,onCreate,onSelect}:{onClose:()=>void;onCreate:()=>void;onSelect:(action:BackfillAction,row:ManagementRow)=>void}) {
  const {can,canPayContracts,selectedStore}=useManagement();
  const actions:{key:BackfillAction;label:string;allowed:boolean}[]=[{key:'contract',label:'Hợp đồng bị quên chưa nhập',allowed:can('contracts.draft')},{key:'renewal',label:'Lượt gia hạn bị quên chưa nhập',allowed:can('contracts.renew')},{key:'payment',label:'Khoản thu/chi của hợp đồng đã có',allowed:canPayContracts}];
  const [action,setAction]=useState<BackfillAction>(()=>actions.find(item=>item.allowed)?.key||'payment'),[query,setQuery]=useState(''),[rows,setRows]=useState<ManagementRow[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState('');
  useEffect(()=>{const controller=new AbortController();setRows([]);setError('');setLoading(false);if(action==='contract'||query.trim().length<2)return()=>controller.abort();
    setLoading(true);const timer=setTimeout(()=>{void requestManagementTable({kind:'contracts',store:selectedStore,scope:'',query:{...EMPTY_QUERY,search:query.trim()},page:1,size:20,sort:'created_at',direction:'desc'},controller.signal).then(result=>{if(!controller.signal.aborted)setRows(result.rows.filter(row=>!['draft','cancelled'].includes(row.status)));}).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Không tìm được hợp đồng.');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});},250);
    return()=>{clearTimeout(timer);controller.abort();};
  },[action,query,selectedStore]);
  return <Dialog title="Nhập bổ sung giao dịch" onClose={onClose}><div className="mg-dialog-body">
    <p>Kiểm tra lịch sử trước khi nhập để tránh trùng. Ghi đúng ngày giao dịch thực tế, gồm cả giao dịch đã kết thúc và xe đã trả.</p>
    <label className="mg-field">Nội dung cần bổ sung<select aria-label="Nội dung cần bổ sung" value={action} onChange={event=>setAction(event.target.value as BackfillAction)}>{actions.filter(item=>item.allowed).map(item=><option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
    {action==='contract'?<><p>Nhập số hợp đồng giấy, ngày ký và thời gian thuê thực tế. Chọn khách còn đang thuê hoặc đã trả xe. Khoản thu/chi chỉ được ghi khi xác nhận tiền thực tế đã phát sinh.</p><button type="button" className="mg-button mg-button-primary" onClick={onCreate}>Nhập bổ sung hợp đồng</button></>:<>
      <label className="mg-field">Tìm hợp đồng đã có<input type="search" aria-label="Tìm hợp đồng đã có" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Mã hợp đồng, biển số, tên hoặc SĐT khách" maxLength={100}/></label>
      {loading&&<p role="status">Đang tìm trong toàn bộ lịch sử…</p>}{error&&<p className="mg-field-error" role="alert">{error}</p>}
      {!loading&&query.trim().length>=2&&!rows.length&&!error&&<p>Không tìm thấy hợp đồng trong phạm vi cơ sở đang xem.</p>}
      <ul className="mg-operation-picks">{rows.map(row=><li key={row.id}><button type="button" onClick={()=>onSelect(action,row)}><strong>{row.code} · {row.customer_name}</strong><span>{row.license} · {optionLabel(MANAGEMENT_CONFIG.contracts,'status',row.status)}</span></button></li>)}</ul>
    </>}
  </div><div className="mg-dialog-footer"><button type="button" className="mg-button" onClick={onClose}>Đóng</button></div></Dialog>;
}
