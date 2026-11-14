type OfflineStatus = { connected: boolean; verifying: boolean; cachedAt: number | null; cacheEpoch: number; syncing: boolean; revision: number; error: string };
let state: OfflineStatus = { connected: true, verifying: false, cachedAt: null, cacheEpoch: 0, syncing: false, revision: 0, error: '' };
const listeners = new Set<() => void>();
export const offlineStatus = {
  get: () => state,
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  update(patch: Partial<OfflineStatus>) {
    if (Object.entries(patch).every(([key, value]) => state[key as keyof OfflineStatus] === value)) return;
    state = { ...state, ...patch }; listeners.forEach(listener => listener());
  },
  changed() { this.update({ revision: state.revision + 1 }); },
  servedCache(savedAt: number) { this.update({ cachedAt: savedAt, cacheEpoch: state.cacheEpoch + 1 }); },
};
