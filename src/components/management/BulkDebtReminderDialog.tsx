'use client';
import { useEffect, useRef, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { Dialog } from './Dialog';
import { reminderRequest, REMINDER_STATUS_LABELS, type DebtReminderContext, type ReminderStatus } from '@/lib/management/debt-reminders';
import { formatMoney } from '@/lib/formatters';

type Item =
  | { orderId: number; state: 'loading' }
  | { orderId: number; state: 'ready'; context: DebtReminderContext }
  | { orderId: number; state: 'error'; message: string }
  | { orderId: number; state: 'sending'; context: DebtReminderContext }
  | { orderId: number; state: 'sent'; context: DebtReminderContext; status: ReminderStatus }
  | { orderId: number; state: 'failed'; context: DebtReminderContext; message: string };

export function BulkDebtReminderDialog({ orderIds, onClose, onSent }: { orderIds: number[]; onClose: () => void; onSent?: () => void }) {
  const [items, setItems] = useState<Item[]>(() => orderIds.map(orderId => ({ orderId, state: 'loading' })));
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const pending = useRef(false);
  const requestIds = useRef(new Map<number, string>());

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all(orderIds.map(async orderId => {
      try {
        const context = await reminderRequest<DebtReminderContext>(`/api/auth/order/car-rental/${orderId}/debt-reminder`, { signal: controller.signal });
        if (!controller.signal.aborted) setItems(current => current.map(item => item.orderId === orderId ? { orderId, state: 'ready', context } : item));
      } catch (cause) {
        if (!controller.signal.aborted) setItems(current => current.map(item => item.orderId === orderId ? {
          orderId, state: 'error', message: cause instanceof Error ? cause.message : 'Không tải được thông tin nhắc nợ.',
        } : item));
      }
    }));
    return () => controller.abort();
  }, [orderIds]);

  const ready = items.filter((item): item is Extract<Item, { state: 'ready' }> => item.state === 'ready');
  const loading = items.some(item => item.state === 'loading');
  const sentCount = items.filter(item => item.state === 'sent').length;
  const sendFailedCount = items.filter(item => item.state === 'failed').length;
  const loadFailedCount = items.filter(item => item.state === 'error').length;

  async function sendAll() {
    if (pending.current || done || !ready.length) return;
    pending.current = true;
    setSending(true);
    const queue = [...ready];
    let anySent = false;
    for (const item of queue) {
      setItems(current => current.map(row => row.orderId === item.orderId ? { orderId: item.orderId, state: 'sending', context: item.context } : row));
      const requestId = requestIds.current.get(item.orderId) ?? crypto.randomUUID();
      requestIds.current.set(item.orderId, requestId);
      try {
        const value = await reminderRequest<{ status: ReminderStatus }>('/api/auth/debt-reminders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            request_id: requestId,
            order_id: item.context.id,
            revision: item.context.revision,
            amount: item.context.amount,
            phone: item.context.phone,
            message: item.context.message,
          }),
        });
        anySent = true;
        setItems(current => current.map(row => row.orderId === item.orderId ? { orderId: item.orderId, state: 'sent', context: item.context, status: value.status } : row));
      } catch (cause) {
        setItems(current => current.map(row => row.orderId === item.orderId ? {
          orderId: item.orderId, state: 'failed', context: item.context,
          message: cause instanceof Error ? cause.message : 'Không gửi được nhắc nợ.',
        } : row));
      }
    }
    setDone(true);
    setSending(false);
    pending.current = false;
    if (anySent) onSent?.();
  }

  const close = () => { if (!pending.current) onClose(); };

  return <Dialog
    title="Gửi nhắc nợ hàng loạt"
    subtitle={`${orderIds.length} hợp đồng đã chọn · gửi tin Zalo tới từng số điện thoại khách`}
    onClose={close}
    className="mg-debt-reminder-dialog mg-bulk-debt-reminder-dialog"
  >
    <div className="mg-dialog-body">
      <p className="mg-reminder-help">Mỗi hợp đồng dùng nội dung mẫu và số điện thoại trên hồ sơ khách. Các số không hợp lệ sẽ bị bỏ qua khi gửi.</p>
      <ul className="mg-bulk-reminder-list" aria-label="Danh sách số sẽ nhận nhắc nợ">
        {items.map(item => {
          const label = item.state === 'loading' || item.state === 'error'
            ? `Hợp đồng #${item.orderId}`
            : `${item.context.code} · ${item.context.customer_name}`;
          const phone = item.state === 'loading' || item.state === 'error' ? '…' : item.context.phone;
          const amount = item.state === 'loading' || item.state === 'error' ? '…' : formatMoney(item.context.amount);
          return <li key={item.orderId}>
            <div>
              <strong>{label}</strong>
              <small>{phone} · {amount}</small>
              {item.state === 'error' && <p className="mg-field-error" role="alert">{item.message}</p>}
              {item.state === 'failed' && <p className="mg-field-error" role="alert">{item.message}</p>}
              {item.state === 'sent' && <span className={`mg-reminder-status is-${item.status}`}>{REMINDER_STATUS_LABELS[item.status]}</span>}
              {item.state === 'sending' && <span className="mg-reminder-status">Đang gửi…</span>}
            </div>
          </li>;
        })}
      </ul>
      {done && <div role="status" className={sendFailedCount || loadFailedCount ? 'mg-composer-notice' : 'mg-payment-success'}>
        <strong>Đã xử lý {sentCount + sendFailedCount}/{sentCount + sendFailedCount || orderIds.length} lượt gửi.</strong>
        <p>{sentCount} thành công{sendFailedCount || loadFailedCount ? ` · ${sendFailedCount + loadFailedCount} lỗi / không gửi được` : ''}. Kiểm tra lịch sử nhắc nợ nếu cần đối chiếu.</p>
      </div>}
    </div>
    <div className="mg-dialog-footer">
      <button type="button" className="mg-button" disabled={sending} onClick={close}>Đóng</button>
      {!done && <button type="button" className="mg-button mg-button-primary" disabled={sending || loading || !ready.length} onClick={() => void sendAll()}>
        <MessageCircle size={16} aria-hidden="true" />{sending ? 'Đang gửi…' : `Gửi nhắc nợ (${ready.length} số)`}
      </button>}
    </div>
  </Dialog>;
}
