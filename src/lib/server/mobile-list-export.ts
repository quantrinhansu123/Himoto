import 'server-only';
import type {NextRequest} from 'next/server';
import type {SessionUser} from './management-session';
import {MobileError} from './mobile-session';
import {mobileFilteredWorkbook} from './mobile-filtered-workbook';
import {readMobileTransferExportRows} from './mobile-vehicles';
import {readMobileGpsExportRows} from './mobile-gps';
import {readMobileBatteryExportRows} from './mobile-battery';
import {readMobileAccountExportRows} from './mobile-managed-accounts';
import {readMobileShifts} from './mobile-shift-reports';
import {matchesShiftReportProgress} from '../../../shared/shift-report-workflow';
import {ATTENDANCE_SHIFTS} from '../../../shared/attendance-shifts';
import {registrationDates,registrationExcel} from '../../../shared/mobile-shift-registration';
import {readMobileRegistrationRange} from './mobile-shift-registration';
import {handleAttendance} from './attendance-handler';
import {NextRequest as AttendanceRequest} from 'next/server';
import {buildAttendanceWorkbook} from '@/lib/management/attendance-workbook';
import {vietnamDate} from '@/lib/management/duty-roster';
import type {AttendanceEntry} from '../../../shared/mobile-support';
import {hasPermission} from '@/lib/management/permissions';
import {readMobileDuties} from './mobile-duty-roster';
import {readMobileReminderExportRows} from './mobile-debt-reminders';
import {isMobileListExportKind} from '../../../shared/mobile-list-export';
import {dutyAddDays} from '../../../shared/mobile-duty-roster';
import type {MobileWorkbookExport} from '../../../shared/mobile-export';
import {TRANSFER_EXPORT_HEADERS,transferExportRows,GPS_EXPORT_HEADERS,gpsExportRows,BATTERY_EXPORT_HEADERS,batteryExportRows,ACCOUNT_EXPORT_HEADERS,accountExportRows,SHIFT_EXPORT_HEADERS,shiftExportRows,DUTY_EXPORT_HEADERS,dutyExportRows,REMINDER_EXPORT_HEADERS,reminderExportRows} from '@/lib/management/filtered-list-export';

