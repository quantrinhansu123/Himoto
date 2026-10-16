'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LoaderCircle, RotateCcw, Wallet } from 'lucide-react';
import { Dialog } from './Dialog';
import { useManagement } from './ManagementProvider';
import { formatDateTime, formatMoney } from '@/lib/formatters';
import { cashbookPaymentPath } from '@/lib/management/contract-payments';
import { loadContractReturnableItems, ReturnableContractItem, ReturnInput, returnContractItems, searchReturnableItems } from '@/lib/management/contract-returns';
import { DateTime24Controls } from '@/components/contracts/DateTime24Field';

const localNow = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 16);
const localMillis = (value: string) => new Date(`${value}:00+07:00`).getTime();
const digits = (value: string) => value.replace(/\D/g, '').slice(0, 13);

interface Estimate { late: boolean; early: boolean; minutes: number; hours: number; unusedDays: number; suggested: number }

function estimateFor(row: ReturnableContractItem, returnedAt: string, hourlyRate: string): Estimate {
  const scheduled = row.scheduled_return_at ? new Date(row.scheduled_return_at).getTime() : NaN;
  const returned = localMillis(returnedAt);
  if (!Number.isFinite(scheduled) || !Number.isFinite(returned)) return { late: false, early: false, minutes: 0, hours: 0, unusedDays: 0, suggested: 0 };
  if (returned > scheduled) {
    const minutes = Math.ceil((returned - scheduled) / 60_000);
    const hours = Math.ceil(minutes / 60);
    return { late: true, early: false, minutes, hours, unusedDays: 0, suggested: /^\d+$/.test(hourlyRate) ? hours * Number(hourlyRate) : 0 };
  }
  const unusedDays = Math.floor((scheduled - returned) / 86_400_000);
  return { late: false, early: returned < scheduled, minutes: 0, hours: 0, unusedDays, suggested: unusedDays * (row.daily_price || 0) };
}

function lateText(minutes: number, hours: number) {
  return `Quá hạn ${Math.floor(minutes / 1440)} ngày ${Math.floor((minutes % 1440) / 60)} giờ ${minutes % 60} phút · tính phí ${hours} giờ`;
}

