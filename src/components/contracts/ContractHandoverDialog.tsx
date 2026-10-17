'use client';

import { useEffect, useRef, useState } from 'react';
import { Dialog } from '@/components/management/Dialog';
import { loadPaymentContext, PaymentContext } from '@/lib/management/contract-payments';
import { ContractTransactionPhotos } from '@/components/management/ContractTransactionPhotos';

const money = (value: number | null) => value === null ? 'Chưa đối chiếu' : `${value.toLocaleString('vi-VN')} đ`;
export function ContractHandoverDialog({id,onClose,onDone}: {id:number;onClose:()=>void;onDone:(context:PaymentContext)=>void}) {
  const [context,setContext] = useState<PaymentContext|null>(null), [error,setError] = useState(''), [saving,setSaving] = useState(false);
  const busy = useRef(false);
  const [photosPending,setPhotosPending]=useState(false);
  useEffect(()=>{const controller = new AbortController(); loadPaymentContext(id,controller.signal).then(value=>{if(!controller.signal.aborted)setContext(value);})
    .catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error ? cause.message : 'Không tải được đơn giữ xe.');}); return ()=>controller.abort();},[id]);
  async function confirm() {
    if (!context || busy.current||photosPending) return;
    busy.current=true; setSaving(true); setError('');
    try {
      const response = await fetch(`/api/auth/order/car-rental/${id}/handover`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:context.revision})});
      const result = await response.json();
      if (!response.ok || result.status !== 'success' || result.data?.id !== id || result.data?.status !== 'renting') throw new Error(result.message || 'Chưa xác nhận được giao xe. Tải lại để kiểm tra trước khi thử lại.');
      onDone(result.data);
    } catch(cause) {setError(cause instanceof Error ? cause.message : 'Chưa xác nhận được giao xe.');}
    finally {busy.current=false;setSaving(false);}
  }
  return <Dialog title="Giao xe đã đặt cọc" subtitle={context?.code || 'Đang tải đơn giữ xe'} onClose={()=>{if(!busy.current)onClose();}}>
    <div className="mg-dialog-body">
      {context ? <><dl className="mg-payment-totals"><div><dt>Tiền thuê dự kiến</dt><dd>{money(context.total_amount)}</dd></div><div><dt>Đã trả trước</dt><dd>{money(context.paid_amount)}</dd></div><div><dt>Tiền thuê còn lại</dt><dd>{money(context.remaining)}</dd></div></dl>
        <p>{context.items.map(item=>`${item.name} · ${item.license}`).join(', ')}</p>
        <p>Xác nhận khách đã nhận xe để chuyển sang Đang thuê. Khoản trả trước được giữ nguyên, không thu lần nữa. Sau đó có thể thu tiền thuê còn lại trong Sổ quỹ.</p></> : !error && <p role="status">Đang tải đơn giữ xe…</p>}
      {context&&<ContractTransactionPhotos id={id} phase="handover" title="Ảnh bàn giao xe" onPendingChange={setPhotosPending}/>}
      {photosPending&&<p role="status">Lưu ảnh đang chọn trước khi xác nhận giao xe.</p>}
      {error && <p role="alert" className="mg-field-error">{error}</p>}
    </div><div className="mg-dialog-footer"><button type="button" className="mg-button" disabled={saving} onClick={onClose}>Đóng</button><button type="button" className="mg-button mg-button-primary" disabled={saving || photosPending||context?.status !== 'deposit_contract'} onClick={()=>void confirm()}>{saving ? 'Đang lưu…' : 'Xác nhận giao xe'}</button></div>
  </Dialog>;
}
