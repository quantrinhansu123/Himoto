'use client';
import { useEffect,useMemo,useState } from 'react';
import { LoaderCircle,RotateCcw } from 'lucide-react';
import { Dialog } from './Dialog';
import { normalize } from '@/lib/management/table-utils';
import { VEHICLE_STATUSES } from '@/lib/management/config';

interface InventoryVehicle {
  id:number|string;name:string;license:string;type:string;status:string;store_id:number|string|null;
  store_name:string|null;from_store_name:string|null;to_store_name:string|null;available:boolean;
}
export function SharedVehicleInventory({onClose}:{onClose:()=>void}) {
  const [rows,setRows]=useState<InventoryVehicle[]|null>(null),[error,setError]=useState(''),[version,setVersion]=useState(0);
  const [search,setSearch]=useState(''),[store,setStore]=useState(''),[availability,setAvailability]=useState('');
  useEffect(()=>{
    const controller=new AbortController();setRows(null);setError('');
    void fetch('/api/auth/vehicles/inventory',{signal:controller.signal,cache:'no-store',credentials:'same-origin'}).then(async response=>{
      const body=await response.json();
      if(!response.ok||body.status!=='success'||!Array.isArray(body.data))throw Error(body.message||'Không tải được kho xe chung.');
      if(!controller.signal.aborted)setRows(body.data);
    }).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Không tải được kho xe chung.');});
    return()=>controller.abort();
  },[version]);
  const stores=useMemo(()=>[...new Map((rows||[]).filter(row=>row.store_id).map(row=>[String(row.store_id),row.store_name||`Cơ sở #${row.store_id}`])).entries()].sort((a,b)=>a[1].localeCompare(b[1],'vi')),[rows]);
  const plateSearch=search.toUpperCase().replace(/[^A-Z0-9]/g,'');
  const found=(rows||[]).filter(row=>(!store||String(row.store_id)===store)&&(!availability||(availability==='ready'?row.available:!row.available))&&(normalize([row.license,row.name,row.store_name,row.from_store_name,row.to_store_name].join(' ')).includes(normalize(search))||Boolean(plateSearch)&&row.license.toUpperCase().replace(/[^A-Z0-9]/g,'').includes(plateSearch)));
  return <Dialog title="Kho xe toàn hệ thống" onClose={onClose}>
    <div className="mg-dialog-body">
      <p>Mọi tài khoản có thể điều chuyển xe giữa các cơ sở. Chọn Chuyển xe trên trang Xe; khi xe đến nơi, người nhận xác nhận để xe về Lưu kho và lập hợp đồng.</p>
      <div className="mg-form-grid mg-contract-grid-two">
        <div className="mg-field mg-field-wide"><label htmlFor="shared-inventory-search">Tìm biển số, tên xe hoặc cơ sở</label><input id="shared-inventory-search" type="search" value={search} maxLength={100} onChange={event=>setSearch(event.target.value)} placeholder="Nhập biển số, tên xe, cơ sở…"/></div>
        <div className="mg-field"><label htmlFor="shared-inventory-store">Cơ sở quản lý / chờ nhận</label><select id="shared-inventory-store" value={store} onChange={event=>setStore(event.target.value)}><option value="">Tất cả cơ sở</option>{stores.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></div>
        <div className="mg-field"><label htmlFor="shared-inventory-availability">Khả năng điều chuyển</label><select id="shared-inventory-availability" value={availability} onChange={event=>setAvailability(event.target.value)}><option value="">Tất cả xe</option><option value="ready">Lưu kho · không có hợp đồng mở</option><option value="blocked">Chưa thể điều chuyển</option></select></div>
      </div>
      <button className="mg-button" type="button" disabled={!rows&&!error} onClick={()=>setVersion(value=>value+1)}><RotateCcw size={16}/>Làm mới kho chung</button>
      {error&&<p className="mg-field-error" role="alert">{error}</p>}
      {!rows&&!error?<p role="status"><LoaderCircle className="mg-spin" size={16}/>Đang tải kho xe toàn hệ thống…</p>:rows&&<>
        <p role="status">{found.length} / {rows.length} xe toàn hệ thống</p>
        <div className="mg-shared-vehicle-list">{found.map(row=><article key={row.id} aria-label={`Xe ${row.license||row.name}`}>
          <h3>{row.license||'Chưa có biển số'}</h3><p>{row.name}</p>
          <dl><div><dt>Trạng thái</dt><dd>{VEHICLE_STATUSES.find(item=>item.value===row.status)?.label||row.status}</dd></div><div><dt>Cơ sở quản lý / chờ nhận</dt><dd>{row.store_name||'Chưa xác định'}</dd></div></dl>
          {row.status==='in_transit'&&<p>Đang chuyển: {row.from_store_name||'Chưa xác định'} → {row.to_store_name||row.store_name||'Chưa xác định'}. Chưa xác nhận nhận xe.</p>}
          <p className={row.available?'mg-payment-success':'mg-composer-hint'}>{row.available?'Có thể điều chuyển tới cơ sở khác':row.status==='ready'?'Chưa thể điều chuyển: còn hợp đồng chưa đóng':'Chưa thể điều chuyển khi chưa về Lưu kho'}</p>
        </article>)}</div>
        {!found.length&&<p>Không có xe phù hợp bộ lọc.</p>}
      </>}
    </div><div className="mg-dialog-footer"><button className="mg-button" type="button" onClick={onClose}>Đóng</button></div>
  </Dialog>;
}
