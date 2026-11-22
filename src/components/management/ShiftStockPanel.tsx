'use client';

import {useEffect, useRef, useState} from 'react';
import {Camera, RefreshCw} from 'lucide-react';
import {abortTimeout} from '@/lib/abort-signal';
import {shiftApi, UnconfirmedSaveError} from '@/lib/management/shift-report-client';
import {compareShiftStock, isShiftStockCapture, isShiftStockCheck, type ShiftStockCapture, type ShiftStockCheck} from '../../../shared/shift-stock-check';
import {ShiftStockCamera, type StockCameraPhoto} from './ShiftStockCamera';

type Attempt = {
  key:string; revision:number;
} & ({method:'PUT';plate:StockCameraPhoto} | {method:'DELETE';vehicleId:number});

export function ShiftStockProofs({reportId,captures,onRemove}:{
  reportId:number; captures:ShiftStockCapture[]; onRemove?:(item:ShiftStockCapture)=>void;
}) {
  if (!captures.length) return null;
  return <ul className="shift-inventory-stock">{captures.map(entry=><li key={entry.vehicle.id}>
    <div><strong>{entry.vehicle.license}</strong> · {entry.vehicle.name}</div>
    <small>
      {entry.actor_name} · {new Date(entry.captured_at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}
      {entry.distance_m != null ? ` · Cách cơ sở ${entry.distance_m.toLocaleString('vi-VN')} m` : ''}
    </small>
    {(entry.gps_alert || entry.vehicle_gps_alert) && (
      <div style={{color:'#b91c1c',fontSize:12.5,fontWeight:600,marginTop:4}}>
        {entry.gps_alert && <div>⚠ Điện thoại: {entry.gps_issue || 'Ngoài phạm vi cơ sở'}</div>}
        {entry.vehicle_gps_alert && <div>⚠ GPS xe: {entry.vehicle_gps_issue || 'Ngoài phạm vi cơ sở'}</div>}
      </div>
    )}
    <div className="shift-stock-actions">
      <a href={`/api/auth/shift-reports/${reportId}/media/${entry.plate_photo_id}`} target="_blank" rel="noreferrer">Ảnh biển số</a>
      {entry.vehicle_photo_id&&<a href={`/api/auth/shift-reports/${reportId}/media/${entry.vehicle_photo_id}`} target="_blank" rel="noreferrer">Ảnh toàn xe</a>}
      {onRemove&&<button type="button" className="mg-button" onClick={()=>onRemove(entry)} aria-label={`Bỏ ảnh kiểm kê xe ${entry.vehicle.license}`}>Bỏ ảnh kiểm kê</button>}
    </div>
  </li>)}</ul>;
}

function PhotoPreview({photo,label}:{photo:StockCameraPhoto;label:string}) {
  const [src,setSrc] = useState('');
  useEffect(()=>{
    const url=URL.createObjectURL(photo.image);
    setSrc(url);
    return ()=>URL.revokeObjectURL(url);
  },[photo.image]);
  return src?<img src={src} alt={label}/>:null;
}

export function ShiftStockPanel({reportId,revision,captures,writable,active,blocked,onBlocking,onChanged,onHasPhoto}:{
  reportId:number; revision:number; captures:ShiftStockCapture[]; writable:boolean; active:boolean; blocked:boolean;
  onBlocking:(value:boolean)=>void;
  onChanged:(from:number,revision:number,captures:ShiftStockCapture[])=>void;
  onHasPhoto:(value:boolean)=>void;
}) {
  const [check,setCheck] = useState<ShiftStockCheck|null>(null);
  const [loading,setLoading] = useState(true);
  const [reload,setReload] = useState(0);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [camera,setCamera] = useState(false);
  const [plate,setPlate] = useState<StockCameraPhoto|null>(null);
  const [pending,setPending] = useState<Attempt|null>(null);
  const [saving,setSaving] = useState(false);
  const sending = useRef(false);
  const endpoint = `/api/auth/shift-reports/${reportId}/stock-photos`;
  useEffect(()=>{
    if (!active) return;
    const controller = new AbortController();
    setLoading(true);
    shiftApi<ShiftStockCheck>(endpoint,{signal:controller.signal})
      .then(value=>{
        if (!isShiftStockCheck(value)) throw Error('Kết quả đối chiếu kho không hợp lệ.');
        if (!controller.signal.aborted) setCheck(value);
      })
      .catch((cause:Error)=>{if(!controller.signal.aborted)setError(cause.message);})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[active,endpoint,revision,reload]);
  const hasPhoto=!!plate;
  useEffect(()=>onHasPhoto(hasPhoto),[hasPhoto,onHasPhoto]);

  const stale=!!check && check.revision!==revision;
  const result=check ? compareShiftStock(check.expected,check.captures) : null;
  const canChange=writable && !blocked && !loading && !stale && !!check && !pending;

  async function send(attempt:Attempt) {
    if (sending.current) return;
    sending.current=true;
    setPending(attempt);setSaving(true);onBlocking(true);setError('');setNotice('');
    let uncertain=false;
    try {
      const headers:Record<string,string>={'x-shift-request-id':attempt.key,'x-report-revision':String(attempt.revision)};
      let body:Blob|undefined;
      if (attempt.method==='PUT') {
        headers['Content-Type']='image/jpeg';
        headers['x-plate-gps']=attempt.plate.gps?JSON.stringify(attempt.plate.gps):'unavailable';
        body=attempt.plate.image;
      } else headers['x-vehicle-id']=String(attempt.vehicleId);
      const saved=await shiftApi<{revision:number;capture?:ShiftStockCapture}>(endpoint,{
        method:attempt.method, headers, body, signal:abortTimeout(95_000),
      });
      if (saved.revision!==attempt.revision+1 || attempt.method==='PUT' && !isShiftStockCapture(saved.capture)) {
        throw new UnconfirmedSaveError('Chưa xác nhận được kết quả kiểm kê.');
      }
      const changed=saved.capture;
      const changedId=attempt.method==='DELETE' ? attempt.vehicleId : changed!.vehicle.id;
      const next=(check?.captures??captures).filter(row=>row.vehicle.id!==changedId);
      if (changed) {
        next.push(changed);
        setPlate(null);
      }
      setCheck(previous=>previous ? {...previous,revision:saved.revision,captures:next} : previous);
      onChanged(attempt.revision,saved.revision,next);
      setNotice(changed?`Đã khớp ${changed.vehicle.license} · ${changed.vehicle.name}.`:'Đã bỏ ảnh kiểm kê.');
    } catch (cause) {
      uncertain=cause instanceof UnconfirmedSaveError;
      setError((cause as Error).message+(uncertain?' Bấm Thử lại thao tác để xác nhận.':''));
      if (!uncertain) setReload(value=>value+1);
    } finally {
      sending.current=false;
      setSaving(false);
      if (!uncertain) {setPending(null);onBlocking(false);}
    }
  }

  return <section aria-label="Tiến độ kiểm kê xe" className="shift-stock-panel">
    <button type="button" className="mg-button" disabled={loading||blocked||saving} onClick={()=>{setError('');setReload(value=>value+1);}}>
      <RefreshCw size={15}/>Làm mới đối chiếu kho
    </button>
    {loading && <p role="status">Đang đối chiếu danh sách Lưu kho…</p>}
    {stale && !loading && !pending && <p className="mg-field-error" role="alert">Báo cáo đã thay đổi. Mở lại từ Danh sách báo cáo để tiếp tục.</p>}
    {error && <p className="mg-field-error" role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {check && result && <>
      <p aria-live="polite">Đã khớp {check.expected.length-result.missing.length}/{check.expected.length} xe Lưu kho.</p>
      {!!result.missing.length && <p>Còn thiếu: {result.missing.map(vehicle=>vehicle.license || vehicle.name || `#${vehicle.id}`).join(', ')}</p>}
      {!!result.unexpected.length && <p>Lệch kho: {result.unexpected.map(entry=>entry.vehicle.license).join(', ')}</p>}
    </>}
    {writable && <>
      <p>Chụp một ảnh cận biển số cho mỗi xe. AI đọc biển số và đối chiếu với danh sách Lưu kho của cơ sở.</p>
      <div className="shift-stock-preview">
        {plate&&<PhotoPreview photo={plate} label="Ảnh cận biển số"/>}
        <button type="button" className="mg-button" disabled={!canChange||!check?.expected.length}
          onClick={()=>setCamera(true)}><Camera size={16}/>{plate?'Chụp lại ảnh cận biển số':'Chụp ảnh cận biển số'}</button>
      </div>
      <div className="shift-stock-actions">
        {pending ? <button type="button" className="mg-button mg-button-primary" disabled={saving} onClick={()=>void send(pending)}>
          {saving?'Đang xử lý…':'Thử lại thao tác'}
        </button> : <button type="button" className="mg-button mg-button-primary" disabled={!canChange||!plate}
          onClick={()=>{if(plate)void send({method:'PUT',key:crypto.randomUUID(),revision,plate});}}>
          Quét biển số và lưu ảnh
        </button>}
        {hasPhoto && <button type="button" className="mg-button" disabled={!!pending||blocked}
          onClick={()=>{setPlate(null);setError('');}}>Bỏ ảnh đang chụp</button>}
      </div>
    </>}
    <ShiftStockProofs reportId={reportId} captures={check?.captures??captures} onRemove={canChange?entry=>{
      if (window.confirm(`Bỏ ảnh kiểm kê của xe ${entry.vehicle.license}?`)) {
        void send({method:'DELETE',key:crypto.randomUUID(),revision,vehicleId:entry.vehicle.id});
      }
    }:undefined}/>
    {active && camera && <ShiftStockCamera label="Chụp ảnh cận biển số"
      onClose={()=>setCamera(false)} onCapture={photo=>{
        setPlate(photo);
        setError('');setNotice('');setCamera(false);
      }}/>}
  </section>;
}
