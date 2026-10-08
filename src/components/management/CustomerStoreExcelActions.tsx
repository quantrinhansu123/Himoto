'use client';

import { useRef, useState } from 'react';
import { ArrowDownToLine, Check, ListChecks, LoaderCircle, Upload } from 'lucide-react';
import { CUSTOMER_IMPORT_LIMIT } from '@/lib/management/customer-import';
import type { CustomerStoreInput, CustomerStoreResult } from '@/lib/management/customer-store-import';
import { Dialog } from './Dialog';
import { useManagement } from './ManagementProvider';

async function checkStores(rows: CustomerStoreInput[], commit: boolean, revision = ''): Promise<CustomerStoreResult> {
  const response = await fetch('/api/auth/customers/match-stores', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ rows, commit, revision }) });
  const envelope = await response.json().catch(() => null);
  if (!response.ok || envelope?.status !== 'success' || !Array.isArray(envelope.data?.rows)) throw new Error(envelope?.message || `Không ${commit ? 'cập nhật' : 'đối chiếu'} được cơ sở (HTTP ${response.status}).`);
  return envelope.data;
}

export function CustomerStoreExcelActions({ disabled }: { disabled: boolean }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="mg-button" disabled={disabled} onClick={() => setOpen(true)}><ListChecks size={17} aria-hidden="true" />Khớp cơ sở theo căn cước</button>
    {open && <CustomerStoreExcelDialog onClose={() => setOpen(false)} />}
  </>;
}

