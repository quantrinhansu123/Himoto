'use client';
import { useEffect,useRef,useState } from 'react';
import { abortAny, abortTimeout } from '@/lib/abort-signal';
import { cleanOcrFields } from '@/lib/management/photo-ocr';
import { combineRefundRecipient,decodeRefundQr,type RefundRecipient,type RefundRecipientFields } from '@/lib/management/refund-qr';
import { deleteRecordPhoto,photoEndpoint,prepareRecordPhoto,saveRecordPhotos,type PendingPhotos } from '@/lib/management/record-photos';
import { nextPhotoInGroup } from '@/lib/management/photo-slot-groups';

export function RefundQrUpload({orderId,slot,savedSlot,recipient,disabled,onRead,onSaved,onRemoved,onBusy}:{
  orderId:number;slot:string;savedSlot?:string;recipient:RefundRecipient;disabled?:boolean;
  onRead:(fields:RefundRecipientFields,before:RefundRecipient)=>void;onSaved:()=>void;onRemoved?:()=>void;onBusy:(busy:boolean)=>void;
}){
  const [busy,setBusy]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState('');
  const [lastFile,setLastFile]=useState<File>();
  const lastBatch=useRef<{source:File;photos:PendingPhotos;first:File}|undefined>(undefined);
  const fileInput=useRef<HTMLInputElement>(null),cameraInput=useRef<HTMLInputElement>(null);
  const active=useRef<AbortController|undefined>(undefined),locked=useRef(false),latest=useRef({recipient,onRead,onSaved,onRemoved,onBusy});
  latest.current={recipient,onRead,onSaved,onRemoved,onBusy};
  useEffect(()=>()=>{active.current?.abort();latest.current.onBusy(false);},[]);
  async function readImage(source?:File,additional:File[]=[]){
    if(locked.current||disabled)return;
    locked.current=true;const controller=new AbortController();active.current=controller;
    const before={...latest.current.recipient};setBusy(true);latest.current.onBusy(true);setError('');
    let saved=false,decoded:RefundRecipientFields|undefined;
    try{
      setStatus(source?'Đang xử lý và lưu ảnh QR…':'Đang tải ảnh QR đã lưu…');
      let photo:File;
      if(source){
        setLastFile(source);
        let batch=lastBatch.current;
        if(batch?.source!==source){
          const response=await fetch(photoEndpoint('contracts',orderId),{credentials:'same-origin',cache:'no-store',signal:controller.signal});
          const body=await response.json();if(!response.ok||body.status!=='success'||!Array.isArray(body.data))throw Error('Không tải được ảnh đã lưu. Thử lại để tránh ghi đè ảnh.');
          const keys=body.data.map((item:{slot:string})=>item.slot),photos:PendingPhotos={};
          for(const file of [source,...additional]){const key=nextPhotoInGroup(slot,keys);photos[key]=await prepareRecordPhoto(file);keys.push(key);}
          batch={source,photos,first:Object.values(photos)[0]};lastBatch.current=batch;
        }
        photo=batch.first;
        if(controller.signal.aborted)return;
        await saveRecordPhotos('contracts',orderId,batch.photos);
        saved=true;
        if(controller.signal.aborted)return;
        latest.current.onSaved();
      }else{
        if(!savedSlot)throw new Error('Chưa có ảnh QR để đọc.');
        const response=await fetch(photoEndpoint('contracts',orderId,savedSlot),{credentials:'same-origin',cache:'no-store',signal:controller.signal});
        if(!response.ok)throw new Error('Chưa tải được ảnh QR đã lưu. Chọn lại ảnh hoặc thử lại.');
        const blob=await response.blob();photo=await prepareRecordPhoto(new File([blob],'qr-da-luu',{type:blob.type}));saved=true;
      }
      setStatus('Đã lưu ảnh. Đang đọc QR và thông tin người nhận…');
      decoded=await decodeRefundQr(photo).catch(()=>undefined);
      if(controller.signal.aborted)return;
      let fields:RefundRecipientFields=decoded||{},aiError='';
      try{
        const response=await fetch(`/api/auth/order/car-rental/${orderId}/refund-qr`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':photo.type},body:photo,signal:abortAny([controller.signal,abortTimeout(45_000)])});
        const body=await response.json().catch(()=>null);
        if(!response.ok||body?.status!=='success')throw new Error(body?.message||'AI chưa đọc được chữ trên ảnh.');
        fields=combineRefundRecipient(decoded,cleanOcrFields(body.data?.fields,'refund_qr'));
      }catch(cause){if(controller.signal.aborted)return;aiError=cause instanceof Error?cause.message:'AI chưa đọc được chữ trên ảnh.';}
      if(controller.signal.aborted)return;
      latest.current.onRead(fields,before);
      setStatus(Object.keys(fields).length
        ? `Đã lưu ảnh và đọc thông tin nhận hoàn. Kiểm tra các ô bên dưới trước khi xác nhận.${!fields.recipient_name?' Ảnh chưa đọc được tên chủ tài khoản; bổ sung nếu cần.':''}`
        : 'Đã lưu ảnh; chưa đọc rõ thông tin. Chọn ảnh rõ hơn hoặc nhập tay các ô bên dưới.');
      if(aiError)setError(decoded?`Đã quét được ngân hàng và số tài khoản từ QR. ${aiError}`:aiError);
    }catch(cause){
      if(!controller.signal.aborted){setStatus(saved?'Ảnh đã được lưu.':'');setError(cause instanceof Error?cause.message:'Chưa xử lý được ảnh QR. Thử lại hoặc nhập tay.');}
    }finally{
      locked.current=false;
      if(!controller.signal.aborted){setBusy(false);latest.current.onBusy(false);}
    }
  }
  function choose(files:FileList|null){const selected=Array.from(files||[]);if(selected.length)void readImage(selected[0],selected.slice(1));}
  async function removeSaved(){
    if(!savedSlot||locked.current||disabled)return;
    locked.current=true;setBusy(true);latest.current.onBusy(true);setError('');setStatus('Đang xóa ảnh QR…');
    try{
      await deleteRecordPhoto('contracts',orderId,savedSlot);
      setLastFile(undefined);lastBatch.current=undefined;setStatus('Đã xóa ảnh QR. Chọn ảnh khác nếu tải nhầm.');
      latest.current.onRemoved?.();
    }catch(cause){setStatus('');setError(cause instanceof Error?cause.message:'Không xóa được ảnh QR.');}
    finally{locked.current=false;setBusy(false);latest.current.onBusy(false);}
  }
  return <div className="mg-field mg-field-wide" aria-label="Quét ảnh QR nhận hoàn cọc" aria-busy={busy}>
    <strong>Ảnh QR / tài khoản nhận hoàn cọc</strong>
    <p className="mg-composer-hint">Có thể chọn nhiều ảnh QR / tài khoản. Tất cả ảnh được lưu vào hồ sơ trả xe; ảnh đầu được dùng để tự điền thông tin người nhận. Kiểm tra lại trước khi xác nhận.</p>
    <div className="mg-actions" style={{display:'flex',flexWrap:'wrap',gap:8}}>
      <button type="button" className="mg-button" disabled={disabled||busy} onClick={()=>fileInput.current?.click()}>Tải ảnh QR để tự điền</button>
      <button type="button" className="mg-button" disabled={disabled||busy} onClick={()=>cameraInput.current?.click()}>Chụp ảnh QR</button>
      {savedSlot&&<button type="button" className="mg-button" disabled={disabled||busy} onClick={()=>void readImage()}>Đọc lại ảnh QR đã lưu</button>}
      {savedSlot&&<button type="button" className="mg-button" disabled={disabled||busy} onClick={()=>void removeSaved()}>Xóa ảnh QR</button>}
      {error&&lastFile&&<button type="button" className="mg-button" disabled={disabled||busy} onClick={()=>void readImage(lastFile)}>Thử lại ảnh vừa chọn</button>}
    </div>
    <input ref={fileInput} type="file" accept="image/*" multiple aria-label="Chọn ảnh QR nhận hoàn cọc" hidden disabled={disabled||busy} onChange={event=>{choose(event.currentTarget.files);event.currentTarget.value='';}}/>
    <input ref={cameraInput} type="file" accept="image/*" capture="environment" aria-label="Chụp mã QR nhận hoàn cọc" hidden disabled={disabled||busy} onChange={event=>{choose(event.currentTarget.files);event.currentTarget.value='';}}/>
    {status&&<p role="status">{status}</p>}
    {error&&<p className="mg-field-error" role="alert">{error}</p>}
  </div>;
}
