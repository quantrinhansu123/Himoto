'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, Check, LoaderCircle, Trash2, Upload } from 'lucide-react';
import type { VehicleImportInput, VehicleImportMode, VehicleImportResult, VehicleResetPreview } from '@/lib/management/vehicle-import';
import type { CustomerImportStore } from '@/lib/management/customer-import';
import { VEHICLE_IMPORT_LIMIT } from '@/lib/management/vehicle-import';
import { Dialog } from './Dialog';
import { useManagement } from './ManagementProvider';

async function request<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(url, { method, credentials: 'same-origin', headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const envelope = await response.json().catch(() => null);
  if (!response.ok || envelope?.status !== 'success' || !envelope.data) throw new Error(envelope?.message || `Không thực hiện được yêu cầu (HTTP ${response.status}).`);
  return envelope.data as T;
}
function BackupLink({ id }: { id: string }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const busyRef = useRef(false);
  async function download() {
    if (busyRef.current) return; busyRef.current = true; setBusy(true); setError('');
    try {
      const response = await fetch(`/api/auth/vehicles/backups/${id}`, { credentials: 'same-origin', cache: 'no-store' });
      const document = await response.json().catch(() => null);
      if (!response.ok || document?.id !== id || !Array.isArray(document?.payload)) throw new Error('Không tải được bản sao lưu. Kiểm tra phiên đăng nhập và thử lại.');
      const url = URL.createObjectURL(new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' }));
      const link = window.document.createElement('a'); link.href = url; link.download = `HIMOTO-xe-backup-${id}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tải được bản sao lưu.'); }
    finally { busyRef.current = false; setBusy(false); }
  }
  return <><button type="button" className="mg-button" disabled={busy} onClick={() => void download()}><ArrowDownToLine size={16} />Tải bản sao lưu trước thay đổi</button>{error && <p className="mg-field-error" role="alert">{error}</p>}</>;
}

export function VehicleExcelActions({ disabled }: { disabled: boolean }) {
  const { dataset, notify } = useManagement();
  const [action, setAction] = useState<'import' | 'reset' | ''>('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const busyRef = useRef(false);
  const stores: CustomerImportStore[] = (dataset?.stores || []).map(row => ({ id: row.id, name: row.name, code: row.code }));
  async function download() {
    if (busyRef.current) return; busyRef.current = true; setBusy(true); setError('');
    try {
      const { createVehicleTemplate, downloadVehicleExcel } = await import('@/lib/management/vehicle-excel');
      downloadVehicleExcel(await createVehicleTemplate(stores)); notify('Đã tải mẫu Excel xe có cột Màu sắc.');
    } catch { setError('Không tải được mẫu Excel xe. Thử lại.'); }
    finally { busyRef.current = false; setBusy(false); }
  }
  return <>
    <button type="button" className="mg-button" disabled={disabled || busy} onClick={() => void download()}>{busy ? <LoaderCircle size={17} className="mg-spin" /> : <ArrowDownToLine size={17} />}Tải mẫu Excel</button>
    <button type="button" className="mg-button" disabled={disabled} onClick={() => setAction('import')}><Upload size={17} />Nhập / Đồng bộ Excel</button>
    <button type="button" className="mg-button mg-button-danger" disabled={disabled || !dataset?.vehicles.length} onClick={() => setAction('reset')}><Trash2 size={17} />Xóa hết</button>
    {error && <span className="mg-field-error" role="alert">{error}</span>}
    {action === 'import' && <VehicleImportDialog stores={stores} onClose={() => setAction('')} />}
    {action === 'reset' && <VehicleResetDialog onClose={() => setAction('')} />}
  </>;
}

function VehicleImportDialog({ stores, onClose }: { stores: CustomerImportStore[]; onClose: () => void }) {
  const { reload, notify, invalidateData } = useManagement();
  const [inputs, setInputs] = useState<VehicleImportInput[]>([]), [result, setResult] = useState<VehicleImportResult | null>(null);
  const [filename, setFilename] = useState(''), [ignored, setIgnored] = useState<string[]>([]), [legacy, setLegacy] = useState(false);
  const [mapping, setMapping] = useState<Record<string, string>>({}), [mode, setMode] = useState<VehicleImportMode>('sync');
  const [skipUnknownStores, setSkipUnknownStores] = useState(false);
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [accepted, setAccepted] = useState(false), [page, setPage] = useState(1), [issuesOnly, setIssuesOnly] = useState(false);
  const busyRef = useRef(false), summaryRef = useRef<HTMLDivElement>(null);
  const focusSummary = () => requestAnimationFrame(() => summaryRef.current?.focus());
  const invalidate = () => { setResult(null); setAccepted(false); setError(''); setPage(1); };
  const mappedRows = (rows = inputs) => rows.map(row => ({ ...row, values: { ...row.values, store: mapping[row.values.store] || row.values.store } }));
  async function check(rows: VehicleImportInput[], commit: boolean) {
    return request<VehicleImportResult>('/api/auth/vehicles/import', 'POST', { rows, mode, commit, revision: commit ? result?.revision || '' : '', acceptWarnings: commit && accepted, skipUnknownStores });
  }
  async function read(file: File | undefined) {
    if (!file || busyRef.current) return; busyRef.current = true; setBusy('Đang đọc và đối chiếu Excel…'); invalidate(); setInputs([]); setFilename(file.name); setIgnored([]); setMapping({});
    try {
      const { readVehicleExcel } = await import('@/lib/management/vehicle-excel');
      const parsed = await readVehicleExcel(file); setInputs(parsed.rows); setIgnored(parsed.ignoredColumns); setLegacy(parsed.legacy);
      setResult(await check(parsed.rows, false));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không đọc được Excel.'); }
    finally { busyRef.current = false; setBusy(''); focusSummary(); }
  }
  async function submit(commit: boolean) {
    if (busyRef.current || !inputs.length) return; busyRef.current = true; setBusy(commit ? 'Đang sao lưu và đồng bộ xe…' : 'Đang kiểm tra lại…'); setError('');
    try {
      const next = await check(mappedRows(), commit);
      if (commit && (!next.committed || next.total !== inputs.length || next.inserted + next.updated + next.skipped !== inputs.length)) throw new Error('Chưa xác nhận đủ xe đã nhập. Làm mới và kiểm tra lại.');
      setResult(next); setAccepted(false);
      if (commit) { invalidateData(['contracts', 'stores']); await reload(['vehicles']); notify(`Đã đồng bộ ${next.updated} xe và thêm ${next.inserted} xe. Đã sao lưu dữ liệu trước thay đổi.`); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không nhập được xe.'); if (commit) setResult(null); }
    finally { busyRef.current = false; setBusy(''); focusSummary(); }
  }
  async function exportNormalized() {
    if (busyRef.current) return; busyRef.current = true; setBusy('Đang tạo file đúng cột…'); setError('');
    try {
      const { createVehicleTemplate, downloadVehicleExcel } = await import('@/lib/management/vehicle-excel');
      const preview = result || await check(mappedRows(), false);
      if (!result) setResult(preview);
      const rows = preview.rows.filter(row => row.state !== 'skipped').map(row => ({ ...row, values: { ...row.values, store: row.storeId ? String(row.storeId) : row.values.store } }));
      downloadVehicleExcel(await createVehicleTemplate(stores, rows), 'HIMOTO-xe-da-khop-cot.xlsx');
    } catch { setError('Không tạo được file đã khớp cột.'); }
    finally { busyRef.current = false; setBusy(''); }
  }
  const sourceStores = [...new Set(inputs.map(row => row.values.store))].filter(value => value && (legacy || !stores.some(store => [String(store.id), store.name, store.code].includes(value))));
  const defaultStoreLabel = (source: string) => !skipUnknownStores ? 'Chưa xác nhận' : stores.some(store => String(store.id) === source.replace(/^Cơ sở cũ #/, '')) ? 'Dùng mã gốc trong danh sách' : 'Bỏ qua cơ sở ngoài danh sách';
  const shown = result?.rows.filter(row => !issuesOnly || row.errors.length || row.warnings.some(message => !message.startsWith('Giữ ID'))) || [];
  const pages = Math.max(1, Math.ceil(shown.length / 20)), safePage = Math.min(page, pages);
  const hasWarnings = Boolean(result?.rows.some(row => row.warnings.length));
  return <Dialog title="Nhập / Đồng bộ xe từ Excel" subtitle="Đối chiếu biển số, màu sắc và cơ sở trước khi ghi dữ liệu" className="mg-customer-import mg-vehicle-import" onClose={() => { if (!busyRef.current) onClose(); }}>
    <div className="mg-dialog-body">
      <div className="mg-field mg-import-upload"><label htmlFor="vehicle-excel-file">Chọn file Excel xe (.xlsx)</label><input id="vehicle-excel-file" type="file" accept=".xlsx" disabled={Boolean(busy) || result?.committed} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void read(file); }} /><small>Tối đa 5 MB / {VEHICLE_IMPORT_LIMIT} xe. Nhận mẫu mới và cấu trúc lệch tiêu đề đã đối chiếu của Kho xe tổng.</small></div>
      {!result?.committed && <div className="mg-field"><label htmlFor="vehicle-import-mode">Cách nhập</label><select id="vehicle-import-mode" value={mode} disabled={Boolean(busy)} onChange={event => { setMode(event.target.value as VehicleImportMode); invalidate(); }}><option value="sync">Đồng bộ giữ ID và lịch sử (khuyến nghị)</option><option value="replace">Xóa xe cũ và thay toàn bộ từ file</option></select><small>{mode === 'sync' ? 'Xe đã có giữ ID, cơ sở, trạng thái, giá và lịch sử. Cập nhật thông tin mô tả; thêm xe mới. Xe không có trong file vẫn được giữ.' : 'Chỉ được thay toàn bộ khi không có dữ liệu liên quan. Xóa và nhập chạy cùng giao dịch; có lỗi sẽ hủy toàn bộ.'}</small></div>}
      {filename && <p className="mg-import-filename">File: {filename}</p>}
      {!result?.committed && <label className="mg-import-filter"><input type="checkbox" checked={skipUnknownStores} disabled={Boolean(busy)} onChange={event => { setSkipUnknownStores(event.target.checked); invalidate(); }} />Chỉ nhận cơ sở hiện có; bỏ qua dòng ở cơ sở ngoài danh sách. Với file cũ, đối chiếu trực tiếp mã cơ sở.</label>}
      {legacy && <p className="mg-import-warning">Đã khớp cấu trúc file cũ: biển số G, màu sắc Q, năm sản xuất E, cơ sở F. {skipUnknownStores ? 'Đối chiếu trực tiếp mã cơ sở theo lựa chọn trên; bỏ mã ngoài danh sách.' : 'Mã cơ sở cũ phải chọn lại; không tự suy ra.'}</p>}
      {ignored.length > 0 && <details className="mg-import-notes"><summary>Bỏ qua {ignored.length} cột / nhóm cột ngoài mẫu</summary><p>{ignored.join(' · ')}</p></details>}
      {sourceStores.length > 0 && !result?.committed && <details className="mg-import-notes" open><summary>Khớp cơ sở từ file ({sourceStores.length})</summary><p>Chọn cơ sở hiện tại cho xe mới. Xe đã có giữ cơ sở đang sử dụng dù mã trong file cũ khác.</p><div className="mg-vehicle-store-mapping">{sourceStores.map(value => <label className="mg-field" key={value}><span>{value}</span><select aria-label={`Khớp ${value}`} value={mapping[value] || ''} disabled={Boolean(busy)} onChange={event => { setMapping(current => ({ ...current, [value]: event.target.value })); invalidate(); }}><option value="">{defaultStoreLabel(value)}</option>{stores.map(store => <option key={store.id} value={String(store.id)}>{store.name} · {store.id}</option>)}</select></label>)}</div></details>}
      <div ref={summaryRef} tabIndex={-1} className="mg-import-summary" aria-live="polite">
        {busy && <p role="status"><LoaderCircle size={16} className="mg-spin" />{busy}</p>}
        {error && <p className="mg-error-message" role="alert">{error}</p>}
        {result && (result.committed ? <><p className="mg-import-success"><Check size={17} />Đã cập nhật {result.updated} xe, thêm {result.inserted} xe. Bỏ qua {result.skipped} dòng ngoài cơ sở được chọn; giữ {result.retained} xe ngoài phần nhập.</p>{result.backupId && <BackupLink id={result.backupId} />}</> : <>
          <div className="mg-import-counts"><span>Tổng <strong>{result.total}</strong></span><span>Hợp lệ <strong>{result.valid}</strong></span><span>Lỗi <strong>{result.invalid}</strong></span><span>Bỏ qua <strong>{result.skipped}</strong></span><span>Cập nhật <strong>{result.updated}</strong></span><span>Thêm <strong>{result.inserted}</strong></span><span>Chưa có màu <strong>{result.blankColors}</strong></span></div>
          <p>Nhập {result.total - result.skipped} xe sau khi hết lỗi; bỏ qua {result.skipped} dòng ở cơ sở ngoài danh sách theo lựa chọn trên. {mode === 'sync' ? `Giữ ${result.retained} xe ngoài phần nhập.` : `Thay ${result.existing} xe hiện tại.`}</p>
          {result.blocking.map(message => <p key={message} className="mg-error-message" role="alert">{message}</p>)}
          {result.references.length > 0 && <p>Liên kết: {result.references.map(ref => `${ref.table}.${ref.column}: ${ref.count}`).join(' · ')}</p>}
        </>)}
      </div>
      {result && !result.committed && <>
        <label className="mg-import-filter"><input type="checkbox" checked={issuesOnly} onChange={event => { setIssuesOnly(event.target.checked); setPage(1); }} />Chỉ xem dòng lỗi / cần đối chiếu</label>
        <div className="mg-import-table-scroll" role="region" aria-label="Xem trước xe Excel" tabIndex={0}><table className="mg-table mg-import-table"><thead><tr>{['Dòng', 'ID', 'Tên xe', 'Biển số', 'Màu sắc', 'Loại / hãng', 'Năm', 'Số khung', 'Số máy', 'Số km', 'Cơ sở trong file', 'Trạng thái trong file', 'Kết quả'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{shown.slice((safePage - 1) * 20, safePage * 20).map(row => <tr key={row.rowNumber}><td>{row.rowNumber}</td><td>{row.targetId || row.values.id || 'Mới'}</td><td>{row.values.name}</td><td>{row.values.license}</td><td>{row.values.color || '—'}</td><td>{row.values.type} / {row.values.brand}</td><td>{row.values.year}</td><td>{row.values.chassis || '—'}</td><td>{row.values.engine || '—'}</td><td>{row.values.odometer || '—'}</td><td>{row.values.store || '—'}</td><td>{row.values.status}</td><td className="mg-import-result"><strong>{row.state === 'skipped' ? 'Bỏ qua' : row.state === 'invalid' ? 'Lỗi' : row.action === 'update' ? 'Cập nhật' : 'Thêm mới'}</strong>{row.errors.map((text, i) => <p className="mg-field-error" key={`e${i}`}>{text}</p>)}{row.warnings.map((text, i) => <p key={`w${i}`}>{text}</p>)}</td></tr>)}</tbody></table></div>
        <div className="mg-import-pages"><span>{shown.length} dòng · Trang {safePage}/{pages}</span><button type="button" className="mg-button" disabled={safePage === 1} onClick={() => setPage(safePage - 1)}>Trước</button><button type="button" className="mg-button" disabled={safePage === pages} onClick={() => setPage(safePage + 1)}>Sau</button></div>
        {hasWarnings && <label className="mg-import-filter"><input type="checkbox" checked={accepted} disabled={Boolean(busy)} onChange={event => setAccepted(event.target.checked)} />Tôi đã đối chiếu các cảnh báo; màu chưa rõ để trống, các liên kết hiện có được giữ.</label>}
      </>}
    </div>
    <div className="mg-dialog-footer"><button type="button" className="mg-button" disabled={Boolean(busy)} onClick={onClose}>Đóng</button>{!result?.committed && <>
      <button type="button" className="mg-button" disabled={Boolean(busy) || !inputs.length} onClick={() => void exportNormalized()}>Tải file đã khớp cột</button>
      <button type="button" className="mg-button" disabled={Boolean(busy) || !inputs.length} onClick={() => void submit(false)}>Kiểm tra lại</button>
      <button type="button" className="mg-button mg-button-primary" disabled={Boolean(busy) || !result?.valid || result.invalid > 0 || result.blocking.length > 0 || (hasWarnings && !accepted)} onClick={() => void submit(true)}><Upload size={16} />{mode === 'sync' ? 'Đồng bộ' : 'Thay toàn bộ'} {result ? result.total - result.skipped : 0} xe</button>
    </>}</div>
  </Dialog>;
}

function VehicleResetDialog({ onClose }: { onClose: () => void }) {
  const { reload, notify, invalidateData } = useManagement();
  const [preview, setPreview] = useState<VehicleResetPreview | null>(null), [confirmation, setConfirmation] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(true), [backupId, setBackupId] = useState('');
  const busyRef = useRef(true);
  useEffect(() => {
    let active = true;
    request<VehicleResetPreview>('/api/auth/vehicles/reset').then(data => { if (active) setPreview(data); }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Không kiểm tra được liên kết xe.'); }).finally(() => { if (active) { busyRef.current = false; setBusy(false); } });
    return () => { active = false; };
  }, []);
  async function remove() {
    if (busyRef.current || !preview || preview.blocking.length || confirmation !== 'XÓA HẾT XE') return;
    busyRef.current = true; setBusy(true); setError('');
    try {
      const data = await request<{ removed: number; backupId: string }>('/api/auth/vehicles/reset', 'DELETE', { revision: preview.revision, confirmation });
      setBackupId(data.backupId); invalidateData(['contracts', 'stores']); await reload(['vehicles']); notify(`Đã xóa ${data.removed} xe. Bản sao lưu được giữ trong CSDL.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không xóa được xe.'); setPreview(null); }
    finally { busyRef.current = false; setBusy(false); }
  }
  return <Dialog title="Xóa hết dữ liệu xe" subtitle="Áp dụng toàn bộ bảng xe, kể cả xe ngoài bộ lọc đang xem" onClose={() => { if (!busyRef.current) onClose(); }}>
    <div className="mg-dialog-body">
      {busy && <p role="status">Đang kiểm tra / xử lý dữ liệu xe…</p>}{error && <p className="mg-error-message" role="alert">{error}</p>}
      {backupId ? <><p className="mg-import-success">Đã xóa dữ liệu xe.</p><BackupLink id={backupId} /></> : preview && <>
        <p>Tổng số xe sẽ xóa: <strong>{preview.total}</strong>. Hệ thống sao lưu trước khi xóa; không xóa hợp đồng hoặc lịch sử liên quan.</p>
        {preview.blocking.map(text => <p className="mg-error-message" role="alert" key={text}>{text}</p>)}
        {preview.references.length > 0 && <ul>{preview.references.map(ref => <li key={`${ref.table}.${ref.column}`}>{ref.table}.{ref.column}: {ref.count} liên kết</li>)}</ul>}
        {!preview.blocking.length && preview.total > 0 && <label className="mg-field"><span>Nhập XÓA HẾT XE để xác nhận</span><input value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={busy} autoComplete="off" /></label>}
      </>}
    </div><div className="mg-dialog-footer"><button type="button" className="mg-button" disabled={busy} onClick={onClose}>Đóng</button>{!backupId && <button type="button" className="mg-button mg-button-danger" disabled={busy || !preview?.total || Boolean(preview.blocking.length) || confirmation !== 'XÓA HẾT XE'} onClick={() => void remove()}><Trash2 size={16} />Xóa hết xe</button>}</div>
  </Dialog>;
}
