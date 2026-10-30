'use client';
import { useEffect,useState } from 'react';
import { SHIFT_PHOTOS } from '@/lib/management/shift-reports';
import type { ShiftMedia } from '@/lib/management/shift-audits';
import type { PendingShiftFile } from '@/lib/management/shift-report-client';
import { normalizeVideoFile, VIDEO_FILE_ACCEPT } from '@/lib/management/video-media';
type Props={slots:readonly string[];media:ShiftMedia[];pending:Record<string,PendingShiftFile>;readonly:boolean;disabled:boolean;
  onFiles:(files:Record<string,PendingShiftFile>)=>void;onDelete?:(file:ShiftMedia)=>void};
export function ShiftEvidence({slots,media,pending,readonly,disabled,onFiles,onDelete}:Props){
  const [previews,setPreviews]=useState<Record<string,string>>({});
  const [error,setError]=useState('');
  useEffect(()=>{const urls=Object.fromEntries(Object.entries(pending).map(([id,item])=>[id,URL.createObjectURL(item.file)]));setPreviews(urls);return()=>Object.values(urls).forEach(URL.revokeObjectURL);},[pending]);
  return <div className="shift-evidence"><h3>Minh chứng</h3><p>Chọn nhiều ảnh cùng lúc. Mỗi phần PGD / KTNB tối đa 60 ảnh và 3 video (45 MB, 3 phút/video).</p>
    {error&&<p role="alert" className="mg-field-error">{error}</p>}
    <div className="shift-photo-grid">{SHIFT_PHOTOS.filter(([slot])=>slots.includes(slot)).map(([slot,label])=>{
      const saved=media.filter(file=>file.category===slot),chosen=Object.entries(pending).filter(([,item])=>item.category===slot);
      return <div className="shift-photo" key={slot}><strong>{label}</strong><small>{saved.length} tệp đã lưu · {chosen.length} tệp chưa lưu</small>
        {!saved.length&&!chosen.length&&<div className="shift-photo-empty">Chưa có minh chứng</div>}
        <div className="shift-media-gallery">{saved.map(file=><div key={file.id}>{file.mime_type.startsWith('video/')?<video controls preload="metadata" src={file.url} aria-label={file.filename}/>:<a href={file.url} target="_blank" rel="noreferrer"><img src={file.url} alt={file.filename||label} loading="lazy"/></a>}<small>{file.filename||label}</small>{!readonly&&onDelete&&!file.id.startsWith('legacy:')&&<button type="button" className="mg-button" disabled={disabled} onClick={()=>onDelete(file)}>Xóa minh chứng</button>}</div>)}
          {chosen.map(([id,item])=><div key={id}>{item.file.type.startsWith('video/')?<video controls preload="metadata" src={previews[id]} aria-label={item.file.name}/>:<a href={previews[id]} target="_blank" rel="noreferrer"><img src={previews[id]} alt={item.file.name||label}/></a>}<small>{item.file.name} · Chưa lưu</small>{!readonly&&<button type="button" className="mg-button" disabled={disabled} onClick={()=>{const next={...pending};delete next[id];onFiles(next);}}>Bỏ tệp</button>}</div>)}
        </div>
        {!readonly&&<input type="file" multiple accept={`image/jpeg,image/png,image/webp,${VIDEO_FILE_ACCEPT}`} aria-label={label} disabled={disabled} onChange={event=>{
          const files=Array.from(event.target.files||[]).map(normalizeVideoFile),currentImages=media.filter(f=>f.mime_type.startsWith('image/')).length+Object.values(pending).filter(f=>f.file.type.startsWith('image/')).length;
          const currentVideos=media.filter(f=>f.mime_type.startsWith('video/')).length+Object.values(pending).filter(f=>f.file.type.startsWith('video/')).length;
          if(currentImages+files.filter(f=>f.type.startsWith('image/')).length>60||currentVideos+files.filter(f=>f.type.startsWith('video/')).length>3){setError('Mỗi phần tối đa 60 ảnh và 3 video.');event.target.value='';return;}
          if(files.some(f=>!f.size||!f.type.startsWith('video/')&&!['image/jpeg','image/png','image/webp'].includes(f.type)||f.size>(f.type.startsWith('video/')?45:30)*1024*1024)){setError('Chọn ảnh JPEG/PNG/WebP tối đa 30 MB hoặc video MP4/MOV/WebM tối đa 45 MB.');event.target.value='';return;}
          setError('');onFiles({...pending,...Object.fromEntries(files.map(file=>[crypto.randomUUID(),{category:slot,file}]))});event.target.value='';
        }}/>}</div>;
    })}</div></div>;
}
