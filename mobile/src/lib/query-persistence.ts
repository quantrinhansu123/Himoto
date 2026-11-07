import type { QueryClient, QueryKey } from '@tanstack/react-query';
import type { OfflineStore } from './offline-store';
import { OFFLINE_TTL } from './offline-policy';
import { ApiError } from './api';
import { offlineStatus } from './offline-status';

// Lookup data only. Never restore write receipts, editable preparations, media
// permissions, signed URLs, credentials or a pending transaction as confirmed.
const lookupFamilies = new Set([
  'workspace', 'overview', 'catalogue', 'record', 'vehicle-profile',
  'fleet-inventory', 'vehicle-history', 'vehicle-contracts', 'transfer-history',
  'directory', 'staff-organization', 'store-contracts', 'operations',
  'cashbook', 'cashbook-accounts', 'cashbook-account-transactions',
  'report-options', 'sales-report', 'dashboard', 'shifts', 'duty-roster',
  'attendance', 'guide-faq', 'notifications', 'notification-activity',
  'notification-list', 'reminder-history', 'reminder-contracts',
  'batteries', 'contract-types',
]);
export interface LookupSnapshot { key: QueryKey; data: unknown; updatedAt: number }
export function persistableLookup(key: QueryKey) {
  return lookupFamilies.has(String(key[0])) && !/hm1_|hmr2_/.test(JSON.stringify(key));
}
export function lookupSnapshot(key: QueryKey, data: unknown, updatedAt: number): LookupSnapshot | null {
  if (!persistableLookup(key) || data === undefined || !Number.isFinite(updatedAt) || updatedAt <= 0) return null;
  // A long scrolling session must not turn the next launch into a huge hydration.
  if (data && typeof data === 'object' && 'pages' in data && 'pageParams' in data) {
    const infinite = data as { pages: unknown[]; pageParams: unknown[] };
    if (!Array.isArray(infinite.pages) || !Array.isArray(infinite.pageParams)) return null;
    data = { ...data, pages: infinite.pages.slice(0, 3), pageParams: infinite.pageParams.slice(0, 3) };
  }
  return { key, data, updatedAt };
}
export async function restoreLookupQueries(client: QueryClient, store: OfflineStore, scope: string, active: () => boolean, now = Date.now()) {
  const snapshots = await store.readQueries(scope);
  if (!active()) return;
  for (const value of snapshots) {
    if (!value || typeof value !== 'object') continue;
    const row = value as LookupSnapshot;
    if (!Array.isArray(row.key) || !persistableLookup(row.key) || row.data === undefined ||
      !Number.isFinite(row.updatedAt) || row.updatedAt > now || now - row.updatedAt >= OFFLINE_TTL) continue;
    const existing = client.getQueryState(row.key);
    if (!existing || existing.dataUpdatedAt < row.updatedAt) {
      client.setQueryData(row.key, row.data, { updatedAt: row.updatedAt });
      // Show immediately, but verify on mount even when saved just before exit.
      void client.invalidateQueries({ queryKey: row.key, exact: true, refetchType: 'none' });
    }
  }
}
export function persistLookupQueries(client: QueryClient, store: OfflineStore, scope: string, active: () => boolean) {
  let alive = true;
  let writes: Promise<unknown> = Promise.resolve();
  const unsubscribe = client.getQueryCache().subscribe(event => {
    if (event.type !== 'updated' || !persistableLookup(event.query.queryKey)) return;
    const { query } = event, hash = query.queryHash;
    if (event.action.type === 'error') {
      const error = event.action.error, { data, dataUpdatedAt } = query.state;
      if (error instanceof ApiError && [401,403,404].includes(error.status) && data !== undefined)
        query.setState({ data: undefined, dataUpdatedAt: 0 });
      if (alive && active() && data !== undefined && Date.now() - dataUpdatedAt < OFFLINE_TTL &&
        error instanceof ApiError && !['INVALID_RESPONSE','CONFIGURATION','SESSION_CHANGED'].includes(error.code) &&
        (error.status === 0 || error.status >= 500 || error.status === 429)) {
        if (error.status === 0) offlineStatus.update({ connected: false });
        offlineStatus.servedCache(dataUpdatedAt);
        // Keep a loaded lookup visible when its background refresh fails. Its
        // original timestamp stays stale; reconnect/focus still revalidates it.
        client.setQueryData(query.queryKey, data, { updatedAt: dataUpdatedAt });
        return;
      }
    }
    if (event.action.type === 'invalidate' || event.action.type === 'error') {
      writes = writes.then(() => alive && active() ? store.removeQuery(scope, hash) : undefined).catch(() => {});
    } else if (event.action.type === 'success' && !query.state.isInvalidated) {
      const snapshot = lookupSnapshot(query.queryKey, query.state.data, query.state.dataUpdatedAt);
      if (snapshot) writes = writes.then(() => alive && active() ? store.cacheQuery(scope, hash, snapshot) : undefined).catch(() => {});
    }
  });
  return () => { alive = false; unsubscribe(); };
}
