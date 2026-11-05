import { validBackfillTime } from './contract-backfill';
export const BACKFILL_ACTIONS=[
  {key:'contract',label:'Hợp đồng bị quên chưa nhập',permission:'contracts.draft'},
  {key:'renewal',label:'Lượt gia hạn bị quên chưa nhập',permission:'contracts.renew'},
  {key:'payment',label:'Khoản thu/chi của hợp đồng đã có',permission:'finance.write'},
] as const;
export function backfillActions(permissions:readonly string[]){return BACKFILL_ACTIONS.filter(a=>permissions.includes(a.permission));}
export function validateBackfillPayment(paidAt:string,confirmed:boolean,now=Date.now()){
  if(!confirmed||!validBackfillTime(paidAt,now))throw Error('Nhập ngày giờ giao dịch thực tế và xác nhận khoản tiền đã phát sinh.');
}
