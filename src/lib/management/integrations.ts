export async function integrationRequest<T>(path:string,options?:RequestInit):Promise<T> {
  const response=await fetch(path,{credentials:'same-origin',cache:'no-store',...options});
  const body=await response.json().catch(()=>null);
  if(!response.ok||body?.status!=='success')throw new Error(body?.message||'Không xử lý được yêu cầu tích hợp.');
  return body.data as T;
}
