'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Camera, ImagePlus, LoaderCircle, X } from 'lucide-react';
import { PendingPhotos, PhotoEntity, PhotoSlot, SavedPhoto, photoEndpoint, prepareRecordPhoto, saveRecordPhotos } from '@/lib/management/record-photos';

function PhotoField({ slot, file, savedUrl, disabled, onChange, onBusyChange }: { slot: PhotoSlot; file?: File; savedUrl?: string; disabled: boolean; onChange: (file?: File) => void; onBusyChange: (busy: boolean) => void }) {
  const camera = useRef<HTMLInputElement>(null), library = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const generation = useRef(0);
  const labelId = useId();
  const latestBusyChange = useRef(onBusyChange); latestBusyChange.current = onBusyChange;
  useEffect(() => () => { generation.current++; latestBusyChange.current(false); }, []);
  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  async function select(file?: File) {
    if (!file) return;
    const current = ++generation.current;
    setBusy(true); onBusyChange(true); setError('');
    try { const prepared = await prepareRecordPhoto(file); if (current === generation.current) onChange(prepared); }
    catch (cause) { if (current === generation.current) setError(cause instanceof Error ? cause.message : 'Không xử lý được ảnh.'); }
    finally { if (current === generation.current) { setBusy(false); latestBusyChange.current(false); } }
  }
  return <div className="mg-photo-slot" role="group" aria-labelledby={labelId}>
    <strong id={labelId}>{slot.label}</strong>
    {(preview || savedUrl) && <a href={preview || savedUrl} target="_blank" rel="noopener noreferrer" aria-label={`Xem ảnh ${slot.label}`}>
      {/* Authenticated image endpoints and local camera previews cannot use the Next image optimizer. */}
      <img src={preview || savedUrl} alt={slot.label} />
    </a>}
    <input hidden ref={camera} type="file" accept="image/*" capture="environment" aria-label={`Chụp ${slot.label}`} disabled={disabled || busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void select(file); }} />
    <input hidden ref={library} type="file" accept="image/*" aria-label={`Chọn ảnh ${slot.label}`} disabled={disabled || busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void select(file); }} />
    <div className="mg-photo-actions"><button type="button" className="mg-button" disabled={disabled || busy} onClick={() => camera.current?.click()}>{busy ? <LoaderCircle size={16} className="mg-spin" /> : <Camera size={16} />}Chụp ảnh</button>
      <button type="button" className="mg-button" disabled={disabled || busy} onClick={() => library.current?.click()}><ImagePlus size={16} />Chọn ảnh</button>
      {file && <button type="button" className="mg-icon-button" disabled={disabled || busy} aria-label={`Bỏ ảnh mới ${slot.label}`} onClick={() => onChange()}><X size={16} /></button>}</div>
    {busy && <small role="status">Đang xử lý ảnh…</small>}{file && <small>Ảnh mới · lưu cùng hồ sơ</small>}
    {error && <p className="mg-field-error" role="alert">{error}</p>}
  </div>;
}

export function RecordPhotoFields({ entity, recordId, slots, value, onChange, disabled = false, onBusyChange, title = 'Ảnh hồ sơ' }: {
  entity: PhotoEntity; recordId?: number; slots: PhotoSlot[]; value: PendingPhotos; onChange: (value: PendingPhotos) => void;
  disabled?: boolean; onBusyChange?: (busy: boolean) => void; title?: string;
}) {
  const [saved, setSaved] = useState<SavedPhoto[]>([]), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const busySlots = useRef(new Set<string>());
  const latestValue = useRef(value); latestValue.current = value;
  useEffect(() => {
    setSaved([]); setError('');
    if (!recordId) return;
    const controller = new AbortController();
    fetch(photoEndpoint(entity, recordId), { signal: controller.signal, cache: 'no-store' }).then(async response => {
      const result = await response.json();
      if (!response.ok || result.status !== 'success') throw new Error(result.message || 'Không tải được ảnh đã lưu.');
      if (!controller.signal.aborted) setSaved(result.data);
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Không tải được ảnh đã lưu.'); });
    return () => controller.abort();
  }, [entity, recordId, retry]);
  return <fieldset className="mg-record-photos"><legend>{title}</legend>
    {error && <p className="mg-field-error" role="alert">{error} <button type="button" className="mg-button" onClick={() => setRetry(current => current + 1)}>Thử lại</button></p>}
    <div className="mg-photo-grid">{slots.map(slot => {
      const photo = saved.find(photo => photo.slot === slot.key);
      return <PhotoField key={slot.key} slot={slot} file={value[slot.key]} disabled={disabled}
        savedUrl={photo && recordId ? `${photoEndpoint(entity, recordId, slot.key)}?v=${encodeURIComponent(photo.updated_at)}` : undefined}
        onBusyChange={busy => { if (busy) busySlots.current.add(slot.key); else busySlots.current.delete(slot.key); onBusyChange?.(busySlots.current.size > 0); }}
        onChange={file => { const next = { ...latestValue.current }; if (file) next[slot.key] = file; else delete next[slot.key]; latestValue.current = next; onChange(next); }} />;
    })}</div>
  </fieldset>;
}

export function SavedRecordPhotos({ entity, recordId, slots, title }: { entity: PhotoEntity; recordId: number; slots: PhotoSlot[]; title?: string }) {
  const [photos, setPhotos] = useState<PendingPhotos>({}), [busy, setBusy] = useState(false), [processing, setProcessing] = useState(false);
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [version, setVersion] = useState(0);
  return <div className="mg-saved-photos">
    <RecordPhotoFields key={version} entity={entity} recordId={recordId} slots={slots} title={title} value={photos} onChange={value => { setPhotos(value); setMessage(''); }} disabled={busy} onBusyChange={setProcessing} />
    {Object.keys(photos).length > 0 && <button type="button" className="mg-button mg-button-primary" disabled={busy || processing} onClick={async () => {
      setBusy(true); setError('');
      try { await saveRecordPhotos(entity, recordId, photos); setPhotos({}); setVersion(current => current + 1); setMessage('Đã lưu ảnh.'); }
      catch (cause) { setError(cause instanceof Error ? cause.message : 'Không lưu được ảnh.'); }
      finally { setBusy(false); }
    }}>{busy ? 'Đang lưu ảnh…' : 'Lưu ảnh'}</button>}
    {error && <p className="mg-field-error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
  </div>;
}
