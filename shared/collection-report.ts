export const CONTACT_STATUSES = {
  uncontacted: 'Chưa liên hệ', contacted: 'Đã liên hệ', unreachable: 'Không nghe máy', promised: 'Hẹn thanh toán',
} as const;
export const HANDLING_STATUSES = { branch: 'PGD xử lý', escalated: 'Chuyển XLN', resolved: 'Đã xử lý' } as const;

export interface CollectionFollowup {
  contact_status: keyof typeof CONTACT_STATUSES;
  handling_status: keyof typeof HANDLING_STATUSES;
  customer_condition: string;
  notes: string;
  revision: number;
  updated_at?: string;
}
export interface CollectionRow {
  id: number; code: string; customer: string; phone: string; store_id: number; store_name: string; vehicle: string;
  started_at: string; due_at: string; days: number; amount: number | null; late_fee: number | null;
  gps: string[]; customer_status: string; followup: CollectionFollowup;
}
export interface CollectionReportView {
  rows: CollectionRow[];
  read_at: string;
  messages: string[];
  hash: string;
  deliveries: { status: string }[];
}
export interface CollectionFollowupView {
  id: number;
  code: string;
  can_write: boolean;
  followup: CollectionFollowup;
}

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string';
const id = (value: unknown) => Number.isSafeInteger(value) && Number(value) > 0;
const numeric = (value: unknown) => typeof value === 'number' && Number.isFinite(value);
export function isCollectionFollowup(value: unknown): value is CollectionFollowup {
  return object(value) && text(value.contact_status) && Object.hasOwn(CONTACT_STATUSES, value.contact_status) &&
    text(value.handling_status) && Object.hasOwn(HANDLING_STATUSES, value.handling_status) &&
    text(value.customer_condition) && value.customer_condition.length <= 300 && text(value.notes) && value.notes.length <= 3000 &&
    Number.isSafeInteger(value.revision) && Number(value.revision) >= 0 && (value.updated_at === undefined || text(value.updated_at));
}
export function isCollectionReport(value: unknown): value is CollectionReportView {
  return object(value) && text(value.read_at) && text(value.hash) && /^[a-f0-9]{64}$/.test(value.hash) &&
    Array.isArray(value.messages) && value.messages.every(message => text(message) && message.length <= 4000) &&
    Array.isArray(value.deliveries) && value.deliveries.every(delivery => object(delivery) && text(delivery.status)) &&
    Array.isArray(value.rows) && value.rows.every(row => object(row) && id(row.id) && Number.isSafeInteger(row.store_id) &&
      ['code', 'customer', 'phone', 'store_name', 'vehicle', 'started_at', 'due_at', 'customer_status'].every(key => text(row[key])) &&
      numeric(row.days) && (row.amount === null || numeric(row.amount)) && (row.late_fee === null || numeric(row.late_fee)) &&
      Array.isArray(row.gps) && row.gps.every(text) && isCollectionFollowup(row.followup));
}
export function isCollectionFollowupView(value: unknown): value is CollectionFollowupView {
  return object(value) && id(value.id) && text(value.code) && typeof value.can_write === 'boolean' && isCollectionFollowup(value.followup);
}
export function parseCollectionFollowup(raw: unknown): CollectionFollowup & { order_id: number } {
  if (!object(raw) || !id(raw.order_id) || !isCollectionFollowup(raw) ||
      Object.keys(raw).some(key => !['order_id', 'revision', 'contact_status', 'handling_status', 'customer_condition', 'notes'].includes(key))) {
    throw new Error('Kiểm tra tình trạng khách, ghi chú và phiên bản báo cáo.');
  }
  return {
    order_id: Number(raw.order_id), revision: raw.revision, contact_status: raw.contact_status, handling_status: raw.handling_status,
    customer_condition: raw.customer_condition.trim(), notes: raw.notes.trim(),
  };
}
export function filterCollectionRows(rows: CollectionRow[], search: string, handling: string) {
  const term = search.toLocaleLowerCase('vi');
  return rows.filter(row => (!handling || row.followup.handling_status === handling) &&
    (!term || [row.code, row.customer, row.phone, row.vehicle, row.followup.customer_condition, row.followup.notes]
      .join(' ').toLocaleLowerCase('vi').includes(term)));
}
