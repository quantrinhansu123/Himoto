import { ApiError, createApi, type MobileApi } from './api';
import { sessionStore } from './session-store';
import { openOfflineStore } from './offline-native';
import { offlineOperation, offlineScopeKey } from './offline-policy';
import { offlineStatus } from './offline-status';
import type { OfflineWrite } from './offline-store';
import { freshSession, sessionAccess, sessionFamily } from './session-refresh';

export function replayOfflineWrite(api: MobileApi, row: OfflineWrite) {
  if (offlineOperation(row.path, row.method) !== row.operation) throw new Error('Thao tác trong hàng đợi không khớp. Giữ mã gốc để đối chiếu.');
  const input: unknown = JSON.parse(row.body), id = row.operation.split(':')[1];
  switch (row.operation.split(':')[0]) {
    case 'draft.create': case 'draft.update': return api.saveDraft(id || null, input as Parameters<MobileApi['saveDraft']>[1], row.key);
    case 'customer.create': case 'customer.update': return api.saveCustomer(id || null, input as Parameters<MobileApi['saveCustomer']>[1], row.key);
    case 'contract.finalize': case 'contract.handover': return api.contractAction(id, row.operation.startsWith('contract.finalize') ? 'finalize' : 'handover', input as Parameters<MobileApi['contractAction']>[2], row.key);
    case 'payment.record': return api.recordPayment(id, input as Parameters<MobileApi['recordPayment']>[1], row.key);
    case 'payment.renewal': return api.recordRenewalCollection(id, Number(row.path.split('/')[4]), input as Parameters<MobileApi['recordRenewalCollection']>[2], row.key);
    case 'renewal.record': return api.recordRenewal(id, input as Parameters<MobileApi['recordRenewal']>[1], row.key);
    case 'return.record': return api.recordReturn(id, input as Parameters<MobileApi['recordReturn']>[1], row.key);
    case 'return.swap': return api.recordSwap(id, input as Parameters<MobileApi['recordSwap']>[1], row.key);
    default: throw new Error('Thao tác cần được đối chiếu thủ công.');
  }
}

let running: Promise<boolean> | undefined;
/** Every drain reauthorizes. Never resolveWrite before retry: it tombstones absent requests. */
export function syncOffline(origin: string) {
  if (running) return running;
  let expectedFamily: string | null = null;
  running = (async () => {
    const initial = await sessionStore.read(origin);
    if (!initial) return false;
    expectedFamily = sessionFamily(initial);
    const stored = await freshSession(origin, expectedFamily);
    if (!stored?.user) return false;
    const store = await openOfflineStore();
    const scope = offlineScopeKey({ origin, user: stored.user });
    const api = createApi(origin, stored.token, undefined, undefined, sessionAccess(origin, stored));
    const fresh = await api.session();
    offlineStatus.update({ connected: true, error: '' });
    const current = await sessionStore.read(origin);
    if (!current || sessionFamily(current) !== sessionFamily(stored)) return false;
    const next = { ...current, ...fresh };
    if (!await sessionStore.update(origin, current.token, next)) return false;
    await store.holdOtherScopes(offlineScopeKey({ origin, user: fresh.user }), origin, fresh.user.id);
    if (offlineScopeKey({ origin, user: fresh.user }) !== scope) {
      await store.clearCache();
      offlineStatus.update({ error: 'Quyền hoặc cơ sở đã thay đổi. Mở lại phiên để đối chiếu các thao tác cũ.' });
      return false;
    }
    const entries = await store.list(scope);
    offlineStatus.update({ syncing: entries.some(row => row.state === 'queued' || row.state === 'sending') });
    for (const row of entries) {
      if (row.state === 'conflict') break;
      if (row.state === 'committed') continue;
      if (Date.now() - row.created_at > 24 * 60 * 60 * 1000) {
        await store.failed(scope, row.key, 'Thao tác chờ quá 24 giờ. Cần đối chiếu trước khi gửi.', false, row.attempts);
        break;
      }
      const active = await sessionStore.read(origin);
      if (!active || sessionFamily(active) !== sessionFamily(stored) || !active.user || offlineScopeKey({ origin, user: active.user }) !== scope) return false;
      if (!await store.claim(scope, row.key)) break;
      try {
        await replayOfflineWrite(api, row);
        await store.committed(scope, row.key);
      } catch (error) {
        const retryable = error instanceof ApiError && !['INVALID_RESPONSE', 'CONFIGURATION', 'SESSION_CHANGED'].includes(error.code) && (error.status === 0 || error.status >= 500 || error.status === 429);
        await store.failed(scope, row.key, (error as Error).message, retryable, row.attempts);
        if (error instanceof ApiError && error.status === 0) offlineStatus.update({ connected: false });
        if (error instanceof ApiError && error.status === 401) {
          if (await sessionStore.clearFamily(origin, expectedFamily)) await store.clearCache(scope);
        }
        return false;
      }
    }
    return true;
  })().catch(async error => {
    if (error instanceof ApiError && error.status === 401 && expectedFamily) {
      if (await sessionStore.clearFamily(origin, expectedFamily)) await openOfflineStore().then(store => store.clearCache()).catch(() => {});
    }
    if (error instanceof ApiError && error.status === 0) offlineStatus.update({ connected: false });
    offlineStatus.update({ error: error instanceof ApiError && error.status === 0 ? '' : (error as Error).message });
    return false;
  }).finally(() => { running = undefined; offlineStatus.update({ syncing: false }); });
  return running;
}