function localFilter(params:URLSearchParams,key:string,fallback:string) {
  if(params.getAll(key).length>1)throw new MobileError('Bộ lọc xuất bị trùng.');
  const value=params.get(key)||fallback;params.delete(key);return value;
}
export async function exportMobileList(user:SessionUser,kind:string,request:NextRequest):Promise<MobileWorkbookExport> {
  if(!isMobileListExportKind(kind))throw new MobileError('Danh sách xuất không tồn tại.',404,'NOT_FOUND');
  if(request.headers.has('idempotency-key'))throw new MobileError('Xuất danh sách không dùng mã ghi.');
  const params=new URLSearchParams(request.nextUrl.searchParams);
  if(kind==='attendance'){
    if([...params.keys()].some(k=>!['from','to','store'].includes(k)||params.getAll(k).length!==1))throw new MobileError('Bộ lọc chấm công không hợp lệ.');
    const exportFrom=params.get('from')||vietnamDate().slice(0,7)+'-01',exportTo=params.get('to')||exportFrom;
    params.set('from',exportFrom);params.set('to',exportTo);params.set('export','1');
    const response=await handleAttendance(new AttendanceRequest(request.nextUrl.origin+'/api/mobile/v1/attendance?'+params),user),body=await response.json();
    if(!response.ok)throw new MobileError(body.message||'Chưa xuất được chấm công.',response.status);
    const rows:AttendanceEntry[]=body.data.rows;
    if(rows.length!==body.data.total||new Set(rows.map(row=>String(row.id))).size!==rows.length)throw new MobileError('Chưa đọc đủ lịch sử chấm công. Tải lại rồi xuất Excel.');
    const bytes=await buildAttendanceWorkbook(rows.map(row=>({...row,id:Number(row.id),late_minutes:row.late_minutes,early_leave_minutes:row.early_leave_minutes??null,earned_credit:row.earned_credit??null})),exportFrom,exportTo);
    if(bytes.byteLength>12*1024*1024)throw new MobileError('File quá lớn. Thu hẹp bộ lọc rồi xuất lại; chưa xuất file bị cắt.',413,'EXPORT_TOO_LARGE');
    return{filename:`himoto-cham-cong-${exportFrom}-${exportTo}.xlsx`,mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',contentBase64:Buffer.from(bytes).toString('base64'),rowCount:rows.length};
  }
  if(kind==='shift-registrations'){
    if(!hasPermission(user,'hr.read'))throw new MobileError('Không có quyền xuất bảng đăng ký ca.',403,'FORBIDDEN');
    if([...params.keys()].some(k=>!['from','to','store','search'].includes(k)||params.getAll(k).length!==1))throw new MobileError('Bộ lọc đăng ký ca không hợp lệ.');
    const from=params.get('from')||'',to=params.get('to')||'',store=params.get('store')||'all',search=params.get('search')||'';
    try{registrationDates(from,to);}catch(error){throw new MobileError((error as Error).message);}
    if(!/^(all|none|[1-9]\d{0,14})$/.test(store)||search.length>120)throw new MobileError('Bộ lọc đăng ký ca không hợp lệ.');
    const data=await readMobileRegistrationRange(user,from,to),table=registrationExcel(data,store,search);
    return mobileFilteredWorkbook(`himoto-dang-ky-ca-${from}-${to}`,table.headers,table.rows);
  }
  if(kind==='work-shifts'){
    if(!hasPermission(user,'contracts.read')&&!hasPermission(user,'hr.read'))throw new MobileError('Không có quyền xem ca làm việc.',403,'FORBIDDEN');
    if(params.size)throw new MobileError('Danh mục ca làm việc không nhận bộ lọc.');
    return mobileFilteredWorkbook('himoto-ca-lam-viec',['Mã ca','Tên ca','Giờ vào','Giờ ra','Số công'],ATTENDANCE_SHIFTS.map(s=>[s.code,s.name,s.start,s.end,s.credit]));
  }
  if(kind==='transfers')return mobileFilteredWorkbook('himoto-lich-su-luan-chuyen',TRANSFER_EXPORT_HEADERS,transferExportRows(await readMobileTransferExportRows(user,params)));
  if(kind==='gps'){
    const rows=await readMobileGpsExportRows(user,request),states=new Map(rows.map(row=>[row.id,row.displayState]));
    return mobileFilteredWorkbook('himoto-gps',GPS_EXPORT_HEADERS,gpsExportRows(rows,row=>states.get(row.id)!));
  }
  if(kind==='battery')return mobileFilteredWorkbook('himoto-hop-dong-pin',BATTERY_EXPORT_HEADERS,batteryExportRows(await readMobileBatteryExportRows(user,params)));
  if(kind==='accounts')return mobileFilteredWorkbook('himoto-tai-khoan',ACCOUNT_EXPORT_HEADERS,accountExportRows(await readMobileAccountExportRows(user,params)));
  if(kind==='shifts'){
    const status=localFilter(params,'status','all');
    if(!['all','draft','submitted','pending','confirmed','explained'].includes(status))throw new MobileError('Trạng thái báo cáo ca không hợp lệ.');
    const reportType=params.get('report_type');
    params.set('all','1');
    const {rows}=await readMobileShifts(user,params);
    const visible=rows.filter(row=>status==='submitted'?row.status==='submitted':matchesShiftReportProgress(row,status));
    return mobileFilteredWorkbook(reportType==='mid_shift'?'himoto-bao-cao-giua-ca':'himoto-bao-cao-het-ca',SHIFT_EXPORT_HEADERS,shiftExportRows(visible));
  }
  if(kind==='duties'){
    const day=localFilter(params,'day','all');
    if(day!=='all'&&(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day))||new Date(day).toISOString().slice(0,10)!==day))throw new MobileError('Ngày trực không hợp lệ.');
    const data=await readMobileDuties(user,params),visible=data.schedules.filter(row=>day==='all'||(!row.starts_at||!row.ends_at?row.duty_date===day:Date.parse(row.starts_at)<Date.parse(`${dutyAddDays(day,1)}T00:00:00+07:00`)&&Date.parse(row.ends_at)>Date.parse(`${day}T00:00:00+07:00`)));
    return mobileFilteredWorkbook('himoto-lich-truc',DUTY_EXPORT_HEADERS,dutyExportRows(visible));
  }
  return mobileFilteredWorkbook('himoto-lich-su-nhac-no',REMINDER_EXPORT_HEADERS,reminderExportRows(await readMobileReminderExportRows(user,params)));
}
