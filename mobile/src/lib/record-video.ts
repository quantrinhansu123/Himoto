import * as ImagePicker from 'expo-image-picker';
import { File, Paths } from 'expo-file-system';
import { uuid } from 'expo';
import { fetch } from 'expo/fetch';
import { Platform } from 'react-native';
import { MOBILE_MAX_VIDEO_BYTES, MOBILE_CONTRACT_VIDEO_SECONDS, isMobileVideoSignature, isMobileVideoCloudReceipt, type MobileVideoUploadSignature, type MobileVideoCloudReceipt } from '../../../shared/mobile-video';

export interface RecordVideo { uri:string; name:string; mimeType?:string; size:number; duration:number|null; blob:Blob; sha256:()=>Promise<string>; dispose:()=>void }
export async function selectRecordVideo(camera:boolean, signal:AbortSignal,maxDuration:number=MOBILE_CONTRACT_VIDEO_SECONDS):Promise<RecordVideo|null> {
  if(![60,180].includes(maxDuration))throw Error('Giới hạn thời lượng chưa hợp lệ.');
  if(camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) throw Error('Chưa được cấp quyền camera. Chọn video đã có hoặc cấp quyền Camera trong Cài đặt.');
  if(signal.aborted)return null;
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['videos'],
    allowsEditing: false,
    allowsMultipleSelection: false,
    videoMaxDuration: maxDuration,
    videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
    videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
    quality: 0.8,
    base64: false,
    exif: false,
  };
  const result=await(camera?ImagePicker.launchCameraAsync(options):ImagePicker.launchImageLibraryAsync(options));
  if(result.canceled||signal.aborted)return null;
  const asset=result.assets[0];
  if(!asset?.uri||asset.type!=='video')throw Error('Cần chọn một video.');
  const duration=typeof asset.duration==='number'&&Number.isFinite(asset.duration)&&asset.duration>0?asset.duration/1000:null;
  if(duration!==null&&duration>maxDuration)throw Error(maxDuration===60?'Video hợp đồng tối đa 60 giây. Chọn video ngắn hơn.':'Video ca tối đa 3 phút. Chọn video ngắn hơn.');
  const ext=(asset.fileName||asset.uri).split('.').pop()?.toLowerCase().split('?')[0];
  if(ext&&!['mp4','mov','m4v','webm'].includes(ext)&&!asset.mimeType?.startsWith('video/'))throw Error('Chọn video MP4, MOV, M4V hoặc WebM.');
  if(Platform.OS==='web') {
    if(!asset.file||asset.file.size<=0||asset.file.size>MOBILE_MAX_VIDEO_BYTES)throw Error('Video cần có dung lượng từ 1 byte đến 45 MB.');
    const file=asset.file,uri=URL.createObjectURL(file);return{uri,name:file.name||'himoto-video.mp4',mimeType:asset.mimeType||file.type,size:file.size,duration,blob:file,sha256:async()=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join(''),dispose:()=>URL.revokeObjectURL(uri)};
  }
  const source=new File(asset.uri);
  if(!source.exists||source.size<=0||source.size>MOBILE_MAX_VIDEO_BYTES)throw Error('Video cần có dung lượng từ 1 byte đến 45 MB.');
  const owned=new File(Paths.cache,`himoto-video-${uuid.v4()}.${['mp4','mov','m4v','webm'].includes(ext||'')?ext:'mp4'}`);
  try {
    await source.copy(owned);
    if(signal.aborted||!owned.exists||owned.size!==source.size)throw Error('Chưa chuẩn bị được video đầy đủ. Chọn lại tệp.');
    return{uri:owned.uri,name:owned.name,mimeType:asset.mimeType,size:owned.size,duration,blob:owned,sha256:()=>owned.digest('SHA-256'),dispose:()=>{try{if(owned.exists)owned.delete();}catch{}}};
  } catch(error) { try{if(owned.exists)owned.delete();}catch{} throw error; }
}
/** Only the short-lived signed upload capability goes to Cloudinary. Himoto's
 * bearer is confined to the API client; it is never passed to this function. */
export async function uploadSignedRecordVideo(video:RecordVideo, signed:MobileVideoUploadSignature, actorId:number, key:string, signal:AbortSignal):Promise<MobileVideoCloudReceipt> {
  if(!isMobileVideoSignature(signed)||signed.params.public_id!==`himoto/management-video/${actorId}/${key}`||video.blob.size!==video.size||video.size<=0||video.size>MOBILE_MAX_VIDEO_BYTES)throw Error('Video hoặc chữ ký tải lên đã thay đổi. Giữ mã để đối chiếu.');
  const form=new FormData();form.append('file',video.blob,video.name);form.append('api_key',signed.api_key);form.append('signature',signed.signature);
  for(const [name,value] of Object.entries(signed.params))form.append(name,String(value));
  const response=await fetch(`https://api.cloudinary.com/v1_1/${signed.cloud_name}/video/upload`,{method:'POST',body:form,redirect:'error',credentials:'omit',signal});
  if(!response.ok)throw Error('Chưa tải được video. Giữ mã để đối chiếu; video gốc vẫn được giữ.');
  const text=await response.text();if(text.length>65536)throw Error('Kết quả tải video chưa hợp lệ. Giữ mã để đối chiếu.');
  let value:unknown;try{value=JSON.parse(text);}catch{throw Error('Chưa đọc được kết quả tải video. Giữ mã để đối chiếu.');}
  if(!isMobileVideoCloudReceipt(value)||value.public_id!==signed.params.public_id)throw Error('Kết quả tải video không khớp. Giữ mã để đối chiếu.');
  return{public_id:value.public_id,version:value.version,signature:value.signature,resource_type:'video'};
}
