import { NativeModule, requireOptionalNativeModule, uuid } from 'expo';
import { Directory, File, Paths } from 'expo-file-system';
import type { RecordVideo } from './record-video';

type Progress = { id: string; progress: number };
type Result = { bytes: number; duration: number; width: number; height: number; videoMimeType: string };
declare class VideoEncoder extends NativeModule<{ onProgress: (event: Progress) => void }> {
  prepare(id: string, source: string, destination: string, maxSeconds: number): Promise<Result>;
  cancel(id: string): Promise<void>;
}

/** Encode to an owned cache directory, never overwrite or delete a selected original. */
export async function prepareAndroidVideo(source: string, signal: AbortSignal, maxSeconds: number,
  onProgress?: (percent: number) => void): Promise<RecordVideo | null> {
  if (signal.aborted) return null;
  if (!/^(file|content):\/\//.test(source) || ![60, 180].includes(maxSeconds))
    throw Error('Chọn video trên thiết bị với giới hạn thời lượng hợp lệ.');
  const encoder = requireOptionalNativeModule<VideoEncoder>('HimotoVideo');
  if (!encoder) throw Error('Bản cài hiện tại chưa hỗ trợ chuẩn bị video Android. Cập nhật bản cài Himoto rồi thử lại.');
  const input = new File(source);
  if (!input.exists || !Number.isSafeInteger(input.size) || input.size <= 0 || input.size > 512 * 1024 * 1024)
    throw Error('Video nguồn cần có dung lượng từ 1 byte đến 512 MB. Chọn video ngắn hơn.');
  const id = uuid.v4().toLowerCase();
  const directory = new Directory(Paths.cache, 'himoto-video', id);
  // The caller must never be able to select a file from the directory we will own.
  const prefix = new URL(directory.uri).href.replace(/\/?$/, '/');
  if (source.startsWith('file:') && new URL(source).href.startsWith(prefix))
    throw Error('Chọn lại video gốc trên thiết bị.');
  directory.create({ intermediates: true, idempotent: false });
  const output = new File(directory, 'encoded.mp4');
  let accepted = false;
  let subscription: { remove: () => void } | undefined;
  const dispose = () => { try { if (directory.exists) directory.delete(); } catch { /* Private cache can be reclaimed by the OS. */ } };
  const cancel = () => { void encoder.cancel(id).catch(() => {}); };
  try {
    subscription = encoder.addListener('onProgress', event => {
      if (!signal.aborted && event.id === id && Number.isFinite(event.progress))
        onProgress?.(Math.max(0, Math.min(99, Math.floor(event.progress))));
    });
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) return null;
    onProgress?.(0);
    if (signal.aborted) return null;
    // Wait for native cancellation to release the encoder before deleting its output.
    const result = await encoder.prepare(id, source, output.uri, maxSeconds);
    if (signal.aborted) return null;
    const limit = (maxSeconds === 60 ? 18 : 45) * 1024 * 1024;
    if (!output.exists || !Number.isSafeInteger(result.bytes) || result.bytes <= 0 || result.bytes > limit || output.size !== result.bytes ||
      !Number.isFinite(result.duration) || result.duration <= 0 || result.duration > maxSeconds ||
      ![result.width, result.height].every(value => Number.isInteger(value) && value > 0) ||
      Math.max(result.width, result.height) > 1280 || Math.min(result.width, result.height) > 720 || result.videoMimeType !== 'video/avc')
      throw Error('Video sau xử lý chưa hợp lệ. Video gốc được giữ nguyên. Chọn lại video.');
    onProgress?.(100);
    if (signal.aborted) return null;
    accepted = true;
    return { uri: output.uri, name: `himoto-video-${id}.mp4`, mimeType: 'video/mp4', size: result.bytes,
      duration: result.duration, blob: output, sha256: () => output.digest('SHA-256'), dispose };
  } catch (error) {
    if (signal.aborted) return null;
    throw error;
  } finally {
    signal.removeEventListener('abort', cancel);
    subscription?.remove();
    if (!accepted) dispose();
  }
}
