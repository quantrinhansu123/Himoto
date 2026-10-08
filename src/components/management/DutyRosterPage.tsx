'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, RotateCcw, Pencil, Trash2 } from 'lucide-react';
import { addDays, DutyInput, dutyRequest, DutyRequestError, DutySchedule, localDutyTime, vietnamDate, weekStart } from '@/lib/management/duty-roster';
import { useManagement } from './ManagementProvider';
import { Dialog } from './Dialog';

const dateLabel=(date:string)=>new Date(`${date}T00:00:00+07:00`).toLocaleDateString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',weekday:'long',day:'2-digit',month:'2-digit'});
const timeLabel=(date:string)=>new Date(date).toLocaleTimeString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit'});

export function DutyRosterPage() {
  const {dataset,selectedStore,selectStore,loading:datasetLoading,error:datasetError,notify}=useManagement();
  const [week,setWeek]=useState(()=>weekStart(vietnamDate()));
  const [staffFilter,setStaffFilter]=useState('');
  const [rows,setRows]=useState<DutySchedule[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [reload,setReload]=useState(0);
  const [editing,setEditing]=useState<DutySchedule|null|undefined>(undefined);
  const [removing,setRemoving]=useState<DutySchedule|null>(null);
  const [deleteBusy,setDeleteBusy]=useState(false);
  const [deleteError,setDeleteError]=useState('');
  const deleteLock=useRef(false);
  useEffect(()=>{
    const controller=new AbortController();let current=true;
    setLoading(true);setError('');setRows([]);
    const params=new URLSearchParams({week});if(selectedStore!=='all')params.set('store_id',selectedStore);
    dutyRequest<{week:string;schedules:DutySchedule[]}>(`/api/auth/duty-roster?${params}`, 'GET',undefined,controller.signal).then(data=>{
      if(data.week!==week||!Array.isArray(data.schedules)||data.schedules.some(row=>!Number.isSafeInteger(row.id)||typeof row.revision!=='string'))throw new Error('Kết quả lịch trực chưa hợp lệ.');
      if(current)setRows(data.schedules);
    }).catch(cause=>{if(current&&!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Không tải được lịch trực.');}).finally(()=>{if(current)setLoading(false);});
    return()=>{current=false;controller.abort();};
  },[week,selectedStore,reload]);
  const visible=rows.filter(row=>!staffFilter||String(row.staff_id)===staffFilter);
  const staff=dataset?.staff.filter(row=>row.status==='active')||[];
  const unavailable=loading||datasetLoading||Boolean(error||datasetError);
  const refresh=()=>setReload(value=>value+1);
  async function remove() {
    if(!removing||deleteLock.current)return;
    deleteLock.current=true;setDeleteBusy(true);setDeleteError('');
    try {await dutyRequest(`/api/auth/duty-roster/${removing.id}`,'DELETE',{revision:removing.revision});setRemoving(null);notify('Đã xóa ca trực.');refresh();}
    catch(cause){setDeleteError(cause instanceof Error?cause.message:'Chưa xóa được ca trực.');refresh();}
    finally{deleteLock.current=false;setDeleteBusy(false);}
  }
  return <section className="mg-page mg-duty-page" aria-label="Lịch trực cơ sở"><div className="mg-page-content">
    <div className="mg-page-heading"><div><div className="mg-eyebrow">QUẢN LÝ NHÂN SỰ</div><h1>Lịch trực cơ sở <span className="mg-title-count">{unavailable?'—':visible.length}</span></h1><p>Phân ca theo tuần, kiểm tra nhân viên và giờ trực tại từng cơ sở.</p></div><div className="mg-heading-actions"><button type="button" className="mg-button" onClick={refresh} disabled={loading}><RotateCcw size={16}/>Làm mới</button><button type="button" className="mg-button mg-button-primary" disabled={unavailable} onClick={()=>setEditing(null)}><Plus size={16}/>Thêm ca trực</button></div></div>
    <div className="mg-data-panel mg-duty-toolbar"><div className="mg-duty-week"><button type="button" className="mg-button" aria-label="Tuần trước" onClick={()=>setWeek(addDays(week,-7))}><ChevronLeft size={18}/></button><label>Ngày trong tuần<input aria-label="Ngày trong tuần" type="date" required value={week} onChange={event=>{if(event.target.value)setWeek(weekStart(event.target.value));}}/></label><button type="button" className="mg-button" aria-label="Tuần sau" onClick={()=>setWeek(addDays(week,7))}><ChevronRight size={18}/></button><button type="button" className="mg-button" onClick={()=>setWeek(weekStart(vietnamDate()))}>Tuần này</button></div>
      <label>Cơ sở<select aria-label="Cơ sở lịch trực" value={selectedStore} onChange={event=>selectStore(event.target.value)}><option value="all">Tất cả cơ sở</option>{dataset?.stores.map(store=><option key={store.id} value={store.id}>{store.name}</option>)}</select></label>
      <label>Nhân viên<select aria-label="Lọc nhân viên trực" value={staffFilter} onChange={event=>setStaffFilter(event.target.value)}><option value="">Tất cả nhân viên</option>{staff.map(person=><option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
    </div>
    <p className="mg-duty-range">Tuần {dateLabel(week)} – {dateLabel(addDays(week,6))}</p>
    {(error||datasetError)&&<p className="mg-field-error" role="alert">{error||datasetError} <button type="button" className="mg-button" onClick={refresh}>Thử lại</button></p>}
    {loading&&<p role="status">Đang tải lịch trực…</p>}
    {!unavailable&&<div className="mg-duty-calendar">{Array.from({length:7},(_,index)=>addDays(week,index)).map(date=>{
      const dayRows=visible.filter(row=>row.starts_at&&row.ends_at?Date.parse(row.starts_at)<Date.parse(`${addDays(date,1)}T00:00:00+07:00`)&&Date.parse(row.ends_at)>Date.parse(`${date}T00:00:00+07:00`):row.duty_date===date);
      return <section className={`mg-duty-day ${date===vietnamDate()?'is-today':''}`} key={date} aria-label={dateLabel(date)}><h2>{dateLabel(date)}</h2>{dayRows.length===0?<p className="mg-duty-empty">Chưa có ca trực</p>:dayRows.map(row=><article className="mg-duty-card" key={row.id}>
        <strong>{row.staff_name}</strong><span>{row.store_name||`Cơ sở #${row.store_id}`}</span><b>{row.starts_at&&row.ends_at?`${timeLabel(row.starts_at)} – ${timeLabel(row.ends_at)}${localDutyTime(row.starts_at).slice(0,10)!==localDutyTime(row.ends_at).slice(0,10)?' (qua đêm)':''}`:'Chưa có giờ cụ thể'}</b><span>{row.shift_name} · {row.role_in_shift}</span>{row.notes&&<p>{row.notes}</p>}
        <div><button type="button" className="mg-button" aria-label={`Sửa ca trực #${row.id}`} onClick={()=>setEditing(row)}><Pencil size={14}/>Sửa</button><button type="button" className="mg-button" aria-label={`Xóa ca trực #${row.id}`} onClick={()=>{setRemoving(row);setDeleteError('');}}><Trash2 size={14}/>Xóa</button></div>
      </article>)}</section>;
    })}</div>}
    {editing!==undefined&&dataset&&<DutyForm key={editing?.id||'new'} row={editing} week={week} storeId={selectedStore} onClose={()=>setEditing(undefined)} onRefresh={()=>{setEditing(undefined);refresh();}} onSaved={()=>{setEditing(undefined);refresh();notify('Đã lưu ca trực.');}}/>}
    {removing&&<Dialog title="Xóa ca trực" onClose={()=>{if(!deleteLock.current)setRemoving(null);}}><div className="mg-dialog-body"><p>Xóa ca <strong>{removing.shift_name}</strong> của <strong>{removing.staff_name}</strong> tại {removing.store_name}, ngày {dateLabel(removing.duty_date)}?</p>{deleteError&&<p role="alert" className="mg-field-error">{deleteError}</p>}</div><div className="mg-dialog-footer"><button type="button" className="mg-button" disabled={deleteBusy} onClick={()=>setRemoving(null)}>Đóng</button><button type="button" className="mg-button mg-button-primary" disabled={deleteBusy||Boolean(deleteError)} onClick={()=>void remove()}>{deleteBusy?'Đang xóa…':'Xác nhận xóa'}</button></div></Dialog>}
  </div></section>;
}

function DutyForm({row,week,storeId,onClose,onSaved,onRefresh}:{row:DutySchedule|null;week:string;storeId:string;onClose:()=>void;onSaved:()=>void;onRefresh:()=>void}) {
  const {dataset}=useManagement();
  const [form,setForm]=useState({store_id:row?String(row.store_id):storeId==='all'?'':storeId,staff_id:row?.staff_id?String(row.staff_id):'',starts_at:localDutyTime(row?.starts_at||null)||`${week}T08:00`,ends_at:localDutyTime(row?.ends_at||null)||`${week}T17:00`,shift_name:row?.shift_name||'Ca trực',role_in_shift:row?.role_in_shift||'Nhân viên trực',notes:row?.notes||''});
  const [saving,setSaving]=useState(false),[error,setError]=useState(''),[uncertain,setUncertain]=useState(false);
  const busy=useRef(false),requestId=useRef(crypto.randomUUID());
  const update=(key:keyof typeof form,value:string)=>setForm(current=>({...current,[key]:value}));
  async function submit(event:FormEvent) {
    event.preventDefault();if(busy.current)return;
    if(Date.parse(`${form.ends_at}+07:00`)<=Date.parse(`${form.starts_at}+07:00`)||Date.parse(`${form.ends_at}+07:00`)-Date.parse(`${form.starts_at}+07:00`)>24*3600000){setError('Giờ kết thúc phải sau giờ bắt đầu; một ca tối đa 24 giờ.');return;}
    const input:DutyInput={...form,store_id:Number(form.store_id),staff_id:Number(form.staff_id),...(row?{revision:row.revision}:{request_id:requestId.current})};
    busy.current=true;setSaving(true);setError('');
    try {const saved=await dutyRequest<DutySchedule>(`/api/auth/duty-roster${row?`/${row.id}`:''}`,row?'PATCH':'POST',input);if(!saved||!Number.isSafeInteger(saved.id)||typeof saved.revision!=='string')throw new Error('Kết quả lưu chưa hợp lệ.');onSaved();}
    catch(cause){setError(cause instanceof Error?cause.message:'Chưa xác nhận được ca trực.');if(!(cause instanceof DutyRequestError)||cause.status===0||cause.status>=500||cause.status===409)setUncertain(true);}
    finally{busy.current=false;setSaving(false);}
  }
  return <Dialog title={row?'Sửa ca trực':'Thêm ca trực'} onClose={()=>{if(!busy.current)onClose();}}><form onSubmit={submit}><div className="mg-dialog-body"><fieldset className="mg-payment-fields" disabled={saving||uncertain}><legend>Thông tin ca trực</legend>
    <label className="mg-field-wide">Cơ sở<select aria-label="Cơ sở của ca trực" required value={form.store_id} onChange={event=>update('store_id',event.target.value)}><option value="">Chọn cơ sở</option>{dataset?.stores.filter(store=>['active','opening'].includes(store.status)).map(store=><option key={store.id} value={store.id}>{store.name}</option>)}</select></label>
    <label className="mg-field-wide">Nhân viên<select aria-label="Nhân viên của ca trực" required value={form.staff_id} onChange={event=>update('staff_id',event.target.value)}><option value="">Chọn nhân viên</option>{dataset?.staff.filter(person=>person.status==='active').map(person=><option key={person.id} value={person.id}>{person.name}{person.store_name?` · ${person.store_name}`:''}</option>)}</select></label>
    <label>Bắt đầu<input aria-label="Bắt đầu ca trực" type="datetime-local" required value={form.starts_at} onChange={event=>update('starts_at',event.target.value)}/></label><label>Kết thúc<input aria-label="Kết thúc ca trực" type="datetime-local" required value={form.ends_at} onChange={event=>update('ends_at',event.target.value)}/></label>
    <p className="mg-field-wide">Ca qua đêm: chọn ngày kết thúc kế tiếp. Có thể phân nhân viên trực cơ sở khác; hồ sơ nhân viên giữ nguyên.</p>
    <label>Tên ca<input aria-label="Tên ca trực" required maxLength={80} value={form.shift_name} onChange={event=>update('shift_name',event.target.value)}/></label><label>Vai trò<input aria-label="Vai trò trong ca" required maxLength={100} value={form.role_in_shift} onChange={event=>update('role_in_shift',event.target.value)}/></label>
    <label className="mg-field-wide">Ghi chú<textarea aria-label="Ghi chú ca trực" maxLength={2000} rows={3} value={form.notes} onChange={event=>update('notes',event.target.value)}/></label>
  </fieldset>{error&&<p role="alert" className="mg-field-error">{error}</p>}{uncertain&&<p>Làm mới lịch để kiểm tra ca đã lưu hoặc thay đổi trước khi tiếp tục.</p>}</div><div className="mg-dialog-footer"><button type="button" className="mg-button" disabled={saving} onClick={onClose}>Đóng</button>{uncertain?<button type="button" className="mg-button" onClick={onRefresh}>Làm mới lịch để kiểm tra</button>:<button type="submit" className="mg-button mg-button-primary" disabled={saving}>{saving?'Đang lưu…':'Lưu ca trực'}</button>}</div></form></Dialog>;
}
