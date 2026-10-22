import { prepareRecordPhoto,uploadRecordPhoto,type CloudUploadReceipt } from './record-photos';
import type { ShiftMedia } from './shift-audits';
export class UnconfirmedSaveError extends Error {}
export async function shiftApi<T>(url:string,options?:RequestInit):Promise<T>{
  let response:Response;
  try{response=await fetch(url,{...options,cache:'no-store',credentials:'same-origin'});}catch{throw new UnconfirmedSaveError('Mất kết nối, chưa xác nhận được kết quả lưu.');}
  const result=await response.json().catch(()=>null);
  if(response.status>=500||response.ok&&!result?.data)throw new UnconfirmedSaveError('Chưa xác nhận được kết quả lưu.');
  if(!response.ok||!result?.data)throw Error(result?.message||'Không xử lý được báo cáo.');
  return result.data;
}
export type PendingShiftFile={category:string;file:File};
export type ShiftUpload={slot:string;file:File;key:string;prepared?:File;cloud?:CloudUploadReceipt;saved:boolean};
export async function uploadShiftEvidence(id:number,revision:number,stage:'pgd'|'audit',item:ShiftUpload):Promise<{revision:number;media:ShiftMedia}>{
  const video=item.file.type.startsWith('video/');
  if(video){
    if(!item.file.size||item.file.size>45*1024*1024)throw Error('Video kiểm kê tối đa 45 MB.');
    if(!item.cloud){try{item.cloud=await uploadRecordPhoto(item.file);}catch{item.cloud=await uploadRecordPhoto(item.file,true);}}
  }else item.prepared??=await prepareRecordPhoto(item.file);
  const url=`/api/auth/shift-reports/${id}/media/${item.key}`;
  const data=await shiftApi<{revision:number}>(url,{method:'PUT',headers:{'Content-Type':video?'application/json':item.prepared!.type,
    'x-shift-request-id':item.key,'x-report-revision':String(revision),'x-shift-category':item.slot,'x-shift-stage':stage,'x-file-name':encodeURIComponent(item.file.name)},
    body:video?JSON.stringify(item.cloud):item.prepared});
  return {...data,media:{id:item.key,category:item.slot,stage,mime_type:video?'video/mp4':item.prepared!.type,url,filename:item.file.name}};
}
