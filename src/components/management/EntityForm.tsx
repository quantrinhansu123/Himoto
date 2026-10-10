'use client';

import { FormEvent, useRef, useState } from 'react';
import { Check, LoaderCircle } from 'lucide-react';
import { ManagementConfig, ManagementRow } from '@/lib/management/types';
import { useManagement } from './ManagementProvider';
import { Dialog } from './Dialog';
import { ContractRelative, relativesFromRow, formatRelatives } from '@/lib/management/contract-document';
import { parseCustomerRelatives } from '@/lib/management/customer-relatives';
import { CustomerRelativesFields } from '@/components/contracts/CustomerRelativesFields';

export function EntityForm({ config, row, onClose }: { config: ManagementConfig; row: ManagementRow | null; onClose: () => void }) {
  const { dataset, selectedStore, source, save, updateCustomer } = useManagement();
  const prefixes = { staff: 'NV', customers: 'KH', stores: 'CS', vehicles: 'XE', contracts: 'HD' };
  const [draft, setDraft] = useState<ManagementRow>(() => {
    if (row) return { ...row };
    const id = Math.max(0, ...((dataset?.[config.kind] || []).map(r => r.id))) + 1;
    const defaults: ManagementRow = { id, code: `${prefixes[config.kind]}-${String(id).padStart(3, '0')}`, name: '', status: config.statuses[0]?.value || '', created_at: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }) };
    for (const field of config.fields) {
      if (field.storeOptions) defaults[field.key] = Number(selectedStore !== 'all' ? selectedStore : dataset?.stores[0]?.id) || undefined;
      else if (field.options) defaults[field.key] = field.options[0]?.value || '';
      else defaults[field.key] = '';
    }
    return defaults;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [relatives, setRelatives] = useState<[ContractRelative, ContractRelative]>(() => relativesFromRow(row));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    for (const field of config.fields) {
      if (config.kind === 'customers' && field.key === 'relatives_text') continue;
      const value = String(draft[field.key] ?? '').trim();
      if (field.required && !value) nextErrors[field.key] = `Vui lòng nhập ${field.label.toLowerCase()}.`;
      else if (value && field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) nextErrors[field.key] = 'Email chưa đúng định dạng.';
      else if (value && field.type === 'tel' && !/^\+?\d{9,13}$/.test(value.replace(/[\s.()-]/g, ''))) nextErrors[field.key] = 'Nhập số điện thoại từ 9 đến 13 chữ số.';
      else if (value && field.type === 'number' && (!Number.isFinite(Number(value)) || Number(value) < 0 || !Number.isInteger(Number(value)))) nextErrors[field.key] = 'Nhập một số nguyên không âm.';
      if (field.storeOptions && value && !dataset?.stores.some(s => s.id === Number(value))) nextErrors[field.key] = 'Vui lòng chọn một cơ sở hợp lệ.';
      if (field.options && value && !field.options.some(option => option.value === value)) nextErrors[field.key] = 'Giá trị chưa được hỗ trợ.';
    }
    if (config.kind === 'vehicles' && dataset?.vehicles.some(v => v.id !== draft.id && String(v.license).trim().toUpperCase() === String(draft.license).trim().toUpperCase())) nextErrors.license = 'Biển số này đã có trong danh sách.';
    if (config.kind === 'customers' && draft.status === 'warning' && !String(draft.warning_note || '').trim()) nextErrors.warning_note = 'Nhập ghi chú cho hồ sơ cần lưu ý.';
    if (config.kind === 'customers' && String(draft.id_card || '').trim() && !/^\d{9}$|^\d{12}$/.test(String(draft.id_card).replace(/\s+/g, ''))) nextErrors.id_card = 'CCCD/CMND phải có 9 hoặc 12 chữ số.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    if (config.kind === 'contracts') return; // Contract edits use their dedicated snapshot-aware form and repository methods.
    const prepared = { ...draft };
    if (config.kind === 'customers') {
      try {
        prepared.relatives_json = JSON.stringify(parseCustomerRelatives(relatives));
        prepared.relatives_text = formatRelatives(relatives);
      } catch (cause) { setSaveError(cause instanceof Error ? cause.message : 'Thông tin người thân không hợp lệ.'); return; }
    }
    for (const field of config.fields) {
      if (config.kind === 'customers' && field.key === 'relatives_text') continue;
      const value = String(draft[field.key] ?? '').trim();
      prepared[field.key] = field.type === 'number' || field.storeOptions ? (value ? Number(value) : undefined) : value;
    }
    setSaving(true); setSaveError('');
    try {
      if (config.kind === 'customers' && source === 'api') await updateCustomer(prepared);
      else await save(config.kind, prepared);
      onClose();
    } catch (cause) { setSaveError(cause instanceof Error ? cause.message : 'Không lưu được thay đổi vào Supabase.'); }
    finally { setSaving(false); }
  }

  return <Dialog title={`${row ? 'Chỉnh sửa' : 'Thêm'} ${config.singular}`} subtitle={`${draft.code} · ${'Lưu trực tiếp vào Supabase'}`} onClose={() => { if (!saving) onClose(); }}>
    <form ref={formRef} onSubmit={submit} noValidate>
      <div className="mg-dialog-body"><div className="mg-form-grid">{config.fields.filter(field => config.kind !== 'customers' || field.key !== 'relatives_text').map(field => {
        const options = field.storeOptions ? (dataset?.stores || []).map(store => ({ value: String(store.id), label: store.name })) : field.options;
        const id = `field-${field.key}`;
        const props = { id, name: field.key, value: draft[field.key] ?? '', disabled: saving,
          'aria-invalid': Boolean(errors[field.key]), 'aria-describedby': errors[field.key] ? `${id}-error` : field.hint ? `${id}-hint` : undefined,
          onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
            setDraft(current => ({ ...current, [field.key]: event.target.value }));
            setErrors(current => ({ ...current, [field.key]: '' }));
          } };
        return <div key={field.key} className={`mg-field ${field.wide ? 'mg-field-wide' : ''}`}><label htmlFor={id}>{field.label}{field.required && <span aria-hidden="true"> *</span>}</label>
          {field.type === 'select' ? <select {...props} required={field.required}>{field.storeOptions && <option value="">Chọn cơ sở</option>}{options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
            : field.type === 'textarea' ? <textarea {...props} rows={3} /> : <input {...props} type={field.type || 'text'} required={field.required} min={field.type === 'number' ? 0 : undefined} step={field.type === 'number' ? 1 : undefined} />}
          {field.hint && <small id={`${id}-hint`}>{field.hint}</small>}{errors[field.key] && <p id={`${id}-error`} className="mg-field-error">{errors[field.key]}</p>}
        </div>;
      })}{config.kind === 'customers' && <CustomerRelativesFields prefix="edit-customer" relatives={relatives} disabled={saving} onChange={setRelatives} />}</div>{saveError && <p className="mg-error-message" role="alert">{saveError}</p>}</div>
      <div className="mg-dialog-footer"><span className="mg-form-note">* Thông tin bắt buộc</span><button className="mg-button" type="button" disabled={saving} onClick={onClose}>Hủy</button>
        <button className="mg-button mg-button-primary" type="submit" disabled={saving}>{saving ? <LoaderCircle size={16} className="mg-spin" /> : <Check size={16} />}{saving ? 'Đang lưu…' : 'Lưu khách hàng'}</button></div>
    </form>
  </Dialog>;
}
