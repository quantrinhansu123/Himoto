import { useEffect, useMemo, useRef, useState } from "react";
import { router, usePreventRemove } from "expo-router";
import { uuid } from "expo";
import { useQueryClient } from "@tanstack/react-query";
import type {
  MobileContractAction,
  MobileContractIssueInput,
  MobileWriteReceipt,
} from "@himoto/mobile-contract";
import { useSession } from "@/providers/session";
import { pendingWrites } from "@/lib/pending-writes";
import { ApiError } from "@/lib/api";

export function useContractAction(id: string, dirty: boolean) {
  const { api, session } = useSession(),
    cache = useQueryClient();
  const [busy, setBusy] = useState(false),
    [checking, setChecking] = useState(false),
    [checked, setChecked] = useState(false),
    [saved, setSaved] = useState(false);
  const [error, setError] = useState(""),
    [code, setCode] = useState(""),
    [fields, setFields] = useState<Record<string, string>>({});
  const [receipt, setReceipt] = useState<{
    value: MobileWriteReceipt;
    operation: string;
    key: string;
  } | null>(null);
  const [exit, setExit] = useState<(() => void) | null>(null);
  const alive = useRef(true),
    running = useRef(false),
    token = useRef(session?.token);
  useEffect(() => {
    token.current = session?.token;
  }, [session?.token]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const scope = useMemo(
    () =>
      api && session
        ? {
            origin: api.origin,
            userId: session.user.id,
            storeId: session.user.allStores ? null : session.user.storeId,
            allStores: session.user.allStores,
          }
        : null,
    [api, session],
  );
  const disablePrevention = usePreventRemove(
    !saved && (dirty || busy),
    ({ repeat }) => setExit(() => repeat),
  );
  async function findPrevious(cancelled: () => boolean = () => false) {
    if (!api || !scope) return;
    const current = session?.token;
    if(current!==token.current||!alive.current)return;
    let hasPendingKey=false;
    for (const action of ["finalize", "handover"] as const) {
      const operation = `contract.${action}:${id}`,
        key = await pendingWrites.lookup(scope, operation);
      if (cancelled() || !alive.current || current !== token.current) return;
      if (!key) continue;
      hasPendingKey=true;
      const found = await api.contractReceipt(key);
      if (cancelled() || !alive.current || current !== token.current) return;
      if (found.receipt) {
        if (found.receipt.id !== Number(id))
          throw new ApiError(
            "Kết quả xác nhận không khớp hợp đồng. Cần đối chiếu trước khi tiếp tục.",
            502,
            "INVALID_RESPONSE",
          );
        setReceipt({ value: found.receipt, operation, key });
        return true;
      }
    }
    return hasPendingKey ? false : null;
  }
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve()
      .then(() => findPrevious(() => cancelled))
      .catch(() => {
        if (!cancelled)
          setError(
            "Chưa kiểm tra được kết quả lần xác nhận trước. Kiểm tra lại trước khi tiếp tục.",
          );
      })
      .finally(() => {
        if (!cancelled) setChecked(true);
      });
    return () => {
      cancelled = true;
    };
    // Only authentication/scope changes should restart recovery.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, scope, id]);
  function open(value: MobileWriteReceipt) {
    setSaved(true);
    disablePrevention();
    for (const queryKey of [
      ["catalogue"],
      ["record"],
      ["overview"],
      ["draft-edit"],
      ["contract-preparation"],
    ])
      void cache.invalidateQueries({ queryKey });
    router.dismissTo({
      pathname: "/record/[kind]/[id]",
      params: { kind: "contracts", id: String(value.id) },
    });
  }
  async function submit(
    action: MobileContractAction,
    input: MobileContractIssueInput | { revision: string },
  ) {
    if (!api || !scope || !checked || receipt || running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    setCode("");
    setFields({});
    const current = token.current,
      operation = `contract.${action}:${id}`;
    try {
      const key = await pendingWrites.reserve(scope, operation, () =>
        uuid.v4().toLowerCase(),
      );
      if (!alive.current || current !== token.current) return;
      const result = await api.contractAction(id, action, input, key);
      await pendingWrites.complete(scope, operation, key).catch(() => {});
      if (alive.current && current === token.current) open(result);
    } catch (cause) {
      if (!alive.current || current !== token.current) return;
      setError((cause as Error).message);
      setCode(cause instanceof ApiError ? cause.code : "STORAGE");
      setFields(cause instanceof ApiError ? cause.fields || {} : {});
      if (
        cause instanceof ApiError &&
        (cause.status === 0 || cause.status >= 500)
      ) {
        // Refresh the surrounding workspace after an uncertain outcome while
        // retaining the open confirmation form and its original revision.
        for (const queryKey of [["record"], ["catalogue"], ["overview"]])
          void cache.invalidateQueries({ queryKey });
      }
    } finally {
      running.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function checkPrevious() {
    if (!alive.current || checking || busy) return;
    setChecking(true);
    setError("");
    try {
      const found = await findPrevious();
      if (found === false && alive.current)
        setError(
          "Chưa tìm thấy kết quả xác nhận. Tải lại hồ sơ hoặc thử lại với cùng mã thao tác; không nhập lại khoản đã thu thành một khoản mới.",
        );
    } catch (cause) {
      if (alive.current) setError((cause as Error).message);
    } finally {
      if (alive.current) setChecking(false);
    }
  }
  async function openReceipt() {
    if (!scope || !receipt || checking) return;
    setChecking(true);
    await pendingWrites
      .complete(scope, receipt.operation, receipt.key)
      .catch(() => {});
    if (alive.current) open(receipt.value);
  }
  return {
    busy,
    checking,
    checked,
    error,
    code,
    fields,
    receipt,
    exit,
    submit,
    checkPrevious,
    openReceipt,
    dismissExit: () => setExit(null),
    leave: () => {
      const repeat = exit;
      setSaved(true);
      disablePrevention();
      setExit(null);
      repeat?.();
    },
    clearError: () => {
      setError("");
      setCode("");
      setFields({});
    },
  };
}
