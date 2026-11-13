import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { router, useFocusEffect, usePreventRemove } from "expo-router";
import { uuid } from "expo";
import { useQueryClient } from "@tanstack/react-query";
import type { MobileVehicleInput } from "../../../shared/mobile-vehicles";
import { vehicleProfileOperations } from "../../../shared/mobile-vehicles";
import { pendingWrites } from "@/lib/pending-writes";
import { useSession } from "@/providers/session";
import {guardStagedPhotos,linkStagedPhotos,bindStagedPhotos} from '@/lib/staged-photo-work';

export function useVehicleProfileWrite(id: string | null, dirty: boolean) {
  const { api, session } = useSession(), cache = useQueryClient();
  const [busy, setBusy] = useState(false), [checking, setChecking] = useState(true), [error, setError] = useState("");
  const [pending, setPending] = useState(false), [exit, setExit] = useState<(() => void) | null>(null);
  const running = useRef(false), alive = useRef(true);
  const disable = usePreventRemove(dirty || busy || pending, ({ repeat }) => setExit(() => repeat));
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const scope = useMemo(() => api && session ? { origin: api.origin, userId: session.user.id, storeId: session.user.allStores ? null : session.user.storeId, allStores: session.user.allStores } : null, [api, session]);
  const operation = id === null ? "vehicle.create" : `vehicle.update:${id}`;
  const check = useCallback(async () => {
    if (!scope || running.current) return;
    setChecking(true);
    try {
      if(id===null)await guardStagedPhotos(scope);
      const entries = await pendingWrites.list(scope, true), conflicts = id === null ? ["vehicle.create"] : vehicleProfileOperations(id);
      if (alive.current) setPending(entries.some(row => conflicts.includes(row.operation)));
    } catch (cause) { if (alive.current) { setPending(true); setError((cause as Error).message); } }
    finally { if (alive.current) setChecking(false); }
  }, [scope, id]);
  useFocusEffect(useCallback(() => { void check(); }, [check]));
  async function save(input: MobileVehicleInput) {
    if (!api || !scope || running.current || checking || pending) return;
    running.current = true; setBusy(true); setError("");
    try {
      if(id===null)await guardStagedPhotos(scope);
      const reserved = await pendingWrites.reserveExclusive(scope, operation, id === null ? [operation] : vehicleProfileOperations(id), () => uuid.v4().toLowerCase());
      if (!alive.current) return;
      setPending(true);
      if (!reserved.created) throw Error("Xe còn yêu cầu chưa rõ kết quả. Vào Tài khoản để đối chiếu trước khi lưu tiếp.");
      if(id===null)await linkStagedPhotos(scope,reserved.key);
      const receipt=await api.saveVehicle(id, input, reserved.key);
      if(id===null)await bindStagedPhotos(scope,receipt.id,reserved.key);
      if (!alive.current) return;
      for (const queryKey of [["catalogue"], ["overview"], ["record"], ["vehicle-profile"], ["vehicle-history"], ["transfer-history"]]) void cache.invalidateQueries({ queryKey });
      disable(); router.replace({ pathname: "/vehicle-result/[key]", params: { key: reserved.key } });
    } catch (cause) { if (alive.current) setError((cause as Error).message); }
    finally { running.current = false; if (alive.current) setBusy(false); }
  }
  return { busy, checking, pending, error, save, exit, cancelExit: () => setExit(null), leave: () => { if (busy) return; const repeat = exit; disable(); setExit(null); repeat?.(); } };
}
