'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, FileText, LoaderCircle, RotateCcw, TriangleAlert } from 'lucide-react';
import { ManagementRow } from '@/lib/management/types';
import { optionLabel, MANAGEMENT_CONFIG } from '@/lib/management/config';
import { applyVehicleAction, loadSessionUserName, VehicleActionResult } from '@/lib/management/vehicle-repository';
import { vehicleTransferPhotoSlots } from '@/lib/management/record-photos';
import { formatDateTime } from '@/lib/formatters';
import { Dialog } from './Dialog';
import { useManagement } from './ManagementProvider';
import { mapApiRow } from '@/lib/management/repository';
import { vehicleTransferRoute, canCancelVehicleTransfer } from '@/lib/management/vehicle-history';
import { vehicleReceiveBlockReason, vehicleTransferBlockReason } from '@/lib/management/blocked-actions';
import type { OpenVehicleRental } from '@/lib/management/vehicle-reservation-window';
import Link from 'next/link';
import { VehicleTransferTelegramPanel } from './VehicleTransferTelegramPanel';
import { SavedRecordPhotos } from './RecordPhotoFields';

export type VehicleActionMode = 'transfer' | 'status' | 'receive' | 'reject' | 'cancel';
const STATUS_CHOICES = [{ value: 'using', label: 'Lập hợp đồng nháp' }, { value: 'ready', label: 'Lưu kho' }] as const;
const vehicleOption = (row: ManagementRow) => `${row.license || row.code} — ${row.name}`;
const plateKey=(value:string)=>value.toUpperCase().replace(/[^A-Z0-9]/g,'');
function resolveVehicle(rows:ManagementRow[],value:string){
  const full=rows.find(row=>vehicleOption(row)===value);if(full)return full;
  const key=plateKey(value);if(!key)return null;
  const matches=rows.filter(row=>plateKey(String(row.license||''))===key);
  return matches.length===1?matches[0]:null;
}

