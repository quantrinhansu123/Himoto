import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { uuid } from 'expo';
import { router } from 'expo-router';
import type { MobileOwnershipTermsInput, MobileOwnershipTermsResult } from '../../../shared/mobile-ownership-terms';
import { useSession } from '@/providers/session';
import { pendingWrites } from '@/lib/pending-writes';

export function useOwnershipTermsWrite(id: string) {
  const { api, session } = useSession(), cache = useQueryClient(), operation = `contract.ownership_terms:${id}`;
  const scope = useMemo(() => api && session ? { origin: api.origin, userId: session.user.id, storeId: session.user.allStores ? null : session.user.storeId, allStores: session.user.allStores } : null, [api, session]);
  const epoch = useRef({ generation: 0 }), running = useRef(false);
  useEffect(() => { const guard = epoch.current; guard.generation++; return () => { guard.generation++; }; }, [api, session]);
  const active = (version: number) => epoch.current.generation === version;
  const [pending, setPending] = useState<string | null>(null), [receipt, setReceipt] = useState<MobileOwnershipTermsResult | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const query = useQuery({ queryKey: ['ownership-terms', api?.origin, session?.user.id, session?.user.storeId, session?.user.allStores, id], retry: false, staleTime: 0, gcTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false,
    enabled: !!api && !!scope, queryFn: async ({ signal }) => {
      const key = await pendingWrites.lookup(scope!, operation);
      if (signal.aborted) throw Error('Đã dừng tải.');
      if (key) {
        const found = await api!.ownershipTermsResult(key, signal);
        if (found.result && found.result.operation !== operation) throw Error('Kết quả sửa không khớp hợp đồng. Giữ mã để đối chiếu.');
        return { key, result: found.result, profile: null, options: null };
      }
      const profile = await api!.ownershipTerms(id, signal); const options = null;
      return { key: null, result: null, profile, options };
    } });
  const key = pending || query.data?.key || null, proof = receipt || query.data?.result || null;
  function invalidate() { for (const queryKey of [['record'], ['catalogue'], ['overview'], ['contract-approval-context'], ['contract-approval'], ['finance'], ['renewal-preparation'], ['return-preparation'], ['contract-history']]) void cache.invalidateQueries({ queryKey }); }
  async function save(input: MobileOwnershipTermsInput) {
    if (!api || !scope || query.isError || key || running.current || !query.data?.profile) return;
    const version = epoch.current.generation; running.current = true; setBusy(true); setError('');
    try {
      const reserved = await pendingWrites.reserveExclusive(scope, operation, [operation], () => uuid.v4().toLowerCase());
      if (!active(version)) return; setPending(reserved.key);
      if (!reserved.created) { const found = await api.ownershipTermsResult(reserved.key); if (found.result && found.result.operation !== operation) throw Error('Kết quả sửa không khớp hợp đồng gốc. Giữ mã để đối chiếu.'); if (active(version)) setReceipt(found.result); return; }
      const found = await api.saveOwnershipTerms(id, input, reserved.key);
      if (active(version)) { setReceipt(found); invalidate(); }
    } catch (cause) { if (active(version)) setError((cause as Error).message); }
    finally { running.current = false; if (active(version)) setBusy(false); }
  }
  async function resolve() {
    if (!api || !scope || !key || running.current) return;
    const version = epoch.current.generation; running.current = true; setBusy(true); setError('');
    try {
      const result = await api.resolveWrite(key, operation); if (!active(version)) return;
      if (result.status === 'committed') {
        const found = await api.ownershipTermsResult(key); if (!active(version)) return;
        if (!found.result || found.result.operation !== operation) throw Error('Chưa tải được kết quả sửa. Giữ mã để đối chiếu.');
        setReceipt(found.result); invalidate();
      } else {
        await pendingWrites.complete(scope, operation, key); if (!active(version)) return;
        setPending(null); setNotice('Lần sửa trước chưa được ghi; mã cũ đã khóa. Nội dung đang nhập được giữ để kiểm tra trước khi lưu lại.'); await query.refetch();
      }
    } catch (cause) { if (active(version)) setError((cause as Error).message); }
    finally { running.current = false; if (active(version)) setBusy(false); }
  }
  async function acknowledge(beforeOpen: () => void) {
    if (!scope || !key || !proof || running.current) return;
    const version = epoch.current.generation; running.current = true; setBusy(true); setError('');
    try { await pendingWrites.complete(scope, operation, key); if (active(version)) { invalidate(); beforeOpen(); router.dismissTo({ pathname: '/record/[kind]/[id]', params: { kind: 'contracts', id } }); } }
    catch (cause) { if (active(version)) setError((cause as Error).message); }
    finally { running.current = false; if (active(version)) setBusy(false); }
  }
  return { query, key, proof, busy, error, notice, save, resolve, acknowledge };
}
