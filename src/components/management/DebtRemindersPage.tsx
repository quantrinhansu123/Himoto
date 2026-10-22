'use client';
import { useCallback,useEffect,useState } from 'react';
import Link from 'next/link';
import { ChevronLeft,ChevronRight,Plus,RefreshCw } from 'lucide-react';
import { useManagement } from './ManagementProvider';
import { useReloadAction } from './ReloadButton';
import { DebtReminderDialog } from './DebtReminderDialog';
import { canSendDebtReminder } from '@/lib/management/permissions';
import { reminderRequest,REMINDER_STATUS_LABELS,type DebtReminderRow } from '@/lib/management/debt-reminders';
import { formatDateTime,formatMoney } from '@/lib/formatters';
type History={rows:DebtReminderRow[];total:number;page:number;pages:number};
export function DebtRemindersPage() {
  const {selectedStore,accessUser}=useManagement();
  const [open,setOpen]=useState(false),[data,setData]=useState<History|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[page,setPage]=useState(1),[version,setVersion]=useState(0);
  useReloadAction(useCallback(()=>setVersion(value=>value+1),[]));
  useEffect(()=>{const controller=new AbortController();setLoading(true);setError('');setData(null);
    void reminderRequest<History>(`/api/auth/debt-reminders?store=${encodeURIComponent(selectedStore)}&page=${page}`,{signal:controller.signal})
      .then(value=>{if(!controller.signal.aborted)setData(value);}).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Không tải được lịch sử.');})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();
  },[selectedStore,page,version]);
  useEffect(()=>setPage(1),[selectedStore]);
  return <section className="mg-page"><div className="mg-page-content"><div className="mg-page-heading"><div><h1>Gửi nhắc nợ</h1><p>Soạn tin Zalo theo hợp đồng và theo dõi lịch sử gửi của từng cơ sở.</p></div>
    <div className="mg-heading-actions"><button className="mg-button" onClick={()=>setVersion(value=>value+1)} disabled={loading}><RefreshCw size={16} aria-hidden="true"/>Làm mới</button>{canSendDebtReminder(accessUser)&&<button className="mg-button mg-button-primary" onClick={()=>setOpen(true)}><Plus size={16} aria-hidden="true"/>Tạo mới</button>}</div></div>
    <p className="mg-reminder-help">“Webhook đã tiếp nhận” là hệ thống gửi tin đã nhận yêu cầu; chưa phải xác nhận khách đã nhận hoặc đọc Zalo.</p>
    {loading?<p role="status">Đang tải lịch sử nhắc nợ…</p>:error?<p role="alert" className="mg-field-error">{error}</p>:!data?.rows.length?<div className="mg-table-state"><strong>Chưa có lịch sử nhắc nợ</strong><p>Bấm Tạo mới hoặc mở Nhắc nợ trên hợp đồng.</p></div>:<>
      <div className="mg-data-panel mg-desktop-records"><div className="mg-table-scroll" tabIndex={0} role="region" aria-label="Lịch sử gửi nhắc nợ"><table className="mg-table"><thead><tr>{['Thời gian','Hợp đồng / Khách hàng','Cơ sở','Số điện thoại','Số tiền nhắc','Nội dung','Trạng thái / Người gửi'].map(label=><th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{data.rows.map(row=><tr key={row.request_id}><td>{formatDateTime(row.created_at)}</td><td><Link href={`/contracts?contract_id=${row.order_id}`}>{row.contract_code}</Link><p>{row.customer_name}</p></td><td>{row.store_name}</td><td>{row.phone}</td><td>{formatMoney(row.amount)}</td><td><details className="mg-reminder-message"><summary>Xem nội dung</summary><p>{row.message}</p></details></td><td><span className={`mg-reminder-status is-${row.status}`}>{REMINDER_STATUS_LABELS[row.status]}</span><p>{row.actor_name}</p></td></tr>)}</tbody></table></div></div>
      <ul className="mg-mobile-card-list mg-mobile-records">{data.rows.map(row=><li className="mg-reminder-card" key={row.request_id}><strong><Link href={`/contracts?contract_id=${row.order_id}`}>{row.contract_code}</Link> · {row.customer_name}</strong><p>{row.phone} · {formatMoney(row.amount)}</p><p>{row.store_name} · {formatDateTime(row.created_at)}</p><span className={`mg-reminder-status is-${row.status}`}>{REMINDER_STATUS_LABELS[row.status]}</span><details className="mg-reminder-message"><summary>Xem nội dung / Người gửi</summary><p>{row.message}</p><p>{row.actor_name}</p></details></li>)}</ul>
      <div className="mg-reminder-pagination"><span>{data.total} lần gửi · Trang {page}/{data.pages}</span><button className="mg-button" aria-label="Trang trước" disabled={page<=1} onClick={()=>setPage(value=>value-1)}><ChevronLeft size={16}/></button><button className="mg-button" aria-label="Trang sau" disabled={page>=data.pages} onClick={()=>setPage(value=>value+1)}><ChevronRight size={16}/></button></div>
    </>}
    {open&&<DebtReminderDialog onClose={()=>setOpen(false)} onSent={()=>{setPage(1);setVersion(value=>value+1);}}/>}
  </div></section>;
}
