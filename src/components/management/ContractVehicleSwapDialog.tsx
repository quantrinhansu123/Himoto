'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bike, LoaderCircle, RotateCcw } from 'lucide-react';
import { changeContractVehicle, loadContractReturnableItems, ReturnableContractItem } from '@/lib/management/contract-returns';
import { formatDateTime } from '@/lib/formatters';
import { contractSwapCandidates, swapStockLabel } from '@/lib/management/contract-swap-candidates';
import { mapApiRow } from '@/lib/management/repository';
import type { ManagementRow } from '@/lib/management/types';
import { VehiclePicker } from '@/components/contracts/VehiclePicker';
import { useManagement } from './ManagementProvider';
import { Dialog } from './Dialog';
import { ContractVehicleSwapFollowup } from './ContractVehicleSwapFollowup';

export function ContractVehicleSwapDialog({ orderId, contractCode, onClose }: { orderId: number; contractCode: string; onClose: () => void }) {
  const { dataset, notify, reload, invalidateData } = useManagement();
  const [rows, setRows] = useState<ReturnableContractItem[]>([]);
  const [itemId, setItemId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [photosPending, setPhotosPending] = useState(false);
  const [inventory, setInventory] = useState<ManagementRow[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [inventoryError, setInventoryError] = useState('');
  const [inventoryReload, setInventoryReload] = useState(0);
  const [done, setDone] = useState<{ oldLicense: string; newLicense: string; swapId: number; orderId: number } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setInventoryLoading(true); setInventoryError(''); setInventory([]); setVehicleId('');
    void fetch('/api/auth/vehicles/inventory', { signal: controller.signal, cache: 'no-store', credentials: 'same-origin' })
      .then(async response => {
        const body = await response.json();
        if (!response.ok || body.status !== 'success' || !Array.isArray(body.data)) throw new Error(body.message || 'Không tải được kho xe thay thế.');
        if (!controller.signal.aborted) setInventory((body.data as Record<string, unknown>[]).map(row => mapApiRow('vehicles', row)));
      }).catch(cause => { if (!controller.signal.aborted) setInventoryError(cause instanceof Error ? cause.message : 'Không tải được kho xe thay thế.'); })
      .finally(() => { if (!controller.signal.aborted) setInventoryLoading(false); });
    return () => controller.abort();
  }, [inventoryReload]);

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
  const replacements = useMemo(() => {
    if (!selected) return [];
    return contractSwapCandidates(selected, inventory, dataset?.stores || []);
  }, [dataset?.stores, inventory, selected]);
  const stockLabel = selected ? swapStockLabel(selected) : 'cơ sở của hợp đồng';

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !vehicleId || saving || photosPending || inventoryLoading || inventoryError || !replacements.some(vehicle => String(vehicle.id) === vehicleId)) return;
    setSaving(true); setError('');
    try {
      const result = await changeContractVehicle({ item_id: selected.item_id, item_revision: selected.item_revision, vehicle_id: Number(vehicleId) });
      notify(`${selected.contract_code}: đã đổi xe ${result.old_license} → ${result.new_license}; trạng thái xe và thông tin xe trên hợp đồng đã cập nhật.`);
      invalidateData(['vehicles', 'customers']);
      await reload(['contracts', 'vehicles']);
      setDone({ oldLicense: result.old_license, newLicense: result.new_license, swapId: result.swap_id, orderId: result.order_id });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không đổi được xe trong hợp đồng.'); }
    finally { setSaving(false); }
  }

  return <Dialog title={`Đổi xe · ${contractCode}`} subtitle="Thao tác trực tiếp trên hợp đồng đã chọn" onClose={() => { if (!saving && !photosPending) onClose(); }}>
    <form onSubmit={submit}>
      <div className="mg-dialog-body">
        {done ? <div className="mg-cashbook-followup">
          <p role="status">Đã đổi xe {done.oldLicense} → {done.newLicense}. Lưu ảnh rồi bấm Kiểm tra &amp; gửi Telegram để gửi thông tin và ảnh của lượt đổi xe.</p>
          <ContractVehicleSwapFollowup id={done.orderId} swapId={done.swapId} onPendingChange={setPhotosPending}/>
        </div> : <>
          {loading && <p role="status"><LoaderCircle size={17} className="mg-spin" /> Đang tải xe của hợp đồng…</p>}
          {!loading && !rows.length && <p>Hợp đồng này không còn xe đang thuê để đổi.</p>}
          {rows.length > 1 && <div className="mg-field"><label htmlFor="contract-swap-item">Xe trong hợp đồng</label><select id="contract-swap-item" value={itemId} onChange={event => { setItemId(event.target.value); setVehicleId(''); }}><option value="">Chọn xe cần đổi</option>{rows.map(row => <option key={row.item_id} value={row.item_id}>{row.vehicle_name} · {row.license}</option>)}</select></div>}
          {selected && <>
            <div className="mg-field">
              <label htmlFor="contract-swap-replacement">Xe thay thế · {stockLabel}</label>
              <VehiclePicker id="contract-swap-replacement" index={0} vehicles={replacements} value={vehicleId} storeName={stockLabel} placeholder={`Gõ biển số hoặc tên xe tại ${stockLabel}`}
                monthly={false} ownOrderId={orderId} takenIds={[]} disabled={saving || inventoryLoading || Boolean(inventoryError)} invalid={!vehicleId}
                onChange={setVehicleId} />
              <button type="button" className="mg-button" disabled={saving || inventoryLoading} onClick={() => setInventoryReload(value => value + 1)}><RotateCcw size={15} />Làm mới xe thay thế</button>
              {inventoryLoading && <p role="status">Đang tải xe Lưu kho tại {stockLabel}…</p>}
              {inventoryError && <p className="mg-field-error" role="alert">{inventoryError} Bấm Làm mới xe thay thế để thử lại.</p>}
            </div>
            <p className="mg-composer-hint">Gõ tên xe hoặc biển số để tìm nhanh. Xe cũ về Lưu kho, xe mới sang Đang thuê; phần xe trên hợp đồng (tên, biển số…) đổi theo xe mới. Khách hàng, thời hạn và giá thuê giữ nguyên. Hạn trả hiện tại: {formatDateTime(selected.scheduled_return_at)}. Sau khi đổi có thể chọn nhiều ảnh và bổ sung sau.</p>
            <p className="mg-composer-hint">Xe được chọn trong hợp đồng nháp vẫn hiện kèm cảnh báo giữ chỗ. Kiểm tra nháp liên quan trước khi đổi; hệ thống kiểm tra lại xe Lưu kho và hợp đồng thực tế khi lưu.</p>
            {!inventoryLoading && !inventoryError && !replacements.length && <p className="mg-field-error">Không có xe Lưu kho phù hợp tại {stockLabel} hoặc xe còn hợp đồng giữ chỗ.</p>}
          </>}
          {error && <p className="mg-error-message" role="alert">{error}</p>}
        </>}
      </div>
      <div className="mg-dialog-footer">
        <button type="button" className="mg-button" disabled={saving || photosPending} onClick={onClose}>{done ? 'Đóng' : 'Hủy'}</button>
        {!done && selected && <button type="submit" className="mg-button mg-button-primary" disabled={loading || saving || inventoryLoading || Boolean(inventoryError) || !vehicleId}>{saving ? <LoaderCircle size={16} className="mg-spin" /> : <Bike size={16} />}{saving ? 'Đang đổi…' : 'Đổi xe trong hợp đồng'}</button>}
      </div>
    </form>
  </Dialog>;
}
