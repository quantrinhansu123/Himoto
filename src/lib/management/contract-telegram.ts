import type { ContractTelegramState } from '../../../shared/contract-telegram';
import { withRequestDeadline } from '@/lib/request-deadline';
export * from '../../../shared/contract-telegram';
export async function contractTelegramRequest(id:number,body?:Record<string,unknown>,signal?:AbortSignal):Promise<ContractTelegramState> {
  return withRequestDeadline(async requestSignal => {
  const response=await fetch(`/api/auth/order/car-rental/${id}/telegram`,{method:body?'POST':'GET',cache:'no-store',credentials:'same-origin',signal:requestSignal,
    ...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
  const result=await response.json().catch(()=>null);
  if(!response.ok||result?.status!=='success')throw Error(result?.message||'Không tải được Telegram của hợp đồng.');
  return result.data;
  },60000,body?'Máy chủ phản hồi chậm. Làm mới để kiểm tra kết quả trước khi gửi lại.':'Tải nội dung quá lâu. Bấm Làm mới nội dung và ảnh để thử lại.',signal);
}
