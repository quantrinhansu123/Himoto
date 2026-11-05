import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { uuid } from "expo";
import type { MobileDutyInput } from "../../../shared/mobile-duty-roster";
import { pendingWrites } from "@/lib/pending-writes";
import { useSession } from "@/providers/session";

/** Caller is keyed by actor/token/scope. An uncertain request stays in Account. */
export function useDutyWrite() {
  const { api, session } = useSession(), cache = useQueryClient();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const running = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const scope = useMemo(() => api && session ? { origin: api.origin, userId: session.user.id, storeId: session.user.allStores ? null : session.user.storeId, allStores: session.user.allStores } : null, [api, session]);
  async function save(id: number | null, input: MobileDutyInput | { revision: string }, deleting = false) {
    if (!api || !scope || running.current) return false;
    running.current = true; setBusy(true); setError("");
    try {
      const operation = id === null ? "duty.create" : `duty.${deleting ? "delete" : "update"}:${id}`;
      const conflicts = id === null ? [operation] : [`duty.update:${id}`, `duty.delete:${id}`];
      const intent = await pendingWrites.reserveExclusive(scope, operation, conflicts, () => uuid.v4().toLowerCase());
      if (!alive.current) return false;
      if (!intent.created) throw Error("Ca trực có yêu cầu chưa rõ kết quả. Vào Tài khoản → Thao tác cần đối chiếu trước khi lưu tiếp.");
      await api.saveDuty(id, input, intent.key, deleting);
      if (!alive.current) return false;
      void cache.invalidateQueries({ queryKey: ["duty-roster"] });
      router.push({ pathname: "/duty-result/[key]", params: { key: intent.key } });
      return true;
    } catch (cause) {
      if (alive.current) setError(`${(cause as Error).message} Nếu đã gửi yêu cầu, giữ mã trong Tài khoản để đối chiếu.`);
      return false;
    } finally { running.current = false; if (alive.current) setBusy(false); }
  }
  return { save, busy, error };
}
