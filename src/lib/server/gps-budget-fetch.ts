import 'server-only';
import { withRequestDeadline } from '@/lib/request-deadline';
import { GpsProviderError } from './gps-providers';
/** The budget includes fetch and body; a stalled body must not hold the GPS lane. */
export function gpsBudgetFetch(send:typeof fetch,budgetMs:number,code:string,requestMs=20_000):typeof fetch {
  const deadline=Date.now()+budgetMs;
  return async(input,init)=>{
    const remaining=Math.min(requestMs,deadline-Date.now());
    if(remaining<100)throw new GpsProviderError(code);
    try{return await withRequestDeadline(async signal=>{
      const response=await send(input,{...init,signal:init?.signal?AbortSignal.any([signal,init.signal]):signal});
      if(!response.body)return response;
      const reader=response.body.getReader(),chunks:Uint8Array[]=[];let bytes=0;
      try{while(true){const next=await reader.read();if(next.done)break;bytes+=next.value.length;
        if(bytes>8*1024*1024){await reader.cancel();throw new GpsProviderError('RESPONSE_TOO_LARGE');}chunks.push(next.value);}}
      finally{reader.releaseLock();}
      return new Response(Buffer.concat(chunks),{status:response.status,statusText:response.statusText,headers:response.headers});
    },remaining,code);}catch(error){if(error instanceof Error&&error.message===code)throw new GpsProviderError(code);throw error;}
  };
}
