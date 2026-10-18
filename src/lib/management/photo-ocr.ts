import type { CustomerDetails } from './contract-document';
import { parseIssueDateInput, validIdentityIssueDate } from './customer-identity';

export const OCR_CUSTOMER_KEYS = ['id_card', 'name', 'id_card_issued_on', 'id_card_issued_by'] as const;
export const OCR_DRIVER_KEYS = ['driver_license_number','driver_license_issued_on'] as const;
export type OcrCustomerKey = typeof OCR_CUSTOMER_KEYS[number] | typeof OCR_DRIVER_KEYS[number];
export type OcrKind = 'cccd_front' | 'cccd_back' | 'plate' | 'passport' | 'driver_license';
export type OcrFields = Partial<Record<OcrCustomerKey | 'license', string>>;
export interface OcrResult { fields: OcrFields }
export const plateKey = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '');

export function cleanOcrFields(value: unknown, kind: OcrKind): OcrFields {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Kết quả đọc ảnh không hợp lệ.');
  const input = value as Record<string, unknown>, fields: OcrFields = {};
  const keys = kind === 'plate' ? ['license'] as const : kind==='driver_license'?OCR_DRIVER_KEYS:OCR_CUSTOMER_KEYS;
  for (const key of keys) {
    const raw = input[key];
    if (raw === undefined || raw === null || raw === '') continue;
    if (typeof raw !== 'string' || raw.length > 255) throw new Error('Kết quả đọc ảnh không hợp lệ.');
    let text = Array.from(raw.trim(), character => character.charCodeAt(0) < 32 ? ' ' : character).join('').replace(/\s+/g, ' ');
    if (key === 'id_card') { text = text.replace(/\s/g, '').toUpperCase(); if (kind === 'passport' ? !/^[A-Z0-9-]{3,100}$/.test(text) : !/^\d{9}$|^\d{12}$/.test(text)) continue; }
    if (key === 'id_card_issued_on' || key === 'driver_license_issued_on') { text = parseIssueDateInput(text); if (!validIdentityIssueDate(text)) continue; }
    if (key === 'license') { text = text.toUpperCase(); if (!/^\d{2}[A-Z]{1,2}\d?\d{4,6}$/.test(plateKey(text))) continue; }
    if (text) fields[key] = text;
  }
  return fields;
}

// A new photo fills the four identity fields, including values entered before the read.
// Preserve manual edits made while that request was in flight; never fill current address.
export function mergeOcrCustomer(current: CustomerDetails, result: OcrFields, before: CustomerDetails, previousAi: OcrFields) {
  const next = { ...current }, applied: OcrFields = {};
  for (const key of [...OCR_CUSTOMER_KEYS,...OCR_DRIVER_KEYS]) {
    if (result[key] && (current[key] === before[key] || current[key] === previousAi[key])) {
      next[key] = result[key]; applied[key] = result[key];
    }
  }
  return { customer: next, applied };
}

export async function readPhotoWithAi(kind: OcrKind, file: File, signal: AbortSignal): Promise<OcrResult> {
  const response = await fetch('/api/auth/photo-ocr', { method: 'POST', credentials: 'same-origin', signal,
    headers: { 'Content-Type': file.type, 'X-Photo-Kind': kind }, body: file });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.status !== 'success') throw new Error(result?.message || 'Không đọc được ảnh. Có thể thử lại hoặc nhập tay.');
  return { fields: cleanOcrFields(result.data?.fields, kind) };
}
