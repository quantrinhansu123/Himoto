'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Save, CheckCircle2, ClipboardList, RefreshCw } from 'lucide-react';
import { useManagement } from './ManagementProvider';
import { useReloadAction } from './ReloadButton';
import { abortAny, abortTimeout } from '@/lib/abort-signal';
import { vietnamDate } from '@/lib/management/duty-roster';
import { shiftApi as api,UnconfirmedSaveError,uploadShiftEvidence,type PendingShiftFile,type ShiftUpload } from '@/lib/management/shift-report-client';
import { ShiftEvidence } from './ShiftEvidence';
import { ShiftAuditPanel } from './ShiftAuditPanel';
import type { ShiftMedia } from '@/lib/management/shift-audits';
import { emptyShiftSummary, shiftVehicleTotal, parseShiftInput, SHIFT_SUMMARY_FIELDS, type ShiftInput, type ShiftReport } from '@/lib/management/shift-reports';
import type { ShiftAutofillResult, ShiftAutofillSection } from '@/lib/management/shift-autofill';
import {blankOwnershipReport,validateOwnershipSubmission} from '@/lib/management/ownership-report';
import {OwnershipReportFields} from './OwnershipReportFields';
import {ShiftTelegramStatus} from './ShiftTelegramStatus';
import {ShiftInventoryCheck} from './ShiftInventoryCheck';

const blank = (store = 0): ShiftInput => ({ store_id: store, date: vietnamDate(), staff: '', vehicles: 0, batteries: 0, charged: 0, rented_batteries: 0, transfers: 0, cash: 0, personal: 0, company: 0, electricity_off: false, notes: '', summary: emptyShiftSummary(), daily_vehicles: 0, monthly_vehicles: 0, other_vehicles: 0 });

const money = (value: number) => new Intl.NumberFormat('vi-VN').format(value) + ' đồng';
const REPORT_TABS = [
  ['information', 'Thông tin'],
  ['inventory', 'Kiểm kê xe / pin'], ['summary', 'Hợp đồng & thu chi'],
  ['accounts', 'Tiền các tài khoản'], ['safety', 'An toàn cuối ca'],
  ['ownership','Thuê sở hữu & Telegram'],
] as const;
type ReportTab = typeof REPORT_TABS[number][0];
const INVENTORY_TABS = [['vehicles','Tổng kết xe'],['batteries','Pin cửa hàng'],['transfers','Xe điều chuyển']] as const;
type InventoryTab = typeof INVENTORY_TABS[number][0];
type SavedReport = Pick<ShiftReport,'id'|'revision'|'status'|'photos'|'media'|'legacy_photos'>;

