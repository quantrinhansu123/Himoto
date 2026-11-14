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
    params.set('all','1');
    const {rows}=await readMobileShifts(user,params);
    const visible=rows.filter(row=>status==='submitted'?row.status==='submitted':matchesShiftReportProgress(row,status));
    return mobileFilteredWorkbook('himoto-bao-cao-cuoi-ca',SHIFT_EXPORT_HEADERS,shiftExportRows(visible));
  }
  if(kind==='duties'){
    const day=localFilter(params,'day','all');
    if(day!=='all'&&(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day))||new Date(day).toISOString().slice(0,10)!==day))throw new MobileError('Ngày trực không hợp lệ.');
    const data=await readMobileDuties(user,params),visible=data.schedules.filter(row=>day==='all'||(!row.starts_at||!row.ends_at?row.duty_date===day:Date.parse(row.starts_at)<Date.parse(`${dutyAddDays(day,1)}T00:00:00+07:00`)&&Date.parse(row.ends_at)>Date.parse(`${day}T00:00:00+07:00`)));
    return mobileFilteredWorkbook('himoto-lich-truc',DUTY_EXPORT_HEADERS,dutyExportRows(visible));
  }
  return mobileFilteredWorkbook('himoto-lich-su-nhac-no',REMINDER_EXPORT_HEADERS,reminderExportRows(await readMobileReminderExportRows(user,params)));
}
