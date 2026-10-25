'use client';

import { useEffect, useRef, useState } from 'react';
import { VEHICLE_DOCUMENT_SLOTS, photoEndpoint,prepareRecordPhoto,isVehicleDocumentSlot, type PendingPhotos, type SavedPhoto, type VehicleDocumentSlot } from '@/lib/management/record-photos';
import { expandPhotoGroups,nextPhotoInGroup } from '@/lib/management/photo-slot-groups';
import { PhotoField } from './RecordPhotoFields';
import type { PhotoOcrController } from './usePhotoOcr';

export function VehicleDocumentFields({ id, photos, removed, onChange, onBusyChange, disabled, ocr }: {
  id?: number; photos: PendingPhotos; removed: VehicleDocumentSlot[];
  onChange: (photos: PendingPhotos, removed: VehicleDocumentSlot[]) => void;
  onBusyChange: (key: string, value: boolean) => void; disabled: boolean; ocr: PhotoOcrController;
}) {
  const [saved, setSaved] = useState<SavedPhoto[]>([]), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(Boolean(id));
  const [preparing,setPreparing]=useState(false);
  const callback = useRef(onBusyChange); callback.current = onBusyChange;
  const currentFiles = useRef({ photos, removed, onChange }); currentFiles.current = { photos, removed, onChange };
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController(); setLoading(true); setError(''); callback.current('saved', true);
    fetch(photoEndpoint('vehicles', id), { credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const body = await response.json();
        if (!response.ok || body.status !== 'success' || !Array.isArray(body.data)) throw Error(body.message || 'Không tải được giấy tờ xe.');
        if (!controller.signal.aborted) { setSaved(body.data); callback.current('saved', false); }
      }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Không tải được giấy tờ xe.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, retry]);
  function change(slot: VehicleDocumentSlot, file?: File) {
    const current = currentFiles.current;
    const next = { ...current.photos }; delete next[slot];
    let deleted = current.removed.filter(key => key !== slot);
    if (file) next[slot] = file;
    else if (!current.photos[slot] && saved.some(photo => photo.slot === slot)) deleted = [...deleted, slot];
    currentFiles.current = { ...current, photos: next, removed: deleted };
    current.onChange(next, deleted);
    if (slot.startsWith('registration-')) ocr.read(slot, file);
  }
  async function chooseMany(slot:string,files:File[]){
    if(disabled||loading||preparing||error||!files.length)return;
    setPreparing(true);onBusyChange('batch',true);setError('');
    try{for(const source of files){
      const file=await prepareRecordPhoto(source),current=currentFiles.current;
      const key=nextPhotoInGroup(slot,[...saved.filter(photo=>!current.removed.includes(photo.slot as VehicleDocumentSlot)).map(photo=>photo.slot),...Object.keys(current.photos)]);
      if(!isVehicleDocumentSlot(key))throw Error('Loại giấy tờ xe không hợp lệ.');
      change(key,file);
    }}catch(cause){setError(cause instanceof Error?cause.message:'Không xử lý được ảnh.');}
    finally{setPreparing(false);onBusyChange('batch',false);}
  }
  return <section className="mg-vehicle-registration" aria-label="Đọc đăng ký xe" aria-busy={loading || ocr.pending}>
    <h3>Đăng ký xe & giấy mua bán</h3>
    <p className="mg-photo-feedback">Chụp đăng ký xe để AI điền biển số, số khung, số máy, màu sắc và năm sản xuất. Giữ thông tin nhập tay; đối chiếu ảnh trước khi lưu.</p>
    {loading && <p role="status">Đang tải giấy tờ đã lưu…</p>}
    {error && <p className="mg-field-error" role="alert">{error} <button type="button" className="mg-button" onClick={() => setRetry(value => value + 1)}>Thử tải giấy tờ lại</button></p>}
    <div className="mg-photo-grid">{expandPhotoGroups(VEHICLE_DOCUMENT_SLOTS,[...saved.map(photo=>photo.slot),...Object.keys(photos)]).map(slot => {
      if(!isVehicleDocumentSlot(slot.key))return null;
      const key=slot.key;
      const photo = saved.find(item => item.slot === slot.key), deleted = removed.includes(slot.key), state = ocr.states[slot.key];
      return <div key={slot.key}><PhotoField slot={slot} file={photos[slot.key]}
        savedUrl={photo && id && !deleted ? `${photoEndpoint('vehicles', id, slot.key)}?v=${encodeURIComponent(photo.updated_at)}` : undefined}
        disabled={disabled || loading || preparing || Boolean(error)} onBusyChange={value => { onBusyChange(slot.key, value); if (value) ocr.cancel(slot.key); }}
        fileHint="Ảnh sẽ được lưu cùng thông tin xe khi bấm Lưu xe / Thêm xe."
        onSelectMany={files=>void chooseMany(key,files)} onChange={file => change(key, file)}/>
        {deleted && <p className="mg-photo-feedback">Ảnh sẽ được bỏ khi lưu xe. <button type="button" className="mg-button" disabled={disabled} onClick={() => onChange(photos, removed.filter(key => key !== slot.key))}>Giữ ảnh đã lưu</button></p>}
        {state && <div className="mg-photo-feedback"><p role={state.phase === 'error' ? 'alert' : 'status'} className={state.phase === 'error' ? 'mg-field-error' : undefined}>{state.message}</p>
          {state.phase === 'reading' ? <button type="button" className="mg-button" disabled={disabled} onClick={() => ocr.cancel(slot.key)}>Bỏ qua AI</button>
            : photos[slot.key] && <button type="button" className="mg-button" disabled={disabled} onClick={() => ocr.read(slot.key, photos[slot.key])}>Đọc lại ảnh</button>}
        </div>}
      </div>;
    })}</div>
  </section>;
}
