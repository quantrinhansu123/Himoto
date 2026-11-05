import type {RecordMediaPhoto} from './record-media-photo';
export async function customerDocumentBody(photos:RecordMediaPhoto[]):Promise<FormData> {
  const body=new FormData();
  for(let index=0;index<photos.length;index++)body.append('photos',new Blob([new Uint8Array(await photos[index].bytes())],{type:'image/jpeg'}),`document-${index+1}.jpg`);
  return body;
}
