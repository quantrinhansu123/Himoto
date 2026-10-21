'use client';

import { useEffect, useRef, useState } from 'react';
import { Plus, Save, CheckCircle2, ClipboardList, RefreshCw } from 'lucide-react';
import { useManagement } from './ManagementProvider';
import { vietnamDate } from '@/lib/management/duty-roster';
import { prepareRecordPhoto } from '@/lib/management/record-photos';
import { emptyShiftSummary, shiftVehicleTotal, parseShiftInput, SHIFT_PHOTOS, SHIFT_SUMMARY_FIELDS, type ShiftInput, type ShiftReport } from '@/lib/management/shift-reports';

const blank = (store = 0): ShiftInput => ({ store_id: store, date: vietnamDate(), staff: '', vehicles: 0, batteries: 0, charged: 0, transfers: 0, cash: 0, personal: 0, company: 0, electricity_off: false, notes: '', summary: emptyShiftSummary(), daily_vehicles: 0, monthly_vehicles: 0 });
const money = (value: number) => new Intl.NumberFormat('vi-VN').format(value) + ' đồng';
const REPORT_TABS = [
  ['information', 'Thông tin'],
  ['inventory', 'Kiểm kê xe / pin'], ['summary', 'Hợp đồng & thu chi'],
  ['accounts', 'Tiền các tài khoản'], ['safety', 'An toàn cuối ca'],
] as const;
type ReportTab = typeof REPORT_TABS[number][0];
async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, cache: 'no-store', credentials: 'same-origin' });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.data) throw new Error(result?.message || 'Không xử lý được báo cáo. Vui lòng thử lại.');
  return result.data;
}
export function ShiftReportsPage() {
  const [tab, setTab] = useState<ReportTab>('information');
  const { dataset, selectedStore, can, notify, error: directoryError } = useManagement();
  const [rows, setRows] = useState<ShiftReport[]>([]), [loading, setLoading] = useState(true), [retry, setRetry] = useState(0);
  const [editing, setEditing] = useState(false), [input, setInput] = useState<ShiftInput>(() => blank());
  const [record, setRecord] = useState<Pick<ShiftReport,'id'|'revision'|'status'|'photos'> | null>(null);
  const [files, setFiles] = useState<Record<string,File>>({}), [previews, setPreviews] = useState<Record<string,string>>({});
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [listError, setListError] = useState('');
  const lock = useRef(false);
  const writable = can('contracts.draft') || can('finance.write');
  const readonly = !writable || record?.status === 'submitted';
  const stores = dataset?.stores || [];
  const historyForStore = rows.filter(row => row.payload.store_id === input.store_id);
  const deviceOptions = Array.from(new Set([
    'Đèn chiếu sáng, quạt, điều hòa, máy tính, bộ sạc pin',
    ...historyForStore.map(row => row.payload.electrical_devices?.trim()).filter((value): value is string => Boolean(value)),
  ]));
  const noteOptions = Array.from(new Set(['Không', ...historyForStore.map(row => row.payload.notes.trim()).filter(Boolean)]));
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setListError('');
    api<ShiftReport[]>(`/api/auth/shift-reports${selectedStore === 'all' ? '' : '?store_id=' + selectedStore}`, { signal: controller.signal })
      .then(setRows).catch(e => { if (!controller.signal.aborted) setListError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [selectedStore,retry]);
  useEffect(() => {
    const urls = Object.fromEntries(Object.entries(files).map(([key,file]) => [key,URL.createObjectURL(file)])); setPreviews(urls);
    return () => Object.values(urls).forEach(URL.revokeObjectURL);
  }, [files]);
  const dirty = useRef(false);
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => { if (dirty.current) event.preventDefault(); };
    window.addEventListener('beforeunload',leave); return () => window.removeEventListener('beforeunload',leave);
  }, []);
  function open(row?: ShiftReport) {
    if (dirty.current && !window.confirm('Có thay đổi chưa lưu. Bỏ thay đổi để mở báo cáo khác?')) return;
    dirty.current = false; setInput(row ? { ...row.payload, ...(row.status === 'draft' ? { daily_vehicles: row.payload.daily_vehicles ?? 0, monthly_vehicles: row.payload.monthly_vehicles ?? 0 } : {}), ...(row.status === 'draft' && !row.payload.summary ? { summary: emptyShiftSummary() } : {}) } : blank(selectedStore === 'all' ? 0 : Number(selectedStore)));
    setRecord(row || null); setFiles({}); setError(''); setEditing(true); setTab('information');
  }
  function update<K extends keyof ShiftInput>(key: K, value: ShiftInput[K]) { dirty.current = true; setInput(current => ({ ...current, [key]: value })); }
  async function save(submit: boolean) {
    if (lock.current) return;
    setError('');
    try {
      parseShiftInput(input);
      if (submit && (!input.electricity_off || SHIFT_PHOTOS.some(([slot]) => !files[slot] && !record?.photos.includes(slot)))) throw new Error('Bổ sung đủ 6 ảnh và xác nhận đã tắt thiết bị điện trước khi chốt.');
    } catch (e) { setError((e as Error).message); return; }
    if (submit && !window.confirm('Chốt báo cáo cuối ca? Báo cáo và ảnh sẽ được khóa sau khi chốt.')) return;
    lock.current = true; setBusy(true);
    let current = record;
    try {
      const result = await api<{id:number;revision:number}>('/api/auth/shift-reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: current?.id, revision: current?.revision, payload: input, status: 'draft' }) });
      current = { ...result, status: 'draft', photos: current?.photos || [] }; setRecord(current);
      for (const [slot,file] of Object.entries(files)) {
        const photo = await prepareRecordPhoto(file);
        const uploaded: {revision:number} = await api<{revision:number}>(`/api/auth/shift-reports/${current.id}/photos/${slot}`, { method: 'PUT', headers: { 'Content-Type': photo.type, 'x-report-revision': String(current.revision) }, body: photo });
        current = { ...current, revision: uploaded.revision, photos: Array.from(new Set([...current.photos,slot])) }; setRecord(current);
        setFiles(previous => { const next = { ...previous }; delete next[slot]; return next; });
      }
      if (submit) {
        const completed = await api<{id:number;revision:number}>('/api/auth/shift-reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: current.id, revision: current.revision, payload: input, status: 'submitted' }) });
        setRecord({ ...current, ...completed, status: 'submitted' });
      }
      dirty.current = false; notify(submit ? 'Đã chốt báo cáo cuối ca.' : 'Đã lưu nháp báo cáo và ảnh.');
    } catch (e) { setError((e as Error).message + ' Các phần đã lưu được giữ lại; kiểm tra trước khi thử lại.'); }
    finally { lock.current = false; setBusy(false); setRetry(n => n + 1); }
  }
  function sample() {
    const store = stores.find(s => s.name.toLocaleLowerCase('vi').includes('hà đông'));
    if (!store) { setError('Không tìm thấy PGD Hà Đông trong danh sách được phân quyền.'); return; }
    dirty.current = true;
    setInput({ store_id: store.id, date: '2026-10-21', staff: 'Chu Văn Tú, Nguyễn Anh Tú', vehicles: 19, batteries: 4, charged: 2, transfers: 1, cash: 1865000, personal: 64300134, company: 26790959, electricity_off: false, notes: 'Không', summary: emptyShiftSummary(), daily_vehicles: 0, monthly_vehicles: 0 });
  }
  const numeric = (key: 'vehicles'|'batteries'|'charged'|'transfers'|'cash'|'personal'|'company'|'daily_vehicles'|'monthly_vehicles', label: string, currency = false) => <div className="mg-field"><label htmlFor={'shift-'+key}>{label}</label><input id={'shift-'+key} type="number" min="0" max={currency ? 1e12 : 100000} step="1" required value={input[key] === undefined || Number.isNaN(input[key]) ? '' : input[key]} onChange={e => update(key,e.target.value === '' ? NaN : Number(e.target.value))}/>{currency && Number.isFinite(input[key]) && <small>{money(input[key]!)}</small>}</div>;
  const renderPhotos = (slots: readonly string[]) => <>
      <h3>Ảnh đính kèm</h3><p>Mỗi mục một ảnh JPEG, PNG hoặc WebP; ảnh lớn được thu nhỏ khi lưu.</p>
      <div className="shift-photo-grid">{SHIFT_PHOTOS.filter(([slot]) => slots.includes(slot)).map(([slot,label]) => <div key={slot} className="shift-photo"><strong>{label}</strong>{previews[slot] || record?.photos.includes(slot) ? <a href={previews[slot] || `/api/auth/shift-reports/${record!.id}/photos/${slot}`} target="_blank" rel="noreferrer"><img src={previews[slot] || `/api/auth/shift-reports/${record!.id}/photos/${slot}?v=${record!.revision}`} alt={label}/></a> : <div className="shift-photo-empty">Chưa có ảnh</div>}{!readonly && <input type="file" accept="image/jpeg,image/png,image/webp" aria-label={label} disabled={busy} onChange={e => { const file = e.target.files?.[0]; if (file) { dirty.current = true; setFiles(previous => ({ ...previous,[slot]:file })); } e.target.value=''; }}/>}<small>{files[slot] ? 'Ảnh mới · Chưa lưu' : record?.photos.includes(slot) ? 'Đã lưu ảnh' : 'Cần bổ sung trước khi chốt'}</small></div>)}</div>
  </>;
  return <section className="mg-page"><div className="mg-page-content shift-reports">
    <div className="mg-page-heading"><div><div className="mg-eyebrow">VẬN HÀNH PGD</div><h1>Báo cáo cuối ca</h1><p>Kiểm kê xe, pin, tiền và xác nhận an toàn trước khi kết thúc ca.</p></div><div className="mg-heading-actions"><button className="mg-button" disabled={busy || loading} onClick={() => setRetry(n => n+1)}><RefreshCw size={16}/>Làm mới</button>{writable && <button className="mg-button mg-button-primary" disabled={busy} onClick={() => open()}><Plus size={16}/>Tạo báo cáo</button>}</div></div>
    {directoryError && <p role="alert">{directoryError}</p>}
    {editing && <form className="mg-data-panel shift-form" onInvalidCapture={event => {
      event.preventDefault();
      const field = event.currentTarget.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(':invalid');
      if (!field) return;
      const panel = field.closest('[role="tabpanel"]');
      if (panel) setTab(panel.id.replace('shift-panel-', '') as ReportTab);
      setError(field.validationMessage);
      requestAnimationFrame(() => field.focus());
    }} onSubmit={e => { e.preventDefault(); void save(false); }}>
      <div className="shift-form-title"><ClipboardList size={22}/><div><h2>BÁO CÁO KIỂM KÊ PGD{input.date ? ' - NGÀY '+input.date.split('-').reverse().join('/') : ''}</h2><p>{record?.status === 'submitted' ? 'Đã chốt · Chỉ xem' : 'Bản nháp · Bổ sung ảnh thực tế trước khi chốt'}</p></div></div>
      <div className="shift-tabs" role="tablist" aria-label="Các phần báo cáo cuối ca">{REPORT_TABS.map(([key,label], index) => <button key={key} id={'shift-tab-'+key} type="button" role="tab" aria-selected={tab === key} aria-controls={'shift-panel-'+key} tabIndex={tab === key ? 0 : -1} onClick={() => setTab(key)} onKeyDown={event => {
        const next = event.key === 'ArrowRight' ? (index+1)%REPORT_TABS.length : event.key === 'ArrowLeft' ? (index+REPORT_TABS.length-1)%REPORT_TABS.length : event.key === 'Home' ? 0 : event.key === 'End' ? REPORT_TABS.length-1 : -1;
        if (next >= 0) { event.preventDefault(); setTab(REPORT_TABS[next][0]); document.getElementById('shift-tab-'+REPORT_TABS[next][0])?.focus(); }
      }}>{label}</button>)}</div>
      <fieldset disabled={busy || readonly}>
        <div id="shift-panel-information" role="tabpanel" aria-labelledby="shift-tab-information" hidden={tab !== 'information'} tabIndex={0}>
        <h3>Thông tin chung</h3><p>PGD, ngày báo cáo và nhân sự trực ca dùng chung cho tất cả các tab báo cáo.</p>
        <div className="mg-form-grid"><div className="mg-field"><label htmlFor="shift-store">PGD</label><select id="shift-store" required value={input.store_id || ''} disabled={!!record} onChange={e => update('store_id',Number(e.target.value))}><option value="">Chọn PGD</option>{stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div><div className="mg-field"><label htmlFor="shift-date">Ngày báo cáo</label><input id="shift-date" type="date" required disabled={!!record} value={input.date} onChange={e => update('date',e.target.value)}/></div><div className="mg-field mg-field-wide"><label htmlFor="shift-staff">Nhân sự trực ca</label><input id="shift-staff" required maxLength={1000} placeholder="Nhập họ tên các nhân sự trực ca" value={input.staff} onChange={e => update('staff',e.target.value)}/></div></div>
        </div>
        <div id="shift-panel-summary" role="tabpanel" aria-labelledby="shift-tab-summary" hidden={tab !== 'summary'} tabIndex={0}><h3>Thống kê hợp đồng và thu chi trong ngày</h3>
        <p>Nhập số liệu thực tế theo PGD và ngày báo cáo. Các tổng thu/chi được nhập riêng để đối chiếu.</p>
        {!input.summary ? <p>Báo cáo này chưa ghi nhận thống kê hợp đồng và thu chi.</p> : <div className="shift-summary-grid">{['Hợp đồng', 'Thu thực tế', 'Chi và các khoản liên quan'].map((title, group) => <div key={title} className="shift-summary-card"><h4>{title}</h4>{SHIFT_SUMMARY_FIELDS.slice(group * 4, group * 4 + 4).map(([key, label, currency]) => <div key={key} className="mg-field"><label htmlFor={'shift-summary-' + key}>{label}{currency ? ' (đồng)' : ''}</label><input id={'shift-summary-' + key} type="number" min="0" max={currency ? 1e12 : 100000} step="1" required value={Number.isNaN(input.summary![key]) ? '' : input.summary![key]} onChange={event => update('summary', { ...input.summary!, [key]: event.target.value === '' ? NaN : Number(event.target.value) })}/>{currency && Number.isFinite(input.summary![key]) && <small>{money(input.summary![key])}</small>}</div>)}</div>)}</div>}
        </div><div id="shift-panel-inventory" role="tabpanel" aria-labelledby="shift-tab-inventory" hidden={tab !== 'inventory'} tabIndex={0}><h3>Tổng kết xe cuối ngày</h3>
        <div className="mg-form-grid">{numeric('daily_vehicles','Xe cho thuê ngày (xe)')}{numeric('monthly_vehicles','Xe cho thuê tháng (xe)')}{numeric('vehicles','Xe lưu kho thực tế (xe)')}
          <div className="mg-field"><label htmlFor="shift-vehicle-total">Tổng kết xe cuối ngày (xe)</label><input id="shift-vehicle-total" readOnly value={shiftVehicleTotal(input) ?? ''} placeholder="Chưa đủ số liệu"/><small>Tự tính: xe cho thuê ngày + xe cho thuê tháng + xe lưu kho.</small></div>
        </div>
        {readonly && shiftVehicleTotal(input) === null && <p>Báo cáo cũ chưa ghi nhận đủ số xe cho thuê ngày/tháng để tính tổng.</p>}
        <h3>2. Pin cửa hàng</h3><div className="mg-form-grid">{numeric('batteries','Tổng số pin (pin)')}{numeric('charged','Trong đó pin đầy (pin)')}</div>
        <h3>3. Xe điều chuyển</h3><div className="mg-form-grid">{numeric('transfers','Số xe điều chuyển trong ca (xe)')}</div>
        {renderPhotos(['vehicles','batteries'])}</div><div id="shift-panel-accounts" role="tabpanel" aria-labelledby="shift-tab-accounts" hidden={tab !== 'accounts'} tabIndex={0}><h3>Tiền các tài khoản</h3><div className="mg-form-grid">{numeric('cash','Tiền mặt thực tế (đồng)',true)}{numeric('personal','TK cá nhân được phân công (đồng)',true)}{numeric('company','TK Công ty (đồng)',true)}</div>
        {renderPhotos(['cash','personal','company'])}</div><div id="shift-panel-safety" role="tabpanel" aria-labelledby="shift-tab-safety" hidden={tab !== 'safety'} tabIndex={0}><h3>An toàn cuối ca</h3><label className="shift-checkbox"><input type="checkbox" checked={input.electricity_off} onChange={e => update('electricity_off',e.target.checked)}/>Xác nhận đã tắt các thiết bị điện</label>
        <div className="mg-form-grid">
          <div className="mg-field"><label htmlFor="shift-devices">Thiết bị điện đã tắt gồm</label><input id="shift-devices" list="shift-device-options" maxLength={1000} placeholder="Chọn danh sách cũ hoặc nhập thiết bị thực tế" value={input.electrical_devices ?? ''} onChange={e => update('electrical_devices',e.target.value)}/><datalist id="shift-device-options">{deviceOptions.map(value => <option key={value} value={value}/>)}</datalist><small>Ví dụ: đèn, quạt, điều hòa, máy tính, bộ sạc pin. Chọn đúng các thiết bị thực tế đã tắt.</small></div>
          <div className="mg-field"><label htmlFor="shift-notes">Bất thường / chênh lệch (nếu có)</label><input id="shift-notes" list="shift-note-options" maxLength={5000} placeholder="Chọn nội dung cũ hoặc gõ nội dung mới" value={input.notes} onChange={e => update('notes',e.target.value)}/><datalist id="shift-note-options">{noteOptions.map(value => <option key={value} value={value}/>)}</datalist><small>Gợi ý từ các báo cáo đã tải của PGD đang chọn. Nội dung mới được lưu khi lưu báo cáo.</small></div>
        </div>
        {renderPhotos(['door'])}</div>
      </fieldset>
      {error && <p className="mg-field-error" role="alert">{error}</p>}
      {!readonly && <div className="shift-actions">{!record && <button type="button" className="mg-button" disabled={busy} onClick={sample}>Điền mẫu Hà Đông 21/10/2026</button>}<button type="submit" className="mg-button" disabled={busy}><Save size={16}/>{busy ? 'Đang lưu…' : 'Lưu nháp'}</button><button type="button" className="mg-button mg-button-primary" disabled={busy} onClick={() => void save(true)}><CheckCircle2 size={16}/>Chốt báo cáo</button></div>}
    </form>}
    <div className="mg-data-panel shift-history"><h2>Báo cáo đã lưu</h2><p>100 báo cáo gần nhất trong phạm vi PGD đang chọn. Mỗi PGD có một báo cáo mỗi ngày.</p>{listError ? <p role="alert">{listError}</p> : loading ? <p role="status">Đang tải báo cáo…</p> : !rows.length ? <p>Chưa có báo cáo cuối ca.</p> : <div className="shift-table-scroll"><table><thead><tr><th>Ngày / PGD</th><th>Nhân sự trực ca</th><th>Xe / Pin</th><th>Tiền mặt</th><th>Trạng thái</th><th></th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td><strong>{row.payload.date.split('-').reverse().join('/')}</strong><br/>{row.store_name}</td><td>{row.payload.staff}</td><td>{row.payload.vehicles} xe / {row.payload.batteries} pin</td><td>{money(row.payload.cash)}</td><td>{row.status === 'submitted' ? 'Đã chốt' : 'Bản nháp'}<br/><small>{row.created_by_name}</small></td><td><button type="button" className="mg-button" disabled={busy} onClick={() => open(row)}>Mở báo cáo</button></td></tr>)}</tbody></table></div>}</div>
  </div></section>;
}


