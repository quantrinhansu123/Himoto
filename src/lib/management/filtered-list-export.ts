import { formatDateTime } from '@/lib/formatters';
import { ACCESS_ROLES, type AccessRole } from './permissions';
import { GPS_STATE_LABELS, type GpsVehicle } from './gps';
import { batteryStatusLabel, type BatteryContract } from './battery-contracts';
import { localDutyTime, type DutySchedule } from './duty-roster';
import type { TransferHistoryRow } from './vehicle-transfer-history';
import { SHIFT_SUMMARY_FIELDS, type ShiftReport } from './shift-reports';
import { REMINDER_STATUS_LABELS, type DebtReminderRow } from './debt-reminders';

// The web and mobile exports use these same columns and cell values.
export const TRANSFER_EXPORT_HEADERS = ['Ngày giờ','Thao tác','Biển số','Tên xe','Cơ sở chuyển đi','Cơ sở nhận','Người thao tác','Ghi chú'];
export const transferExportRows = (rows: TransferHistoryRow[]) => rows.map(row => [formatDateTime(row.at),row.label,row.license,row.vehicle_name,row.from_store,row.to_store,row.actor,row.note]);
export const GPS_EXPORT_HEADERS = ['Biển số','Tên GPS','Nền tảng','IMEI','Cơ sở','Trạng thái','Đồng bộ gần nhất','Vĩ độ','Kinh độ'];
export const gpsExportRows = (rows: GpsVehicle[], state: (row: GpsVehicle) => string) => rows.map(row => [row.license,row.provider_device_name,row.provider,row.external_device_id,row.store_name,GPS_STATE_LABELS[state(row)]||state(row),row.sync_received_at,row.last_latitude,row.last_longitude]);
export const BATTERY_EXPORT_HEADERS = ['Mã HĐ','Khách hàng','SĐT','Biển số','Pin','Bắt đầu','Kết thúc','Giá thuê','Cơ sở','Trạng thái'];
const batteryMoment = (value: string) => value ? `${value.slice(11,16)} ${value.slice(8,10)}/${value.slice(5,7)}/${value.slice(0,4)}` : '—';
export const batteryExportRows = (rows: BatteryContract[]) => rows.map(row => [row.code,row.customer_name,row.customer_phone,row.vehicle_license,row.battery_name,batteryMoment(row.starts_at),batteryMoment(row.ends_at),row.rent_price,row.store_name,batteryStatusLabel(row.status)]);
export const ACCOUNT_EXPORT_HEADERS = ['Nhân sự','Đăng nhập','Vai trò','Cơ sở','Trạng thái'];
interface ExportAccount { name: string; login_name: string | null; email: string; access_role: AccessRole | null; scope_all: boolean; store_name: string | null; enabled: boolean | null; status: string }
export const accountExportRows = (rows: ExportAccount[]) => rows.map(row => [row.name,row.login_name||row.email,row.access_role?ACCESS_ROLES[row.access_role].label:'Tài khoản hiện có',row.scope_all?'Toàn hệ thống':row.store_name,(row.enabled??row.status==='active')?'Hoạt động':'Đã khóa']);
export const SHIFT_EXPORT_HEADERS = ['Ngày','Cơ sở','Nhân viên','Trạng thái','Xe','Pin','Tiền mặt','Tài khoản cá nhân','Tài khoản công ty','Ghi chú',...SHIFT_SUMMARY_FIELDS.map(([,label])=>label)];
export const shiftExportRows = (rows: ShiftReport[]) => rows.map(row => [row.payload.date,row.store_name,row.payload.staff,row.status==='draft'?'Bản nháp':'Đã gửi',row.payload.vehicles,row.payload.batteries,row.payload.cash,row.payload.personal,row.payload.company,row.payload.notes,...SHIFT_SUMMARY_FIELDS.map(([key])=>row.payload.summary?.[key]??0)]);
export const DUTY_EXPORT_HEADERS = ['Nhân viên','Cơ sở','Ngày','Bắt đầu','Kết thúc','Ca trực','Vai trò','Ghi chú'];
export const dutyExportRows = (rows: DutySchedule[]) => rows.map(row => [row.staff_name,row.store_name,row.duty_date,row.starts_at?localDutyTime(row.starts_at):'',row.ends_at?localDutyTime(row.ends_at):'',row.shift_name,row.role_in_shift,row.notes]);
export const REMINDER_EXPORT_HEADERS = ['Thời gian','Hợp đồng','Khách hàng','Cơ sở','Số điện thoại','Số tiền nhắc','Nội dung','Trạng thái','Người gửi'];
export const reminderExportRows = (rows: DebtReminderRow[]) => rows.map(row => [formatDateTime(row.created_at),row.contract_code,row.customer_name,row.store_name,row.phone,row.amount,row.message,REMINDER_STATUS_LABELS[row.status],row.actor_name]);
