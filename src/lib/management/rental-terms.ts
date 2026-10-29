export interface RentalTermsItem {id:number;revision:string;vehicle_id:number;license:string;start_at:string;end_at:string;unit_price:number|null;completed_at:string|null}
export interface RentalTermsState {revision:string;code:string;total_amount:number;paid_amount:number|null;items:RentalTermsItem[]}
export interface RentalTermsInput {request_id:string;revision:string;item_id:number;item_revision:string;start_at:string;end_at:string;unit_price:string;total_amount:string;reason:string}
export async function rentalTermsRequest(id:number,input?:RentalTermsInput,signal?:AbortSignal):Promise<RentalTermsState> {
  const response=await fetch(`/api/auth/order/car-rental/${id}/rental-terms`,{method:input?'PATCH':'GET',credentials:'same-origin',cache:'no-store',signal,...(input?{headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}:{})});
  const result=await response.json().catch(()=>null);
  if(!response.ok||result?.status!=='success')throw Error(result?.message||'Không tải hoặc lưu được tiền / ngày thuê.');
  return result.data;
}
