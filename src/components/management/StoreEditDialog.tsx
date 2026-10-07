'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { Check, LoaderCircle, RotateCcw } from 'lucide-react';
import { ManagementRow } from '@/lib/management/types';
import { STORE_KINDS, StoreEdits, StoreManager, validateStoreCreation, validateStoreEdits } from '@/lib/management/store-management';
import { loadStoreManagers } from '@/lib/management/store-repository';
import { STORE_STATUSES } from '@/lib/management/config';
import { Dialog } from './Dialog';
import { useManagement } from './ManagementProvider';

export function StoreEditDialog({ row, onClose, onSaved }: { row: ManagementRow | null; onClose: () => void; onSaved?: () => void }) {
  const { updateStore, createStore } = useManagement();
  const [draft, setDraft] = useState<StoreEdits & { code: string; kind: string }>({ name: row?.name || '', phone: String(row?.phone || ''), address: String(row?.address || ''), status: row?.status || 'active', user_id: row?.user_id == null ? null : Number(row.user_id), revision: String(row?.store_revision || ''), code: String(row?.code || ''), kind: String(row?.kind || 'physical') });
  const [managers, setManagers] = useState<StoreManager[]>([]);
  const [managerError, setManagerError] = useState('');
  const [managerLoading, setManagerLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    let active = true;
    setManagerLoading(true); setManagerError('');
    loadStoreManagers().then(rows => { if (active) setManagers(rows); }).catch(cause => { if (active) setManagerError(cause instanceof Error ? cause.message : 'Không tải được người phụ trách.'); }).finally(() => { if (active) setManagerLoading(false); });
    return () => { active = false; };
  }, [retry]);
  const fields = [{ key: 'name', label: 'Tên cơ sở', required: true }, { key: 'phone', label: 'Số điện thoại', type: 'tel' }, { key: 'address', label: 'Địa chỉ', wide: true }] as const;
  function change(key: keyof typeof draft, value: string | number | null) { setDraft(current => ({ ...current, [key]: value })); setErrors(current => ({ ...current, [key]: '' })); }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy.current || managerLoading || managerError) return;
    const next = row ? validateStoreEdits(draft) : validateStoreCreation(draft); setErrors(next); setError('');
    if (Object.keys(next).length) { requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()); return; }
    busy.current = true; setSaving(true);
    try {
      const details = { name: draft.name.trim(), phone: draft.phone.trim(), address: draft.address.trim(), status: draft.status, user_id: draft.user_id };
      if (row) await updateStore(row.id, { ...details, revision: draft.revision });
      else await createStore({ ...details, code: draft.code.trim().toUpperCase(), kind: draft.kind });
      onSaved?.(); onClose();
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không lưu được cơ sở.'); }
    finally { busy.current = false; setSaving(false); }
  }
  const missingCurrent = row?.user_id != null && !managers.some(manager => manager.id === Number(row.user_id));
  return <Dialog title={row ? 'Chỉnh sửa cơ sở' : 'Thêm cơ sở'} subtitle={row ? `${row.code} · Lưu trực tiếp vào Supabase` : 'Lưu trực tiếp vào Supabase'} onClose={() => { if (!busy.current) onClose(); }}>
    <form ref={form} noValidate onSubmit={submit}><div className="mg-dialog-body"><div className="mg-form-grid">
      {!row && <>
        <div className="mg-field"><label htmlFor="store-create-code">Mã cơ sở</label><input id="store-create-code" value={draft.code} maxLength={191} disabled={saving} placeholder="Để trống để tạo mã tự động" aria-invalid={Boolean(errors.code)} aria-describedby={errors.code ? 'store-create-code-error' : 'store-create-code-hint'} onChange={event => change('code', event.target.value)} />
          <small id="store-create-code-hint">Chữ không dấu, số, dấu - hoặc _. Mã không được trùng.</small>{errors.code && <p id="store-create-code-error" className="mg-field-error">{errors.code}</p>}</div>
        <div className="mg-field"><label htmlFor="store-create-kind">Loại cơ sở</label><select id="store-create-kind" value={draft.kind} disabled={saving} aria-invalid={Boolean(errors.kind)} aria-describedby={errors.kind ? 'store-create-kind-error' : undefined} onChange={event => change('kind', event.target.value)}>{STORE_KINDS.map(kind => <option key={kind.value} value={kind.value}>{kind.label}</option>)}</select>{errors.kind && <p id="store-create-kind-error" className="mg-field-error">{errors.kind}</p>}</div>
      </>}
      {fields.map(field => <div key={field.key} className={`mg-field ${'wide' in field && field.wide ? 'mg-field-wide' : ''}`}>
        <label htmlFor={`store-edit-${field.key}`}>{field.label}{'required' in field && field.required && <span aria-hidden="true"> *</span>}</label>
        <input id={`store-edit-${field.key}`} type={'type' in field ? field.type : 'text'} value={draft[field.key]} maxLength={255} disabled={saving} aria-invalid={Boolean(errors[field.key])} aria-describedby={errors[field.key] ? `store-edit-${field.key}-error` : undefined} onChange={event => change(field.key, event.target.value)} />
        {errors[field.key] && <p id={`store-edit-${field.key}-error`} className="mg-field-error">{errors[field.key]}</p>}
      </div>)}
      <div className="mg-field"><label htmlFor="store-edit-manager">Người phụ trách</label><select id="store-edit-manager" value={draft.user_id ?? ''} disabled={saving || managerLoading || Boolean(managerError)} onChange={event => change('user_id', event.target.value ? Number(event.target.value) : null)}><option value="">Chưa phân công</option>
        {missingCurrent && row && <option value={Number(row.user_id)}>{row.manager_name || `Tài khoản #${row.user_id}`} (hiện tại)</option>}
        {managers.map(manager => <option value={manager.id} key={manager.id}>{manager.name} · #{manager.id}</option>)}
      </select>{managerLoading && <small role="status">Đang tải người phụ trách…</small>}</div>
      <div className="mg-field"><label htmlFor="store-edit-status">Trạng thái</label><select id="store-edit-status" value={draft.status} disabled={saving} aria-invalid={Boolean(errors.status)} aria-describedby={errors.status ? 'store-edit-status-error' : undefined} onChange={event => change('status', event.target.value)}>{STORE_STATUSES.map(status => <option key={status.value} value={status.value}>{status.label}</option>)}</select>{errors.status && <p id="store-edit-status-error" className="mg-field-error">{errors.status}</p>}</div>
    </div>{managerError && <div className="mg-error-message" role="alert"><p>{managerError}</p><button type="button" className="mg-button" disabled={saving} onClick={() => setRetry(value => value + 1)}><RotateCcw size={16} />Tải lại người phụ trách</button></div>}{error && <p className="mg-error-message" role="alert">{error}</p>}</div>
      <div className="mg-dialog-footer"><button type="button" className="mg-button" disabled={saving} onClick={onClose}>Hủy</button><button type="submit" className="mg-button mg-button-primary" disabled={saving || managerLoading || Boolean(managerError)}>{saving ? <LoaderCircle size={16} className="mg-spin" /> : <Check size={16} />}{saving ? 'Đang lưu…' : row ? 'Lưu cơ sở' : 'Tạo cơ sở'}</button></div>
    </form>
  </Dialog>;
}
