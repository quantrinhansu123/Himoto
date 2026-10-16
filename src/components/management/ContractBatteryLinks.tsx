'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { batteryRequest, batteryStatusLabel, type BatteryContract } from '@/lib/management/battery-contracts';

export function ContractBatteryLinks({ orderId, onCreate }: { orderId: number; onCreate?: () => void }) {
  const [rows, setRows] = useState<BatteryContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    batteryRequest<BatteryContract[]>(`/api/auth/battery-contracts?vehicle_contract_id=${orderId}`, 'GET', undefined, controller.signal)
      .then(data => {
        if (!Array.isArray(data) || data.some(row=>row.vehicle_contract_id !== orderId || !Number.isSafeInteger(row.id))) throw new Error('Danh sách pin / sạc liên kết không hợp lệ.');
        if (!controller.signal.aborted) setRows(data);
      })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Không tải được hợp đồng pin / sạc liên kết.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [orderId, reload]);
  return <>
    {loading ? <p role="status">Đang tải hợp đồng pin / sạc…</p> : error ? <p role="alert">{error} <button type="button" className="mg-button" onClick={() => setReload(value => value + 1)}>Thử lại</button></p>
      : rows.length ? <dl className="mg-contract-detail-grid">{rows.map(row => <div className="mg-field-wide" key={row.id}><dt>{row.code} · {batteryStatusLabel(row.status)}</dt><dd>{row.battery_name} · {row.vehicle_license || 'Chưa ghi biển số'}</dd></div>)}</dl> : <p>Chưa có hợp đồng thuê pin / sạc liên kết.</p>}
    <div className="mg-contract-type-actions">
      {onCreate && <button type="button" className="mg-button" onClick={onCreate}>Thêm hợp đồng thuê pin / sạc</button>}
      <Link className="mg-button" href={`/contracts/battery?vehicle_contract_id=${orderId}`}>Mở danh sách pin / sạc liên kết</Link>
    </div>
  </>;
}
