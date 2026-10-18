'use client';
import { useEffect,useMemo,useRef,useState } from 'react';
import { contractDocumentSlots,CONTRACT_CUSTOMER_PHOTO_SLOTS,type ContractPhotoPhase } from '@/lib/management/contract-photos';
import { copyCustomerPhotosToContract,photoEndpoint,type SavedPhoto } from '@/lib/management/record-photos';
import { SavedRecordPhotos } from './RecordPhotoFields';
import { ContractWorkflowGuide,type ContractWorkflow } from './ContractWorkflowGuide';

export function ContractDocuments({id,phase,onPendingChange,workflow}:{id:number;phase:ContractPhotoPhase;workflow?:ContractWorkflow;onPendingChange?:(pending:boolean)=>void}) {
  const slots=useMemo(()=>contractDocumentSlots(phase),[phase]);
  const [importing,setImporting]=useState(phase==='rental'),[pending,setPending]=useState(false),[error,setError]=useState(''),[version,setVersion]=useState(0),[photos,setPhotos]=useState<SavedPhoto[]>([]);
  const callback=useRef(onPendingChange);callback.current=onPendingChange;
  useEffect(()=>{callback.current?.(importing||pending);},[importing,pending]);
  useEffect(()=>()=>callback.current?.(false),[]);
  useEffect(()=>{
    if(phase!=='rental')return;
    let active=true;
    setImporting(true);setError('');
    void copyCustomerPhotosToContract(id).then(()=>fetch(photoEndpoint('contracts',id),{cache:'no-store'})).then(async response=>{
      const body=await response.json();if(!response.ok||body.status!=='success')throw new Error(body.message||'Không tải được giấy tờ.');
      if(active)setPhotos(body.data);
    }).catch(cause=>{if(active)setError(cause instanceof Error?cause.message:'Không lấy được giấy tờ khách hàng.');}).finally(()=>{if(active)setImporting(false);});
    return()=>{active=false;};
  },[id,phase,version]);
  return <section className="mg-contract-documents" aria-label="Hồ sơ hợp đồng bổ sung">
    <h3>Hồ sơ hợp đồng & giấy tờ khách hàng</h3>
    <p>Có thể bỏ qua các giấy tờ không áp dụng cho khách này. Ảnh hồ sơ được gửi Telegram cùng ảnh/video của giao dịch sau khi lưu.</p>
    {phase==='rental'&&<div>
      {importing?<p role="status">Đang lấy ảnh CCCD / hộ chiếu / GPLX đã lưu ở hồ sơ khách…</p>:<>
        <p role="status">{photos.filter(photo=>CONTRACT_CUSTOMER_PHOTO_SLOTS.some(slot=>slot.key===photo.slot)||photo.slot==='driver-license').length} ảnh giấy tờ đã gắn với hợp đồng.</p>
        <div className="mg-photo-grid">{[...CONTRACT_CUSTOMER_PHOTO_SLOTS,{key:'driver-license',label:'GPLX chụp khi lập hợp đồng'}].filter(slot=>photos.some(photo=>photo.slot===slot.key)).map(slot=>{
          const photo=photos.find(item=>item.slot===slot.key)!;const url=`${photoEndpoint('contracts',id,slot.key)}?v=${encodeURIComponent(photo.updated_at)}`;
          return <a key={slot.key} className="mg-photo-slot" href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={slot.label} loading="lazy"/><span>{slot.label}</span></a>;
        })}</div>
        <button type="button" className="mg-button" disabled={pending} onClick={()=>setVersion(value=>value+1)}>Lấy thêm giấy tờ đã lưu ở hồ sơ khách</button>
      </>}
      {error&&<p className="mg-field-error" role="alert">{error}</p>}
    </div>}
    <ContractWorkflowGuide workflow={workflow||(phase.startsWith('return-')?'return':phase.startsWith('renewal-')?'renewal':phase==='handover'?'handover':'rental')}/>
    <SavedRecordPhotos entity="contracts" recordId={id} slots={slots} title="Ảnh hồ sơ bổ sung · riêng với ảnh xe" onPendingChange={setPending} bulkImageLabel="Tải thêm loạt ảnh hồ sơ hợp đồng" bulkPosition="bottom"/>
  </section>;
}
