import { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePreventRemove } from 'expo-router';
import { uuid } from 'expo';
import type { MobileWriteReceipt } from '../../../shared/mobile-contract';
import { contractOperationKey, type ContractOperation, type ContractOperationInput } from '../../../shared/mobile-contract-operations';
import { ApiError } from '@/lib/api';
import { pendingWrites } from '@/lib/pending-writes';
import { useSession } from '@/providers/session';

export function useContractOperation(id: string, action: ContractOperation) {
  const { api, session } = useSession(), cache = useQueryClient();
  const scope = useMemo(() => ({
    origin: api!.origin, userId: session!.user.id,
    storeId: session!.user.allStores ? null : session!.user.storeId, allStores: session!.user.allStores,
  }), [api, session]);
  const operation = contractOperationKey(action, id);
  const pendingKey = ['contract-operation-intent', scope, operation];
  const pending = useQuery({ queryKey: pendingKey, queryFn: () => pendingWrites.lookup(scope, operation), retry: false });
  const query = useQuery({
    queryKey: ['contract-operation', scope, action, id],
    queryFn: ({ signal }) => api!.contractOperation(id, action, signal),
    retry: false,
  });
  const [receipt, setReceipt] = useState<MobileWriteReceipt>();
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const running = useRef(false);
  usePreventRemove(busy, () => {});
  const locked = busy || !pending.isSuccess || pending.isFetching || !!pending.data || query.isError || query.isFetching;

  function refresh() {
    for (const key of ['contract-operation', 'record', 'catalogue', 'finance', 'contract-history', 'cashbook', 'cashbook-accounts', 'telegram']) {
      void cache.invalidateQueries({ queryKey: [key] });
    }
  }

  async function clear(key: string) {
    await pendingWrites.complete(scope, operation, key);
    cache.setQueryData(pendingKey, null);
  }

  async function accepted(key: string, result: MobileWriteReceipt) {
    if (String(result.id) !== id) throw Error('Kết quả chưa khớp hợp đồng. Giữ mã để đối chiếu.');
    await clear(key);
    setReceipt(result);
    refresh();
  }

  async function save(input: ContractOperationInput) {
    if (locked || running.current) return;
    running.current = true;
    setBusy(true); setError(''); setNotice('');
    let key: string|undefined;
    try {
      const conflicts = action === 'no_show' || action === 'delete_reservation'
        ? [contractOperationKey('no_show', id), contractOperationKey('delete_reservation', id)] : [operation];
      const intent = await pendingWrites.reserveExclusive(scope, operation, conflicts, () => uuid.v4().toLowerCase());
      if (intent.operation !== operation) throw Error('Còn thao tác chưa rõ kết quả. Vào Tài khoản để đối chiếu trước khi lưu.');
      cache.setQueryData(pendingKey, intent.key);
      if (!intent.created) return;
      key = intent.key;
      await accepted(key, await api!.saveContractOperation(id, action, input, key));
    } catch (cause) {
      if (key && cause instanceof ApiError &&
          ['CONTRACT_OPERATION_REJECTED', 'REQUEST_CANCELLED', 'NOT_FOUND'].includes(cause.code)) {
        await clear(key).catch(() => {});
        refresh();
      }
      setError((cause as Error).message);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  async function resolve() {
    if (!pending.data || running.current) return;
    const key = pending.data;
    running.current = true;
    setBusy(true); setError(''); setNotice('');
    try {
      const found = await api!.resolveWrite(key, operation);
      if (found.status === 'committed') await accepted(key, found.receipt);
      else {
        await clear(key);
        setNotice('Chưa ghi thao tác. Có thể kiểm tra lại và tiếp tục.');
        refresh();
      }
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  return { query, pending, receipt, error, notice, busy, locked, save, resolve, clearReceipt: () => setReceipt(undefined) };
}
