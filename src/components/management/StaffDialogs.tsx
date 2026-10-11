'use client';

import { FormEvent, useRef, useState } from 'react';
import { Check, LoaderCircle, Pencil, Trash2 } from 'lucide-react';
import { bulkDelete } from '@/lib/management/bulk-delete';
import { STAFF_STATUSES } from '@/lib/management/config';
import { normalizeStaffPosition, staffPositionSuggestions, STAFF_POSITION_SEARCH_ALIASES } from '@/lib/management/staff-positions';
import { ManagementRow } from '@/lib/management/types';
import { Dialog } from './Dialog';
import { SuggestionInput } from './SuggestionInput';
import { useManagement } from './ManagementProvider';

export type StaffDialogMode = 'view' | 'edit' | 'delete' | 'create';
const statusLabel = (value: string) => STAFF_STATUSES.find(option => option.value === value)?.label || value || '—';
const dateLabel = (value: unknown) => { const text = String(value || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text.split('-').reverse().join('/') : text || '—'; };

async function saveStaff(id: number | null, body: Record<string, unknown>) {
  const response = await fetch(id === null ? '/api/auth/hr/staff' : `/api/auth/hr/staff/${id}`, { method: id === null ? 'POST' : 'PATCH', credentials: 'same-origin', cache: 'no-store',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.status !== 'success') throw new Error(result?.message || `Không lưu được nhân sự (HTTP ${response.status}).`);
  return result.data as { id: number; staff_code: string } | null;
}

interface Props { row: ManagementRow | null; mode: StaffDialogMode; stores: ManagementRow[]; defaultStoreId?: string; onClose: () => void; onChanged: (created?: { name: string; code: string }) => void | Promise<void>; onSwitch?: (mode: StaffDialogMode) => void }
export function StaffDialog({ row, mode, stores, defaultStoreId = '', onClose, onChanged, onSwitch }: Props) {
  const { dataset } = useManagement();
  const creating = mode === 'create' || !row;
  const [draft, setDraft] = useState({ name: String(row?.name || ''), phone: String(row?.phone || ''), email: String(row?.email || ''), position: normalizeStaffPosition(row?.position),
    store_id: row ? row.store_id == null ? '' : String(row.store_id) : defaultStoreId, status: row?.status || 'active', joined_at: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);
  const change = (key: keyof typeof draft, value: string) => { setDraft(current => ({ ...current, [key]: value })); setErrors(current => ({ ...current, [key]: '' })); };
  async function run(action: () => Promise<{ name: string; code: string } | void>) {
    if (busy.current) return;
    busy.current = true; setSaving(true); setError('');
    try { const created = await action(); await onChanged(created || undefined); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thực hiện được thao tác.'); }
    finally { busy.current = false; setSaving(false); }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!draft.name.trim()) next.name = 'Nhập họ và tên.';
    if (!/^\+?\d{9,13}$/.test(draft.phone.replace(/[\s.()-]/g, ''))) next.phone = 'Số điện thoại cần 9–13 chữ số.';
    if (draft.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) next.email = 'Email chưa hợp lệ.';
    setErrors(next);
    if (Object.keys(next).length) return;
    const body = { name: draft.name.trim(), phone: draft.phone.trim(), email: draft.email.trim(), position: normalizeStaffPosition(draft.position), store_id: draft.store_id ? Number(draft.store_id) : null, status: draft.status };
    void run(async () => {
      if (!creating) { await saveStaff(row.id, body); return; }
      const created = await saveStaff(null, { ...body, joined_at: draft.joined_at });
      return { name: body.name, code: created?.staff_code || '' };
    });
  }
  const close = () => { if (!busy.current) onClose(); };
  const title = creating ? 'Thêm nhân sự' : mode === 'view' ? 'Hồ sơ nhân sự' : mode === 'edit' ? 'Sửa nhân sự' : 'Xóa nhân sự';
  const positions = staffPositionSuggestions((dataset?.staff || []).map(person => person.position));
  const field = (key: 'name' | 'phone' | 'email', label: string, type = 'text', required = false) => <div className="mg-field"><label htmlFor={`staff-${key}`}>{label}{required && <span aria-hidden="true"> *</span>}</label>
    <input id={`staff-${key}`} type={type} value={draft[key]} maxLength={191} disabled={saving} aria-invalid={Boolean(errors[key])} onChange={event => change(key, event.target.value)} />{errors[key] && <p className="mg-field-error">{errors[key]}</p>}</div>;
  return <Dialog title={title} subtitle={creating ? 'Mã nhân sự được hệ thống tự cấp sau khi lưu' : `${row.code} · ${row.name}`} onClose={close}>
    {!creating && mode === 'view' && <><div className="mg-dialog-body"><dl className="mg-detail-grid">
      {([['Mã nhân sự', row.code], ['Họ và tên', row.name], ['Số điện thoại', row.phone], ['Email', row.email], ['Chức vụ', row.position], ['Cơ sở', row.store_name || 'Trụ sở công ty / Chưa phân bổ'], ['Trạng thái', statusLabel(row.status)], ['Ngày vào làm', dateLabel(row.hire_date)], ['Ghi chú', row.notes]] as [string, unknown][])
        .map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{String(value || '—')}</dd></div>)}</dl></div>
      <div className="mg-dialog-footer"><button type="button" className="mg-button" onClick={onClose}>Đóng</button><button type="button" className="mg-button mg-button-primary" onClick={() => onSwitch?.('edit')}><Pencil size={16} />Chỉnh sửa</button></div></>}
    {(creating || mode === 'edit') && <form noValidate onSubmit={submit}><div className="mg-dialog-body"><div className="mg-form-grid">
      {field('name', 'Họ và tên', 'text', true)}{field('phone', 'Số điện thoại', 'tel', true)}{field('email', 'Email', 'email')}
      <div className="mg-field"><label htmlFor="staff-position">Chức vụ</label><SuggestionInput id="staff-position" value={draft.position} suggestions={positions} searchAliases={STAFF_POSITION_SEARCH_ALIASES} disabled={saving} placeholder="Chọn gợi ý hoặc gõ chức vụ mới" onChange={value => change('position', value)} /><small>NVKD (Nhân viên kinh doanh), PT, TPKD, QL PTKD… dùng chung cách viết cho mọi cơ sở. Kiêm nhiệm: ngăn cách bằng dấu /.</small></div>
      <div className="mg-field"><label htmlFor="staff-store">Cơ sở</label><select id="staff-store" value={draft.store_id} disabled={saving} onChange={event => change('store_id', event.target.value)}><option value="">Chưa phân bổ</option>{stores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}</select></div>
      <div className="mg-field"><label htmlFor="staff-status">Trạng thái</label><select id="staff-status" value={draft.status} disabled={saving} onChange={event => change('status', event.target.value)}>{STAFF_STATUSES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
      {creating && <div className="mg-field"><label htmlFor="staff-joined-at">Ngày vào làm</label><input id="staff-joined-at" type="date" value={draft.joined_at} disabled={saving} onChange={event => change('joined_at', event.target.value)} /></div>}
    </div>{error && <p className="mg-error-message" role="alert">{error}</p>}</div>
      <div className="mg-dialog-footer"><button type="button" className="mg-button" disabled={saving} onClick={onClose}>Hủy</button><button type="submit" className="mg-button mg-button-primary" disabled={saving}>{saving ? <LoaderCircle size={16} className="mg-spin" /> : <Check size={16} />}{saving ? 'Đang lưu…' : creating ? 'Thêm nhân sự' : 'Lưu nhân sự'}</button></div></form>}
    {!creating && mode === 'delete' && <><div className="mg-dialog-body"><p>Xóa vĩnh viễn hồ sơ <strong>{row.name}</strong>? Nhân sự còn lịch trực hoặc dữ liệu liên quan sẽ không xóa được; khi đó hãy đổi trạng thái sang “Đã nghỉ việc”.</p>{error && <p className="mg-error-message" role="alert">{error}</p>}</div>
      <div className="mg-dialog-footer"><button type="button" className="mg-button" disabled={saving} onClick={onClose}>Hủy</button>{error && <button type="button" className="mg-button" disabled={saving} onClick={() => void run(async () => { await saveStaff(row.id, { name: row.name, phone: row.phone, email: row.email || '', position: normalizeStaffPosition(row.position), store_id: row.store_id ?? null, status: 'leave' }); })}>Chuyển sang đã nghỉ việc</button>}<button type="button" className="mg-button mg-button-danger" disabled={saving} onClick={() => void run(async () => { await bulkDelete('staff', [row.id]); })}>{saving ? <LoaderCircle size={16} className="mg-spin" /> : <Trash2 size={16} />}{saving ? 'Đang xóa…' : 'Xóa nhân sự'}</button></div></>}
  </Dialog>;
}
