import type { CustomerDetails } from './contract-document';
import { parseIssueDateInput, validIdentityIssueDate } from './customer-identity';
import { REFUND_RECIPIENT_KEYS } from './refund-qr';
import { normalizeRefundAccount,validRefundAccount } from './return-refunds';

export const OCR_CUSTOMER_KEYS = ['id_card', 'name', 'id_card_issued_on', 'id_card_issued_by'] as const;
export const OCR_DRIVER_KEYS = ['driver_license_number','driver_license_issued_on'] as const;
export type OcrCustomerKey = typeof OCR_CUSTOMER_KEYS[number] | typeof OCR_DRIVER_KEYS[number];
export type OcrKind = 'cccd_front' | 'cccd_back' | 'plate' | 'passport' | 'driver_license' | 'customer_documents' | 'refund_qr';
export type OcrFields = Partial<Record<OcrCustomerKey | 'license' | typeof REFUND_RECIPIENT_KEYS[number], string>>;
export interface OcrResult { fields: OcrFields; warnings?:string[] }
export const plateKey = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '');

export function cleanOcrFields(value: unknown, kind: OcrKind): OcrFields {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Kết quả đọc ảnh không hợp lệ.');
  const input = value as Record<string, unknown>, fields: OcrFields = {};
  const keys = kind==='refund_qr'?REFUND_RECIPIENT_KEYS:kind === 'plate' ? ['license'] as const : kind==='driver_license'?OCR_DRIVER_KEYS:kind==='customer_documents'?[...OCR_CUSTOMER_KEYS,...OCR_DRIVER_KEYS]:kind==='cccd_back'?OCR_CUSTOMER_KEYS.filter(key=>key!=='name'):OCR_CUSTOMER_KEYS;
  for (const key of keys) {
    const raw = input[key];
    if (raw === undefined || raw === null || raw === '') continue;
    if (typeof raw !== 'string' || raw.length > 255) throw new Error('Kết quả đọc ảnh không hợp lệ.');
    let text = Array.from(raw.trim(), character => character.charCodeAt(0) < 32 ? ' ' : character).join('').replace(/\s+/g, ' ');
    if(kind==='refund_qr'){
      if(text.length>150||/^(null|undefined|unknown|n\/a)$/i.test(text))continue;
      if(key==='recipient_account'){text=normalizeRefundAccount(text);if(!validRefundAccount(text))continue;}
    }
    if (key === 'id_card') { text = text.replace(/\s/g, '').toUpperCase(); if (kind === 'passport'||kind==='customer_documents' ? !/^[A-Z0-9-]{3,100}$/.test(text) : !/^\d{9}$|^\d{12}$/.test(text)) continue; }
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
  if(current.id_card!==before.id_card&&current.id_card!==result.id_card)return {customer:next,applied};
  for (const key of [...OCR_CUSTOMER_KEYS,...OCR_DRIVER_KEYS]) {
    if (result[key] && (current[key] === before[key] || current[key] === previousAi[key])) {
      next[key] = result[key]; applied[key] = result[key];
    }
  }
  return { customer: next, applied };
}

export async function readPhotoWithAi(kind: OcrKind, file: File|File[], signal: AbortSignal,expectedIdentity=''): Promise<OcrResult> {
  const batch=Array.isArray(file);let body:File|FormData;
  if(batch){const form=new FormData();for(const image of file)form.append('photos',image);body=form;}else body=file;
  const response = await fetch('/api/auth/photo-ocr', { method: 'POST', credentials: 'same-origin', signal,
    headers: { ...(!batch?{'Content-Type':(file as File).type}:{}), 'X-Photo-Kind': kind,...(expectedIdentity?{'X-Expected-Identity':expectedIdentity}:{}) }, body });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.status !== 'success') throw new Error(result?.message || 'Không đọc được ảnh. Có thể thử lại hoặc nhập tay.');
  return { fields: cleanOcrFields(result.data?.fields, kind),...(Array.isArray(result.data?.warnings)?{warnings:result.data.warnings.filter((item:unknown)=>typeof item==='string').slice(0,5)}:{}) };
}
