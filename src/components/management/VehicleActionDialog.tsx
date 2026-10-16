'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, FileText, LoaderCircle, TriangleAlert } from 'lucide-react';
import { ManagementRow } from '@/lib/management/types';
import { optionLabel, MANAGEMENT_CONFIG } from '@/lib/management/config';
import { applyVehicleAction, loadSessionUserName, VehicleActionResult } from '@/lib/management/vehicle-repository';
import { formatDateTime } from '@/lib/formatters';
import { Dialog } from './Dialog';
import { useManagement } from './ManagementProvider';
import { vehicleTransferRoute } from '@/lib/management/vehicle-history';

export type VehicleActionMode = 'transfer' | 'status' | 'receive';
const STATUS_CHOICES = [{ value: 'using', label: 'Đang thuê' }, { value: 'ready', label: 'Lưu kho' }] as const;
const vehicleOption = (row: ManagementRow) => `${row.license || row.code} — ${row.name}`;

export function VehicleActionDialog({ mode, vehicle, onClose }: { mode: VehicleActionMode; vehicle: ManagementRow | null; onClose: () => void }) {
  const { dataset, ensureData, notify } = useManagement();
  const router = useRouter();
  const vehicles = useMemo(() => dataset?.vehicles || [], [dataset]);
  const stores = dataset?.stores || [];
  const [picked, setPicked] = useState(vehicle ? vehicleOption(vehicle) : '');
  const selected = vehicle || vehicles.find(row => vehicleOption(row) === picked) || null;
  const statusOf = (row: ManagementRow | null) => row ? (String(row.status) === 'rent' ? 'using' : String(row.status)) : '';
  const currentStatus = statusOf(selected);
  const defaults = (row: ManagementRow | null) => ({
    status: mode === 'status' && (statusOf(row) === 'using' || statusOf(row) === 'ready') ? statusOf(row) : '',
    storeId: mode === 'status' && row ? String(row.store_id || '') : '',
  });
  const [status, setStatus] = useState(() => defaults(vehicle).status);
  const [storeId, setStoreId] = useState(() => defaults(vehicle).storeId);
  const [customer, setCustomer] = useState({ name: '', phone: '', idCard: '' });
  const [note, setNote] = useState('');
  const [actor, setActor] = useState('');
  const [openedAt] = useState(() => new Date().toISOString());
  const [error, setError] = useState('');
  const [result, setResult] = useState<VehicleActionResult | null>(null);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  useEffect(() => { void loadSessionUserName().then(setActor).catch(() => {}); }, []);
  function pick(value: string) {
    setPicked(value);
    const next = vehicles.find(row => vehicleOption(row) === value) || null;
    if (next?.id === selected?.id) return;
    const reset = defaults(next);
    setStatus(reset.status); setStoreId(reset.storeId); setError('');
  }
  const rented = (() => { try { return JSON.parse(String(selected?.rentals_json || '[]')).length > 0; } catch { return false; } })();
  const transferBlocked = mode === 'transfer' && Boolean(selected) && currentStatus !== 'ready';
  const receiveBlocked=mode==='receive' && (!selected||currentStatus!=='in_transit'||!selected.transfer_event_id||selected.transfer_receivable===0);
  const title = mode === 'transfer' ? 'Chuyển xe' : mode==='receive'?'Nhận xe':'Đổi trạng thái';

  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy.current) return;
    if (!selected) return setError('Chọn xe cần thao tác.');
    if (transferBlocked) return setError('Chỉ chuyển xe đang Lưu kho. Kiểm tra trạng thái xe rồi thao tác lại.');
    if(receiveBlocked)return setError('Không xác định được lần chuyển xe đang chờ nhận. Nhấn Làm mới rồi kiểm tra lịch sử.');
    if (mode === 'transfer' && !storeId) return setError('Chọn cơ sở chuyển đến.');
    if (mode === 'transfer' && storeId === String(selected.store_id)) return setError('Xe đang ở cơ sở này. Chọn cơ sở khác.');
    if (mode === 'status' && status !== 'ready' && status !== 'using') return setError('Chọn trạng thái Đang thuê hoặc Lưu kho.');
    if (mode === 'status' && status === currentStatus) return setError(`Xe đang ở trạng thái ${optionLabel(MANAGEMENT_CONFIG.vehicles, 'status', currentStatus)}.`);
    if (mode === 'status' && !storeId) return setError('Chọn cơ sở sử dụng xe.');
    if (mode === 'status' && status === 'using' && (!customer.name.trim() || !customer.phone.trim() || !customer.idCard.trim())) return setError('Nhập tên, số điện thoại và CCCD của khách thuê.');
    busy.current = true; setSaving(true); setError('');
    try {
      const revision=selected.vehicle_revision ? String(selected.vehicle_revision) : undefined;
      const saved = await applyVehicleAction(selected.id, mode === 'transfer' ? { action: 'transfer', to_store_id: storeId, note, revision }
        : mode==='receive'?{action:'receive',transfer_event_id:String(selected.transfer_event_id),note,revision}
        : { action: 'status', status: status as 'ready' | 'using', beneficiary_store_id: storeId, customer_name: customer.name, customer_phone: customer.phone, customer_id_card: customer.idCard, note, revision });
      await ensureData(saved.customer ? ['vehicles', 'customers', 'contracts'] : mode==='transfer'||mode==='receive'?['vehicles','stores']:['vehicles'], true).catch(() => {});
      notify(mode === 'transfer' ? `Xe ${selected.license} chuyển sang Chờ luân chuyển tại ${stores.find(store=>String(store.id)===storeId)?.name || 'cơ sở đích'}. Đã lưu lịch sử.` : mode==='receive'?`Đã nhận xe ${selected.license} tại ${selected.transfer_to_store_name||selected.store_name}. Xe chuyển sang Lưu kho. Đã lưu lịch sử.`:`Đã đổi trạng thái xe ${selected.license}.`);
      if (saved.draft) setResult(saved); else onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không lưu được thao tác xe.'); }
    finally { busy.current = false; setSaving(false); }
  }

  if (result?.draft) return <Dialog title="Đã đổi trạng thái" subtitle={selected ? vehicleOption(selected) : ''} onClose={onClose}>
    <div className="mg-dialog-body"><ul className="mg-vehicle-action-result">
      <li><Check size={16} />Xe chuyển sang <strong>Đang thuê</strong>.</li>
      {result.customer && <li className={result.customer.created ? undefined : 'is-warning'}>{result.customer.created ? <Check size={16} /> : <TriangleAlert size={16} />}
        {result.customer.created ? <>Đã thêm khách hàng mới <strong>{result.customer.name}</strong> (#{result.customer.id}).</>
          : <>Khách hàng đã tồn tại: <strong>{result.customer.name}</strong> (#{result.customer.id}), trùng {result.customer.matched_by}. Hợp đồng dùng hồ sơ có sẵn.</>}</li>}
      <li><Check size={16} />Đã tạo hợp đồng nháp <strong>{result.draft.code}</strong> điền sẵn khách, xe, cơ sở và giờ thuê.</li>
    </ul></div>
    <div className="mg-dialog-footer"><button type="button" className="mg-button" onClick={onClose}>Đóng</button>
      <button type="button" className="mg-button mg-button-primary" onClick={() => { onClose(); router.push(`/contracts/drafts?contract_id=${result.draft!.id}`); }}><FileText size={16} />Mở hợp đồng nháp</button></div>
  </Dialog>;

  return <Dialog title={title} subtitle={selected ? vehicleOption(selected) : 'Chọn xe cần thao tác'} onClose={() => { if (!busy.current) onClose(); }}>
    <form noValidate onSubmit={submit}><div className="mg-dialog-body"><div className="mg-form-grid">
      <div className="mg-field mg-field-wide"><label htmlFor="vehicle-action-vehicle">Xe<span aria-hidden="true"> *</span></label>
        <input id="vehicle-action-vehicle" list="vehicle-action-options" value={picked} disabled={saving || Boolean(vehicle)} placeholder="Nhập biển số hoặc tên xe…" onChange={event => pick(event.target.value)} />
        <datalist id="vehicle-action-options">{vehicles.map(row => <option key={row.id} value={vehicleOption(row)} />)}</datalist>
        {selected && <small>Hiện tại: {optionLabel(MANAGEMENT_CONFIG.vehicles, 'status', currentStatus)} · {String(selected.store_name || '—')}</small>}
        {rented && <small className="mg-field-error">Xe đang thuộc hợp đồng mở. Trả xe trên hợp đồng trước khi {mode === 'transfer' ? 'chuyển xe' : 'đổi trạng thái'}.</small>}
        {transferBlocked && !rented && <small className="mg-field-error">Chỉ chuyển xe đang Lưu kho.</small>}</div>
      {mode==='receive'?<>
        <p className="mg-transfer-direction mg-field-wide">{selected?vehicleTransferRoute(selected):''}</p>
        <div className="mg-field"><label htmlFor="vehicle-receive-from">Cơ sở chuyển đi</label><input id="vehicle-receive-from" value={String(selected?.transfer_from_store_name||'')} readOnly disabled/></div>
        <div className="mg-field"><label htmlFor="vehicle-receive-to">Cơ sở nhận xe</label><input id="vehicle-receive-to" value={String(selected?.transfer_to_store_name||selected?.store_name||'')} readOnly disabled/></div>
        <p className="mg-composer-hint mg-field-wide">Chỉ xác nhận khi xe đã đến cơ sở nhận. Xe chuyển từ Chờ luân chuyển sang Lưu kho; ngày giờ và người nhận được lưu trong Lịch sử.</p>
        {receiveBlocked&&<p className="mg-field-error mg-field-wide" role="alert">Lần chuyển xe không còn chờ nhận hoặc thiếu thông tin. Đóng hộp thoại, nhấn Làm mới rồi kiểm tra lịch sử.</p>}
      </>:mode === 'transfer' ? <>
        <div className="mg-field"><label htmlFor="vehicle-action-from">Cơ sở hiện tại</label><input id="vehicle-action-from" value={String(selected?.store_name || '')} readOnly disabled /></div>
        <div className="mg-field"><label htmlFor="vehicle-action-to">Chuyển đến cơ sở<span aria-hidden="true"> *</span></label>
          <select id="vehicle-action-to" value={storeId} disabled={saving} onChange={event => setStoreId(event.target.value)}>
            <option value="">Chọn cơ sở</option>{stores.filter(store => String(store.id) !== String(selected?.store_id)).map(store => <option key={store.id} value={String(store.id)}>{store.name}</option>)}</select></div>
        <p className="mg-composer-hint mg-field-wide">Khi lưu, xe chuyển sang Chờ luân chuyển tại cơ sở đích. Khi xe đến nơi, bấm Nhận xe để xác nhận. Mỗi thao tác đều được ghi vào Lịch sử.</p>
      </> : <>
        <div className="mg-field"><label htmlFor="vehicle-action-status">Trạng thái<span aria-hidden="true"> *</span></label>
          <select id="vehicle-action-status" value={status} disabled={saving || !selected} onChange={event => setStatus(event.target.value)}>
            {status === '' && <option value="">{selected ? `${optionLabel(MANAGEMENT_CONFIG.vehicles, 'status', currentStatus)} (hiện tại)` : 'Chọn trạng thái'}</option>}
            {STATUS_CHOICES.map(option => <option key={option.value} value={option.value}>{option.label}{option.value === currentStatus ? ' (hiện tại)' : ''}</option>)}</select></div>
        <div className="mg-field"><label htmlFor="vehicle-action-store">Cơ sở sử dụng xe<span aria-hidden="true"> *</span></label>
          <select id="vehicle-action-store" value={storeId} disabled={saving || !selected} onChange={event => setStoreId(event.target.value)}>
            <option value="">Chọn cơ sở</option>{stores.map(store => <option key={store.id} value={String(store.id)}>{store.name}</option>)}</select></div>
        <div className="mg-field"><label htmlFor="vehicle-action-customer">Tên khách{status === 'using' && <span aria-hidden="true"> *</span>}</label>
          <input id="vehicle-action-customer" value={customer.name} maxLength={191} disabled={saving} onChange={event => setCustomer(current => ({ ...current, name: event.target.value }))} /></div>
        <div className="mg-field"><label htmlFor="vehicle-action-phone">SĐT{status === 'using' && <span aria-hidden="true"> *</span>}</label>
          <input id="vehicle-action-phone" type="tel" inputMode="tel" value={customer.phone} maxLength={20} disabled={saving} onChange={event => setCustomer(current => ({ ...current, phone: event.target.value }))} /></div>
        <div className="mg-field"><label htmlFor="vehicle-action-idcard">CCCD{status === 'using' && <span aria-hidden="true"> *</span>}</label>
          <input id="vehicle-action-idcard" inputMode="numeric" value={customer.idCard} maxLength={12} disabled={saving} onChange={event => setCustomer(current => ({ ...current, idCard: event.target.value }))} /></div>
      </>}
      <div className="mg-field"><label htmlFor="vehicle-action-at">Ngày giờ</label><input id="vehicle-action-at" value={formatDateTime(openedAt)} readOnly disabled /></div>
      <div className="mg-field"><label htmlFor="vehicle-action-actor">Người nhập</label><input id="vehicle-action-actor" value={actor || 'Đang tải…'} readOnly disabled /></div>
      <div className="mg-field mg-field-wide"><label htmlFor="vehicle-action-note">Ghi chú</label>
        <textarea id="vehicle-action-note" value={note} maxLength={500} disabled={saving} onChange={event => setNote(event.target.value)} /></div>
    </div>{error && <p className="mg-error-message" role="alert">{error}</p>}</div>
      <div className="mg-dialog-footer"><span className="mg-form-note">Ngày giờ và người nhập được ghi tự động khi lưu.</span><button type="button" className="mg-button" disabled={saving} onClick={onClose}>Hủy</button>
        <button type="submit" className="mg-button mg-button-primary" disabled={saving || !selected || rented || transferBlocked || receiveBlocked}>{saving ? <LoaderCircle size={16} className="mg-spin" /> : <Check size={16} />}{saving ? 'Đang lưu…' : mode==='receive'?'Xác nhận đã nhận xe':title}</button></div>
    </form>
  </Dialog>;
}
