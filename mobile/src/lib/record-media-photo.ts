import * as ImagePicker from 'expo-image-picker';
import {File} from 'expo-file-system';
import {preparePhoto,type PreparedPhoto} from './prepare-photo';
export type RecordMediaPhoto=PreparedPhoto&{bytes:()=>Promise<ArrayBuffer>};
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
