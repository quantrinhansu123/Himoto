'use client';
import { useEffect,useRef,useState } from 'react';
import { ImagePlus,LoaderCircle } from 'lucide-react';
import { prepareRecordPhoto,uploadRecordPhoto,type PendingPhotos } from '@/lib/management/record-photos';
import type { PhotoOcrController } from './usePhotoOcr';
import { nextPhotoInGroup } from '@/lib/management/photo-slot-groups';

export function CustomerDocumentBatch({ocr,value={},onChange,onBusyChange,disabled=false}:{ocr:PhotoOcrController;value?:PendingPhotos;onChange:(value:PendingPhotos)=>void;onBusyChange:(busy:boolean)=>void;disabled?:boolean}) {
  const picker=useRef<HTMLInputElement>(null),active=useRef(true);const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const callback=useRef(onBusyChange);callback.current=onBusyChange;
  useEffect(()=>{active.current=true;return()=>{active.current=false;callback.current(false);};},[]);
  async function choose(files:File[]){
    if(!files.length||disabled||busy)return;
    setBusy(true);callback.current(true);setError('');
    try{
      const prepared:File[]=[];for(const file of files)prepared.push(await prepareRecordPhoto(file));
      if(!active.current)return;
      const slots=['id_front','id_back','driver_license'],next={...value};prepared.forEach((file,index)=>{next[nextPhotoInGroup(slots[Math.min(index,2)],Object.keys(next))]=file;});onChange(next);
      for(const slot of slots)ocr.cancel(slot);
      for(const file of prepared)void uploadRecordPhoto(file).catch(()=>{});
      const readable:File[]=[];for(const file of prepared.slice(0,3)){if(readable.reduce((sum,image)=>sum+image.size,0)+file.size<=3*1024*1024)readable.push(file);}ocr.readMany('documents',readable);
    }catch(cause){if(active.current)setError(cause instanceof Error?cause.message:'Không đọc được bộ ảnh.');}
    finally{if(active.current){setBusy(false);callback.current(false);}}
  }
  const state=ocr.states.documents;
  return <div className="mg-document-batch"><p>Chọn nhiều ảnh CCCD / hộ chiếu và GPLX của cùng một khách. Toàn bộ ảnh được giữ trong hồ sơ; AI đọc tối đa 3 ảnh đầu để tự điền. Kiểm tra lại thông tin trước khi lưu.</p>
    <input hidden ref={picker} type="file" accept="image/*" multiple aria-label="Chọn bộ ảnh CCCD và GPLX" disabled={disabled||busy||ocr.pending} onChange={event=>{const files=Array.from(event.target.files||[]);event.target.value='';void choose(files);}}/>
    <button type="button" className="mg-button" disabled={disabled||busy||ocr.pending} onClick={()=>picker.current?.click()}>{busy?<LoaderCircle size={16} className="mg-spin"/>:<ImagePlus size={16}/>}Chọn nhiều ảnh · AI đọc cùng lúc</button>
    {busy&&<p role="status">Đang chuẩn bị bộ ảnh…</p>}{state&&<p role={state.phase==='error'?'alert':'status'} className={state.phase==='error'?'mg-field-error':undefined}>{state.message}</p>}
    {state?.phase==='reading'&&<button className="mg-button" type="button" onClick={()=>ocr.cancel('documents')}>Bỏ qua AI</button>}
    {error&&<p className="mg-field-error" role="alert">{error}</p>}
  </div>;
}
