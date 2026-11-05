'use client';
import {useEffect,useRef,useState} from 'react';
import {IdentityQrCamera} from '@/components/management/IdentityQrCamera';
import {readIdentityQr} from '@/lib/management/identity-qr';
import {isIdentityQrScan,type IdentityQrScan} from '../../../shared/identity-qr';

export default function MobileIdentityQr(){
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false);
  const job=useRef<AbortController|null>(null),picker=useRef<HTMLInputElement>(null);
  useEffect(()=>()=>job.current?.abort(),[]);
  async function read(files:File[]){
    if(!files.length)return;
    job.current?.abort();const controller=new AbortController();job.current=controller;setBusy(true);setError('');
    try{
      const result=await readIdentityQr(files,controller.signal);
      if(controller.signal.aborted)return;
      const scan:IdentityQrScan={fields:result.fields,identifiers:result.identifiers};
      if(!isIdentityQrScan(scan))throw Error('Kết quả QR chưa hợp lệ. Hãy thử lại.');
      const nonce=location.hash.slice(1);if(!/^[0-9a-f-]{36}$/.test(nonce))throw Error('Mở lại bộ quét từ ứng dụng Himoto.');
      const message=JSON.stringify({type:'himoto.identity-qr.v1',nonce,scan});
      const bridge=(window as unknown as {ReactNativeWebView?:{postMessage:(value:string)=>void}}).ReactNativeWebView;
      if(bridge)bridge.postMessage(message);
      else if(window.parent!==window&&document.referrer&&new URL(document.referrer).origin===location.origin)window.parent.postMessage(message,location.origin);
      else throw Error('Mở lại bộ quét từ ứng dụng Himoto.');
      setDone(true);
    }catch(cause){if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Chưa đọc được QR. Hãy thử lại.');}
    finally{if(!controller.signal.aborted)setBusy(false);}
  }
  return <main style={{padding:20,maxWidth:560,margin:'0 auto',color:'#17212f',fontSize:16,lineHeight:1.5}}>
    <h1 style={{fontSize:24,margin:'0 0 10px'}}>Quét QR căn cước</h1>
    <p>Đưa mã QR vào khung hình, giữ thẻ thẳng và tránh ánh sáng phản chiếu.</p>
    <p style={{color:'#536176'}}>QR được đọc trên thiết bị. Ảnh không tự lưu vào hồ sơ.</p>
    {!done&&<><IdentityQrCamera disabled={busy} onFrame={file=>void read([file])}/>
      <input ref={picker} hidden type="file" accept="image/*" multiple aria-label="Chọn ảnh QR căn cước" onChange={e=>{const files=Array.from(e.currentTarget.files||[]);e.currentTarget.value='';void read(files);}}/>
      <button type="button" disabled={busy} onClick={()=>picker.current?.click()} style={{width:'100%',minHeight:48,marginTop:16,padding:12,border:'1px solid #a5aebc',borderRadius:12,background:'#fff'}}>Chọn ảnh QR có sẵn</button></>}
    {busy&&<p role="status">Đang đọc QR…</p>}{done&&<p role="status">Đã đọc QR. Quay lại biểu mẫu để kiểm tra thông tin.</p>}
    {error&&<p role="alert" style={{color:'#b42318'}}>{error}</p>}
    <style>{`.mg-button{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;min-height:48px;padding:12px;border:1px solid #a5aebc;border-radius:12px;background:#fff;color:#17212f}.mg-field-error{color:#b42318}`}</style>
  </main>;
}
