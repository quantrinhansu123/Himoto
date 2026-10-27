/** The old app rounds elapsed minutes to hours, then charges another day at 8h.
 * A positive negotiated total suppresses late fees. Missing prices stay unknown.
 */
export function legacyOwnershipLateFee(minutes:number,dailyPrice:number|null,hourlyRate:number|null,fixedTotal=false) {
  if(fixedTotal||minutes<=30)return {days:0,hours:0,amount:0};
  const rounded=Math.round(minutes/60),remainder=rounded%24;
  const days=Math.floor(rounded/24)+(remainder>=8?1:0),hours=remainder>=8?0:remainder;
  const validDay=dailyPrice!==null&&Number.isSafeInteger(dailyPrice)&&dailyPrice>0;
  const validHour=hourlyRate!==null&&Number.isSafeInteger(hourlyRate)&&hourlyRate>=0;
  const amount=days&&!validDay||hours&&!validHour?null:days*(dailyPrice||0)+hours*(hourlyRate||0);
  return {days,hours,amount:amount!==null&&Number.isSafeInteger(amount)?amount:null};
}

// Preserve the legacy switch, including its zero hourly charge for electric/SH.
export function legacyOwnershipHourlyRate(type:unknown):number|null {
  switch(type){case 'xeso':case 'xega':return 15000;case 'xecon':return 25000;case 'sh':return 35000;case 'xe_dien':case 'xesh':return 0;default:return null;}
}