type SavePlan = {
  input: ShiftInput; submit: boolean; current: SavedReport | null; draftSaved: boolean;
  draftKey: string; submitKey: string;
  photos: ShiftUpload[];
};
export function ShiftReportsPage() {
  const [tab, setTab] = useState<ReportTab>('information');
  const [inventoryTab, setInventoryTab] = useState<InventoryTab>('vehicles');
  const { dataset, selectedStore, can, notify, error: directoryError } = useManagement();
  const [rows, setRows] = useState<ShiftReport[]>([]), [loading, setLoading] = useState(true), [retry, setRetry] = useState(0);
  useReloadAction(useCallback(() => setRetry(n => n + 1), []));
  const [editing, setEditing] = useState(false), [input, setInput] = useState<ShiftInput>(() => blank());
  const [showList, setShowList] = useState(true);
  const [record, setRecord] = useState<SavedReport | null>(null);
  const [files, setFiles] = useState<Record<string,PendingShiftFile>>({});
  const [workflow,setWorkflow]=useState<'pgd'|'audit'>('pgd'),[auditTarget,setAuditTarget]=useState<ShiftReport|null>(null);
  const [auditOpened,setAuditOpened]=useState(false);
  const [historyDate,setHistoryDate]=useState(''),[historyStatus,setHistoryStatus]=useState('all');
  const pendingDelete=useRef<{file:ShiftMedia;key:string;revision:number}|null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [listError, setListError] = useState('');
  const lock = useRef(false);
  const pendingSave = useRef<SavePlan | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [autofilled, setAutofilled] = useState<Partial<Record<ShiftAutofillSection, ShiftAutofillResult>>>({});
  const fillController = useRef<AbortController | null>(null);
  const autoStarted=useRef(new Set<string>());
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
    const query=new URLSearchParams({...selectedStore!=='all'?{store_id:selectedStore}:{},...historyDate?{date:historyDate}:{}});
    api<ShiftReport[]>(`/api/auth/shift-reports?${query}`, { signal: controller.signal })
      .then(data => { if (!Array.isArray(data)) throw new Error('Không tải được danh sách báo cáo. Vui lòng thử lại.'); if (!controller.signal.aborted) setRows(data); }).catch(e => { if (!controller.signal.aborted) setListError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });

    return () => controller.abort();
  }, [selectedStore,retry,historyDate]);
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
    if (dirty.current && !window.confirm('Có thay đổi chưa lưu. Bỏ thay đổi để mở báo cáo khác?')) return false;
    dirty.current = false; setInput(row ? { ...row.payload, ...(row.status === 'draft' ? { rented_batteries: row.payload.rented_batteries ?? 0, daily_vehicles: row.payload.daily_vehicles ?? 0, monthly_vehicles: row.payload.monthly_vehicles ?? 0, other_vehicles: row.payload.other_vehicles ?? 0 } : {}), ...(row.status === 'draft' && !row.payload.summary ? { summary: emptyShiftSummary() } : {}) } : blank(selectedStore === 'all' ? 0 : Number(selectedStore)));
    if(!row&&stores.find(s=>s.id===Number(selectedStore))?.kind==='lease_to_own')setInput(current=>({...current,ownership_report:blankOwnershipReport()}));
    autoStarted.current.clear();pendingDelete.current=null;setAuditTarget(row?.status==='submitted'?row:null);setAuditOpened(false);setWorkflow('pgd');
    pendingSave.current = null; setUnconfirmed(false);
    setRecord(row || null); setFiles({}); setError(''); setEditing(true); setShowList(false); setTab('information'); setInventoryTab('vehicles'); setAutofilled({});
    return true;

  }
  function update<K extends keyof ShiftInput>(key: K, value: ShiftInput[K]) { dirty.current = true; if(key==='store_id'||key==='date')autoStarted.current.clear();setInput(current => ({ ...current, [key]: value,
    ...((key==='store_id'||key==='date')?{summary:emptyShiftSummary(),ownership_report:current.ownership_report||key==='store_id'&&stores.find(s=>s.id===value)?.kind==='lease_to_own'?blankOwnershipReport():undefined}:{}),
  })); }
  async function autofill(section: ShiftAutofillSection,silent=false) {
    if (lock.current || readonly || unconfirmed) return;
    if (!input.store_id || !input.date) { setTab('information'); setError('Chọn PGD và ngày báo cáo ở tab Thông tin trước khi tự điền.'); return; }
    const controller = new AbortController(); fillController.current = controller;
    const store = input.store_id, date = input.date;
    lock.current = true; setBusy(true); setError('');
    try {
      const params = new URLSearchParams({ store_id: String(store), date, section });
      const response = await fetch(`/api/auth/shift-reports/autofill?${params}`, { cache: 'no-store', credentials: 'same-origin', signal: abortAny([controller.signal, abortTimeout(60_000)]) });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.data) throw new Error(body?.message || 'Không tải được số liệu từ DB. Các giá trị đang nhập được giữ nguyên.');
      const result = body.data as ShiftAutofillResult;
      if (controller.signal.aborted) return;
      if (result.store_id !== store || result.date !== date || result.section !== section) throw new Error('Dữ liệu trả về không đúng PGD/ngày đang chọn.');
      setInput(current => {
        if(current.store_id!==store||current.date!==date)return current;
        const ownership=result.values.ownership_report;
        if(ownership&&current.ownership_report){for(const key of current.ownership_report.manual)ownership.values[key]=current.ownership_report.values[key];ownership.manual=[...current.ownership_report.manual];}
        return {...current,...result.values};
      });
      if (Object.keys(result.values).length) dirty.current = true;
      setAutofilled(current => ({ ...current, [section]: result }));
      if(!silent)notify(Object.keys(result.values).length ? 'Đã tự điền dữ liệu. Kiểm tra số liệu trước khi lưu báo cáo.' : result.inventory ? 'Đã tải đối chiếu. Giữ nguyên số kiểm kê ngày cũ.' : 'Chưa có dữ liệu phù hợp để tự điền. Xem thông báo tại tab.');
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Không lấy được dữ liệu.'); }
    finally { lock.current = false; if (!controller.signal.aborted) setBusy(false); }
  }
  const autoFillAction=useRef(autofill);autoFillAction.current=autofill;
  const ownershipEnabled=Boolean(input.ownership_report);
  useEffect(()=>{
    if(!editing||readonly||record?.id||!input.store_id||!input.date||unconfirmed)return;
    const sections:ShiftAutofillSection[]=['summary',...(ownershipEnabled?['ownership' as const]:[])];
    const pending=sections.filter(section=>!autoStarted.current.has(`${input.store_id}:${input.date}:${section}`));
    for(const section of pending)autoStarted.current.add(`${input.store_id}:${input.date}:${section}`);
    void(async()=>{for(const section of pending)await autoFillAction.current(section,true);})();
  },[editing,readonly,record?.id,input.store_id,input.date,ownershipEnabled,unconfirmed]);
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
    if(pendingDelete.current){await removeEvidence(pendingDelete.current.file);return;}
    setError('');
    if (!pendingSave.current) {
      try {
        parseShiftInput(input);
        if(submit&&input.ownership_report){try{validateOwnershipSubmission(input.ownership_report);}catch(e){setTab('ownership');throw e;}}
        if (submit && !input.electricity_off) { setTab('safety'); throw new Error('Xác nhận đã tắt thiết bị điện trước khi chốt.'); }

      } catch (e) { setError((e as Error).message); return; }
      if (submit && !window.confirm(input.ownership_report?'Chốt và gửi báo cáo thuê sở hữu qua Telegram? Báo cáo và ảnh sẽ được khóa.':'Chốt báo cáo cuối ca? Báo cáo và ảnh sẽ được khóa sau khi chốt.')) return;
      pendingSave.current = { input, submit, current: record, draftSaved: false, draftKey: crypto.randomUUID(), submitKey: crypto.randomUUID(),
        photos: Object.entries(files).map(([key,item]) => ({ slot:item.category, file:item.file, key, saved: false })) };
    }
    const plan = pendingSave.current;
    dirty.current = true;
    lock.current = true; setBusy(true);
    try {
      if (!plan.draftSaved) {
        const result = await api<{id:number;revision:number}>('/api/auth/shift-reports', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-shift-request-id': plan.draftKey }, body: JSON.stringify({ id: plan.current?.id, revision: plan.current?.revision, payload: plan.input, status: 'draft' }) });
        plan.current = { ...result, status: 'draft', photos: plan.current?.photos || [],media:plan.current?.media||[],legacy_photos:plan.current?.legacy_photos||[] }; plan.draftSaved = true; setRecord(plan.current);
      }
      for (const item of plan.photos) {
        if (item.saved) continue;
        const uploaded=await uploadShiftEvidence(plan.current!.id,plan.current!.revision,'pgd',item);
        plan.current = { ...plan.current!, revision: uploaded.revision, media:[...(plan.current!.media||[]),uploaded.media],photos: Array.from(new Set([...plan.current!.photos,...(uploaded.media.mime_type.startsWith('image/')?[item.slot]:[])])) }; item.saved = true; setRecord(plan.current);
        setFiles(previous => { const next = { ...previous }; delete next[item.key]; return next; });
      }
      if (plan.submit) {
        const completed = await api<{id:number;revision:number;ownership_report?:ShiftInput['ownership_report']}>('/api/auth/shift-reports', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-shift-request-id': plan.submitKey }, body: JSON.stringify({ id: plan.current!.id, revision: plan.current!.revision, payload: plan.input, status: 'submitted' }) });
        if(completed.ownership_report)setInput(current=>({...current,ownership_report:completed.ownership_report}));
        plan.current = { ...plan.current!, ...completed, status: 'submitted' }; setRecord(plan.current);
        setAuditTarget({...plan.current,payload:plan.input,store_name:stores.find(s=>s.id===plan.input.store_id)?.name||'PGD',created_by_name:'PGD',updated_at:new Date().toISOString()});
      }
      pendingSave.current = null; setUnconfirmed(false);
      dirty.current = false; notify(plan.submit ? 'Đã chốt báo cáo cuối ca.' : 'Đã lưu nháp báo cáo và ảnh.');
      if (plan.submit&&!plan.input.ownership_report) setShowList(true);
    } catch (e) {
      const uncertain = e instanceof UnconfirmedSaveError;
      if (!uncertain) pendingSave.current = null;
      setUnconfirmed(uncertain);
      setError((e as Error).message + (uncertain ? ' Bấm “Thử lại thao tác lưu” để tiếp tục. Dữ liệu và ảnh đang được giữ nguyên.' : ' Các phần đã lưu được giữ lại; kiểm tra trước khi thử lại.'));
    }
    finally { lock.current = false; setBusy(false); setRetry(n => n + 1); }
  }
  async function removeEvidence(file:ShiftMedia){
    if(!record||lock.current)return;
    if(!pendingDelete.current&&!window.confirm('Xóa minh chứng kiểm kê này?'))return;
    pendingDelete.current??={file,key:crypto.randomUUID(),revision:record.revision};
    lock.current=true;setBusy(true);dirty.current=true;setError('');
    try{
      const item=pendingDelete.current;
      const saved=await api<{revision:number}>(file.url,{method:'DELETE',headers:{'x-shift-request-id':item.key,'x-report-revision':String(item.revision),'x-shift-category':file.category,'x-shift-stage':'pgd'}});
      const media=(record.media||[]).filter(m=>m.id!==file.id);
      setRecord({...record,revision:saved.revision,media,photos:Array.from(new Set([...(record.legacy_photos||[]),...media.filter(m=>m.stage==='pgd'&&m.mime_type.startsWith('image/')).map(m=>m.category)]))});
      pendingDelete.current=null;setUnconfirmed(false);
    }catch(e){const unknown=e instanceof UnconfirmedSaveError;if(!unknown)pendingDelete.current=null;setUnconfirmed(unknown);setError((e as Error).message);}
    finally{lock.current=false;setBusy(false);setRetry(n=>n+1);}
  }
  const numeric = (key: 'vehicles'|'batteries'|'charged'|'rented_batteries'|'transfers'|'cash'|'personal'|'company'|'daily_vehicles'|'monthly_vehicles'|'other_vehicles', label: string, currency = false) => <div className="mg-field"><label htmlFor={'shift-'+key}>{label}</label><input id={'shift-'+key} type="number" min="0" max={currency ? 1e12 : 100000} step="1" required={!(['daily_vehicles','monthly_vehicles','other_vehicles'].includes(key))} value={input[key] === undefined || Number.isNaN(input[key]) ? '' : input[key]} onChange={e => update(key,e.target.value === '' ? (['daily_vehicles','monthly_vehicles','other_vehicles'].includes(key)?undefined:NaN) : Number(e.target.value))}/>{currency && Number.isFinite(input[key]) && <small>{money(input[key]!)}</small>}</div>;
  const legacyMedia:ShiftMedia[]=(record?.legacy_photos||[]).map(slot=>({id:'legacy:'+slot,category:slot,stage:'pgd',mime_type:'image/jpeg',filename:'Ảnh đã lưu trước đây',url:`/api/auth/shift-reports/${record!.id}/photos/${slot}`}));
  const renderPhotos = (slots: readonly string[]) => <ShiftEvidence slots={slots} media={[...legacyMedia,...(record?.media||[]).filter(m=>m.stage==='pgd')]} pending={files} readonly={readonly} disabled={busy||unconfirmed} onFiles={value=>{dirty.current=true;setFiles(value);}} onDelete={file=>void removeEvidence(file)}/>;
  const visibleRows=rows.filter(row=>historyStatus==='all'||historyStatus==='draft'&&row.status==='draft'||historyStatus==='pending'&&row.status==='submitted'&&row.audit?.status!=='confirmed'||historyStatus==='confirmed'&&row.audit?.status==='confirmed'||historyStatus==='explained'&&row.audit?.result==='explained');
  return <section className="mg-page"><div className="mg-page-content shift-reports">
    <div className="mg-page-heading"><div><div className="mg-eyebrow">VẬN HÀNH PGD</div><h1>Báo cáo cuối ca</h1><p>Kiểm kê xe, pin, tiền và xác nhận an toàn trước khi kết thúc ca.</p></div><div className="mg-heading-actions"><button className="mg-button" disabled={busy || loading} onClick={() => setRetry(n => n+1)}><RefreshCw size={16}/>Làm mới</button>{writable && <button className="mg-button mg-button-primary" disabled={busy || unconfirmed || !stores.length} onClick={() => open()}><Plus size={16}/>Tạo báo cáo</button>}</div></div>
    {directoryError && <p role="alert">{directoryError}</p>}
    <div className="shift-view-navigation" aria-label="Danh sách và chi tiết báo cáo">
      <button type="button" className={'mg-button'+(showList ? ' mg-button-primary' : '')} aria-pressed={showList} disabled={busy || unconfirmed} onClick={() => setShowList(true)}><ClipboardList size={16}/>Danh sách báo cáo{!loading && !listError ? ` (${rows.length})` : ''}</button>
      {editing && <button type="button" className={'mg-button'+(!showList ? ' mg-button-primary' : '')} aria-pressed={!showList} disabled={busy} onClick={() => setShowList(false)}>{record?.status === 'submitted' ? 'Chi tiết báo cáo' : 'Tiếp tục soạn báo cáo'}</button>}
    </div>
    {editing&&!showList&&auditTarget&&<div className="shift-workflow" role="group" aria-label="Bước báo cáo"><button type="button" className="mg-button" aria-pressed={workflow==='pgd'} onClick={()=>setWorkflow('pgd')}>1. PGD kiểm kê</button><button type="button" className="mg-button" aria-pressed={workflow==='audit'} onClick={()=>{setAuditOpened(true);setWorkflow('audit');}}>2. KTNB đối soát</button></div>}
    {editing && <form hidden={showList||workflow!=='pgd'} className="mg-data-panel shift-form" onInvalidCapture={event => {

      event.preventDefault();
      const field = event.currentTarget.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(':invalid');
      if (!field) return;
      const panel = field.closest('[role="tabpanel"]');
      if (panel?.hasAttribute('data-inventory-section')) {
        setTab('inventory'); setInventoryTab(panel.getAttribute('data-inventory-section') as InventoryTab);
      } else if (panel) setTab(panel.id.replace('shift-panel-', '') as ReportTab);
      field.closest('details')?.setAttribute('open','');

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
        <label className="mg-field">Mẫu báo cáo<select value={input.ownership_report?'ownership':'pgd'} onChange={e=>update('ownership_report',e.target.value==='ownership'?blankOwnershipReport():undefined)}><option value="pgd">Kiểm kê PGD</option><option value="ownership">Thuê sở hữu · Tự thống kê và gửi Telegram khi chốt</option></select></label>
        <div className="mg-form-grid"><div className="mg-field"><label htmlFor="shift-store">PGD</label><select id="shift-store" required value={input.store_id || ''} disabled={!!record} onChange={e => update('store_id',Number(e.target.value))}><option value="">Chọn PGD</option>{stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div><div className="mg-field"><label htmlFor="shift-date">Ngày báo cáo</label><input id="shift-date" type="date" required disabled={!!record} value={input.date} onChange={e => update('date',e.target.value)}/></div><div className="mg-field mg-field-wide"><label htmlFor="shift-staff">Nhân sự trực ca</label><input id="shift-staff" required maxLength={1000} placeholder="Nhập họ tên các nhân sự trực ca" value={input.staff} onChange={e => update('staff',e.target.value)}/></div></div>
        </div>
        <div id="shift-panel-summary" role="tabpanel" aria-labelledby="shift-tab-summary" hidden={tab !== 'summary'} tabIndex={0}><h3>Thống kê hợp đồng và thu chi trong ngày</h3>{renderAutofill('summary')}
        <p>Tự điền theo PGD và ngày báo cáo từ phiếu đã duyệt, sau đó kiểm tra và bổ sung số liệu thực tế.</p>

        {!input.summary ? <p>Báo cáo này chưa ghi nhận thống kê hợp đồng và thu chi.</p> : <div className="shift-summary-grid">{['Hợp đồng', 'Thu thực tế', 'Chi và các khoản liên quan'].map((title, group) => <div key={title} className="shift-summary-card"><h4>{title}</h4>{SHIFT_SUMMARY_FIELDS.slice(group * 4, group * 4 + 4).map(([key, label, currency]) => <div key={key} className="mg-field"><label htmlFor={'shift-summary-' + key}>{label}{currency ? ' (đồng)' : ''}</label><input id={'shift-summary-' + key} type="number" min="0" max={currency ? 1e12 : 100000} step="1" required value={Number.isNaN(input.summary![key]) ? '' : input.summary![key]} onChange={event => update('summary', { ...input.summary!, [key]: event.target.value === '' ? NaN : Number(event.target.value) })}/>{currency && Number.isFinite(input.summary![key]) && <small>{money(input.summary![key])}</small>}</div>)}</div>)}</div>}
        </div><div id="shift-panel-inventory" role="tabpanel" aria-labelledby="shift-tab-inventory" hidden={tab !== 'inventory'} tabIndex={0}>
        <div id="shift-inventory-panel-vehicles" role="tabpanel" aria-labelledby="shift-inventory-tab-vehicles" data-inventory-section="vehicles" hidden={inventoryTab !== 'vehicles'} tabIndex={0}><h3>Tổng kết xe cuối ngày</h3>{renderAutofill('inventory')}
        {autofilled.inventory?.store_id===input.store_id&&autofilled.inventory.date===input.date&&<ShiftInventoryCheck result={autofilled.inventory}/>}
        <p>Số kiểm kê dưới đây là tổng xe còn đang thuê / lưu kho của PGD, không phải số xe phát sinh riêng trong ngày. Kiểm tra thực tế trước khi chốt.</p>
        <div className="mg-form-grid">{numeric('daily_vehicles','Xe còn đang thuê ngày (lũy kế)')}{numeric('monthly_vehicles','Xe còn đang thuê tháng (lũy kế)')}{numeric('vehicles','Xe lưu kho thực tế (xe)')}{numeric('other_vehicles','Xe khác / thuê sở hữu (xe)')}
          <div className="mg-field"><label htmlFor="shift-vehicle-total">Tổng kết xe cuối ngày (xe)</label><input id="shift-vehicle-total" readOnly value={shiftVehicleTotal(input) ?? ''} placeholder="Chưa đủ số liệu"/><small>Tự tính: xe thuê ngày + xe thuê tháng + xe tại PGD + xe giữ bên ngoài + xe khác.</small></div>
        </div>
        {readonly && shiftVehicleTotal(input) === null && <p>Báo cáo cũ chưa ghi nhận đủ số xe cho thuê ngày/tháng để tính tổng.</p>}
        <details><summary>Xe giữ bên ngoài (CA giữ, sửa chữa…)</summary><p>Tách khỏi số xe có mặt tại PGD và cộng vào tổng tài sản xe.</p>{(input.external_vehicles||[]).map((item,index)=><div className="shift-edit-row" key={index}><input aria-label={`PGD biển số xe ngoài ${index+1}`} placeholder="Biển số" value={item.plate} onChange={e=>update('external_vehicles',input.external_vehicles!.map((v,i)=>i===index?{...v,plate:e.target.value}:v))}/><input aria-label={`PGD lý do xe ngoài ${index+1}`} placeholder="Lý do / nơi giữ" value={item.reason} onChange={e=>update('external_vehicles',input.external_vehicles!.map((v,i)=>i===index?{...v,reason:e.target.value}:v))}/>{!readonly&&<button type="button" className="mg-button" onClick={()=>update('external_vehicles',input.external_vehicles!.filter((_,i)=>i!==index))}>Bỏ dòng</button>}</div>)}{!readonly&&<button type="button" className="mg-button" onClick={()=>update('external_vehicles',[...(input.external_vehicles||[]),{plate:'',reason:''}])}>Thêm xe giữ bên ngoài</button>}</details>
        {renderPhotos(['vehicles'])}</div>
        <div id="shift-inventory-panel-batteries" role="tabpanel" aria-labelledby="shift-inventory-tab-batteries" data-inventory-section="batteries" hidden={inventoryTab !== 'batteries'} tabIndex={0}><h3>Pin cửa hàng</h3>{renderAutofill('batteries')}<div className="mg-form-grid shift-battery-grid">{numeric('batteries','Tổng số pin (pin)')}{numeric('charged','Trong đó pin đầy (pin)')}{numeric('rented_batteries','Pin đã cho thuê (pin)')}</div>
        {renderPhotos(['batteries'])}</div>
        <div id="shift-inventory-panel-transfers" role="tabpanel" aria-labelledby="shift-inventory-tab-transfers" data-inventory-section="transfers" hidden={inventoryTab !== 'transfers'} tabIndex={0}><h3>Xe điều chuyển</h3>{renderAutofill('transfers')}<div className="mg-form-grid">{numeric('transfers','Số xe điều chuyển trong ca (xe)')}</div></div>
        </div><div id="shift-panel-accounts" role="tabpanel" aria-labelledby="shift-tab-accounts" hidden={tab !== 'accounts'} tabIndex={0}><h3>Tiền các tài khoản</h3>{renderAutofill('accounts')}<div className="mg-form-grid">{numeric('cash','Tiền mặt thực tế (đồng)',true)}{numeric('personal','TK cá nhân được phân công (đồng)',true)}{numeric('company','TK Công ty (đồng)',true)}</div>
        {renderPhotos(['cash','personal','company'])}</div><div id="shift-panel-safety" role="tabpanel" aria-labelledby="shift-tab-safety" hidden={tab !== 'safety'} tabIndex={0}><h3>An toàn cuối ca</h3>{renderAutofill('safety')}<label className="shift-checkbox"><input type="checkbox" checked={input.electricity_off} onChange={e => update('electricity_off',e.target.checked)}/>Xác nhận đã tắt các thiết bị điện</label>

        <div className="mg-form-grid">
          <div className="mg-field"><label htmlFor="shift-devices">Thiết bị điện đã tắt gồm</label><input id="shift-devices" list="shift-device-options" maxLength={1000} placeholder="Chọn danh sách cũ hoặc nhập thiết bị thực tế" value={input.electrical_devices ?? ''} onChange={e => update('electrical_devices',e.target.value)}/><datalist id="shift-device-options">{deviceOptions.map(value => <option key={value} value={value}/>)}</datalist><small>Ví dụ: đèn, quạt, điều hòa, máy tính, bộ sạc pin. Chọn đúng các thiết bị thực tế đã tắt.</small></div>
          <div className="mg-field"><label htmlFor="shift-notes">Bất thường / chênh lệch (nếu có)</label><input id="shift-notes" list="shift-note-options" maxLength={5000} placeholder="Chọn nội dung cũ hoặc gõ nội dung mới" value={input.notes} onChange={e => update('notes',e.target.value)}/><datalist id="shift-note-options">{noteOptions.map(value => <option key={value} value={value}/>)}</datalist><small>Gợi ý từ các báo cáo đã tải của PGD đang chọn. Nội dung mới được lưu khi lưu báo cáo.</small></div>
        </div>
        {renderPhotos(['door'])}</div>
        <div id="shift-panel-ownership" role="tabpanel" aria-labelledby="shift-tab-ownership" hidden={tab!=='ownership'} tabIndex={0}><h3>Báo cáo cuối ngày thuê sở hữu</h3>{input.ownership_report?<>{renderAutofill('ownership')}<OwnershipReportFields report={input.ownership_report} date={input.date} readonly={readonly} onChange={value=>update('ownership_report',value)}/></>:<p>Chọn mẫu Thuê sở hữu trong tab Thông tin để lập báo cáo theo mẫu và gửi Telegram khi chốt.</p>}</div>
      </fieldset>
      {record?.status==='submitted'&&input.ownership_report&&<ShiftTelegramStatus id={record.id} canSend={writable}/>}
      {error && <p className="mg-field-error" role="alert">{error}</p>}
      {!readonly && <div className="shift-actions">{unconfirmed ? <button type="button" className="mg-button mg-button-primary" disabled={busy} onClick={() => void save(false)}><RefreshCw size={16}/>{busy ? 'Đang xác nhận…' : 'Thử lại thao tác lưu'}</button> : <><button type="submit" className="mg-button" disabled={busy}><Save size={16}/>{busy ? 'Đang lưu…' : 'Lưu nháp'}</button><button type="button" className="mg-button mg-button-primary" disabled={busy} onClick={() => void save(true)}><CheckCircle2 size={16}/>Chốt báo cáo</button></>}</div>}
    </form>}
    {auditTarget&&auditOpened&&<div hidden={showList||workflow!=='audit'}><ShiftAuditPanel key={auditTarget.id} report={auditTarget} onDirty={value=>{dirty.current=value;}} onBusy={value=>{lock.current=value;setBusy(value);}} onSaved={()=>setRetry(n=>n+1)}/></div>}
    {showList&&<div className="mg-data-panel shift-history"><h2>Báo cáo theo cơ sở</h2><p>100 báo cáo gần nhất trong phạm vi PGD đang chọn. Chọn ngày để xem báo cáo cũ. Mỗi PGD có một báo cáo mỗi ngày.</p>
      <div className="shift-history-filters"><div className="mg-field"><label htmlFor="shift-history-date">Xem ngày</label><input id="shift-history-date" type="date" value={historyDate} onChange={e=>setHistoryDate(e.target.value)}/></div><div className="mg-field"><label htmlFor="shift-history-status">Tiến độ báo cáo</label><select id="shift-history-status" value={historyStatus} onChange={e=>setHistoryStatus(e.target.value)}><option value="all">Tất cả</option><option value="draft">PGD đang lập</option><option value="pending">Chờ KTNB xác nhận</option><option value="confirmed">Đã xác nhận KTNB</option><option value="explained">Đã xác nhận có giải trình</option></select></div>{historyDate&&<button type="button" className="mg-button" onClick={()=>setHistoryDate('')}>Xóa ngày lọc</button>}</div>
      {listError?<div role="alert"><p>{listError}</p><button type="button" className="mg-button" onClick={()=>setRetry(n=>n+1)}>Tải lại danh sách</button></div>:loading?<p role="status">Đang tải báo cáo…</p>:!visibleRows.length?<p>Chưa có báo cáo phù hợp.</p>:<div className="shift-table-scroll"><table><thead><tr><th>Ngày / PGD</th><th>Nhân sự trực ca</th><th>Xe tại PGD / Pin</th><th>Tiền mặt</th><th>PGD</th><th>KTNB</th><th>Thao tác</th></tr></thead><tbody>{visibleRows.map(row=><tr key={row.id}><td><strong>{row.payload.date.split('-').reverse().join('/')}</strong><br/>{row.store_name}</td><td>{row.payload.staff}</td><td>{row.payload.vehicles} xe / {row.payload.batteries} pin</td><td>{money(row.payload.cash)}</td><td><span className="shift-badge">{row.status==='submitted'?'Đã chốt':'Bản nháp'}</span><br/><small>{row.created_by_name}</small></td><td><span className={'shift-badge '+(row.audit?.status==='confirmed'?'is-confirmed':'')}>{row.status==='draft'?'Chưa gửi':row.audit?.status==='confirmed'?(row.audit.result==='matched'?'Đã xác nhận · Khớp':'Có giải trình'):row.audit?'Đang đối soát':'Chờ đối soát'}</span>{row.audit&&<small>{row.audit.reviewer_name}</small>}</td><td><div className="shift-actions"><button type="button" className="mg-button" disabled={busy||unconfirmed} onClick={()=>open(row)}>Mở báo cáo</button>{row.status==='submitted'&&<button type="button" className="mg-button" disabled={busy||unconfirmed} onClick={()=>{if(open(row)){setAuditOpened(true);setWorkflow('audit');}}}>{can('shift.review')&&row.audit?.status!=='confirmed'?'Đối soát KTNB':'Xem đối soát'}</button>}</div></td></tr>)}</tbody></table></div>}
    </div>}

  </div></section>;
}
