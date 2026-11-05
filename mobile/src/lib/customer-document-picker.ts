import * as ImagePicker from 'expo-image-picker';
import {prepareRecordMediaAsset,type RecordMediaPhoto} from './record-media-photo';

export async function selectCustomerDocumentBatch(signal:AbortSignal,onPhoto:(photo:RecordMediaPhoto,index:number)=>void) {
  const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],allowsMultipleSelection:true,
    selectionLimit:0,allowsEditing:false,quality:1,exif:false,base64:false});
  if(result.canceled||signal.aborted)return;
  const errors:string[]=[];
  for(let index=0;index<result.assets.length;index++){
    if(signal.aborted)break;
    try{
      const photo=await prepareRecordMediaAsset(result.assets[index],signal);
      if(signal.aborted){photo.dispose();break;}
      onPhoto(photo,index);
    }catch(error){if(!signal.aborted)errors.push(`Ảnh ${index+1}: ${(error as Error).message}`);}
  }
  if(errors.length)throw Error(errors.join('\n'));
}
