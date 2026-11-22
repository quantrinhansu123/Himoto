'use client';

import { useEffect, useState } from 'react';
import { formatMoney } from '@/lib/formatters';
import { PAYMENT_METHODS } from '@/lib/management/contract-payments';
import type { DepositRefundRequest } from '@/lib/management/deposit-refunds';
import { depositRefundRequest, depositRefundUrl } from './DepositRefundDialog';
import { Dialog } from './Dialog';

export function DepositRefundQueue({ actorId, onSaved }: { actorId?: number; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ rows: DepositRefundRequest[]; has_more: boolean }>();
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState<DepositRefundRequest>();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [reviewError, setReviewError] = useState('');
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void depositRefundRequest<{ rows: DepositRefundRequest[]; has_more: boolean }>(`?page=${page}`, { signal: controller.signal })
      .then(value => {
        if (controller.signal.aborted) return;
        if (!value.rows.length && page > 1) setPage(page - 1);
        else setData(value);
      })
      .catch(cause => { if (!controller.signal.aborted) setError((cause as Error).message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open, page, refresh]);

  async function decide(decision: 'approve' | 'reject') {
    if (!selected || busy) return;
    if (decision === 'reject' && !note.trim()) { setReviewError('Nhập lý do từ chối để nhân viên đối chiếu.'); return; }
    setBusy(true);
    setReviewError('');
    try {
      const result = await depositRefundRequest<DepositRefundRequest>('', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id, decision, note: note.trim() }),
      });
      setSelected(undefined);
      setMessage(result.transaction_id ? `Đã duyệt và ghi phiếu chi #${result.transaction_id} cho HĐ ${result.code}.` : `Đã từ chối yêu cầu của HĐ ${result.code}.`);
      setRefresh(value => value + 1);
      onSaved();
    } catch (cause) {
      setReviewError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return <section aria-label="Yêu cầu hoàn cọc">
    <button type="button" className="mg-button" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      {open ? 'Ẩn yêu cầu hoàn cọc chờ duyệt' : 'Yêu cầu hoàn cọc chờ duyệt'}
    </button>
    {open && <div className="mg-return-completed-actions">
      <button type="button" className="mg-button" onClick={() => setRefresh(value => value + 1)} disabled={loading}>Tải lại danh sách</button>
      {message && <p role="status">{message}</p>}
      {loading && <p role="status">Đang tải yêu cầu chờ duyệt…</p>}
      {error && <p className="mg-field-error" role="alert">{error}</p>}
      {!loading && !error && data && !data.rows.length && <p role="status">Không có yêu cầu chờ duyệt.</p>}
      {!loading && !error && data?.rows.map(row => <div key={row.id} className="mg-return-completed-card">
        <div><strong>HĐ {row.code} · {formatMoney(row.amount)}</strong><span>{row.store} · {row.actor} · {row.review_reason}</span></div>
        <button type="button" className="mg-button" onClick={() => { setNote(''); setReviewError(''); setSelected(row); }}>Xem và duyệt</button>
      </div>)}
      {!loading && data && (page > 1 || data.has_more) && <div className="mg-heading-actions">
        <button type="button" className="mg-button" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Trang trước</button>
        <span>Trang {page}</span>
        <button type="button" className="mg-button" disabled={!data.has_more} onClick={() => setPage(value => value + 1)}>Trang sau</button>
      </div>}
    </div>}
    {selected && <Dialog title={`Duyệt hoàn cọc · ${selected.code}`} onClose={() => { if (!busy) setSelected(undefined); }} dismissOnBackdrop={false}>
      <div className="mg-dialog-body">
        <p><strong>{formatMoney(selected.amount)}</strong> · {PAYMENT_METHODS.find(row => row.value === selected.method)?.label}</p>
        <p>{selected.store} · {selected.account_label} · {selected.paid_at.slice(11)} ngày {selected.paid_at.slice(0, 10).split('-').reverse().join('/')}</p>
        {selected.replaces_id && <p>Sẽ hủy hiệu lực phiếu #{selected.replaces_id} và ghi phiếu thay thế khi duyệt.</p>}
        <p>{selected.actor} · {selected.reason}</p>
        <p><a href={`${depositRefundUrl}?evidence=${selected.id}`} target="_blank" rel="noreferrer">Mở ảnh chứng từ</a></p>
        {selected.actor_id === actorId ? <p role="status">Cần một kế toán hoặc quản trị viên khác duyệt yêu cầu do mình gửi.</p>
          : <label className="mg-field">Ghi chú duyệt / lý do từ chối<textarea maxLength={500} value={note} disabled={busy} onChange={event => setNote(event.target.value)} /></label>}
        {reviewError && <p className="mg-field-error" role="alert">{reviewError}</p>}
      </div>
      <div className="mg-dialog-footer">
        <button type="button" className="mg-button" disabled={busy} onClick={() => setSelected(undefined)}>Đóng</button>
        {selected.actor_id !== actorId && <>
          <button type="button" className="mg-button mg-button-danger" disabled={busy} onClick={() => void decide('reject')}>Từ chối</button>
          <button type="button" className="mg-button mg-button-primary" disabled={busy} onClick={() => void decide('approve')}>{busy ? 'Đang lưu…' : 'Duyệt và ghi phiếu chi'}</button>
        </>}
      </div>
    </Dialog>}
  </section>;
}
