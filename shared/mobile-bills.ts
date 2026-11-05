import type { MobileWriteReceipt } from "./mobile-contract";

export interface MobileBillReceipt extends MobileWriteReceipt {
  version: number;
  slot: string;
  sha256: string;
  photoRevision: string;
  bytes: number;
  /** False if the saved slot was subsequently changed/deleted by another workflow. */
  current: boolean;
}
export interface MobileBillInfo {
  id: number;
  version: number;
  slot: string;
  photoRevision: string | null;
  mimeType: "image/jpeg" | "image/png" | "image/webp" | null;
  bytes: number | null;
  updatedAt: string | null;
}
export function isMobileBillInfo(value: unknown): value is MobileBillInfo {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row=value as Record<string, unknown>;
  if (typeof row.id!=="number" || !Number.isSafeInteger(row.id) || row.id<=0 || typeof row.version!=="number" || !Number.isSafeInteger(row.version) || row.version<2 || row.slot!==`renewal-${row.version}-document-1`) return false;
  if (row.photoRevision===null) return row.mimeType===null && row.bytes===null && row.updatedAt===null;
  return typeof row.photoRevision==="string" && /^[1-9]\d{0,19}$/.test(row.photoRevision) && ["image/jpeg","image/png","image/webp"].includes(String(row.mimeType)) &&
    (row.bytes===null || (typeof row.bytes==="number" && Number.isSafeInteger(row.bytes) && row.bytes>0 && row.bytes<=2*1024*1024)) && typeof row.updatedAt==="string" && Number.isFinite(Date.parse(row.updatedAt));
}
export function isMobileBillReceipt(value: unknown): value is MobileBillReceipt {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "number" && Number.isSafeInteger(row.id) && row.id > 0 &&
    typeof row.revision === "string" && /^[1-9]\d{0,19}$/.test(row.revision) && typeof row.replayed === "boolean" &&
    typeof row.version === "number" && Number.isSafeInteger(row.version) && row.version >= 2 &&
    row.slot === `renewal-${row.version}-document-1` && typeof row.sha256 === "string" && /^[a-f0-9]{64}$/.test(row.sha256) &&
    typeof row.photoRevision === "string" && /^[1-9]\d{0,19}$/.test(row.photoRevision) &&
    typeof row.bytes === "number" && Number.isSafeInteger(row.bytes) && row.bytes > 0 && row.bytes <= 2 * 1024 * 1024 && typeof row.current === "boolean";
}
