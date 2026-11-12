'use client';

import { useEffect,useRef,useState } from 'react';
import { Dialog } from './Dialog';
import { useManagement } from './ManagementProvider';
import { DateTime24Controls } from '@/components/contracts/DateTime24Field';
import { isAdminAccount } from '@/lib/management/permissions';
import { loadContractLifecycle,localLifecycleTime,saveContractLifecycle,validLifecycleTime,type ContractLifecycleContext } from '@/lib/management/contract-lifecycle';
import { formatMoney } from '@/lib/formatters';

export function ContractBadDebtCloseDialog({id,code,onClose,onDone}:{id:number;code:string;onClose:()=>void;onDone:(context:ContractLifecycleContext)=>void}) {
  const {accessUser,invalidateData,notify}=useManagement();
  const allowed=isAdminAccount(accessUser);
  const [context,setContext]=useState<ContractLifecycleContext|null>(null),[loading,setLoading]=useState(true),[attempt,setAttempt]=useState(0);
  const [at,setAt]=useState(localLifecycleTime),[note,setNote]=useState(''),[confirmed,setConfirmed]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState('');
  const request=useRef(crypto.randomUUID()),busy=useRef(false);
  useEffect(()=>{
    if(!allowed){setLoading(false);return;}
    const controller=new AbortController();setLoading(true);setError('');
    void loadContractLifecycle(id,controller.signal).then(value=>{if(!controller.signal.aborted)setContext(value);})
      .catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Không tải được đối chiếu công nợ.');})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[id,allowed,attempt]);
  const eligible=allowed&&context?.status==='bad_debt'&&context.all_returned&&context.total_amount!==null&&context.paid_amount!==null&&context.remaining!==null;
  const money=(amount:number|null)=>amount===null?'Cần đối chiếu':formatMoney(amount);
  async function save(){
    if(!eligible||!context||busy.current||!confirmed||!validLifecycleTime(at))return;
    busy.current=true;setSaving(true);setError('');
    try{
      const next=await saveContractLifecycle(id,{action:'close_bad_debt',revision:context.revision,request_id:request.current,at,note:note.trim(),confirmed:true});
      invalidateData(['contracts','vehicles']);notify('Đã đóng hợp đồng nợ xấu; khoản chưa thanh toán tiếp tục được theo dõi trong Công nợ.');onDone(next);
    }catch(cause){setError(cause instanceof Error?cause.message:'Chưa đóng được hợp đồng. Kiểm tra lại tình trạng trước khi thử lại.');}
    finally{busy.current=false;setSaving(false);}
  }
  return <Dialog title="Đóng hợp đồng nợ xấu" subtitle={context?.code||code} onClose={()=>{if(!busy.current)onClose();}} dismissOnBackdrop={!saving}>
    <form onSubmit={event=>{event.preventDefault();void save();}}><div className="mg-dialog-body">
      {!allowed&&<p role="alert">Chỉ quản trị viên được đóng hợp đồng nợ xấu.</p>}
      {loading?<p role="status">Đang đối chiếu xe, công nợ và tiền cọc…</p>:context&&<>
        <dl className="mg-contract-detail-grid">
          <div><dt>Xe đã trả / thu hồi</dt><dd>{context.returned_count}/{context.items.length}</dd></div>
          <div><dt>Tiền hợp đồng</dt><dd>{money(context.total_amount)}</dd></div>
          <div><dt>Đã thanh toán</dt><dd>{money(context.paid_amount)}</dd></div>
          <div><dt>Công nợ tiếp tục theo dõi</dt><dd>{money(context.remaining)}</dd></div>
          <div><dt>Cọc còn giữ</dt><dd>{money(context.deposit_held)}</dd></div>
        </dl>
        {context.status!=='bad_debt'&&<p role="alert">Hợp đồng không còn ở trạng thái Nợ xấu. Đóng cửa sổ và tải lại danh sách.</p>}
        {!context.all_returned&&<p role="alert">Cần ghi nhận trả hoặc thu hồi tất cả xe trước khi đóng hợp đồng.</p>}
        <p>Được đóng khi khách chưa thanh toán. Khoản còn thiếu tiếp tục nằm trong Công nợ để thu hồi. Tiền hợp đồng, tiền đã thu, tiền cọc và lịch sử giữ nguyên; thao tác đóng không tạo phiếu thu/chi, không xóa nợ hoặc xác nhận tất toán.</p>
        <div className="mg-field"><label htmlFor="bad-debt-close-at">Ngày giờ đóng hợp đồng</label><DateTime24Controls id="bad-debt-close-at" label="Ngày giờ đóng hợp đồng" value={at} onChange={setAt}/></div>
        <div className="mg-field"><label htmlFor="bad-debt-close-note">Nội dung đối chiếu (không bắt buộc)</label><textarea id="bad-debt-close-note" maxLength={1000} rows={3} value={note} disabled={saving} onChange={event=>setNote(event.target.value)}/></div>
        <label className="mg-checkbox"><input type="checkbox" checked={confirmed} disabled={saving} onChange={event=>setConfirmed(event.target.checked)}/>Tôi xác nhận đã nhận đủ xe; khoản chưa thanh toán tiếp tục được theo dõi và thu hồi</label>
      </>}
      {error&&<p className="mg-field-error" role="alert">{error}</p>}
      {!loading&&!context&&allowed&&<button type="button" className="mg-button" onClick={()=>setAttempt(value=>value+1)}>Tải lại đối chiếu</button>}
    </div><div className="mg-dialog-footer"><button type="button" className="mg-button" disabled={saving} onClick={onClose}>Quay lại</button><button type="submit" className="mg-button mg-button-primary" disabled={loading||saving||!eligible||!confirmed||!validLifecycleTime(at)}>{saving?'Đang đóng…':'Đóng hợp đồng, giữ công nợ'}</button></div></form>
  </Dialog>;
}
