import type {RecordMediaPhoto} from './record-media-photo';
export async function supportFormData(fields:Record<string,string>,photo?:RecordMediaPhoto,images:RecordMediaPhoto[]=[],photoField='photo'):Promise<FormData> {
  const body=new FormData();
  for(const [key,value] of Object.entries(fields))body.append(key,value);
  if(photo)body.append(photoField,{uri:photo.uri,name:photoField==='photo'?'attendance.jpg':'evidence.jpg',type:'image/jpeg'} as unknown as Blob);
  images.forEach((image,index)=>body.append('images',{uri:image.uri,name:`image-${index+1}.jpg`,type:'image/jpeg'} as unknown as Blob));
  return body;
}
