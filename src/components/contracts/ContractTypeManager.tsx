'use client';

import { useState, type FormEvent } from 'react';
import { Dialog } from '@/components/management/Dialog';
import { CONTRACT_TYPE_BILLING, type ContractType, type ContractTypeInput } from '@/lib/management/contract-types';
import { useContractTypes } from './ContractTypesProvider';

export function ContractTypeManager({ onClose, onCreated }: { onClose?: () => void; onCreated?: (type: ContractType) => void }) {
  const catalog = useContractTypes();
  const [editing, setEditing] = useState<ContractType | null>(null), [label, setLabel] = useState(''), [billing, setBilling] = useState<ContractTypeInput['rental_type']>('daily'), [months, setMonths] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  function reset() { setEditing(null); setLabel(''); setBilling('daily'); setMonths(''); setError(''); }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError(''); setMessage('');
    try {
      const before = new Set(catalog.types.map(type => type.id));
      const data = await catalog.save(editing ? 'PATCH' : 'POST', editing ? {id:editing.id,revision:editing.revision,label,active:editing.active}
        : {label,rental_type:billing,term_months:billing === 'daily' || !months ? null : Number(months),active:true});
      const created = data.find(type => !before.has(type.id));
      reset(); setMessage('Đã lưu loại hợp đồng.');
      if (created && onCreated) onCreated(created);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không lưu được loại hợp đồng.'); }
    finally { setBusy(false); }
  }
  async function toggle(type: ContractType) {
    if (busy) return; setBusy(true); setError('');
    try { await catalog.save('PATCH',{id:type.id,revision:type.revision,label:type.label,active:!type.active}); if (editing?.id === type.id) reset(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không đổi được trạng thái.'); }
    finally { setBusy(false); }
  }
  const content = <div className="mg-dialog-body">
    <p>Thêm loại bên mình sử dụng. Ẩn loại không cần; hợp đồng đã lưu giữ nguyên tên và cách tính tiền.</p>
    {catalog.error && <p role="alert" className="mg-field-error">{catalog.error} <button className="mg-button" type="button" onClick={() => void catalog.load(true)}>Thử lại</button></p>}
    <form onSubmit={submit}><fieldset disabled={!catalog.canManage || busy || catalog.loading || !catalog.loaded} className="mg-contract-type-form">
      <legend>{editing ? 'Đổi tên loại hợp đồng' : 'Thêm loại hợp đồng'}</legend>
      <div className="mg-form-grid">
        <div className="mg-field mg-field-wide"><label htmlFor="contract-type-label">Tên loại hợp đồng *</label><input id="contract-type-label" value={label} maxLength={80} required onChange={event => setLabel(event.target.value)} placeholder="Ví dụ: Thuê 24 tháng" /></div>
        <div className="mg-field"><label htmlFor="contract-type-billing">Cách tính tiền *</label><select id="contract-type-billing" value={editing?.rental_type || billing} disabled={Boolean(editing)} onChange={event => { setBilling(event.target.value as ContractTypeInput['rental_type']); if (event.target.value === 'daily') setMonths(''); }}>{editing && !CONTRACT_TYPE_BILLING.some(type => type.value === editing.rental_type) && <option value={editing.rental_type}>Theo loại đã lưu</option>}{CONTRACT_TYPE_BILLING.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}</select></div>
        <div className="mg-field"><label htmlFor="contract-type-months">Thời hạn gợi ý (tháng)</label><input id="contract-type-months" type="number" min={1} max={120} value={months} disabled={Boolean(editing) || billing === 'daily'} onChange={event => setMonths(event.target.value)} placeholder="Không bắt buộc" /></div>
      </div>
      {editing && <p className="mg-composer-hint">Cách tính tiền giữ nguyên để bảo toàn hợp đồng cũ. Tạo loại mới nếu cần cách tính khác.</p>}
      <div className="mg-contract-type-actions"><button type="submit" className="mg-button mg-button-primary">{busy ? 'Đang lưu…' : editing ? 'Lưu tên mới' : 'Thêm loại hợp đồng'}</button>{editing && <button type="button" className="mg-button" onClick={reset}>Hủy sửa</button>}</div>
    </fieldset></form>
    {!catalog.canManage && <p>Tài khoản chưa có quyền chỉnh sửa danh mục.</p>}
    {error && <p role="alert" className="mg-field-error">{error}</p>}{message && <p role="status">{message}</p>}
    {catalog.loading && <p role="status">Đang tải danh mục…</p>}
    <button type="button" className="mg-button" disabled={busy || catalog.loading} onClick={()=>{reset();void catalog.load(true);}}>Làm mới danh mục</button>
    <ul className="mg-contract-type-list">{catalog.types.map(type => <li key={type.id}><div><strong>{type.label}</strong><small>{type.active ? 'Đang dùng' : 'Đã ẩn'}{type.term_months ? ` · ${type.term_months} tháng` : ''}</small></div><div className="mg-contract-type-actions"><button type="button" className="mg-button" disabled={!catalog.canManage || busy || catalog.loading} onClick={() => { setEditing(type); setLabel(type.label); setMonths(type.term_months ? String(type.term_months) : ''); setError(''); }}>Đổi tên {type.label}</button><button type="button" className="mg-button" disabled={!catalog.canManage || busy || catalog.loading} onClick={() => void toggle(type)}>{type.active ? 'Ẩn' : 'Hiện'} {type.label}</button></div></li>)}</ul>
  </div>;
  return onClose ? <Dialog title="Loại hợp đồng" onClose={() => { if (!busy) onClose(); }}>{content}<div className="mg-dialog-footer"><button className="mg-button" type="button" disabled={busy} onClick={onClose}>Đóng</button></div></Dialog>
    : <section className="mg-page"><div className="mg-page-content"><div className="mg-page-heading"><h1>Loại hợp đồng</h1></div><div className="mg-data-panel">{content}</div></div></section>;
}
