import type { CustomerStoreInput, CustomerStoreResult } from '../src/lib/management/customer-store-import';
export type { CustomerStoreInput, CustomerStoreResult, CustomerStoreRow } from '../src/lib/management/customer-store-import';
export interface MobileStoreMatchFilePage { filename: string; sha256: string; total: number; offset: number; nextOffset: number | null; inputs: CustomerStoreInput[] }
export interface MobileStoreMatchInput { rows: CustomerStoreInput[]; revision: string }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const integer = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const strings = (v: unknown) => Array.isArray(v) && v.every(s => typeof s === 'string');
function input(v: unknown) { return object(v) && integer(v.rowNumber) && v.rowNumber >= 2 && v.rowNumber <= 1048576 && object(v.values) && typeof v.values.id_card === 'string' && typeof v.values.store === 'string' && (v.errors === undefined || strings(v.errors)); }
export function isMobileStoreMatchFilePage(v: unknown): v is MobileStoreMatchFilePage {
  return object(v) && typeof v.filename === 'string' && /\.xlsx$/i.test(v.filename) && typeof v.sha256 === 'string' && /^[a-f0-9]{64}$/.test(v.sha256) && integer(v.total) && v.total > 0 && v.total < 1048576 && integer(v.offset) && v.offset < v.total && v.offset % 1000 === 0 && Array.isArray(v.inputs) && v.inputs.length === Math.min(1000, v.total - v.offset) && v.inputs.every(input) && v.nextOffset === (v.offset + v.inputs.length < v.total ? v.offset + v.inputs.length : null);
}
export function isMobileStoreMatchResult(v: unknown): v is CustomerStoreResult {
  if (!object(v) || !Array.isArray(v.rows) || !v.rows.length || v.rows.length > 1000 || typeof v.revision !== 'string' || !/^[a-f0-9]{64}$/.test(v.revision) || v.committed !== false || v.updated !== 0 || !['total', 'ready', 'unchanged', 'invalid'].every(k => integer(v[k])) || v.total !== v.rows.length || Number(v.ready) + Number(v.unchanged) + Number(v.invalid) !== v.total) return false;
  return v.rows.every(r => input(r) && object(r) && ['ready', 'unchanged', 'invalid'].includes(String(r.state)) && strings(r.errors) && ['customer_name', 'previous_store_name', 'store_name'].every(k => typeof r[k] === 'string') && ['customer_id', 'previous_store_id', 'store_id'].every(k => r[k] === null || integer(r[k]) && Number(r[k]) > 0));
}
