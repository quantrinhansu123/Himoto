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
