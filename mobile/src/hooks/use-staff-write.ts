import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { router, useFocusEffect, usePreventRemove } from "expo-router";
import { uuid } from "expo";
import { useQueryClient } from "@tanstack/react-query";
import { staffWriteOperations, type MobileStaffInput, type MobileStaffCredentials } from "../../../shared/mobile-staff";
import { pendingWrites } from "@/lib/pending-writes";
import { useSession } from "@/providers/session";
export function useStaffWrite(id: string | null, dirty: boolean) {
  const { api, session } = useSession(), cache = useQueryClient();
  const [busy, setBusy] = useState(false), [checking, setChecking] = useState(true), [pending, setPending] = useState(false), [error, setError] = useState("");
  const [issued, setIssued] = useState<{ key: string; value: MobileStaffCredentials } | null>(null);
  const [exit, setExit] = useState<(() => void) | null>(null), running = useRef(false), alive = useRef(true);
  const disable = usePreventRemove(dirty || busy || pending, ({ repeat }) => setExit(() => repeat));
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const scope = useMemo(() => api && session ? { origin: api.origin, userId: session.user.id, storeId: session.user.allStores ? null : session.user.storeId, allStores: session.user.allStores } : null, [api, session]);
  const check = useCallback(async () => {
    if (!scope || running.current) return;
    setChecking(true);
    try {
      const entries = await pendingWrites.list(scope, true), conflicts = id === null ? ["staff.create"] : staffWriteOperations(id);
      if (alive.current) setPending(entries.some(row => conflicts.includes(row.operation)));
    } catch (cause) { if (alive.current) { setPending(true); setError((cause as Error).message); } }
    finally { if (alive.current) setChecking(false); }
  }, [scope, id]);
  useFocusEffect(useCallback(() => { void check(); }, [check]));
  function result(key: string) { disable(); router.replace({ pathname: "/staff-result/[key]", params: { key } }); }
  async function save(input: MobileStaffInput | { revision: string }, deleting = false) {
    if (!api || !scope || running.current || checking || pending) return;
    running.current = true; setBusy(true); setError("");
    try {
      const operation = id === null ? "staff.create" : `staff.${deleting ? "delete" : "update"}:${id}`;
      const intent = await pendingWrites.reserveExclusive(scope, operation, id === null ? [operation] : staffWriteOperations(id), () => uuid.v4().toLowerCase());
      if (!alive.current) return;
      setPending(true);
      if (!intent.created) throw Error("Nhân sự còn yêu cầu chưa rõ kết quả. Mở Tài khoản để đối chiếu trước khi lưu tiếp.");
      const saved = await api.saveStaff(id, input, intent.key, deleting);
      if (!alive.current) return;
      // Keep generated credentials only in this mounted editor's memory. Do not
      // invalidate/refetch its profile until the one-time handoff is closed.
      if (saved.credentials) setIssued({ key: intent.key, value: saved.credentials });
      else { for (const queryKey of [["directory", "staff"], ["staff-profile"], ["duty-roster"], ["draft-staff"],['staff-organization']]) void cache.invalidateQueries({ queryKey }); result(intent.key); }
    } catch (cause) { if (alive.current) setError((cause as Error).message); }
    finally { running.current = false; if (alive.current) setBusy(false); }
  }
  return { save, busy, checking, pending, error, issued, closeIssued: () => { if (!issued) return; const key = issued.key; setIssued(null); result(key); }, exit, cancelExit: () => setExit(null), leave: () => { if (busy) return; const repeat = exit; disable(); setExit(null); repeat?.(); } };
}
