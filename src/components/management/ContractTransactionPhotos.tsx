'use client';
import { useEffect,useMemo,useRef,useState } from 'react';
import { Camera } from 'lucide-react';
import { SavedRecordPhotos } from './RecordPhotoFields';
import { contractPhotoSlots,contractPhotoLabel,isContractTransactionPhoto,type ContractPhotoPhase } from '@/lib/management/contract-photos';
import { photoEndpoint,type SavedPhoto } from '@/lib/management/record-photos';
import { useManagement } from './ManagementProvider';
import { ContractTelegramAuto } from './ContractTelegramPanel';
import { ContractDocuments } from './ContractDocuments';
import type { ContractWorkflow } from './ContractWorkflowGuide';

export function ContractTransactionPhotos({id,phase,title,onPendingChange,workflow}:{id:number;phase:ContractPhotoPhase;title:string;workflow?:ContractWorkflow;onPendingChange?:(pending:boolean)=>void}) {
  const slots=useMemo(()=>contractPhotoSlots(phase),[phase]);
  const [modePending,setModePending]=useState(false),[photosPending,setPhotosPending]=useState(false);
  const [documentsPending,setDocumentsPending]=useState(false);const {can}=useManagement();
  const callback=useRef(onPendingChange);callback.current=onPendingChange;
  useEffect(()=>{callback.current?.(modePending||photosPending||documentsPending);},[modePending,photosPending,documentsPending]);
  useEffect(()=>()=>callback.current?.(false),[]);
  return <div><ContractTelegramAuto id={id} onBusyChange={setModePending}/><details className="mg-transaction-photos"><summary><Camera size={16} aria-hidden="true"/>{title}</summary><p>Ảnh/video không bắt buộc. Chọn/chụp rồi bấm Lưu ảnh trước khi hoàn tất giao dịch để đưa ảnh vào thông báo.</p><SavedRecordPhotos entity="contracts" recordId={id} slots={slots} title={title} onPendingChange={setPhotosPending}/></details>{(phase!=='rental'||can('contracts.draft'))&&<ContractDocuments id={id} phase={phase} workflow={workflow} onPendingChange={setDocumentsPending}/>}</div>;
}
export function ContractPhotoGallery({id}:{id:number}) {
  const {can}=useManagement();const [photos,setPhotos]=useState<SavedPhoto[]>([]),[error,setError]=useState(''),[version,setVersion]=useState(0);
  useEffect(()=>{const controller=new AbortController();void fetch(photoEndpoint('contracts',id),{cache:'no-store',signal:controller.signal}).then(async response=>{const body=await response.json();if(!response.ok||body.status!=='success')throw Error(body.message||'Không tải được ảnh.');if(!controller.signal.aborted)setPhotos(body.data);}).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Không tải được ảnh.');});return()=>controller.abort();},[id,version]);
  return <section><p>Ảnh/video được lưu riêng theo lúc thuê, giao xe và từng lượt trả xe.</p><button className="mg-button" type="button" onClick={()=>setVersion(value=>value+1)}>Làm mới ảnh</button>
    {error&&<p role="alert">{error}</p>}<div className="mg-transaction-photo-gallery">{photos.filter(photo=>isContractTransactionPhoto(photo.slot)).map(photo=>{
      const url=`${photoEndpoint('contracts',id,photo.slot)}?v=${encodeURIComponent(photo.updated_at)}`;
      return <div key={photo.slot}>{photo.mime_type==='video/mp4'?<><video controls playsInline preload="metadata" src={url} aria-label={contractPhotoLabel(photo.slot)}/><a href={url} target="_blank" rel="noopener noreferrer">{contractPhotoLabel(photo.slot)}</a></>:<a href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={contractPhotoLabel(photo.slot)} loading="lazy"/><span>{contractPhotoLabel(photo.slot)}</span></a>}</div>;
    })}</div>
    {can('contracts.draft')&&<ContractTransactionPhotos id={id} phase="rental" title="Tải ảnh khi thuê xe"/>}
  </section>;
}
