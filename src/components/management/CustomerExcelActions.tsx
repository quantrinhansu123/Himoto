'use client';

import { useRef, useState } from 'react';
import { ArrowDownToLine, Check, LoaderCircle, Upload } from 'lucide-react';
import { CUSTOMER_IMPORT_LIMIT, CustomerImportInput, CustomerImportResult, CustomerImportStore } from '@/lib/management/customer-import';
import { CUSTOMER_STATUSES } from '@/lib/management/config';
import { Dialog } from './Dialog';
import { useManagement } from './ManagementProvider';

async function checkImport(rows: CustomerImportInput[], commit: boolean, allowIncomplete: boolean): Promise<CustomerImportResult> {
  const response = await fetch('/api/auth/customers/import', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ rows, commit, allowIncomplete }) });
  const envelope = await response.json().catch(() => null);
  if (!response.ok || envelope?.status !== 'success' || !Array.isArray(envelope.data?.rows)) throw new Error(envelope?.message || `Không ${commit ? 'nhập' : 'kiểm tra'} được khách hàng (HTTP ${response.status}).`);
  return envelope.data;
}

export function CustomerExcelActions({ disabled }: { disabled: boolean }) {
  const { dataset, notify } = useManagement();
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const downloadBusy = useRef(false);
  const stores: CustomerImportStore[] = (dataset?.stores || []).map(row => ({ id: row.id, name: row.name, code: row.code }));
  async function download() {
    if (downloadBusy.current) return;
    downloadBusy.current = true; setDownloading(true); setDownloadError('');
    try {
      const { createCustomerTemplate, downloadCustomerExcel } = await import('@/lib/management/customer-excel');
      downloadCustomerExcel(await createCustomerTemplate(stores));
      notify('Đã tải mẫu Excel khách hàng.');
    } catch { setDownloadError('Không tải được mẫu Excel. Thử lại.'); }
    finally { downloadBusy.current = false; setDownloading(false); }
  }
  return <>
    <button type="button" className="mg-button" disabled={disabled || downloading} onClick={() => void download()}>{downloading ? <LoaderCircle size={17} className="mg-spin" /> : <ArrowDownToLine size={17} />}Tải mẫu Excel</button>
    <button type="button" className="mg-button" disabled={disabled} onClick={() => setOpen(true)}><Upload size={17} />Nhập Excel</button>
    {downloadError && <span className="mg-field-error" role="alert">{downloadError}</span>}
    {open && <CustomerExcelDialog onClose={() => setOpen(false)} />}
  </>;
}

