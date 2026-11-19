'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarDays, Camera, Eye, History, LogIn, LogOut, MapPin, Pencil, Settings, Trash2 } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { AttendanceLocationsDialog } from './AttendanceLocationsDialog';
import { useManagement } from './ManagementProvider';
import { Dialog } from './Dialog';
import { FilteredExcelButton } from './FilteredExcelButton';
import { RowActionsMenu, type RowAction } from './RowActionsMenu';
import { vietnamDate } from '@/lib/management/duty-roster';
import { shiftCreditLabel } from '@/lib/management/attendance-shifts';
import { buildAttendanceWorkbook } from '@/lib/management/attendance-workbook';
import { downloadExcel } from '@/lib/management/excel-export';
import { formatDateTime } from '@/lib/formatters';
import { isAdminAccount } from '@/lib/management/permissions';
import { WeeklyShiftRegistrationDialog } from './WeeklyShiftRegistrationDialog';

type Location = {latitude:number;longitude:number;accuracy:number;timestamp:number};

function readClockLocation(): Promise<Location> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Trình duyệt không hỗ trợ vị trí GPS.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(({coords,timestamp}) => {
      resolve({latitude:coords.latitude,longitude:coords.longitude,accuracy:coords.accuracy,timestamp});
    }, error => {
      const message = error.code === error.PERMISSION_DENIED
        ? 'Chưa có quyền vị trí. Trên Safari, mở menu bên trái thanh địa chỉ → Cài đặt trang web → Vị trí → Cho phép.'
        : 'Chưa lấy được tín hiệu GPS. Vui lòng thử lại.';
      reject(new Error(message));
    }, {enableHighAccuracy:true,maximumAge:0,timeout:20000});
  });
}
type Attendance = {id:number;staff_id:number|string;staff_name:string;store_name:string|null;store_from_profile:boolean;clock_in_at:string;clock_out_at:string|null;in_location:Location;out_location:Location|null;has_out_photo:boolean;has_store_location:boolean;in_distance_m:number|null;out_distance_m:number|null;shift_name:string|null;scheduled_in:string|null;scheduled_out:string|null;late_minutes:number|null;early_leave_minutes:number|null;standard_credit:number|null;earned_credit:number|null;credit_aggregated:boolean;credit_on_other_row:boolean;can_manage:boolean};
type Summary = {staff:{name:string;store_id:number|null;store_name:string|null}|null;open:{id:number;clock_in_at:string}|null;latest:{clock_in_at:string;clock_out_at:string|null}|null;shift:{shift_name:string;starts_at:string;ends_at:string}|null;shift_code:string|null;late_minutes:number|null;early_leave_minutes:number|null;server_now:string};
type Report = {rows:Attendance[];total:number;page:number};
async function responseData<T>(response:Response):Promise<T> {
  const body = await response.json().catch(()=>null);
  if(!response.ok || body?.status!=='success') throw Error(body?.message || 'Không kết nối được máy chủ. Tải lại để kiểm tra.');
  return body.data;
}
function Evidence({row,side}:{row:Attendance;side:'in'|'out'}) {
  const [photoFailed,setPhotoFailed] = useState(false);
  const entering = side==='in';
  const label = entering?'Vào ca':'Ra ca';
  const timestamp = entering?row.clock_in_at:row.clock_out_at;
  const location = entering?row.in_location:row.out_location;
  const distance = entering?row.in_distance_m:row.out_distance_m;
  const hasPhoto = entering || row.has_out_photo;
  const photo = `/api/auth/attendance?photo=${row.id}&side=${side}`;

  return <section className="mg-attendance-evidence">
    <h3>{label}</h3>
    {timestamp ? <>
      <time dateTime={timestamp}>{formatDateTime(timestamp)}</time>
      {hasPhoto && !photoFailed ? <a href={photo} target="_blank" rel="noopener noreferrer" className="mg-attendance-evidence-photo">
        <Image unoptimized src={photo} alt={`Ảnh ${label.toLocaleLowerCase('vi')}`} width={320} height={240} onError={()=>setPhotoFailed(true)} />
      </a> : <p className="mg-attendance-evidence-empty">{photoFailed?'Không tải được ảnh':'Chưa có ảnh chấm công'}</p>}
      <dl>
        <dt>Vị trí chấm công</dt>
        <dd>{location ? <>
          <a href={`https://www.google.com/maps?q=${location.latitude},${location.longitude}`} target="_blank" rel="noopener noreferrer">
            <MapPin size={14}/> {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
          </a>
          <small>Độ chính xác GPS ±{Math.round(location.accuracy)} m</small>
        </> : 'Chưa ghi nhận GPS'}</dd>
        <dt>Khoảng cách đến cơ sở</dt>
        <dd>{distance != null ? <strong>{distance.toLocaleString('vi-VN')} m</strong> :
          !row.has_store_location ? (row.store_name?'Cơ sở chưa cấu hình tọa độ':'Lượt chấm công chưa có cơ sở') : 'Chưa có GPS để tính'}</dd>
      </dl>
    </> : <p className="mg-attendance-evidence-empty">{missingCheckout}</p>}
  </section>;
}
const timeOnly = (value:string|null|undefined) => value ? new Date(value).toLocaleTimeString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit'}) : '—';
const missingCheckout = 'Chưa chấm công ra';
const lateLabel = (value:number|null|undefined, shiftCode:string|null|undefined) =>
  shiftCode==='O'?'Ngày nghỉ':value==null?(shiftCode?'Chưa vào ca':'Chưa có ca đăng ký'):value>0?value+' phút':'Đúng giờ';
const earlyLabel = (value:number|null|undefined, clockOut:string|null|undefined, shiftCode:string|null|undefined) =>
  shiftCode==='O'?'Ngày nghỉ':!clockOut?missingCheckout:value==null?'Chưa có ca đăng ký':value>0?value+' phút':'Đủ giờ';

const earnedCreditFormat = new Intl.NumberFormat('vi-VN',{maximumFractionDigits:4});
function attendanceCreditLabel(row: Attendance) {
  if (row.earned_credit != null) return earnedCreditFormat.format(row.earned_credit);
  if (row.credit_on_other_row) return 'Gộp cùng ca';
  return row.standard_credit == null ? '—' : 'Chưa chốt';
}

function LiveVietnamClock({serverNow,onDayChanged}:{serverNow:string|null|undefined;onDayChanged:()=>void}) {
  const [now,setNow] = useState<number|null>(null);
  const serverClock = useRef<{server:number;received:number;day:string}|null>(null);
  const notifiedDay = useRef<string|null>(null);
  useEffect(()=>{
    if(serverNow){
      const parsed = Date.parse(serverNow);
      serverClock.current = {server:parsed,received:Date.now(),day:vietnamDate(new Date(parsed))};
      notifiedDay.current = null;
    }
  },[serverNow]);
  useEffect(()=>{
    const tick=()=>{
      const clock=serverClock.current;
      const current=clock?clock.server+Date.now()-clock.received:Date.now();
      setNow(current);
      if(clock){
        const currentDay=vietnamDate(new Date(current));
        if(clock.day<currentDay&&notifiedDay.current!==currentDay){
          notifiedDay.current=currentDay;
          onDayChanged();
        }
      }
    };
    tick();
    const timer=setInterval(tick,1000);
    return()=>clearInterval(timer);
  },[onDayChanged]);
  return <div className="mg-attendance-live-clock"><strong suppressHydrationWarning>{now?new Date(now).toLocaleTimeString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour12:false}):'—'}</strong><small>{now?new Date(now).toLocaleDateString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'Giờ Việt Nam'}</small></div>;
}

