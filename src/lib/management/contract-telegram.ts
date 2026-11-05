import type { ContractTelegramState } from '../../../shared/contract-telegram';
export * from '../../../shared/contract-telegram';
export async function contractTelegramRequest(id:number,body?:Record<string,unknown>,signal?:AbortSignal):Promise<ContractTelegramState> {
  const response=await fetch(`/api/auth/order/car-rental/${id}/telegram`,{method:body?'POST':'GET',cache:'no-store',credentials:'same-origin',signal,
    ...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
  const result=await response.json().catch(()=>null);
  if(!response.ok||result?.status!=='success')throw Error(result?.message||'Không tải được Telegram của hợp đồng.');
  return result.data;
}
