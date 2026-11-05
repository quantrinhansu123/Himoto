import type {RecordMediaPhoto} from './record-media-photo';
export async function customerDocumentBody(photos:RecordMediaPhoto[]):Promise<FormData> {
  const body=new FormData();
  photos.forEach((photo,index)=>body.append('photos',{uri:photo.uri,name:`document-${index+1}.jpg`,type:'image/jpeg'} as unknown as Blob));
  return body;
}
