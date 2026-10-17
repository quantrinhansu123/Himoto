import { bankBin } from './transfer-qr';
import type { PaymentAccount } from './contract-payments';
export interface BranchQrAccount {id:number;bank_code:string;account_number:string;account_name:string;owner_type:string}
export function branchQrAccounts(accounts:PaymentAccount[],storeId:number):BranchQrAccount[]{
  return accounts.filter(account=>account.kind==='bank'&&account.store_id===storeId&&bankBin(account.bank_name||'')&&/^[A-Za-z0-9]{1,32}$/.test((account.account_number||'').replace(/\s/g,''))&&account.owner_name?.trim())
    .map(account=>({id:account.id,bank_code:account.bank_name!,account_number:account.account_number!.replace(/\s/g,''),account_name:account.owner_name!.trim(),owner_type:account.owner_type}));
}
export function defaultBranchQrAccount(accounts:BranchQrAccount[]){
  const ordinary=accounts.filter(account=>account.owner_type!=='company');
  return ordinary.length===1?ordinary[0]:accounts.length===1?accounts[0]:null;
}
export interface ContractQrData {
  id:number;code:string;configured:boolean;mode:'test'|'live';amount:number;total:number|null;paid:number|null;
  bank:{bank_code:string;account_number:string;account_name:string}|null;
  memo:string;qr_url:string|null;received_demo:number;event_version:number;
  accounts?:BranchQrAccount[];bank_id?:number|null;configuration_message?:string;
}
export const plainBankText=(text:string)=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D');
export const contractTransferMemo=(code:string)=>`Thanh toán cho hợp đồng ${code}`;
export function contractVietQr(bank:{bank_code:string;account_number:string;account_name:string},amount:number,code:string){
  const bin=bankBin(bank.bank_code);
  if(!bin||!/^[A-Za-z0-9]{1,32}$/.test(bank.account_number)||!bank.account_name.trim()||!Number.isSafeInteger(amount)||amount<0)throw Error('Thông tin tạo QR chưa hợp lệ.');
  const memo=plainBankText(contractTransferMemo(code));if(memo.length>200)throw Error('Mã hợp đồng quá dài để tạo QR.');
  const params=new URLSearchParams({acc:bank.account_number,bank:bin,template:'qronly',holder:plainBankText(bank.account_name),des:memo});
  if(amount>0)params.set('amount',String(amount));
  return 'https://vietqr.app/img?'+params.toString();
}
export async function loadContractQr(id:number,amount?:number,signal?:AbortSignal,accountId?:number):Promise<ContractQrData>{
  const params=new URLSearchParams();if(amount!==undefined)params.set('amount',String(amount));if(accountId!==undefined)params.set('account_id',String(accountId));
  const response=await fetch(`/api/auth/order/car-rental/${id}/payment-qr${params.size?'?'+params:''}`,{cache:'no-store',credentials:'same-origin',signal});
  const body=await response.json().catch(()=>null);if(!response.ok||body?.status!=='success')throw Error(body?.message||'Không tải được thông tin chuyển khoản.');return body.data;
}
