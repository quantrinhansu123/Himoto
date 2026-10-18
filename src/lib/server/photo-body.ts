import type { NextRequest } from 'next/server';
import { MAX_PHOTO_BYTES } from '@/lib/management/record-photos';
import { RecordPhotoError, validatePhotoBytes } from './record-photos';

export async function readPhotoBody(request: NextRequest) {
  if (Number(request.headers.get('content-length')) > MAX_PHOTO_BYTES) throw new RecordPhotoError('Mỗi ảnh tối đa 2 MB.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new RecordPhotoError('Thiếu ảnh.');
  const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) {
    const chunk = await reader.read(); if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > MAX_PHOTO_BYTES) { await reader.cancel(); throw new RecordPhotoError('Mỗi ảnh tối đa 2 MB.', 413); }
    chunks.push(chunk.value);
  } } finally { reader.releaseLock(); }
  const data = Buffer.concat(chunks), mimeType = request.headers.get('content-type') || '';
  validatePhotoBytes(mimeType, data);
  return { data, mimeType };
}
export async function readPhotoBatchBody(request:NextRequest) {
  const max=3*1024*1024+16384;
  if(Number(request.headers.get('content-length'))>max)throw new RecordPhotoError('Tổng ảnh AI tối đa 3 MB. Chọn ít ảnh hơn.',413);
  const reader=request.body?.getReader();if(!reader)throw new RecordPhotoError('Thiếu ảnh.');
  const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>max){await reader.cancel();throw new RecordPhotoError('Tổng ảnh AI tối đa 3 MB. Chọn ít ảnh hơn.',413);}chunks.push(chunk.value);}}finally{reader.releaseLock();}
  const data=await new Request('http://localhost',{method:'POST',headers:{'Content-Type':request.headers.get('content-type')||''},body:new Uint8Array(Buffer.concat(chunks))}).formData();
  const files=data.getAll('photos');
  if([...data.keys()].some(key=>key!=='photos')||files.length<1||files.length>3||files.some(file=>!(file instanceof File)))throw new RecordPhotoError('Chọn từ 1 đến 3 ảnh giấy tờ của cùng một khách.');
  return Promise.all((files as File[]).map(async file=>{const bytes=Buffer.from(await file.arrayBuffer());validatePhotoBytes(file.type,bytes);return {mimeType:file.type,data:bytes};}));
}
