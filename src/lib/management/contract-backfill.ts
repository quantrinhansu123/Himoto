export interface ContractBackfill {note:string;returned_at?:string}
export function validBackfillTime(value:string,now=Date.now()) {
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))return false;
  const time=new Date(`${value}:00+07:00`).getTime();
  return Number.isFinite(time)&&new Date(time+7*3600000).toISOString().slice(0,16)===value&&time<=now+5*60000;
}
export function contractBackfillErrors(raw:unknown,start:string):Record<string,string> {
  if(raw===undefined)return {};
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(key=>!['note','returned_at'].includes(key))||typeof (raw as ContractBackfill).note!=='string'||(raw as ContractBackfill).note.length>1000||((raw as ContractBackfill).returned_at!==undefined&&typeof (raw as ContractBackfill).returned_at!=='string'))return {backfill:'Thông tin nhập bổ sung không hợp lệ.'};
  const value=raw as ContractBackfill;
  const errors:Record<string,string>={};
  if(!validBackfillTime(start))errors.start_date='Nhập bổ sung cần ngày bắt đầu thực tế, không ở tương lai.';
  if(value.returned_at!==undefined&&(!validBackfillTime(value.returned_at)||value.returned_at<start))errors.backfill_returned_at='Nhập ngày giờ trả xe thực tế, từ lúc bắt đầu thuê đến hiện tại.';
  return errors;
}