export function AttendancePage() {
  const {notify,can} = useManagement();
  const canViewRegistration = can('hr.read');
  const [retry,setRetry] = useState(0);
  const refresh = useCallback(()=>setRetry(value=>value+1),[]);
  const [data,setData] = useState<Summary|null>(null),[loading,setLoading] = useState(true),[error,setError] = useState('');
  const [clock,setClock] = useState<{action:'in'|'out';initialLocation:Promise<Error|null>}|null>(null);
  function startClock(nextAction:'in'|'out') {
    const initialLocation = readClockLocation().then(() => null, (error:Error) => error);
    setClock({action:nextAction,initialLocation});
  }
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const handleDayChanged = useCallback(()=>{setClock(null);refresh();},[refresh]);
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setError('');setData(null);
    void fetch('/api/auth/attendance?view=summary',{cache:'no-store',signal:controller.signal}).then(responseData<Summary>).then(value=>{if(!controller.signal.aborted)setData(value);}).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Không tải được chấm công.');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[retry]);
  const clockInBlockedReason = loading ? 'Đang kiểm tra trạng thái chấm công…'
    : error ? 'Không tải được trạng thái ca — tải lại trang để kiểm tra.'
    : !data?.staff ? 'Tài khoản chưa liên kết với nhân viên đang hoạt động.'
    : !data.staff.store_id ? 'Nhân viên chưa được gắn cơ sở chấm công.'
    : data.open ? 'Đang có ca mở — cần chấm công ra ca trước khi vào ca mới.'
    : undefined;
  const clockOutBlockedReason = loading ? 'Đang kiểm tra trạng thái chấm công…'
    : error ? 'Không tải được trạng thái ca — tải lại trang để kiểm tra.'
    : !data?.open ? 'Chưa có ca đang mở để chấm công ra.'
    : undefined;
  return <section className="mg-page mg-attendance-page"><div className="mg-page-content">
    {settingsOpen && <AttendanceLocationsDialog canEdit onClose={() => setSettingsOpen(false)} />}
    {registrationOpen && <WeeklyShiftRegistrationDialog onClose={() => setRegistrationOpen(false)} onSaved={() => { setRegistrationOpen(false); refresh(); notify('Đã lưu đăng ký ca làm trong tuần.'); }} />}
    <div className="mg-page-heading">
      <div>
        <div className="mg-eyebrow">NHÂN SỰ</div>
        <h1>Chấm công</h1>
        <p>Ghi nhận giờ vào, giờ ra cùng ảnh chụp và vị trí GPS.</p>
      </div>
      <div className="mg-heading-actions mg-attendance-header-actions">
        <button type="button" className="mg-button" onClick={() => setSettingsOpen(true)}><Settings size={16}/>Cài đặt</button>
        <Link className="mg-button" href="/attendance/history"><History size={16}/>Lịch sử chấm công</Link>
        <button type="button" className="mg-button mg-attendance-register-action" onClick={() => setRegistrationOpen(true)}><CalendarDays size={16}/>Đăng ký ca trong tuần</button>
      </div>
    </div>
    <div className="mg-data-panel mg-attendance-dashboard">
      <div className="mg-attendance-filters"><p><MapPin size={16}/> Cơ sở chấm công: <strong>{loading?'Đang tải…':data?.staff?.store_name||'Chưa gắn cơ sở'}</strong></p>
        {canViewRegistration&&<Link className="mg-button" href="/shift-registration">Bảng đăng ký ca</Link>}
      </div>
      <p className="mg-attendance-hint">Vào ca được ghi nhận tại cơ sở của hồ sơ nhân viên.</p>
      <div className="mg-attendance-clock-heading"><div><strong>{data?.staff?.name || 'Tài khoản chấm công'}</strong><p>{loading?'Đang kiểm tra ca…':data?.open?'Đang trong ca':data?.staff?'Chưa vào ca':error?'Không tải được trạng thái ca.':'Tài khoản chưa liên kết nhân viên đang hoạt động.'}</p></div><LiveVietnamClock serverNow={data?.server_now} onDayChanged={handleDayChanged}/></div>
      <div className="mg-attendance-shift-label">{data?.shift_code==='G1+G3'&&!data.latest?'G1+G3 · 08:00–12:00 · 17:00–21:00':data?.shift?data.shift.shift_name+' · '+timeOnly(data.shift.starts_at)+' – '+timeOnly(data.shift.ends_at):data?.shift_code==='O'?'Đăng ký nghỉ':'Chưa có ca đăng ký'}</div>
      <dl className="mg-attendance-time-metrics"><div><dt>Giờ vào</dt><dd>{timeOnly(data?.latest?.clock_in_at)}</dd></div><div><dt>Giờ ra</dt><dd>{timeOnly(data?.latest?.clock_out_at)}</dd></div><div className={data?.late_minutes?'is-late':''}><dt>Đi muộn</dt><dd>{lateLabel(data?.late_minutes,data?.shift_code)}</dd></div><div className={data?.early_leave_minutes?'is-late':''}><dt>Về sớm</dt><dd>{earlyLabel(data?.early_leave_minutes,data?.latest?.clock_out_at,data?.shift_code)}</dd></div></dl>
      <div className="mg-attendance-punch-actions">
        <button type="button" className="mg-button" disabled={Boolean(clockInBlockedReason)} title={clockInBlockedReason} onClick={()=>startClock('in')}>
          <LogIn size={22} aria-hidden="true"/>Vào ca
        </button>
        <button type="button" className="mg-button" disabled={Boolean(clockOutBlockedReason)} title={clockOutBlockedReason} onClick={()=>startClock('out')}>
          <LogOut size={22} aria-hidden="true"/>Ra ca
        </button>
      </div>
    </div>
    {error && <p className="mg-field-error" role="alert">{error}</p>}
    {clock&&<ClockCapture action={clock.action} initialLocation={clock.initialLocation} onClose={()=>setClock(null)} onSaved={()=>{setClock(null);refresh();notify(clock.action==='in'?'Đã ghi nhận vào ca.':'Đã ghi nhận ra ca.');}}/>}
  </div></section>;
}

