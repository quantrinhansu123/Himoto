import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { uuid } from 'expo';
import { router } from 'expo-router';
import type { MobileCustomerImportInput, MobileImportReceipt } from '../../../shared/mobile-customer-import';
import { useSession } from '@/providers/session';
import { pendingWrites } from '@/lib/pending-writes';
export function useCustomerImportWrite(batchId: string | null) {
  const { api, session } = useSession(), cache = useQueryClient(), operation = batchId ? `import.customers:${batchId}` : null;
  const scope = useMemo(() => api && session ? { origin: api.origin, userId: session.user.id, storeId: session.user.allStores ? null : session.user.storeId, allStores: session.user.allStores } : null, [api, session]);
  const epoch = useRef(0), running = useRef(false), [pending, setPending] = useState<string | null>(null), [receipt, setReceipt] = useState<MobileImportReceipt | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  useEffect(() => { const version = ++epoch.current; return () => { epoch.current = version + 1; }; }, [api, session, batchId]);
  const query = useQuery({ queryKey: ['customer-import-request', api?.origin, session?.user.id, session?.user.storeId, session?.user.allStores, batchId], enabled: !!api && !!scope && !!operation, gcTime: 0, retry: false, staleTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false,
    queryFn: async ({ signal }) => { const key = await pendingWrites.lookup(scope!, operation!); if (signal.aborted) throw Error('Đã dừng tải.'); const result = key ? (await api!.importResult(key, signal)).receipt : null; if (result && (result.operation !== operation || result.actorId !== scope!.userId || result.key !== key)) throw Error('Kết quả nhập không khớp mã gốc.'); return { key, receipt: result }; } });
  const key = pending || query.data?.key || null, proof = receipt || query.data?.receipt || null;
  function invalidate() { for (const queryKey of [['catalogue'], ['overview'], ['customer-matches'], ['record']]) void cache.invalidateQueries({ queryKey }); }
  async function save(input: MobileCustomerImportInput) {
    if (!api || !scope || !operation || !batchId || key || query.isPending || query.isError || running.current) return;
    const version = epoch.current; running.current = true; setBusy(true); setError('');
    try {
      const previous = (await pendingWrites.list(scope, true)).filter(p => p.operation.startsWith('import.')).map(p => p.operation), conflicts = [...new Set([operation, ...previous])];
      const intent = await pendingWrites.reserveExclusive(scope, operation, conflicts, () => uuid.v4().toLowerCase());
      if (intent.operation !== operation) throw Error('Còn lần nhập Excel chưa được đối chiếu. Mở Tài khoản để xử lý mã gốc trước.');
      if (epoch.current !== version) return; setPending(intent.key);
      const result = intent.created ? await api.importCustomers(batchId, input, intent.key) : (await api.importResult(intent.key)).receipt;
      if (result && (result.operation !== operation || result.actorId !== scope.userId || result.key !== intent.key)) throw Error('Kết quả nhập không khớp lần gửi gốc.');
      if (epoch.current === version) { setReceipt(result); if (result) invalidate(); }
    } catch (cause) { if (epoch.current === version) setError((cause as Error).message); }
    finally { running.current = false; if (epoch.current === version) setBusy(false); }
  }
  async function resolve() {
    if (!api || !scope || !operation || !key || running.current) return;
    const version = epoch.current; running.current = true; setBusy(true); setError('');
    try {
      const result = await api.resolveWrite(key, operation); if (epoch.current !== version) return;
      if (result.status === 'committed') {
        const found = (await api.importResult(key)).receipt; if (!found || found.operation !== operation || found.actorId !== scope.userId || found.key !== key) throw Error('Chưa tải được kết quả nhập. Giữ mã để đối chiếu.');
        if (epoch.current === version) { setReceipt(found); invalidate(); }
      } else {
        await pendingWrites.complete(scope, operation, key); if (epoch.current !== version) return;
        setPending(null); setNotice('Lần nhập trước chưa được ghi; mã cũ đã khóa. Kiểm tra lại dữ liệu trước khi nhập tiếp.'); await query.refetch(); return 'cancelled' as const;
      }
    } catch (cause) { if (epoch.current === version) setError((cause as Error).message); }
    finally { running.current = false; if (epoch.current === version) setBusy(false); }
  }
  async function acknowledge(beforeOpen: () => void) {
    if (!scope || !operation || !key || !proof || running.current) return;
    const version = epoch.current; running.current = true; setBusy(true); setError('');
    try { await pendingWrites.complete(scope, operation, key); if (epoch.current === version) { invalidate(); beforeOpen(); router.dismissTo('/(tabs)/customers'); } }
    catch (cause) { if (epoch.current === version) setError((cause as Error).message); }
    finally { running.current = false; if (epoch.current === version) setBusy(false); }
  }
  return { key, proof, busy, error, notice, query, save, resolve, acknowledge };
}
