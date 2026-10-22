'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Save, CheckCircle2, ClipboardList, RefreshCw } from 'lucide-react';
import { useManagement } from './ManagementProvider';
import { useReloadAction } from './ReloadButton';
import { vietnamDate } from '@/lib/management/duty-roster';
import { prepareRecordPhoto } from '@/lib/management/record-photos';
import { emptyShiftSummary, shiftVehicleTotal, parseShiftInput, SHIFT_PHOTOS, SHIFT_SUMMARY_FIELDS, type ShiftInput, type ShiftReport } from '@/lib/management/shift-reports';
import type { ShiftAutofillResult, ShiftAutofillSection } from '@/lib/management/shift-autofill';

const blank = (store = 0): ShiftInput => ({ store_id: store, date: vietnamDate(), staff: '', vehicles: 0, batteries: 0, charged: 0, rented_batteries: 0, transfers: 0, cash: 0, personal: 0, company: 0, electricity_off: false, notes: '', summary: emptyShiftSummary(), daily_vehicles: 0, monthly_vehicles: 0 });
const money = (value: number) => new Intl.NumberFormat('vi-VN').format(value) + ' đồng';
const REPORT_TABS = [
  ['information', 'Thông tin'],
  ['inventory', 'Kiểm kê xe / pin'], ['summary', 'Hợp đồng & thu chi'],
  ['accounts', 'Tiền các tài khoản'], ['safety', 'An toàn cuối ca'],
] as const;
type ReportTab = typeof REPORT_TABS[number][0];
const INVENTORY_TABS = [['vehicles','Tổng kết xe'],['batteries','Pin cửa hàng'],['transfers','Xe điều chuyển']] as const;
type InventoryTab = typeof INVENTORY_TABS[number][0];
type SavedReport = Pick<ShiftReport,'id'|'revision'|'status'|'photos'>;
type SavePlan = {
  input: ShiftInput; submit: boolean; current: SavedReport | null; draftSaved: boolean;
  draftKey: string; submitKey: string;
  photos: { slot: string; file: File; key: string; prepared?: File; saved: boolean }[];
};
class UnconfirmedSaveError extends Error {}
async function api<T>(url: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(url, { ...options, cache: 'no-store', credentials: 'same-origin' }); }
  catch { throw new UnconfirmedSaveError('Mất kết nối, chưa xác nhận được kết quả lưu.'); }
  const result = await response.json().catch(() => null);
  if (response.status >= 500 || (response.ok && !result?.data)) throw new UnconfirmedSaveError('Chưa xác nhận được kết quả lưu.');
  if (!response.ok || !result?.data) throw new Error(result?.message || 'Không xử lý được báo cáo. Vui lòng thử lại.');
  return result.data;
}
export function ShiftReportsPage() {
  const [tab, setTab] = useState<ReportTab>('information');
  const [inventoryTab, setInventoryTab] = useState<InventoryTab>('vehicles');
  const { dataset, selectedStore, can, notify, error: directoryError } = useManagement();
  const [rows, setRows] = useState<ShiftReport[]>([]), [loading, setLoading] = useState(true), [retry, setRetry] = useState(0);
  useReloadAction(useCallback(() => setRetry(n => n + 1), []));
  const [editing, setEditing] = useState(false), [input, setInput] = useState<ShiftInput>(() => blank());
  const [showList, setShowList] = useState(true);
  const [record, setRecord] = useState<SavedReport | null>(null);
  const [files, setFiles] = useState<Record<string,File>>({}), [previews, setPreviews] = useState<Record<string,string>>({});
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [listError, setListError] = useState('');
  const lock = useRef(false);
  const pendingSave = useRef<SavePlan | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [autofilled, setAutofilled] = useState<Partial<Record<ShiftAutofillSection, ShiftAutofillResult>>>({});
  const fillController = useRef<AbortController | null>(null);
  useEffect(() => () => fillController.current?.abort(), []);
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
    const load = async () => {
      const response = await fetch(`/api/auth/shift-reports${selectedStore === 'all' ? '' : '?store_id=' + selectedStore}`, { signal: controller.signal, credentials: 'same-origin', cache: 'no-store' });
      const body = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(body?.data)) throw new Error(body?.message || 'Không tải được danh sách báo cáo. Vui lòng thử lại.');
      if (!controller.signal.aborted) setRows(body.data);
    };
    load().catch(e => { if (!controller.signal.aborted) setListError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [selectedStore,retry]);
  useEffect(() => {
    const urls = Object.fromEntries(Object.entries(files).map(([key,file]) => [key,URL.createObjectURL(file)])); setPreviews(urls);
    return () => Object.values(urls).forEach(URL.revokeObjectURL);
  }, [files]);
  const dirty = useRef(false);
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => {
      if (dirty.current || lock.current) { event.preventDefault(); event.returnValue = ''; }
    };
    const navigate = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
      if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
      const url = new URL(link.href, window.location.href);
      if (!['http:','https:'].includes(url.protocol) || (url.origin === location.origin && url.pathname === location.pathname && url.search === location.search)) return;
      if (lock.current || (dirty.current && !window.confirm('Báo cáo có dữ liệu hoặc ảnh chưa lưu. Rời trang và bỏ các thay đổi?'))) {
        event.preventDefault(); event.stopImmediatePropagation();
      }
    };
    window.addEventListener('beforeunload',leave);
    document.addEventListener('click',navigate,true);
    return () => { window.removeEventListener('beforeunload',leave); document.removeEventListener('click',navigate,true); };
  }, []);
  function open(row?: ShiftReport) {
    if (dirty.current && !window.confirm('Có thay đổi chưa lưu. Bỏ thay đổi để mở báo cáo khác?')) return;
    dirty.current = false; setInput(row ? { ...row.payload, ...(row.status === 'draft' ? { rented_batteries: row.payload.rented_batteries ?? 0, daily_vehicles: row.payload.daily_vehicles ?? 0, monthly_vehicles: row.payload.monthly_vehicles ?? 0 } : {}), ...(row.status === 'draft' && !row.payload.summary ? { summary: emptyShiftSummary() } : {}) } : blank(selectedStore === 'all' ? 0 : Number(selectedStore)));
    pendingSave.current = null; setUnconfirmed(false);
    setRecord(row || null); setFiles({}); setError(''); setEditing(true); setShowList(false); setTab('information'); setInventoryTab('vehicles'); setAutofilled({});
  }
  function update<K extends keyof ShiftInput>(key: K, value: ShiftInput[K]) { dirty.current = true; setInput(current => ({ ...current, [key]: value })); }
  async function autofill(section: ShiftAutofillSection) {
    if (lock.current || readonly || unconfirmed) return;
    if (!input.store_id || !input.date) { setTab('information'); setError('Chọn PGD và ngày báo cáo ở tab Thông tin trước khi tự điền.'); return; }
    const controller = new AbortController(); fillController.current = controller;
    const store = input.store_id, date = input.date;
    lock.current = true; setBusy(true); setError('');
    try {
      const params = new URLSearchParams({ store_id: String(store), date, section });
      const response = await fetch(`/api/auth/shift-reports/autofill?${params}`, { cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60_000)]) });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.data) throw new Error(body?.message || 'Không tải được số liệu từ DB. Các giá trị đang nhập được giữ nguyên.');
      const result = body.data as ShiftAutofillResult;
      if (controller.signal.aborted) return;
      if (result.store_id !== store || result.date !== date || result.section !== section) throw new Error('Dữ liệu trả về không đúng PGD/ngày đang chọn.');
      setInput(current => current.store_id === store && current.date === date ? { ...current, ...result.values } : current);
      if (Object.keys(result.values).length) dirty.current = true;
      setAutofilled(current => ({ ...current, [section]: result }));
      notify(Object.keys(result.values).length ? 'Đã tự điền dữ liệu. Kiểm tra số liệu trước khi lưu báo cáo.' : 'Chưa có dữ liệu phù hợp để tự điền. Xem thông báo tại tab.');
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Không lấy được dữ liệu.'); }
    finally { lock.current = false; if (!controller.signal.aborted) setBusy(false); }
  }
  function renderAutofill(section: ShiftAutofillSection) {
    const result = autofilled[section];
    const visible = result?.store_id === input.store_id && result.date === input.date;
    return <div className="shift-autofill">
      {!readonly && <button type="button" className="mg-button" disabled={busy || unconfirmed} onClick={() => void autofill(section)}><RefreshCw size={16}/>{busy ? 'Đang xử lý…' : 'Tự điền từ DB'}</button>}
      {visible && <div role="status"><small>Cập nhật {new Date(result.read_at).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false })}</small>{result.sources.map(text => <p key={text}>{text}</p>)}{result.notices.length > 0 && <ul>{result.notices.map(text => <li key={text}>{text}</li>)}</ul>}</div>}
    </div>;
  }
  async function save(submit: boolean) {
    if (lock.current) return;
    setError('');
    if (!pendingSave.current) {
      try {
        parseShiftInput(input);
        if (submit && !input.electricity_off) { setTab('safety'); throw new Error('Xác nhận đã tắt thiết bị điện trước khi chốt.'); }
      } catch (e) { setError((e as Error).message); return; }
      if (submit && !window.confirm('Chốt báo cáo cuối ca? Báo cáo và ảnh sẽ được khóa sau khi chốt.')) return;
      pendingSave.current = { input, submit, current: record, draftSaved: false, draftKey: crypto.randomUUID(), submitKey: crypto.randomUUID(),
        photos: Object.entries(files).map(([slot,file]) => ({ slot, file, key: crypto.randomUUID(), saved: false })) };
    }
    const plan = pendingSave.current;
    dirty.current = true;
    lock.current = true; setBusy(true);
    try {
      if (!plan.draftSaved) {
        const result = await api<{id:number;revision:number}>('/api/auth/shift-reports', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-shift-request-id': plan.draftKey }, body: JSON.stringify({ id: plan.current?.id, revision: plan.current?.revision, payload: plan.input, status: 'draft' }) });
        plan.current = { ...result, status: 'draft', photos: plan.current?.photos || [] }; plan.draftSaved = true; setRecord(plan.current);
      }
      for (const item of plan.photos) {
        if (item.saved) continue;
        item.prepared ??= await prepareRecordPhoto(item.file);
        const uploaded = await api<{revision:number}>(`/api/auth/shift-reports/${plan.current!.id}/photos/${item.slot}`, { method: 'PUT', headers: { 'Content-Type': item.prepared.type, 'x-report-revision': String(plan.current!.revision), 'x-shift-request-id': item.key }, body: item.prepared });
        plan.current = { ...plan.current!, revision: uploaded.revision, photos: Array.from(new Set([...plan.current!.photos,item.slot])) }; item.saved = true; setRecord(plan.current);
        setFiles(previous => { const next = { ...previous }; if (next[item.slot] === item.file) delete next[item.slot]; return next; });
      }
      if (plan.submit) {
        const completed = await api<{id:number;revision:number}>('/api/auth/shift-reports', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-shift-request-id': plan.submitKey }, body: JSON.stringify({ id: plan.current!.id, revision: plan.current!.revision, payload: plan.input, status: 'submitted' }) });
        plan.current = { ...plan.current!, ...completed, status: 'submitted' }; setRecord(plan.current);
      }
      pendingSave.current = null; setUnconfirmed(false);
      dirty.current = false; notify(plan.submit ? 'Đã chốt báo cáo cuối ca.' : 'Đã lưu nháp báo cáo và ảnh.');
      if (plan.submit) setShowList(true);
    } catch (e) {
      const uncertain = e instanceof UnconfirmedSaveError;
      if (!uncertain) pendingSave.current = null;
      setUnconfirmed(uncertain);
      setError((e as Error).message + (uncertain ? ' Bấm “Thử lại thao tác lưu” để tiếp tục. Dữ liệu và ảnh đang được giữ nguyên.' : ' Các phần đã lưu được giữ lại; kiểm tra trước khi thử lại.'));
    }
    finally { lock.current = false; setBusy(false); setRetry(n => n + 1); }
  }
  const numeric = (key: 'vehicles'|'batteries'|'charged'|'rented_batteries'|'transfers'|'cash'|'personal'|'company'|'daily_vehicles'|'monthly_vehicles', label: string, currency = false) => <div className="mg-field"><label htmlFor={'shift-'+key}>{label}</label><input id={'shift-'+key} type="number" min="0" max={currency ? 1e12 : 100000} step="1" required value={input[key] === undefined || Number.isNaN(input[key]) ? '' : input[key]} onChange={e => update(key,e.target.value === '' ? NaN : Number(e.target.value))}/>{currency && Number.isFinite(input[key]) && <small>{money(input[key]!)}</small>}</div>;
  const renderPhotos = (slots: readonly string[], visible: boolean) => <>
      <h3>Ảnh đính kèm</h3><p>Mỗi mục một ảnh JPEG, PNG hoặc WebP; ảnh lớn được thu nhỏ khi lưu.</p>
      <div className="shift-photo-grid">{SHIFT_PHOTOS.filter(([slot]) => slots.includes(slot)).map(([slot,label]) => <div key={slot} className="shift-photo"><strong>{label}</strong>{visible && (previews[slot] || record?.photos.includes(slot)) ? <a href={previews[slot] || `/api/auth/shift-reports/${record!.id}/photos/${slot}`} target="_blank" rel="noreferrer"><img loading="lazy" decoding="async" width={360} height={160} src={previews[slot] || `/api/auth/shift-reports/${record!.id}/photos/${slot}?v=${record!.revision}`} alt={label}/></a> : <div className="shift-photo-empty">Chưa có ảnh</div>}{!readonly && <input type="file" accept="image/jpeg,image/png,image/webp" aria-label={label} disabled={busy} onChange={e => { const file = e.target.files?.[0]; if (file) { dirty.current = true; setFiles(previous => ({ ...previous,[slot]:file })); } e.target.value=''; }}/>}<small>{files[slot] ? 'Ảnh mới · Chưa lưu' : record?.photos.includes(slot) ? 'Đã lưu ảnh' : 'Không bắt buộc'}</small></div>)}</div>
  </>;
  return <section className="mg-page"><div className="mg-page-content shift-reports">
    <div className="mg-page-heading"><div><div className="mg-eyebrow">VẬN HÀNH PGD</div><h1>Báo cáo cuối ca</h1><p>Kiểm kê xe, pin, tiền và xác nhận an toàn trước khi kết thúc ca.</p></div><div className="mg-heading-actions"><button className="mg-button" disabled={busy || loading} onClick={() => setRetry(n => n+1)}><RefreshCw size={16}/>Làm mới</button>{writable && <button className="mg-button mg-button-primary" disabled={busy || unconfirmed} onClick={() => open()}><Plus size={16}/>Tạo báo cáo</button>}</div></div>
    {directoryError && <p role="alert">{directoryError}</p>}
    <div className="shift-view-navigation" aria-label="Danh sách và chi tiết báo cáo">
      <button type="button" className={'mg-button'+(showList ? ' mg-button-primary' : '')} aria-pressed={showList} disabled={busy || unconfirmed} onClick={() => setShowList(true)}><ClipboardList size={16}/>Danh sách báo cáo{!loading && !listError ? ` (${rows.length})` : ''}</button>
      {editing && <button type="button" className={'mg-button'+(!showList ? ' mg-button-primary' : '')} aria-pressed={!showList} disabled={busy} onClick={() => setShowList(false)}>{record?.status === 'submitted' ? 'Chi tiết báo cáo' : 'Tiếp tục soạn báo cáo'}</button>}
    </div>
    {editing && !showList && <form className="mg-data-panel shift-form" onInvalidCapture={event => {
      event.preventDefault();
      const field = event.currentTarget.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(':invalid');
      if (!field) return;
      const panel = field.closest('[role="tabpanel"]');
      if (panel?.hasAttribute('data-inventory-section')) {
        setTab('inventory'); setInventoryTab(panel.getAttribute('data-inventory-section') as InventoryTab);
      } else if (panel) setTab(panel.id.replace('shift-panel-', '') as ReportTab);
      setError(field.validationMessage);
      requestAnimationFrame(() => field.focus());
    }} onSubmit={e => { e.preventDefault(); void save(false); }}>
      <div className="shift-form-title"><ClipboardList size={22}/><div><h2>BÁO CÁO KIỂM KÊ PGD{input.date ? ' - NGÀY '+input.date.split('-').reverse().join('/') : ''}</h2><p>{record?.status === 'submitted' ? 'Đã chốt · Chỉ xem' : 'Bản nháp · Ảnh đính kèm không bắt buộc'}</p></div></div>
      <div className="shift-tabs" role="tablist" aria-label="Các phần báo cáo cuối ca">{REPORT_TABS.map(([key,label], index) => <button key={key} id={'shift-tab-'+key} type="button" role="tab" aria-selected={tab === key} aria-controls={'shift-panel-'+key} tabIndex={tab === key ? 0 : -1} onClick={() => setTab(key)} onKeyDown={event => {
        const next = event.key === 'ArrowRight' ? (index+1)%REPORT_TABS.length : event.key === 'ArrowLeft' ? (index+REPORT_TABS.length-1)%REPORT_TABS.length : event.key === 'Home' ? 0 : event.key === 'End' ? REPORT_TABS.length-1 : -1;
        if (next >= 0) { event.preventDefault(); setTab(REPORT_TABS[next][0]); document.getElementById('shift-tab-'+REPORT_TABS[next][0])?.focus(); }
      }}>{label}</button>)}</div>
      {tab === 'inventory' && <div className="shift-tabs shift-inventory-tabs" role="tablist" aria-label="Các mục kiểm kê">{INVENTORY_TABS.map(([key,label],index) => <button key={key} id={'shift-inventory-tab-'+key} type="button" role="tab" aria-selected={inventoryTab === key} aria-controls={'shift-inventory-panel-'+key} tabIndex={inventoryTab === key ? 0 : -1} onClick={() => setInventoryTab(key)} onKeyDown={event => {
        const next = event.key === 'ArrowRight' ? (index+1)%INVENTORY_TABS.length : event.key === 'ArrowLeft' ? (index+INVENTORY_TABS.length-1)%INVENTORY_TABS.length : event.key === 'Home' ? 0 : event.key === 'End' ? INVENTORY_TABS.length-1 : -1;
        if (next >= 0) { event.preventDefault(); setInventoryTab(INVENTORY_TABS[next][0]); document.getElementById('shift-inventory-tab-'+INVENTORY_TABS[next][0])?.focus(); }
      }}>{label}</button>)}</div>}
      <fieldset disabled={busy || readonly || unconfirmed}>
        <div id="shift-panel-information" role="tabpanel" aria-labelledby="shift-tab-information" hidden={tab !== 'information'} tabIndex={0}>
        <h3>Thông tin chung</h3>{renderAutofill('information')}<p>PGD, ngày báo cáo và nhân sự trực ca dùng chung cho tất cả các tab báo cáo.</p>
        <div className="mg-form-grid"><div className="mg-field"><label htmlFor="shift-store">PGD</label><select id="shift-store" required value={input.store_id || ''} disabled={!!record} onChange={e => update('store_id',Number(e.target.value))}><option value="">Chọn PGD</option>{stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div><div className="mg-field"><label htmlFor="shift-date">Ngày báo cáo</label><input id="shift-date" type="date" required disabled={!!record} value={input.date} onChange={e => update('date',e.target.value)}/></div><div className="mg-field mg-field-wide"><label htmlFor="shift-staff">Nhân sự trực ca</label><input id="shift-staff" required maxLength={1000} placeholder="Nhập họ tên các nhân sự trực ca" value={input.staff} onChange={e => update('staff',e.target.value)}/></div></div>
        </div>
        <div id="shift-panel-summary" role="tabpanel" aria-labelledby="shift-tab-summary" hidden={tab !== 'summary'} tabIndex={0}><h3>Thống kê hợp đồng và thu chi trong ngày</h3>{renderAutofill('summary')}
        <p>Tự điền theo PGD và ngày báo cáo từ phiếu đã duyệt, sau đó kiểm tra và bổ sung số liệu thực tế.</p>
        {!input.summary ? <p>Báo cáo này chưa ghi nhận thống kê hợp đồng và thu chi.</p> : <div className="shift-summary-grid">{['Hợp đồng', 'Thu thực tế', 'Chi và các khoản liên quan'].map((title, group) => <div key={title} className="shift-summary-card"><h4>{title}</h4>{SHIFT_SUMMARY_FIELDS.slice(group * 4, group * 4 + 4).map(([key, label, currency]) => <div key={key} className="mg-field"><label htmlFor={'shift-summary-' + key}>{label}{currency ? ' (đồng)' : ''}</label><input id={'shift-summary-' + key} type="number" min="0" max={currency ? 1e12 : 100000} step="1" required value={Number.isNaN(input.summary![key]) ? '' : input.summary![key]} onChange={event => update('summary', { ...input.summary!, [key]: event.target.value === '' ? NaN : Number(event.target.value) })}/>{currency && Number.isFinite(input.summary![key]) && <small>{money(input.summary![key])}</small>}</div>)}</div>)}</div>}
        </div><div id="shift-panel-inventory" role="tabpanel" aria-labelledby="shift-tab-inventory" hidden={tab !== 'inventory'} tabIndex={0}>
        <div id="shift-inventory-panel-vehicles" role="tabpanel" aria-labelledby="shift-inventory-tab-vehicles" data-inventory-section="vehicles" hidden={inventoryTab !== 'vehicles'} tabIndex={0}><h3>Tổng kết xe cuối ngày</h3>{renderAutofill('inventory')}
        <div className="mg-form-grid">{numeric('daily_vehicles','Xe cho thuê ngày (xe)')}{numeric('monthly_vehicles','Xe cho thuê tháng (xe)')}{numeric('vehicles','Xe lưu kho thực tế (xe)')}
          <div className="mg-field"><label htmlFor="shift-vehicle-total">Tổng kết xe cuối ngày (xe)</label><input id="shift-vehicle-total" readOnly value={shiftVehicleTotal(input) ?? ''} placeholder="Chưa đủ số liệu"/><small>Tự tính: xe cho thuê ngày + xe cho thuê tháng + xe lưu kho.</small></div>
        </div>
        {readonly && shiftVehicleTotal(input) === null && <p>Báo cáo cũ chưa ghi nhận đủ số xe cho thuê ngày/tháng để tính tổng.</p>}
        {renderPhotos(['vehicles'], tab === 'inventory' && inventoryTab === 'vehicles')}</div>
        <div id="shift-inventory-panel-batteries" role="tabpanel" aria-labelledby="shift-inventory-tab-batteries" data-inventory-section="batteries" hidden={inventoryTab !== 'batteries'} tabIndex={0}><h3>Pin cửa hàng</h3>{renderAutofill('batteries')}<div className="mg-form-grid shift-battery-grid">{numeric('batteries','Tổng số pin (pin)')}{numeric('charged','Trong đó pin đầy (pin)')}{numeric('rented_batteries','Pin đã cho thuê (pin)')}</div>
        {renderPhotos(['batteries'], tab === 'inventory' && inventoryTab === 'batteries')}</div>
        <div id="shift-inventory-panel-transfers" role="tabpanel" aria-labelledby="shift-inventory-tab-transfers" data-inventory-section="transfers" hidden={inventoryTab !== 'transfers'} tabIndex={0}><h3>Xe điều chuyển</h3>{renderAutofill('transfers')}<div className="mg-form-grid">{numeric('transfers','Số xe điều chuyển trong ca (xe)')}</div></div>
        </div><div id="shift-panel-accounts" role="tabpanel" aria-labelledby="shift-tab-accounts" hidden={tab !== 'accounts'} tabIndex={0}><h3>Tiền các tài khoản</h3>{renderAutofill('accounts')}<div className="mg-form-grid">{numeric('cash','Tiền mặt thực tế (đồng)',true)}{numeric('personal','TK cá nhân được phân công (đồng)',true)}{numeric('company','TK Công ty (đồng)',true)}</div>
        {renderPhotos(['cash','personal','company'], tab === 'accounts')}</div><div id="shift-panel-safety" role="tabpanel" aria-labelledby="shift-tab-safety" hidden={tab !== 'safety'} tabIndex={0}><h3>An toàn cuối ca</h3>{renderAutofill('safety')}<label className="shift-checkbox"><input type="checkbox" checked={input.electricity_off} onChange={e => update('electricity_off',e.target.checked)}/>Xác nhận đã tắt các thiết bị điện</label>
        <div className="mg-form-grid">
          <div className="mg-field"><label htmlFor="shift-devices">Thiết bị điện đã tắt gồm</label><input id="shift-devices" list="shift-device-options" maxLength={1000} placeholder="Chọn danh sách cũ hoặc nhập thiết bị thực tế" value={input.electrical_devices ?? ''} onChange={e => update('electrical_devices',e.target.value)}/><datalist id="shift-device-options">{deviceOptions.map(value => <option key={value} value={value}/>)}</datalist><small>Ví dụ: đèn, quạt, điều hòa, máy tính, bộ sạc pin. Chọn đúng các thiết bị thực tế đã tắt.</small></div>
          <div className="mg-field"><label htmlFor="shift-notes">Bất thường / chênh lệch (nếu có)</label><input id="shift-notes" list="shift-note-options" maxLength={5000} placeholder="Chọn nội dung cũ hoặc gõ nội dung mới" value={input.notes} onChange={e => update('notes',e.target.value)}/><datalist id="shift-note-options">{noteOptions.map(value => <option key={value} value={value}/>)}</datalist><small>Gợi ý từ các báo cáo đã tải của PGD đang chọn. Nội dung mới được lưu khi lưu báo cáo.</small></div>
        </div>
        {renderPhotos(['door'], tab === 'safety')}</div>
      </fieldset>
      {error && <p className="mg-field-error" role="alert">{error}</p>}
      {!readonly && <div className="shift-actions">{unconfirmed ? <button type="button" className="mg-button mg-button-primary" disabled={busy} onClick={() => void save(false)}><RefreshCw size={16}/>{busy ? 'Đang xác nhận…' : 'Thử lại thao tác lưu'}</button> : <><button type="submit" className="mg-button" disabled={busy}><Save size={16}/>{busy ? 'Đang lưu…' : 'Lưu nháp'}</button><button type="button" className="mg-button mg-button-primary" disabled={busy} onClick={() => void save(true)}><CheckCircle2 size={16}/>Chốt báo cáo</button></>}</div>}
    </form>}
    {showList && <div className="mg-data-panel shift-history"><h2>Danh sách báo cáo</h2>
      <p>100 báo cáo gần nhất · {selectedStore === 'all' ? 'Tất cả PGD được phân quyền' : stores.find(store => String(store.id) === selectedStore)?.name || 'PGD đang chọn'} · Gồm bản nháp và báo cáo đã chốt.</p>
      {listError && <div role="alert"><p>{listError}</p><button type="button" className="mg-button" onClick={() => setRetry(value => value+1)}>Tải lại danh sách</button></div>}
      <div className="shift-table-scroll"><table><thead><tr><th>Ngày / PGD</th><th>Nhân sự trực ca</th><th>Xe / Pin</th><th>Tiền mặt</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>
        {loading ? <tr><td colSpan={6} role="status">Đang tải danh sách báo cáo…</td></tr> : listError ? <tr><td colSpan={6}>Chưa tải được dữ liệu. Bấm Tải lại danh sách để kiểm tra.</td></tr> : !rows.length ? <tr><td colSpan={6}>Chưa có báo cáo cho PGD đang chọn. Bấm Tạo báo cáo để bắt đầu.</td></tr> : rows.map(row => <tr key={row.id}><td><strong>{row.payload.date.split('-').reverse().join('/')}</strong><br/>{row.store_name}</td><td>{row.payload.staff}</td><td>{row.payload.vehicles} xe / {row.payload.batteries} pin</td><td>{money(row.payload.cash)}</td><td>{row.status === 'submitted' ? 'Đã chốt' : 'Bản nháp'}<br/><small>{row.created_by_name}</small></td><td><button type="button" className="mg-button" disabled={busy || unconfirmed} onClick={() => open(row)}>Mở báo cáo</button></td></tr>)}
      </tbody></table></div>
    </div>}
  </div></section>;
}