export function VehicleActionDialog({ mode, vehicle, onClose }: { mode: VehicleActionMode; vehicle: ManagementRow | null; onClose: () => void }) {
  const { dataset, ensureData, notify, accessUser } = useManagement();
  const reloadVehicles = () => { setError(''); void ensureData(['vehicles'], true).catch(() => setError('Không tải lại được danh sách xe.')); };
  const router = useRouter();
  const stores = dataset?.stores || [];
  const [destinations,setDestinations]=useState<{id:number;name:string}[]>([]);
  const [inventory,setInventory]=useState<ManagementRow[]>([]);
  const vehicles = useMemo(() => {
    const byId = new Map((dataset?.vehicles || []).map(row => [row.id, row]));
    if (mode==='transfer') {
      for (const row of inventory) {
        if (!byId.has(row.id)) byId.set(row.id, row);
      }
    }
    return [...byId.values()];
  }, [dataset, inventory, mode]);
  useEffect(()=>{if(mode!=='transfer')return;const controller=new AbortController();
    void fetch('/api/auth/vehicles/inventory',{signal:controller.signal,cache:'no-store'}).then(async response=>{
      const body=await response.json();if(response.ok&&body.status==='success'&&!controller.signal.aborted)setInventory(body.data.map((row:Record<string,unknown>)=>mapApiRow('vehicles',row)));
    }).catch(()=>{});return()=>controller.abort();
  },[mode]);
  useEffect(()=>{if(mode!=='transfer')return;const controller=new AbortController();void fetch('/api/auth/store-directory',{signal:controller.signal,cache:'no-store'}).then(async response=>{const body=await response.json();if(!response.ok||body.status!=='success')throw Error(body.message||'Không tải được cơ sở chuyển đến.');setDestinations(body.data.map((row:{id:string|number;store_name:string})=>({id:Number(row.id),name:row.store_name})));}).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Không tải được cơ sở chuyển đến.');});return()=>controller.abort();},[mode]);
  const [picked, setPicked] = useState(vehicle ? vehicleOption(vehicle) : '');
  const selected = vehicle || resolveVehicle(vehicles,picked);
  const otherStock=!selected?resolveVehicle(inventory,picked):null;
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
  const [result, setResult] = useState<(VehicleActionResult & { mode: VehicleActionMode }) | null>(null);
  const [saving, setSaving] = useState(false);
  const [photosPending, setPhotosPending] = useState(false);
  const busy = useRef(false);
  useEffect(() => { void loadSessionUserName().then(setActor).catch(() => {}); }, []);
  function pick(value: string) {
    setPicked(value);
    const next = resolveVehicle(vehicles,value);
    if (next?.id === selected?.id) return;
    const reset = defaults(next);
    setStatus(reset.status); setStoreId(reset.storeId); setError('');
  }
  const openRentals = (() => {
    try { return JSON.parse(String(selected?.rentals_json || '[]')) as OpenVehicleRental[]; }
    catch { return [] as OpenVehicleRental[]; }
  })();
  const rented = openRentals.length > 0;
  const sameDestination = mode === 'transfer' && Boolean(selected) && Boolean(storeId) && storeId === String(selected?.store_id);
  const receiveBlocked = (mode === 'receive' || mode === 'reject' || mode === 'cancel') && (!selected || currentStatus !== 'in_transit' || !selected.transfer_event_id || selected.transfer_receivable === 0);
  const transferBlock = mode === 'transfer'
    ? vehicleTransferBlockReason({
      selected: Boolean(selected),
      status: currentStatus,
      rentals: openRentals,
      sameDestination,
      storeName: String(selected?.store_name || ''),
    })
    : null;
  const receiveBlock = (mode === 'receive' || mode === 'reject' || mode === 'cancel') ? vehicleReceiveBlockReason(mode, receiveBlocked) : null;
  const cancelBlock = mode==='cancel'&&selected&&!canCancelVehicleTransfer(selected,accessUser?.id)?'Chỉ người đã tạo lượt điều chuyển còn chờ xử lý được tự huỷ. Nhấn Làm mới để kiểm tra.':null;
  const statusOpenBlock = mode === 'status' && rented
    ? `Xe đang thuộc ${openRentals[0]?.code ? `HĐ ${openRentals[0].code}${openRentals[0].customer ? ` · ${openRentals[0].customer}` : ''}` : 'hợp đồng mở'}. Trả xe trên hợp đồng trước khi đổi trạng thái.`
    : null;
  const submitBlockReason = transferBlock || receiveBlock || cancelBlock || statusOpenBlock;
  const title = mode === 'transfer' ? 'Chuyển xe' : mode === 'receive' ? 'Nhận xe' : mode === 'reject' ? 'Từ chối điều chuyển' : mode === 'cancel' ? 'Huỷ điều chuyển' : 'Đổi trạng thái';

  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy.current) return;
    if (!selected) return setError('Chọn xe cần thao tác.');
    if (submitBlockReason) return setError(submitBlockReason);
    if (mode === 'transfer' && !storeId) return setError('Chọn cơ sở chuyển đến.');
    if (mode === 'status' && status !== 'ready' && status !== 'using') return setError('Chọn trạng thái Đang thuê hoặc Lưu kho.');
    if (mode === 'status' && status === currentStatus) return setError(`Xe đang ở trạng thái ${optionLabel(MANAGEMENT_CONFIG.vehicles, 'status', currentStatus)}.`);
    if (mode === 'status' && !storeId) return setError('Chọn cơ sở sử dụng xe.');
    if (mode === 'status' && status === 'using' && (!customer.name.trim() || !customer.phone.trim() || !customer.idCard.trim())) return setError('Nhập tên, số điện thoại và CCCD của khách thuê.');
    busy.current = true; setSaving(true); setError('');
    try {
      const revision=selected.vehicle_revision ? String(selected.vehicle_revision) : undefined;
      const saved = await applyVehicleAction(selected.id, mode === 'transfer' ? { action: 'transfer', to_store_id: storeId, note, revision }
        : mode==='receive'?{action:'receive',transfer_event_id:String(selected.transfer_event_id),note,revision}
        : mode==='reject'?{action:'reject',transfer_event_id:String(selected.transfer_event_id),note,revision}
        : mode==='cancel'?{action:'cancel',transfer_event_id:String(selected.transfer_event_id),note,revision}
        : { action: 'status', status: status as 'ready' | 'using', beneficiary_store_id: storeId, customer_name: customer.name, customer_phone: customer.phone, customer_id_card: customer.idCard, note, revision });
      await ensureData(saved.customer ? ['vehicles', 'customers', 'contracts'] : mode==='transfer'||mode==='receive'||mode==='reject'||mode==='cancel'?['vehicles','stores']:['vehicles'], true).catch(() => {});
      const destName = stores.find(store => String(store.id) === storeId)?.name || 'cơ sở đích';
      notify(mode === 'transfer'
        ? saved.transfer_completed
          ? `Đã chuyển kho xe ${selected.license} sang ${destName}. Giữ nguyên trạng thái “${optionLabel(MANAGEMENT_CONFIG.vehicles, 'status', currentStatus)}”. Đã lưu lịch sử.`
          : `Xe ${selected.license} chuyển sang Chờ luân chuyển tại ${destName}. Đã lưu lịch sử.`
        : mode==='receive'?`Đã nhận xe ${selected.license} tại ${selected.transfer_to_store_name||selected.store_name}. Xe chuyển sang Lưu kho. Đã lưu lịch sử.`:mode==='reject'||mode==='cancel'?`Đã ${mode==='cancel'?'huỷ':'từ chối'} điều chuyển xe ${selected.license}. Xe về Lưu kho tại ${selected.transfer_from_store_name||'cơ sở chuyển đi'}.` :saved.draft?'Đã tạo hợp đồng nháp. Xe vẫn Lưu kho đến khi phát hành hợp đồng.':`Đã đổi trạng thái xe ${selected.license}.`);
      if (saved.draft || saved.telegram_event_id || (mode === 'transfer' && !saved.transfer_completed) || mode === 'receive') setResult({ ...saved, mode }); else onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không lưu được thao tác xe.'); }
    finally { busy.current = false; setSaving(false); }
  }

  if (result && (result.mode === 'transfer' || result.mode === 'receive')) {
    const photoKind = result.mode === 'receive' ? 'receive' : 'transfer';
    return <Dialog title={result.mode === 'receive' ? 'Đã nhận xe · Tải ảnh' : 'Đã chuyển xe · Tải ảnh'} onClose={() => { if (!photosPending) onClose(); }}>
      <div className="mg-dialog-body">
        <p role="status">{result.mode === 'receive' ? 'Xe đã về Lưu kho tại cơ sở nhận. Có thể chọn nhiều ảnh nhận xe bên dưới.' : 'Xe đang Chờ luân chuyển. Có thể chọn nhiều ảnh chuyển xe bên dưới.'}</p>
        <SavedRecordPhotos entity="vehicles" recordId={result.id} slots={vehicleTransferPhotoSlots(result.event_id, photoKind)}
          title={result.mode === 'receive' ? 'Ảnh nhận xe' : 'Ảnh chuyển xe'} compact bulkImageLabel={result.mode === 'receive' ? 'Chọn nhiều ảnh nhận xe' : 'Chọn nhiều ảnh chuyển xe'} onPendingChange={setPhotosPending} />
        {result.telegram_event_id && <VehicleTransferTelegramPanel vehicleId={result.id} eventId={result.telegram_event_id} />}
      </div>
      <div className="mg-dialog-footer"><button type="button" className="mg-button" disabled={photosPending} onClick={onClose}>Đóng</button></div>
    </Dialog>;
  }
  if (result?.draft) return <Dialog title="Đã tạo hợp đồng nháp" subtitle={selected ? vehicleOption(selected) : ''} onClose={onClose}>
    <div className="mg-dialog-body"><ul className="mg-vehicle-action-result">
      <li><Check size={16} />Xe vẫn <strong>Lưu kho</strong>. Chỉ chuyển sang Đang thuê sau khi phát hành hợp đồng.</li>
      {result.customer && <li className={result.customer.created ? undefined : 'is-warning'}>{result.customer.created ? <Check size={16} /> : <TriangleAlert size={16} />}
        {result.customer.created ? <>Đã thêm khách hàng mới <strong>{result.customer.name}</strong> (#{result.customer.id}).</>
          : <>Khách hàng đã tồn tại: <strong>{result.customer.name}</strong> (#{result.customer.id}), trùng {result.customer.matched_by}. Hợp đồng dùng hồ sơ có sẵn.</>}</li>}
      <li><Check size={16} />Đã tạo hợp đồng nháp <strong>{result.draft.code}</strong> điền sẵn khách, xe, cơ sở và giờ thuê.</li>
    </ul></div>
    <div className="mg-dialog-footer"><button type="button" className="mg-button" onClick={onClose}>Đóng</button>
      <button type="button" className="mg-button mg-button-primary" onClick={() => { onClose(); router.push(`/contracts/drafts?contract_id=${result.draft!.id}`); }}><FileText size={16} />Mở hợp đồng nháp</button></div>
  </Dialog>;

  return <Dialog title={title} subtitle={selected ? vehicleOption(selected) : 'Chọn xe cần thao tác'} onClose={() => { if (!busy.current && !photosPending) onClose(); }}>
    <form noValidate onSubmit={submit}><div className="mg-dialog-body"><div className="mg-form-grid">
      <div className="mg-field mg-field-wide"><label htmlFor="vehicle-action-vehicle">Xe<span aria-hidden="true"> *</span></label>
        <input id="vehicle-action-vehicle" list="vehicle-action-options" autoComplete="off" value={picked} disabled={saving || Boolean(vehicle)} placeholder="Nhập biển số hoặc tên xe…" onChange={event => pick(event.target.value)} />
        <datalist id="vehicle-action-options">{vehicles.map(row => <option key={row.id} value={vehicleOption(row)} />)}</datalist>
        {selected && <small>Hiện tại: {optionLabel(MANAGEMENT_CONFIG.vehicles, 'status', currentStatus)} · {String(selected.store_name || '—')}</small>}
        {mode==='transfer'&&<small>Có thể chọn xe ở mọi cơ sở để điều chuyển.</small>}
        {submitBlockReason && <p className="mg-field-error" role="alert">{submitBlockReason}</p>}
        {selected && !rented && ['using','rent'].includes(currentStatus) && <small>Không còn hợp đồng mở. Chọn Lưu kho nếu cần phát hành hợp đồng mới.</small>}
        {selected&&rented&&<Link className="mg-button" href={`/contracts?action=return&query=${encodeURIComponent(String(selected.license||''))}`} onClick={onClose}>Tìm hợp đồng đang thuê · Trả xe & hoàn cọc</Link>}
        </div>
      {mode==='receive'||mode==='reject'||mode==='cancel'?<>
        <p className="mg-transfer-direction mg-field-wide">{selected?vehicleTransferRoute(selected):''}</p>
        <div className="mg-field"><label htmlFor="vehicle-receive-from">Cơ sở chuyển đi</label><input id="vehicle-receive-from" value={String(selected?.transfer_from_store_name||'')} readOnly disabled/></div>
        <div className="mg-field"><label htmlFor="vehicle-receive-to">Cơ sở nhận xe</label><input id="vehicle-receive-to" value={String(selected?.transfer_to_store_name||selected?.store_name||'')} readOnly disabled/></div>
        <p className="mg-composer-hint mg-field-wide">{mode==='cancel'?`Xác nhận huỷ lượt chuyển xe ${selected?.license||''}? Xe sẽ về Lưu kho tại ${selected?.transfer_from_store_name||'cơ sở chuyển đi'}. Chỉ người tạo lệnh được huỷ khi bên nhận chưa xác nhận. Lệnh gốc và lịch sử huỷ được giữ lại.`:mode==='reject'?'Từ chối khi cơ sở đích không nhận xe. Xe về Lưu kho tại cơ sở chuyển đi và lần điều chuyển được đóng. Có thể thêm lý do từ chối bên dưới.':'Chỉ xác nhận khi xe đã đến cơ sở nhận. Xe chuyển từ Chờ luân chuyển sang Lưu kho; sau đó có thể chọn nhiều ảnh nhận xe. Ngày giờ và người nhận được lưu trong Lịch sử.'}</p>
      </>:mode === 'transfer' ? <>
        <div className="mg-field"><label htmlFor="vehicle-action-from">Cơ sở hiện tại</label><input id="vehicle-action-from" value={String(selected?.store_name || otherStock?.store_name || '')} readOnly disabled /></div>
        <div className="mg-field"><label htmlFor="vehicle-action-to">Chuyển đến cơ sở<span aria-hidden="true"> *</span></label>
          <select id="vehicle-action-to" value={storeId} disabled={saving} onChange={event => setStoreId(event.target.value)}>
            <option value="">Chọn cơ sở</option>{(destinations.length?destinations:stores).filter(store => String(store.id) !== String(selected?.store_id)).map(store => <option key={store.id} value={String(store.id)}>{store.name}</option>)}</select></div>
        <p className="mg-composer-hint mg-field-wide">{currentStatus === 'ready'
          ? 'Xe đang Lưu kho: sau khi lưu sẽ sang Chờ luân chuyển tại cơ sở đích; khi xe đến nơi bấm Nhận xe. Có thể đính ảnh chuyển xe.'
          : 'Xe không ở Lưu kho (đang thuê, bảo dưỡng…): đổi cơ sở kho ngay, giữ nguyên trạng thái. Hợp đồng mở không chặn điều chuyển.'}</p>
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
      <div className="mg-dialog-footer">
        <span className="mg-form-note" role={submitBlockReason ? 'status' : undefined}>
          {submitBlockReason || 'Ngày giờ và người nhập được ghi tự động khi lưu.'}
        </span>
        <button type="button" className="mg-button" disabled={saving} onClick={reloadVehicles}><RotateCcw size={16}/>Làm mới</button>
        <button type="button" className="mg-button" disabled={saving} onClick={onClose}>{mode==='cancel'?'Quay lại':'Hủy'}</button>
        <button type="submit" className={`mg-button ${mode==='reject'||mode==='cancel'?'mg-button-danger':'mg-button-primary'}`}
          disabled={saving || Boolean(submitBlockReason) || (mode === 'transfer' && !storeId)}
          title={submitBlockReason || (mode === 'transfer' && !storeId ? 'Chọn cơ sở chuyển đến.' : undefined)}
          aria-label={submitBlockReason ? `${title}. ${submitBlockReason}` : undefined}>
          {saving ? <LoaderCircle size={16} className="mg-spin" /> : <Check size={16} />}
          {saving ? 'Đang lưu…' : mode==='receive'?'Xác nhận đã nhận xe':mode==='reject'?'Xác nhận từ chối điều chuyển':mode==='cancel'?'Xác nhận huỷ điều chuyển':title}
        </button></div>
    </form>
  </Dialog>;
}
