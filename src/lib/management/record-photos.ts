export type PhotoEntity = 'customers' | 'contracts';
export interface PhotoSlot { key: string; label: string }
export interface SavedPhoto { slot: string; updated_at: string }
export type PendingPhotos = Record<string, File>;
export const CUSTOMER_PHOTO_SLOTS: PhotoSlot[] = [{ key: 'id_front', label: 'CCCD mặt trước' }, { key: 'id_back', label: 'CCCD mặt sau' }];
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
export interface CloudUploadReceipt { public_id: string; version: number; signature: string }
const uploads = new WeakMap<File, { id: string; promise: Promise<CloudUploadReceipt> }>();

export function uploadRecordPhoto(file: File, retry = false): Promise<CloudUploadReceipt> {
  const previous = uploads.get(file);
  if (previous && !retry) return previous.promise;
  const id = retry ? crypto.randomUUID() : previous?.id || crypto.randomUUID();
  const promise = (async () => {
    const signed = await fetch('/api/auth/photo-uploads/sign', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ upload_id: id }) });
    const envelope = await signed.json().catch(() => null);
    if (!signed.ok || envelope?.status !== 'success') throw new Error(envelope?.message || 'Không khởi tạo được tải ảnh.');
    const settings = envelope.data;
    if (!/^[a-z0-9_-]+$/i.test(settings?.cloud_name || '') || !settings.api_key || !settings.signature || !settings.params) throw new Error('Cấu hình tải ảnh chưa hợp lệ.');
    const body = new FormData(); body.append('file', file);
    for (const [key, value] of Object.entries(settings.params)) body.append(key, String(value));
    body.append('api_key', settings.api_key); body.append('signature', settings.signature);
    const response = await fetch(`https://api.cloudinary.com/v1_1/${settings.cloud_name}/image/upload`, { method: 'POST', body, signal: AbortSignal.timeout(60_000) });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.public_id !== settings.params.public_id || !Number.isSafeInteger(result?.version) || typeof result?.signature !== 'string') throw new Error('Chưa tải được ảnh lên Cloudinary. Ảnh vẫn được giữ trong form để thử lại.');
    return { public_id: result.public_id, version: result.version, signature: result.signature };
  })();
  uploads.set(file, { id, promise }); void promise.catch(() => {});
  return promise;
}
export function photoEndpoint(entity: PhotoEntity, id: number, slot?: string) {
  return `/api/auth/record-photos/${entity}/${id}${slot ? `/${encodeURIComponent(slot)}` : ''}`;
}

export async function saveRecordPhotos(entity: PhotoEntity, id: number, photos: PendingPhotos) {
  for (const [slot, photo] of Object.entries(photos)) {
    let receipt: CloudUploadReceipt | undefined;
    if (uploads.has(photo)) {
      try { receipt = await uploadRecordPhoto(photo); }
      catch { receipt = await uploadRecordPhoto(photo, true); }
    }
    const response = await fetch(photoEndpoint(entity, id, slot), { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': receipt ? 'application/json' : photo.type }, body: receipt ? JSON.stringify(receipt) : photo });
    if (!response.ok) {
      const result = await response.json().catch(() => null);
      throw new Error(result?.message || 'Chưa lưu được ảnh. Giữ form và bấm lưu lại để thử lại.');
    }
  }
}

// A camera photo can exceed the hosting request limit. Resize locally before uploading.
export async function prepareRecordPhoto(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) throw new Error('Chọn một ảnh từ camera hoặc thư viện.');
  if (file.size > 30 * 1024 * 1024) throw new Error('Ảnh gốc tối đa 30 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode().catch(() => { throw new Error('Không đọc được ảnh. Hãy chụp lại hoặc chọn ảnh JPEG/PNG.'); });
    const scale = Math.min(1, 1800 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Không xử lý được ảnh trên thiết bị này.');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob || blob.size > MAX_PHOTO_BYTES) throw new Error('Ảnh sau xử lý vẫn quá 2 MB. Hãy chụp gần hơn hoặc chọn ảnh nhỏ hơn.');
    return new File([blob], 'anh-ho-so.jpg', { type: 'image/jpeg' });
  } finally { URL.revokeObjectURL(url); }
}
