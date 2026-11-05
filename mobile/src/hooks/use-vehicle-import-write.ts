import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { uuid } from 'expo';
import type { MobileVehicleImportInput, MobileVehicleImportMode, MobileVehicleImportReceipt } from '../../../shared/mobile-vehicle-import';
import { useSession } from '@/providers/session';
import { pendingWrites } from '@/lib/pending-writes';

export function useVehicleImportWrite(mode: MobileVehicleImportMode, batch: string) {
  const { api, session } = useSession(), cache = useQueryClient();
  const scope = useMemo(() => ({ origin: api!.origin, userId: session!.user.id, storeId: session!.user.allStores ? null : session!.user.storeId, allStores: session!.user.allStores }), [api, session]);
  const [pending, setPending] = useState<{ key: string; operation: string } | null>(null), [receipt, setReceipt] = useState<MobileVehicleImportReceipt | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const running = useRef(false), epoch = useRef(0);
  useEffect(() => { const version = ++epoch.current; return () => { epoch.current = version + 1; }; }, [api, session, mode, batch]);
  function checked(value: MobileVehicleImportReceipt | null, key: string, operation: string) { if (value && (value.key !== key || value.operation !== operation || value.actorId !== scope.userId)) throw Error('Xác nhận Excel xe không khớp mã gốc. Giữ mã để đối chiếu.'); return value; }
  const query = useQuery({ queryKey: ['vehicle-import-pending', scope, mode, batch], gcTime: 0, retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false,
    queryFn: async ({ signal }) => {
      const previous = (await pendingWrites.list(scope, true)).filter(p => p.operation.startsWith('vimport.'));
      if (previous.length > 1) throw Error('Có nhiều mã Excel xe cần đối chiếu. Mở Tài khoản để xử lý từng mã gốc.');
      const entry = previous[0] || null, result = entry ? (await api!.vehicleImportResult(entry.key, signal)).receipt : null;
      return { entry, receipt: entry ? checked(result, entry.key, entry.operation) : null };
    } });
  const entry = pending || query.data?.entry || null, proof = receipt || query.data?.receipt || null;
  function invalidate() { for (const queryKey of [['catalogue'], ['overview'], ['vehicle-profile'], ['vehicle-history'], ['record'], ['workspace'], ['directory', 'stores'], ['vehicle-import'], ['vehicle-reset']]) void cache.invalidateQueries({ queryKey }); }
  async function save(input: MobileVehicleImportInput | { revision: string; confirmation: string }) {
    if (!api || running.current || entry || query.isPending || query.isError || ('rows' in input ? input.mode !== mode : mode !== 'reset')) return;
    const version = epoch.current, operation = `vimport.${mode}:${batch}`; running.current = true; setBusy(true); setError('');
    try {
      const previous = (await pendingWrites.list(scope, true)).filter(p => p.operation.startsWith('vimport.')).map(p => p.operation);
      const intent = await pendingWrites.reserveExclusive(scope, operation, [...new Set([operation, ...previous])], () => uuid.v4().toLowerCase());
      if (epoch.current !== version) return; setPending({ key: intent.key, operation: intent.operation });
      const result = intent.created ? 'rows' in input ? await api.saveVehicleImport(batch, input, intent.key) : await api.resetVehicles(batch, input, intent.key) : (await api.vehicleImportResult(intent.key)).receipt;
      const found = checked(result, intent.key, intent.operation); if (epoch.current === version) { setReceipt(found); if (found) invalidate(); }
    } catch (cause) { if (epoch.current === version) setError((cause as Error).message); }
    finally { running.current = false; if (epoch.current === version) setBusy(false); }
  }
  async function resolve() {
    if (!api || !entry || running.current) return;
    const version = epoch.current; running.current = true; setBusy(true); setError('');
    try {
      const result = await api.resolveVehicleImport(entry.key, entry.operation); if (epoch.current !== version) return;
      if (result.status === 'committed') { const found = checked(result.receipt, entry.key, entry.operation); setReceipt(found); invalidate(); }
      else { await pendingWrites.complete(scope, entry.operation, entry.key); if (epoch.current !== version) return; setPending(null); setReceipt(null); setNotice('Thao tác chưa được ghi; mã cũ đã khóa. Kiểm tra lại dữ liệu xe trước khi tiếp tục.'); await query.refetch(); return 'cancelled' as const; }
    } catch (cause) { if (epoch.current === version) setError((cause as Error).message); }
    finally { running.current = false; if (epoch.current === version) setBusy(false); }
  }
  async function acknowledge(beforeOpen: () => void) {
    if (!entry || !proof || running.current) return;
    const version = epoch.current; running.current = true; setBusy(true); setError('');
    try { const owner = await pendingWrites.entryScope(scope, entry.operation, entry.key); if (owner) await pendingWrites.complete(owner, entry.operation, entry.key); if (epoch.current === version) { invalidate(); beforeOpen(); router.dismissTo('/(tabs)/vehicles'); } }
    catch (cause) { if (epoch.current === version) setError((cause as Error).message); }
    finally { running.current = false; if (epoch.current === version) setBusy(false); }
  }
  return { entry, proof, busy, error, notice, query, save, resolve, acknowledge };
}
