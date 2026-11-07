import type {RecordMediaPhoto} from './record-media-photo';
export async function supportFormData(fields:Record<string,string>,photo?:RecordMediaPhoto,images:RecordMediaPhoto[]=[]):Promise<FormData> {
  const body=new FormData();
  for(const [key,value] of Object.entries(fields))body.append(key,value);
  if(photo)body.append('photo',{uri:photo.uri,name:'attendance.jpg',type:'image/jpeg'} as unknown as Blob);
  images.forEach((image,index)=>body.append('images',{uri:image.uri,name:`image-${index+1}.jpg`,type:'image/jpeg'} as unknown as Blob));
  return body;
}
