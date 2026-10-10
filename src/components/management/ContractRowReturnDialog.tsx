'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { LoaderCircle, RotateCcw } from 'lucide-react';
import { Dialog } from './Dialog';
import { useManagement } from './ManagementProvider';
import { formatDateTime, formatMoney } from '@/lib/formatters';
import { loadContractReturnableItems, ReturnableContractItem, returnContractItem, searchReturnableItems } from '@/lib/management/contract-returns';

const localNow = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 16);
const localMillis = (value: string) => new Date(`${value}:00+07:00`).getTime();

export function ContractRowReturnDialog({ contractId, contractCode = '', onClose }: { contractId?: number; contractCode?: string; onClose: () => void }) {
  const { notify, reload } = useManagement();
  const [searchTerm, setSearchTerm] = useState(contractCode);
  const [rows, setRows] = useState<ReturnableContractItem[]>([]);
  const [itemId, setItemId] = useState('');
  const [returnedAt, setReturnedAt] = useState(localNow);
  const [hourlyRate, setHourlyRate] = useState('20000');
  const [feeOverride, setFeeOverride] = useState<string | null>(null);
  const [showTotalOverdueHours, setShowTotalOverdueHours] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadItems = useCallback(async (term: string, signal?: AbortSignal) => {
    if (!term.trim()) return;
    setLoading(true); setError(''); setRows([]); setItemId('');
    try {
      const result = await searchReturnableItems(term, signal);
      setRows(result);
      if (result.length === 1) setItemId(String(result[0].item_id));
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : 'Không tải được xe trong hợp đồng.');
    } finally { if (!signal?.aborted) setLoading(false); }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    if (contractId !== undefined) {
      setLoading(true); setError(''); setRows([]); setItemId('');
      void loadContractReturnableItems(contractId, controller.signal).then(result => {
        setRows(result);
        if (result.length === 1) setItemId(String(result[0].item_id));
      }).catch(cause => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Không tải được xe của hợp đồng.');
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    } else if (contractCode.trim()) {
      void loadItems(contractCode, controller.signal);
    } else {
      setLoading(false);
    }
    return () => controller.abort();
  }, [contractId, contractCode, loadItems]);

  const selected = rows.find(row => String(row.item_id) === itemId) || null;
  const estimate = useMemo(() => {
    if (!selected?.scheduled_return_at || !/^\d+$/.test(hourlyRate)) return { minutes: 0, hours: 0, days: 0, remainingHours: 0, remainingMinutes: 0, totalHours: 0, totalRemainingMinutes: 0, fee: 0 };
    const minutes = Math.max(0, Math.ceil((localMillis(returnedAt) - new Date(selected.scheduled_return_at).getTime()) / 60_000));
    const hours = Math.ceil(minutes / 60);
    return { minutes, hours, days: Math.floor(minutes / 1440), remainingHours: Math.floor((minutes % 1440) / 60), remainingMinutes: minutes % 60, totalHours: Math.floor(minutes / 60), totalRemainingMinutes: minutes % 60, fee: hours * Number(hourlyRate) };
  }, [selected?.scheduled_return_at, returnedAt, hourlyRate]);

  async function search(event: FormEvent) {
    event.preventDefault();
    await loadItems(searchTerm);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected || saving) return;
    setSaving(true); setError('');
    try {
      const result = await returnContractItem({ item_id: selected.item_id, item_revision: selected.item_revision, returned_at: returnedAt, hourly_rate: hourlyRate, ...(feeOverride === null ? {} : { fee_override: feeOverride }) });
      notify(result.fee ? `${result.contract_code}: đã trả xe, thêm ${formatMoney(result.fee)} tiền trả muộn.` : `${result.contract_code}: đã ghi nhận trả xe.`);
      await reload();
      onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không ghi nhận được trả xe.'); }
    finally { setSaving(false); }
  }

  return <Dialog title={contractCode ? `Trả xe · ${contractCode}` : 'Trả xe'} subtitle={selected ? `${selected.contract_code} · ${selected.customer_name} · ${selected.vehicle_name} · ${selected.license}` : contractId !== undefined ? 'Đang tải xe trực tiếp từ hợp đồng đã chọn' : 'Tìm theo mã hợp đồng hoặc CCCD để ghi nhận trả xe'} onClose={() => { if (!saving) onClose(); }}>
    <form onSubmit={event => { if (selected) void submit(event); else void search(event); }}>
      <div className="mg-dialog-body">
        {!contractCode && <div className="mg-return-search"><label className="mg-sr-only" htmlFor="contract-return-search">Mã hợp đồng hoặc CCCD</label><input id="contract-return-search" value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="Nhập mã hợp đồng hoặc số CCCD" /><button className="mg-button" type="button" disabled={loading || !searchTerm.trim()} onClick={() => void loadItems(searchTerm)}>{loading ? <LoaderCircle size={15} className="mg-spin" /> : null}Tìm</button></div>}
        {contractCode && !rows.length && loading && <p role="status"><LoaderCircle size={17} className="mg-spin" /> Đang tải xe của hợp đồng…</p>}
        {!loading && rows.length === 0 && !error && (searchTerm ? <p>{contractCode ? 'Hợp đồng này không có xe trong danh sách chi tiết để trả.' : 'Không tìm thấy hợp đồng hoặc xe khớp mã hợp đồng / CCCD.'}</p> : <p>Nhập mã hợp đồng hoặc CCCD để tra cứu xe cần trả.</p>)}
        {rows.length > 1 && <div className="mg-field"><label htmlFor="contract-return-item">Xe cần trả</label><select id="contract-return-item" value={itemId} onChange={event => setItemId(event.target.value)}><option value="">Chọn xe cần trả</option>{rows.map(row => <option key={row.item_id} value={row.item_id}>{row.contract_code} · {row.vehicle_name} · {row.license}{row.completed_at ? ` · Đã trả ${formatDateTime(row.completed_at)}` : row.overdue ? ' · Quá hạn' : ''}</option>)}</select></div>}
        {selected && <>
          {selected.completed_at ? <div className="mg-return-estimate"><span>Xe trong hợp đồng này đã được trả ngày {formatDateTime(selected.completed_at)}; không thể ghi nhận trả xe lần nữa.</span></div> : <>
          <div className="mg-form-grid mg-contract-grid-two">
            <div className="mg-field"><label htmlFor="contract-scheduled-start">Ngày giờ thuê</label><input id="contract-scheduled-start" value={formatDateTime(selected.scheduled_start_at)} readOnly /></div>
            <div className="mg-field"><label htmlFor="contract-scheduled-return">Ngày giờ phải trả</label><input id="contract-scheduled-return" value={formatDateTime(selected.scheduled_return_at)} readOnly /></div>
          </div>
          <div className="mg-form-grid mg-contract-grid-two">
            <div className="mg-field"><label htmlFor="contract-returned-at">Ngày giờ trả thực tế</label><input id="contract-returned-at" type="datetime-local" required value={returnedAt} onChange={event => { setReturnedAt(event.target.value); setFeeOverride(null); }} /></div>
            <div className="mg-field"><label htmlFor="contract-return-hourly-rate">Đơn giá trễ / giờ (VNĐ)</label><input id="contract-return-hourly-rate" type="number" min={0} max={5000000} step={1000} required value={hourlyRate} onChange={event => { setHourlyRate(event.target.value); setFeeOverride(null); }} /></div>
          </div>
          <div className={`mg-return-estimate${estimate.hours ? ' is-late' : ''}`}>
            <div className="mg-return-overdue-summary">
              {estimate.hours ? <span>{showTotalOverdueHours
                ? `Quá hạn ${estimate.totalHours} giờ${estimate.totalRemainingMinutes ? ` ${estimate.totalRemainingMinutes} phút` : ''} · tính phí ${estimate.hours} giờ`
                : `Quá hạn ${estimate.days} ngày ${estimate.remainingHours} giờ ${estimate.remainingMinutes} phút · tính phí ${estimate.hours} giờ`}</span>
                : <span>Chưa quá hạn · không cộng phí</span>}
              {estimate.minutes > 0 && <label className="mg-return-hour-toggle"><input type="checkbox" checked={showTotalOverdueHours} onChange={event => setShowTotalOverdueHours(event.target.checked)} />Quy đổi và hiển thị tổng giờ</label>}
            </div>
            <div className="mg-return-fee-field"><label htmlFor="contract-return-fee">Phí trả xe cộng vào hợp đồng</label>{feeOverride === null
              ? <><input id="contract-return-fee" value={formatMoney(estimate.fee)} readOnly /><button className="mg-button" type="button" disabled={!estimate.hours} onClick={() => setFeeOverride(String(estimate.fee))}>Thay đổi</button></>
              : <><input id="contract-return-fee" type="text" inputMode="numeric" value={feeOverride ? formatMoney(Number(feeOverride)) : ''} onChange={event => setFeeOverride(event.target.value.replace(/\D/g, '').slice(0, 13))} /><button className="mg-button" type="button" onClick={() => setFeeOverride(null)}>Dùng gợi ý</button></>}
            </div>
          </div>
          <p className="mg-composer-hint">Mặc định 20.000đ/giờ; giờ trễ làm tròn lên từng giờ. Phí trả muộn cộng vào tổng hợp đồng và doanh thu hợp đồng.</p>
          </>}
        </>}
        {error && <p className="mg-error-message" role="alert">{error}</p>}
      </div>
      <div className="mg-dialog-footer"><button type="button" className="mg-button" disabled={saving} onClick={onClose}>Đóng</button>{selected && !selected.completed_at && <button type="submit" className="mg-button mg-button-primary" disabled={loading || saving || (feeOverride !== null && !/^\d{1,13}$/.test(feeOverride))}>{saving ? <LoaderCircle size={16} className="mg-spin" /> : <RotateCcw size={16} />}{saving ? 'Đang ghi nhận…' : 'Xác nhận trả xe'}</button>}</div>
    </form>
  </Dialog>;
}
