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
import { shiftCreditLabel, splitAttendanceShiftHours } from '@/lib/management/attendance-shifts';
import { buildAttendanceWorkbook } from '@/lib/management/attendance-workbook';
import { downloadExcel } from '@/lib/management/excel-export';
import { formatDateTime } from '@/lib/formatters';
import { canConfigureAttendance, canExportAttendance, canManageShiftRegistration, canViewOtherAttendance, isAdminAccount } from '@/lib/management/permissions';
import { WeeklyShiftRegistrationDialog } from './WeeklyShiftRegistrationDialog';
import { BrowserLocationError, requestBrowserLocation, type BrowserLocation as Location } from '@/lib/management/browser-geolocation';

import { attendanceLocationLabel, nearestAttendanceStoreOption, type AttendanceLocation, type AttendanceStoreOption, type NearestAttendanceStore } from '../../../shared/mobile-support';

type InitialClockLocation = Location | Error;
type Attendance = {hr_note?:string|null;can_note?:boolean;id:number;staff_id:number|string;staff_name:string;store_name:string|null;store_from_profile:boolean;clock_in_at:string;clock_out_at:string|null;in_location:AttendanceLocation|null;out_location:AttendanceLocation|null;in_nearest_store?:NearestAttendanceStore|null;out_nearest_store?:NearestAttendanceStore|null;has_out_photo:boolean;has_store_location:boolean;in_distance_m:number|null;out_distance_m:number|null;shift_name:string|null;scheduled_in:string|null;scheduled_out:string|null;late_minutes:number|null;early_leave_minutes:number|null;standard_credit:number|null;earned_credit:number|null;credit_aggregated:boolean;credit_on_other_row:boolean;can_manage:boolean};
type Summary = {stores:AttendanceStoreOption[];staff:{name:string;store_id:number|null;store_name:string|null}|null;open:{id:number;clock_in_at:string}|null;latest:{clock_in_at:string;clock_out_at:string|null}|null;shift:{shift_name:string;starts_at:string;ends_at:string}|null;shift_code:string|null;schedule_offset_minutes?:number;late_minutes:number|null;early_leave_minutes:number|null;server_now:string};
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
  const nearest = entering?row.in_nearest_store:row.out_nearest_store;
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
        <dd><strong>{attendanceLocationLabel(location, nearest)}</strong></dd>
        {location && <dd>
          <a href={`https://www.google.com/maps?q=${location.latitude},${location.longitude}`} target="_blank" rel="noopener noreferrer">
            <MapPin size={14}/> {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
          </a>
          <small>Độ chính xác GPS ±{Math.round(location.accuracy)} m</small>
        </dd>}
        {location?.store_name && <><dt>Cơ sở đã chọn</dt><dd>{location.store_name}</dd></>}
        {location?.store_address && <><dt>Địa chỉ cơ sở chấm công</dt><dd>{location.store_address}</dd></>}
        {location?.note && <><dt>Ghi chú</dt><dd>{location.note}</dd></>}
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
  const {notify,accessUser} = useManagement();
  const canConfigure = canConfigureAttendance(accessUser);
  const [retry,setRetry] = useState(0);
  const refresh = useCallback(()=>setRetry(value=>value+1),[]);
  const [data,setData] = useState<Summary|null>(null),[loading,setLoading] = useState(true),[error,setError] = useState('');
  const [clock,setClock] = useState<{action:'in'|'out';initialLocation:Promise<InitialClockLocation>}|null>(null);
  function startClock(nextAction:'in'|'out') {
    const initialLocation = requestBrowserLocation().catch((error:Error) => error);
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
    {canConfigure && settingsOpen && <AttendanceLocationsDialog canEdit onClose={() => setSettingsOpen(false)} />}
    {registrationOpen && <WeeklyShiftRegistrationDialog onClose={() => setRegistrationOpen(false)} onSaved={() => { setRegistrationOpen(false); refresh(); notify('Đã lưu đăng ký ca làm trong tuần.'); }} />}
    <div className="mg-page-heading">
      <div>
        <div className="mg-eyebrow">NHÂN SỰ</div>
        <h1>Chấm công</h1>
        <p>Ghi nhận giờ vào, giờ ra cùng ảnh chụp và vị trí GPS.</p>
      </div>
      <div className="mg-heading-actions mg-attendance-header-actions">
        {canConfigure && <button type="button" className="mg-button" onClick={() => setSettingsOpen(true)}><Settings size={16}/>Cài đặt</button>}
        <Link className="mg-button" href="/attendance/history"><History size={16}/>Lịch sử chấm công</Link>
        {data?.staff?.store_id && <button type="button" className="mg-button mg-attendance-register-action" onClick={() => setRegistrationOpen(true)}><CalendarDays size={16}/>Đăng ký ca trong tuần</button>}
      </div>
    </div>
    <div className="mg-data-panel mg-attendance-dashboard">
      <div className="mg-attendance-filters"><p><MapPin size={16}/> Cơ sở chấm công: <strong>{loading?'Đang tải…':data?.staff?.store_name||'Chưa gắn cơ sở'}</strong></p>
        {canManageShiftRegistration(accessUser) && <Link className="mg-button" href="/shift-registration">Bảng đăng ký ca</Link>}
      </div>
      <p className="mg-attendance-hint">Có thể chọn cơ sở khác khi chấm công và ghi rõ lý do.</p>
      <div className="mg-attendance-clock-heading"><div><strong>{data?.staff?.name || 'Tài khoản chấm công'}</strong><p>{loading?'Đang kiểm tra ca…':data?.open?'Đang trong ca':data?.staff?'Chưa vào ca':error?'Không tải được trạng thái ca.':'Tài khoản chưa liên kết nhân viên đang hoạt động.'}</p></div><LiveVietnamClock serverNow={data?.server_now} onDayChanged={handleDayChanged}/></div>
      <div className="mg-attendance-shift-label">{data?.shift_code==='G1+G3'&&!data.latest?`G1+G3 · ${splitAttendanceShiftHours(data.schedule_offset_minutes)}`:data?.shift?data.shift.shift_name+' · '+timeOnly(data.shift.starts_at)+' – '+timeOnly(data.shift.ends_at):data?.shift_code==='O'?'Đăng ký nghỉ':'Chưa có ca đăng ký'}</div>
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
    {clock&&data?.staff?.store_id&&<ClockCapture homeStore={data.staff.store_id} stores={data.stores ?? [{id:data.staff.store_id,name:data.staff.store_name || 'Cơ sở được phân công'}]} action={clock.action} initialLocation={clock.initialLocation} onClose={()=>setClock(null)} onSaved={()=>{setClock(null);refresh();notify(clock.action==='in'?'Đã ghi nhận vào ca.':'Đã ghi nhận ra ca.');}}/>}
  </div></section>;
}

export function AttendanceHistoryPage() {
  const {selectedStore,selectStore,dataset,ensureData,notify,accessUser} = useManagement();
  const canViewRegistration = canManageShiftRegistration(accessUser);
  const canReview = canViewOtherAttendance(accessUser);
  const historyStore = canReview ? selectedStore : 'all';
  const isAdmin = isAdminAccount(accessUser);
  useEffect(()=>{if (canReview) void ensureData(['stores']).catch(()=>{});},[canReview,ensureData]);
  useEffect(()=>{setPage(1);},[historyStore]);
  const [from,setFrom] = useState(()=>vietnamDate().slice(0,7)+'-01'),[to,setTo] = useState(vietnamDate),[page,setPage] = useState(1);
  const [retry,setRetry] = useState(0);
  const refresh = useCallback(()=>setRetry(value=>value+1),[]);
  const [data,setData] = useState<Report|null>(null),[loading,setLoading] = useState(true),[error,setError] = useState('');
  const [recordDialog, setRecordDialog] = useState<{ mode: RecordMode; row: Attendance } | null>(null);
  const monthPreset = () => {setFrom(vietnamDate().slice(0,7)+'-01');setTo(vietnamDate());setPage(1);};
  async function exportAttendance() {
    const exportFrom = from || vietnamDate().slice(0, 7) + '-01';
    const exportTo = to || exportFrom;
    const query = new URLSearchParams({from:exportFrom,to:exportTo,store:historyStore,export:'1'});
    const {rows,total} = await responseData<Report>(await fetch('/api/auth/attendance?'+query,{cache:'no-store'}));
    if (rows.length!==total) throw new Error('Chưa đọc đủ lịch sử chấm công.');
    const bytes = await buildAttendanceWorkbook(rows, exportFrom, exportTo);
    downloadExcel(bytes, `himoto-cham-cong-${exportFrom}-${exportTo}`);
    return rows.length;
  }
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setError('');setData(null);
    const query = new URLSearchParams({from,to,store:historyStore,page:String(page)});
    void fetch(`/api/auth/attendance?${query}`,{cache:'no-store',signal:controller.signal}).then(responseData<Report>).then(value=>{if(!controller.signal.aborted)setData(value);}).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Không tải được chấm công.');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[from,to,historyStore,canReview,page,retry]);
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
    if (row.can_note) actions.push({key:'note',label:'Ghi chú nhân sự',icon:<Pencil size={16}/>,onSelect:()=>setRecordDialog({mode:'note',row})});
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
      notify(recordDialog.mode==='delete'?'Đã xóa lượt chấm công.':recordDialog.mode==='note'?'Đã lưu ghi chú nhân sự.':'Đã cập nhật giờ chấm công.');
      setRecordDialog(null);
      refresh();
    }} />}
    <div className="mg-page-heading"><div><div className="mg-eyebrow">NHÂN SỰ</div><h1>Lịch sử chấm công</h1></div><div className="mg-heading-actions"><Link className="mg-button" href="/attendance">Chấm công</Link>{canExportAttendance(accessUser) && <FilteredExcelButton disabled={loading||Boolean(error)||!data?.total} label="Tải Excel theo nhân sự" exportFile={exportAttendance}/>}</div></div>
    <div className="mg-data-panel"><div className="mg-attendance-filters">{canReview&&<label>Cơ sở xem lịch sử<select aria-label="Cơ sở xem lịch sử chấm công" value={selectedStore} onChange={event=>{selectStore(event.target.value);setPage(1);}}><option value="all">Tất cả cơ sở được phép</option>{dataset?.stores.map(store=><option key={store.id} value={String(store.id)}>{store.name}</option>)}</select></label>}<label>Từ ngày<input aria-label="Từ ngày chấm công" type="date" value={from} onChange={event=>{setFrom(event.target.value);setPage(1);}}/></label><label>Đến ngày<input aria-label="Đến ngày chấm công" type="date" value={to} onChange={event=>{setTo(event.target.value);setPage(1);}}/></label><button type="button" className="mg-button" onClick={monthPreset}>Tháng này</button><span>{data?.total??'—'} lượt chấm công</span></div>
    {error?<p className="mg-field-error" role="alert">{error}</p>:loading?<p className="mg-table-state" role="status">Đang tải bảng chấm công…</p>:<>
      <div className="mg-attendance-mobile-list">{data?.rows.map(row=><article key={row.id} className="mg-attendance-history-card"><div className="mg-attendance-history-heading"><strong>{row.staff_name}</strong><small>#{row.id} · {new Date(row.clock_in_at).toLocaleDateString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}</small></div><p>{row.store_name||'Chưa gắn cơ sở'} · {shiftLink(row)}{row.standard_credit!=null?' · '+shiftCreditLabel(row.standard_credit)+' công quy định':''}{row.scheduled_in?' · '+timeOnly(row.scheduled_in)+' – '+timeOnly(row.scheduled_out):''}</p><div className="mg-attendance-history-times"><span>Vào <b>{timeOnly(row.clock_in_at)}</b></span><span>Ra <b>{row.clock_out_at ? timeOnly(row.clock_out_at) : missingCheckout}</b></span><span className={row.late_minutes?'is-late':''}>Đi muộn <b>{lateLabel(row.late_minutes,row.shift_name)}</b></span><span className={row.early_leave_minutes?'is-late':''}>Về sớm <b>{earlyLabel(row.early_leave_minutes,row.clock_out_at,row.shift_name)}</b></span><span>Công thực tế <b>{attendanceCreditLabel(row)}</b>{row.credit_aggregated && ' · Tổng hợp cùng ca'}</span></div>{row.in_location?.note&&<p className="mg-attendance-punch-note">Ghi chú vào ca: {row.in_location.note}</p>}{row.out_location?.note&&<p className="mg-attendance-punch-note">Ghi chú ra ca: {row.out_location.note}</p>}{rowActions(row)}</article>)}{!data?.rows.length&&<p className="mg-table-state">Chưa có chấm công trong khoảng ngày đã chọn.</p>}</div>
      <div className="mg-table-scroll mg-attendance-desktop-table" role="region" aria-label="Bảng chấm công" tabIndex={0}><table className="mg-table"><thead><tr>{['ID','Tên nhân viên','Ca làm','Giờ vào','Giờ ra','Đi muộn','Về sớm','Công thực tế','Thao tác'].map(label=><th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{data?.rows.map(row=><tr key={row.id}><td>#{row.id}</td><td><strong>{row.staff_name}</strong><small className="mg-attendance-store">{row.store_name||'Chưa gắn cơ sở'}</small></td><td>{shiftLink(row)}{row.standard_credit!=null&&<small className="mg-attendance-store">Công quy định: {shiftCreditLabel(row.standard_credit)}</small>}{row.scheduled_in&&<small className="mg-attendance-store">{timeOnly(row.scheduled_in)} – {timeOnly(row.scheduled_out)}</small>}</td><td>{formatDateTime(row.clock_in_at)}{row.in_location?.store_address&&<small className="mg-attendance-store">{row.in_location.store_address}</small>}{row.in_location?.note&&<small className="mg-attendance-punch-note">Ghi chú: {row.in_location.note}</small>}</td><td>{row.clock_out_at?formatDateTime(row.clock_out_at):missingCheckout}{row.out_location?.store_address&&<small className="mg-attendance-store">{row.out_location.store_address}</small>}{row.out_location?.note&&<small className="mg-attendance-punch-note">Ghi chú: {row.out_location.note}</small>}</td><td className={row.late_minutes?'is-late':''}>{lateLabel(row.late_minutes,row.shift_name)}</td><td className={row.early_leave_minutes?'is-late':''}>{earlyLabel(row.early_leave_minutes,row.clock_out_at,row.shift_name)}</td><td><strong>{attendanceCreditLabel(row)}</strong>{row.credit_aggregated && <small className="mg-attendance-store">Tổng hợp cùng ca</small>}</td><td>{rowActions(row)}</td></tr>)}{!data?.rows.length&&<tr><td colSpan={9}>Chưa có chấm công trong khoảng ngày đã chọn.</td></tr>}</tbody></table></div>
    </>}
    {data&&data.total>50&&<div className="mg-attendance-pagination"><button className="mg-button" disabled={loading||data.page<=1} onClick={()=>setPage(data.page-1)}>Trước</button><span>Trang {data.page}/{Math.ceil(data.total/50)}</span><button className="mg-button" disabled={loading||data.page>=Math.ceil(data.total/50)} onClick={()=>setPage(data.page+1)}>Sau</button></div>}</div>
    <p className="mg-attendance-hint">Giờ chấm công theo máy chủ (giờ Việt Nam). Nhân viên xem lịch sử của mình; người có quyền nhân sự xem theo phạm vi cơ sở.</p>
  </div></section>;
}

type RecordMode = 'view' | 'edit' | 'delete' | 'note';

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
  const noting = mode==='note';
  const [hrNote,setHrNote] = useState(row.hr_note ?? '');
  const view = mode==='view';
  const title = view?'Chi tiết chấm công':edit?'Sửa giờ chấm công':noting?'Ghi chú nhân sự':'Xóa lượt chấm công';
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
      } : noting ? {id:row.id,hr_note:hrNote,original_hr_note:row.hr_note ?? null} : original;
      await responseData(await fetch('/api/auth/attendance',{
        method:edit||noting?'PATCH':'DELETE',
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
      </div> : noting ? <label className="mg-field">Ghi chú nội bộ<textarea value={hrNote} maxLength={500} disabled={busy} onChange={event=>setHrNote(event.target.value)}/></label> : view ? <>
        <p>Cơ sở phụ trách <strong>{row.store_name || 'Chưa gắn cơ sở'}</strong>{row.store_from_profile && ' (theo hồ sơ nhân viên hiện tại)'}</p>
        {row.hr_note && <p><strong>Ghi chú nhân sự</strong> · {row.hr_note}</p>}
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
      {!view && <button type="submit" form={formId} className={`mg-button ${edit||noting?'mg-button-primary':'mg-button-danger'}`} disabled={busy}>
        {busy?'Đang xử lý…':edit||noting?'Lưu thay đổi':'Xác nhận xóa'}
      </button>}
    </div>
  </Dialog>;
}

function ClockCapture({action,homeStore,stores,initialLocation,onClose,onSaved}:{homeStore:number;stores:AttendanceStoreOption[];action:'in'|'out';initialLocation:Promise<InitialClockLocation>;onClose:()=>void;onSaved:()=>void}) {
  const video=useRef<HTMLVideoElement>(null),stream=useRef<MediaStream|null>(null),lock=useRef(false),requestId=useRef(crypto.randomUUID());
  const [cameraReady,setCameraReady]=useState(false),[photo,setPhoto]=useState<Blob|null>(null),[preview,setPreview]=useState(''),[locating,setLocating]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [clockLocation,setClockLocation]=useState<InitialClockLocation|null>(null);
  const [store,setStore]=useState(String(homeStore)), [note,setNote]=useState('');
  const needsNote=store!==String(homeStore)&&!note.trim();
  useEffect(()=>{let current=true;
    void initialLocation.then(location => {
      if(!current)return;
      setClockLocation(location);
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
  async function retryLocation(): Promise<Location|null> {
    setLocating(true);
    try {
      const location = await requestBrowserLocation();
      setClockLocation(location);
      return location;
    } catch (cause) {
      setClockLocation(cause instanceof Error ? cause : new Error('Chưa lấy được vị trí. Vui lòng thử lại.'));
      return null;
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
    if(lock.current||locating||!photo||needsNote||!clockLocation||clockLocation instanceof Error)return;
    lock.current=true;setBusy(true);setError('');
    try {
      const location = Math.abs(Date.now()-clockLocation.timestamp)<60_000 ? clockLocation : await retryLocation();
      if(!location)return;
      const form=new FormData();form.set('action',action);form.set('request_id',requestId.current);form.set('photo',photo,'cham-cong.jpg');form.set('location',JSON.stringify(location));form.set('store_id',store);form.set('note',note.trim());await responseData(await fetch('/api/auth/attendance',{method:'POST',body:form}));onSaved();
    }
    catch(cause){setError(cause instanceof Error?cause.message:'Chưa xác nhận được chấm công. Giữ màn hình này để thử lại cùng lần chấm.');}
    finally {lock.current=false;setBusy(false);}
  }
  const locationError = clockLocation instanceof Error ? clockLocation : null;
  const permissionDenied = locationError instanceof BrowserLocationError && locationError.reason==='permission-denied';
  const checkingLocation = locating || !clockLocation;
  const showLocationHelp = permissionDenied;

  return <Dialog className="mg-attendance-capture-dialog" title={showLocationHelp?'Bật vị trí để chấm công':action==='in'?'Chấm công vào ca':'Chấm công ra ca'} onClose={()=>{if(!lock.current)onClose();}}>
    <div className="mg-dialog-body mg-attendance-capture" hidden={showLocationHelp}>
      <video ref={video} autoPlay playsInline muted onLoadedData={()=>setCameraReady(true)} aria-label="Camera chấm công"/>
      {preview&&<img src={preview} alt="Ảnh chấm công vừa chụp"/>}
      <label className="mg-field">Cơ sở chấm công<select value={store} disabled={busy} onChange={event=>setStore(event.target.value)}>{stores.map(option=><option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
    </div>
    {showLocationHelp && <div className="mg-dialog-body">
      <p>Safari đang chặn vị trí. Hãy cấp quyền cho Himoto rồi kiểm tra lại ngay trong cửa sổ này.</p>
      <ol>
        <li>Trong Safari, chạm vào biểu tượng menu bên trái thanh địa chỉ. Chọn <strong>Cài đặt trang web</strong> (trong mục <strong>Thêm</strong> nếu có), rồi chọn <strong>Vị trí → Cho phép</strong>.</li>
        <li>Nếu vẫn bị chặn, mở <strong>Cài đặt iPhone → Quyền riêng tư &amp; Bảo mật → Dịch vụ định vị</strong>. Bật dịch vụ định vị, chọn <strong>Trang web Safari → Khi dùng ứng dụng</strong> và bật <strong>Vị trí chính xác</strong>.</li>
        <li>Quay lại màn hình này và bấm <strong>Kiểm tra lại vị trí</strong>.</li>
      </ol>
      <p><a href="https://support.apple.com/guide/iphone/browse-the-web-privately-iphb01fc3c85/ios" target="_blank" rel="noopener noreferrer">Mở hướng dẫn cài đặt vị trí Safari của Apple</a></p>
      {(photo || note) && <p>Ảnh đã chụp và ghi chú đã nhập được giữ trong cửa sổ này.</p>}
    </div>}
    <div className="mg-dialog-footer mg-attendance-capture-footer">
      {!showLocationHelp && <div className="mg-attendance-photo-actions">
        <button type="button" className="mg-button" disabled={!cameraReady||busy} onClick={capture}><Camera size={17}/>{photo?'Chụp lại ảnh':'Chụp ảnh'}</button>
        <span role="status">{photo?'Đã chụp ảnh.':'Cần chụp ảnh để xác nhận chấm công.'}</span>
      </div>}
      {!showLocationHelp && <label className="mg-field mg-attendance-capture-note">
        {store===String(homeStore)?'Ghi chú (không bắt buộc)':'Lý do chấm công tại cơ sở khác (bắt buộc)'}
        <textarea rows={2} value={note} maxLength={500} required={store!==String(homeStore)} disabled={busy} onChange={event=>setNote(event.target.value)} />
      </label>}
      {error&&<p className="mg-field-error" role="alert">{error}</p>}
      {checkingLocation ? <p role="status">Đang lấy vị trí. Nếu trình duyệt hỏi quyền vị trí, hãy chọn Cho phép.</p>
        : locationError ? <p className="mg-field-error" role="alert">{permissionDenied ? 'Chưa có quyền vị trí.' : locationError.message}</p>
        : clockLocation && !(clockLocation instanceof Error) ? <p role="status">
          {attendanceLocationLabel(clockLocation, nearestAttendanceStoreOption(clockLocation, stores))}
        </p> : null}
      <button type="button" className="mg-button" disabled={busy} onClick={onClose}>Đóng</button>
      {locationError && !busy
        ? <button type="button" className="mg-button mg-button-primary" disabled={locating} onClick={()=>void retryLocation()}>
          <MapPin size={17} aria-hidden="true"/>{locating?'Đang lấy vị trí…':showLocationHelp?'Kiểm tra lại vị trí':'Lấy vị trí hiện tại'}
        </button>
        : <button type="button" className="mg-button mg-button-primary" disabled={busy||checkingLocation||!photo||needsNote} onClick={()=>void save()}>
          {checkingLocation?'Đang lấy vị trí…':busy?'Đang lưu…':action==='in'?'Xác nhận vào ca':'Xác nhận ra ca'}
        </button>}
    </div>
  </Dialog>;
}
