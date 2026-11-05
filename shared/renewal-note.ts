/** Same audit text for the web renewal dialog and native composer. */
export function buildRenewalNote(note:string,extraAmount:number,extraName:string,outsideAmount:number,outsideName:string){
  const money=(value:number)=>Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g,'.')+' đ';
  const extra=extraAmount>0?`${extraName.trim()} ${money(extraAmount)}`:'',outside=outsideAmount>0?`${outsideName.trim()} ${money(outsideAmount)} (thu ngoài, không cộng tiền hợp đồng)`:'';
  return[note.trim(),extra?`Phí khác: ${extra}`:'',outside?`Phí thu thêm: ${outside}`:''].filter(Boolean).join('\n');
}
