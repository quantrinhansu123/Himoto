import { useEffect, useMemo, useRef, useState } from "react";
import { router, usePreventRemove } from "expo-router";
import { uuid } from "expo";
import { useQueryClient } from "@tanstack/react-query";
import type { MobilePaymentInput, MobilePaymentReceipt } from "../../../shared/mobile-finance";
import { useSession } from "@/providers/session";
import { pendingWrites } from "@/lib/pending-writes";
import { ApiError } from "@/lib/api";

export function usePaymentWrite(id: string, dirty: boolean) {
  const { api, session } = useSession(), cache = useQueryClient();
  const [checked, setChecked] = useState(false), [busy, setBusy] = useState(false), [checking, setChecking] = useState(false);
  const [key, setKey] = useState<string | null>(null), [receipt, setReceipt] = useState<MobilePaymentReceipt | null>(null);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [exit, setExit] = useState<(() => void) | null>(null);
  const alive = useRef(true), running = useRef(false), token = useRef(session?.token);
  const operation = `payment.record:${id}`;
  const scope = useMemo(() => api && session ? {
    origin: api.origin, userId: session.user.id,
    storeId: session.user.allStores ? null : session.user.storeId, allStores: session.user.allStores,
  } : null, [api, session]);
  useEffect(() => { token.current = session?.token; }, [session?.token]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const disablePrevention = usePreventRemove(!receipt && (dirty || busy), ({ repeat }) => setExit(() => repeat));
  const current = (value: string | undefined) => alive.current && value === token.current;
  function accept(result: MobilePaymentReceipt) {
    if (result.id !== Number(id)) throw new ApiError("Phiếu thu/chi không khớp hợp đồng. Giữ mã để đối chiếu.", 502, "INVALID_RESPONSE");
    setReceipt(result);
    for (const queryKey of [["finance"], ["record"], ["catalogue"], ["overview"], ["contract-preparation"]])
      void cache.invalidateQueries({ queryKey });
  }
  useEffect(() => {
    let cancelled = false;
    const original = token.current;
    async function recover() {
      if (!api || !scope) return;
      try {
        const previous = await pendingWrites.lookup(scope, operation);
        if (cancelled || !current(original)) return;
        setKey(previous);
        if (!previous) return;
        const found = await api.paymentReceipt(previous);
        if (cancelled || !current(original)) return;
        if (found.receipt) accept(found.receipt);
        else setNotice("Có yêu cầu chưa rõ kết quả. Đối chiếu với máy chủ trước khi sửa hoặc ghi khoản khác.");
      } catch (cause) {
        if (!cancelled && current(original)) setError((cause as Error).message);
      } finally {
        if (!cancelled && current(original)) setChecked(true);
      }
    }
    void recover();
    return () => { cancelled = true; };
    // The keyed screen remounts on authentication, grants, scope or contract changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, scope, operation]);
  async function submit(input: MobilePaymentInput) {
    if (!api || !scope || !checked || running.current || key || receipt) return;
    running.current = true; setBusy(true); setError(""); setNotice("");
    const original = token.current;
    try {
      const pending = await pendingWrites.reserve(scope, operation, () => uuid.v4().toLowerCase());
      if (!current(original)) return;
      setKey(pending);
      const result = await api.recordPayment(id, input, pending);
      if (current(original)) accept(result);
    } catch (cause) {
      if (current(original)) {
        setError((cause as Error).message);
        if (cause instanceof ApiError && (cause.status === 0 || cause.status >= 500))
          for (const queryKey of [["finance"], ["record"], ["catalogue"], ["overview"]]) void cache.invalidateQueries({ queryKey });
      }
    } finally { running.current = false; if (alive.current) setBusy(false); }
  }
  async function resolve() {
    if (!api || !scope || !key || running.current || receipt) return;
    running.current = true; setChecking(true); setError(""); setNotice("");
    const original = token.current, previous = key;
    try {
      const result = await api.resolveWrite(previous, operation);
      if (!current(original)) return;
      if (result.status === "committed") {
        const found = await api.paymentReceipt(previous);
        if (!current(original)) return;
        if (!found.receipt) throw Error("Máy chủ đã ghi nhưng chưa trả được phiếu thu/chi. Giữ mã và kiểm tra lại.");
        accept(found.receipt);
      } else {
        await pendingWrites.complete(scope, operation, previous);
        if (!current(original)) return;
        setKey(null);
        setNotice("Máy chủ xác nhận chưa ghi thu/chi và đã khóa mã cũ. Nội dung đang nhập được giữ để rà soát lại.");
        void cache.invalidateQueries({ queryKey: ["finance"] });
      }
    } catch (cause) { if (current(original)) setError((cause as Error).message); }
    finally { running.current = false; if (alive.current) setChecking(false); }
  }
  async function openReceipt() {
    if (!scope || !receipt || !key || running.current) return;
    running.current = true; setChecking(true); setError("");
    const original = token.current;
    try {
      await pendingWrites.complete(scope, operation, key);
      if (!current(original)) return;
      disablePrevention();
      router.dismissTo({ pathname: "/finance/[id]", params: { id } });
    } catch (cause) { if (current(original)) setError((cause as Error).message); }
    finally { running.current = false; if (alive.current) setChecking(false); }
  }
  return {
    checked, busy, checking, key, receipt, error, notice, exit, submit, resolve, openReceipt,
    dismissExit: () => setExit(null),
    leave: () => { const repeat = exit; disablePrevention(); setExit(null); repeat?.(); },
  };
}
