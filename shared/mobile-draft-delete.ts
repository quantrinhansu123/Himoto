import type { MobileWriteReceipt } from './mobile-contract';
export interface MobileDraftDeleteReview { id: number; code: string; revision: string; canDelete: boolean; blockedReason: string | null }
export interface MobileDraftDeleteInput { revision: string }
export interface MobileDraftDeleteResult { key: string; operation: string; receipt: MobileWriteReceipt }
export function draftDeleteConflicts(id: string) { return [`draft.delete:${id}`, `draft.update:${id}`, `contract.finalize:${id}`, `contract.handover:${id}`, `media.contract:${id}`, `media.copy:${id}`, `media.delete.contract:${id}`, `video.record:${id}`]; }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const id = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const revision = (v: unknown) => typeof v === 'string' && /^[1-9]\d{0,19}$/.test(v);
export function isMobileDraftDeleteReview(v: unknown): v is MobileDraftDeleteReview { return object(v) && id(v.id) && typeof v.code === 'string' && revision(v.revision) && typeof v.canDelete === 'boolean' && (v.blockedReason === null || typeof v.blockedReason === 'string') && v.canDelete === (v.blockedReason === null); }
export function isMobileDraftDeleteResult(v: unknown): v is MobileDraftDeleteResult { return object(v) && typeof v.key === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v.key) && object(v.receipt) && id(v.receipt.id) && revision(v.receipt.revision) && typeof v.receipt.replayed === 'boolean' && v.operation === `draft.delete:${v.receipt.id}`; }
