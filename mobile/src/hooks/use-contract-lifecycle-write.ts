import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { uuid } from 'expo';
import { router } from 'expo-router';
import { mobileLifecycleActions, type MobileLifecycleInput, type MobileLifecycleResult } from '../../../shared/mobile-contract-lifecycle';
import { useSession } from '@/providers/session';
import { pendingWrites } from '@/lib/pending-writes';

export function useContractLifecycleWrite(id: string) {
  const { api, session } = useSession(), cache = useQueryClient();
  const operations = useMemo(() => mobileLifecycleActions.map(a => `lifecycle.${a}:${id}`), [id]);
  const scope = useMemo(() => api && session ? { origin: api.origin, userId: session.user.id, storeId: session.user.allStores ? null : session.user.storeId, allStores: session.user.allStores } : null, [api, session]);
  const epoch = useRef({ generation: 0 }), running = useRef(false);
  useEffect(() => { const guard = epoch.current; guard.generation++; return () => { guard.generation++; }; }, [api, session]);
  const active = (version: number) => epoch.current.generation === version;
  const [pending, setPending] = useState<{ key: string; operation: string } | null>(null), [receipt, setReceipt] = useState<MobileLifecycleResult | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const query = useQuery({ queryKey: ['contract-lifecycle', api?.origin, session?.user.id, session?.user.storeId, session?.user.allStores, id], retry: false, staleTime: 0, gcTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false,
    enabled: !!api && !!scope, queryFn: async ({ signal }) => {
      const entries = (await pendingWrites.list(scope!, true)).filter(e => operations.includes(e.operation));
      if (signal.aborted) throw Error('Đã dừng tải.');
      if (entries.length > 1) throw Error('Có nhiều thao tác trạng thái chưa đối chiếu. Vào Tài khoản để xử lý từng mã.');
      const entry = entries[0] || null;
      if (entry) {
        const found = await api!.lifecycleResult(entry.key, signal);
        if (found.result && found.result.operation !== entry.operation) throw Error('Kết quả không khớp thao tác tình trạng hợp đồng. Giữ mã để đối chiếu.');
        return { entry, result: found.result, context: null };
      }
      return { entry: null, result: null, context: await api!.contractLifecycle(id, signal) };
    } });
  const entry = pending || query.data?.entry || null, proof = receipt || query.data?.result || null;
  function invalidate() { for (const queryKey of [['record'], ['catalogue'], ['overview'], ['finance'], ['renewal-preparation'], ['return-preparation'], ['vehicle']]) void cache.invalidateQueries({ queryKey }); }
  async function save(input: MobileLifecycleInput) {
    if (!api || !scope || query.isError || entry || running.current || !query.data?.context) return;
    const version = epoch.current.generation; running.current = true; setBusy(true); setError('');
    try {
      const reserved = await pendingWrites.reserveExclusive(scope, `lifecycle.${input.action}:${id}`, operations, () => uuid.v4().toLowerCase());
      if (!active(version)) return; setPending({ key: reserved.key, operation: reserved.operation });
      if (!reserved.created) { const found = await api.lifecycleResult(reserved.key); if (found.result && found.result.operation !== reserved.operation) throw Error('Kết quả không khớp thao tác gốc. Giữ mã để đối chiếu.'); if (active(version)) setReceipt(found.result); return; }
      const found = await api.saveContractLifecycle(id, input, reserved.key);
      if (active(version)) { setReceipt(found); invalidate(); }
    } catch (cause) { if (active(version)) setError((cause as Error).message); }
    finally { running.current = false; if (active(version)) setBusy(false); }
  }
  async function resolve() {
    if (!api || !scope || !entry || running.current) return;
    const version = epoch.current.generation; running.current = true; setBusy(true); setError('');
    try {
      const result = await api.resolveWrite(entry.key, entry.operation); if (!active(version)) return;
      if (result.status === 'committed') {
        const found = await api.lifecycleResult(entry.key); if (!active(version)) return;
        if (!found.result || found.result.operation !== entry.operation) throw Error('Chưa tải được kết quả gốc. Giữ mã để đối chiếu.');
        setReceipt(found.result); invalidate();
      } else {
        await pendingWrites.complete(scope, entry.operation, entry.key); if (!active(version)) return;
        setPending(null); setNotice('Thao tác chưa được ghi; mã cũ đã khóa. Kiểm tra tình trạng mới nhất trước khi tiếp tục.'); await query.refetch();
      }
    } catch (cause) { if (active(version)) setError((cause as Error).message); }
    finally { running.current = false; if (active(version)) setBusy(false); }
  }
  async function acknowledge(beforeOpen: () => void) {
    if (!scope || !entry || !proof || running.current) return;
    const version = epoch.current.generation; running.current = true; setBusy(true); setError('');
    try { await pendingWrites.complete(scope, entry.operation, entry.key); if (active(version)) { invalidate(); beforeOpen(); router.dismissTo({ pathname: '/record/[kind]/[id]', params: { kind: 'contracts', id } }); } }
    catch (cause) { if (active(version)) setError((cause as Error).message); }
    finally { running.current = false; if (active(version)) setBusy(false); }
  }
  return { query, entry, proof, busy, error, notice, save, resolve, acknowledge };
}