function CustomerExcelDialog({ onClose }: { onClose: () => void }) {
  const { acceptImportedCustomers } = useManagement();
  const [inputs, setInputs] = useState<CustomerImportInput[]>([]);
  const [result, setResult] = useState<CustomerImportResult | null>(null);
  const [filename, setFilename] = useState('');
  const [busy, setBusy] = useState<'read' | 'check' | 'save' | ''>('');
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'issues'>('all');
  const [page, setPage] = useState(1);
  const [allowIncomplete, setAllowIncomplete] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const focusSummary = () => requestAnimationFrame(() => summaryRef.current?.focus());
  async function readFile(file: File | undefined) {
    if (!file || busyRef.current) return;
    busyRef.current = true; setBusy('read'); setError(''); setResult(null); setInputs([]); setFilename(file.name); setPage(1); setFilter('all');
    try {
      const { readCustomerExcel } = await import('@/lib/management/customer-excel');
      const rows = await readCustomerExcel(file);
      setInputs(rows); setBusy('check'); setResult(await checkImport(rows, false, allowIncomplete));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không đọc được file Excel.'); }
    finally { busyRef.current = false; setBusy(''); focusSummary(); }
  }
  async function submit(commit: boolean) {
    if (busyRef.current || !inputs.length) return;
    busyRef.current = true; setBusy(commit ? 'save' : 'check'); setError('');
    try {
      const rows = commit ? inputs.filter(input => result?.rows.some(row => row.rowNumber === input.rowNumber && row.state === 'valid')) : inputs;
      const next = await checkImport(rows, commit, allowIncomplete);
      if (commit && (!next.committed || next.imported !== rows.length)) throw new Error('Chưa xác nhận đủ khách hàng đã nhập. Kiểm tra lại trước khi thử tiếp.');
      setResult(commit && result ? { ...result, committed: true, imported: next.imported } : next);
      if (commit) await acceptImportedCustomers(next.imported);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không nhập được khách hàng.');
      if (commit) setResult(null); // Require a fresh duplicate check after uncertain outcomes.
    } finally { busyRef.current = false; setBusy(''); focusSummary(); }
  }
  const shown = result?.rows.filter(row => filter === 'all' || row.state !== 'valid') || [];
  const pages = Math.max(1, Math.ceil(shown.length / 20));
  const safePage = Math.min(page, pages);
  return <Dialog title="Nhập khách hàng từ Excel" subtitle="Tải mẫu, điền thông tin và kiểm tra trước khi nhập" className="mg-customer-import" onClose={() => { if (!busyRef.current) onClose(); }}>
    <div className="mg-dialog-body">
      <div className="mg-import-upload mg-field"><label htmlFor="customer-excel-file">Chọn file Excel khách hàng (.xlsx)</label>
        <input id="customer-excel-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={Boolean(busy) || result?.committed} aria-describedby="customer-excel-help" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void readFile(file); }} />
        <small id="customer-excel-help">Tối đa 5 MB và {CUSTOMER_IMPORT_LIMIT.toLocaleString('vi-VN')} khách hàng. Các cột tự khớp theo tiêu đề của mẫu. CCCD và điện thoại phải giữ số 0 đầu.</small>
      </div>
      <label className="mg-import-filter"><input type="checkbox" checked={allowIncomplete} disabled={Boolean(busy) || result?.committed} onChange={event => { setAllowIncomplete(event.target.checked); setResult(null); setError(''); setPage(1); }} />Cho phép hồ sơ Chưa hoàn tất thiếu CCCD/địa chỉ</label>
      <p className="mg-import-filename">Chỉ áp dụng khi cột Trạng thái hồ sơ là Chưa hoàn tất. Tên, số điện thoại và cơ sở vẫn bắt buộc.</p>
      {filename && <p className="mg-import-filename">File: {filename}</p>}
      <div ref={summaryRef} tabIndex={-1} className="mg-import-summary" aria-live="polite">
        {busy && <p role="status"><LoaderCircle size={16} className="mg-spin" />{busy === 'read' ? 'Đang đọc Excel…' : busy === 'check' ? 'Đang đối chiếu với hệ thống…' : 'Đang nhập khách hàng…'}</p>}
        {error && <p className="mg-error-message" role="alert">{error}</p>}
        {result && <>
          {result.committed ? <p className="mg-import-success" role="status"><Check size={18} />Đã nhập {result.imported} khách hàng. Bỏ qua {result.invalid} dòng lỗi và {result.duplicate} dòng trùng.</p> : <>
            <div className="mg-import-counts"><span>Tổng <strong>{result.total}</strong></span><span>Hợp lệ <strong>{result.valid}</strong></span><span>Lỗi <strong>{result.invalid}</strong></span><span>Trùng <strong>{result.duplicate}</strong></span>{result.incomplete > 0 && <span>Cần bổ sung hồ sơ <strong>{result.incomplete}</strong></span>}</div>
            <p>Chỉ nhập {result.valid} dòng hợp lệ. Dòng lỗi / trùng sẽ được bỏ qua. Hồ sơ đã có được giữ nguyên.</p>
          </>}
        </>}
      </div>
      {result && !result.committed && <>
        <label className="mg-import-filter"><input type="checkbox" checked={filter === 'issues'} onChange={event => { setFilter(event.target.checked ? 'issues' : 'all'); setPage(1); }} />Chỉ xem dòng lỗi / trùng</label>
        <div className="mg-import-table-scroll" role="region" aria-label="Xem trước khách hàng Excel" tabIndex={0}>
          <table className="mg-table mg-import-table"><caption className="mg-sr-only">Kết quả kiểm tra từng dòng trong file Excel</caption><thead><tr><th scope="col">Dòng</th><th scope="col">Khách hàng</th><th scope="col">Điện thoại</th><th scope="col">CCCD / CMND</th><th scope="col">Email</th><th scope="col">Địa chỉ</th><th scope="col">Cơ sở</th><th scope="col">Trạng thái</th><th scope="col">Ghi chú / cảnh báo</th><th scope="col">Kết quả</th></tr></thead>
            <tbody>{shown.slice((safePage - 1) * 20, safePage * 20).map(row => <tr key={row.rowNumber}><td>{row.rowNumber}</td><td>{row.values.name || '—'}</td><td>{row.values.phone || '—'}</td><td>{row.values.id_card || '—'}</td><td>{row.values.email || '—'}</td><td>{row.values.address || '—'}</td><td>{row.values.store || '—'}</td><td>{CUSTOMER_STATUSES.find(status => status.value === row.values.status)?.label || row.values.status}</td><td>{row.values.warning_note || '—'}</td><td className="mg-import-result"><strong>{row.state === 'valid' ? 'Hợp lệ' : row.state === 'duplicate' ? 'Trùng' : 'Lỗi'}</strong>{row.errors.map((message, i) => <p key={`error-${i}`}>{message}</p>)}{row.warnings?.map((message, i) => <p key={`warning-${i}`}>{message}</p>)}</td></tr>)}</tbody>
          </table>{!shown.length && <p className="mg-import-empty">Không có dòng lỗi / trùng.</p>}
        </div>
        <div className="mg-import-pages"><span>{shown.length} dòng · Trang {safePage}/{pages}</span><button type="button" className="mg-button" disabled={safePage === 1} onClick={() => setPage(safePage - 1)}>Trước</button><button type="button" className="mg-button" disabled={safePage === pages} onClick={() => setPage(safePage + 1)}>Sau</button></div>
      </>}
    </div>
    <div className="mg-dialog-footer"><button type="button" className="mg-button" disabled={Boolean(busy)} onClick={onClose}>Đóng</button>
      {!result?.committed && <><button type="button" className="mg-button" disabled={Boolean(busy) || !inputs.length} onClick={() => void submit(false)}>Kiểm tra lại</button>
        <button type="button" className="mg-button mg-button-primary" disabled={Boolean(busy) || !result?.valid} onClick={() => void submit(true)}>{busy === 'save' ? <LoaderCircle size={16} className="mg-spin" /> : <Upload size={16} />}Nhập {result?.valid || 0} khách hàng hợp lệ</button></>}
    </div>
  </Dialog>;
}
