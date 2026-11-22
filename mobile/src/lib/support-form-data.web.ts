import type {RecordMediaPhoto} from './record-media-photo';
export async function supportFormData(fields:Record<string,string>,photo?:RecordMediaPhoto,images:RecordMediaPhoto[]=[],photoField='photo'):Promise<FormData> {
  const body=new FormData();
  for(const [key,value] of Object.entries(fields))body.append(key,value);
  if(photo)body.append(photoField,new Blob([new Uint8Array(await photo.bytes())],{type:'image/jpeg'}),photoField==='photo'?'attendance.jpg':'evidence.jpg');
  for(let i=0;i<images.length;i++)body.append('images',new Blob([new Uint8Array(await images[i].bytes())],{type:'image/jpeg'}),`image-${i+1}.jpg`);
  return body;
}
