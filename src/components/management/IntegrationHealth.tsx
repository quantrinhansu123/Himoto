'use client';
import {useEffect,useState} from 'react';
import {integrationRequest} from '@/lib/management/integrations';
import {formatDateTime} from '@/lib/formatters';
import {isIntegrationHealth,type IntegrationHealth as Health} from '../../../shared/mobile-integrations';
export function IntegrationHealth(){
  const[open,setOpen]=useState(false),[data,setData]=useState<Health|null>(null),[error,setError]=useState(''),[version,setVersion]=useState(0);
  useEffect(()=>{
    if(!open)return;
    const controller=new AbortController();setError('');
    void integrationRequest<Health>('/api/auth/integrations/health',{signal:controller.signal}).then(value=>{
      if(!isIntegrationHealth(value))throw Error('Thống kê chưa hợp lệ.');
      if(!controller.signal.aborted)setData(value);
    }).catch(()=>{if(!controller.signal.aborted)setError('Chưa đọc được thống kê; cấu hình vẫn được giữ.');});
    return()=>controller.abort();
  },[open,version]);
  return <details onToggle={e=>setOpen(e.currentTarget.open)}><summary>Thống kê đọc bù và sự kiện trực tiếp</summary>{open&&<>
    {error?<p role="alert">{error}</p>:data?<><p>{data.completed_streams}/{data.streams} luồng đã đọc · {data.history_events} sự kiện đọc bù · {data.webhook_events} sự kiện trực tiếp</p><p>{data.behind_streams} luồng chậm trên 15 phút · {data.failed_streams} luồng lỗi · {data.waiting_webhooks} sự kiện chờ đối chiếu</p><small>Thống kê sự kiện lúc {formatDateTime(data.counts_at)}</small></>:<p role="status">Đang đọc thống kê lịch sử GPS…</p>}
    <button type="button" className="mg-button" onClick={()=>setVersion(v=>v+1)}>Tải lại thống kê GPS</button>
  </>}</details>;
}
