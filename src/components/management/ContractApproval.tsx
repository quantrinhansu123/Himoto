'use client';
import { useEffect,useRef,useState } from 'react';
import { LoaderCircle,ShieldCheck } from 'lucide-react';
import { Dialog } from './Dialog';
import { useManagement } from './ManagementProvider';
import { isOwnershipApprovalContract,ownershipApprovalRequest,type OwnershipApprovalState } from '@/lib/management/contract-approval';
import type { ManagementRow } from '@/lib/management/types';
import { formatDateTime,formatMoney } from '@/lib/formatters';

export function ContractApprovalStatus({row}:{row:ManagementRow}) {
  if(!isOwnershipApprovalContract(row)||row.status==='cancelled')return null;
  return <span className={`mg-status mg-status-${row.approval_at?'green':'amber'}`}><ShieldCheck size={13}/>{row.approval_at?'Đã duyệt':'Chờ duyệt'}</span>;
}
export function ContractApprovalDialog({row,onClose,onSaved}:{row:ManagementRow;onClose:()=>void;onSaved:()=>void}) {
  const {invalidateData,notify}=useManagement();
  const [data,setData]=useState<OwnershipApprovalState|null>(null),[error,setError]=useState(''),[saving,setSaving]=useState(false),[retry,setRetry]=useState(0);
  const busy=useRef(false);
  useEffect(()=>{const controller=new AbortController();setData(null);setError('');
    void ownershipApprovalRequest(row.id,undefined,controller.signal).then(value=>{if(!controller.signal.aborted)setData(value);}).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Không tải được hợp đồng.');});
    return()=>controller.abort();
  },[row.id,retry]);
  async function approve(){
    if(!data?.can_approve||busy.current)return;busy.current=true;setSaving(true);setError('');
    try{const value=await ownershipApprovalRequest(row.id,data.revision);invalidateData(['contracts']);notify(`Đã duyệt HĐ ${value.code}.`);onSaved();}
    catch(cause){setError(cause instanceof Error?cause.message:'Chưa duyệt được hợp đồng.');}
    finally{busy.current=false;setSaving(false);}
  }
  return <Dialog title="Duyệt hợp đồng sở hữu" subtitle={row.code} onClose={()=>{if(!busy.current)onClose();}}>
    <div className="mg-dialog-body">{!data&&!error&&<p role="status"><LoaderCircle size={16} className="mg-spin"/> Đang tải hợp đồng…</p>}
      {data&&<><p>Kiểm tra hồ sơ trước khi xác nhận duyệt. Lần duyệt được lưu kèm người duyệt và thời gian.</p><dl className="mg-contract-detail-grid">
        <div><dt>Khách hàng</dt><dd>{data.customer_name||'—'}</dd></div><div><dt>Cơ sở</dt><dd>{data.store_name}</dd></div>
        <div><dt>Tổng tiền hợp đồng</dt><dd>{data.total_amount===null?'Chưa đối chiếu':formatMoney(data.total_amount)}</dd></div>
        <div><dt>Tiền cọc</dt><dd>{data.deposit_amount===null?'Chưa đối chiếu':formatMoney(data.deposit_amount)}</dd></div>
        <div><dt>Trạng thái duyệt</dt><dd>{data.approved_at?`Đã duyệt · ${data.approved_by} · ${formatDateTime(data.approved_at)}`:'Chờ duyệt'}</dd></div>
      </dl></>}
      {error&&<p role="alert" className="mg-error-message">{error}</p>}
    </div><div className="mg-dialog-footer"><button type="button" className="mg-button" disabled={saving} onClick={()=>setRetry(value=>value+1)}>Tải lại</button><button type="button" className="mg-button" disabled={saving} onClick={onClose}>Đóng</button>
      {data?.can_approve&&<button type="button" className="mg-button mg-button-primary" disabled={saving} onClick={()=>void approve()}>{saving?<LoaderCircle size={16} className="mg-spin"/>:<ShieldCheck size={16}/>} {saving?'Đang duyệt…':'Xác nhận duyệt hợp đồng'}</button>}
    </div>
  </Dialog>;
}
