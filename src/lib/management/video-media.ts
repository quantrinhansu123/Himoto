// Shared limits and receipts; no credentials or server dependencies belong here.
export const MAX_VIDEO_BYTES = 45 * 1024 * 1024;
export const VIDEO_FILE_ACCEPT = 'video/*,.mp4,.mov,.m4v,.webm';

/** Phone file providers can omit the MIME type. Actual media is still inspected by the server. */
export function normalizeVideoFile(file: File): File {
  if (file.type.startsWith('video/') || !['', 'application/octet-stream', 'application/mp4'].includes(file.type)) return file;
  const extension = file.name.split('.').pop()?.toLowerCase();
  const mime = extension === 'mov' ? 'video/quicktime' : extension === 'webm' ? 'video/webm'
    : extension === 'mp4' || extension === 'm4v' ? 'video/mp4' : undefined;
  return mime ? new File([file], file.name, { type: mime, lastModified: file.lastModified }) : file;
}
export interface BrowserVideoReceipt {
  provider: 'cloudfly-browser';
  resource_type: 'video';
  upload_id: string;
  signature: string;
}
export interface VideoUploadProgress { message: string; percent?: number }
export type VideoProgressCallback = (progress: VideoUploadProgress) => void;
export class VideoValidationError extends Error {}
