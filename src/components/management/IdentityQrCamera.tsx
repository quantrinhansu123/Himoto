'use client';

import {useEffect,useRef,useState} from 'react';
import {Camera, X} from 'lucide-react';

/** Camera frames stay in memory; a successful frame is decoded locally and is not saved as a document photo. */
export function IdentityQrCamera({disabled,onFrame}:{disabled?:boolean;onFrame:(file:File)=>void}) {
  const [open,setOpen]=useState(false),[error,setError]=useState('');
  const video=useRef<HTMLVideoElement>(null),callback=useRef(onFrame);callback.current=onFrame;
  useEffect(()=>{if(disabled)setOpen(false);},[disabled]);
  useEffect(()=>{
    if(!open)return;
    let active=true,stream:MediaStream|undefined,timer:ReturnType<typeof setTimeout>|undefined;
    const stop=()=>{active=false;if(timer)clearTimeout(timer);stream?.getTracks().forEach(track=>track.stop());if(video.current)video.current.srcObject=null;};
    const pause=()=>{stop();setOpen(false);};
    const hide=()=>{if(document.hidden)pause();};
    document.addEventListener('visibilitychange',hide);
    window.addEventListener('himoto:identity-qr-pause',pause);
    window.addEventListener('pagehide',pause);
    void (async()=>{
      try {
        if(!navigator.mediaDevices?.getUserMedia)throw new Error('Thiết bị không hỗ trợ camera trực tiếp. Hãy chọn ảnh QR hoặc nhập tay.');
        const acquired=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
        if(!active){acquired.getTracks().forEach(track=>track.stop());return;}
        stream=acquired;const candidate=video.current;if(!candidate){stop();return;}
        const element:HTMLVideoElement=candidate;
        element.srcObject=stream;await element.play();
        const {containsIdentityQr}=await import('@/lib/management/identity-qr');
        const canvas=document.createElement('canvas'),context=canvas.getContext('2d',{willReadFrequently:true});
        if(!context)throw new Error('Không mở được bộ quét QR trên thiết bị này.');
        async function scan(){
          if(!active)return;
          try {
            if(element.videoWidth&&element.videoHeight){
              const scale=Math.min(1,1200/Math.max(element.videoWidth,element.videoHeight));
              canvas.width=Math.max(1,Math.round(element.videoWidth*scale));canvas.height=Math.max(1,Math.round(element.videoHeight*scale));
              context!.drawImage(element,0,0,canvas.width,canvas.height);
              if(await containsIdentityQr(context!.getImageData(0,0,canvas.width,canvas.height))){
                if(!active)return;
                canvas.toBlob(blob=>{if(!active)return;if(!blob){setError('Không đọc được khung hình. Vui lòng thử lại.');stop();return;}
                  stop();setOpen(false);callback.current(new File([blob],'qr-can-cuoc.png',{type:'image/png'}));},'image/png');
                return;
              }
            }
            if(active)timer=setTimeout(()=>{void scan();},250);
          } catch {if(active){setError('Chưa khởi tạo được bộ quét QR. Hãy thử lại hoặc chọn ảnh.');stop();}}
        }
        if(active)void scan();
      } catch(cause) {
        if(active){const name=cause instanceof DOMException?cause.name:'';
          setError(name==='NotAllowedError'?'Chưa được cấp quyền camera. Hãy cho phép camera hoặc chọn ảnh QR.':name==='NotFoundError'?'Không tìm thấy camera. Hãy chọn ảnh QR.':cause instanceof Error?cause.message:'Không mở được camera. Hãy chọn ảnh QR.');
          stop();}
      }
    })();
    return()=>{document.removeEventListener('visibilitychange',hide);window.removeEventListener('himoto:identity-qr-pause',pause);window.removeEventListener('pagehide',pause);stop();};
  },[open]);
  return <div className="mg-identity-qr-camera">
    {!open?<button type="button" className="mg-button" disabled={disabled} onClick={()=>{setError('');setOpen(true);}}><Camera size={16}/>Quét QR bằng camera</button>:
      <section aria-label="Quét QR căn cước" style={{display:'grid',gap:10,marginTop:8,maxWidth:520}}>
        <p role="status">Đưa mã QR trên căn cước vào khung hình. Ảnh không được lưu tự động.</p>
        <video ref={video} autoPlay muted playsInline aria-label="Camera quét QR căn cước" style={{width:'100%',maxHeight:360,objectFit:'contain',background:'#111',borderRadius:12}}/>
        <button type="button" className="mg-button" onClick={()=>setOpen(false)}><X size={16}/>Dừng quét</button>
      </section>}
    {error&&<p className="mg-field-error" role="alert">{error}</p>}
  </div>;
}
