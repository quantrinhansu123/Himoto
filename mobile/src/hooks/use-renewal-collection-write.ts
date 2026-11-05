import { useEffect, useMemo, useRef, useState } from "react";
import { uuid } from "expo";
import { router, usePreventRemove } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import type { MobileRenewalCollectionInput, MobileRenewalCollectionReceipt } from "../../../shared/mobile-renewal-collection";
import { pendingWrites } from "@/lib/pending-writes";
import { useSession } from "@/providers/session";

export function useRenewalCollectionWrite(id: string, dirty: boolean) {
  const { api, session } = useSession(), cache = useQueryClient();
  const [checked, setChecked] = useState(false), [busy, setBusy] = useState(false), [checking, setChecking] = useState(false);
  const [key, setKey] = useState<string | null>(null), [receipt, setReceipt] = useState<MobileRenewalCollectionReceipt | null>(null);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [exit, setExit] = useState<(() => void) | null>(null);
  const alive = useRef(true), running = useRef(false), token = useRef(session?.token);
  const operation = `payment.renewal:${id}`;
  const scope = useMemo(() => api && session ? {
    origin: api.origin, userId: session.user.id,
    storeId: session.user.allStores ? null : session.user.storeId, allStores: session.user.allStores,
    // The keyed parent remounts when auth, grants, scope or resource changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  } : null, [api, session?.user.id, session?.user.storeId, session?.user.allStores]);
  useEffect(() => { token.current = session?.token; }, [session?.token]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const disablePrevention = usePreventRemove(!receipt && (dirty || busy || !!key), ({ repeat }) => setExit(() => repeat));
  const current = (at: string | undefined) => alive.current && at === token.current;
  function invalidate() {
    for (const queryKey of [["renewal-collection"], ["renewal-periods"], ["renewal-preparation"], ["renewal-bill"], ["finance"], ["record"], ["catalogue"], ["overview"], ["contract-preparation"]])
      void cache.invalidateQueries({ queryKey });
  }
  function accept(found: MobileRenewalCollectionReceipt) {
    if (found.id !== Number(id)) throw Error("Phiếu thu theo kỳ không khớp hợp đồng. Giữ mã để đối chiếu.");
    setReceipt(found); invalidate();
  }
  useEffect(() => {
    let cancelled = false; const at = token.current;
    async function recover() {
      if (!api || !scope) return;
      try {
        const previous = await pendingWrites.lookup(scope, operation);
        if (cancelled || !current(at)) return;
        setKey(previous);
        if (previous) {
          const found = await api.renewalCollectionReceipt(previous);
          if (cancelled || !current(at)) return;
          if (found.receipt) accept(found.receipt);
          else setNotice("Có khoản thu theo kỳ chưa rõ kết quả. Đối chiếu trước khi sửa hoặc thu tiếp.");
        }
      } catch (cause) { if (!cancelled && current(at)) setError((cause as Error).message); }
      finally { if (!cancelled && current(at)) setChecked(true); }
    }
    void recover(); return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, scope, operation]);
  async function submit(input: MobileRenewalCollectionInput) {
    if (!api || !scope || !checked || running.current || key || receipt) return;
    running.current = true; setBusy(true); setError(""); setNotice(""); const at = token.current;
    try {
      const pending = await pendingWrites.reserve(scope, operation, () => uuid.v4().toLowerCase());
      if (!current(at)) return;
      setKey(pending);
      const saved = await api.recordRenewalCollection(id, input.version, input, pending);
      if (current(at)) accept(saved);
    } catch (cause) { if (current(at)) setError((cause as Error).message); }
    finally { running.current = false; if (alive.current) setBusy(false); }
  }
  async function resolve() {
    if (!api || !scope || !key || running.current || receipt) return;
    running.current = true; setChecking(true); setError(""); setNotice(""); const at = token.current, previous = key;
    try {
      const result = await api.resolveWrite(previous, operation); if (!current(at)) return;
      if (result.status === "committed") {
        const found = await api.renewalCollectionReceipt(previous); if (!current(at)) return;
        if (!found.receipt) throw Error("Máy chủ đã ghi nhưng chưa trả đủ phiếu thu theo kỳ. Giữ mã để kiểm tra lại.");
        accept(found.receipt);
      } else {
        await pendingWrites.complete(scope, operation, previous); if (!current(at)) return;
        setKey(null); setNotice("Máy chủ xác nhận chưa ghi khoản thu theo kỳ và đã khóa mã cũ. Nội dung được giữ để rà soát lại."); invalidate();
      }
    } catch (cause) { if (current(at)) setError((cause as Error).message); }
    finally { running.current = false; if (alive.current) setChecking(false); }
  }
  async function acknowledge() {
    if (!scope || !key || !receipt || running.current) return;
    running.current = true; setChecking(true); setError(""); const at = token.current;
    try {
      await pendingWrites.complete(scope, operation, key); if (!current(at)) return;
      disablePrevention(); router.dismissTo({ pathname: "/finance/[id]", params: { id } });
    } catch (cause) { if (current(at)) setError((cause as Error).message); }
    finally { running.current = false; if (alive.current) setChecking(false); }
  }
  return { checked, busy, checking, key, receipt, error, notice, exit, submit, resolve, acknowledge,
    dismissExit: () => setExit(null), leave: () => { const repeat = exit; disablePrevention(); setExit(null); repeat?.(); } };
}
