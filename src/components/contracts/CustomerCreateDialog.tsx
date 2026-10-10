'use client';

import { FormEvent, useRef, useState } from 'react';
import { Check, LoaderCircle } from 'lucide-react';
import { Dialog } from '@/components/management/Dialog';
import { useManagement } from '@/components/management/ManagementProvider';
import { ContractRelative, CustomerDetails, customerDetails, pairRelatives, formatRelatives, validateCustomer } from '@/lib/management/contract-document';
import { parseCustomerRelatives } from '@/lib/management/customer-relatives';
import { CustomerRelativesFields } from './CustomerRelativesFields';
import { ManagementRow } from '@/lib/management/types';
import { CUSTOMER_STATUSES } from '@/lib/management/config';

export function CustomerCreateDialog({ idCard, storeId, onCreated, onClose }: { idCard: string; storeId?: string; onCreated: (row: ManagementRow) => void; onClose: () => void }) {
  const { source, dataset, selectedStore, createCustomer } = useManagement();
  const [branch, setBranch] = useState(storeId || (selectedStore !== 'all' ? selectedStore : String(dataset?.stores[0]?.id || '')));
  const [status, setStatus] = useState('active');
  const [customer, setCustomer] = useState<CustomerDetails>(() => ({ ...customerDetails(), id_card: idCard }));
  const [relatives, setRelatives] = useState<[ContractRelative, ContractRelative]>(() => pairRelatives(null));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const fields: { key: keyof CustomerDetails; label: string; type?: string; required?: boolean; wide?: boolean; hint?: string }[] = [
    { key: 'id_card', label: 'CCCD / CMND', required: true }, { key: 'name', label: 'Họ và tên', required: true },
    { key: 'phone', label: 'Số điện thoại', type: 'tel', required: true },
    { key: 'address', label: 'Nơi ở hiện tại', required: true, wide: true, hint: 'Ghi số nhà, phường/xã, quận/huyện.' },
    { key: 'driver_license_number', label: 'Số giấy phép lái xe' },
    { key: 'driver_license_issued_on', label: 'Ngày cấp GPLX', type: 'date' },
    { key: 'warning_note', label: 'Ghi chú / cảnh báo', wide: true },
  ];
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy.current) return;
    const next = validateCustomer(customer, source);
    if (!dataset?.stores.some(store => String(store.id) === branch)) next.store_id = 'Chọn cơ sở cho khách hàng.';
    if (status === 'warning' && !customer.warning_note.trim()) next.warning_note = 'Nhập ghi chú cho hồ sơ cần lưu ý.';
    setErrors(next); setError('');
    if (Object.keys(next).length) { requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()); return; }
    try { parseCustomerRelatives(relatives); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Thông tin người thân không hợp lệ.'); return; }
    busy.current = true; setSaving(true);
    try {
      const assignment = { status, store_id: Number(branch) };
      onCreated(await createCustomer({ ...customer, relatives_text: formatRelatives(relatives), relatives_json: JSON.stringify(parseCustomerRelatives(relatives)) }, assignment));
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tạo được khách hàng. Vui lòng thử lại.'); }
    finally { busy.current = false; setSaving(false); }
  }
  return <Dialog title="Thêm khách hàng tại chỗ" subtitle="Lưu hồ sơ vào Supabase" onClose={() => { if (!busy.current) onClose(); }}>
    <form ref={form} noValidate onSubmit={submit}>
      <div className="mg-dialog-body"><div className="mg-form-grid">{fields.map(field => <div className={`mg-field ${field.wide ? 'mg-field-wide' : ''}`} key={field.key}>
        <label htmlFor={`new-customer-${field.key}`}>{field.label}{field.required && <span aria-hidden="true"> *</span>}</label>
        <input id={`new-customer-${field.key}`} name={field.key} type={field.type || 'text'} value={customer[field.key]} disabled={saving} required={field.required}
          aria-invalid={Boolean(errors[field.key])} aria-describedby={errors[field.key] ? `new-customer-${field.key}-error` : undefined}
          onChange={event => { setCustomer(current => ({ ...current, [field.key]: event.target.value })); setErrors(current => ({ ...current, [field.key]: '' })); }} />
        {field.hint && <small>{field.hint}</small>}
        {errors[field.key] && <p className="mg-field-error" id={`new-customer-${field.key}-error`}>{errors[field.key]}</p>}
      </div>)}{<>
        <div className="mg-field"><label htmlFor="new-customer-store">Cơ sở *</label><select id="new-customer-store" value={branch} disabled={saving} aria-invalid={Boolean(errors.store_id)} aria-describedby={errors.store_id ? 'new-customer-store-error' : undefined} onChange={event => { setBranch(event.target.value); setErrors(current => ({ ...current, store_id: '' })); }}>
          <option value="">Chọn cơ sở</option>{dataset?.stores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}</select>{errors.store_id && <p id="new-customer-store-error" className="mg-field-error">{errors.store_id}</p>}</div>
        <div className="mg-field"><label htmlFor="new-customer-status">Trạng thái hồ sơ *</label><select id="new-customer-status" value={status} disabled={saving} onChange={event => setStatus(event.target.value)}>{CUSTOMER_STATUSES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
      </>}<CustomerRelativesFields prefix="new-customer" relatives={relatives} disabled={saving} onChange={setRelatives} /></div>{error && <p className="mg-error-message" role="alert">{error}</p>}</div>
      <div className="mg-dialog-footer"><button type="button" className="mg-button" disabled={saving} onClick={onClose}>Hủy</button>
        <button type="submit" className="mg-button mg-button-primary" disabled={saving}>{saving ? <LoaderCircle size={16} className="mg-spin" /> : <Check size={16} />}{saving ? 'Đang lưu…' : 'Lưu khách hàng'}</button></div>
    </form>
  </Dialog>;
}
