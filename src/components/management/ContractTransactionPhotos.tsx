'use client';
import { useEffect,useMemo,useRef,useState } from 'react';
import { Camera } from 'lucide-react';
import { SavedRecordPhotos } from './RecordPhotoFields';
import { contractPhotoSlots,contractPhotoLabel,isContractTransactionPhoto,type ContractPhotoPhase } from '@/lib/management/contract-photos';
import { photoEndpoint,type SavedPhoto } from '@/lib/management/record-photos';
import { useManagement } from './ManagementProvider';
import { ContractDocuments } from './ContractDocuments';
import type { ContractWorkflow } from './ContractWorkflowGuide';

export function ContractTransactionPhotos({id,phase,title,onPendingChange,workflow}:{id:number;phase:ContractPhotoPhase;title:string;workflow?:ContractWorkflow;onPendingChange?:(pending:boolean)=>void}) {
  const slots=useMemo(()=>contractPhotoSlots(phase),[phase]);
  const [photosPending,setPhotosPending]=useState(false);
  const [documentsPending,setDocumentsPending]=useState(false);const {can}=useManagement();
  const callback=useRef(onPendingChange);callback.current=onPendingChange;
  useEffect(()=>{callback.current?.(photosPending||documentsPending);},[photosPending,documentsPending]);
  useEffect(()=>()=>callback.current?.(false),[]);
  return <div><section className="mg-transaction-photos" aria-label={title}><h3><Camera size={16} aria-hidden="true"/>{title}</h3><p>{phase.startsWith('battery-swap-')?'Chụp biển số, phần trăm pin và video pin đã đổi.':phase.startsWith('renewal-')?'Lưu ảnh biên nhận và hồ sơ gia hạn.':'Chụp đủ toàn cảnh, đầu xe, đuôi xe, bên trái, bên phải và video.'} Ảnh đã lưu hiển thị lại bên dưới; không cần tải lặp. Lưu ảnh/video chỉ lưu hồ sơ. Kiểm tra và bấm Gửi toàn bộ Telegram ở bước cuối: gửi hết ảnh/video, sau đó một tin tổng hợp.</p><SavedRecordPhotos entity="contracts" recordId={id} slots={slots} title={title} onPendingChange={setPhotosPending}/></section>{(phase!=='rental'||can('contracts.draft'))&&<ContractDocuments id={id} phase={phase} workflow={workflow} onPendingChange={setDocumentsPending}/>}</div>;
}
export function ContractPhotoGallery({id}:{id:number}) {
  const {can}=useManagement();const [photos,setPhotos]=useState<SavedPhoto[]>([]),[error,setError]=useState(''),[version,setVersion]=useState(0);
  useEffect(()=>{const controller=new AbortController();void fetch(photoEndpoint('contracts',id),{cache:'no-store',signal:controller.signal}).then(async response=>{const body=await response.json();if(!response.ok||body.status!=='success')throw Error(body.message||'Không tải được ảnh.');if(!controller.signal.aborted)setPhotos(body.data);}).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Không tải được ảnh.');});return()=>controller.abort();},[id,version]);
  return <section><p>Ảnh/video được lưu riêng theo lúc thuê, giao xe và từng lượt trả xe.</p><button className="mg-button" type="button" onClick={()=>setVersion(value=>value+1)}>Làm mới ảnh</button>
    {error&&<p role="alert">{error}</p>}<div className="mg-transaction-photo-gallery">{photos.filter(photo=>isContractTransactionPhoto(photo.slot)||photo.slot.startsWith('plate-')).map(photo=>{
      const url=`${photoEndpoint('contracts',id,photo.slot)}?v=${encodeURIComponent(photo.updated_at)}`;
      return <div key={photo.slot}>{photo.mime_type==='video/mp4'?<><video controls playsInline preload="metadata" src={url} aria-label={contractPhotoLabel(photo.slot)}/><a href={url} target="_blank" rel="noopener noreferrer">{contractPhotoLabel(photo.slot)}</a></>:<a href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={contractPhotoLabel(photo.slot)} loading="lazy"/><span>{contractPhotoLabel(photo.slot)}</span></a>}</div>;
    })}</div>
    {can('contracts.draft')&&<ContractTransactionPhotos id={id} phase="rental" title="Tải ảnh khi thuê xe"/>}
  </section>;
}