export function AttendanceHistoryPage() {
  const {selectedStore,selectStore,dataset,ensureData,notify,can,accessUser} = useManagement();
  const canViewRegistration = can('hr.read');
  const isAdmin = isAdminAccount(accessUser);
  useEffect(()=>{void ensureData(['stores']).catch(()=>{});},[ensureData]);
  useEffect(()=>{setPage(1);},[selectedStore]);
  const [from,setFrom] = useState(()=>vietnamDate().slice(0,7)+'-01'),[to,setTo] = useState(vietnamDate),[page,setPage] = useState(1);
  const [retry,setRetry] = useState(0);
  const refresh = useCallback(()=>setRetry(value=>value+1),[]);
  const [data,setData] = useState<Report|null>(null),[loading,setLoading] = useState(true),[error,setError] = useState('');
  const [recordDialog, setRecordDialog] = useState<{ mode: RecordMode; row: Attendance } | null>(null);
  const monthPreset = () => {setFrom(vietnamDate().slice(0,7)+'-01');setTo(vietnamDate());setPage(1);};
  async function exportAttendance() {
    const exportFrom = from || vietnamDate().slice(0, 7) + '-01';
    const exportTo = to || exportFrom;
    const query = new URLSearchParams({from:exportFrom,to:exportTo,store:selectedStore});
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
    const bytes = await buildAttendanceWorkbook(rows, exportFrom, exportTo);
    downloadExcel(bytes, `himoto-cham-cong-${exportFrom}-${exportTo}`);
    return rows.length;
  }
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setError('');setData(null);
    const query = new URLSearchParams({from,to,store:selectedStore,page:String(page)});
    void fetch(`/api/auth/attendance?${query}`,{cache:'no-store',signal:controller.signal}).then(responseData<Report>).then(value=>{if(!controller.signal.aborted)setData(value);}).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Không tải được chấm công.');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[from,to,selectedStore,page,retry]);
  const shiftLink = (row:Attendance) => {
    const label = row.shift_name==='O'?'Nghỉ':row.shift_name||'Chưa đăng ký ca';
    if (!canViewRegistration) return label;
    const date = vietnamDate(new Date(row.clock_in_at));
    const query = new URLSearchParams({date,staff:String(row.staff_id)});
    return <Link className="mg-attendance-registration-link" href={`/shift-registration?${query}`}
      aria-label={`${label} — xem bảng đăng ký của ${row.staff_name} ngày ${date.split('-').reverse().join('/')}`}>{label}</Link>;
  };
  const rowActions = (row: Attendance) => {
    const actions: RowAction[] = [
      { key: 'view', label: 'Xem', icon: <Eye size={16} />, onSelect: () => setRecordDialog({ mode: 'view', row }) },
    ];
    if (isAdmin && row.can_manage) {
      actions.push(
        { key: 'edit', label: 'Sửa', icon: <Pencil size={16} />, onSelect: () => setRecordDialog({ mode: 'edit', row }) },
        { key: 'delete', label: 'Xóa', icon: <Trash2 size={16} />, onSelect: () => setRecordDialog({ mode: 'delete', row }), danger: true },
      );
    }
    return <RowActionsMenu label={`Thao tác lượt chấm công #${row.id}`} actions={actions} />;
  };
  return <section className="mg-page mg-attendance-page"><div className="mg-page-content">
    {recordDialog && <AttendanceRecordDialog {...recordDialog} onClose={() => setRecordDialog(null)} onSaved={() => {
      notify(recordDialog.mode==='delete'?'Đã xóa lượt chấm công.':'Đã cập nhật giờ chấm công.');
      setRecordDialog(null);
      refresh();
    }} />}
    <div className="mg-page-heading"><div><div className="mg-eyebrow">NHÂN SỰ</div><h1>Lịch sử chấm công</h1></div><div className="mg-heading-actions"><Link className="mg-button" href="/attendance">Chấm công</Link>{isAdmin && <FilteredExcelButton disabled={loading||Boolean(error)||!data?.total} label="Tải Excel theo nhân sự" exportFile={exportAttendance}/>}</div></div>
    <div className="mg-data-panel"><div className="mg-attendance-filters"><label>Cơ sở xem lịch sử<select aria-label="Cơ sở xem lịch sử chấm công" value={selectedStore} onChange={event=>{selectStore(event.target.value);setPage(1);}}><option value="all">Tất cả cơ sở được phép</option>{dataset?.stores.map(store=><option key={store.id} value={String(store.id)}>{store.name}</option>)}</select></label><label>Từ ngày<input aria-label="Từ ngày chấm công" type="date" value={from} onChange={event=>{setFrom(event.target.value);setPage(1);}}/></label><label>Đến ngày<input aria-label="Đến ngày chấm công" type="date" value={to} onChange={event=>{setTo(event.target.value);setPage(1);}}/></label><button type="button" className="mg-button" onClick={monthPreset}>Tháng này</button><span>{data?.total??'—'} lượt chấm công</span></div>
    {error?<p className="mg-field-error" role="alert">{error}</p>:loading?<p className="mg-table-state" role="status">Đang tải bảng chấm công…</p>:<>
      <div className="mg-attendance-mobile-list">{data?.rows.map(row=><article key={row.id} className="mg-attendance-history-card"><div className="mg-attendance-history-heading"><strong>{row.staff_name}</strong><small>#{row.id} · {new Date(row.clock_in_at).toLocaleDateString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}</small></div><p>{row.store_name||'Chưa gắn cơ sở'} · {shiftLink(row)}{row.standard_credit!=null?' · '+shiftCreditLabel(row.standard_credit)+' công quy định':''}{row.scheduled_in?' · '+timeOnly(row.scheduled_in)+' – '+timeOnly(row.scheduled_out):''}</p><div className="mg-attendance-history-times"><span>Vào <b>{timeOnly(row.clock_in_at)}</b></span><span>Ra <b>{row.clock_out_at ? timeOnly(row.clock_out_at) : missingCheckout}</b></span><span className={row.late_minutes?'is-late':''}>Đi muộn <b>{lateLabel(row.late_minutes,row.shift_name)}</b></span><span className={row.early_leave_minutes?'is-late':''}>Về sớm <b>{earlyLabel(row.early_leave_minutes,row.clock_out_at,row.shift_name)}</b></span><span>Công thực tế <b>{attendanceCreditLabel(row)}</b>{row.credit_aggregated && ' · Tổng hợp cùng ca'}</span></div>{rowActions(row)}</article>)}{!data?.rows.length&&<p className="mg-table-state">Chưa có chấm công trong khoảng ngày đã chọn.</p>}</div>
      <div className="mg-table-scroll mg-attendance-desktop-table" role="region" aria-label="Bảng chấm công" tabIndex={0}><table className="mg-table"><thead><tr>{['ID','Tên nhân viên','Ca làm','Giờ vào','Giờ ra','Đi muộn','Về sớm','Công thực tế','Thao tác'].map(label=><th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{data?.rows.map(row=><tr key={row.id}><td>#{row.id}</td><td><strong>{row.staff_name}</strong><small className="mg-attendance-store">{row.store_name||'Chưa gắn cơ sở'}</small></td><td>{shiftLink(row)}{row.standard_credit!=null&&<small className="mg-attendance-store">Công quy định: {shiftCreditLabel(row.standard_credit)}</small>}{row.scheduled_in&&<small className="mg-attendance-store">{timeOnly(row.scheduled_in)} – {timeOnly(row.scheduled_out)}</small>}</td><td>{formatDateTime(row.clock_in_at)}</td><td>{row.clock_out_at?formatDateTime(row.clock_out_at):missingCheckout}</td><td className={row.late_minutes?'is-late':''}>{lateLabel(row.late_minutes,row.shift_name)}</td><td className={row.early_leave_minutes?'is-late':''}>{earlyLabel(row.early_leave_minutes,row.clock_out_at,row.shift_name)}</td><td><strong>{attendanceCreditLabel(row)}</strong>{row.credit_aggregated && <small className="mg-attendance-store">Tổng hợp cùng ca</small>}</td><td>{rowActions(row)}</td></tr>)}{!data?.rows.length&&<tr><td colSpan={9}>Chưa có chấm công trong khoảng ngày đã chọn.</td></tr>}</tbody></table></div>
    </>}
    {data&&data.total>50&&<div className="mg-attendance-pagination"><button className="mg-button" disabled={loading||data.page<=1} onClick={()=>setPage(data.page-1)}>Trước</button><span>Trang {data.page}/{Math.ceil(data.total/50)}</span><button className="mg-button" disabled={loading||data.page>=Math.ceil(data.total/50)} onClick={()=>setPage(data.page+1)}>Sau</button></div>}</div>
    <p className="mg-attendance-hint">Giờ chấm công theo máy chủ (giờ Việt Nam). Nhân viên xem lịch sử của mình; người có quyền nhân sự xem theo phạm vi cơ sở.</p>
  </div></section>;
}

type RecordMode = 'view' | 'edit' | 'delete';

function attendanceInputTime(value: string | null) {
  return value ? new Date(Date.parse(value) + 7 * 3600000).toISOString().slice(0,16) : '';
}

function editedAttendanceTime(value: string, original: string | null) {
  if (value === attendanceInputTime(original)) return original;
  return value ? new Date(value+'+07:00').toISOString() : null;
}

function AttendanceRecordDialog({mode,row,onClose,onSaved}:{
  mode:RecordMode;row:Attendance;onClose:()=>void;onSaved:()=>void;
}) {
  const [clockIn,setClockIn] = useState(() => attendanceInputTime(row.clock_in_at));
  const [clockOut,setClockOut] = useState(() => attendanceInputTime(row.clock_out_at));
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const lock = useRef(false);
  const edit = mode==='edit';
  const view = mode==='view';
  const title = view?'Chi tiết chấm công':edit?'Sửa giờ chấm công':'Xóa lượt chấm công';
  const formId = 'attendance-record-form';

  async function save(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const original = {id:row.id,original_in:row.clock_in_at,original_out:row.clock_out_at};
      const body = edit ? {...original,
        clock_in_at:editedAttendanceTime(clockIn,row.clock_in_at),
        clock_out_at:editedAttendanceTime(clockOut,row.clock_out_at),
      } : original;
      await responseData(await fetch('/api/auth/attendance',{
        method:edit?'PATCH':'DELETE',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(body),
      }));
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không lưu được thay đổi.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return <Dialog title={title} subtitle={`#${row.id} · ${row.staff_name}`} onClose={() => {if (!lock.current) onClose();}}>
    <form id={formId} onSubmit={save} className="mg-dialog-body">
      {edit ? <div className="mg-attendance-edit-times">
        <label>Giờ vào (Việt Nam)<input type="datetime-local" required value={clockIn} onChange={event=>setClockIn(event.target.value)} disabled={busy}/></label>
        <label>Giờ ra (Việt Nam)<input type="datetime-local" required={Boolean(row.clock_out_at)} value={clockOut} onChange={event=>setClockOut(event.target.value)} disabled={busy}/></label>
      </div> : view ? <>
        <p>Cơ sở: <strong>{row.store_name || 'Chưa gắn cơ sở'}</strong>{row.store_from_profile && ' (theo hồ sơ nhân viên hiện tại)'}</p>
        <div className="mg-attendance-evidence-pair">
          <Evidence row={row} side="in"/>
          <Evidence row={row} side="out"/>
        </div>
      </> : <>
        <p>Giờ vào: {formatDateTime(row.clock_in_at)}<br/>Giờ ra: {row.clock_out_at?formatDateTime(row.clock_out_at):missingCheckout}</p>
        <p>Xóa lượt chấm công này cùng ảnh và vị trí đã ghi nhận?</p>
      </>}
      {error && <p className="mg-field-error" role="alert">{error}</p>}
    </form>
    <div className="mg-dialog-footer">
      <button type="button" className="mg-button" disabled={busy} onClick={onClose}>{view?'Đóng':'Hủy'}</button>
      {!view && <button type="submit" form={formId} className={`mg-button ${edit?'mg-button-primary':'mg-button-danger'}`} disabled={busy}>
        {busy?'Đang xử lý…':edit?'Lưu thay đổi':'Xác nhận xóa'}
      </button>}
    </div>
  </Dialog>;
}

function ClockCapture({action,initialLocation,onClose,onSaved}:{action:'in'|'out';initialLocation:Promise<Error|null>;onClose:()=>void;onSaved:()=>void}) {
  const video=useRef<HTMLVideoElement>(null),stream=useRef<MediaStream|null>(null),lock=useRef(false),requestId=useRef(crypto.randomUUID());
  const [cameraReady,setCameraReady]=useState(false),[photo,setPhoto]=useState<Blob|null>(null),[preview,setPreview]=useState(''),[locating,setLocating]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [checkingLocation,setCheckingLocation]=useState(true);
  useEffect(()=>{let current=true;
    void initialLocation.then(locationError => {
      if(!current)return;
      setCheckingLocation(false);
      if(locationError)setError(locationError.message);
      if(!navigator.mediaDevices?.getUserMedia){
        setError('Trình duyệt chưa hỗ trợ camera. Mở bằng HTTPS hoặc localhost và cho phép camera.');
        return;
      }
      return navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:960},height:{ideal:720}},audio:false}).then(value=>{
        if(!current){value.getTracks().forEach(track=>track.stop());return;}
        stream.current=value;
        if(video.current)video.current.srcObject=value;
      });
    }).catch(()=>{if(current)setError('Không mở được camera. Hãy cấp quyền camera và mở lại chấm công.');});
    return()=>{current=false;stream.current?.getTracks().forEach(track=>track.stop());};
  },[initialLocation]);
  useEffect(()=>{if(!photo){setPreview('');return;}const url=URL.createObjectURL(photo);setPreview(url);return()=>URL.revokeObjectURL(url);},[photo]);
  async function locate(): Promise<Location> {
    setLocating(true);
    try {
      return await readClockLocation();
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
  return <Dialog title={action==='in'?'Chấm công vào ca':'Chấm công ra ca'} onClose={()=>{if(!lock.current)onClose();}}><div className="mg-dialog-body mg-attendance-capture"><p role="status">{checkingLocation ? 'Đang lấy vị trí. Nếu Safari hỏi quyền vị trí, hãy chọn Cho phép.' : 'Chụp ảnh hiện tại để xác nhận chấm công.'}</p><video ref={video} autoPlay playsInline muted onLoadedData={()=>setCameraReady(true)} aria-label="Camera chấm công"/><button type="button" className="mg-button" disabled={!cameraReady||busy||locating} onClick={capture}><Camera size={17}/>{photo?'Chụp lại':'Chụp ảnh'}</button>{preview&&<img src={preview} alt="Ảnh chấm công vừa chụp"/>}{error&&<p className="mg-field-error" role="alert">{error}</p>}</div><div className="mg-dialog-footer"><button className="mg-button" disabled={busy} onClick={onClose}>Đóng</button><button className="mg-button mg-button-primary" disabled={busy||!photo} onClick={()=>void save()}>{locating?'Đang lấy vị trí…':busy?'Đang lưu…':action==='in'?'Xác nhận vào ca':'Xác nhận ra ca'}</button></div></Dialog>;
}
