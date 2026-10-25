'use client';

import { useEffect, useId, useRef, useState,type ReactNode } from 'react';
import { Camera, ImagePlus, LoaderCircle, X } from 'lucide-react';
import { PendingPhotos, PhotoEntity, PhotoSlot, SavedPhoto, deleteRecordPhoto, photoEndpoint, prepareRecordPhoto, saveRecordPhotos, uploadRecordMedia } from '@/lib/management/record-photos';
import type { PhotoOcrController } from './usePhotoOcr';
import { isVideoSlot,prepareRecordVideo } from '@/lib/management/record-photos';
import { expandContractPhotoSlots,expandablePhotoPrefix,expandSignedContractPhotoSlots,isSignedContractPhoto,nextSignedContractPhotoSlot } from '@/lib/management/contract-photos';
import { RecordPhotoImage } from './RecordPhotoImage';

export function PhotoField({ slot, file, savedUrl, disabled, onChange, onBusyChange, onSelectMany, fileHint='Tệp mới · bấm Lưu ảnh / video bên dưới' }: { slot: PhotoSlot; file?: File; savedUrl?: string; disabled: boolean; onChange: (file?: File) => void; onBusyChange: (busy: boolean) => void;onSelectMany?:(files:File[])=>void;fileHint?:string }) {
  const camera = useRef<HTMLInputElement>(null), library = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const generation = useRef(0);
  const labelId = useId();
  const video=isVideoSlot(slot.key);
  const latestBusyChange = useRef(onBusyChange); latestBusyChange.current = onBusyChange;
  useEffect(() => () => { generation.current++; latestBusyChange.current(false); }, []);
  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  async function select(file?: File) {
    if (!file) return;
    if(onSelectMany){onSelectMany([file]);return;}
    const current = ++generation.current;
    setBusy(true); onBusyChange(true); setError('');
    try { const prepared = await (video?prepareRecordVideo(file):prepareRecordPhoto(file)); if (current === generation.current) onChange(prepared); }
    catch (cause) { if (current === generation.current) setError(cause instanceof Error ? cause.message : 'Không xử lý được ảnh.'); }
    finally { if (current === generation.current) { setBusy(false); latestBusyChange.current(false); } }
  }
  return <div className="mg-photo-slot" role="group" aria-labelledby={labelId}>
    <strong id={labelId}>{slot.label}</strong>
    {video&&(preview||savedUrl)?<video controls playsInline preload="metadata" src={preview||savedUrl} aria-label={slot.label}/>: (preview || savedUrl) && <RecordPhotoImage src={preview||savedUrl!} alt={slot.label}/>}
    <input hidden ref={camera} type="file" accept={video?'video/*':'image/*'} capture="environment" aria-label={`${video?'Quay':'Chụp'} ${slot.label}`} disabled={disabled || busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void select(file); }} />
    <input hidden ref={library} type="file" accept={video?'video/mp4,video/quicktime,video/webm':'image/*'} multiple={Boolean(onSelectMany)} aria-label={`Chọn ${video?'video':'ảnh'} ${slot.label}`} disabled={disabled || busy} onChange={event => { const files = Array.from(event.target.files||[]); event.target.value = ''; if(onSelectMany)onSelectMany(files);else void select(files[0]); }} />
    <div className="mg-photo-actions"><button type="button" className="mg-button" disabled={disabled || busy} onClick={() => camera.current?.click()}>{busy ? <LoaderCircle size={16} className="mg-spin" /> : <Camera size={16} />}{video?'Quay video':'Chụp ảnh'}</button>
      <button type="button" className="mg-button" disabled={disabled || busy} onClick={() => library.current?.click()}><ImagePlus size={16} />{video?'Chọn video':'Chọn ảnh'}</button>
      {(file || savedUrl) && <button type="button" className="mg-icon-button is-danger" disabled={disabled || busy} title={file ? 'Bỏ ảnh mới' : 'Xóa ảnh đã lưu'} aria-label={file ? `Bỏ ảnh mới ${slot.label}` : `Xóa ${video?'video':'ảnh'} ${slot.label}`} onClick={() => onChange()}><X size={16} /></button>}</div>
    {busy && <small role="status">Đang xử lý tệp…</small>}{file && <small>{fileHint}</small>}
    {onSelectMany&&<small>Có thể chọn nhiều trang cùng lúc hoặc chụp thêm từng trang; ảnh mới được thêm vào bộ hợp đồng.</small>}
    {error && <p className="mg-field-error" role="alert">{error}</p>}
  </div>;
}

