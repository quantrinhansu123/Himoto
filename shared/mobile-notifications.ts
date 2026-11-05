/** No customer, vehicle, financial or bearer data is carried in push payloads. */
export const NOTIFICATION_KINDS = ['transfer', 'due', 'overdue', 'approval'] as const;
export type MobileNotificationKind = typeof NOTIFICATION_KINDS[number];
export const NOTIFICATION_LABELS: Record<MobileNotificationKind, string> = {
  transfer: 'Điều chuyển cần nhận', due: 'Hợp đồng đến hạn đóng tiền',
  overdue: 'Hợp đồng quá hạn', approval: 'Hợp đồng chờ duyệt',
};
export interface MobileNotificationGroup { kind: MobileNotificationKind; count: number }
export interface MobileNotifications { groups: MobileNotificationGroup[]; observedAt: string }
export interface MobileNotificationList {
  kind: MobileNotificationKind; rows: {id: number; label: string}[]; total: number; page: number; pages: number; observedAt: string;
}
const object = (v: unknown): v is object => !!v && typeof v === 'object' && !Array.isArray(v);
export function isMobileNotificationList(value: unknown): value is MobileNotificationList {
  if (!object(value)) return false;
  const v = value as MobileNotificationList;
  return NOTIFICATION_KINDS.includes(v.kind) && Array.isArray(v.rows) && v.rows.length <= 20
    && v.rows.every(r => object(r) && Number.isSafeInteger(r.id) && r.id > 0 && typeof r.label === 'string')
    && new Set(v.rows.map(r => r.id)).size === v.rows.length
    && [v.total, v.page, v.pages].every(Number.isSafeInteger) && v.total >= 0 && v.page >= 1 && v.pages >= v.page
    && typeof v.observedAt === 'string' && Number.isFinite(Date.parse(v.observedAt));
}
export interface MobilePushStatus { configured: boolean; enabled: boolean }
export interface MobilePushTest {outcome:'sent'|'unknown'}
export function isMobilePushTest(value:unknown):value is MobilePushTest {
  return !!value&&typeof value==='object'&&['sent','unknown'].includes((value as MobilePushTest).outcome);
}
export function isMobileNotifications(value: unknown): value is MobileNotifications {
  if (!object(value)) return false;
  const v = value as MobileNotifications;
  return typeof v.observedAt === 'string' && Number.isFinite(Date.parse(v.observedAt)) && Array.isArray(v.groups)
    && v.groups.length <= NOTIFICATION_KINDS.length
    && v.groups.every(g => object(g) && NOTIFICATION_KINDS.includes(g.kind) && Number.isSafeInteger(g.count) && g.count >= 0)
    && new Set(v.groups.map(g => g.kind)).size === v.groups.length;
}
export function isMobilePushStatus(value: unknown): value is MobilePushStatus {
  return !!value && typeof value === 'object' && typeof (value as MobilePushStatus).configured === 'boolean'
    && typeof (value as MobilePushStatus).enabled === 'boolean';
}
