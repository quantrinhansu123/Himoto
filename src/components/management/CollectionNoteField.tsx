'use client';

import { useEffect,useRef,useState } from 'react';
import { shiftApi } from '@/lib/management/shift-report-client';
import type { CollectionFollowup,CollectionRow } from '@/lib/management/collection-report';
import { useManagement } from './ManagementProvider';

type Draft={value:string;original:CollectionFollowup};
type Props={row:CollectionRow;editable:boolean;onSaved:(id:number,followup:CollectionFollowup)=>void;onRefresh:()=>void;onEditingChange:(id:number,editing:boolean)=>void};

export function CollectionNoteField({row,editable,onSaved,onRefresh,onEditingChange}:Props){
  const {notify}=useManagement();
  const [draft,setDraft]=useState<Draft|null>(null),[saving,setSaving]=useState(false),[error,setError]=useState('');
  const busy=useRef(false);
  const editing=draft!==null;
  useEffect(()=>{onEditingChange(row.id,editing);return()=>onEditingChange(row.id,false);},[row.id,editing,onEditingChange]);
  const value=draft?.value??row.followup.notes;
  const conflict=Boolean(draft&&row.followup.revision!==draft.original.revision&&row.followup.notes!==draft.original.notes&&row.followup.notes!==draft.value.trim());
  function cancel(){if(busy.current)return;setDraft(null);setError('');}
  async function save(){
    if(!editable||!draft||busy.current||conflict)return;
    const notes=draft.value.trim();
    // A read after a lost response can confirm the first save without writing twice.
    if(notes===row.followup.notes){cancel();notify('Ghi chú đã được lưu.');return;}
    busy.current=true;setSaving(true);setError('');
    try{
      const snapshot={...row.followup,notes};
      const result=await shiftApi<{revision:number}>('/api/auth/gps/debts',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({order_id:row.id,...snapshot,updated_at:undefined})});
      onSaved(row.id,{...snapshot,revision:result.revision});setDraft(null);notify(`Đã lưu ghi chú ${row.code}.`);
    }catch(cause){setError(cause instanceof Error?cause.message:'Chưa lưu được ghi chú. Giữ nội dung đang nhập và thử lại.');onRefresh();}
    finally{busy.current=false;setSaving(false);}
  }
  if(!editable)return <p className="mg-preserve-lines">{row.followup.notes||'Chưa có ghi chú'}</p>;
  return <div className="mg-collection-note" aria-busy={saving}>
    <textarea aria-label={`Ghi chú tình trạng khách ${row.code}`} aria-describedby={`collection-note-${row.id}-hint`} aria-invalid={Boolean(error)||conflict} maxLength={3000} rows={3} disabled={saving} placeholder="Nhập tình trạng khách, nội dung liên hệ, hẹn thanh toán…" value={value} onChange={event=>{const next=event.target.value;setDraft(current=>({value:next,original:current?.original||{...row.followup}}));setError('');}}/>
    <small id={`collection-note-${row.id}-hint`}>{value.length}/3000 ký tự{editing?' · Chưa lưu':''}</small>
    {conflict&&<div className="mg-collection-note-conflict" role="alert"><p>Ghi chú đã được người khác cập nhật:</p><p className="mg-preserve-lines">{row.followup.notes||'(Chưa có nội dung)'}</p><div className="mg-collection-note-actions"><button type="button" className="mg-button" disabled={saving} onClick={cancel}>Dùng ghi chú mới</button><button type="button" className="mg-button" disabled={saving} onClick={()=>{setDraft(current=>current?{...current,original:{...row.followup}}:current);setError('');}}>Giữ nội dung đang nhập</button></div></div>}
    {error&&<p className="mg-field-error" role="alert">{error}</p>}
    {editing&&<div className="mg-collection-note-actions"><button type="button" className="mg-button mg-button-primary" disabled={saving||conflict} onClick={()=>void save()}>{saving?'Đang lưu…':'Lưu ghi chú'}</button><button type="button" className="mg-button" disabled={saving} onClick={cancel}>Huỷ</button></div>}
  </div>;
}
