'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { Check, LoaderCircle } from 'lucide-react';
import { ManagementRow } from '@/lib/management/types';
import { VEHICLE_STATUSES, VEHICLE_TYPES } from '@/lib/management/config';
import { VehicleEdits, saveVehicleRecord } from '@/lib/management/vehicle-repository';
import { Dialog } from './Dialog';
import { useManagement } from './ManagementProvider';
import { VehicleDocumentFields } from './VehicleDocumentFields';
import { type PendingPhotos, type VehicleDocumentSlot } from '@/lib/management/record-photos';
import { usePhotoOcr } from './usePhotoOcr';
import { mergeOcrVehicle, OCR_VEHICLE_KEYS, type OcrFields, type VehicleRegistrationValues } from '@/lib/management/photo-ocr';

const FIELDS: { key: keyof VehicleEdits; label: string; required?: boolean; type?: 'number'; max?: number }[] = [
  { key: 'name', label: 'Tên / dòng xe', required: true, max: 255 }, { key: 'license', label: 'Biển số', required: true, max: 25 },
  { key: 'brand', label: 'Hãng xe', required: true, max: 255 }, { key: 'color', label: 'Màu sắc', max: 255 },
  { key: 'year', label: 'Năm sản xuất', required: true, type: 'number' }, { key: 'odometer', label: 'Số km', type: 'number' },
  { key: 'chassis', label: 'Số khung', max: 255 }, { key: 'engine', label: 'Số máy', max: 255 },
];

