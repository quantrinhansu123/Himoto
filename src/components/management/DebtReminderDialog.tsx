'use client';
import { useEffect,useRef,useState,type FormEvent } from 'react';
import { MessageCircle,Search } from 'lucide-react';
import { Dialog } from './Dialog';
import { useManagement } from './ManagementProvider';
import { requestManagementTable } from '@/lib/management/management-table';
import { EMPTY_QUERY } from '@/lib/management/table-utils';
import { reminderRequest,REMINDER_STATUS_LABELS,type DebtReminderContext,type ReminderStatus } from '@/lib/management/debt-reminders';
import type { ManagementRow } from '@/lib/management/types';
import { formatMoney } from '@/lib/formatters';

export function DebtReminderDialog({orderId,onClose,onSent}:{orderId?:number;onClose:()=>void;onSent?:()=>void}) {
  const {selectedStore}=useManagement();
  const [id,setId]=useState(orderId),[search,setSearch]=useState(''),[rows,setRows]=useState<ManagementRow[]>([]);
  const [context,setContext]=useState<DebtReminderContext|null>(null),[message,setMessage]=useState('');
  const [loading,setLoading]=useState(true),[error,setError]=useState(''),[sending,setSending]=useState(false),[result,setResult]=useState<ReminderStatus|null>(null);
  const requestId=useRef<string|null>(null),pending=useRef(false),attempted=useRef(false);
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setError('');setContext(null);
    const timer=setTimeout(()=>{
      if(id)void reminderRequest<DebtReminderContext>(`/api/auth/order/car-rental/${id}/debt-reminder`,{signal:controller.signal})
        .then(value=>{if(!controller.signal.aborted){setContext(value);setMessage(value.message);}})
        .catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Không tải được thông tin nhắc nợ.');})
        .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
      else void requestManagementTable({kind:'contracts',query:{...EMPTY_QUERY,search},store:selectedStore,scope:'remindable',page:1,size:20,sort:'code',direction:'desc'},controller.signal)
        .then(value=>{if(!controller.signal.aborted)setRows(value.rows);})
        .catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Không tải được hợp đồng.');})
        .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    },id?0:250);
    return()=>{clearTimeout(timer);controller.abort();};
  },[id,search,selectedStore]);
  async function submit(event:FormEvent) {
    event.preventDefault();if(pending.current||!context||result)return;
    pending.current=true;attempted.current=true;setSending(true);setError('');requestId.current??=crypto.randomUUID();
    try {
      const value=await reminderRequest<{status:ReminderStatus}>('/api/auth/debt-reminders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({request_id:requestId.current,order_id:context.id,revision:context.revision,amount:context.amount,phone:context.phone,message})});
      setResult(value.status);onSent?.();
    }catch(cause){setError(cause instanceof Error?cause.message:'Không xác định được kết quả. Kiểm tra lịch sử trước khi gửi lại.');}
    finally{pending.current=false;setSending(false);}
  }
  const close=()=>{if(!pending.current)onClose();};
  return <Dialog title="Gửi nhắc nợ qua Zalo" subtitle={context?`${context.code} · ${context.store_name}`:'Chọn hợp đồng còn khoản cần thanh toán'} onClose={close} className="mg-debt-reminder-dialog">
    <form onSubmit={submit}><div className="mg-dialog-body">
      {!id&&<><label className="mg-field">Tìm hợp đồng<input type="search" placeholder="Mã hợp đồng, tên hoặc số điện thoại" value={search} onChange={event=>setSearch(event.target.value)}/></label>
        {!loading&&!error&&(rows.length?<ul className="mg-reminder-picker">{rows.map(row=><li key={row.id}><button type="button" onClick={()=>setId(row.id)}><Search size={16} aria-hidden="true"/><span><strong>{row.code}</strong><small>{row.customer_name} · {row.customer_phone} · {row.store_name}</small></span></button></li>)}</ul>:<p>Không có hợp đồng còn khoản đến hạn phù hợp với tìm kiếm.</p>)}</>}
      {loading&&<p role="status">Đang tải thông tin…</p>}
      {context&&<><dl className="mg-payment-totals"><div><dt>Khách hàng</dt><dd>{context.customer_name}</dd></div><div><dt>Số tiền cần nhắc</dt><dd>{formatMoney(context.amount)}</dd></div></dl>
        <label className="mg-field">Số điện thoại Zalo<input type="tel" value={context.phone} readOnly aria-describedby="reminder-phone-help"/></label>
        <p id="reminder-phone-help" className="mg-reminder-help">Lấy từ số điện thoại khách của hợp đồng. Cập nhật hồ sơ khách hàng nếu cần đổi số.</p>
        <label className="mg-field">Nội dung<textarea required maxLength={4000} rows={10} value={message} disabled={sending||Boolean(result)||attempted.current} onChange={event=>setMessage(event.target.value)}/></label>
        {!attempted.current&&<button className="mg-button" type="button" onClick={()=>setMessage(context.message)}>Dùng nội dung mẫu</button>}
      </>}
      {error&&<p role="alert" className="mg-field-error">{error}</p>}
      {result&&<div role="status" className={result==='accepted'?'mg-payment-success':'mg-composer-notice'}><strong>{REMINDER_STATUS_LABELS[result]}</strong><p>{result==='accepted'?'Yêu cầu đã chuyển tới hệ thống gửi Zalo. Trạng thái này chưa xác nhận khách đã nhận hoặc đọc tin.':result==='failed'?'Hệ thống gửi tin báo lỗi. Kiểm tra kết nối Zalo trước khi tạo lần gửi mới.':'Kiểm tra lịch sử và Zalo trước khi gửi lại để tránh trùng tin.'}</p></div>}
    </div><div className="mg-dialog-footer"><button type="button" className="mg-button" disabled={sending} onClick={close}>Đóng</button>
      {context&&!result&&<button className="mg-button mg-button-primary" disabled={sending||!message.trim()}><MessageCircle size={16} aria-hidden="true"/>{sending?'Đang gửi…':attempted.current?'Kiểm tra lại lần gửi':'Gửi Zalo'}</button>}
    </div></form>
  </Dialog>;
}
