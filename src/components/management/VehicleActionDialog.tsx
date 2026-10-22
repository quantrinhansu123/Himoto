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
import { vehicleTransferRoute } from '@/lib/management/vehicle-history';
import Link from 'next/link';
import { VehicleTransferTelegramPanel } from './VehicleTransferTelegramPanel';
import { SavedRecordPhotos } from './RecordPhotoFields';

export type VehicleActionMode = 'transfer' | 'status' | 'receive';
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
  const { dataset, ensureData, notify } = useManagement();
  const reloadVehicles = () => { setError(''); void ensureData(['vehicles'], true).catch(() => setError('Không tải lại được danh sách xe.')); };
  const router = useRouter();
  const vehicles = useMemo(() => dataset?.vehicles || [], [dataset]);
  const stores = dataset?.stores || [];
  const [destinations,setDestinations]=useState<{id:number;name:string}[]>([]);
  const [inventory,setInventory]=useState<ManagementRow[]>([]);
  useEffect(()=>{if(mode!=='transfer')return;const controller=new AbortController();
    void fetch('/api/auth/vehicles/inventory',{signal:controller.signal,cache:'no-store'}).then(async response=>{
      const body=await response.json();if(response.ok&&body.status==='success'&&!controller.signal.aborted)setInventory(body.data.map((row:ManagementRow)=>({...row,id:Number(row.id)})));
    }).catch(()=>{});return()=>controller.abort();
  },[mode]);
  useEffect(()=>{if(mode!=='transfer')return;const controller=new AbortController();void fetch('/api/auth/store-directory',{signal:controller.signal,cache:'no-store'}).then(async response=>{const body=await response.json();if(!response.ok||body.status!=='success')throw Error('Không tải được cơ sở chuyển đến.');setDestinations(body.data.map((row:{id:string|number;store_name:string})=>({id:Number(row.id),name:row.store_name})));}).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Không tải được cơ sở chuyển đến.');});return()=>controller.abort();},[mode]);
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
  const rented = (() => { try { return JSON.parse(String(selected?.rentals_json || '[]')).length > 0; } catch { return false; } })();
  const transferBlocked = mode === 'transfer' && Boolean(selected) && currentStatus !== 'ready';
  const sameDestination=mode==='transfer'&&Boolean(selected)&&storeId===String(selected?.store_id);
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
      notify(mode === 'transfer' ? `Xe ${selected.license} chuyển sang Chờ luân chuyển tại ${stores.find(store=>String(store.id)===storeId)?.name || 'cơ sở đích'}. Đã lưu lịch sử.` : mode==='receive'?`Đã nhận xe ${selected.license} tại ${selected.transfer_to_store_name||selected.store_name}. Xe chuyển sang Lưu kho. Đã lưu lịch sử.`:saved.draft?'Đã tạo hợp đồng nháp. Xe vẫn Lưu kho đến khi phát hành hợp đồng.':`Đã đổi trạng thái xe ${selected.license}.`);
      if (saved.draft || saved.telegram_event_id || mode === 'transfer' || mode === 'receive') setResult({ ...saved, mode }); else onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không lưu được thao tác xe.'); }
    finally { busy.current = false; setSaving(false); }
  }

  if (result && (result.mode === 'transfer' || result.mode === 'receive')) {
    const photoKind = result.mode === 'receive' ? 'receive' : 'transfer';
    return <Dialog title={result.mode === 'receive' ? 'Đã nhận xe · Tải ảnh' : 'Đã chuyển xe · Tải ảnh'} onClose={() => { if (!photosPending) onClose(); }}>
      <div className="mg-dialog-body">
        <p role="status">{result.mode === 'receive' ? 'Xe đã về Lưu kho tại cơ sở nhận. Tải 1 ảnh nhận xe bên dưới.' : 'Xe đang Chờ luân chuyển. Tải 1 ảnh chuyển xe bên dưới.'}</p>
        <SavedRecordPhotos entity="vehicles" recordId={result.id} slots={vehicleTransferPhotoSlots(result.event_id, photoKind)}
          title={result.mode === 'receive' ? 'Ảnh nhận xe (1 ảnh)' : 'Ảnh chuyển xe (1 ảnh)'} onPendingChange={setPhotosPending} />
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
        {otherStock&&<p role="status">Xe {otherStock.license} hiện ở {otherStock.store_name}. Chỉ tài khoản cơ sở đang giữ xe được chuyển. Để lập hợp đồng, chọn đúng Cửa hàng xe trong form hợp đồng.</p>}
        {sameDestination&&<p role="status">Xe đang ở {selected?.store_name}. Không cần chuyển về cùng cơ sở; có thể chọn xe này khi lập hợp đồng.</p>}
        {rented && <small className="mg-field-error">Xe đang thuộc hợp đồng mở. Trả xe trên hợp đồng trước khi {mode === 'transfer' ? 'chuyển xe' : 'đổi trạng thái'}.</small>}
        {selected && !rented && ['using','rent'].includes(currentStatus) && <small>Không còn hợp đồng mở. Chọn Lưu kho nếu cần phát hành hợp đồng mới.</small>}
        {selected&&rented&&<Link className="mg-button" href={`/contracts?action=return&query=${encodeURIComponent(String(selected.license||''))}`} onClick={onClose}>Tìm hợp đồng đang thuê · Trả xe & hoàn cọc</Link>}
        {transferBlocked && !rented && <small className="mg-field-error">Chỉ chuyển xe đang Lưu kho.</small>}</div>
      {mode==='receive'?<>
        <p className="mg-transfer-direction mg-field-wide">{selected?vehicleTransferRoute(selected):''}</p>
        <div className="mg-field"><label htmlFor="vehicle-receive-from">Cơ sở chuyển đi</label><input id="vehicle-receive-from" value={String(selected?.transfer_from_store_name||'')} readOnly disabled/></div>
        <div className="mg-field"><label htmlFor="vehicle-receive-to">Cơ sở nhận xe</label><input id="vehicle-receive-to" value={String(selected?.transfer_to_store_name||selected?.store_name||'')} readOnly disabled/></div>
        <p className="mg-composer-hint mg-field-wide">Chỉ xác nhận khi xe đã đến cơ sở nhận. Xe chuyển từ Chờ luân chuyển sang Lưu kho; sau đó tải 1 ảnh nhận xe. Ngày giờ và người nhận được lưu trong Lịch sử.</p>
        {receiveBlocked&&<p className="mg-field-error mg-field-wide" role="alert">Lần chuyển xe không còn chờ nhận hoặc thiếu thông tin. Đóng hộp thoại, nhấn Làm mới rồi kiểm tra lịch sử.</p>}
      </>:mode === 'transfer' ? <>
        <div className="mg-field"><label htmlFor="vehicle-action-from">Cơ sở hiện tại</label><input id="vehicle-action-from" value={String(selected?.store_name || otherStock?.store_name || '')} readOnly disabled /></div>
        <div className="mg-field"><label htmlFor="vehicle-action-to">Chuyển đến cơ sở<span aria-hidden="true"> *</span></label>
          <select id="vehicle-action-to" value={storeId} disabled={saving} onChange={event => setStoreId(event.target.value)}>
            <option value="">Chọn cơ sở</option>{(destinations.length?destinations:stores).filter(store => String(store.id) !== String(selected?.store_id)).map(store => <option key={store.id} value={String(store.id)}>{store.name}</option>)}</select></div>
        <p className="mg-composer-hint mg-field-wide">Khi lưu, xe chuyển sang Chờ luân chuyển tại cơ sở đích. Sau đó tải 1 ảnh chuyển xe. Khi xe đến nơi, bấm Nhận xe để xác nhận. Mỗi thao tác đều được ghi vào Lịch sử.</p>
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
      <div className="mg-dialog-footer"><span className="mg-form-note">Ngày giờ và người nhập được ghi tự động khi lưu.</span>
        <button type="button" className="mg-button" disabled={saving} onClick={reloadVehicles}><RotateCcw size={16}/>Làm mới</button>
        <button type="button" className="mg-button" disabled={saving} onClick={onClose}>Hủy</button>
        <button type="submit" className="mg-button mg-button-primary" disabled={saving || !selected || rented || transferBlocked || receiveBlocked || sameDestination}>{saving ? <LoaderCircle size={16} className="mg-spin" /> : <Check size={16} />}{saving ? 'Đang lưu…' : mode==='receive'?'Xác nhận đã nhận xe':title}</button></div>
    </form>
  </Dialog>;
}
