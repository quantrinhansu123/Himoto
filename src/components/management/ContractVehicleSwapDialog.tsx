'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bike, LoaderCircle } from 'lucide-react';
import { changeContractVehicle, loadContractReturnableItems, ReturnableContractItem } from '@/lib/management/contract-returns';
import { formatDateTime } from '@/lib/formatters';
import { useManagement } from './ManagementProvider';
import { Dialog } from './Dialog';

export function ContractVehicleSwapDialog({ orderId, contractCode, onClose }: { orderId: number; contractCode: string; onClose: () => void }) {
  const { dataset, notify, reload } = useManagement();
  const [rows, setRows] = useState<ReturnableContractItem[]>([]);
  const [itemId, setItemId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
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
  const replacements = useMemo(() => selected ? (dataset?.vehicles || []).filter(vehicle =>
    String(vehicle.store_id) === String(selected.store_id) && vehicle.status === 'ready' && vehicle.id !== selected.vehicle_id) : [], [dataset, selected]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !vehicleId || saving) return;
    setSaving(true); setError('');
    try {
      const result = await changeContractVehicle({ item_id: selected.item_id, item_revision: selected.item_revision, vehicle_id: Number(vehicleId) });
      notify(`${selected.contract_code}: đã đổi xe ${result.old_license} → ${result.new_license}; hợp đồng được giữ nguyên.`);
      await reload();
      onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không đổi được xe trong hợp đồng.'); }
    finally { setSaving(false); }
  }

  return <Dialog title={`Đổi xe · ${contractCode}`} subtitle="Thao tác trực tiếp trên hợp đồng đã chọn" onClose={() => { if (!saving) onClose(); }}>
    <form onSubmit={submit}>
      <div className="mg-dialog-body">
        {loading && <p role="status"><LoaderCircle size={17} className="mg-spin" /> Đang tải xe của hợp đồng…</p>}
        {!loading && !rows.length && <p>Hợp đồng này không còn xe đang thuê để đổi.</p>}
        {rows.length > 1 && <div className="mg-field"><label htmlFor="contract-swap-item">Xe trong hợp đồng</label><select id="contract-swap-item" value={itemId} onChange={event => { setItemId(event.target.value); setVehicleId(''); }}><option value="">Chọn xe cần đổi</option>{rows.map(row => <option key={row.item_id} value={row.item_id}>{row.vehicle_name} · {row.license}</option>)}</select></div>}
        {selected && <>
          <div className="mg-field"><label htmlFor="contract-swap-replacement">Xe thay thế tại {selected.store_name}</label><select id="contract-swap-replacement" required value={vehicleId} onChange={event => setVehicleId(event.target.value)}><option value="">Chọn xe sẵn sàng</option>{replacements.map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicle.name} · {vehicle.license}</option>)}</select></div>
          <p className="mg-composer-hint">Chỉ thay xe và biển số. Khách hàng, thời hạn, giá thuê và các thông tin khác được giữ nguyên. Hạn trả hiện tại: {formatDateTime(selected.scheduled_return_at)}.</p>
          {!replacements.length && <p className="mg-field-error">Không có xe sẵn sàng tại cơ sở này.</p>}
        </>}
        {error && <p className="mg-error-message" role="alert">{error}</p>}
      </div>
      <div className="mg-dialog-footer"><button type="button" className="mg-button" disabled={saving} onClick={onClose}>Đóng</button>{selected && <button type="submit" className="mg-button mg-button-primary" disabled={loading || saving || !vehicleId}>{saving ? <LoaderCircle size={16} className="mg-spin" /> : <Bike size={16} />}{saving ? 'Đang đổi…' : 'Đổi xe trong hợp đồng'}</button>}</div>
    </form>
  </Dialog>;
}
