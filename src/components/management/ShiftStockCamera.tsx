'use client';

import {useEffect, useRef, useState} from 'react';
import {Camera} from 'lucide-react';
import {requestBrowserLocation, type BrowserLocation} from '@/lib/management/browser-geolocation';
import {MAX_PHOTO_BYTES} from '@/lib/management/record-photos';
import {Dialog} from './Dialog';

export type StockCameraPhoto = {image:Blob; gps:BrowserLocation | null};

async function encodeJpeg(video:HTMLVideoElement) {
  const canvas = document.createElement('canvas');
  const scale = Math.min(1,1600/Math.max(video.videoWidth,video.videoHeight));
  canvas.width = Math.round(video.videoWidth*scale);
  canvas.height = Math.round(video.videoHeight*scale);
  const context = canvas.getContext('2d');
  if (!context || !canvas.width || !canvas.height) throw Error('Camera chưa sẵn sàng. Vui lòng thử lại.');
  context.drawImage(video,0,0,canvas.width,canvas.height);
  for (const quality of [0.86,0.72,0.58]) {
    const jpeg = await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
    if (jpeg?.type==='image/jpeg' && jpeg.size && jpeg.size<=MAX_PHOTO_BYTES) return jpeg;
  }
  throw Error('Không tạo được ảnh JPEG. Vui lòng chụp lại.');
}

export function ShiftStockCamera({label,onCapture,onClose}:{
  label:string; onCapture:(photo:StockCameraPhoto)=>void; onClose:()=>void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const capturing = useRef<AbortController|null>(null);
  const [ready,setReady] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  useEffect(()=>{
    let active = true;
    let stream:MediaStream|undefined;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera cần HTTPS và trình duyệt hỗ trợ. Mở Himoto bằng Chrome hoặc Safari rồi thử lại.');
    } else {
      void navigator.mediaDevices.getUserMedia({
        video:{facingMode:{ideal:'environment'},width:{ideal:1600},height:{ideal:1200}},audio:false,
      }).then(current=>{
        if (!active || !video.current) {current.getTracks().forEach(track=>track.stop());return;}
        stream=current;
        video.current.srcObject=current;
      }).catch(()=>{
        if (active) setError('Không mở được camera. Kiểm tra thiết bị và quyền camera của trang, rồi mở lại.');
      });
    }
    return ()=>{
      active=false;
      capturing.current?.abort();
      stream?.getTracks().forEach(track=>track.stop());
    };
  },[]);

  async function take() {
    if (capturing.current || !video.current || video.current.readyState<2) return;
    const controller = new AbortController();
    capturing.current=controller;
    setBusy(true);setError('');
    try {
      const [gps,image] = await Promise.all([
        requestBrowserLocation({signal:controller.signal}).catch(()=>null),encodeJpeg(video.current),
      ]);
      if (!controller.signal.aborted) onCapture({gps,image});
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError((cause as Error).message);
        controller.abort();
      }
    } finally {
      if (capturing.current===controller) {
        capturing.current=null;
        if (video.current?.isConnected) setBusy(false);
      }
    }
  }

  return <Dialog title={label} onClose={onClose} className="mg-attendance-capture-dialog">
    <div className="mg-dialog-body mg-attendance-capture">
      <video ref={video} autoPlay playsInline muted onLoadedData={()=>setReady(true)} aria-label="Camera kiểm kê xe"/>
      {!ready && !error && <p role="status">Đang mở camera…</p>}
      {error && <p className="mg-field-error" role="alert">{error}</p>}
    </div>
    <div className="mg-dialog-footer">
      <button type="button" className="mg-button" onClick={onClose}>Hủy</button>
      <button type="button" className="mg-button mg-button-primary" disabled={!ready||busy} onClick={()=>void take()}>
        <Camera size={16}/>{busy?'Đang lấy GPS…':'Chụp ảnh'}
      </button>
    </div>
  </Dialog>;
}
