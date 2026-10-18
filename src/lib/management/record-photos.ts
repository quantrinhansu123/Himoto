export type PhotoEntity = 'customers' | 'contracts';
export interface PhotoSlot { key: string; label: string }
export interface SavedPhoto { slot: string; updated_at: string; mime_type?: string }
export type PendingPhotos = Record<string, File>;
export const CUSTOMER_PHOTO_SLOTS: PhotoSlot[] = [{ key: 'id_front', label: 'CCCD mặt trước' }, { key: 'id_back', label: 'CCCD mặt sau' }];
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 45 * 1024 * 1024;
export const isVideoSlot = (slot:string) => /-video-[1-3]$/.test(slot);
export interface CloudUploadReceipt { public_id: string; version: number; signature: string; resource_type?: 'video' }
const uploads = new WeakMap<File, { id: string; promise: Promise<CloudUploadReceipt> }>();

export function uploadRecordPhoto(file: File, retry = false): Promise<CloudUploadReceipt> {
  const previous = uploads.get(file);
  if (previous && !retry) return previous.promise;
  const id = retry ? crypto.randomUUID() : previous?.id || crypto.randomUUID();
  const promise = (async () => {
    const video=file.type.startsWith('video/');
    const signed = await fetch('/api/auth/photo-uploads/sign', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ upload_id: id, ...(video?{resource_type:'video'}:{}) }) });
    const envelope = await signed.json().catch(() => null);
    if (!signed.ok || envelope?.status !== 'success') throw new Error(envelope?.message || 'Không khởi tạo được tải ảnh.');
    const settings = envelope.data;
    if (!/^[a-z0-9_-]+$/i.test(settings?.cloud_name || '') || !settings.api_key || !settings.signature || !settings.params) throw new Error('Cấu hình tải ảnh chưa hợp lệ.');
    const body = new FormData(); body.append('file', file);
    for (const [key, value] of Object.entries(settings.params)) body.append(key, String(value));
    body.append('api_key', settings.api_key); body.append('signature', settings.signature);
    const response = await fetch(`https://api.cloudinary.com/v1_1/${settings.cloud_name}/${video?'video':'image'}/upload`, { method: 'POST', body, signal: AbortSignal.timeout(video?180_000:60_000) });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.public_id !== settings.params.public_id || !Number.isSafeInteger(result?.version) || typeof result?.signature !== 'string') throw new Error('Chưa tải được ảnh lên Cloudinary. Ảnh vẫn được giữ trong form để thử lại.');
    return { public_id: result.public_id, version: result.version, signature: result.signature, ...(video?{resource_type:'video' as const}:{}) };
  })();
  uploads.set(file, { id, promise }); void promise.catch(() => {});
  return promise;
}
export function photoEndpoint(entity: PhotoEntity, id: number, slot?: string) {
  return `/api/auth/record-photos/${entity}/${id}${slot ? `/${encodeURIComponent(slot)}` : ''}`;
}
export async function copyCustomerPhotosToContract(id:number) {
  const response=await fetch(photoEndpoint('contracts',id),{method:'POST',credentials:'same-origin'});
  const body=await response.json();
  if(!response.ok||body.status!=='success')throw new Error(body.message||'Không lấy được giấy tờ từ hồ sơ khách.');
  return body.data as {copied:number};
}

export async function saveRecordPhotos(entity: PhotoEntity, id: number, photos: PendingPhotos) {
  for (const [slot, photo] of Object.entries(photos)) {
    let receipt: CloudUploadReceipt | undefined;
    if (uploads.has(photo) || photo.type.startsWith('video/')) {
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

export async function prepareRecordVideo(file:File):Promise<File> {
  if(!file.type.startsWith('video/')||file.size>MAX_VIDEO_BYTES||!file.size)throw new Error('Chọn video MP4/MOV/WebM, tối đa 45 MB.');
  const url=URL.createObjectURL(file);
  try {
    const video=document.createElement('video');video.preload='metadata';
    // iPhone HEVC/MOV can be uploaded even when this browser cannot decode it.
    // Cloudinary converts it to H.264; the server verifies the real duration.
    const duration=await new Promise<number>(resolve=>{const timer=setTimeout(()=>resolve(NaN),10000);video.onloadedmetadata=()=>{clearTimeout(timer);resolve(video.duration);};video.onerror=()=>{clearTimeout(timer);resolve(NaN);};video.src=url;});
    if(Number.isFinite(duration)&&(duration<=0||duration>60))throw new Error('Mỗi video tối đa 60 giây; nên quay 10–30 giây.');
    video.onloadedmetadata=null;video.onerror=null;video.removeAttribute('src');video.load();return file;
  } finally {URL.revokeObjectURL(url);}
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
