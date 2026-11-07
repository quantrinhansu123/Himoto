import {Directory,File,Paths} from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import type {AttendanceLocation} from '../../../shared/mobile-support';
import {isAttendanceLocation} from '../../../shared/mobile-support';
import type {RecordMediaPhoto} from './record-media-photo';
export type AttendancePending={id:string;action:'in'|'out';location:AttendanceLocation;photo:RecordMediaPhoto};
const key=(actor:number)=>`himoto.attendance.pending.v1.${actor}`;
const folder=()=>new Directory(Paths.document,'attendance-pending');
export async function loadAttendancePending(actor:number,origin:string):Promise<AttendancePending|null> {
  const raw=await SecureStore.getItemAsync(key(actor));if(!raw)return null;
  const saved=JSON.parse(raw);
  if(saved.origin!==origin)throw Error('Có lần chấm công chờ ở máy chủ khác. Giữ dữ liệu và liên hệ hỗ trợ.');
  if(!/^[0-9a-f-]{36}$/.test(saved.id)||!['in','out'].includes(saved.action)||!isAttendanceLocation(saved.location))throw Error('Dữ liệu chấm công chờ cần đối chiếu.');
  const file=new File(folder(),saved.id+'.jpg');
  return{id:saved.id,action:saved.action,location:saved.location,photo:{uri:file.uri,width:saved.width,height:saved.height,size:file.exists?file.size:0,mimeType:'image/jpeg',bytes:()=>file.arrayBuffer(),dispose:()=>{}}};
}
export async function storeAttendancePending(actor:number,origin:string,pending:AttendancePending):Promise<AttendancePending> {
  if(await SecureStore.getItemAsync(key(actor)))throw Error('Còn lần chấm công chờ. Đối chiếu trước khi tạo lần mới.');
  const dir=folder();dir.create({idempotent:true,intermediates:true});
  const file=new File(dir,pending.id+'.jpg');new File(pending.photo.uri).copy(file);
  try{await SecureStore.setItemAsync(key(actor),JSON.stringify({origin,id:pending.id,action:pending.action,location:pending.location,width:pending.photo.width,height:pending.photo.height}),{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY});}
  catch(error){file.delete();throw error;}
  return (await loadAttendancePending(actor,origin))!;
}
export async function clearAttendancePending(actor:number,id:string) {
  const raw=await SecureStore.getItemAsync(key(actor));if(!raw)return;
  if(JSON.parse(raw).id!==id)throw Error('Lần chấm công đang đối chiếu đã thay đổi.');
  await SecureStore.deleteItemAsync(key(actor));
  const file=new File(folder(),id+'.jpg');if(file.exists)file.delete();
}
export async function refreshAttendancePendingLocation(actor:number,origin:string,id:string,location:AttendanceLocation) {
  const raw=await SecureStore.getItemAsync(key(actor));if(!raw)throw Error('Không tìm thấy lần chấm công chờ.');
  const saved=JSON.parse(raw);if(saved.id!==id||saved.origin!==origin||!isAttendanceLocation(location))throw Error('Lần chấm công đang đối chiếu đã thay đổi.');
  await SecureStore.setItemAsync(key(actor),JSON.stringify({...saved,location}),{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY});
  return (await loadAttendancePending(actor,origin))!;
}
