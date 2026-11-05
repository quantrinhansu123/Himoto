function renewalTime(value:string){return Date.parse(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)?`${value}:00+07:00`:value);}
/** Exact web rounding: every started hour/day is one renewal unit. */
export function renewalDurationUnits(before:string,after:string,unit:'day'|'hour'='day'):number|null{
  const minutes=Math.ceil((renewalTime(after)-renewalTime(before))/60_000);
  return Number.isFinite(minutes)&&minutes>0?Math.ceil(minutes/(unit==='day'?1440:60)):null;
}
export const DEFAULT_RENEWAL_HOURLY_RATE='20000';
export function renewalRateSuggestion(before:string|null,after:string,rate:string,unit:'day'|'hour'){
  if(!before||!/^\d{1,9}$/.test(rate)||Number(rate)<=0)return null;
  const units=renewalDurationUnits(before,after,unit),max=unit==='day'?365:720;
  return units&&units<=max?Number(rate)*units:null;
}
