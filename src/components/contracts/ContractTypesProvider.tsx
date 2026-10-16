'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { contractTypeRequest, type ContractType } from '@/lib/management/contract-types';

interface Catalog {
  types: ContractType[]; loaded: boolean; loading: boolean; error: string; canManage: boolean;
  load: (force?: boolean) => Promise<void>;
  save: (method: string, input: unknown) => Promise<ContractType[]>;
}
const Context = createContext<Catalog | null>(null);
export function ContractTypesProvider({ children, canManage }: { children: ReactNode; canManage: boolean }) {
  const [types, setTypes] = useState<ContractType[]>([]), [loading, setLoading] = useState(false), [loaded, setLoaded] = useState(false), [error, setError] = useState('');
  const pending = useRef<Promise<void> | null>(null), loadedRef = useRef(false);
  const load = useCallback((force = false): Promise<void> => {
    if (pending.current) return pending.current;
    if (loadedRef.current && !force) return Promise.resolve();
    setLoading(true); setError('');
    pending.current = contractTypeRequest().then(data => { setTypes(data); loadedRef.current = true; setLoaded(true); })
      .catch(cause => { setError(cause instanceof Error ? cause.message : 'Không tải được loại hợp đồng.'); })
      .finally(() => { pending.current = null; setLoading(false); });
    return pending.current;
  }, []);
  async function save(method: string, input: unknown) {
    if (pending.current) await pending.current;
    const data = await contractTypeRequest(method, input);
    setTypes(data); loadedRef.current = true; setLoaded(true); setError('');
    return data;
  }
  return <Context.Provider value={{types,loading,loaded,error,canManage,load,save}}>{children}</Context.Provider>;
}
export function useContractTypes(enabled = true) {
  const catalog = useContext(Context);
  if (!catalog) throw new Error('ContractTypesProvider is required.');
  const { load } = catalog;
  useEffect(() => { if (enabled) void load(); }, [enabled, load]);
  return catalog;
}
