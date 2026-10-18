export const DEFAULT_LATE_HOURLY_RATE=20_000;
/** Each full 24h is a day; a remainder strictly over 8h becomes another day. */
export function lateReturnFee(minutes:number,hourlyRate:number,dailyPrice:number|null) {
  const wholeDays=Math.floor(Math.max(minutes,0)/1440),remainder=Math.max(minutes,0)%1440;
  const days=wholeDays+(remainder>480?1:0),hours=remainder>480?0:Math.ceil(remainder/60);
  const hasDayPrice=dailyPrice!==null&&Number.isSafeInteger(dailyPrice)&&dailyPrice>0;
  return {days,hours,amount:days&&!hasDayPrice?null:days*(dailyPrice||0)+hours*hourlyRate};
}
