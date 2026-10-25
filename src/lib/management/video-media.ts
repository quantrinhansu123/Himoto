// Shared limits and receipts; no credentials or server dependencies belong here.
export const MAX_VIDEO_BYTES = 45 * 1024 * 1024;
export interface BrowserVideoReceipt {
  provider: 'cloudfly-browser';
  resource_type: 'video';
  upload_id: string;
  signature: string;
}
export interface VideoUploadProgress { message: string; percent?: number }
export type VideoProgressCallback = (progress: VideoUploadProgress) => void;
export class VideoValidationError extends Error {}
