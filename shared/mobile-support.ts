import type { GuideFaq } from './guide-faq';

export type AttendanceLocation={latitude:number;longitude:number;accuracy:number;timestamp:number};
export type AttendanceEntry={id:number|string;staff_id:number|string;staff_name:string;store_name:string|null;clock_in_at:string;clock_out_at:string|null;in_location:AttendanceLocation;out_location:AttendanceLocation|null;shift_name:string|null;scheduled_in:string|null;scheduled_out:string|null;late_minutes:number|null};
export type AttendanceSummary={staff:{name:string}|null;open:{id:number|string;clock_in_at:string}|null;latest:{clock_in_at:string;clock_out_at:string|null}|null;shift:{shift_name:string;starts_at:string;ends_at:string}|null;late_minutes:number|null;server_now:string;rows:AttendanceEntry[];total:number;page:number};
export type AttendanceReceipt={id:number;replayed?:boolean};
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
  return object(v)&&(v.staff===null||object(v.staff)&&text(v.staff.name))&&(v.open===null||object(v.open)&&id(v.open.id)&&date(v.open.clock_in_at))&&(v.latest===null||object(v.latest)&&date(v.latest.clock_in_at)&&nullableDate(v.latest.clock_out_at))&&(v.shift===null||object(v.shift)&&text(v.shift.shift_name)&&date(v.shift.starts_at)&&date(v.shift.ends_at))&&(v.late_minutes===null||count(v.late_minutes))&&date(v.server_now)&&count(v.total)&&id(v.page)&&Array.isArray(v.rows)&&v.rows.length<=50&&v.rows.every(row=>object(row)&&id(row.id)&&id(row.staff_id)&&text(row.staff_name)&&(row.store_name===null||text(row.store_name))&&date(row.clock_in_at)&&nullableDate(row.clock_out_at)&&isAttendanceLocation(row.in_location)&&(row.out_location===null||isAttendanceLocation(row.out_location))&&(row.shift_name===null||text(row.shift_name))&&nullableDate(row.scheduled_in)&&nullableDate(row.scheduled_out)&&(row.late_minutes===null||count(row.late_minutes)));
}
export const isAttendanceReceipt=(v:unknown):v is AttendanceReceipt=>object(v)&&typeof v.id==='number'&&id(v.id)&&(v.replayed===undefined||typeof v.replayed==='boolean');
export const isAttendanceResolution=(v:unknown):v is AttendanceResolution=>object(v)&&(v.result===null||object(v.result)&&typeof v.result.id==='number'&&id(v.result.id)&&['in','out'].includes(String(v.result.action))&&date(v.result.clock_in_at)&&nullableDate(v.result.clock_out_at));
export function isMobileGuideFaq(v:unknown):v is MobileGuideFaq {
  return object(v)&&text(v.user_name)&&typeof v.can_answer==='boolean'&&count(v.total)&&id(v.page)&&typeof v.hasMore==='boolean'&&Array.isArray(v.rows)&&v.rows.length<=20&&v.rows.every(row=>object(row)&&typeof row.id==='number'&&id(row.id)&&text(row.category)&&text(row.question)&&text(row.asker_name)&&text(row.answer)&&(row.answerer_name===null||text(row.answerer_name))&&typeof row.revision==='number'&&id(row.revision)&&date(row.created_at)&&Array.isArray(row.images)&&row.images.length<=10&&row.images.every(id));
}
