import * as ImagePicker from 'expo-image-picker';
import type {RecordMediaPhoto} from './record-media-photo';
export type {RecordMediaPhoto} from './record-media-photo';
export async function selectRecordMediaPhoto(_camera:boolean,signal:AbortSignal):Promise<RecordMediaPhoto|null> {
  const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],allowsMultipleSelection:false,base64:false});
  if(result.canceled||signal.aborted)return null;
  return prepareRecordMediaAsset(result.assets[0],signal);
}
export async function prepareRecordMediaAsset(asset:ImagePicker.ImagePickerAsset,signal:AbortSignal):Promise<RecordMediaPhoto> {
  if(!asset?.uri.startsWith('blob:'))throw Error('Chọn một ảnh từ thiết bị.');
  let bitmap:ImageBitmap|undefined;
  try{
    const blob=asset.file??await(await fetch(asset.uri)).blob();
    if(!blob.type.startsWith('image/')||blob.size>30*1024*1024)throw Error('Ảnh gốc cần nhỏ hơn 30 MB.');
    if(![asset.width,asset.height].every(n=>Number.isFinite(n)&&n>0))throw Error('Không đọc được kích thước ảnh. Chọn ảnh khác.');
    const initialScale=Math.min(1,2200/Math.max(asset.width,asset.height));
    bitmap=await createImageBitmap(blob,{resizeWidth:Math.max(1,Math.round(asset.width*initialScale)),resizeHeight:Math.max(1,Math.round(asset.height*initialScale))});
    if(signal.aborted)throw Error('Đã hủy chuẩn bị ảnh.');
    const scale=Math.min(1,2200/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    const context=canvas.getContext('2d');if(!context)throw Error('Không chuẩn bị được ảnh.');
    context.drawImage(bitmap,0,0,canvas.width,canvas.height);
    for(const quality of [.85,.7,.55]){
      const jpeg=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
      if(signal.aborted)throw Error('Đã hủy chuẩn bị ảnh.');
      if(jpeg&&jpeg.size>0&&jpeg.size<=2*1024*1024){
        const uri=URL.createObjectURL(jpeg);
        return{uri,width:canvas.width,height:canvas.height,size:jpeg.size,mimeType:'image/jpeg',bytes:()=>jpeg.arrayBuffer(),dispose:()=>URL.revokeObjectURL(uri)};
      }
    }
    throw Error('Ảnh vẫn vượt giới hạn 2 MB. Chọn ảnh khác.');
  }finally{bitmap?.close();URL.revokeObjectURL(asset.uri);}
}
