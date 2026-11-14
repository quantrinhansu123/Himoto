'use client';
import {useEffect,useState} from 'react';
import {shiftApi} from '@/lib/management/shift-report-client';
type State={status:string;message_id:number|null;error_code:string|null;attachment_count?:number;media_count?:number}|null;
const labels:Record<string,string>={pending:'Chờ gửi',sending:'Đang gửi',sent:'Đã gửi',failed:'Gửi thất bại',unknown:'Chưa rõ kết quả gửi',awaiting_config:'Chưa cấu hình nhóm / bot'};
export function ShiftTelegramStatus({id,canSend,stage='pgd'}:{id:number;canSend:boolean;stage?:'pgd'|'audit'}){
  const [state,setState]=useState<State>(null),[error,setError]=useState(''),[version,setVersion]=useState(0),[busy,setBusy]=useState(false);
  useEffect(()=>{const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
    async function read(){try{const value=await shiftApi<State>(`/api/auth/shift-reports/${id}/telegram${stage==='audit'?'?stage=audit':''}`,{signal:controller.signal});if(controller.signal.aborted)return;setState(value);setError('');if(value&&['pending','sending'].includes(value.status))timer=setTimeout(()=>void read(),4000);}catch(e){if(!controller.signal.aborted)setError((e as Error).message);}}
    void read();return()=>{controller.abort();clearTimeout(timer);};
  },[id,version,stage]);
  async function retry(){setBusy(true);setError('');try{await shiftApi(`/api/auth/shift-reports/${id}/telegram${stage==='audit'?'?stage=audit':''}`,{method:'POST'});setVersion(v=>v+1);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <div className="shift-autofill" role="status"><strong>Telegram {stage==='audit'?'KTNB':'PGD'}: {state?labels[state.status]||state.status:'Đang kiểm tra…'}</strong>{state?.message_id&&<small> · Mã tin {state.message_id}</small>}{state&&<p>Đã gửi {state.media_count??0}/{state.attachment_count??0} ảnh / video.</p>}{state?.status==='unknown'&&<p>Kiểm tra nhóm trước khi gửi thêm; hệ thống giữ nguyên báo cáo và không tự gửi lại tin chưa rõ kết quả.</p>}{canSend&&state&&['pending','failed','awaiting_config'].includes(state.status)&&<button type="button" className="mg-button" disabled={busy} onClick={()=>void retry()}>Thử gửi Telegram</button>}{error&&<p role="alert">{error}</p>}<button type="button" className="mg-button" onClick={()=>setVersion(v=>v+1)}>Kiểm tra trạng thái</button></div>;
}
