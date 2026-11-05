import { MOBILE_MAX_VIDEO_BYTES } from './mobile-video';

export interface MobileVideoBrowserReceipt { provider:'cloudfly-browser'; resource_type:'video'; upload_id:string; signature:string }
export interface MobileVideoDirectTicket { url:string; headers:Record<string,string>; ticket:string }
export type MobileVideoDirectResult={receipt:MobileVideoBrowserReceipt}|MobileVideoDirectTicket;
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
export function isMobileVideoBrowserReceipt(v:unknown):v is MobileVideoBrowserReceipt {
  return object(v)&&Object.keys(v).length===4&&v.provider==='cloudfly-browser'&&v.resource_type==='video'&&uuid(v.upload_id)&&typeof v.signature==='string'&&/^[a-f0-9]{64}$/.test(v.signature);
}
export function isMobileVideoUploadConfig(v:unknown):v is {direct:boolean} { return object(v)&&Object.keys(v).length===1&&typeof v.direct==='boolean'; }
export function isMobileVideoDirectResult(v:unknown,actor:number,key:string,sha256:string):v is MobileVideoDirectResult {
  if(!object(v)||!Number.isSafeInteger(actor)||actor<1||!uuid(key)||!/^[a-f0-9]{64}$/.test(sha256))return false;
  if('receipt' in v)return Object.keys(v).length===1&&isMobileVideoBrowserReceipt(v.receipt)&&v.receipt.upload_id===key;
  if(Object.keys(v).length!==3||typeof v.url!=='string'||v.url.length>8000||typeof v.ticket!=='string'||v.ticket.length>1500||!/^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/.test(v.ticket)||!object(v.headers))return false;
  const h=v.headers;
  if(Object.keys(h).length!==4||h['Content-Type']!=='video/mp4'||h['If-None-Match']!=='*'||h['x-amz-acl']!=='private'||h['x-amz-meta-sha256']!==sha256)return false;
  try{
    const url=new URL(v.url),bucket='[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]';
    return url.origin==='https://s3.cloudfly.vn'&&!url.username&&!url.password&&!url.hash&&new RegExp(`^/${bucket}/himoto/videos/browser/${actor}/${key}/v1[.]mp4$`).test(url.pathname)&&
      url.searchParams.get('X-Amz-Algorithm')==='AWS4-HMAC-SHA256'&&/^[a-f0-9]{64}$/.test(url.searchParams.get('X-Amz-Signature')||'')&&
      /^[1-9]\d{0,2}$/.test(url.searchParams.get('X-Amz-Expires')||'')&&Number(url.searchParams.get('X-Amz-Expires'))<=900&&
      [...url.searchParams.keys()].every(k=>url.searchParams.getAll(k).length===1);
  }catch{return false;}
}
export function validMobileDirectVideoBytes(v:unknown):v is number {return typeof v==='number'&&Number.isSafeInteger(v)&&v>0&&v<=MOBILE_MAX_VIDEO_BYTES;}
