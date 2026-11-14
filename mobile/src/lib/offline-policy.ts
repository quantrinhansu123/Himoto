import type { MobileUser } from '../../../shared/mobile-contract';

export const OFFLINE_TTL = 24 * 60 * 60 * 1000;
export const MAX_CACHE_PAGES = 180;
export const MAX_OFFLINE_WRITES = 8;
export type OfflineScope = { origin: string; user: MobileUser };
export function offlineScopeKey(scope: OfflineScope) {
  const { user } = scope;
  return JSON.stringify([scope.origin, user.id, user.storeId, user.allStores, user.role, [...user.permissions].sort()]);
}
export function cacheableRead(path: string, method = 'GET') {
  if (method !== 'GET') return false;
  const route = path.split('?')[0];
  const query = new URLSearchParams(path.split('?')[1] || '');
  if (query.has('photo') || query.has('request_id')) return false;
  return route === '/workspace' ||
    /^\/catalogue\/(vehicles|customers|contracts)(\/\d+)?$/.test(route) ||
    /^\/(customers|vehicles)\/(\d+|options)$/.test(route) ||
    /^\/drafts\/(\d+|options|staff|inventory)$/.test(route) ||
    /^\/contracts\/\d+\/(preparation|finance|renewals(?:\/\d+\/collection)?|returns|swaps|vehicle-transfers)$/.test(route) ||
    route === '/vehicles/inventory' ||
    ['/dashboard','/operations','/attendance','/guide-faq','/cashbook','/cashbook/accounts','/duty-roster','/shift-reports','/debt-reminders','/debt-reminders/contracts','/notifications','/notifications/activity','/battery-contracts','/contract-types'].includes(route) ||
    /^\/reports\/(options|actual|ledger|vehicles|overview|fleet|contracts|by-staff|by-store|new-customers|assigned)$/.test(route) ||
    /^\/directory\/(staff|stores)$/.test(route) ||
    /^\/vehicles\/\d+\/(contracts|history|transfers)$/.test(route) ||
    /^\/notifications\/groups\/[a-z-]+$/.test(route);
}
/** Only operations whose server handlers use the durable idempotency ledger. */
export function offlineOperation(path: string, method: string): string | null {
  let match = /^\/(drafts|customers)(?:\/([1-9]\d{0,14}))?$/.exec(path);
  if (match && ((!match[2] && method === 'POST') || (match[2] && method === 'PATCH')))
    return `${match[1] === 'drafts' ? 'draft' : 'customer'}.${match[2] ? `update:${match[2]}` : 'create'}`;
  match = /^\/contracts\/([1-9]\d{0,14})\/(finalize|handover|payments|renewals|returns|swaps)$/.exec(path);
  if (match && method === 'POST') {
    const operations: Record<string, string> = { finalize: 'contract.finalize', handover: 'contract.handover', payments: 'payment.record', renewals: 'renewal.record', returns: 'return.record', swaps: 'return.swap' };
    return `${operations[match[2]]}:${match[1]}`;
  }
  match = /^\/contracts\/([1-9]\d{0,14})\/renewals\/[1-9]\d*\/collection$/.exec(path);
  if (match && method === 'POST') return `payment.renewal:${match[1]}`;
  return null;
}
export function retryDelay(attempts: number) {
  return Math.min(15 * 60 * 1000, 5000 * 2 ** Math.min(8, attempts));
}
export const offlineOperationLabel = (operation: string) => {
  const family = operation.split(':')[0];
  return ({ 'draft.create': 'Tạo bản nháp', 'draft.update': 'Sửa bản nháp', 'customer.create': 'Thêm khách hàng', 'customer.update': 'Sửa khách hàng', 'contract.finalize': 'Chốt hợp đồng', 'contract.handover': 'Giao xe', 'payment.record': 'Thu/chi hợp đồng', 'payment.renewal': 'Thu tiền theo kỳ', 'renewal.record': 'Gia hạn hợp đồng', 'return.record': 'Trả xe và quyết toán', 'return.swap': 'Đổi xe' } as Record<string, string>)[family] || 'Lưu hồ sơ';
};
