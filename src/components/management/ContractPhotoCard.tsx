'use client';

import { useRef, useState } from 'react';
import { LoaderCircle, Trash2 } from 'lucide-react';
import { contractPhotoDeletePermission } from '@/lib/management/contract-photos';
import { deleteRecordPhoto, photoEndpoint } from '@/lib/management/record-photos';
import { useManagement } from './ManagementProvider';
import { RecordPhotoImage } from './RecordPhotoImage';

export function ContractPhotoCard({id,slot,label,mimeType,version,disabled=false,onBusyChange,onDeleted}:{
  id:number;slot:string;label:string;mimeType?:string;version:string;disabled?:boolean;
  onBusyChange:(busy:boolean)=>void;onDeleted:()=>void|Promise<void>;
}) {
  const {can,notify}=useManagement();
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const deleting=useRef(false);
  const permission=contractPhotoDeletePermission(slot);
  const video=mimeType==='video/mp4',kind=video?'video':'ảnh';
  const url=`${photoEndpoint('contracts',id,slot)}?v=${encodeURIComponent(version)}`;
  async function remove() {
    if(disabled||deleting.current)return;
    if(!window.confirm(`Xóa ${kind} «${label}» khỏi hồ sơ hợp đồng?\nTệp đã gửi lên Telegram vẫn còn trong nhóm; dùng Thu hồi tin Telegram nếu cần gỡ.`))return;
    deleting.current=true;setBusy(true);setError('');onBusyChange(true);
    try {
      await deleteRecordPhoto('contracts',id,slot);
      notify(`Đã xóa ${kind} khỏi hồ sơ hợp đồng.`);
      await onDeleted();
    } catch(cause) {setError(cause instanceof Error?cause.message:`Không xóa được ${kind}.`);}
    finally {deleting.current=false;setBusy(false);onBusyChange(false);}
  }
  return <div className="mg-contract-photo-card">
    {video?<video controls playsInline preload="metadata" src={url} aria-label={label}/>:<RecordPhotoImage src={url} alt={label} loading="lazy"/>}
    <span>{label}</span>
    {permission&&can(permission)&&<button type="button" className="mg-button mg-button-danger mg-contract-photo-delete" aria-label={`Xóa ${kind} ${label}`} disabled={disabled||busy} onClick={()=>void remove()}>
      {busy?<LoaderCircle size={16} className="mg-spin" aria-hidden="true"/>:<Trash2 size={16} aria-hidden="true"/>}{busy?'Đang xóa…':`Xóa ${kind}`}
    </button>}
    {error&&<p className="mg-field-error" role="alert">{error}</p>}
  </div>;
}
