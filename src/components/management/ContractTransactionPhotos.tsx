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
import type { ContractChange } from '@/lib/management/contract-history';

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
export function ContractPhotoGallery({id,swaps=[]}:{id:number;swaps?:ContractChange[]}) {
  const {can}=useManagement();const [photos,setPhotos]=useState<SavedPhoto[]>([]),[error,setError]=useState(''),[version,setVersion]=useState(0),[busy,setBusy]=useState(false);
  useEffect(()=>{const controller=new AbortController();void fetch(photoEndpoint('contracts',id),{cache:'no-store',signal:controller.signal}).then(async response=>{const body=await response.json();if(!response.ok||body.status!=='success')throw Error(body.message||'Không tải được ảnh.');if(!controller.signal.aborted)setPhotos(body.data);}).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Không tải được ảnh.');});return()=>controller.abort();},[id,version]);
  const swapPhases=new Map<string,string>();
  for(const change of swaps){const match=change.id.match(/^swap-([1-9]\d{0,14})$/);if(match)swapPhases.set(`vehicle-swap-${match[1]}`,change.detail);}
  for(const photo of photos){const phase=photo.slot.match(/^(vehicle-swap-[1-9]\d{0,14})-/)?.[1];if(phase&&!swapPhases.has(phase))swapPhases.set(phase,`Lượt ${phase.split('-').at(-1)}`);}
  return <section><p>Ảnh/video được lưu riêng theo lúc thuê, giao xe và từng lượt trả/đổi xe. Dùng nút Xóa dưới từng tệp để bỏ ảnh/video đã lưu nhầm.</p><button className="mg-button" type="button" disabled={busy} onClick={()=>{setError('');setVersion(value=>value+1);}}>Làm mới ảnh</button>
    {error&&<p role="alert">{error}</p>}<div className="mg-transaction-photo-gallery">{photos.filter(photo=>isContractTransactionPhoto(photo.slot)||photo.slot.startsWith('plate-')).map(photo=>{
      return <ContractPhotoCard key={photo.slot} id={id} slot={photo.slot} label={contractPhotoLabel(photo.slot)} mimeType={photo.mime_type} version={photo.updated_at} disabled={busy} onBusyChange={setBusy} onDeleted={()=>setPhotos(current=>current.filter(saved=>saved.slot!==photo.slot))}/>;
    })}</div>
    {can('contracts.draft')&&<ContractTransactionPhotos id={id} phase="rental" title="Tải ảnh khi thuê xe"/>}
    {can('contracts.draft')&&[...swapPhases].map(([phase,label])=><SwapPhotoSupplement key={phase} id={id} phase={phase as ContractPhotoPhase} label={label} onSaved={()=>setVersion(value=>value+1)}/>)}
  </section>;
}
function SwapPhotoSupplement({id,phase,label,onSaved}:{id:number;phase:ContractPhotoPhase;label:string;onSaved:()=>void}){
  const [open,setOpen]=useState(false);
  return <details className="mg-extra-documents" onToggle={event=>setOpen(event.currentTarget.open)}><summary>Bổ sung ảnh đổi xe · {label}</summary>{open&&<SavedRecordPhotos entity="contracts" recordId={id} slots={contractPhotoSlots(phase)} compact title="Ảnh đổi xe" bulkImageLabel="Chọn nhiều ảnh đổi xe" onSaved={onSaved}/>}</details>;
}
