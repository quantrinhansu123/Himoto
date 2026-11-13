'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {prepareRecordPhoto} from '@/lib/management/record-photos';
import {isBatteryMedia,type BatteryMedia} from '../../../shared/battery-media';
type Photo={id:string;file:File;saved:boolean;error:string};
export function BatteryPhotoFields({id,eventKey,onChanged,onPendingChange}:{id:number;eventKey:string;onChanged:()=>void;onPendingChange:(pending:boolean)=>void}){
  const[data,setData]=useState<BatteryMedia|null>(null),[photos,setPhotos]=useState<Photo[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');const running=useRef(false),alive=useRef(true),current=useRef(photos);current.current=photos;
  const endpoint=`/api/auth/battery-contracts/${id}/media/${eventKey}`;
  const refresh=useCallback(async()=>{const response=await fetch(endpoint,{credentials:'same-origin',cache:'no-store'}),body=await response.json();if(!response.ok||!isBatteryMedia(body.data))throw Error(body.message||'Chưa tải được ảnh pin.');if(alive.current)setData(body.data);},[endpoint]);
  useEffect(()=>{alive.current=true;void refresh().catch(e=>{if(alive.current)setError(e.message);});return()=>{alive.current=false;};},[refresh]);
  useEffect(()=>{onPendingChange(busy||photos.some(p=>!p.saved));},[busy,photos,onPendingChange]);
  async function pick(files:File[]){if(running.current)return;running.current=true;setBusy(true);setError('');try{for(const file of files){try{const prepared=await prepareRecordPhoto(file);if(!alive.current)return;setPhotos(old=>[...old,{id:crypto.randomUUID(),file:prepared,saved:false,error:''}]);}catch(e){if(alive.current)setError(`${file.name}: ${(e as Error).message}`);}}}finally{running.current=false;if(alive.current)setBusy(false);}}
  async function save(){if(running.current)return;running.current=true;setBusy(true);setError('');try{for(const photo of current.current){if(photo.saved)continue;const response=await fetch(`${endpoint}/${photo.id}`,{method:'PUT',credentials:'same-origin',headers:{'Content-Type':photo.file.type,'Idempotency-Key':photo.id},body:photo.file}),body=await response.json();if(!response.ok||body.status!=='success'||body.data?.id!==id){setPhotos(old=>old.map(p=>p.id===photo.id?{...p,error:body.message||'Chưa lưu được ảnh.'}:p));throw Error(body.message||'Chưa xác nhận được ảnh. Thử lại phần còn lại.');}setPhotos(old=>old.map(p=>p.id===photo.id?{...p,saved:true,error:''}:p));}await refresh();onChanged();}catch(e){if(alive.current)setError((e as Error).message);}finally{running.current=false;if(alive.current)setBusy(false);}}
  return <section className="mg-battery-photos" aria-label="Ảnh và chứng từ lượt pin / sạc" aria-busy={busy}><strong>Ảnh và chứng từ của lượt này</strong><p>Chọn nhiều ảnh, lưu cả bộ rồi gửi Telegram. Thử lại ảnh lỗi không ghi thêm tiền hoặc thao tác pin.</p>
    <p role="status">Đã lưu trên hồ sơ: {data?.rows.length??'…'} ảnh. Đã tải {photos.filter(p=>p.saved).length}/{photos.length} ảnh đang chọn.</p>
    {data?.rows.map((photo,index)=><a key={photo.id} className="mg-button" href={`${endpoint}/${photo.id}`} target="_blank" rel="noreferrer">Xem ảnh pin {index+1}</a>)}
    {data?.canWrite&&<><label className="mg-button">Chọn nhiều ảnh<input type="file" multiple accept="image/*" disabled={busy} onChange={event=>{void pick(Array.from(event.currentTarget.files||[]));event.currentTarget.value='';}}/></label><label className="mg-button">Chụp ảnh<input type="file" accept="image/*" capture="environment" disabled={busy} onChange={event=>{void pick(Array.from(event.currentTarget.files||[]));event.currentTarget.value='';}}/></label></>}
    {photos.map((photo,index)=><div key={photo.id}><span>Ảnh {index+1} · {photo.saved?'Đã lưu':photo.error||'Chờ lưu'}</span>{!photo.saved&&!busy&&<button className="mg-button" type="button" onClick={()=>setPhotos(old=>old.filter(p=>p.id!==photo.id))}>Bỏ ảnh {index+1}</button>}</div>)}
    {photos.some(p=>!p.saved)&&<button className="mg-button" type="button" disabled={busy||!data?.canWrite} onClick={()=>{void save();}}>{busy?'Đang tải ảnh…':'Lưu / thử tiếp bộ ảnh'}</button>}{!!error&&<p role="alert" className="mg-field-error">{error}</p>}
  </section>;
}
