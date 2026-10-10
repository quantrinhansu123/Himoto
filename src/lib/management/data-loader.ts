import type { ManagementDataset, ManagementKind, ManagementRepository, ManagementRow } from './types';

export const MANAGEMENT_KINDS: readonly ManagementKind[] = ['staff', 'customers', 'contracts', 'stores', 'vehicles'];
export const CONTRACT_DATA_KINDS: readonly ManagementKind[] = ['stores', 'customers', 'vehicles'];
export const VEHICLE_DATA_KINDS: readonly ManagementKind[] = ['vehicles'];
const STORE_KINDS: readonly ManagementKind[] = ['stores'];
const PAGE_KINDS: Record<string, readonly ManagementKind[]> = {
  staff: ['stores', 'staff'], customers: ['stores', 'customers'], contracts: ['stores', 'contracts'],
  stores: STORE_KINDS, vehicles: ['stores', 'vehicles'], 'duty-roster': ['stores', 'staff'], cashbook: STORE_KINDS,
};

export function managementKindsForPath(pathname: string): readonly ManagementKind[] {
  return PAGE_KINDS[pathname.split('/')[1]] || STORE_KINDS;
}

export interface ResourceState { loaded: boolean; loading: boolean; error: string; updatedAt: number }
export interface ManagementDataState {
  dataset: ManagementDataset;
  resources: Record<ManagementKind, ResourceState>;
}

// Owned by the mounted provider: no customer data is shared across sessions.
export function createManagementDataLoader(repository: Pick<ManagementRepository, 'loadKind'>, now = Date.now, maxAge = 30_000) {
  let state: ManagementDataState = {
    dataset: { staff: [], customers: [], contracts: [], stores: [], vehicles: [] },
    resources: Object.fromEntries(MANAGEMENT_KINDS.map(kind => [kind, { loaded: false, loading: false, error: '', updatedAt: 0 }])) as ManagementDataState['resources'],
  };
  const listeners = new Set<() => void>();
  const pending = new Map<ManagementKind, Promise<void>>();
  const versions = new Map<ManagementKind, number>();
  function publish(next: ManagementDataState) { state = next; listeners.forEach(listener => listener()); }
  function resource(kind: ManagementKind, changes: Partial<ResourceState>) {
    publish({ ...state, resources: { ...state.resources, [kind]: { ...state.resources[kind], ...changes } } });
  }
  function load(kind: ManagementKind, force: boolean): Promise<void> {
    const existing = pending.get(kind);
    if (existing) return existing;
    const current = state.resources[kind];
    if (!force && current.loaded && !current.error && current.updatedAt > 0 && now() - current.updatedAt < maxAge) return Promise.resolve();
    const version = versions.get(kind) || 0;
    resource(kind, { loading: true, error: '' });
    const request = Promise.resolve().then(() => repository.loadKind(kind)).then(rows => {
      // A read started before a successful edit must not undo that edit.
      if ((versions.get(kind) || 0) !== version) return;
      publish({ dataset: { ...state.dataset, [kind]: rows }, resources: {
        ...state.resources, [kind]: { loaded: true, loading: true, error: '', updatedAt: now() },
      } });
    }).catch(cause => {
      resource(kind, { error: cause instanceof Error ? cause.message : 'Không tải được dữ liệu. Vui lòng thử lại.' });
      throw cause;
    }).finally(() => { pending.delete(kind); resource(kind, { loading: false }); });
    pending.set(kind, request);
    return request;
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async ensure(kinds: readonly ManagementKind[], force = false) { await Promise.all([...new Set(kinds)].map(kind => load(kind, force))); },
    update(kind: ManagementKind, transform: (rows: ManagementRow[]) => ManagementRow[]) {
      versions.set(kind, (versions.get(kind) || 0) + 1);
      publish({ ...state, dataset: { ...state.dataset, [kind]: transform(state.dataset[kind]) }, resources: {
        ...state.resources, [kind]: { ...state.resources[kind], error: '', updatedAt: pending.has(kind) ? 0 : state.resources[kind].updatedAt },
      } });
    },
    invalidate(kinds: readonly ManagementKind[]) {
      for (const kind of kinds) { versions.set(kind, (versions.get(kind) || 0) + 1); resource(kind, { updatedAt: 0 }); }
    },
  };
}