export function ContractRowReturnDialog({ contractId, contractCode = '', onClose }: { contractId?: number; contractCode?: string; onClose: () => void }) {
  const { notify, reload, invalidateData, canPayContracts } = useManagement();
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState(contractCode);
  const [rows, setRows] = useState<ReturnableContractItem[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [returnedAt, setReturnedAt] = useState(localNow);
  const [hourlyRate, setHourlyRate] = useState('20000');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ orderId: number; code: string; due: number | null; depositHeld: number; closes: boolean } | null>(null);

  const accept = useCallback((result: ReturnableContractItem[]) => {
    setRows(result);
    setOverrides({});
    setPicked(result.filter(row => !row.completed_at).map(row => String(row.item_id)));
  }, []);

  const loadItems = useCallback(async (term: string, signal?: AbortSignal) => {
    if (!term.trim()) return;
    setLoading(true); setError(''); setRows([]); setPicked([]);
    try {
      accept(await searchReturnableItems(term, signal));
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : 'Không tải được xe trong hợp đồng.');
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [accept]);

  useEffect(() => {
    const controller = new AbortController();
    if (contractId !== undefined) {
      setLoading(true); setError(''); setRows([]); setPicked([]);
      void loadContractReturnableItems(contractId, controller.signal).then(accept).catch(cause => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Không tải được xe của hợp đồng.');
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    } else if (contractCode.trim()) {
      void loadItems(contractCode, controller.signal);
    } else {
      setLoading(false);
    }
    return () => controller.abort();
  }, [contractId, contractCode, loadItems, accept]);

  const openRows = rows.filter(row => !row.completed_at);
  const doneRows = rows.filter(row => row.completed_at);
  const lines = useMemo(() => rows.filter(row => picked.includes(String(row.item_id))).map(row => {
    const estimate = estimateFor(row, returnedAt, hourlyRate);
    const override = overrides[String(row.item_id)];
    const amount = override === undefined ? estimate.suggested : Number(override || 0);
    return { row, estimate, override, amount, adjustment: estimate.late ? amount : estimate.early ? -amount : 0 };
  }), [rows, picked, overrides, returnedAt, hourlyRate]);

  const orderIds = new Set(lines.map(line => line.row.order_id));
  const summary = orderIds.size === 1 ? (() => {
    const first = lines[0].row;
    const adjustment = lines.reduce((sum, line) => sum + line.adjustment, 0);
    const total = first.total_amount === null ? null : first.total_amount + adjustment;
    const paid = first.paid_amount ?? 0;
    const remainingOpen = openRows.filter(row => row.order_id === first.order_id).length - lines.length;
    return { adjustment, total, paid, due: total === null ? null : total - paid, depositHeld: first.deposit_held, closes: remainingOpen === 0 };
  })() : null;

  function toggle(id: string) {
    setPicked(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  }

  async function search(event: FormEvent) {
    event.preventDefault();
    await loadItems(searchTerm);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!lines.length || saving) return;
    setSaving(true); setError('');
    try {
      const items: ReturnInput[] = lines.map(({ row, estimate, override, amount }) => ({
        item_id: row.item_id, item_revision: row.item_revision, returned_at: returnedAt, hourly_rate: hourlyRate,
        ...(estimate.late && override !== undefined ? { fee_override: String(amount) } : {}),
        ...(estimate.early && amount > 0 ? { early_discount: String(amount) } : {}),
      }));
      const results = await returnContractItems(items);
      const net = results.reduce((sum, result) => sum + result.fee, 0);
      const code = results[0]?.contract_code || contractCode;
      const orderId = lines[0]?.row.order_id ?? contractId;
      notify(`${code}: đã trả ${results.length} xe${net > 0 ? `, cộng ${formatMoney(net)} phí trả muộn` : net < 0 ? `, giảm ${formatMoney(-net)} doanh thu do trả sớm` : ''}.`);
      invalidateData(['vehicles', 'customers']);
      await reload(['contracts']);
      if (orderId) setDone({
        orderId, code,
        due: summary?.due ?? null,
        depositHeld: summary?.depositHeld ?? 0,
        closes: summary?.closes ?? false,
      });
      else onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không ghi nhận được trả xe.'); }
    finally { setSaving(false); }
  }

  function openCashbook(purpose: 'debt' | 'extra' | 'deposit_refund') {
    if (!done) return;
    onClose();
    router.push(cashbookPaymentPath(done.orderId, purpose));
  }

  const invalid = lines.some(line => line.override !== undefined && !/^\d{1,13}$/.test(line.override));
  const subtitle = rows[0] ? `${rows[0].contract_code} · ${rows[0].customer_name}` : contractId !== undefined ? 'Đang tải xe trực tiếp từ hợp đồng đã chọn' : 'Tìm theo mã hợp đồng, CCCD, biển số hoặc SĐT khách để trả xe';

  return <Dialog title={contractCode ? `Trả xe · ${contractCode}` : 'Trả xe'} subtitle={subtitle} onClose={() => { if (!saving) onClose(); }}>
    <form onSubmit={event => { if (lines.length) void submit(event); else void search(event); }}>
      <div className="mg-dialog-body">
        {done ? <div className="mg-cashbook-followup" role="status">
          <p>Đã trả xe hợp đồng {done.code}{done.due !== null && done.due > 0 ? ` · còn thiếu ${formatMoney(done.due)}` : ''}{done.depositHeld > 0 ? ` · cọc đang giữ ${formatMoney(done.depositHeld)}` : ''}.</p>
          {canPayContracts ? <>
            <p>Bấm nút bên dưới để mở phiếu thu/chi Sổ quỹ đã điền sẵn theo cấu trúc hợp đồng.</p>
            {(done.due === null || done.due > 0) && <button type="button" className="mg-button mg-button-primary" onClick={() => openCashbook('debt')}><Wallet size={16} />Điền thu công nợ vào sổ quỹ</button>}
            {done.due !== null && done.due <= 0 && <button type="button" className="mg-button" onClick={() => openCashbook('extra')}><Wallet size={16} />Điền phiếu thu thêm vào sổ quỹ</button>}
            {done.depositHeld > 0 && <button type="button" className="mg-button" onClick={() => openCashbook('deposit_refund')}><Wallet size={16} />Điền chi trả cọc vào sổ quỹ</button>}
          </> : <p>Chỉ kế toán hoặc quản trị viên mới điền được phiếu thu/chi vào sổ quỹ.</p>}
        </div> : <>
        {!contractCode && <div className="mg-return-search"><label className="mg-sr-only" htmlFor="contract-return-search">Mã hợp đồng, CCCD, biển số hoặc SĐT khách</label><input id="contract-return-search" value={searchTerm} onChange={event => setSearchTerm(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void loadItems(searchTerm); } }} placeholder="Mã HĐ, CCCD, biển số hoặc SĐT khách" /><button className="mg-button" type="button" disabled={loading || !searchTerm.trim()} onClick={() => void loadItems(searchTerm)}>{loading ? <LoaderCircle size={15} className="mg-spin" /> : null}Tìm</button></div>}
        {contractCode && !rows.length && loading && <p role="status"><LoaderCircle size={17} className="mg-spin" /> Đang tải xe của hợp đồng…</p>}
        {!loading && rows.length === 0 && !error && (searchTerm ? <p>{contractCode ? 'Hợp đồng này không có xe trong danh sách chi tiết để trả.' : 'Không tìm thấy xe khớp mã hợp đồng, CCCD, biển số hoặc SĐT khách.'}</p> : <p>Nhập mã hợp đồng, CCCD, biển số hoặc SĐT khách để tra cứu xe cần trả.</p>)}
        {rows.length > 0 && !openRows.length && <div className="mg-return-estimate"><span>Tất cả xe trong hợp đồng đã được trả; hợp đồng không còn xe đang thuê.</span></div>}
        {openRows.length > 0 && <>
          <div className="mg-form-grid mg-contract-grid-two">
            <div className="mg-field"><label htmlFor="contract-returned-at">Ngày giờ trả thực tế (24h)</label><DateTime24Controls id="contract-returned-at" label="Ngày giờ trả thực tế" value={returnedAt} onChange={value => { setReturnedAt(value); setOverrides({}); }} /></div>
            <div className="mg-field"><label htmlFor="contract-return-hourly-rate">Đơn giá trễ / giờ (VNĐ)</label><input id="contract-return-hourly-rate" type="number" min={0} max={5000000} step={1000} required value={hourlyRate} onChange={event => { setHourlyRate(event.target.value); setOverrides({}); }} /></div>
          </div>
          <div className="mg-return-lines" role="group" aria-label="Xe cần trả">
            {openRows.map(row => {
              const id = String(row.item_id);
              const line = lines.find(item => String(item.row.item_id) === id);
              const estimate = line?.estimate ?? estimateFor(row, returnedAt, hourlyRate);
              const value = line?.override ?? String(estimate.suggested);
              return <div key={id} className={`mg-return-line${estimate.late ? ' is-late' : ''}${line ? '' : ' is-off'}`}>
                <label className="mg-return-line-head"><input type="checkbox" checked={Boolean(line)} onChange={() => toggle(id)} /><strong>{row.vehicle_name} · {row.license}</strong>{orderIds.size > 1 || contractCode === '' ? <span>{row.contract_code}</span> : null}</label>
                <span className="mg-return-line-time">Thuê {formatDateTime(row.scheduled_start_at)} → hạn {formatDateTime(row.scheduled_return_at)}</span>
                {line && <div className="mg-return-line-adjust">
                  <span>{estimate.late ? lateText(estimate.minutes, estimate.hours) : estimate.early ? `Trả sớm${estimate.unusedDays ? ` ${estimate.unusedDays} ngày` : ' (dưới 1 ngày)'}${row.daily_price ? ` · ${formatMoney(row.daily_price)}/ngày` : ''}` : 'Trả đúng hạn · không điều chỉnh'}</span>
                  {(estimate.late || estimate.early) && <label>{estimate.late ? 'Phí trả muộn (+)' : 'Giảm doanh thu (−)'}
                    <input type="text" inputMode="numeric" value={value === '' ? '' : formatMoney(Number(value))} onChange={event => setOverrides(current => ({ ...current, [id]: digits(event.target.value) }))} /></label>}
                </div>}
              </div>;
            })}
            {doneRows.map(row => <div key={row.item_id} className="mg-return-line is-done"><span><strong>{row.vehicle_name} · {row.license}</strong> · Đã trả {formatDateTime(row.completed_at)}</span></div>)}
          </div>
          {summary && <dl className="mg-return-summary">
            <div><dt>Điều chỉnh tiền thuê</dt><dd>{summary.adjustment > 0 ? '+' : summary.adjustment < 0 ? '−' : ''}{formatMoney(Math.abs(summary.adjustment))}</dd></div>
            <div><dt>Tiền thuê sau trả xe</dt><dd>{summary.total === null ? 'Chưa có' : formatMoney(summary.total)}</dd></div>
            <div><dt>Đã thu tiền thuê</dt><dd>{formatMoney(summary.paid)}</dd></div>
            <div><dt>{summary.due !== null && summary.due < 0 ? 'Thu thừa' : 'Còn thiếu (không trừ cọc)'}</dt><dd>{summary.due === null ? '—' : formatMoney(Math.abs(summary.due))}</dd></div>
            <div><dt>Cọc đang giữ</dt><dd>{formatMoney(summary.depositHeld)}</dd></div>
          </dl>}
          <p className="mg-composer-hint">{summary?.closes ? 'Trả hết xe sẽ đóng hợp đồng (còn nợ tiền thuê thì chuyển Chờ thanh toán) và đưa xe về Lưu kho. ' : 'Xe được trả sẽ về Lưu kho. '}Sau khi xác nhận, dùng nút điền sổ quỹ để ghi phiếu Thu/Chi theo đúng cấu trúc.</p>
        </>}
        {error && <p className="mg-error-message" role="alert">{error}</p>}
        </>}
      </div>
      <div className="mg-dialog-footer"><button type="button" className="mg-button" disabled={saving} onClick={onClose}>{done ? 'Đóng' : 'Hủy'}</button>{!done && openRows.length > 0 && <button type="submit" className="mg-button mg-button-primary" disabled={loading || saving || !lines.length || invalid}>{saving ? <LoaderCircle size={16} className="mg-spin" /> : <RotateCcw size={16} />}{saving ? 'Đang ghi nhận…' : `Xác nhận trả ${lines.length} xe`}</button>}</div>
    </form>
  </Dialog>;
}
