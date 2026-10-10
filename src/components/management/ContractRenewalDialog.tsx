'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { CalendarPlus, LoaderCircle } from 'lucide-react';
import { loadContractReturnableItems, ReturnableContractItem } from '@/lib/management/contract-returns';
import { overdueParts, saveContractRenewal } from '@/lib/management/contract-renewals';
import { formatDateTime, formatMoney } from '@/lib/formatters';
import { useManagement } from './ManagementProvider';
import { Dialog } from './Dialog';

const groupAmount = (value: string) => value.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const vietnamInput = (ms: number) => new Date(ms + 7 * 3_600_000).toISOString().slice(0, 16);

export function ContractRenewalDialog({ orderId, contractCode, unitPrice, onClose }: { orderId: number; contractCode: string; unitPrice?: number; onClose: () => void }) {
  const { notify, reload } = useManagement();
  const [rows, setRows] = useState<ReturnableContractItem[]>([]);
  const [itemId, setItemId] = useState('');
  const [days, setDays] = useState('1');
  const [returnAt, setReturnAt] = useState('');
  const [amount, setAmount] = useState('');
  const [amountTouched, setAmountTouched] = useState(false);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    void loadContractReturnableItems(orderId, controller.signal).then(result => {
      const open = result.filter(row => !row.completed_at);
      setRows(open);
      if (open.length === 1) setItemId(String(open[0].item_id));
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Không tải được xe trong hợp đồng.');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [orderId]);

  const selected = rows.find(row => String(row.item_id) === itemId) || null;
  const overdue = useMemo(() => overdueParts(selected?.scheduled_return_at ?? null), [selected?.scheduled_return_at]);
  const dueMs = selected?.scheduled_return_at ? new Date(selected.scheduled_return_at).getTime() : NaN;
  const dayCount = /^\d+$/.test(days) ? Number(days) : 0;

  useEffect(() => {
    if (!selected || !Number.isFinite(dueMs) || dayCount < 1 || dayCount > 365) return;
    setReturnAt(vietnamInput(dueMs + dayCount * 86_400_000));
    if (!amountTouched && unitPrice) setAmount(String(unitPrice * dayCount));
  }, [selected, dueMs, dayCount, unitPrice, amountTouched]);

  const fee = /^\d+$/.test(amount) ? Number(amount) : 0;
  const total = selected?.total_amount ?? null;
  const paid = selected?.paid_amount ?? null;
  const nextTotal = total === null ? null : total + fee;
  const returnMs = returnAt ? new Date(`${returnAt}:00+07:00`).getTime() : NaN;
  const validReturn = Number.isFinite(returnMs) && (!Number.isFinite(dueMs) || returnMs > dueMs);
  const stillOverdue = validReturn && returnMs < Date.now();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected || saving) return;
    if (!validReturn) { setError('Ngày trả mới phải sau ngày hẹn trả hiện tại.'); return; }
    if (!/^(0|[1-9]\d{0,12})$/.test(amount || '0')) { setError('Chi phí gia hạn phải là số tiền nguyên VNĐ.'); return; }
    setSaving(true); setError('');
    try {
      const result = await saveContractRenewal(orderId, { item_id: selected.item_id, item_revision: selected.item_revision, order_revision: selected.order_revision,
        return_at: returnAt, amount: amount || '0', note: note.trim() });
      notify(`${result.code}: đã tạo phiên bản v${result.version} — hẹn trả ${formatDateTime(result.return_at)}${result.total_amount !== null ? `, tiền hợp đồng ${formatMoney(result.total_amount)}` : ''}.`);
      await reload();
      onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không lưu được gia hạn hợp đồng.'); }
    finally { setSaving(false); }
  }

  return <Dialog title={`Gia hạn · ${contractCode}`} subtitle="Lưu sẽ tạo phiên bản hợp đồng mới với ngày trả và tiền hợp đồng mới" className="mg-renewal-dialog" onClose={() => { if (!saving) onClose(); }}>
    <form onSubmit={submit}>
      <div className="mg-dialog-body">
        {loading && <p role="status"><LoaderCircle size={17} className="mg-spin" /> Đang tải xe của hợp đồng…</p>}
        {!loading && !rows.length && !error && <p>Hợp đồng này không còn xe đang thuê để gia hạn.</p>}
        {rows.length > 1 && <div className="mg-field"><label htmlFor="renewal-item">Xe cần gia hạn</label><select id="renewal-item" value={itemId} onChange={event => { setItemId(event.target.value); setAmountTouched(false); }}><option value="">Chọn xe</option>{rows.map(row => <option key={row.item_id} value={row.item_id}>{row.vehicle_name} · {row.license}</option>)}</select></div>}
        {selected && <>
          <dl className="mg-renewal-facts">
            <div><dt>Xe</dt><dd>{selected.vehicle_name || '—'} · {selected.license || '—'}</dd></div>
            <div><dt>Ngày thuê</dt><dd>{formatDateTime(selected.scheduled_start_at)}</dd></div>
            <div><dt>Ngày trả (hẹn hiện tại)</dt><dd>{formatDateTime(selected.scheduled_return_at)}</dd></div>
            <div className={overdue.minutes ? 'is-overdue' : undefined}><dt>Số ngày quá hạn</dt><dd>{overdue.days} ngày</dd></div>
            <div className={overdue.minutes ? 'is-overdue' : undefined}><dt>Số giờ quá hạn</dt><dd>{overdue.hours} giờ</dd></div>
          </dl>
          <fieldset className="mg-payment-fields" disabled={saving}>
            <legend>Thông tin gia hạn</legend>
            <label>Số ngày gia hạn<input type="number" min={1} max={365} value={days} onChange={event => setDays(event.target.value)} /></label>
            <label>Ngày trả mới<input type="datetime-local" required value={returnAt} onChange={event => setReturnAt(event.target.value)} aria-invalid={Boolean(returnAt) && !validReturn} /></label>
            <label className="mg-field-wide">Chi phí gia hạn (VNĐ)<input inputMode="numeric" value={groupAmount(amount)} placeholder="Nhập chi phí gia hạn"
              onChange={event => { const raw = event.target.value.replaceAll('.', ''); if (/^\d{0,13}$/.test(raw)) { setAmount(raw); setAmountTouched(true); } }} />
              <small>{unitPrice ? `Gợi ý: ${formatMoney(unitPrice)} × ${dayCount || 0} ngày = ${formatMoney(unitPrice * (dayCount || 0))}. Có thể sửa.` : 'Hợp đồng chưa có đơn giá/ngày; nhập chi phí gia hạn.'}</small></label>
            <label className="mg-field-wide">Ghi chú<textarea rows={2} maxLength={2000} value={note} onChange={event => setNote(event.target.value)} placeholder="Lý do gia hạn, thỏa thuận với khách…" /></label>
          </fieldset>
          {stillOverdue && <p className="mg-field-error">Ngày trả mới vẫn ở quá khứ, hợp đồng sẽ tiếp tục quá hạn.</p>}
          <dl className="mg-payment-totals">
            <div><dt>Tiền hợp đồng</dt><dd>{total === null ? 'Chưa đối chiếu' : formatMoney(total)}{fee > 0 && nextTotal !== null && <> → <strong>{formatMoney(nextTotal)}</strong></>}</dd></div>
            <div><dt>Đã thu</dt><dd>{paid === null ? '—' : formatMoney(paid)}</dd></div>
            <div><dt>Còn thiếu sau gia hạn</dt><dd>{nextTotal === null || paid === null ? '—' : formatMoney(Math.max(nextTotal - paid, 0))}</dd></div>
          </dl>
          <p className="mg-composer-hint">Chi phí gia hạn được cộng vào tiền hợp đồng (khách thanh toán sau bằng nút Thanh toán). Phiên bản mới được ghi vào Lịch sử chỉnh sửa và dùng khi in hợp đồng.</p>
        </>}
        {error && <p className="mg-error-message" role="alert">{error}</p>}
      </div>
      <div className="mg-dialog-footer"><button type="button" className="mg-button" disabled={saving} onClick={onClose}>Đóng</button>
        {selected && <button type="submit" className="mg-button mg-button-primary" disabled={loading || saving || !validReturn}>{saving ? <LoaderCircle size={16} className="mg-spin" /> : <CalendarPlus size={16} />}{saving ? 'Đang lưu…' : 'Lưu gia hạn'}</button>}</div>
    </form>
  </Dialog>;
}
