'use client';

import { FormEvent, Fragment, useRef, useState } from 'react';
import { Check, LoaderCircle } from 'lucide-react';
import { CustomerInternationalFields } from './CustomerInternationalFields';
import { Dialog } from '@/components/management/Dialog';
import { useManagement } from '@/components/management/ManagementProvider';
import { ContractRelative, CustomerDetails, customerDetails, pairRelatives, formatRelatives, validateCustomer, validateDepositCustomer } from '@/lib/management/contract-document';
import { parseCustomerRelatives } from '@/lib/management/customer-relatives';
import { CustomerRelativesFields } from './CustomerRelativesFields';
import { VietnamDateField } from './VietnamDateField';
import { ManagementRow } from '@/lib/management/types';
import { CUSTOMER_STATUSES } from '@/lib/management/config';
import { RecordPhotoFields } from '@/components/management/RecordPhotoFields';
import { CUSTOMER_PHOTO_SLOTS, PendingPhotos, saveRecordPhotos } from '@/lib/management/record-photos';
import { usePhotoOcr } from '@/components/management/usePhotoOcr';
import { mergeOcrCustomer, type OcrFields } from '@/lib/management/photo-ocr';
import { CustomerDocumentBatch } from '@/components/management/CustomerDocumentBatch';

export function CustomerCreateDialog({ idCard, storeId, foreign=false, allowIncomplete = false, startDraft = false, onCreated, onClose }: { idCard: string; storeId?: string; foreign?:boolean; allowIncomplete?: boolean; startDraft?: boolean; onCreated: (row: ManagementRow) => void; onClose: () => void }) {
  const { source, dataset, selectedStore, createCustomer } = useManagement();
  const [branch, setBranch] = useState(storeId || (selectedStore !== 'all' ? selectedStore : String(dataset?.stores[0]?.id || '')));
  const [status, setStatus] = useState(startDraft ? 'draft' : 'active');
  const incomplete = allowIncomplete && status === 'draft';
  const [customer, setCustomer] = useState<CustomerDetails>(() => ({ ...customerDetails(), customer_type:foreign?'foreign':'vietnam', id_card: idCard }));
  const [relatives, setRelatives] = useState<[ContractRelative, ContractRelative]>(() => pairRelatives(null));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [photos, setPhotos] = useState<PendingPhotos>({});
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const photoJobs=useRef(new Set<string>());
  const photoBusy=(slot:string,busy:boolean)=>{if(busy)photoJobs.current.add(slot);else photoJobs.current.delete(slot);setProcessingPhoto(photoJobs.current.size>0);};
  const [savedCustomer, setSavedCustomer] = useState<ManagementRow | null>(null);
  const customerRef = useRef(customer); customerRef.current = customer;
  const previousAi = useRef<OcrFields>({});
  const customerOcr = usePhotoOcr({
    kind: slot => slot==='driver_license'?'driver_license':customerRef.current.customer_type==='foreign'?'passport':slot === 'id_front' ? 'customer_documents' : 'cccd_back',
    snapshot: () => ({ ...customerRef.current }),
    apply: (_slot, result, before) => {
      const merged = mergeOcrCustomer(customerRef.current, result.fields, before, previousAi.current);
      previousAi.current = { ...previousAi.current, ...merged.applied };
      customerRef.current = merged.customer; setCustomer(merged.customer);
      setErrors(current => Object.fromEntries(Object.entries(current).filter(([key]) => !Object.hasOwn(merged.applied, key))));
      return Object.keys(merged.applied).length ? 'Đã điền thông tin từ giấy tờ. Kiểm tra lại trước khi lưu.' : 'Đã đọc ảnh; giữ nguyên các thông tin anh/chị đã nhập.';
    },
  });
  const busy = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const fields: { key: keyof CustomerDetails; label: string; type?: string; required?: boolean; wide?: boolean; hint?: string }[] = [
    { key: 'id_card', label: 'CCCD / CMND', required: true }, { key: 'name', label: 'Họ và tên', required: true },
    { key: 'phone', label: 'Số điện thoại', type: 'tel', required: true },
    { key: 'id_card_issued_on', label: 'Ngày cấp CCCD / CMND', type: 'date' },
    { key: 'id_card_issued_by', label: 'Nơi cấp CCCD / CMND' },
    { key: 'address', label: 'Nơi ở hiện tại', required: true, wide: true, hint: 'Nhập nơi khách đang ở: số nhà, phường/xã, quận/huyện.' },
    { key: 'driver_license_number', label: 'Số giấy phép lái xe' },
    { key: 'driver_license_issued_on', label: 'Ngày cấp GPLX', type: 'date' },
    { key: 'warning_note', label: 'Ghi chú / cảnh báo', wide: true },
  ];
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy.current || processingPhoto || customerOcr.pending) return;
    const next = incomplete ? validateDepositCustomer(customer,source) : validateCustomer(customer, source);
    if (!dataset?.stores.some(store => String(store.id) === branch)) next.store_id = 'Chọn cơ sở cho khách hàng.';
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
      <div className="mg-dialog-body">{incomplete && <p className="mg-composer-hint">Hồ sơ tạm cho khách cọc, chưa thuê xe: chỉ cần họ tên. CCCD, số điện thoại, địa chỉ và người thân bổ sung khi giao xe và lập hợp đồng.</p>}<div className="mg-form-grid"><CustomerInternationalFields prefix="new-customer" value={customer} onChange={next=>{setCustomer(next);setErrors({});}} disabled={fieldsDisabled} errors={errors}/>{fields.map(field => {
        const fieldId = `new-customer-${field.key}`;
        const setValue = (next: string) => { setCustomer(current => ({ ...current, [field.key]: next })); setErrors(current => ({ ...current, [field.key]: '' })); };
        const foreign=customer.customer_type==='foreign';
        const label=foreign?field.key==='id_card'?'Hộ chiếu / Giấy tờ quốc tế':field.key==='phone'?'Số điện thoại quốc tế (nếu có)':field.label.replace('CCCD / CMND','giấy tờ'):field.label;
        const required = field.required && !(foreign&&['phone','address'].includes(field.key)) && !(incomplete && ['id_card', 'address', 'phone'].includes(field.key));
        return <Fragment key={field.key}><div className={`mg-field ${field.wide ? 'mg-field-wide' : ''}`}>
        <label htmlFor={fieldId}>{label}{required && <span aria-hidden="true"> *</span>}</label>
        {field.type === 'date'
          ? <VietnamDateField id={fieldId} label={field.label} value={customer[field.key] || ''} disabled={fieldsDisabled} invalid={Boolean(errors[field.key])}
              describedBy={errors[field.key] ? `${fieldId}-error` : undefined} onChange={setValue} />
          : <input id={fieldId} name={field.key} type={field.type || 'text'} value={customer[field.key]} disabled={fieldsDisabled} required={required}
              aria-invalid={Boolean(errors[field.key])} aria-describedby={errors[field.key] ? `${fieldId}-error` : undefined}
              onChange={event => setValue(event.target.value)} />}
        {field.hint && <small>{field.hint}</small>}
        {errors[field.key] && <p className="mg-field-error" id={`${fieldId}-error`}>{errors[field.key]}</p>}
      </div>{field.key === 'id_card' && <div className="mg-field-wide"><CustomerDocumentBatch ocr={customerOcr} value={photos} onChange={setPhotos} onBusyChange={busy=>photoBusy('batch',busy)} disabled={fieldsDisabled}/><RecordPhotoFields entity="customers" slots={foreign?[{key:'id_front',label:'Trang hộ chiếu / giấy tờ'},{key:'id_back',label:'Trang bổ sung (nếu có)'}]:CUSTOMER_PHOTO_SLOTS} title={foreign?'Chụp hộ chiếu · Tự điền bằng AI':'Chụp CCCD · Tự điền bằng AI'} value={photos} onChange={setPhotos} disabled={saving} onBusyChange={busy=>photoBusy('identity',busy)} ocr={fieldsDisabled ? undefined : customerOcr} /></div>}{field.key==='driver_license_number'&&<div className="mg-field-wide"><RecordPhotoFields entity="customers" slots={[{key:'driver_license',label:'Giấy phép lái xe'}]} title="Chụp GPLX · Tự điền bằng AI" value={photos} onChange={setPhotos} disabled={saving} onBusyChange={busy=>photoBusy('license',busy)} ocr={fieldsDisabled?undefined:customerOcr}/></div>}</Fragment>;
      })}{<>
        <div className="mg-field"><label htmlFor="new-customer-store">Cơ sở nguồn khách *</label><select id="new-customer-store" value={branch} disabled={fieldsDisabled} aria-invalid={Boolean(errors.store_id)} aria-describedby={errors.store_id ? 'new-customer-store-error' : undefined} onChange={event => { setBranch(event.target.value); setErrors(current => ({ ...current, store_id: '' })); }}>
          <option value="">Chọn cơ sở</option>{dataset?.stores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}</select>{errors.store_id && <p id="new-customer-store-error" className="mg-field-error">{errors.store_id}</p>}</div>
        <div className="mg-field"><label htmlFor="new-customer-status">Trạng thái hồ sơ *</label><select id="new-customer-status" value={status} disabled={fieldsDisabled} onChange={event => setStatus(event.target.value)}>{CUSTOMER_STATUSES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
      </>}<CustomerRelativesFields prefix="new-customer" relatives={relatives} disabled={fieldsDisabled} onChange={setRelatives} /></div>
        {savedCustomer && <p role="status">Đã lưu thông tin khách hàng. Bấm lưu lại để hoàn tất tải ảnh; không tạo thêm hồ sơ.</p>}
        {error && <p className="mg-error-message" role="alert">{error}</p>}</div>
      <div className="mg-dialog-footer"><button type="button" className="mg-button" disabled={saving} onClick={onClose}>Hủy</button>
        <button type="submit" className="mg-button mg-button-primary" disabled={saving || processingPhoto || customerOcr.pending}>{saving ? <LoaderCircle size={16} className="mg-spin" /> : <Check size={16} />}{saving ? 'Đang lưu…' : 'Lưu khách hàng'}</button></div>
    </form>
  </Dialog>;
}