export function VehicleEditDialog({ row, onClose }: { row: ManagementRow | null; onClose: () => void }) {
  const { dataset, selectedStore, ensureData, notify } = useManagement();
  const stores = dataset?.stores || [];
  const value = (key: string) => row?.[key] == null ? '' : String(row[key]);
  const [draft, setDraft] = useState<VehicleEdits>({ name: value('name'), license: value('license'), brand: value('brand') || 'honda', color: value('color'),
    type: value('type') || VEHICLE_TYPES[0].value, year: value('year'), store_id: value('store_id') || (selectedStore !== 'all' ? selectedStore : ''),
    status: value('status') || 'ready', chassis: value('chassis'), engine: value('engine'), odometer: value('odometer'), note: '' });
  const initialDraft = useRef(draft);
  const [photos, setPhotos] = useState<PendingPhotos>({});
  const [removed, setRemoved] = useState<VehicleDocumentSlot[]>([]);
  const dirty = Object.keys(photos).length > 0 || removed.length > 0 || (Object.keys(draft) as (keyof VehicleEdits)[]).some(key => draft[key] !== initialDraft.current[key]);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const continueButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (confirmDiscard) continueButton.current?.focus(); }, [confirmDiscard]);
  const [errors, setErrors] = useState<Partial<Record<keyof VehicleEdits, string>>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const currentDraft=useRef(draft);currentDraft.current=draft;
  const previousAi=useRef<OcrFields>({});
  const [preparingSlots, setPreparingSlots] = useState<Record<string, boolean>>({});
  const preparing = Object.values(preparingSlots).some(Boolean);
  const ocr=usePhotoOcr<VehicleRegistrationValues>({kind:()=>'vehicle_registration',snapshot:()=>Object.fromEntries(OCR_VEHICLE_KEYS.map(key=>[key,currentDraft.current[key]])) as VehicleRegistrationValues,apply:(_slot,result,before)=>{
    if(busy.current)return 'Đã bỏ qua kết quả vì xe đang được lưu.';
    const merged=mergeOcrVehicle(currentDraft.current,result.fields,before,previousAi.current);
    const keys=Object.keys(merged.applied) as typeof OCR_VEHICLE_KEYS[number][];
    if(keys.length){
      const next={...currentDraft.current,...merged.values};currentDraft.current=next;setDraft(next);
      previousAi.current={...previousAi.current,...merged.applied};setConfirmDiscard(false);
      setErrors(current=>({...current,...Object.fromEntries(keys.map(key=>[key,'']))}));
    }
    const labels={license:'biển số',chassis:'số khung',engine:'số máy',color:'màu sắc',year:'năm sản xuất'};
    return `${keys.length?`Đã điền ${keys.map(key=>labels[key]).join(', ')}.`:'Giữ nguyên thông tin đã nhập tay.'}${OCR_VEHICLE_KEYS.some(key=>!merged.values[key]?.trim())?' Bổ sung trường còn thiếu hoặc chụp mặt còn lại.':''}`;
  }});
  const form = useRef<HTMLFormElement>(null);
  const rented = (() => { try { return JSON.parse(String(row?.rentals_json || '[]')).length > 0; } catch { return row?.status === 'using'; } })();
  const statusOptions = VEHICLE_STATUSES;
  const storeMissing = draft.store_id && !stores.some(store => String(store.id) === draft.store_id);
  function requestClose() {
    if (busy.current) return;
    if (confirmDiscard) { setConfirmDiscard(false); return; }
    if (dirty) setConfirmDiscard(true);
    else onClose();
  }
  function change(key: keyof VehicleEdits, next: string) { setConfirmDiscard(false); const updated={...currentDraft.current,[key]:next};currentDraft.current=updated;setDraft(updated); setErrors(current => ({ ...current, [key]: '' })); }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy.current||preparing) return;
    const next: Partial<Record<keyof VehicleEdits, string>> = {};
    for (const field of FIELDS) if (field.required && !draft[field.key].trim()) next[field.key] = `Vui lòng nhập ${field.label.toLowerCase()}.`;
    const year = Number(draft.year);
    if (draft.year.trim() && (!Number.isInteger(year) || year < 1980 || year > new Date().getFullYear() + 1)) next.year = 'Năm sản xuất không hợp lệ.';
    if (draft.odometer.trim() && (!Number.isInteger(Number(draft.odometer)) || Number(draft.odometer) < 0)) next.odometer = 'Nhập một số nguyên không âm.';
    if (!draft.store_id) next.store_id = 'Chọn cơ sở cho xe.';
    const license = draft.license.trim().toUpperCase();
    if (license && dataset?.vehicles.some(vehicle => vehicle.id !== row?.id && String(vehicle.license).trim().toUpperCase() === license)) next.license = 'Biển số này đã có trong danh sách.';
    setErrors(next); setError('');
    if (Object.keys(next).length) { requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()); return; }
    for (const slot of ['registration-front','registration-back']) ocr.cancel(slot);busy.current = true; setSaving(true);
    try {
      await saveVehicleRecord(row?.id ?? null, draft, value('vehicle_revision') || undefined, photos, removed);
      await ensureData(['vehicles'], true).catch(() => {});
      notify(row ? `Đã cập nhật xe ${license}.` : `Đã thêm xe ${license}.`);
      onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không lưu được xe.'); }
    finally { busy.current = false; setSaving(false); }
  }
  const describedBy = (key: string) => errors[key as keyof VehicleEdits] ? `vehicle-${key}-error` : undefined;
  const fieldError = (key: keyof VehicleEdits) => errors[key] && <p id={`vehicle-${key}-error`} className="mg-field-error">{errors[key]}</p>;
  return <Dialog title={row ? 'Chỉnh sửa xe' : 'Thêm xe'} subtitle={row ? `${row.code} · ${value('license')}` : 'Lưu trực tiếp vào Supabase'} dismissOnBackdrop={false} onClose={requestClose}>
    <form ref={form} noValidate onSubmit={submit}><div className="mg-dialog-body">
      <VehicleDocumentFields id={row?.id} photos={photos} removed={removed} disabled={saving} ocr={ocr}
        onChange={(next, deleted) => { setPhotos(next); setRemoved(deleted); setConfirmDiscard(false); }}
        onBusyChange={(key, value) => setPreparingSlots(current => current[key] === value ? current : { ...current, [key]: value })}/>
      <div className="mg-form-grid">
      {FIELDS.slice(0, 4).map(field => <div key={field.key} className="mg-field"><label htmlFor={`vehicle-${field.key}`}>{field.label}{field.required && <span aria-hidden="true"> *</span>}</label>
        <input id={`vehicle-${field.key}`} value={draft[field.key]} maxLength={field.max} disabled={saving} aria-invalid={Boolean(errors[field.key])} aria-describedby={describedBy(field.key)} onChange={event => change(field.key, event.target.value)} />{fieldError(field.key)}</div>)}
      <div className="mg-field"><label htmlFor="vehicle-type">Loại xe<span aria-hidden="true"> *</span></label><select id="vehicle-type" value={draft.type} disabled={saving} onChange={event => change('type', event.target.value)}>
        {VEHICLE_TYPES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
      <div className="mg-field"><label htmlFor="vehicle-store_id">Cơ sở hiện tại<span aria-hidden="true"> *</span></label><select id="vehicle-store_id" value={draft.store_id} disabled={saving || rented} aria-invalid={Boolean(errors.store_id)} aria-describedby={describedBy('store_id')} onChange={event => change('store_id', event.target.value)}>
        <option value="">Chọn cơ sở</option>{storeMissing && <option value={draft.store_id}>{value('store_name') || `Cơ sở #${draft.store_id}`}</option>}
        {stores.map(store => <option key={store.id} value={String(store.id)}>{store.name}</option>)}</select>{fieldError('store_id')}</div>
      <div className="mg-field"><label htmlFor="vehicle-status">Trạng thái<span aria-hidden="true"> *</span></label><select id="vehicle-status" value={draft.status} disabled={saving || rented} aria-describedby={rented ? 'vehicle-status-hint' : undefined} onChange={event => change('status', event.target.value)}>
        {statusOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
        {rented ? <small id="vehicle-status-hint">Xe đang thuộc hợp đồng mở. Trả xe trên hợp đồng để đổi trạng thái.</small> : <small>Đã giao xe nhưng chưa nhập hợp đồng: chọn Đang thuê để khớp kho. Sau đó nhập hợp đồng trực tiếp, giữ nguyên cơ sở xe.</small>}</div>
      {FIELDS.slice(4).map(field => <div key={field.key} className="mg-field"><label htmlFor={`vehicle-${field.key}`}>{field.label}{field.required && <span aria-hidden="true"> *</span>}</label>
        <input id={`vehicle-${field.key}`} type={field.type || 'text'} min={field.type ? 0 : undefined} step={field.type ? 1 : undefined} value={draft[field.key]} maxLength={field.max} disabled={saving} aria-invalid={Boolean(errors[field.key])} aria-describedby={describedBy(field.key)} onChange={event => change(field.key, event.target.value)} />{fieldError(field.key)}</div>)}
      <div className="mg-field mg-field-wide"><label htmlFor="vehicle-note">Ghi chú</label>
        <textarea id="vehicle-note" value={draft.note} maxLength={500} disabled={saving} placeholder="VD: đưa xe đi sửa phanh, chuyển xe sang cơ sở khác…" onChange={event => change('note', event.target.value)} />
        <small>Mọi trường thay đổi được ghi giá trị cũ → mới trong tab Lịch sử, cùng ngày giờ và người thao tác.</small></div>
    </div>{error && <p className="mg-error-message" role="alert">{error}</p>}</div>
      <div className="mg-dialog-footer">{confirmDiscard ? <><span className="mg-form-note" role="alert">Thông tin xe chưa được lưu. Bỏ thay đổi?</span>
        <button ref={continueButton} type="button" className="mg-button" onClick={() => setConfirmDiscard(false)}>Tiếp tục nhập</button>
        <button type="button" className="mg-button mg-button-danger" onClick={onClose}>Bỏ thay đổi</button></> : <><span className="mg-form-note">* Thông tin bắt buộc</span><button type="button" className="mg-button" disabled={saving} onClick={requestClose}>Hủy</button>
        <button type="submit" className="mg-button mg-button-primary" disabled={saving||preparing}>{saving ? <LoaderCircle size={16} className="mg-spin" /> : <Check size={16} />}{saving ? 'Đang lưu…' : row ? 'Lưu xe' : 'Thêm xe'}</button></>}</div>
    </form>
  </Dialog>;
}
