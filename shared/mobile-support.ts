import type { GuideFaq } from './guide-faq';

export type AttendanceLocation={latitude:number;longitude:number;accuracy:number;timestamp:number;store_name?:string;store_address?:string|null;note?:string};
export type AttendanceStoreOption={id:number;name:string;latitude?:number|null;longitude?:number|null};
export type NearestAttendanceStore={store_name:string;distance_m:number};
type Coordinates = { latitude: number; longitude: number };

export function nearestAttendanceStore(punch: Coordinates | null, stores: {latitude?: number | null; longitude?: number | null; store_name: string}[]) {
  let nearest: {store_name: string; distance_m: number} | null = null;
  for (const store of stores) {
    if (store.latitude == null || store.longitude == null) continue;
    const distance = distanceMeters(punch, {latitude: store.latitude, longitude: store.longitude});
    if (distance !== null && (nearest === null || distance < nearest.distance_m)) {
      nearest = {store_name: store.store_name, distance_m: distance};
    }
  }
  return nearest;
}

export function distanceMeters(punch: Coordinates | null, store: Coordinates | null) {
  if (!punch || !store) return null;
  const valid = ({latitude,longitude}: Coordinates) =>
    Number.isFinite(latitude) && Math.abs(latitude) <= 90 &&
    Number.isFinite(longitude) && Math.abs(longitude) <= 180;
  if (!valid(punch) || !valid(store)) return null;
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(punch.latitude - store.latitude);
  const longitudeDelta = radians(punch.longitude - store.longitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(punch.latitude)) * Math.cos(radians(store.latitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(Math.min(1,haversine)));
}

export function nearestAttendanceStoreOption(location: AttendanceLocation, stores: AttendanceStoreOption[]) {
  return nearestAttendanceStore(location, stores.map(store => ({
    store_name: store.name,
    latitude: store.latitude,
    longitude: store.longitude,
  })));
}

export function attendanceLocationLabel(location: AttendanceLocation | null, nearest?: NearestAttendanceStore | null) {
  if (!location) return 'Chưa ghi nhận GPS';
  if (!nearest) return 'Chưa có cơ sở được cấu hình tọa độ để đối chiếu';
  if (nearest.distance_m <= 100) return nearest.store_name;
  const meters = Math.ceil(nearest.distance_m);
  const distance = nearest.distance_m >= 1000
    ? `${(nearest.distance_m / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} km`
    : `${meters.toLocaleString('vi-VN')} m`;
  return `Địa điểm cách cơ sở gần nhất (${nearest.store_name}) ${distance}`;
}
export type AttendanceEntry={hr_note?:string|null;can_note?:boolean;in_nearest_store?:NearestAttendanceStore|null;out_nearest_store?:NearestAttendanceStore|null;id:number|string;staff_id:number|string;staff_name:string;store_name:string|null;clock_in_at:string;clock_out_at:string|null;in_location:AttendanceLocation;out_location:AttendanceLocation|null;shift_name:string|null;scheduled_in:string|null;scheduled_out:string|null;late_minutes:number|null;early_leave_minutes?:number|null;standard_credit?:number|null;earned_credit?:number|null;credit_aggregated?:boolean;credit_on_other_row?:boolean;has_out_photo?:boolean;has_store_location?:boolean;in_distance_m?:number|null;out_distance_m?:number|null;store_from_profile?:boolean;can_manage?:boolean};
export type AttendanceEdit={id:number|string;original_in:string;original_out:string|null;clock_in_at?:string;clock_out_at?:string|null};
export type AttendanceHrNote={id:number|string;hr_note:string;original_hr_note:string|null};
export type AttendanceSummary={stores?:AttendanceStoreOption[];staff:{name:string;store_id?:number|null;store_name?:string|null}|null;open:{id:number|string;clock_in_at:string}|null;latest:{clock_in_at:string;clock_out_at:string|null}|null;shift:{shift_name:string;starts_at:string;ends_at:string}|null;shift_code?:string|null;schedule_offset_minutes?:number;late_minutes:number|null;early_leave_minutes?:number|null;server_now:string;rows:AttendanceEntry[];total:number;page:number};
export type AttendanceReceipt={id:number;replayed?:boolean};
export type AttendanceOverview=Omit<AttendanceSummary,'rows'|'total'|'page'>;
export function isAttendanceOverview(value:unknown):value is AttendanceOverview{return !!value&&typeof value==='object'&&isAttendanceSummary({...value,rows:[],total:0,page:1});}
export type AttendanceResolution={result:{id:number;action:'in'|'out';clock_in_at:string;clock_out_at:string|null}|null};
export type MobileGuideFaq={rows:GuideFaq[];user_name:string;can_answer:boolean;total:number;page:number;hasMore:boolean};

const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const text=(v:unknown)=>typeof v==='string';
const id=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0||typeof v==='string'&&/^[1-9]\d{0,14}$/.test(v);
const date=(v:unknown)=>text(v)&&Number.isFinite(Date.parse(v as string));
const nullableDate=(v:unknown)=>v===null||date(v);
const count=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
export function isAttendanceLocation(v:unknown):v is AttendanceLocation {
  return object(v)&&typeof v.latitude==='number'&&Number.isFinite(v.latitude)&&Math.abs(v.latitude)<=90&&typeof v.longitude==='number'&&Number.isFinite(v.longitude)&&Math.abs(v.longitude)<=180&&typeof v.accuracy==='number'&&Number.isFinite(v.accuracy)&&v.accuracy>=0&&typeof v.timestamp==='number'&&Number.isFinite(v.timestamp);
}
export function isAttendanceSummary(v:unknown):v is AttendanceSummary {
  return object(v)&&(v.staff===null||object(v.staff)&&text(v.staff.name)&&(v.staff.store_id===undefined||v.staff.store_id===null||id(v.staff.store_id))&&(v.staff.store_name===undefined||v.staff.store_name===null||text(v.staff.store_name)))&&(v.open===null||object(v.open)&&id(v.open.id)&&date(v.open.clock_in_at))&&(v.latest===null||object(v.latest)&&date(v.latest.clock_in_at)&&nullableDate(v.latest.clock_out_at))&&(v.shift===null||object(v.shift)&&text(v.shift.shift_name)&&date(v.shift.starts_at)&&date(v.shift.ends_at))&&(v.shift_code===undefined||v.shift_code===null||text(v.shift_code))&&(v.schedule_offset_minutes===undefined||count(v.schedule_offset_minutes))&&(v.late_minutes===null||count(v.late_minutes))&&(v.early_leave_minutes===undefined||v.early_leave_minutes===null||count(v.early_leave_minutes))&&date(v.server_now)&&count(v.total)&&id(v.page)&&Array.isArray(v.rows)&&v.rows.length<=50&&v.rows.every(row=>object(row)&&attendanceDetails(row)&&id(row.id)&&id(row.staff_id)&&text(row.staff_name)&&(row.store_name===null||text(row.store_name))&&date(row.clock_in_at)&&nullableDate(row.clock_out_at)&&isAttendanceLocation(row.in_location)&&(row.out_location===null||isAttendanceLocation(row.out_location))&&(row.shift_name===null||text(row.shift_name))&&nullableDate(row.scheduled_in)&&nullableDate(row.scheduled_out)&&(row.late_minutes===null||count(row.late_minutes)));
}
export const isAttendanceReceipt=(v:unknown):v is AttendanceReceipt=>object(v)&&typeof v.id==='number'&&id(v.id)&&(v.replayed===undefined||typeof v.replayed==='boolean');
export const isAttendanceResolution=(v:unknown):v is AttendanceResolution=>object(v)&&(v.result===null||object(v.result)&&typeof v.result.id==='number'&&id(v.result.id)&&['in','out'].includes(String(v.result.action))&&date(v.result.clock_in_at)&&nullableDate(v.result.clock_out_at));
export function isMobileGuideFaq(v:unknown):v is MobileGuideFaq {
  return object(v)&&text(v.user_name)&&typeof v.can_answer==='boolean'&&count(v.total)&&id(v.page)&&typeof v.hasMore==='boolean'&&Array.isArray(v.rows)&&v.rows.length<=20&&v.rows.every(row=>object(row)&&typeof row.id==='number'&&id(row.id)&&text(row.category)&&text(row.question)&&text(row.asker_name)&&text(row.answer)&&(row.answerer_name===null||text(row.answerer_name))&&typeof row.revision==='number'&&id(row.revision)&&date(row.created_at)&&Array.isArray(row.images)&&row.images.length<=10&&row.images.every(id));
}

function attendanceDetails(row:Record<string,unknown>){
 if (row.hr_note != null && !text(row.hr_note)) return false;
 return ['early_leave_minutes','standard_credit','earned_credit','in_distance_m','out_distance_m'].every(key=>row[key]===undefined||row[key]===null||typeof row[key]==='number'&&Number.isFinite(row[key])&&row[key]>=0)&&['credit_aggregated','credit_on_other_row','has_out_photo','has_store_location','store_from_profile','can_manage','can_note'].every(key=>row[key]===undefined||typeof row[key]==='boolean');
}
