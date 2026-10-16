'use client';
import { useEffect,useRef,useState } from 'react';
import { contractVietQr,loadContractQr,type ContractQrData } from '@/lib/management/sepay';
import { formatMoney } from '@/lib/formatters';
import { Dialog } from './Dialog';

export function ContractPaymentQr({id,compact=false,statusOnly=false,accountNumber,onUpdated}:{id:number;compact?:boolean;statusOnly?:boolean;accountNumber?:string;onUpdated?:()=>void}){
  const [data,setData]=useState<ContractQrData|null>(null),[error,setError]=useState(''),[amount,setAmount]=useState(''),[imageError,setImageError]=useState(false);
  const previous=useRef<ContractQrData|null>(null),callback=useRef(onUpdated);callback.current=onUpdated;
  useEffect(()=>{const controller=new AbortController();let running=false;
    const refresh=async()=>{if(running||document.visibilityState==='hidden')return;running=true;
      try{const value=await loadContractQr(id,undefined,controller.signal);if(controller.signal.aborted)return;
        const old=previous.current;setData(value);setError('');setAmount(current=>!old||old.paid!==value.paid&&Number(current)>value.amount?String(value.amount):current);
        if(old&&old.paid!==value.paid)callback.current?.();previous.current=value;
      }catch(cause){if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Không tải được thông tin thanh toán.');}finally{running=false;}
    };
    void refresh();const timer=compact?null:setInterval(()=>void refresh(),4000);document.addEventListener('visibilitychange',refresh);
    return()=>{controller.abort();if(timer)clearInterval(timer);document.removeEventListener('visibilitychange',refresh);};
  },[id,compact]);
  const selected=compact?data?.amount||0:Number(amount);
  const exceedsCap=Boolean(data&&data.amount>0&&selected>data.amount);
  const invalid=amount!==''&&(!/^\d+$/.test(amount)||!Number.isSafeInteger(selected)||selected<0||exceedsCap);
  const qrAmount=invalid?0:selected;
  const url=data?.bank&&!invalid?contractVietQr(data.bank,qrAmount,data.code):null;
  useEffect(()=>setImageError(false),[url]);
  if(accountNumber&&data?.bank?.account_number!==accountNumber)return null;
  if(compact){if(!data)return error?null:<span data-payment-qr-loading="true"/>;if(!data.qr_url||!data.bank)return null;
    return <div className="contract-payment-qr"><img src={data.qr_url} width={96} height={96} alt={`QR thanh toán hợp đồng ${data.code}`} referrerPolicy="no-referrer"/><div><strong>{data.mode==='test'?'QR thử nghiệm SePay':'Quét QR thanh toán'}</strong><span>{data.amount>0?`${formatMoney(data.amount)} · `:''}{data.bank.bank_code}</span><span>{data.bank.account_number} · {data.bank.account_name}</span><span>{data.memo}</span></div></div>;
  }
  if(!data)return <p role={error?'alert':'status'}>{error||'Đang tải thông tin chuyển khoản…'}</p>;
  if(!data.configured)return <p>Chưa cấu hình tài khoản ngân hàng nhận tiền. Liên hệ quản trị viên để bật QR thanh toán.</p>;
  if(statusOnly)return <p className="mg-payment-success" role="status">{data.mode==='test'?`SePay demo: đã nhận mô phỏng ${formatMoney(data.received_demo)}; công nợ thật chưa thay đổi.`:'SePay tự cập nhật khi ngân hàng báo có. Trạng thái được kiểm tra mỗi 4 giây.'}{error&&` ${error}`}</p>;
  return <section className="mg-contract-payment-qr" aria-label="QR thanh toán hợp đồng">
    <h3>Thanh toán cho hợp đồng {data.code}</h3>
    {data.mode==='test'&&<p className="mg-composer-notice">Đang thử xử lý SePay: giao dịch demo không thay đổi công nợ và Sổ quỹ. QR vẫn trỏ đến tài khoản đã cấu hình; hãy mô phỏng giao dịch trong SePay để thử.</p>}
    <dl className="mg-payment-totals"><div><dt>Tổng hợp đồng</dt><dd>{formatMoney(data.total)}</dd></div><div><dt>Đã thu</dt><dd>{formatMoney(data.paid)}</dd></div><div><dt>Còn phải thu</dt><dd>{formatMoney(data.amount)}</dd></div></dl>
    {data.total!==null&&data.total>0&&data.amount<=0&&data.paid!==null&&data.paid>0&&<p className="mg-payment-success" role="status">Hợp đồng đã thu đủ số tiền theo thỏa thuận ({formatMoney(data.paid)}). Bạn có thể nhập số tiền để tạo QR thu thêm/phát sinh nếu cần.</p>}
    <label className="mg-field">Số tiền cần chi / thanh toán (VNĐ)<input aria-label="Số tiền QR" inputMode="numeric" placeholder={data.amount>0?String(data.amount):'Nhập số tiền thanh toán'} value={amount} onChange={event=>setAmount(event.target.value.replace(/\D/g,''))}/></label>
    {invalid&&<p className="mg-field-error">{exceedsCap?'Số tiền vượt phần còn phải thu của hợp đồng.':'Vui lòng nhập số tiền hợp lệ.'}</p>}
    {url&&!imageError?<div style={{textAlign:'center',margin:'8px 0'}}><img className="mg-contract-qr-image" src={url} width={240} height={240} alt={`Mã VietQR thanh toán hợp đồng ${data.code}`} referrerPolicy="no-referrer" onError={()=>setImageError(true)}/></div>:<p role="alert">Không tải được ảnh QR. Có thể chuyển khoản theo thông tin bên dưới.</p>}
    <dl className="mg-qr-bank-info">
      <div><dt>Chi cho hợp đồng</dt><dd><strong>{data.code}</strong></dd></div>
      <div><dt>Ngân hàng</dt><dd>{data.bank?.bank_code}</dd></div>
      <div><dt>Số tài khoản</dt><dd>{data.bank?.account_number}</dd></div>
      <div><dt>Chủ tài khoản</dt><dd>{data.bank?.account_name}</dd></div>
      <div><dt>Nội dung chuyển khoản</dt><dd><strong>{data.memo}</strong></dd></div>
    </dl>
    <p>Cú pháp nội dung chuẩn hóa: <code>{data.memo}</code>. Mở QR chưa ghi nhận thu tiền.</p>
    {data.mode==='test'&&data.received_demo>0&&<p role="status" className="mg-payment-success">SePay demo đã báo nhận {formatMoney(data.received_demo)}.</p>}
    {error&&<p role="alert" className="mg-field-error">{error}</p>}
  </section>;
}
export function ContractQrDialog({id,onClose}:{id:number;onClose:()=>void}){
  return <Dialog title="Nhập phiếu chi · Thanh toán hợp đồng" subtitle="Tạo QR thu tiền theo hợp đồng" onClose={onClose}><div className="mg-dialog-body"><ContractPaymentQr id={id}/></div><div className="mg-dialog-footer"><button type="button" className="mg-button" onClick={onClose}>Đóng</button></div></Dialog>;
}
