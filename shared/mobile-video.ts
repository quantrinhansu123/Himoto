import type { MobileMediaReceipt } from './mobile-record-media';
import { isMobileMediaIdentity, isMobileMediaTarget, isMobileMediaSlot, isMediaRevision } from './mobile-record-media';
export const MOBILE_MAX_VIDEO_BYTES = 45 * 1024 * 1024;
export const MOBILE_CONTRACT_VIDEO_SECONDS = 60;
export const MOBILE_SHIFT_VIDEO_SECONDS = 180;
export const videoOperation = (id: number) => `video.record:${id}`;
export interface MobileVideoReceipt extends Omit<MobileMediaReceipt, 'sha256'> { kind: 'video'; assetHash: string; duration: number }
export interface MobileVideoUploadSignature { cloud_name: string; api_key: string; params: Record<string, string | number | boolean>; signature: string; video_storage_provider: 'cloudinary' | 'cloudfly' }
export interface MobileVideoCloudReceipt { public_id: string; version: number; signature: string; resource_type: 'video' }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const hash = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const uuid = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
export function isMobileVideoReceipt(v: unknown): v is MobileVideoReceipt {
  if (!object(v) || v.kind !== 'video' || !isMobileMediaIdentity(v.target) || v.target.entity !== 'contracts' || !isMobileMediaTarget(v.target) || v.id !== v.target.id || v.revision !== v.target.revision || !isMediaRevision(v.revision) || !isMobileMediaSlot(v.target, v.slot) || !/-video-[1-3]$/.test(String(v.slot)) || !isMediaRevision(v.photoRevision) || !hash(v.assetHash) || !Number.isSafeInteger(v.bytes) || Number(v.bytes) <= 0 || Number(v.bytes) > MOBILE_MAX_VIDEO_BYTES || typeof v.duration !== 'number' || !Number.isFinite(v.duration) || v.duration <= 0 || v.duration > MOBILE_CONTRACT_VIDEO_SECONDS || typeof v.label !== 'string' || v.label.length > 4000 || !Number.isSafeInteger(v.actorId) || Number(v.actorId) <= 0 || typeof v.actorName !== 'string' || typeof v.recordedAt !== 'string' || !Number.isFinite(Date.parse(v.recordedAt)) || !uuid(v.requestId) || typeof v.replayed !== 'boolean' || ![v.parentCurrent, v.referenceCurrent, v.photoCurrent, v.current].every(f => typeof f === 'boolean')) return false;
  return v.current === (v.parentCurrent && v.referenceCurrent && v.photoCurrent);
}
export function isMobileVideoCloudReceipt(v: unknown): v is MobileVideoCloudReceipt { return object(v) && v.resource_type === 'video' && typeof v.public_id === 'string' && /^himoto\/management-video\/[1-9]\d*\/[a-f0-9-]{36}$/i.test(v.public_id) && Number.isSafeInteger(v.version) && Number(v.version) > 0 && typeof v.signature === 'string' && /^[a-f0-9]{40}$/.test(v.signature); }
export function isMobileVideoSignature(v: unknown): v is MobileVideoUploadSignature {
  if (!object(v) || typeof v.cloud_name !== 'string' || !/^[a-z0-9_-]{1,100}$/i.test(v.cloud_name) || typeof v.api_key !== 'string' || !/^\d{1,40}$/.test(v.api_key) || typeof v.signature !== 'string' || !/^[a-f0-9]{40}$/.test(v.signature) || !['cloudinary', 'cloudfly'].includes(String(v.video_storage_provider)) || !object(v.params)) return false;
  const p = v.params;
  return Object.keys(p).every(k => ['public_id', 'timestamp', 'type', 'overwrite', 'format', 'allowed_formats', 'transformation'].includes(k)) && typeof p.public_id === 'string' && /^himoto\/management-video\/[1-9]\d*\/[a-f0-9-]{36}$/i.test(p.public_id) && Number.isSafeInteger(p.timestamp) && Number(p.timestamp) > 0 && p.type === 'authenticated' && p.overwrite === false && p.format === 'mp4' && p.allowed_formats === 'mp4' && p.transformation === 'c_limit,w_1280,h_1280,vc_h264,ac_aac';
}
