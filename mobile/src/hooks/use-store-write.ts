import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { router, useFocusEffect, usePreventRemove } from "expo-router";
import { uuid } from "expo";
import { useQueryClient } from "@tanstack/react-query";
import { storeWriteOperations, type StoreCreation, type StoreEdits } from "../../../shared/mobile-stores";
import { pendingWrites } from "@/lib/pending-writes";
import { useSession } from "@/providers/session";

export function useStoreWrite(id: string | null, dirty: boolean) {
  const { api, session } = useSession(), cache = useQueryClient();
  const [busy, setBusy] = useState(false), [checking, setChecking] = useState(true), [pending, setPending] = useState(false), [error, setError] = useState("");
  const [exit, setExit] = useState<(() => void) | null>(null), running = useRef(false), alive = useRef(true);
  const disable = usePreventRemove(dirty || busy || pending, ({ repeat }) => setExit(() => repeat));
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const scope = useMemo(() => api && session ? { origin: api.origin, userId: session.user.id, storeId: session.user.allStores ? null : session.user.storeId, allStores: session.user.allStores } : null, [api, session]);
  const check = useCallback(async () => {
    if (!scope || running.current) return;
    setChecking(true);
    try {
      const entries = await pendingWrites.list(scope, true), conflicts = id === null ? ["store.create"] : storeWriteOperations(id);
      if (alive.current) setPending(entries.some(row => conflicts.includes(row.operation)));
    } catch (cause) { if (alive.current) { setPending(true); setError((cause as Error).message); } }
    finally { if (alive.current) setChecking(false); }
  }, [scope, id]);
  useFocusEffect(useCallback(() => { void check(); }, [check]));
  async function save(input: StoreCreation | StoreEdits | { revision: string }, deleting = false) {
    if (!api || !scope || running.current || checking || pending) return;
    running.current = true; setBusy(true); setError("");
    try {
      const operation = id === null ? "store.create" : `store.${deleting ? "delete" : "update"}:${id}`;
      const intent = await pendingWrites.reserveExclusive(scope, operation, id === null ? [operation] : storeWriteOperations(id), () => uuid.v4().toLowerCase());
      if (!alive.current) return;
      setPending(true);
      if (!intent.created) throw Error("Cơ sở còn yêu cầu chưa rõ kết quả. Mở Tài khoản để đối chiếu trước khi lưu tiếp.");
      await api.saveStore(id, input, intent.key, deleting);
      if (!alive.current) return;
      for (const queryKey of [["directory", "stores"], ["store-profile"], ["store-result"], ["workspace"], ["overview"],['staff-organization'],['store-contracts']]) void cache.invalidateQueries({ queryKey });
      disable(); router.replace({ pathname: "/store-result/[key]", params: { key: intent.key } });
    } catch (cause) { if (alive.current) setError((cause as Error).message); }
    finally { running.current = false; if (alive.current) setBusy(false); }
  }
  return { save, busy, checking, pending, error, exit, cancelExit: () => setExit(null), leave: () => { if (busy) return; const repeat = exit; disable(); setExit(null); repeat?.(); } };
}
