'use client';
import { useEffect,useRef,useState } from 'react';
import { Send } from 'lucide-react';
import { contractPhotoSlots } from '@/lib/management/contract-photos';
import { SavedRecordPhotos } from './RecordPhotoFields';
import { ContractTelegramPanel } from './ContractTelegramPanel';

export function ContractVehicleSwapFollowup({id,swapId,onPendingChange,onSaved}:{id:number;swapId:number;onPendingChange?:(pending:boolean)=>void;onSaved?:()=>void}){
  const [pending,setPending]=useState(false),[showTelegram,setShowTelegram]=useState(false),[version,setVersion]=useState(0);
  const callback=useRef(onPendingChange);callback.current=onPendingChange;
  useEffect(()=>{callback.current?.(pending);},[pending]);
  useEffect(()=>()=>callback.current?.(false),[]);
  return <section aria-label="Ảnh và Telegram lượt đổi xe">
    <SavedRecordPhotos entity="contracts" recordId={id} slots={contractPhotoSlots(`vehicle-swap-${swapId}`)}
      title="Ảnh đổi xe" compact bulkImageLabel="Chọn nhiều ảnh đổi xe" onPendingChange={setPending}
      onSaved={()=>{setVersion(value=>value+1);onSaved?.();}}/>
    {pending&&<p role="status">Lưu ảnh trước khi kiểm tra và gửi Telegram.</p>}
    <button type="button" className="mg-button mg-button-primary" disabled={pending} onClick={()=>setShowTelegram(true)}><Send size={16} aria-hidden="true"/>Kiểm tra &amp; gửi Telegram</button>
    {showTelegram&&!pending&&<ContractTelegramPanel key={version} id={id} eventKey={`vehicle-swap:${id}:${swapId}`} onlyEventKey/>}
  </section>;
}
