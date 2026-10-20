'use client';

import { useEffect, useState } from 'react';
import { CONTRACT_EVENT_LABELS, NOTICE_STATUS_LABELS, type ContractEventType } from '@/lib/management/contract-telegram';
import { formatDateTime } from '@/lib/formatters';
import { ContractTelegramPanel } from './ContractTelegramPanel';
import { Dialog } from './Dialog';

interface PendingRow {order_id:number;code:string;customer_name:string;event_key:string;event_type:ContractEventType;status:string;store_name:string;created_at:string}
export function ContractTelegramDialog({ order, store, onClose }: {order?:{id:number;code:string};store:string;onClose:()=>void}) {
  const [selected,setSelected]=useState<{id:number;code:string;eventKey?:string}|null>(order||null);
  const [data,setData]=useState<{rows:PendingRow[];total:number;page:number}|null>(null);
  const [page,setPage]=useState(1),[refresh,setRefresh]=useState(0),[loading,setLoading]=useState(false),[error,setError]=useState('');
  useEffect(()=>{
    if(order||selected)return;
    const controller=new AbortController();setLoading(true);setError('');
    void fetch(`/api/auth/contract-telegram-pending?${new URLSearchParams({store,page:String(page)})}`,{signal:controller.signal,credentials:'same-origin',cache:'no-store'})
      .then(async response=>{const result=await response.json();if(!response.ok||result.status!=='success'||!Array.isArray(result.data?.rows))throw Error(result.message||'Không tải được danh sách.');if(!controller.signal.aborted)setData(result.data);})
      .catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Không tải được danh sách.');})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[order,selected,store,page,refresh]);
  return <Dialog title={selected?`Gửi Telegram · ${selected.code}`:'Giao dịch chưa gửi Telegram'} onClose={onClose} dismissOnBackdrop={false}>
    <div className="mg-dialog-body">
      {selected?<>{!order&&<button type="button" className="mg-button" onClick={()=>{setData(null);setSelected(null);}}>Quay lại danh sách</button>}<ContractTelegramPanel key={`${selected.id}-${selected.eventKey||''}`} id={selected.id} eventKey={selected.eventKey}/></>:<>
        <p>Các giao dịch đã lưu nhưng chưa được Telegram xác nhận gửi đủ. Chọn giao dịch để kiểm tra nội dung và ảnh, rồi bấm Gửi toàn bộ Telegram. Có thể gửi hồ sơ cũ tại đây.</p>
        <button type="button" className="mg-button" disabled={loading} onClick={()=>setRefresh(value=>value+1)}>Làm mới danh sách</button>
        {loading?<p role="status">Đang tải giao dịch…</p>:error?<p className="mg-field-error" role="alert">{error}</p>:<>
          <p role="status">{data?.total||0} giao dịch chưa gửi đủ</p>
          <ul className="mg-operation-picks">{data?.rows.map(row=><li key={`${row.order_id}-${row.event_key}`}><button type="button" onClick={()=>setSelected({id:row.order_id,code:row.code,eventKey:row.event_key})}>
            <strong>{row.code} · {CONTRACT_EVENT_LABELS[row.event_type]}</strong><span>{row.customer_name} · {row.store_name}</span><span>{NOTICE_STATUS_LABELS[row.status]} · {formatDateTime(row.created_at)}</span>
          </button></li>)}</ul>
          {data&&(data.total>30||page>1)&&<div className="mg-dialog-footer"><button type="button" className="mg-button" disabled={page<=1} onClick={()=>setPage(value=>value-1)}>Trang trước</button><span>Trang {page}/{Math.max(Math.ceil(data.total/30),1)}</span><button type="button" className="mg-button" disabled={page*30>=data.total} onClick={()=>setPage(value=>value+1)}>Trang sau</button></div>}
        </>}
      </>}
    </div>
    <div className="mg-dialog-footer"><button type="button" className="mg-button" onClick={onClose}>Đóng</button></div>
  </Dialog>;
}
