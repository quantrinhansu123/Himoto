import type { ContractTelegramState } from '../../../shared/contract-telegram';
import { abortAny, abortTimeout } from '@/lib/abort-signal';
export * from '../../../shared/contract-telegram';
export async function contractTelegramRequest(id:number,body?:Record<string,unknown>,signal?:AbortSignal):Promise<ContractTelegramState> {
  const timeout=abortTimeout(60000);
  const requestSignal=signal?abortAny([signal,timeout]):timeout;
  try {
  const response=await fetch(`/api/auth/order/car-rental/${id}/telegram`,{method:body?'POST':'GET',cache:'no-store',credentials:'same-origin',signal:requestSignal,
    ...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
  const result=await response.json().catch(()=>null);
  if(!response.ok||result?.status!=='success')throw Error(result?.message||'Không tải được Telegram của hợp đồng.');
  return result.data;
  } catch(error) {
    if(timeout.aborted&&!signal?.aborted)throw Error(body?'Máy chủ phản hồi chậm. Làm mới để kiểm tra kết quả trước khi gửi lại.':'Tải nội dung quá lâu. Bấm Làm mới nội dung và ảnh để thử lại.');
    throw error;
  }
}
