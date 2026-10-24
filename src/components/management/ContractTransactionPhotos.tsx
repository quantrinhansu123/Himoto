'use client';
import { useEffect,useMemo,useRef,useState } from 'react';
import { Camera } from 'lucide-react';
import { SavedRecordPhotos } from './RecordPhotoFields';
import { contractPhotoSlots,contractDocumentSlots,contractPhotoLabel,isContractTransactionPhoto,type ContractPhotoPhase } from '@/lib/management/contract-photos';
import { photoEndpoint,type SavedPhoto } from '@/lib/management/record-photos';
import { useManagement } from './ManagementProvider';
import { ContractDocuments } from './ContractDocuments';
import type { ContractWorkflow } from './ContractWorkflowGuide';
import { ContractPhotoCard } from './ContractPhotoCard';

export function ContractTransactionPhotos({id,phase,title,onPendingChange,onSaved,workflow}:{id:number;phase:ContractPhotoPhase;title:string;workflow?:ContractWorkflow;onPendingChange?:(pending:boolean)=>void;onSaved?:()=>void}) {
  const slots=useMemo(()=>[...contractPhotoSlots(phase),...contractDocumentSlots(phase)],[phase]);
  const [photosPending,setPhotosPending]=useState(false);
  const [documentsPending,setDocumentsPending]=useState(false);const {can}=useManagement();
  const callback=useRef(onPendingChange);callback.current=onPendingChange;
  useEffect(()=>{callback.current?.(photosPending||documentsPending);},[photosPending,documentsPending]);
  useEffect(()=>()=>callback.current?.(false),[]);
  return <section className="mg-transaction-photos is-compact" aria-label={title}><h3><Camera size={16} aria-hidden="true"/>{title}</h3>
    <p>Tải nhanh ảnh xe. Ảnh hợp đồng đã ký và bill chuyển khoản nằm ở tab Tải ảnh chi tiết. Lưu ảnh ở đây; gửi cả bộ Telegram ở bước cuối.</p>
    <SavedRecordPhotos entity="contracts" recordId={id} slots={slots} title="Ảnh và video của lượt này" compact onPendingChange={setPhotosPending} onSaved={onSaved}/>
    {(phase!=='rental'||can('contracts.draft'))&&<details className="mg-extra-documents"><summary>Giấy tờ và hướng dẫn bổ sung (tuỳ chọn)</summary><ContractDocuments id={id} phase={phase} workflow={workflow} onPendingChange={setDocumentsPending} onSaved={onSaved}/></details>}
  </section>;
}
export function ContractPhotoGallery({id}:{id:number}) {
  const {can}=useManagement();const [photos,setPhotos]=useState<SavedPhoto[]>([]),[error,setError]=useState(''),[version,setVersion]=useState(0),[busy,setBusy]=useState(false);
  useEffect(()=>{const controller=new AbortController();void fetch(photoEndpoint('contracts',id),{cache:'no-store',signal:controller.signal}).then(async response=>{const body=await response.json();if(!response.ok||body.status!=='success')throw Error(body.message||'Không tải được ảnh.');if(!controller.signal.aborted)setPhotos(body.data);}).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Không tải được ảnh.');});return()=>controller.abort();},[id,version]);
  return <section><p>Ảnh/video được lưu riêng theo lúc thuê, giao xe và từng lượt trả xe. Dùng nút Xóa dưới từng tệp để bỏ ảnh/video đã lưu nhầm.</p><button className="mg-button" type="button" disabled={busy} onClick={()=>{setError('');setVersion(value=>value+1);}}>Làm mới ảnh</button>
    {error&&<p role="alert">{error}</p>}<div className="mg-transaction-photo-gallery">{photos.filter(photo=>isContractTransactionPhoto(photo.slot)||photo.slot.startsWith('plate-')).map(photo=>{
      return <ContractPhotoCard key={photo.slot} id={id} slot={photo.slot} label={contractPhotoLabel(photo.slot)} mimeType={photo.mime_type} version={photo.updated_at} disabled={busy} onBusyChange={setBusy} onDeleted={()=>setPhotos(current=>current.filter(saved=>saved.slot!==photo.slot))}/>;
    })}</div>
    {can('contracts.draft')&&<ContractTransactionPhotos id={id} phase="rental" title="Tải ảnh khi thuê xe"/>}
  </section>;
}