export function RecordPhotoFields({ entity, recordId, slots, value, onChange, disabled = false, onBusyChange, title = 'Ảnh hồ sơ', ocr,bulkImageLabel='Chọn nhiều ảnh',bulkPosition='top',compact=false,actions }: {
  entity: PhotoEntity; recordId?: number; slots: PhotoSlot[]; value: PendingPhotos; onChange: (value: PendingPhotos) => void;
  disabled?: boolean; onBusyChange?: (busy: boolean) => void; title?: string; ocr?: PhotoOcrController;bulkImageLabel?:string;bulkPosition?:'top'|'bottom';compact?:boolean;actions?:ReactNode;
}) {
  const [saved, setSaved] = useState<SavedPhoto[]>([]), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const [savedReady,setSavedReady]=useState(!recordId||entity==='vehicles');
  const busySlots = useRef(new Set<string>());
  const latestValue = useRef(value); latestValue.current = value;
  const latestSaved = useRef(saved); latestSaved.current = saved;
  const [uploadStates, setUploadStates] = useState<Record<string, { loading: boolean; error?: string; message?: string }>>({});
  const imagePicker=useRef<HTMLInputElement>(null),videoPicker=useRef<HTMLInputElement>(null),cameraPicker=useRef<HTMLInputElement>(null);
  const [batchBusy,setBatchBusy]=useState(false);
  const [uploadTab,setUploadTab]=useState<'quick'|'detail'>('quick');
  const tabId=useId();
  slots=entity==='contracts'?expandContractPhotoSlots(slots,[...saved.map(photo=>photo.slot),...Object.keys(value)]):slots;
  slots=entity==='contracts'?expandSignedContractPhotoSlots(slots,[...saved.map(photo=>photo.slot),...Object.keys(value)]):slots;
  if(compact&&entity==='contracts'){
    const documents=slots.filter(slot=>slot.key.includes('-document-'));
    const extra=expandContractPhotoSlots(documents,[...saved.map(photo=>photo.slot),...Object.keys(value)]);
    slots=[...slots,...extra.filter(slot=>!slots.some(existing=>existing.key===slot.key))];
  }
  const imagePrefix=entity==='contracts'?expandablePhotoPrefix(slots):undefined;
  const signedEvidenceOnly=slots.every(slot=>isSignedContractPhoto(slot.key)||slot.key==='rental-document-2');
  const bulk=entity==='contracts'&&(compact||slots.length>6)&&!signedEvidenceOnly;
  const imageCount=slots.filter(slot=>!isVideoSlot(slot.key)).length,videoCount=slots.length-imageCount;
  const compactDocuments=compact?slots.filter((slot,index,list)=>{
    if(isSignedContractPhoto(slot.key))return true;
    if(!slot.key.includes('-document-'))return false;
    const documents=list.filter(item=>item.key.includes('-document-'));
    const keep=documents.some(item=>item.key.includes('return-'))?3:2;
    return documents.indexOf(slot)<keep||value[slot.key]||saved.some(photo=>photo.slot===slot.key);
  }):[];
  async function chooseSignedPages(files:File[]) {
    if(disabled||batchBusy||busySlots.current.has('__signed')||!savedReady||!files.length)return;
    setError('');setBatchBusy(true);busySlots.current.add('__signed');onBusyChange?.(true);
    try{for(const source of files){
      const file=await prepareRecordPhoto(source);
      const slot=nextSignedContractPhotoSlot([...latestSaved.current.map(photo=>photo.slot),...Object.keys(latestValue.current)]);
      const next={...latestValue.current,[slot]:file};latestValue.current=next;onChange(next);upload(slot,file);
    }}catch(cause){setError(cause instanceof Error?cause.message:'Không xử lý được ảnh hợp đồng.');}
    finally{setBatchBusy(false);busySlots.current.delete('__signed');onBusyChange?.(busySlots.current.size>0);}
  }
  async function chooseMany(files:File[],video:boolean) {
    if(disabled||batchBusy||!savedReady)return;
    const available=slots.filter(slot=>isVideoSlot(slot.key)===video&&(!compact||!slot.key.includes('-document-')&&!isSignedContractPhoto(slot.key))&&!latestValue.current[slot.key]&&!saved.some(photo=>photo.slot===slot.key));
    if(!video&&imagePrefix){
      let index=1;
      while(available.length<files.length){
        const key=`${imagePrefix}${index++}`;
        if(!slots.some(slot=>slot.key===key)&&!latestValue.current[key]&&!saved.some(photo=>photo.slot===key))available.push({key,label:`Ảnh bổ sung ${index-1}`});
      }
    }
    if(files.length>available.length){setError(`Còn ${available.length} ô ${video?'video':'ảnh'}. Chọn tối đa số tệp này.`);return;}
    setError('');setBatchBusy(true);busySlots.current.add('__batch');onBusyChange?.(true);
    try{for(let i=0;i<files.length;i++){
      const file=await(video?prepareRecordVideo(files[i]):prepareRecordPhoto(files[i]));
      let slot=available[i].key;
      const qrSlot=!video&&compact?slots.find(item=>/^return-[1-9]\d*-document-2$/.test(item.key))?.key:undefined;
      if(qrSlot&&!latestValue.current[qrSlot]&&!saved.some(photo=>photo.slot===qrSlot)){
        const {decodeRefundQr}=await import('@/lib/management/refund-qr');
        if(await decodeRefundQr(file).catch(()=>undefined))slot=qrSlot;
      }
      // A detected QR takes its own slot without consuming/overwriting the next vehicle photo.
      while(latestValue.current[slot]||saved.some(photo=>photo.slot===slot)){
        const free=available.find(candidate=>!latestValue.current[candidate.key]&&!saved.some(photo=>photo.slot===candidate.key));
        if(!free)throw new Error('Không còn ô tệp trống. Lưu các ảnh đã chọn rồi tải thêm.');
        slot=free.key;
      }
      const next={...latestValue.current,[slot]:file};latestValue.current=next;onChange(next);upload(slot,file);
    }}catch(cause){setError(cause instanceof Error?cause.message:'Không xử lý được tệp.');}
    finally{setBatchBusy(false);busySlots.current.delete('__batch');onBusyChange?.(busySlots.current.size>0);}
  }
  function applySlot(slot: string, file?: File) {
    const hadPending = Boolean(latestValue.current[slot]);
    const next = { ...latestValue.current };
    if (file) { next[slot] = file; upload(slot, file); ocr?.read(slot, file); }
    else {
      delete next[slot];
      setUploadStates(current => { const copy = { ...current }; delete copy[slot]; return copy; });
      ocr?.cancel(slot);
    }
    latestValue.current = next; onChange(next);
    if (file || hadPending || !recordId || !latestSaved.current.some(photo => photo.slot === slot)) return;
    setError('');
    void deleteRecordPhoto(entity, recordId, slot).then(() => {
      setSaved(current => current.filter(photo => photo.slot !== slot));
    }).catch(cause => { setError(cause instanceof Error ? cause.message : 'Không xóa được ảnh.'); });
  }
  function upload(slot: string, file: File, retry = false) {
    setUploadStates(current => ({ ...current, [slot]: { loading: true } }));
    void uploadRecordMedia(file, retry, { onProgress: progress => {
      if (latestValue.current[slot] === file) setUploadStates(current => ({ ...current, [slot]: { loading: true,
        message: `${progress.message}${progress.percent === undefined ? '…' : ` · ${progress.percent}%`}` } }));
    } }).then(() => {
      if (latestValue.current[slot] === file) setUploadStates(current => ({ ...current, [slot]: { loading: false } }));
    }).catch(cause => {
      if (latestValue.current[slot] === file) setUploadStates(current => ({ ...current, [slot]: { loading: false, error: cause instanceof Error ? cause.message : 'Không tải được ảnh.' } }));
    });
  }
  useEffect(() => {
    setSaved([]); setError('');setSavedReady(!recordId||entity==='vehicles');
    if (!recordId) return;
    const controller = new AbortController();
    fetch(photoEndpoint(entity, recordId), { signal: controller.signal, cache: 'no-store' }).then(async response => {
      const result = await response.json();
      if (!response.ok || result.status !== 'success') throw new Error(result.message || 'Không tải được ảnh đã lưu.');
      if (!controller.signal.aborted) {setSaved(result.data);setSavedReady(true);}
    }).catch(cause => { if (!controller.signal.aborted) { setError(cause instanceof Error ? cause.message : 'Không tải được ảnh đã lưu.'); setSavedReady(false); } });
    return () => controller.abort();
  }, [entity, recordId, retry]);
  const occupied=slots.filter(slot=>value[slot.key]||saved.some(photo=>photo.slot===slot.key));
  const toolbar=bulk&&<div className="mg-media-upload-toolbar">{!compact&&<p>{imagePrefix?'Không giới hạn số ảnh. Có thể tải thêm nhiều đợt.':`Tối đa ${imageCount} ảnh.`}{videoCount>0?` Tối đa ${videoCount} video; mỗi video tối đa 60 giây / 45 MB.`:' Chọn nhiều ảnh từ thư viện.'} Chỉ gửi Telegram khi bấm Gửi toàn bộ ở bước cuối.</p>}
    <input hidden ref={imagePicker} type="file" accept="image/*" multiple aria-label={bulkImageLabel==='Chọn nhiều ảnh'?'Chọn nhiều ảnh hồ sơ':bulkImageLabel} disabled={disabled||batchBusy||!savedReady} onChange={e=>{const files=Array.from(e.target.files||[]);e.target.value='';void chooseMany(files,false);}}/>
    {videoCount>0&&<input hidden ref={videoPicker} type="file" accept="video/mp4,video/quicktime,video/webm" multiple aria-label="Chọn nhiều video tình trạng xe" disabled={disabled||batchBusy} onChange={e=>{const files=Array.from(e.target.files||[]);e.target.value='';void chooseMany(files,true);}}/>}
    {compact&&<input hidden ref={cameraPicker} type="file" accept="image/*" capture="environment" aria-label="Chụp ảnh bổ sung hồ sơ" disabled={disabled||batchBusy||!savedReady} onChange={e=>{const files=Array.from(e.target.files||[]);e.target.value='';void chooseMany(files,false);}}/>}
    <div className="mg-media-upload-actions"><button className="mg-button" type="button" disabled={disabled||batchBusy||!savedReady} onClick={()=>imagePicker.current?.click()}><ImagePlus size={16}/>{bulkImageLabel}</button> {compact&&<button className="mg-button" type="button" disabled={disabled||batchBusy||!savedReady} onClick={()=>cameraPicker.current?.click()}><Camera size={16}/>Chụp ảnh</button>} {videoCount>0&&<button className="mg-button" type="button" disabled={disabled||batchBusy||!savedReady} onClick={()=>videoPicker.current?.click()}>Chọn video</button>}</div>
    <p role="status">{batchBusy?'Đang xử lý tệp…':`${slots.filter(slot=>!isVideoSlot(slot.key)&&(value[slot.key]||saved.some(p=>p.slot===slot.key))).length} ảnh${videoCount>0?` · ${slots.filter(slot=>isVideoSlot(slot.key)&&(value[slot.key]||saved.some(p=>p.slot===slot.key))).length} / ${videoCount} video`:''}`}</p>
  </div>;
  return <fieldset className="mg-record-photos"><legend>{title}</legend>
    {signedEvidenceOnly&&<p role="status">Bộ hợp đồng: {occupied.filter(slot=>isSignedContractPhoto(slot.key)).length} ảnh. Có thể chọn nhiều ảnh cho bộ hợp đồng 4 tờ và bổ sung sau.</p>}
    {compact&&<div className="mg-media-tabs" role="tablist" aria-label="Cách tải ảnh">{(['quick','detail'] as const).map((tab,index)=><button key={tab} type="button" role="tab" id={`${tabId}-${tab}`} aria-controls={`${tabId}-${tab}-panel`} aria-selected={uploadTab===tab} tabIndex={uploadTab===tab?0:-1} onClick={()=>setUploadTab(tab)} onKeyDown={event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();const next=event.key==='Home'?'quick':event.key==='End'?'detail':index===0?'detail':'quick';
      setUploadTab(next);document.getElementById(`${tabId}-${next}`)?.focus();
    }}>{tab==='quick'?'Tải nhanh / Hàng loạt':'Tải ảnh chi tiết'}</button>)}</div>}
    {compact?<div role="tabpanel" id={`${tabId}-quick-panel`} aria-labelledby={`${tabId}-quick`} hidden={uploadTab!=='quick'} tabIndex={0}>{toolbar}</div>:bulkPosition==='top'&&toolbar}
    {actions}
    {compact&&uploadTab==='quick'&&<p className="mg-media-hint">Chọn nhiều ảnh cùng lúc, không cần phân loại. Có thể lưu thiếu ảnh và bổ sung sau.</p>}
    {error && <p className="mg-field-error" role="alert">{error} <button type="button" className="mg-button" onClick={() => setRetry(current => current + 1)}>Thử lại</button></p>}
    {compact&&occupied.length>0&&<details className="mg-media-gallery" open><summary>Xem {occupied.length} ảnh / video đã chọn và đã lưu</summary><div className="mg-media-thumbnails">{occupied.map((slot,index)=>{
      const photo=saved.find(photo=>photo.slot===slot.key),file=value[slot.key],state=uploadStates[slot.key];
      return <div key={slot.key}><PhotoField slot={{...slot,label:`${isVideoSlot(slot.key)?'Video':'Ảnh'} ${index+1}`}} file={file} disabled={disabled||batchBusy||!savedReady} savedUrl={photo&&recordId?`${photoEndpoint(entity,recordId,slot.key)}?v=${encodeURIComponent(photo.updated_at)}`:undefined}
        onBusyChange={busy=>{if(busy)busySlots.current.add(slot.key);else busySlots.current.delete(slot.key);onBusyChange?.(busySlots.current.size>0);}}
        onSelectMany={entity==='contracts'&&slot.key==='rental-document-1'?chooseSignedPages:undefined} onChange={file=>applySlot(slot.key,file)}/>
        {state?.loading&&file&&<p role="status" className="mg-photo-feedback">{state.message||'Đang tải tệp…'}</p>}
        {state?.error&&file&&<p role="alert" className="mg-field-error">{state.error} <button type="button" className="mg-button" onClick={()=>upload(slot.key,file,true)}>Tải tệp lại</button></p>}
      </div>;
    })}</div></details>}
    {compact&&<div role="tabpanel" id={`${tabId}-detail-panel`} aria-labelledby={`${tabId}-detail`} hidden={uploadTab!=='detail'} tabIndex={0}><p className="mg-media-hint">Chỉ mở mục cần dùng. Các mục ảnh đều tuỳ chọn; ảnh đã chọn được giữ khi đổi tab.</p>
    {compactDocuments.length>0&&<details className="mg-media-documents" open><summary>Ảnh hợp đồng đã ký & bill chuyển khoản</summary><div className="mg-photo-grid">{compactDocuments.map(slot=><PhotoField key={slot.key} slot={slot} file={value[slot.key]} disabled={disabled||batchBusy||!savedReady} savedUrl={saved.some(photo=>photo.slot===slot.key)&&recordId?`${photoEndpoint(entity,recordId,slot.key)}?v=${encodeURIComponent(saved.find(photo=>photo.slot===slot.key)!.updated_at)}`:undefined}
      onBusyChange={busy=>{if(busy)busySlots.current.add(slot.key);else busySlots.current.delete(slot.key);onBusyChange?.(busySlots.current.size>0);}}
      onSelectMany={entity==='contracts'&&slot.key==='rental-document-1'?chooseSignedPages:undefined} onChange={file=>applySlot(slot.key,file)}/>)}</div></details>}
    <details className="mg-media-individual"><summary>Chọn theo vị trí ảnh (tuỳ chọn)</summary><div className="mg-photo-grid">{slots.filter(slot=>!slot.key.includes('-document-')&&!isSignedContractPhoto(slot.key)&&/-(?:[1-6]|video-[1-3])$/.test(slot.key)).map(slot=><PhotoField key={slot.key} slot={slot} file={value[slot.key]} disabled={disabled||batchBusy||!savedReady} savedUrl={saved.some(photo=>photo.slot===slot.key)&&recordId?`${photoEndpoint(entity,recordId,slot.key)}?v=${encodeURIComponent(saved.find(photo=>photo.slot===slot.key)!.updated_at)}`:undefined}
      onBusyChange={busy=>{if(busy)busySlots.current.add(slot.key);else busySlots.current.delete(slot.key);onBusyChange?.(busySlots.current.size>0);}}
      onSelectMany={entity==='contracts'&&slot.key==='rental-document-1'?chooseSignedPages:undefined} onChange={file=>applySlot(slot.key,file)}/>)}</div></details></div>}
    {!compact&&<>
    <div className="mg-photo-grid">{slots.filter(slot=>!bulk||value[slot.key]||saved.some(p=>p.slot===slot.key)||(!slot.key.includes('-document-')&&/-(?:[1-6]|video-1)$/.test(slot.key))||slots.find(s=>isVideoSlot(s.key)===isVideoSlot(slot.key)&&!value[s.key]&&!saved.some(p=>p.slot===s.key))?.key===slot.key).map(slot => {
      const photo = saved.find(photo => photo.slot === slot.key);
      const state = ocr?.states[slot.key], uploadState = uploadStates[slot.key];
      return <div key={slot.key}><PhotoField slot={slot} file={value[slot.key]} disabled={disabled||batchBusy||!savedReady}
        savedUrl={photo && recordId ? `${photoEndpoint(entity, recordId, slot.key)}?v=${encodeURIComponent(photo.updated_at)}` : undefined}
        onBusyChange={busy => { if (busy) busySlots.current.add(slot.key); else busySlots.current.delete(slot.key); onBusyChange?.(busySlots.current.size > 0); }}
        onSelectMany={entity==='contracts'&&slot.key==='rental-document-1'?chooseSignedPages:undefined} onChange={file => applySlot(slot.key, file)} />
        {uploadState && value[slot.key] && <p className={uploadState.error ? 'mg-field-error' : 'mg-photo-feedback'} role={uploadState.error ? 'alert' : 'status'}>{uploadState.loading ? uploadState.message || 'Đang tải ảnh…' : uploadState.error || 'Đã tải lên · bấm Lưu ảnh / video để gắn vào hồ sơ.'}{uploadState.error && <button type="button" className="mg-button" disabled={disabled} onClick={() => upload(slot.key, value[slot.key], true)}>Tải tệp lại</button>}</p>}
        {state && <div className="mg-photo-feedback"><p role={state.phase === 'error' ? 'alert' : 'status'} className={state.phase === 'error' ? 'mg-field-error' : undefined}>{state.message}</p>
          {state.phase === 'reading' ? <button type="button" className="mg-button" disabled={disabled} onClick={() => ocr?.cancel(slot.key)}>Bỏ qua AI</button> : value[slot.key] && <button type="button" className="mg-button" disabled={disabled} onClick={() => ocr?.read(slot.key, value[slot.key])}>Đọc lại ảnh</button>}
        </div>}
      </div>;
    })}</div></>}
    {!compact&&bulkPosition==='bottom'&&toolbar}
  </fieldset>;
}

