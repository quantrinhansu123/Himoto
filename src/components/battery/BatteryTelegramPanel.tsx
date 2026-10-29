'use client';

import { useCallback, useEffect, useState } from 'react';
import { NOTICE_STATUS_LABELS } from '@/lib/management/contract-telegram';
import { batteryTelegramRequest, type BatteryTelegramState } from '@/lib/management/battery-telegram';

export function BatteryTelegramPanel({ batteryId, requestId }: { batteryId: number; requestId: string }) {
  const [data, setData] = useState<BatteryTelegramState | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const value = await batteryTelegramRequest(batteryId, requestId, false, signal);
      if (!signal?.aborted) { setData(value); setError(''); }
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : 'Không tải được thông báo.');
    }
  }, [batteryId, requestId]);
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);
  useEffect(() => {
    if (!data || !['pending', 'sending'].includes(data.status || '')) return;
    const controller = new AbortController();
    const timer = setTimeout(() => void refresh(controller.signal), 3000);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [data, refresh]);
  return <section className="mg-contract-telegram">
    <p>Đã nhận lại pin / sạc. Kiểm tra nội dung bên dưới rồi bấm gửi Telegram. Đóng màn hình không gửi tin; có thể mở lại từ Lịch sử.</p>
    <button className="mg-button" type="button" disabled={busy} onClick={() => void refresh()}>Làm mới trạng thái</button>
    {error && <p role="alert" className="mg-field-error">{error}</p>}
    {data && !data.eligible ? <p>Không xác định được cơ sở hợp đồng pin để gửi Telegram.</p> : data && <>
      <p><strong>Nơi nhận: {data.destination_label}</strong></p>
      <pre className="mg-telegram-preview">{data.text}</pre>
      <p role="status">{data.status ? NOTICE_STATUS_LABELS[data.status] : 'Chưa gửi'}</p>
      {data.status === 'unknown' && <p role="alert">Chưa rõ Telegram đã nhận hay chưa. Kiểm tra nhóm trước khi xử lý; hệ thống không tự gửi lại.</p>}
      <button type="button" className="mg-button mg-button-primary" disabled={busy || !data.can_send} onClick={async () => {
        setBusy(true); setError('');
        try { setData(await batteryTelegramRequest(batteryId, requestId, true)); }
        catch (cause) { setError(cause instanceof Error ? cause.message : 'Không gửi được thông báo.'); }
        finally { setBusy(false); }
      }}>{busy ? 'Đang xử lý…' : data.status === 'sent' ? 'Đã gửi Telegram' : ['pending', 'sending'].includes(data.status || '') ? 'Đang gửi Telegram' : 'Gửi thông tin Telegram'}</button>
    </>}
  </section>;
}
