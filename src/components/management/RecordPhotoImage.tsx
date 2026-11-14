'use client';

import { useState } from 'react';
import { RotateCcw } from 'lucide-react';

/** Saved images use authenticated URLs; retry the same file without changing its record. */
export function RecordPhotoImage({src,alt,loading='lazy'}:{src:string;alt:string;loading?:'eager'|'lazy'}) {
  const [attempt,setAttempt]=useState({src,number:0,failed:false});
  const current=attempt.src===src?attempt:{src,number:0,failed:false};
  const [base,fragment]=src.split('#',2);
  const preview=src.startsWith('/api/auth/record-photos/')?`${base}${base.includes('?')?'&':'?'}preview=1`:base;
  const imageUrl=`${preview}${fragment?`#${fragment}`:''}`;
  const url=current.number&&!/^(blob:|data:)/.test(src)
    ?`${preview}${preview.includes('?')?'&':'?'}retry=${current.number}${fragment?`#${fragment}`:''}`:imageUrl;
  return <div className="mg-record-photo-preview">
    {current.failed?<div className="mg-record-photo-error">
      <p role="alert">Không tải được ảnh {alt}.</p>
      <button type="button" className="mg-button" aria-label={`Tải lại ảnh ${alt}`} onClick={()=>setAttempt({src,number:current.number+1,failed:false})}><RotateCcw size={16} aria-hidden="true"/>Tải lại ảnh</button>
      <a className="mg-button" href={src} target="_blank" rel="noopener noreferrer">Mở ảnh gốc</a>
    </div>:<a href={src} target="_blank" rel="noopener noreferrer" aria-label={`Xem ảnh ${alt}`}>
      <img key={`${src}:${current.number}`} src={url} alt={alt} loading={loading} decoding="async" onError={()=>setAttempt({...current,failed:true})}/>
    </a>}
  </div>;
}
