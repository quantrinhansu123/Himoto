import { useEffect, useState, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { useSession } from '@/providers/session';
import { openOfflineStore } from '@/lib/offline-native';
import { offlineScopeKey } from '@/lib/offline-policy';
import { offlineStatus } from '@/lib/offline-status';
import type { OfflineWrite } from '@/lib/offline-store';

export function useOffline() {
  const { session, api } = useSession();
  const status = useSyncExternalStore(offlineStatus.subscribe, offlineStatus.get, offlineStatus.get);
  const scope = session && api ? offlineScopeKey({ origin: api.origin, user: session.user }) : '';
  const [entries, setEntries] = useState<{scope: string; rows: OfflineWrite[]}>({ scope: '', rows: [] });
  useEffect(() => {
    if (!scope || Platform.OS === 'web') return;
    let alive = true;
    const [origin, userId] = JSON.parse(scope) as [string, number];
    void openOfflineStore().then(store => store.listActor(origin, userId)).then(rows => {
      if (alive) setEntries({ scope, rows });
    }).catch(error => { if (alive) offlineStatus.update({ error: (error as Error).message }); });
    return () => { alive = false; };
  }, [scope, status.revision]);
  const rows = entries.scope === scope ? entries.rows : [];
  return { ...status, scope, rows, pending: rows.filter(row => row.state !== 'committed').length, conflicts: rows.filter(row => row.state === 'conflict').length };
}
