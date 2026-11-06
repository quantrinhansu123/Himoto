import type { ContractTelegramState } from '../../../shared/contract-telegram';
export * from '../../../shared/contract-telegram';
export async function contractTelegramRequest(id:number,body?:Record<string,unknown>,signal?:AbortSignal):Promise<ContractTelegramState> {
  // Use only AbortController: older iPhone browsers lack the static signal APIs.
  const controller=new AbortController();
  let timedOut=false;
  const cancel=()=>controller.abort();
  if(signal?.aborted)cancel();
  else signal?.addEventListener('abort',cancel,{once:true});
  const timer=setTimeout(()=>{timedOut=true;controller.abort();},60000);
  try {
  const response=await fetch(`/api/auth/order/car-rental/${id}/telegram`,{method:body?'POST':'GET',cache:'no-store',credentials:'same-origin',signal:controller.signal,
    ...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
  const result=await response.json().catch(()=>null);
  if(!response.ok||result?.status!=='success')throw Error(result?.message||'Không tải được Telegram của hợp đồng.');
  return result.data;
  } catch(error) {
    if(timedOut&&!signal?.aborted)throw Error(body?'Máy chủ phản hồi chậm. Làm mới để kiểm tra kết quả trước khi gửi lại.':'Tải nội dung quá lâu. Bấm Làm mới nội dung và ảnh để thử lại.');
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort',cancel);
  }
}
