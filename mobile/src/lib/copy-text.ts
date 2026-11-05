import {Platform} from 'react-native';
import {requireOptionalNativeModule} from 'expo';
export async function copyText(value:string){
  if(!value||value.length>2*1024*1024)throw Error('Nội dung sao chép trống hoặc quá dài.');
  if(Platform.OS!=='web'&&!requireOptionalNativeModule('ExpoClipboard'))throw Error('Cần cập nhật bản cài Himoto để dùng sao chép. Có thể chọn nội dung hoặc xuất tệp để dùng ngay.');
  const Clipboard=await import('expo-clipboard');
  if(!await Clipboard.setStringAsync(value,{android:{isSensitive:true}}))throw Error('Chưa chép được nội dung. Chọn văn bản hoặc xuất tệp rồi thử lại.');
}
