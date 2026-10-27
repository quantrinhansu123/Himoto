'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Dialog } from './Dialog';
import { DateTime24Controls } from '@/components/contracts/DateTime24Field';
import { useManagement } from './ManagementProvider';
import { canMarkBadDebtContract, loadContractLifecycle, localLifecycleTime, saveContractLifecycle, validLifecycleTime, type ContractLifecycleContext } from '@/lib/management/contract-lifecycle';

export function ContractBadDebtDialog({id,code,onClose,onDone}:{id:number;code?:string;onClose:()=>void;onDone:(context:ContractLifecycleContext)=>void}) {
  const {can,notify,invalidateData}=useManagement();
  const [context,setContext]=useState<ContractLifecycleContext|null>(null);
  const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState('');
  const [at,setAt]=useState(localLifecycleTime),[note,setNote]=useState(''),[confirmed,setConfirmed]=useState(false);
  const busy=useRef(false),request=useRef(crypto.randomUUID());
  const allowed=can('contracts.return');
  const refresh=useCallback(async(signal?:AbortSignal)=>{
    setLoading(true);setError('');setContext(null);
    try {
      const next=await loadContractLifecycle(id,signal);
      if(!signal?.aborted){setContext(next);request.current=crypto.randomUUID();setConfirmed(false);}
    } catch(cause) {if(!signal?.aborted)setError(cause instanceof Error?cause.message:'Không tải được tình trạng hợp đồng.');}
    finally {if(!signal?.aborted)setLoading(false);}
  },[id]);
  useEffect(()=>{const controller=new AbortController();if(allowed)void refresh(controller.signal);else setLoading(false);return()=>controller.abort();},[allowed,refresh]);
  const eligible=Boolean(allowed&&context&&canMarkBadDebtContract(context)&&['renting','overdue','wait_payment'].includes(context.status));
  async function submit(event:FormEvent) {
    event.preventDefault();
    if(busy.current||!eligible||!context||!confirmed||note.trim().length<5||!validLifecycleTime(at))return;
    busy.current=true;setSaving(true);setError('');
    try {
      const next=await saveContractLifecycle(id,{action:'mark_bad_debt',revision:context.revision,request_id:request.current,note:note.trim(),at,confirmed});
      invalidateData(['contracts','vehicles']);notify('Chuyển sang Nợ xấu thành công.');onDone(next);
    } catch(cause) {setError(cause instanceof Error?cause.message:'Chưa chuyển được hợp đồng. Kiểm tra và thử lại.');}
    finally {busy.current=false;setSaving(false);}
  }
  return <Dialog title="Chuyển sang Nợ xấu" subtitle={context?.code||code} onClose={()=>{if(!busy.current)onClose();}} dismissOnBackdrop={!saving}>
    <form onSubmit={submit}>
      <div className="mg-dialog-body">
        {loading&&<p role="status">Đang đối chiếu tình trạng hợp đồng…</p>}
        {!allowed&&<p role="alert" className="mg-field-error">Tài khoản không có quyền chuyển hợp đồng sang Nợ xấu.</p>}
        {context&&!eligible&&<p role="alert" className="mg-field-error">{context.overdue&&context.all_returned&&Number(context.remaining)===0?'Hợp đồng đã trả hoặc gỡ giữ đủ xe và không còn công nợ cần thu. Đối chiếu tiền thuê, tiền đã thu và cọc trước khi xử lý.':'Hợp đồng không còn ở trạng thái quá hạn để chuyển sang Nợ xấu. Tải lại danh sách để kiểm tra.'}</p>}
        {eligible&&<>
          <p>Chuyển hợp đồng đã quá hạn sang Nợ xấu. Tiền thuê, cọc, phiếu thu/chi và tình trạng xe giữ nguyên.</p>
          <fieldset className="mg-composer-fields" disabled={saving||loading}>
            <div className="mg-field"><label htmlFor="lifecycle-at">Ngày giờ xác nhận</label><DateTime24Controls id="lifecycle-at" label="Ngày giờ xác nhận" value={at} onChange={setAt}/></div>
            <div className="mg-field"><label htmlFor="lifecycle-note">Lý do / nội dung đối chiếu</label>
              <textarea id="lifecycle-note" rows={3} maxLength={1000} aria-describedby="bad-debt-note-hint" value={note} onChange={event=>setNote(event.target.value)} placeholder="Ví dụ: Khách quá hạn, chưa thanh toán"/>
              <small id="bad-debt-note-hint">Nhập lý do ít nhất 5 ký tự để bật nút xác nhận.</small>
            </div>
            <label className="mg-checkbox"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>Tôi đã đối chiếu tình trạng xe và các khoản tiền thực tế của hợp đồng</label>
          </fieldset>
        </>}
        {error&&<p role="alert" className="mg-field-error">{error}</p>}
      </div>
      <div className="mg-dialog-footer">
        {allowed&&(error||context&&!eligible)&&<button type="button" className="mg-button" disabled={loading||saving} onClick={()=>void refresh()}>Tải lại tình trạng</button>}
        <button type="button" className="mg-button" disabled={saving} onClick={onClose}>Quay lại</button>
        <button type="submit" className="mg-button mg-button-primary" disabled={loading||saving||!eligible||!confirmed||note.trim().length<5||!validLifecycleTime(at)}>{saving?'Đang ghi nhận…':'Chuyển sang Nợ xấu'}</button>
      </div>
    </form>
  </Dialog>;
}
