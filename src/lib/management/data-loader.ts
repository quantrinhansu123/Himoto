import type { ManagementDataset, ManagementKind, ManagementRepository, ManagementRow } from './types';

export const MANAGEMENT_KINDS: readonly ManagementKind[] = ['staff', 'customers', 'contracts', 'stores', 'vehicles'];
export const CONTRACT_DATA_KINDS: readonly ManagementKind[] = ['stores', 'vehicles'];
export const VEHICLE_DATA_KINDS: readonly ManagementKind[] = ['vehicles'];
const STORE_KINDS: readonly ManagementKind[] = ['stores'];
const PAGE_KINDS: Record<string, readonly ManagementKind[]> = {
  staff: ['stores', 'staff'], customers: STORE_KINDS, contracts: STORE_KINDS,
  stores: STORE_KINDS, vehicles: STORE_KINDS, 'duty-roster': ['stores', 'staff'], cashbook: STORE_KINDS,
  operations: STORE_KINDS, 'staff-sales': STORE_KINDS,
};

export function managementKindsForPath(pathname: string): readonly ManagementKind[] {
  if (pathname.startsWith('/vehicles/transfers')) return STORE_KINDS;
  if (pathname.startsWith('/contracts/types')) return STORE_KINDS;
  if (pathname.startsWith('/contracts/battery')) return ['stores', 'staff'];
  return PAGE_KINDS[pathname.split('/')[1]] || STORE_KINDS;
}

/** Server-side contract list slices so subpages do not download the full table. */
export function contractsQueryForPath(pathname: string): string {
  if (pathname.startsWith('/contracts/drafts')) return 'scope=drafts';
  if (pathname.startsWith('/contracts/vat')) return 'scope=vat';
  if (pathname.startsWith('/contracts/overdue')) return 'scope=overdue';
  if (pathname.startsWith('/contracts/ownership')) return 'scope=ownership';
  return '';
}

export interface ResourceState { loaded: boolean; loading: boolean; error: string; updatedAt: number; revision: number }
export interface ManagementDataState {
  dataset: ManagementDataset;
  resources: Record<ManagementKind, ResourceState>;
}

// Owned by the mounted provider: no customer data is shared across sessions.
export function createManagementDataLoader(repository: Pick<ManagementRepository, 'loadKind'>, now = Date.now, maxAge = 30_000) {
  let state: ManagementDataState = {
    dataset: { staff: [], customers: [], contracts: [], stores: [], vehicles: [] },
    resources: Object.fromEntries(MANAGEMENT_KINDS.map(kind => [kind, { loaded: false, loading: false, error: '', updatedAt: 0, revision: 0 }])) as ManagementDataState['resources'],
  };
  const listeners = new Set<() => void>();
  const pending = new Map<ManagementKind, Promise<void>>();
  const versions = new Map<ManagementKind, number>();
  let contractsQuery = '';
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
    const query = kind === 'contracts' ? contractsQuery : '';
    resource(kind, { loading: true, error: '' });
    const request = Promise.resolve().then(() => repository.loadKind(kind, query)).then(rows => {
      // A read started before a successful edit must not undo that edit.
      if ((versions.get(kind) || 0) !== version) return;
      publish({ dataset: { ...state.dataset, [kind]: rows }, resources: {
        ...state.resources, [kind]: { loaded: true, loading: true, error: '', updatedAt: now(), revision: state.resources[kind].revision + 1 },
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
    setContractsQuery(query: string) {
      if (contractsQuery === query) return;
      contractsQuery = query;
      versions.set('contracts', (versions.get('contracts') || 0) + 1);
      resource('contracts', { updatedAt: 0, loaded: false, error: '', revision: state.resources.contracts.revision + 1 });
    },
    async ensure(kinds: readonly ManagementKind[], force = false) { await Promise.all([...new Set(kinds)].map(kind => load(kind, force))); },
    update(kind: ManagementKind, transform: (rows: ManagementRow[]) => ManagementRow[]) {
      versions.set(kind, (versions.get(kind) || 0) + 1);
      publish({ ...state, dataset: { ...state.dataset, [kind]: transform(state.dataset[kind]) }, resources: {
        // Paged lists may never load this collection. Notify them even when its
        // freshness timestamp is still zero (or two edits occur in one tick).
        ...state.resources, [kind]: { ...state.resources[kind], error: '', revision: state.resources[kind].revision + 1, updatedAt: pending.has(kind) ? 0 : state.resources[kind].updatedAt },
      } });
    },
    invalidate(kinds: readonly ManagementKind[]) {
      for (const kind of kinds) { versions.set(kind, (versions.get(kind) || 0) + 1); resource(kind, { updatedAt: 0, revision: state.resources[kind].revision + 1 }); }
    },
  };
}