function CustomerStoreExcelDialog({ onClose }: { onClose: () => void }) {
  const { dataset, reload, notify } = useManagement();
  const [inputs, setInputs] = useState<CustomerStoreInput[]>([]);
  const [result, setResult] = useState<CustomerStoreResult | null>(null);
  const [filename, setFilename] = useState('');
  const [busy, setBusy] = useState<'template' | 'read' | 'check' | 'save' | ''>('');
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [page, setPage] = useState(1);
  const summaryRef = useRef<HTMLDivElement>(null);
  const focusSummary = () => requestAnimationFrame(() => summaryRef.current?.focus());

  async function download() {
    if (busyRef.current) return;
    busyRef.current = true; setBusy('template'); setError('');
    try {
      const { createCustomerStoreTemplate, downloadCustomerExcel } = await import('@/lib/management/customer-excel');
      const stores = (dataset?.stores || []).map(store => ({ id: store.id, name: store.name, code: store.code }));
      downloadCustomerExcel(await createCustomerStoreTemplate(stores), 'HIMOTO-mau-can-cuoc-co-so.xlsx');
      notify('Đã tải mẫu Excel Căn cước / Cơ sở.');
    } catch { setError('Không tải được mẫu Excel. Thử lại.'); }
    finally { busyRef.current = false; setBusy(''); }
  }
  async function readFile(file: File | undefined) {
    if (!file || busyRef.current) return;
    busyRef.current = true; setBusy('read'); setError(''); setInputs([]); setResult(null); setFilename(file.name); setPage(1); setIssuesOnly(false);
    try {
      const { readCustomerStoreExcel } = await import('@/lib/management/customer-excel');
      const rows = await readCustomerStoreExcel(file);
      setInputs(rows); setBusy('check'); setResult(await checkStores(rows, false));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không đọc được file Excel.'); }
    finally { busyRef.current = false; setBusy(''); focusSummary(); }
  }
  async function submit(commit: boolean) {
    if (busyRef.current || !inputs.length || (commit && (!result?.ready || result.committed))) return;
    busyRef.current = true; setBusy(commit ? 'save' : 'check'); setError('');
    try {
      const next = await checkStores(inputs, commit, commit ? result!.revision : '');
      if (commit && (!next.committed || next.updated !== result!.ready)) throw new Error('Chưa xác nhận đủ khách hàng đã cập nhật. Kiểm tra lại trước khi thử tiếp.');
      setResult(next); setPage(1);
      if (commit) { await reload(); notify(`Đã cập nhật cơ sở cho ${next.updated} khách hàng.`); }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không cập nhật được cơ sở.');
      if (commit) setResult(null);
    } finally { busyRef.current = false; setBusy(''); focusSummary(); }
  }
  const shown = result?.rows.filter(row => !issuesOnly || row.state === 'invalid') || [];
  const pages = Math.max(1, Math.ceil(shown.length / 20));
  const safePage = Math.min(page, pages);
  return <Dialog title="Khớp cơ sở theo căn cước" subtitle="Tìm khách hàng đã có bằng căn cước và cập nhật cơ sở từ Excel" className="mg-customer-import" onClose={() => { if (!busyRef.current) onClose(); }}>
    <div className="mg-dialog-body">
      <p>File gồm hai cột <strong>Căn cước</strong> và <strong>Cơ sở</strong>. Điền tên cơ sở họ gửi hoặc chọn từ danh sách trong mẫu.</p>
      <button type="button" className="mg-button" disabled={Boolean(busy) || result?.committed} onClick={() => void download()}><ArrowDownToLine size={17} aria-hidden="true" />Tải mẫu Excel căn cước / cơ sở</button>
      <div className="mg-import-upload mg-field"><label htmlFor="customer-store-excel-file">Chọn file Excel căn cước / cơ sở (.xlsx)</label>
        <input id="customer-store-excel-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={Boolean(busy) || result?.committed} aria-describedby="customer-store-excel-help" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void readFile(file); }} />
        <small id="customer-store-excel-help">Tối đa 5 MB và {CUSTOMER_IMPORT_LIMIT.toLocaleString('vi-VN')} dòng. Căn cước để dạng Text để giữ số 0 đầu. Có thể đổi thứ tự hai cột.</small>
      </div>
      {filename && <p className="mg-import-filename">File: {filename}</p>}
      <div ref={summaryRef} tabIndex={-1} className="mg-import-summary" aria-live="polite">
        {busy && <p role="status"><LoaderCircle size={16} className="mg-spin" aria-hidden="true" />{busy === 'template' ? 'Đang tạo mẫu Excel…' : busy === 'read' ? 'Đang đọc Excel…' : busy === 'check' ? 'Đang khớp căn cước và cơ sở…' : 'Đang cập nhật cơ sở…'}</p>}
        {error && <p className="mg-error-message" role="alert">{error}</p>}
        {result && (result.committed ? <p className="mg-import-success" role="status"><Check size={18} aria-hidden="true" />Đã cập nhật cơ sở cho {result.updated} khách hàng. Giữ nguyên {result.unchanged} dòng đã đúng; bỏ qua {result.invalid} dòng lỗi.</p> : <>
          <div className="mg-import-counts"><span>Tổng <strong>{result.total}</strong></span><span>Cần cập nhật <strong>{result.ready}</strong></span><span>Đã đúng cơ sở <strong>{result.unchanged}</strong></span><span>Lỗi <strong>{result.invalid}</strong></span></div>
          <p>Kiểm tra cơ sở hiện tại và cơ sở trong Excel trước khi lưu. Chỉ cập nhật {result.ready} khách hàng khớp duy nhất; dòng lỗi được bỏ qua.</p>
        </>)}
      </div>
      {result && !result.committed && <>
        <label className="mg-import-filter"><input type="checkbox" checked={issuesOnly} onChange={event => { setIssuesOnly(event.target.checked); setPage(1); }} />Chỉ xem dòng lỗi</label>
        <div className="mg-import-table-scroll" role="region" aria-label="Xem trước cơ sở theo căn cước" tabIndex={0}>
          <table className="mg-table mg-import-table"><caption className="mg-sr-only">Đối chiếu căn cước, khách hàng và cơ sở từng dòng Excel</caption><thead><tr><th scope="col">Dòng</th><th scope="col">Căn cước</th><th scope="col">Khách hàng khớp</th><th scope="col">Cơ sở hiện tại</th><th scope="col">Cơ sở trong Excel</th><th scope="col">Cơ sở sẽ lưu</th><th scope="col">Kết quả</th></tr></thead>
            <tbody>{shown.slice((safePage - 1) * 20, safePage * 20).map(row => <tr key={row.rowNumber}><td>{row.rowNumber}</td><td>{row.values.id_card || '—'}</td><td>{row.customer_id ? `${row.customer_name} (#${row.customer_id})` : '—'}</td><td>{row.previous_store_name || 'Chưa có cơ sở'}</td><td>{row.values.store || '—'}</td><td>{row.store_name || '—'}</td><td className="mg-import-result"><strong>{row.state === 'ready' ? 'Sẽ cập nhật' : row.state === 'unchanged' ? 'Đã đúng cơ sở' : 'Lỗi'}</strong>{row.errors.map((message, i) => <p key={i}>{message}</p>)}</td></tr>)}</tbody>
          </table>{!shown.length && <p className="mg-import-empty">Không có dòng lỗi.</p>}
        </div>
        <div className="mg-import-pages"><span>{shown.length} dòng · Trang {safePage}/{pages}</span><button type="button" className="mg-button" disabled={safePage === 1} onClick={() => setPage(safePage - 1)}>Trước</button><button type="button" className="mg-button" disabled={safePage === pages} onClick={() => setPage(safePage + 1)}>Sau</button></div>
      </>}
    </div>
    <div className="mg-dialog-footer"><button type="button" className="mg-button" disabled={Boolean(busy)} onClick={onClose}>Đóng</button>
      {!result?.committed && <><button type="button" className="mg-button" disabled={Boolean(busy) || !inputs.length} onClick={() => void submit(false)}>Kiểm tra lại</button><button type="button" className="mg-button mg-button-primary" disabled={Boolean(busy) || !result?.ready} onClick={() => void submit(true)}><Upload size={16} aria-hidden="true" />Cập nhật cơ sở cho {result?.ready || 0} khách hàng</button></>}
    </div>
  </Dialog>;
}
