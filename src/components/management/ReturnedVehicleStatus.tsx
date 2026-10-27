'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { ReturnableContractItem } from '@/lib/management/contract-returns';
import { formatDateTime } from '@/lib/formatters';

interface InventoryVehicle { id:number|string;available:boolean;status:string;rental_blockers:{order_id:number;code:string;store_name:string}[] }
export function ReturnedVehicleStatus({ rows }: { rows:ReturnableContractItem[] }) {
  const [inventory,setInventory]=useState<InventoryVehicle[]|null>(null),[error,setError]=useState('');
  useEffect(()=>{
    const controller=new AbortController();
    void fetch('/api/auth/vehicles/inventory',{signal:controller.signal,credentials:'same-origin',cache:'no-store'})
      .then(async response=>{const body=await response.json();if(!response.ok||body.status!=='success'||!Array.isArray(body.data))throw Error('Chưa kiểm tra được tình trạng kho hiện tại.');if(!controller.signal.aborted)setInventory(body.data);})
      .catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Chưa kiểm tra được kho xe.');});
    return()=>controller.abort();
  },[]);
  const vehicles=[...new Map(rows.map(row=>[row.vehicle_id,row])).values()];
  return <section aria-label="Trạng thái xe sau trả"><h3>Xe đã trả trong hợp đồng này</h3>
    {vehicles.map(row=>{const vehicle=inventory?.find(item=>Number(item.id)===row.vehicle_id);return <div key={row.vehicle_id} className="mg-return-estimate">
      <strong>{row.license}</strong><span>{row.return_reconciled?'Đã đối chiếu kho; chưa có ngày trả gốc — mở Sửa hồ sơ trả xe để nhập ngày giờ thực tế.':`Đã ghi nhận trả: ${formatDateTime(row.completed_at)}`}</span>
      {vehicle?.available?<p role="status">Xe đã về kho và có thể chọn cho hợp đồng mới.</p>:vehicle?.rental_blockers?.length?<>
        <p role="alert">Xe còn được giữ bởi hợp đồng khác. Cần đối chiếu đúng hợp đồng bên dưới; trả lại lần nữa trên hợp đồng này không gỡ được liên kết đó.</p>
        {vehicle.rental_blockers.map(blocker=><p key={blocker.order_id}><Link href={`/contracts?contract_id=${blocker.order_id}`}>{blocker.code}</Link> · {blocker.store_name}</p>)}
      </>:inventory?<p>Xe chưa sẵn sàng cho thuê mới. Kiểm tra trạng thái và cơ sở quản lý trong Kho xe.</p>:!error&&<p role="status">Đang kiểm tra kho xe…</p>}
    </div>;})}{error&&<p role="alert" className="mg-field-error">{error}</p>}
  </section>;
}
