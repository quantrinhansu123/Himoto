'use client';
import { useEffect,useRef,useState } from 'react';
import { ImagePlus,LoaderCircle } from 'lucide-react';
import { prepareRecordPhoto,uploadRecordPhoto,type PendingPhotos } from '@/lib/management/record-photos';
import type { PhotoOcrController } from './usePhotoOcr';

export function CustomerDocumentBatch({ocr,onChange,onBusyChange,disabled=false}:{ocr:PhotoOcrController;onChange:(value:PendingPhotos)=>void;onBusyChange:(busy:boolean)=>void;disabled?:boolean}) {
  const picker=useRef<HTMLInputElement>(null),active=useRef(true);const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const callback=useRef(onBusyChange);callback.current=onBusyChange;
  useEffect(()=>{active.current=true;return()=>{active.current=false;callback.current(false);};},[]);
  async function choose(files:File[]){
    if(!files.length||disabled||busy)return;
    if(files.length>3){setError('Chọn tối đa 3 ảnh của cùng một khách. Một ảnh có thể chứa nhiều giấy tờ.');return;}
    setBusy(true);callback.current(true);setError('');
    try{
      const prepared:File[]=[];for(const file of files)prepared.push(await prepareRecordPhoto(file));
      if(prepared.reduce((sum,file)=>sum+file.size,0)>3*1024*1024)throw new Error('Tổng bộ ảnh sau xử lý vượt 3 MB. Chọn ít ảnh hơn hoặc chụp sát giấy tờ.');
      if(!active.current)return;
      const slots=['id_front','id_back','driver_license'];onChange(Object.fromEntries(prepared.map((file,index)=>[slots[index],file])));
      for(const slot of slots)ocr.cancel(slot);
      for(const file of prepared)void uploadRecordPhoto(file).catch(()=>{});
      ocr.readMany('documents',prepared);
    }catch(cause){if(active.current)setError(cause instanceof Error?cause.message:'Không đọc được bộ ảnh.');}
    finally{if(active.current){setBusy(false);callback.current(false);}}
  }
  const state=ocr.states.documents;
  return <div className="mg-document-batch"><p>Chọn 1–3 ảnh của cùng một khách để AI đọc CCCD / hộ chiếu và GPLX cùng lúc. Có thể có nhiều giấy tờ trong một ảnh; chụp rõ chữ và kiểm tra lại kết quả.</p>
    <input hidden ref={picker} type="file" accept="image/*" multiple aria-label="Chọn bộ ảnh CCCD và GPLX" disabled={disabled||busy||ocr.pending} onChange={event=>{const files=Array.from(event.target.files||[]);event.target.value='';void choose(files);}}/>
    <button type="button" className="mg-button" disabled={disabled||busy||ocr.pending} onClick={()=>picker.current?.click()}>{busy?<LoaderCircle size={16} className="mg-spin"/>:<ImagePlus size={16}/>}Chọn nhiều ảnh · AI đọc cùng lúc</button>
    {busy&&<p role="status">Đang chuẩn bị bộ ảnh…</p>}{state&&<p role={state.phase==='error'?'alert':'status'} className={state.phase==='error'?'mg-field-error':undefined}>{state.message}</p>}
    {state?.phase==='reading'&&<button className="mg-button" type="button" onClick={()=>ocr.cancel('documents')}>Bỏ qua AI</button>}
    {error&&<p className="mg-field-error" role="alert">{error}</p>}
  </div>;
}
