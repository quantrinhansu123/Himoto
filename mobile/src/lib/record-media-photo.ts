import * as ImagePicker from 'expo-image-picker';
import {File} from 'expo-file-system';
import {preparePhoto,type PreparedPhoto} from './prepare-photo';
export type RecordMediaPhoto=PreparedPhoto&{bytes:()=>Promise<ArrayBuffer>};
/** Prepare one asset at a time: a large album never holds all decoded images in RAM. */
export async function selectRecordMediaPhotos(camera:boolean,signal:AbortSignal,onPhoto:(photo:RecordMediaPhoto,index:number,total:number)=>Promise<void>|void):Promise<void> {
  if(camera){const permission=await ImagePicker.requestCameraPermissionsAsync();if(!permission.granted)throw Error('Chưa được cấp quyền camera. Chọn ảnh đã có hoặc mở Cài đặt để cấp quyền Camera cho Himoto.');}
  if(signal.aborted)return;
  const options:ImagePicker.ImagePickerOptions={mediaTypes:['images'],allowsEditing:false,allowsMultipleSelection:!camera,selectionLimit:100,orderedSelection:true,quality:1,exif:false,base64:false};
  const result=await(camera?ImagePicker.launchCameraAsync(options):ImagePicker.launchImageLibraryAsync(options));
  if(result.canceled||signal.aborted)return;
  const failures:string[]=[];
  for(let index=0;index<result.assets.length;index++){
    if(signal.aborted)return;
    let photo:RecordMediaPhoto;
    try{photo=await prepareRecordMediaAsset(result.assets[index],signal);}
    catch(error){if(signal.aborted)return;failures.push(`Ảnh ${index+1}: ${(error as Error).message}`);continue;}
    if(signal.aborted){photo.dispose();return;}
    await onPhoto(photo,index,result.assets.length);
  }
  if(failures.length)throw Error(`Đã giữ các ảnh chuẩn bị thành công. ${failures.join('\n')}`);
}
export async function selectRecordMediaPhoto(camera:boolean,signal:AbortSignal):Promise<RecordMediaPhoto|null> {
  if(camera){const permission=await ImagePicker.requestCameraPermissionsAsync();if(!permission.granted)throw Error('Chưa được cấp quyền camera. Chọn ảnh đã có hoặc mở Cài đặt để cấp quyền Camera cho Himoto.');}
  if(signal.aborted)throw Error('Đã hủy chọn ảnh.');
  const options:ImagePicker.ImagePickerOptions={mediaTypes:['images'],allowsEditing:false,allowsMultipleSelection:false,quality:1,exif:false,base64:false};
  const result=await(camera?ImagePicker.launchCameraAsync(options):ImagePicker.launchImageLibraryAsync(options));
  if(result.canceled||signal.aborted)return null;
  return prepareRecordMediaAsset(result.assets[0],signal);
}
export async function prepareRecordMediaAsset(asset:ImagePicker.ImagePickerAsset,signal:AbortSignal):Promise<RecordMediaPhoto> {
  if(!asset?.uri)throw Error('Chưa chọn được ảnh.');
  const photo=await preparePhoto(asset.uri,signal);
  return{...photo,bytes:()=>new File(photo.uri).arrayBuffer()};
}
