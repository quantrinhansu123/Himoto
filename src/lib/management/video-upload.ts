import { uploadRecordPhoto, type CloudUploadReceipt } from './record-photos';
import { VideoValidationError, type BrowserVideoReceipt, type VideoProgressCallback } from './video-media';

type Receipt = CloudUploadReceipt | BrowserVideoReceipt;
type Upload = { id: string; promise: Promise<Receipt>; prepared?: File | null; callbacks: Set<VideoProgressCallback>; progress?: { message: string; percent?: number } };
const uploads = new WeakMap<File, Map<number, Upload>>();
let processing: Promise<unknown> = Promise.resolve();

function processVideo(file: File, maxDuration: number, progress: VideoProgressCallback): Promise<File | null> {
  if (typeof Worker === 'undefined') return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    // Terminating the worker releases WebCodecs and all its buffers even on a stuck encoder.
    let worker: Worker;
    try { worker = new Worker(new URL('./video-processing.worker.ts', import.meta.url)); }
    catch { resolve(null); return; }
    const finish = (result: File | null, error?: Error) => {
      clearTimeout(timer); worker.terminate();
      if (error) reject(error); else resolve(result);
    };
    const timer = setTimeout(() => finish(null), 45_000);
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') progress({ message: 'Đang chuẩn hóa video', percent: Math.round(data.value * 100) });
      else if (data.type === 'invalid') finish(null, new VideoValidationError(data.message));
      else if (data.type === 'done') finish(data.file || null);
    };
    worker.onerror = event => { event.preventDefault(); finish(null); };
    worker.postMessage({ file, maxDuration });
  });
}

async function api(input: Record<string, unknown>) {
  const response = await fetch('/api/auth/photo-uploads/video', { method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.timeout(input.action === 'verify' ? 120_000 : 30_000) });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.status !== 'success') throw new Error(body?.message || 'Chưa xác nhận được video. Tệp vẫn được giữ để thử lại.');
  return body.data;
}

function putVideo(url: string, headers: Record<string, string>, file: File, progress: VideoProgressCallback) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest(); request.open('PUT', url); request.timeout = 180_000;
    for (const [key, value] of Object.entries(headers)) request.setRequestHeader(key, value);
    request.upload.onprogress = event => { if (event.lengthComputable) progress({ message: 'Đang tải video', percent: Math.round(event.loaded / event.total * 100) }); };
    request.onload = () => {
      // A lost earlier PUT response can leave the immutable object already present. Verify it next.
      if (request.status >= 200 && request.status < 300 || request.status === 412) resolve();
      else reject(new Error('Chưa tải được video. Giữ form và bấm tải lại.'));
    };
    request.onerror = request.ontimeout = () => reject(new Error('Mất kết nối khi tải video. Tệp vẫn được giữ; bấm tải lại.'));
    request.send(file);
  });
}

export function uploadBrowserVideo(file: File, retry = false, maxDuration = 60, callback?: VideoProgressCallback): Promise<Receipt> {
  let variants = uploads.get(file);
  if (!variants) { variants = new Map(); uploads.set(file, variants); }
  const previous = variants.get(maxDuration);
  if (previous && !retry) {
    if (callback) { previous.callbacks.add(callback); if (previous.progress) callback(previous.progress); }
    return previous.promise;
  }
  const state: Upload = { id: previous?.id || crypto.randomUUID(), prepared: previous?.prepared, callbacks: new Set(callback ? [callback] : []), promise: Promise.resolve(null as unknown as Receipt) };
  const progress: VideoProgressCallback = value => { state.progress = value; state.callbacks.forEach(listener => listener(value)); };
  state.promise = (async () => {
    const config = await api({ action: 'config' });
    if (config.enabled) {
      if (state.prepared === undefined) {
        progress({ message: 'Đang chờ xử lý video' });
        const task = processing.then(() => { progress({ message: 'Đang chuẩn hóa video', percent: 0 }); return processVideo(file, maxDuration, progress); });
        processing = task.catch(() => {});
        state.prepared = await task;
      }
      if (state.prepared) {
        const prepared = state.prepared;
        const hash = await crypto.subtle.digest('SHA-256', await prepared.arrayBuffer());
        const sha256 = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
        progress({ message: 'Đang tải video', percent: 0 });
        const signed = await api({ action: 'sign', upload_id: state.id, bytes: prepared.size, sha256, max_duration: maxDuration });
        if (signed.receipt) return signed.receipt as BrowserVideoReceipt;
        await putVideo(signed.url, signed.headers, prepared, progress);
        progress({ message: 'Đang kiểm tra video đã tải' });
        const result = await api({ action: 'verify', ticket: signed.ticket });
        return result.receipt as BrowserVideoReceipt;
      }
    }
    progress({ message: 'Đang xử lý video bằng dịch vụ dự phòng' });
    return uploadRecordPhoto(file, retry);
  })();
  // A resolved receipt is reusable even when saving the form is retried.
  void state.promise.finally(() => state.callbacks.clear()).catch(() => {});
  variants.set(maxDuration, state);
  return state.promise;
}
