import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { router, useFocusEffect, usePreventRemove } from "expo-router";
import { uuid } from "expo";
import { useQueryClient } from "@tanstack/react-query";
import { cashbookAccountOperations, type CashbookAccountKind, type CashbookAccountInput } from "../../../shared/mobile-cashbook";
import { pendingWrites } from "@/lib/pending-writes";
import { useSession } from "@/providers/session";
export function useCashbookAccountWrite(kind: CashbookAccountKind, id: string | null, dirty: boolean) {
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
      const entries = await pendingWrites.list(scope, true), conflicts = id === null ? [`${kind}.create`] : cashbookAccountOperations(kind, id);
      if (alive.current) setPending(entries.some(row => conflicts.includes(row.operation)));
    } catch (cause) { if (alive.current) { setPending(true); setError((cause as Error).message); } }
    finally { if (alive.current) setChecking(false); }
  }, [scope, kind, id]);
  useFocusEffect(useCallback(() => { void check(); }, [check]));
  async function save(input: CashbookAccountInput | { revision: string; status?: string }, action: "create" | "update" | "status" | "delete") {
    if (!api || !scope || running.current || checking || pending) return;
    running.current = true; setBusy(true); setError("");
    try {
      const operation = id === null ? `${kind}.create` : `${kind}.${action}:${id}`;
      const intent = await pendingWrites.reserveExclusive(scope, operation, id === null ? [operation] : cashbookAccountOperations(kind, id), () => uuid.v4().toLowerCase());
      if (!alive.current) return;
      setPending(true);
      if (!intent.created) throw Error("Tài khoản còn yêu cầu chưa rõ kết quả. Mở Tài khoản → Thao tác cần đối chiếu trước khi lưu tiếp.");
      await api.saveCashbookAccount(kind, id, input, intent.key, action);
      if (!alive.current) return;
      for (const queryKey of [["cashbook-accounts"], ["cashbook-account"], ["cashbook"], ["finance"]]) void cache.invalidateQueries({ queryKey });
      disable(); router.replace({ pathname: "/cashbook-account-result/[key]", params: { key: intent.key } });
    } catch (cause) { if (alive.current) setError((cause as Error).message); }
    finally { running.current = false; if (alive.current) setBusy(false); }
  }
  return { save, busy, checking, pending, error, exit, cancelExit: () => setExit(null), leave: () => { if (busy) return; const repeat = exit; disable(); setExit(null); repeat?.(); } };
}