export function SavedRecordPhotos({ entity, recordId, slots, title,onPendingChange,onSaved,readOnly=false,bulkImageLabel,bulkPosition,compact=false }: { entity: PhotoEntity; recordId: number; slots: PhotoSlot[]; title?: string;onPendingChange?:(pending:boolean)=>void;onSaved?:()=>void;readOnly?:boolean;bulkImageLabel?:string;bulkPosition?:'top'|'bottom';compact?:boolean }) {
  const [photos, setPhotos] = useState<PendingPhotos>({}), [busy, setBusy] = useState(false), [processing, setProcessing] = useState(false);
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [version, setVersion] = useState(0);
  const callback=useRef(onPendingChange);callback.current=onPendingChange;
  useEffect(()=>{callback.current?.(busy||processing||Object.keys(photos).length>0);},[busy,processing,photos]);
  useEffect(()=>()=>callback.current?.(false),[]);
  const pendingCount=Object.keys(photos).length;
  const saveLabel=slots.some(slot=>isVideoSlot(slot.key))?'Lưu ảnh / video':'Lưu ảnh';
  const commit=pendingCount > 0 && <div className="mg-saved-photos-commit">
      <p className="mg-field-error" role="status">Còn {pendingCount} tệp mới chưa lưu — bấm «{saveLabel}» để gắn vào hồ sơ.</p>
      <button type="button" className="mg-button mg-button-primary" disabled={busy || processing} onClick={async () => {
        setBusy(true); setError(''); setMessage('');
        try { await saveRecordPhotos(entity, recordId, photos); setPhotos({}); setVersion(current => current + 1); setMessage('Đã lưu ảnh.'); onSaved?.(); }
        catch (cause) { setError(cause instanceof Error ? cause.message : 'Không lưu được ảnh.'); }
        finally { setBusy(false); }
      }}>{busy ? 'Đang lưu tệp…' : saveLabel}</button>
    </div>;
  return <div className={`mg-saved-photos${compact?' is-compact':''}`}>
    <RecordPhotoFields key={version} entity={entity} recordId={recordId} slots={slots} title={title} value={photos} onChange={value => { setPhotos(value); setMessage(''); }} disabled={busy||readOnly} onBusyChange={setProcessing} bulkImageLabel={bulkImageLabel} bulkPosition={bulkPosition} compact={compact} actions={compact?commit:undefined}/>
    {!compact&&commit}
    {error && <p className="mg-field-error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
  </div>;
}
