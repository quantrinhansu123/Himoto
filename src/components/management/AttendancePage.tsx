'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarDays, Camera, LogIn, LogOut, MapPin, Settings } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AttendanceLocationsDialog } from './AttendanceLocationsDialog';
import { useManagement } from './ManagementProvider';
import { Dialog } from './Dialog';
import { FilteredExcelButton } from './FilteredExcelButton';
import { vietnamDate } from '@/lib/management/duty-roster';
import { attendanceShift, shiftCreditLabel } from '@/lib/management/attendance-shifts';
import { formatDateTime } from '@/lib/formatters';
import { WeeklyShiftRegistrationDialog } from './WeeklyShiftRegistrationDialog';

type Location = {latitude:number;longitude:number;accuracy:number;timestamp:number};
type Attendance = {id:number;staff_name:string;store_name:string;clock_in_at:string;clock_out_at:string|null;in_location:Location;out_location:Location|null;shift_name:string|null;scheduled_in:string|null;scheduled_out:string|null;late_minutes:number|null};
type Report = {staff:{name:string;store_id:number|null;store_name:string|null}|null;open:{id:number;clock_in_at:string}|null;latest:{clock_in_at:string;clock_out_at:string|null}|null;shift:{shift_name:string;starts_at:string;ends_at:string}|null;late_minutes:number|null;server_now:string;rows:Attendance[];total:number;page:number};
async function responseData<T>(response:Response):Promise<T> {
  const body = await response.json().catch(()=>null);
  if(!response.ok || body?.status!=='success') throw Error(body?.message || 'Không kết nối được máy chủ. Tải lại để kiểm tra.');
  return body.data;
}
function Evidence({row,side}:{row:Attendance;side:'in'|'out'}) {
  const location = side==='in'?row.in_location:row.out_location;
  if(!location) return <span>—</span>;
  return <div className="mg-attendance-evidence"><a href={`/api/auth/attendance?photo=${row.id}&side=${side}`} target="_blank" rel="noopener noreferrer">Ảnh {side==='in'?'vào':'ra'}</a>
    <a href={`https://www.google.com/maps?q=${location.latitude},${location.longitude}`} target="_blank" rel="noopener noreferrer"><MapPin size={13}/>Vị trí</a><small>GPS ±{Math.round(location.accuracy)} m</small></div>;
}
export function AttendancePage() {
  const {selectedStore,selectStore,dataset,ensureData,notify} = useManagement();
  const router = useRouter();
  useEffect(()=>{void ensureData(['stores']).catch(()=>{});},[ensureData]);
  useEffect(()=>{setPage(1);},[selectedStore]);
  const [from,setFrom] = useState(()=>vietnamDate().slice(0,7)+'-01'),[to,setTo] = useState(vietnamDate),[page,setPage] = useState(1),[retry,setRetry] = useState(0);
  const [data,setData] = useState<Report|null>(null),[loading,setLoading] = useState(true),[error,setError] = useState('');
  const [action,setAction] = useState<'in'|'out'|null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [now,setNow] = useState<number|null>(null);
  const serverClock = useRef<{server:number;received:number}|null>(null);
  useEffect(()=>{if(data?.server_now)serverClock.current={server:Date.parse(data.server_now),received:Date.now()};},[data]);
  useEffect(()=>{const tick=()=>{const clock=serverClock.current;setNow(clock?clock.server+Date.now()-clock.received:Date.now());};tick();const timer=setInterval(tick,1000);return()=>clearInterval(timer);},[]);
  const timeOnly = (value:string|null|undefined) => value ? new Date(value).toLocaleTimeString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit'}) : '—';
  const lateLabel = (value:number|null|undefined) => value==null?'Chưa có lịch ca':value>0?value+' phút':'Đúng giờ';
  const monthPreset = () => {setFrom(vietnamDate().slice(0,7)+'-01');setTo(vietnamDate());setPage(1);};
  const refresh = useCallback(()=>setRetry(value=>value+1),[]);
  async function exportAttendance() {
    const query = new URLSearchParams({from,to,store:selectedStore});
    const rows: Attendance[] = [];
    let total = 0;
    for (let index=1; index===1 || rows.length<total; index++) {
      query.set('page', String(index));
      const result = await responseData<Report>(await fetch(`/api/auth/attendance?${query}`,{cache:'no-store'}));
      if (index===1) total = result.total;
      if (result.total!==total || result.page!==index || !result.rows.length) {
        throw new Error('Danh sách chấm công đã thay đổi. Tải lại rồi xuất Excel.');
      }
      rows.push(...result.rows);
    }
    if (rows.length!==total || new Set(rows.map(row=>row.id)).size!==total) {
      throw new Error('Chưa đọc đủ lịch sử chấm công. Tải lại rồi xuất Excel.');
    }
    return rows.map(row=>[row.id,row.staff_name,row.store_name,row.shift_name,formatDateTime(row.clock_in_at),
      row.clock_out_at?formatDateTime(row.clock_out_at):null,row.late_minutes]);
  }
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setError('');setData(null);
    const query = new URLSearchParams({from,to,store:selectedStore,page:String(page)});
    void fetch(`/api/auth/attendance?${query}`,{cache:'no-store',signal:controller.signal}).then(responseData<Report>).then(value=>{if(!controller.signal.aborted)setData(value);}).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Không tải được chấm công.');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[from,to,selectedStore,page,retry]);
  return <section className="mg-page mg-attendance-page"><div className="mg-page-content">
    {settingsOpen && <AttendanceLocationsDialog canEdit onClose={() => setSettingsOpen(false)} />}
    {registrationOpen && <WeeklyShiftRegistrationDialog onClose={() => setRegistrationOpen(false)} onSaved={() => { setRegistrationOpen(false); notify('Đã lưu đăng ký ca làm trong tuần.'); }} />}
    <div className="mg-page-heading"><div><div className="mg-eyebrow">NHÂN SỰ</div><h1>Chấm công</h1><p>Ghi nhận giờ vào, giờ ra cùng ảnh chụp và vị trí GPS.</p></div><div className="mg-heading-actions"><button type="button" className="mg-button" onClick={() => setSettingsOpen(true)}><Settings size={16}/>Cài đặt</button><FilteredExcelButton disabled={loading||Boolean(error)||!data?.total} filename={`himoto-cham-cong-${from}-${to}`} headers={['ID','Nhân viên','Cơ sở','Ca làm','Giờ vào','Giờ ra','Số phút đi muộn']} getRows={exportAttendance}/><button type="button" className="mg-button" onClick={() => setRegistrationOpen(true)}><CalendarDays size={16}/>Đăng ký ca trong tuần</button></div></div>
    <div className="mg-data-panel mg-attendance-dashboard">
      <div className="mg-attendance-filters"><p><MapPin size={16}/> Cơ sở chấm công: <strong>{loading?'Đang tải…':data?.staff?.store_name||'Chưa gắn cơ sở'}</strong></p>
        {data?.staff?.store_id&&<button type="button" className="mg-button" onClick={()=>{selectStore(String(data.staff!.store_id));router.push('/duty-roster');}}>Lịch trực cơ sở</button>}
      </div>
      <p className="mg-attendance-hint">Vào ca được ghi nhận tại cơ sở của hồ sơ nhân viên. Bộ lọc bên dưới chỉ thay đổi lịch sử hiển thị.</p>
      <div className="mg-attendance-clock-heading"><div><strong>{data?.staff?.name || 'Tài khoản chấm công'}</strong><p>{loading?'Đang kiểm tra ca…':data?.open?'Đang trong ca':data?.staff?'Chưa vào ca':error?'Không tải được trạng thái ca.':'Tài khoản chưa liên kết nhân viên đang hoạt động.'}</p></div><div className="mg-attendance-live-clock"><strong suppressHydrationWarning>{now?new Date(now).toLocaleTimeString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour12:false}):'—'}</strong><small>{now?new Date(now).toLocaleDateString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'Giờ Việt Nam'}</small></div></div>
      <div className="mg-attendance-shift-label">{data?.shift?data.shift.shift_name+' · '+timeOnly(data.shift.starts_at)+' – '+timeOnly(data.shift.ends_at):'Chưa có lịch trực phù hợp. Quản lý phân ca tại Lịch trực cơ sở.'}</div>
      <dl className="mg-attendance-time-metrics"><div><dt>Giờ vào</dt><dd>{timeOnly(data?.latest?.clock_in_at)}</dd></div><div><dt>Giờ ra</dt><dd>{timeOnly(data?.latest?.clock_out_at)}</dd></div><div className={data?.late_minutes?'is-late':''}><dt>Đi muộn</dt><dd>{lateLabel(data?.late_minutes)}</dd></div></dl>
      <div className="mg-heading-actions"><button className="mg-button mg-button-primary" disabled={loading||Boolean(error)||!data?.staff?.store_id||Boolean(data.open)} onClick={()=>setAction('in')}><LogIn size={17}/>Vào ca</button><button className="mg-button" disabled={loading||Boolean(error)||!data?.open} onClick={()=>setAction('out')}><LogOut size={17}/>Ra ca</button></div>
    </div>
    <div className="mg-data-panel"><div className="mg-attendance-filters"><label>Cơ sở xem lịch sử<select aria-label="Cơ sở xem lịch sử chấm công" value={selectedStore} onChange={event=>{selectStore(event.target.value);setPage(1);}}><option value="all">Tất cả cơ sở được phép</option>{dataset?.stores.map(store=><option key={store.id} value={String(store.id)}>{store.name}</option>)}</select></label><label>Từ ngày<input aria-label="Từ ngày chấm công" type="date" value={from} onChange={event=>{setFrom(event.target.value);setPage(1);}}/></label><label>Đến ngày<input aria-label="Đến ngày chấm công" type="date" value={to} onChange={event=>{setTo(event.target.value);setPage(1);}}/></label><button type="button" className="mg-button" onClick={monthPreset}>Tháng này</button><span>{data?.total??'—'} lượt chấm công</span></div>
    {error?<p className="mg-field-error" role="alert">{error}</p>:loading?<p className="mg-table-state" role="status">Đang tải bảng chấm công…</p>:<>
      <div className="mg-attendance-mobile-list">{data?.rows.map(row=><article key={row.id} className="mg-attendance-history-card"><div className="mg-attendance-history-heading"><strong>{row.staff_name}</strong><small>#{row.id} · {new Date(row.clock_in_at).toLocaleDateString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}</small></div><p>{row.store_name||'Chưa gắn cơ sở'}{row.shift_name?' · '+row.shift_name:''}{attendanceShift(row.shift_name)?' · '+shiftCreditLabel(attendanceShift(row.shift_name)!.credit)+' công quy định':''}</p><div className="mg-attendance-history-times"><span>Vào <b>{timeOnly(row.clock_in_at)}</b></span><span>Ra <b>{timeOnly(row.clock_out_at)}</b></span><span className={row.late_minutes?'is-late':''}>{lateLabel(row.late_minutes)}</span></div><details><summary>Ảnh và vị trí chấm công</summary><div className="mg-attendance-evidence-pair"><Evidence row={row} side="in"/><Evidence row={row} side="out"/></div></details></article>)}{!data?.rows.length&&<p className="mg-table-state">Chưa có chấm công trong khoảng ngày đã chọn.</p>}</div>
      <div className="mg-table-scroll mg-attendance-desktop-table" role="region" aria-label="Bảng chấm công" tabIndex={0}><table className="mg-table"><thead><tr>{['ID','Tên nhân viên','Ca làm','Giờ vào','Giờ ra','Đi muộn','Ảnh / vị trí'].map(label=><th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{data?.rows.map(row=><tr key={row.id}><td>#{row.id}</td><td><strong>{row.staff_name}</strong><small className="mg-attendance-store">{row.store_name||'Chưa gắn cơ sở'}</small></td><td>{row.shift_name||'Chưa phân ca'}{attendanceShift(row.shift_name)&&<small className="mg-attendance-store">Công quy định: {shiftCreditLabel(attendanceShift(row.shift_name)!.credit)}</small>}{row.scheduled_in&&<small className="mg-attendance-store">{timeOnly(row.scheduled_in)} – {timeOnly(row.scheduled_out)}</small>}</td><td>{formatDateTime(row.clock_in_at)}</td><td>{row.clock_out_at?formatDateTime(row.clock_out_at):'Đang trong ca'}</td><td className={row.late_minutes?'is-late':''}>{lateLabel(row.late_minutes)}</td><td><details><summary>Xem ảnh / GPS</summary><div className="mg-attendance-evidence-pair"><Evidence row={row} side="in"/><Evidence row={row} side="out"/></div></details></td></tr>)}{!data?.rows.length&&<tr><td colSpan={7}>Chưa có chấm công trong khoảng ngày đã chọn.</td></tr>}</tbody></table></div>
    </>}
    {data&&data.total>50&&<div className="mg-attendance-pagination"><button className="mg-button" disabled={loading||data.page<=1} onClick={()=>setPage(data.page-1)}>Trước</button><span>Trang {data.page}/{Math.ceil(data.total/50)}</span><button className="mg-button" disabled={loading||data.page>=Math.ceil(data.total/50)} onClick={()=>setPage(data.page+1)}>Sau</button></div>}</div>
    <p className="mg-attendance-hint">Giờ chấm công theo máy chủ (giờ Việt Nam). Nhân viên xem lịch sử của mình; người có quyền nhân sự xem theo phạm vi cơ sở.</p>
    {action&&<ClockCapture action={action} onClose={()=>setAction(null)} onSaved={()=>{setAction(null);refresh();notify(action==='in'?'Đã ghi nhận vào ca.':'Đã ghi nhận ra ca.');}}/>}
  </div></section>;
}
function ClockCapture({action,onClose,onSaved}:{action:'in'|'out';onClose:()=>void;onSaved:()=>void}) {
  const video=useRef<HTMLVideoElement>(null),stream=useRef<MediaStream|null>(null),lock=useRef(false),requestId=useRef(crypto.randomUUID());
  const [cameraReady,setCameraReady]=useState(false),[photo,setPhoto]=useState<Blob|null>(null),[preview,setPreview]=useState(''),[locating,setLocating]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{let current=true;
    if(!navigator.mediaDevices?.getUserMedia){setError('Trình duyệt chưa hỗ trợ camera. Mở bằng HTTPS hoặc localhost và cho phép camera.');return;}
    void navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:960},height:{ideal:720}},audio:false}).then(value=>{if(!current){value.getTracks().forEach(track=>track.stop());return;}stream.current=value;if(video.current)video.current.srcObject=value;}).catch(()=>{if(current)setError('Không mở được camera. Hãy cấp quyền camera và mở lại chấm công.');});
    return()=>{current=false;stream.current?.getTracks().forEach(track=>track.stop());};
  },[]);
  useEffect(()=>{if(!photo){setPreview('');return;}const url=URL.createObjectURL(photo);setPreview(url);return()=>URL.revokeObjectURL(url);},[photo]);
  async function locate(): Promise<Location> {
    if (!navigator.geolocation) throw new Error('Trình duyệt không hỗ trợ vị trí GPS.');
    setLocating(true);
    try {
      const { coords, timestamp } = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, () => reject(new Error('Chưa lấy được GPS. Cho phép vị trí trên thiết bị rồi xác nhận lại.')), {
          enableHighAccuracy: true, maximumAge: 0, timeout: 20000,
        });
      });
      return { latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy, timestamp };
    } finally {
      setLocating(false);
    }
  }
  function capture() {
    if(!video.current?.videoWidth)return;
    const canvas=document.createElement('canvas');canvas.width=video.current.videoWidth;canvas.height=video.current.videoHeight;
    canvas.getContext('2d')?.drawImage(video.current,0,0);canvas.toBlob(blob=>{if(blob){setPhoto(blob);}else setError('Không chụp được ảnh. Vui lòng thử lại.');},'image/jpeg',0.8);
  }
  async function save() {
    if(lock.current||!photo)return;
    lock.current=true;setBusy(true);setError('');
    try {const location=await locate();const form=new FormData();form.set('action',action);form.set('request_id',requestId.current);form.set('photo',photo,'cham-cong.jpg');form.set('location',JSON.stringify(location));await responseData(await fetch('/api/auth/attendance',{method:'POST',body:form}));onSaved();}
    catch(cause){setError(cause instanceof Error?cause.message:'Chưa xác nhận được chấm công. Giữ màn hình này để thử lại cùng lần chấm.');}
    finally {lock.current=false;setBusy(false);}
  }
  return <Dialog title={action==='in'?'Chấm công vào ca':'Chấm công ra ca'} onClose={()=>{if(!lock.current)onClose();}}><div className="mg-dialog-body mg-attendance-capture"><p>Chụp ảnh hiện tại và cho phép vị trí để xác nhận chấm công.</p><video ref={video} autoPlay playsInline muted onLoadedData={()=>setCameraReady(true)} aria-label="Camera chấm công"/><button type="button" className="mg-button" disabled={!cameraReady||busy||locating} onClick={capture}><Camera size={17}/>{photo?'Chụp lại':'Chụp ảnh'}</button>{preview&&<img src={preview} alt="Ảnh chấm công vừa chụp"/>}{error&&<p className="mg-field-error" role="alert">{error}</p>}</div><div className="mg-dialog-footer"><button className="mg-button" disabled={busy} onClick={onClose}>Đóng</button><button className="mg-button mg-button-primary" disabled={busy||!photo} onClick={()=>void save()}>{locating?'Đang lấy vị trí…':busy?'Đang lưu…':action==='in'?'Xác nhận vào ca':'Xác nhận ra ca'}</button></div></Dialog>;
}
