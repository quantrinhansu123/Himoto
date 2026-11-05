import type { CustomerImportInput, CustomerImportResult } from '../src/lib/management/customer-import';
export type { CustomerImportInput, CustomerImportRow, CustomerImportResult, CustomerImportValues } from '../src/lib/management/customer-import';
export interface MobileCustomerImportPreview { batchId: string; filename: string; sha256: string; allowIncomplete: boolean; sourceRows: CustomerImportInput[]; result: CustomerImportResult }
export interface MobileCustomerImportInput { rows: CustomerImportInput[]; allowIncomplete: boolean }
export interface MobileImportReceipt { key: string; operation: string; batchId: string; kind: 'customers' | 'customer_stores' | 'contracts'; actorId: number; count: number; recordedAt: string; replayed: boolean }
export const isImportUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
export const isImportOperation = (v: unknown): v is string => typeof v === 'string' && /^import\.(customers|cstores|contracts):/.test(v) && isImportUuid(v.slice(v.indexOf(':') + 1));
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const integer = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const texts = (v: unknown) => Array.isArray(v) && v.every(t => typeof t === 'string');
function input(v: unknown): boolean { return object(v) && integer(v.rowNumber) && v.rowNumber >= 2 && v.rowNumber <= 10000 && object(v.values) && ['name', 'phone', 'id_card', 'email', 'address', 'store', 'status', 'warning_note'].every(k => typeof (v.values as Record<string, unknown>)[k] === 'string') && (v.errors === undefined || texts(v.errors)); }
export function isMobileCustomerImportPreview(v: unknown): v is MobileCustomerImportPreview {
  if (!object(v) || !isImportUuid(v.batchId) || typeof v.filename !== 'string' || !/\.xlsx$/i.test(v.filename) || typeof v.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(v.sha256) || typeof v.allowIncomplete !== 'boolean' || !Array.isArray(v.sourceRows) || !v.sourceRows.length || v.sourceRows.length > 1000 || !v.sourceRows.every(input) || !object(v.result)) return false;
  const r = v.result;
  return ['total', 'valid', 'invalid', 'duplicate', 'incomplete', 'imported'].every(k => integer(r[k])) && r.total === v.sourceRows.length && Number(r.valid) + Number(r.invalid) + Number(r.duplicate) === r.total && r.committed === false && r.imported === 0 && Array.isArray(r.rows) && r.rows.length === r.total && r.rows.every(row => input(row) && object(row) && ['valid', 'invalid', 'duplicate'].includes(String(row.state)) && texts(row.errors) && texts(row.warnings) && (row.store_id === null || integer(row.store_id) && row.store_id > 0));
}
export function isMobileImportReceipt(v: unknown): v is MobileImportReceipt { return object(v) && isImportUuid(v.key) && isImportUuid(v.batchId) && ['customers', 'customer_stores','contracts'].includes(String(v.kind)) && v.operation === `import.${v.kind === 'customer_stores' ? 'cstores' : v.kind}:${v.batchId}` && integer(v.actorId) && v.actorId > 0 && integer(v.count) && v.count <= 1000 && typeof v.recordedAt === 'string' && Number.isFinite(Date.parse(v.recordedAt)) && typeof v.replayed === 'boolean'; }
