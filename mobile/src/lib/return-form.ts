import type {MobileReturnPreparation,MobileReturnPreview,MobileReturnPreviewInput} from '../../../shared/mobile-returns';
import type {MobileReturnMoney,MobileReturnRefund,MobileReturnSettlementInput} from '../../../shared/mobile-return-settlement';

export type ReturnVehicle=MobileReturnPreparation['items']['rows'][number];
export interface ReturnLineDraft {vehicle:ReturnVehicle;returnedAt:string;hourlyRate:string;lateOverride:string;repairFee:string;repairNote:string;earlyDiscount:string}
export interface ReturnMoneyDraft {amount:string;method:MobileReturnMoney['method'];account:string;paidAt:string;bank:string;recipientAccount:string;recipientName:string}
export interface ReturnReceiptDraft extends ReturnMoneyDraft {kind:'late_fee'|'repair_fee'|'rental_debt'}
export const returnLocalTime=(now=Date.now())=>new Date(now+7*3600000).toISOString().slice(0,16);
export const emptyReturnMoney=(now=Date.now()):ReturnMoneyDraft=>({amount:'',method:'cash',account:'',paidAt:returnLocalTime(now),bank:'',recipientAccount:'',recipientName:''});
export const newReturnLine=(vehicle:ReturnVehicle,now=Date.now()):ReturnLineDraft=>({vehicle,returnedAt:returnLocalTime(now),hourlyRate:'20000',lateOverride:'',repairFee:'',repairNote:'',earlyDiscount:''});
const amount=(raw:string,label:string,positive=false)=>{
  if(!/^\d{1,13}$/.test(raw)||!Number.isSafeInteger(Number(raw))||Number(raw)>9999999999999||positive&&Number(raw)===0)
    throw Error(label+' phải là số nguyên VND '+(positive?'lớn hơn 0.':'không âm.'));
  return String(Number(raw));
};
function date(raw:string,label:string,now:number){
  const ms=Date.parse(raw+':00+07:00');
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)||!Number.isFinite(ms)||returnLocalTime(ms)!==raw||ms>now+5*60000)
    throw Error(label+' không hợp lệ hoặc nằm trong tương lai.');
  return ms;
}
export function returnFeeInput(preparation:MobileReturnPreparation,lines:ReturnLineDraft[],now=Date.now()):MobileReturnPreviewInput {
  if(!preparation.available)throw Error(preparation.blockedReason||'Hợp đồng chưa cho phép trả xe.');
  if(!lines.length||lines.length>50||new Set(lines.map(row=>row.vehicle.id)).size!==lines.length)throw Error('Chọn từ 1 đến 50 xe cần trả.');
  return{revision:preparation.revision,items:lines.map(row=>{
    const vehicle=row.vehicle,label=vehicle.license||vehicle.name||('Xe #'+vehicle.vehicleId);
    if(!vehicle.available||!vehicle.returnAt)throw Error(label+': '+(vehicle.blockedReason||'Xe chưa đủ thông tin để trả.'));
    const actual=date(row.returnedAt,label+' · giờ nhận thực tế',now),scheduled=Date.parse(vehicle.returnAt);
    if(vehicle.startsAt&&actual<Date.parse(vehicle.startsAt))throw Error(label+': giờ trả không được trước giờ nhận xe.');
    const rate=amount(row.hourlyRate,label+' · đơn giá trễ');
    if(Number(rate)>5000000)throw Error(label+': đơn giá trễ tối đa 5.000.000 VND/giờ.');
    const override=row.lateOverride.trim()?amount(row.lateOverride,label+' · phí trễ đã đối chiếu'):undefined;
    const discount=amount(row.earlyDiscount.trim()||'0',label+' · giảm trả sớm');
    const repair=amount(row.repairFee.trim()||'0',label+' · phí sửa chữa');
    if(override!==undefined&&actual<=scheduled)throw Error(label+': chỉ điều chỉnh phí trễ khi xe trả trễ.');
    if(Number(discount)>0&&(actual>=scheduled||preparation.ownership))throw Error(label+': chỉ giảm trả sớm cho thuê thường trước hạn trả.');
    if(row.repairNote.trim().length>1000)throw Error(label+': ghi chú sửa chữa tối đa 1.000 ký tự.');
    return{item_id:vehicle.id,item_revision:vehicle.revision,returned_at:row.returnedAt,hourly_rate:rate,
      ...(override===undefined?{}:{fee_override:override}),...(Number(discount)>0?{early_discount:discount}:{}),
      ...(Number(repair)>0||row.repairNote.trim()?{repair_fee:repair,repair_note:row.repairNote.trim()}:{})};
  })};
}
export function returnSettlementInput(preparation:MobileReturnPreparation,fees:MobileReturnPreview,lines:MobileReturnPreviewInput,
  receipts:ReturnReceiptDraft[],rentalRefund:ReturnMoneyDraft|null,depositRefund:ReturnMoneyDraft|null,acknowledged=false,now=Date.now(),
  deferredRecipient?:{bank:string;recipientAccount:string;recipientName:string}):MobileReturnSettlementInput {
  if(preparation.id!==fees.id||preparation.revision!==fees.revision||receipts.length>50)throw Error('Hợp đồng hoặc danh sách khoản thu đã thay đổi. Rà soát phí lại.');
  function parseRecipient(rec:{bank:string;recipientAccount:string;recipientName:string},label:string){
    if([rec.bank,rec.recipientAccount,rec.recipientName].some(text=>text.trim().length>150))throw Error(label+': thông tin người nhận tối đa 150 ký tự.');
    const acct=rec.recipientAccount.trim().replace(/[\s.]/g,'');
    if(acct&&!/^[A-Z0-9-]{3,34}$/i.test(acct))throw Error(label+': số tài khoản người nhận chưa hợp lệ.');
    const out:{bank?:string;account?:string;name?:string}={};
    if(rec.bank.trim())out.bank=rec.bank.trim();
    if(acct)out.account=acct;
    if(rec.recipientName.trim())out.name=rec.recipientName.trim();
    return Object.keys(out).length?out:undefined;
  }
  function parse(row:ReturnMoneyDraft,label:string,refund=false):MobileReturnRefund {
    const value=amount(row.amount,label,true);date(row.paidAt,label+' · thời gian',now);
    if(!/^[1-9]\d{0,14}$/.test(row.account)||!preparation.accounts.some(a=>a.method===row.method&&a.id===Number(row.account)))
      throw Error(label+': chọn tài khoản đúng phương thức thu/chi.');
    const result:MobileReturnRefund={amount:value,method:row.method,account_id:Number(row.account),paid_at:row.paidAt};
    if(refund&&row.method!=='cash'){
      const rec=parseRecipient(row,label);
      if(rec?.bank)result.recipient_bank=rec.bank;
      if(rec?.account)result.recipient_account=rec.account;
      if(rec?.name)result.recipient_name=rec.name;
    }
    return result;
  }
  const deferredRec=!depositRefund&&fees.after.depositHeld>0&&deferredRecipient?parseRecipient(deferredRecipient,'Người nhận hoàn cọc'):undefined;
  return{...lines,fee_snapshot:fees.snapshot,settlement:{receipts:receipts.map((row,i)=>({...parse(row,'Khoản thu '+(i+1)),kind:row.kind})),
    ...(rentalRefund?{rental_refund:parse(rentalRefund,'Hoàn tiền thuê',true)}:{}),
    ...(depositRefund?{refund:parse(depositRefund,'Hoàn cọc',true)}:fees.after.depositHeld>0?{refund_deferred:true,...(deferredRec?{refund_recipient:deferredRec}:{})}:{})},
    ...(acknowledged?{acknowledge_overpayment:true}:{})};
}
