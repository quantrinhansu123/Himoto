'use client';
import { useEffect,useRef,useState } from 'react';
import { shiftApi,UnconfirmedSaveError } from '@/lib/management/shift-report-client';
import type { ShiftReport } from '@/lib/management/shift-reports';
import { Dialog } from './Dialog';

type Status={
  status:string; revision:number; can_manual:boolean; blocked_reason:string;
  request:{state:'pending'|'running'|'failed';reason:string;error?:string;retry_at:string|null}|null;
  history:{revision:number;reopened_at:string;reason:string;manual_retraction:boolean;actor:string}[];
  report?:ShiftReport;
};
export function ShiftReopenPanel({id,onReopened}:{id:number;onReopened:(report:ShiftReport)=>void}) {
  const [open,setOpen]=useState(false),[status,setStatus]=useState<Status>(),[reason,setReason]=useState('');
  const [manual,setManual]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [reload,setReload]=useState(0);
  const attempt=useRef<{key:string;fingerprint:string}|null>(null);
  const lock=useRef(false);
  const complete=useRef(onReopened);complete.current=onReopened;
  const url=`/api/auth/shift-reports/${id}/reopen`;
  function accept(value:Status) {
    setStatus(value);
    if(value.status==='draft'&&value.report)complete.current(value.report);
  }

  useEffect(()=>{
    if(!open)return;
    const controller=new AbortController();
    let timer:ReturnType<typeof setTimeout>;
    async function read(){
      try{
        const value=await shiftApi<Status>(url,{signal:controller.signal});
        if(controller.signal.aborted)return;
        setError('');
        accept(value);
        if(value.request&&value.request.state!=='failed')timer=setTimeout(()=>void read(),3000);
      }catch(error){if(!controller.signal.aborted)setError((error as Error).message);}
    }
    void read();
    return()=>{controller.abort();clearTimeout(timer);};
  },[open,reload,url]);

  async function submit(){
    if(!status||status.blocked_reason||lock.current)return;
    const nextReason=reason.trim()||status.request?.reason||'';
    if(!nextReason){setError('Nhập lý do mở lại báo cáo.');return;}
    const body={revision:status.revision,reason:nextReason,manual};
    const fingerprint=JSON.stringify(body);
    if(attempt.current?.fingerprint!==fingerprint)attempt.current={key:crypto.randomUUID(),fingerprint};
    lock.current=true;setBusy(true);setError('');
    try{
      const value=await shiftApi<Status>(url,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({...body,request_id:attempt.current.key})});
      accept(value);
      if(value.request&&value.request.state!=='failed')setReload(value=>value+1);
    }catch(error){
      setError((error as Error).message);
      if(error instanceof UnconfirmedSaveError)setReload(value=>value+1);
    }finally{lock.current=false;setBusy(false);}
  }
  const inFlight=status?.request&&status.request.state!=='failed';
  const recoverable=!inFlight||!status?.request?.retry_at||Date.parse(status.request.retry_at)<=Date.now();

  return <>
    <button type="button" className="mg-button" onClick={()=>{setError('');setOpen(true);}}>Thu hồi Telegram và mở lại báo cáo</button>
    {open&&<Dialog title="Thu hồi Telegram và mở lại báo cáo" dismissOnBackdrop={false} onClose={()=>{if(!busy)setOpen(false);}}>
      <div className="mg-dialog-body">
        <p>Hệ thống thu hồi tin và tệp của phiên bản này. Sau khi mở lại, chỉnh nội dung và chốt lại để gửi bản mới.</p>
        {!status&&!error&&<p role="status">Đang đọc trạng thái báo cáo…</p>}
        {status?.blocked_reason&&<p role="status">{status.blocked_reason}</p>}
        {inFlight&&<p role="status">Đang xác nhận thu hồi với Telegram. Trạng thái sẽ tự cập nhật.</p>}
        {status?.request?.error&&<p role="alert" className="mg-field-error">{status.request.error}</p>}
        {error&&<p role="alert" className="mg-field-error">{error}</p>}
        {status&&!status.blocked_reason&&<>
          <label className="mg-field">Lý do mở lại
            <textarea maxLength={500} value={reason} placeholder={status.request?.reason||'Ví dụ: cần sửa số tiền đã kiểm kê'}
              onChange={event=>setReason(event.target.value)} disabled={busy||Boolean(inFlight)}/>
          </label>
          {status.can_manual&&!inFlight&&<details><summary>Xác nhận đã xử lý trong nhóm Telegram</summary>
            <label className="mg-checkbox"><input type="checkbox" checked={manual} disabled={busy} onChange={event=>setManual(event.target.checked)}/>
              Đã kiểm tra nhóm và gỡ toàn bộ tin, ảnh và video của lần gửi này nếu có.
            </label>
          </details>}
        </>}
        {!!status?.history.length&&<details><summary>Lịch sử mở lại ({status.history.length})</summary>
          <ul>{status.history.map(row=><li key={row.revision}>{new Date(row.reopened_at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})} · {row.actor} · {row.reason}</li>)}</ul>
        </details>}
      </div>
      <div className="mg-dialog-footer">
        <button type="button" className="mg-button" disabled={busy} onClick={()=>setOpen(false)}>Đóng</button>
        {(!status||inFlight)&&<button type="button" className="mg-button" disabled={busy} onClick={()=>setReload(value=>value+1)}>Kiểm tra tiến độ</button>}
        {status&&!status.blocked_reason&&<button type="button" className="mg-button mg-button-primary" disabled={busy||!recoverable}
          title={!recoverable?'Đang chờ gửi kết quả thu hồi từ Telegram.':undefined} onClick={()=>void submit()}>
          {busy?'Đang xử lý…':manual?'Xác nhận đã gỡ tin và mở lại':status.request?'Thử lại thu hồi và mở báo cáo':'Thu hồi và mở lại'}
        </button>}
      </div>
    </Dialog>}
  </>;
}
