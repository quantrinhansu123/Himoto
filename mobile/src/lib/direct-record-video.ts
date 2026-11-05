import {fetch} from 'expo/fetch';
import {isMobileVideoDirectResult,validMobileDirectVideoBytes,type MobileVideoDirectTicket} from '../../../shared/mobile-video-upload';
import type {RecordVideo} from './record-video';

export async function isDirectVideoCandidate(video:RecordVideo) {
  if(['video/quicktime','video/webm'].includes(video.mimeType||video.blob.type))return false;
  if(/\.(mp4|m4v)$/i.test(video.name)||video.blob.type==='video/mp4')return true;
  const header=new Uint8Array(await video.blob.slice(0,32).arrayBuffer()),text=(a:number,b:number)=>String.fromCharCode(...header.subarray(a,b));
  // A capability probe only; full codec/audio/duration/size inspection stays on
  // the same backend parser as web. Unknown/MOV/WebM use the conversion path.
  return header.length>=16&&text(4,8)==='ftyp'&&text(8,12)!=='qt  ';
}
export async function putDirectRecordVideo(video:RecordVideo,signed:MobileVideoDirectTicket,actor:number,key:string,sha256:string,signal:AbortSignal) {
  if(!isMobileVideoDirectResult(signed,actor,key,sha256)||!validMobileDirectVideoBytes(video.size)||video.blob.size!==video.size)throw Error('Nơi tải hoặc video đã thay đổi. Giữ mã để đối chiếu.');
  // The validated, short-lived URL and four signed headers are the entire
  // external request. Never add the API client's Himoto bearer or cookies.
  const response=await fetch(signed.url,{method:'PUT',body:video.blob,headers:signed.headers,credentials:'omit',redirect:'error',signal});
  await response.body?.cancel().catch(()=>{});
  if(!response.ok&&response.status!==412)throw Error('Chưa tải đủ video. Giữ mã để đối chiếu; tệp gốc vẫn được giữ.');
}
