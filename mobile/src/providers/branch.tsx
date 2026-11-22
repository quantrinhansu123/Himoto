import { createContext, useContext, useState, type PropsWithChildren } from "react";
import { useSession } from "./session";

interface BranchContextValue {
  selectedStore: string;
  selectStore: (store: string) => void;
}

const BranchContext = createContext<BranchContextValue | null>(null);

export function BranchProvider({ children }: PropsWithChildren) {
  const { session } = useSession();
  const userKey = session
    ? `${session.user.id}:${session.user.storeId ?? ""}:${session.user.allStores}:${session.user.allStoresRead}`
    : "";
  const defaultStore = session?.user.allStores
    ? "all"
    : session?.user.storeId
      ? String(session.user.storeId)
      : "all";
  const [override, setOverride] = useState<{ key: string; store: string } | null>(null);
  const selectedStore = override && override.key === userKey ? override.store : defaultStore;

  const selectStore = (next: string) => {
    if (!session) return;
    const canReadAll = Boolean(session.user.allStores || session.user.allStoresRead);
    if (!canReadAll && session.user.storeId && next !== String(session.user.storeId)) {
      setOverride({ key: userKey, store: String(session.user.storeId) });
      return;
    }
    setOverride({ key: userKey, store: next || defaultStore });
  };

  return (
    <BranchContext.Provider value={{ selectedStore, selectStore }}>
      {children}
    </BranchContext.Provider>
  );
}

export function useGlobalBranch(fallback = "all"): BranchContextValue {
  const ctx = useContext(BranchContext);
  const [local, setLocal] = useState(fallback);
  if (ctx) return ctx;
  return { selectedStore: local, selectStore: setLocal };
}
