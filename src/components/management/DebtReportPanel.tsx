'use client';
import { useEffect,useState } from 'react';
import Link from 'next/link';
import { useManagement } from './ManagementProvider';
import { Dialog } from './Dialog';
import { shiftApi } from '@/lib/management/shift-report-client';
import { CONTACT_STATUSES,HANDLING_STATUSES,type CollectionRow,type CollectionFollowup } from '@/lib/management/collection-report';
import { GPS_STATE_LABELS } from '@/lib/management/gps';
import { formatDateTime,formatMoney } from '@/lib/formatters';

type Report={rows:CollectionRow[];read_at:string;messages:string[];hash:string;deliveries?:{status:string;message_id:number|null}[]};
export function DebtReportPanel(){
  const {selectedStore,can,notify}=useManagement();
  const [data,setData]=useState<Report|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[version,setVersion]=useState(0);
  const [search,setSearch]=useState(''),[handling,setHandling]=useState(''),[preview,setPreview]=useState(false),[sending,setSending]=useState(false);
  const [editing,setEditing]=useState<CollectionRow|null>(null),[followup,setFollowup]=useState<CollectionFollowup|null>(null),[saving,setSaving]=useState(false),[saveError,setSaveError]=useState('');
  useEffect(()=>{const controller=new AbortController();setLoading(true);setError('');
    void shiftApi<Report>(`/api/auth/gps/debts?store=${selectedStore}`,{signal:controller.signal}).then(value=>{if(!controller.signal.aborted)setData(value);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[selectedStore,version]);
  const rows=(data?.rows||[]).filter(row=>(!handling||row.followup.handling_status===handling)&&(!search||[row.code,row.customer,row.phone,row.vehicle,row.followup.customer_condition,row.followup.notes].join(' ').toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi'))));
  async function save(){if(!editing||!followup||saving)return;setSaving(true);setSaveError('');
    try{await shiftApi('/api/auth/gps/debts',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({order_id:editing.id,...followup,updated_at:undefined})});setEditing(null);setVersion(v=>v+1);notify('Đã lưu tình trạng khách và lịch sử xử lý.');}
    catch(e){setSaveError((e as Error).message);}finally{setSaving(false);}}
  async function send(){if(!data||selectedStore==='all'||sending)return;setSending(true);setError('');try{
    await shiftApi('/api/auth/gps/debts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({store_id:Number(selectedStore),hash:data.hash})});notify('Đã đưa báo cáo vào hàng đợi Telegram của PGD.');setPreview(false);setVersion(v=>v+1);
  }catch(e){setError((e as Error).message);}finally{setSending(false);}}
  return <div className="mg-collection-panel"><div className="mg-heading-actions"><h2>Nợ chậm · {loading?'…':data?.rows.length??'—'} hợp đồng</h2><button type="button" className="mg-button" disabled={loading} onClick={()=>setVersion(v=>v+1)}>Làm mới báo cáo</button>{can('contracts.draft')&&<button type="button" className="mg-button" disabled={loading||!!error||!data||selectedStore==='all'} onClick={()=>setPreview(true)}>Xem trước & gửi Telegram PGD</button>}</div>
    <p>Khoản nợ đến hạn tách khỏi phí quá hạn tạm tính. Chọn một PGD để gửi báo cáo ngày; ghi chú và tình trạng khách được giữ theo hợp đồng.</p>
    {!!data?.deliveries?.length&&<p role="status">Telegram báo cáo này: {data.deliveries.filter(d=>d.status==='sent').length}/{data.messages.length} tin đã gửi.{data.deliveries.some(d=>d.status==='unknown')?' Có tin chưa rõ kết quả; kiểm tra nhóm, không tự gửi lại.':data.deliveries.some(d=>['failed','awaiting_config'].includes(d.status))?' Có tin chưa gửi được; kiểm tra cấu hình nhóm rồi thử gửi lại.':data.deliveries.some(d=>['pending','sending'].includes(d.status))?' Đang chờ gửi; bấm Làm mới báo cáo để kiểm tra.':''}</p>}
    <div className="mg-toolbar"><label className="mg-field">Tìm khách / xe / hợp đồng<input type="search" value={search} onChange={e=>setSearch(e.target.value)}/></label><label className="mg-field">Xử lý<select value={handling} onChange={e=>setHandling(e.target.value)}><option value="">Tất cả</option>{Object.entries(HANDLING_STATUSES).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label></div>
    {error&&<p role="alert" className="mg-field-error">{error}</p>}{loading?<p role="status">Đang đối chiếu hợp đồng và công nợ…</p>:<><p>{rows.length} kết quả · Đọc lúc {data?formatDateTime(data.read_at):'—'}</p><div className="mg-table-scroll" tabIndex={0} role="region" aria-label="Báo cáo nợ chậm"><table className="mg-table mg-collection-table"><thead><tr>{['Hợp đồng / Khách','Xe / Thời gian','Quá hạn','Nợ đến hạn','GPS','Liên hệ / Ghi chú','Tình trạng khách','Xử lý',''].map((label,i)=><th key={i}>{label}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.id}><td><Link href={`/contracts?contract_id=${row.id}`}>{row.code}</Link><p><strong>{row.customer}</strong></p><a href={`tel:${row.phone}`}>{row.phone}</a><small>{row.store_name}</small></td><td>{row.vehicle||'—'}<small>Thuê: {formatDateTime(row.started_at)}</small><small>Hạn: {formatDateTime(row.due_at)}</small></td><td>{row.days} ngày</td><td>{row.amount===null?'Chưa đối chiếu':formatMoney(row.amount)}{row.late_fee!==null&&<small>Phí trễ tạm tính: {formatMoney(row.late_fee)}</small>}</td><td>{row.gps.map(s=>GPS_STATE_LABELS[s]||s).join(', ')||'Chưa có'}</td><td>{CONTACT_STATUSES[row.followup.contact_status]}<p className="mg-preserve-lines">{row.followup.notes||'Chưa có ghi chú'}</p></td><td>{row.followup.customer_condition||row.customer_status}</td><td>{HANDLING_STATUSES[row.followup.handling_status]}</td><td>{can('contracts.draft')&&<button type="button" className="mg-button" onClick={()=>{setEditing(row);setFollowup({...row.followup});setSaveError('');}}>Cập nhật</button>}</td></tr>)}</tbody></table></div>{!rows.length&&<p>Không có khách quá hạn / nợ xấu phù hợp.</p>}</>}
    {editing&&followup&&<Dialog title="Cập nhật tình trạng khách" subtitle={`${editing.code} · ${editing.customer}`} onClose={()=>{if(!saving&&window.confirm('Đóng phần cập nhật chưa lưu?'))setEditing(null);}}>
      <fieldset className="mg-dialog-body mg-form-grid" disabled={saving}>
        <div className="mg-field"><label htmlFor="collection-contact">Liên hệ</label><select id="collection-contact" value={followup.contact_status} onChange={e=>setFollowup({...followup,contact_status:e.target.value as CollectionFollowup['contact_status']})}>{Object.entries(CONTACT_STATUSES).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></div>
        <div className="mg-field"><label htmlFor="collection-handling">Xử lý</label><select id="collection-handling" value={followup.handling_status} onChange={e=>setFollowup({...followup,handling_status:e.target.value as CollectionFollowup['handling_status']})}>{Object.entries(HANDLING_STATUSES).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></div>
        <div className="mg-field mg-field-wide"><label htmlFor="collection-condition">Tình trạng khách</label><input id="collection-condition" maxLength={300} placeholder="Khách đều, hẹn ngày thanh toán, không liên lạc được…" value={followup.customer_condition} onChange={e=>setFollowup({...followup,customer_condition:e.target.value})}/></div>
        <div className="mg-field mg-field-wide"><label htmlFor="collection-notes">Ghi chú liên hệ theo ngày</label><textarea id="collection-notes" maxLength={3000} rows={5} value={followup.notes} onChange={e=>setFollowup({...followup,notes:e.target.value})}/></div>
        {saveError&&<p role="alert">{saveError}</p>}
      </fieldset><div className="mg-dialog-footer"><button type="button" className="mg-button mg-button-primary" disabled={saving} onClick={()=>void save()}>{saving?'Đang lưu…':'Lưu tình trạng khách'}</button></div>
    </Dialog>}
    {preview&&data&&<Dialog title="Báo cáo gửi nhóm Telegram PGD" onClose={()=>{if(!sending)setPreview(false);}}><div className="mg-dialog-body">{data.messages.map((text,i)=><pre className="mg-report-preview" key={i}>{text}</pre>)}</div><div className="mg-dialog-footer"><button className="mg-button mg-button-primary" disabled={sending} onClick={()=>void send()}>{sending?'Đang gửi…':`Gửi ${data.messages.length} tin báo cáo`}</button></div></Dialog>}
  </div>;
}
