import type {PaymentAccount,PaymentMethod} from './contract-payments';
export interface ReceiptSplit {amount:string;method:PaymentMethod;account_id:number}
export interface EditableReceipt {id:number;revision:string;deposit:boolean;paid_at:string;parts:ReceiptSplit[]}
export interface ReceiptCorrectionState {revision:string;code:string;deposit_amount:string;receipts:EditableReceipt[];accounts:PaymentAccount[]}
export interface ReceiptCorrectionInput {request_id:string;revision:string;deposit_amount:string;reason:string;receipts:EditableReceipt[]}
export async function receiptCorrectionsRequest(id:number,input?:ReceiptCorrectionInput):Promise<ReceiptCorrectionState> {
 const response=await fetch(`/api/auth/order/car-rental/${id}/receipt-corrections`,{method:input?'PATCH':'GET',cache:'no-store',credentials:'same-origin',...(input?{headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}:{})});
 const body=await response.json();if(!response.ok||body.status!=='success')throw Error(body.message||'Chưa lưu được sửa tiền cọc / khoản thu.');return body.data;
}
