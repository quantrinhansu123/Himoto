'use client';

import { useState } from 'react';
import { RotateCcw } from 'lucide-react';

/** Saved images use authenticated URLs; retry the same file without changing its record. */
export function RecordPhotoImage({src,alt,loading='eager'}:{src:string;alt:string;loading?:'eager'|'lazy'}) {
  const [attempt,setAttempt]=useState({src,number:0,failed:false});
  const current=attempt.src===src?attempt:{src,number:0,failed:false};
  const [base,fragment]=src.split('#',2);
  const url=current.number&&!/^(blob:|data:)/.test(src)
    ?`${base}${base.includes('?')?'&':'?'}retry=${current.number}${fragment?`#${fragment}`:''}`:src;
  return <div className="mg-record-photo-preview">
    {current.failed?<div className="mg-record-photo-error">
      <p role="alert">Không tải được ảnh {alt}.</p>
      <button type="button" className="mg-button" aria-label={`Tải lại ảnh ${alt}`} onClick={()=>setAttempt({src,number:current.number+1,failed:false})}><RotateCcw size={16} aria-hidden="true"/>Tải lại ảnh</button>
    </div>:<a href={src} target="_blank" rel="noopener noreferrer" aria-label={`Xem ảnh ${alt}`}>
      <img key={`${src}:${current.number}`} src={url} alt={alt} loading={loading} decoding="async" onError={()=>setAttempt({...current,failed:true})}/>
    </a>}
  </div>;
}
