'use client';

import { FormEvent, Fragment, useRef, useState } from 'react';
import { Check, LoaderCircle } from 'lucide-react';
import { Dialog } from '@/components/management/Dialog';
import { useManagement } from '@/components/management/ManagementProvider';
import { ContractRelative, CustomerDetails, customerDetails, pairRelatives, formatRelatives, validateCustomer, validateOperationalCustomer } from '@/lib/management/contract-document';
import { parseCustomerRelatives } from '@/lib/management/customer-relatives';
import { CustomerRelativesFields } from './CustomerRelativesFields';
import { ManagementRow } from '@/lib/management/types';
import { CUSTOMER_STATUSES } from '@/lib/management/config';
import { IssueDateInput } from '@/components/management/IssueDateInput';
import { RecordPhotoFields } from '@/components/management/RecordPhotoFields';
import { CUSTOMER_PHOTO_SLOTS, PendingPhotos, saveRecordPhotos } from '@/lib/management/record-photos';

export function CustomerCreateDialog({ idCard, storeId, allowIncomplete = false, onCreated, onClose }: { idCard: string; storeId?: string; allowIncomplete?: boolean; onCreated: (row: ManagementRow) => void; onClose: () => void }) {
  const { source, dataset, selectedStore, createCustomer } = useManagement();
  const [branch, setBranch] = useState(storeId || (selectedStore !== 'all' ? selectedStore : String(dataset?.stores[0]?.id || '')));
  const [status, setStatus] = useState('active');
  const incomplete = allowIncomplete && status === 'draft';
  const [customer, setCustomer] = useState<CustomerDetails>(() => ({ ...customerDetails(), id_card: idCard }));
  const [relatives, setRelatives] = useState<[ContractRelative, ContractRelative]>(() => pairRelatives(null));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [photos, setPhotos] = useState<PendingPhotos>({});
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [savedCustomer, setSavedCustomer] = useState<ManagementRow | null>(null);
  const busy = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const fields: { key: keyof CustomerDetails; label: string; type?: string; required?: boolean; wide?: boolean; hint?: string }[] = [
    { key: 'id_card', label: 'CCCD / CMND', required: true }, { key: 'name', label: 'Họ và tên', required: true },
    { key: 'phone', label: 'Số điện thoại', type: 'tel', required: true },
    { key: 'id_card_issued_on', label: 'Ngày cấp CCCD / CMND', type: 'date' },
    { key: 'id_card_issued_by', label: 'Nơi cấp CCCD / CMND' },
    { key: 'address', label: 'Nơi ở hiện tại', required: true, wide: true, hint: 'Ghi số nhà, phường/xã, quận/huyện.' },
    { key: 'driver_license_number', label: 'Số giấy phép lái xe' },
    { key: 'driver_license_issued_on', label: 'Ngày cấp GPLX', type: 'date' },
    { key: 'warning_note', label: 'Ghi chú / cảnh báo', wide: true },
  ];
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy.current || processingPhoto) return;
    const next = incomplete ? validateOperationalCustomer(customer,source) : validateCustomer(customer, source);
    if (!dataset?.stores.some(store => String(store.id) === branch)) next.store_id = 'Chọn cơ sở cho khách hàng.';
    if (status === 'warning' && !customer.warning_note.trim()) next.warning_note = 'Nhập ghi chú cho hồ sơ cần lưu ý.';
    setErrors(next); setError('');
    if (Object.keys(next).length) { requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()); return; }
    try { parseCustomerRelatives(relatives); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Thông tin người thân không hợp lệ.'); return; }
    busy.current = true; setSaving(true);
    try {
      const assignment = { status, store_id: Number(branch), ...(incomplete ? {allow_incomplete:true} : {}) };
      const created = savedCustomer || await createCustomer({ ...customer, relatives_text: formatRelatives(relatives), relatives_json: JSON.stringify(parseCustomerRelatives(relatives)) }, assignment);
      setSavedCustomer(created);
      await saveRecordPhotos('customers', created.id, photos);
      onCreated(created);
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tạo được khách hàng. Vui lòng thử lại.'); }
    finally { busy.current = false; setSaving(false); }
  }
  const fieldsDisabled = saving || Boolean(savedCustomer);
  return <Dialog title="Thêm khách hàng tại chỗ" onClose={() => { if (!busy.current) onClose(); }}>
    <form ref={form} noValidate onSubmit={submit}>
      <div className="mg-dialog-body">{incomplete && <p className="mg-composer-hint">Hồ sơ tạm: cần tên và số điện thoại để nhận diện khách. CCCD, địa chỉ và người thân có thể bổ sung sau.</p>}<div className="mg-form-grid">{fields.map(field => <Fragment key={field.key}><div className={`mg-field ${field.wide ? 'mg-field-wide' : ''}`}>
        <label htmlFor={`new-customer-${field.key}`}>{field.label}{field.required && !(incomplete && ['id_card','address'].includes(field.key)) && <span aria-hidden="true"> *</span>}</label>
        {field.type === 'date' ? <IssueDateInput id={`new-customer-${field.key}`} name={field.key} value={customer[field.key] || ''} disabled={fieldsDisabled}
          aria-invalid={Boolean(errors[field.key])} aria-describedby={errors[field.key] ? `new-customer-${field.key}-error` : undefined}
          onValueChange={value => { setCustomer(current => ({ ...current, [field.key]: value })); setErrors(current => ({ ...current, [field.key]: '' })); }} /> : <input id={`new-customer-${field.key}`} name={field.key} type={field.type || 'text'} value={customer[field.key]} disabled={fieldsDisabled} required={field.required && !(incomplete && ['id_card','address'].includes(field.key))}
          aria-invalid={Boolean(errors[field.key])} aria-describedby={errors[field.key] ? `new-customer-${field.key}-error` : undefined}
          onChange={event => { setCustomer(current => ({ ...current, [field.key]: event.target.value })); setErrors(current => ({ ...current, [field.key]: '' })); }} />}
        {field.hint && <small>{field.hint}</small>}
        {errors[field.key] && <p className="mg-field-error" id={`new-customer-${field.key}-error`}>{errors[field.key]}</p>}
      </div>{field.key === 'id_card' && <div className="mg-field-wide"><RecordPhotoFields entity="customers" slots={CUSTOMER_PHOTO_SLOTS} title="Chụp CCCD" value={photos} onChange={setPhotos} disabled={saving} onBusyChange={setProcessingPhoto} /></div>}</Fragment>)}{<>
        <div className="mg-field"><label htmlFor="new-customer-store">Cơ sở nguồn khách *</label><select id="new-customer-store" value={branch} disabled={fieldsDisabled} aria-invalid={Boolean(errors.store_id)} aria-describedby={errors.store_id ? 'new-customer-store-error' : undefined} onChange={event => { setBranch(event.target.value); setErrors(current => ({ ...current, store_id: '' })); }}>
          <option value="">Chọn cơ sở</option>{dataset?.stores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}</select>{errors.store_id && <p id="new-customer-store-error" className="mg-field-error">{errors.store_id}</p>}</div>
        <div className="mg-field"><label htmlFor="new-customer-status">Trạng thái hồ sơ *</label><select id="new-customer-status" value={status} disabled={fieldsDisabled} onChange={event => setStatus(event.target.value)}>{CUSTOMER_STATUSES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
      </>}<CustomerRelativesFields prefix="new-customer" relatives={relatives} disabled={fieldsDisabled} onChange={setRelatives} /></div>
        {savedCustomer && <p role="status">Đã lưu thông tin khách hàng. Bấm lưu lại để hoàn tất tải ảnh; không tạo thêm hồ sơ.</p>}
        {error && <p className="mg-error-message" role="alert">{error}</p>}</div>
      <div className="mg-dialog-footer"><button type="button" className="mg-button" disabled={saving} onClick={onClose}>Hủy</button>
        <button type="submit" className="mg-button mg-button-primary" disabled={saving || processingPhoto}>{saving ? <LoaderCircle size={16} className="mg-spin" /> : <Check size={16} />}{saving ? 'Đang lưu…' : 'Lưu khách hàng'}</button></div>
    </form>
  </Dialog>;
}
