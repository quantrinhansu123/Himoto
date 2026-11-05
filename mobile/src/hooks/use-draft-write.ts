import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { uuid } from "expo";
import { router, usePreventRemove } from "expo-router";
import { useSession } from "@/providers/session";
import { pendingWrites } from "@/lib/pending-writes";
import type {DraftWorkController} from '@/lib/draft-work-controller';
import { ApiError } from "@/lib/api";
import type {
  MobileDraftInput,
  MobileWriteReceipt,
} from "@himoto/mobile-contract";

export function useDraftWrite({
  id,
  input,
  dirty,
  onReload,
  onReset,
  onError,
  onCommitted,work=null,beforeLeave,
}: {
  id: string | null;work?:DraftWorkController|null;beforeLeave?:()=>Promise<void>;
  input: MobileDraftInput;
  dirty: boolean;
  onReload: (input: MobileDraftInput) => void;
  onReset: () => void;
  onError: (fields: Record<string, string>) => void;
  onCommitted?: (receipt:MobileWriteReceipt)=>boolean;
}) {
  const { api, session } = useSession(),
    cache = useQueryClient();
  const [busy, setBusy] = useState(false),
    [checking, setChecking] = useState(false),
    [checked, setChecked] = useState(false),
    [saved, setSaved] = useState(false);
  const [receipt, setReceipt] = useState<MobileWriteReceipt | null>(()=>work?.metadataReceipt()??null),
    [error, setError] = useState(""),
    [code, setCode] = useState("");
  const [exit, setExit] = useState<(() => void) | null>(null),
    [reload, setReload] = useState(false);
  const alive = useRef(true),
    saving = useRef(false),
    currentToken = useRef(session?.token);
  useEffect(() => {
    currentToken.current = session?.token;
  }, [session?.token]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const userId = session?.user.id,
    storeId = session?.user.storeId,
    allStores = session?.user.allStores;
  const scope = useMemo(
    () =>
      api && userId
        ? {
            origin: api.origin,
            userId,
            storeId: allStores ? null : (storeId ?? null),
            allStores: allStores === true,
          }
        : null,
    [api, userId, storeId, allStores],
  );
  const operation = id ? `draft.update:${id}` : "draft.create";
  const allowed =
    !!session?.user.permissions.includes("contracts.draft") &&
    session.user.permissions.includes("contracts.read");
  const disablePrevention = usePreventRemove(
    allowed && !saved && (dirty || busy),
    ({ repeat }) => setExit(() => repeat),
  );
  useEffect(() => {
    let cancelled = false;
    async function recover() {
      if (!api || !scope) return;
      try {
        const key = work?.pending('metadata')??await pendingWrites.lookup(scope, operation);
        if (!key || cancelled) return;
        if(work&&!work.owns(key))return;
        const found = await api.draftReceipt(key);
        if (cancelled) return;
        if(found.receipt&&work){await work.observeMetadata(key,found.receipt);if(!cancelled)setReceipt(found.receipt);}
        else if (found.receipt && id === null) setReceipt(found.receipt);
        else if (found.receipt)
          await pendingWrites.complete(scope, operation, key);
      } catch {
        if (!cancelled)
          setError(
            "Chưa kiểm tra được lần lưu trước. Kiểm tra lại trước khi tạo bản nháp mới.",
          );
      } finally {
        if (!cancelled) setChecked(true);
      }
    }
    void recover();
    return () => {
      cancelled = true;
    };
  }, [api, scope, operation, id,work]);
  function invalidate() {
    for (const queryKey of [
      ["catalogue"],
      ["overview"],
      ["record"],
      ["draft-edit"],
    ])
      void cache.invalidateQueries({ queryKey });
  }
  function open(result: MobileWriteReceipt) {
    setSaved(true);
    disablePrevention();
    invalidate();
    router.dismissTo({
      pathname: "/record/[kind]/[id]",
      params: { kind: "contracts", id: String(result.id) },
    });
  }
  async function submit() {
    if (!api || !scope || !session || saving.current || receipt || !checked)
      return;
    saving.current = true;
    setBusy(true);
    setError("");
    setCode("");
    const token = session.token;
    try {
      const reservation=work?await work.reserveMetadata(input):null;
      const key=reservation?.key??await pendingWrites.reserve(scope,operation,()=>uuid.v4().toLowerCase());
      if(reservation&&!reservation.created)throw Error('Có yêu cầu chưa rõ kết quả. Kiểm tra lần lưu trước để giữ đúng bản nháp gốc.');
      if (!alive.current || token !== currentToken.current) return;
      const result = await api.saveDraft(id, input, key);
      if (!alive.current || token !== currentToken.current) return;
      if(work){await work.observeMetadata(key,result);setReceipt(result);await work.settleMetadata(key,result);}
      if (!alive.current || token !== currentToken.current) return;
      if(onCommitted?.(result)){setReceipt(result);invalidate();return;}
      if(work)await work.finish();else await pendingWrites.complete(scope, operation, key).catch(() => {});
      if (!alive.current || token !== currentToken.current) return;
      open(result);
    } catch (failure) {
      if (!alive.current || token !== currentToken.current) return;
      setError((failure as Error).message);
      setCode(failure instanceof ApiError ? failure.code : "STORAGE");
      onError(failure instanceof ApiError ? failure.fields || {} : {});
    } finally {
      saving.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function checkPrevious() {
    if (!api || !scope || checking) return;
    setChecking(true);
    setError("");
    const token = currentToken.current;
    try {
      const key=work?.pending('metadata')??await pendingWrites.lookup(scope,operation);
      if(work&&key&&work.owns(key)){
        const resolution=await api.resolveWrite(key,operation);if(!alive.current||token!==currentToken.current)return;
        if(resolution.status==='cancelled'){await work.cancel(key);setReceipt(null);setError('Chưa lưu bản nháp; mã cũ đã khóa. Thông tin và ảnh được giữ để rà soát và lưu lại.');return;}
      }
      const found=key?await api.draftReceipt(key):{receipt:null};
      if(!alive.current||token!==currentToken.current)return;
      if(found.receipt){if(work&&key&&work.owns(key))await work.observeMetadata(key,found.receipt);setReceipt(found.receipt);}
      else setError('Chưa có kết quả lưu cho yêu cầu này. Kiểm tra lại trước khi gửi tiếp.');
    } catch (failure) {
      if (alive.current) setError((failure as Error).message);
    } finally {
      if (alive.current) setChecking(false);
    }
  }
  async function openReceipt(){
    if(!receipt||!scope||checking)return;setChecking(true);setError('');const at=currentToken.current;
    try{
      const result=receipt;
      if(work){const attempt=work.getHead()?.work.attempts.find(a=>a.kind==='metadata'&&a.state==='committed');if(!attempt)throw Error('Chưa có liên kết hợp đồng gốc trên thiết bị.');await work.settleMetadata(attempt.key,result);}
      if(!alive.current||at!==currentToken.current)return;
      if(onCommitted?.(result))return;
      const key=await pendingWrites.lookup(scope,operation);
      if(key)await pendingWrites.complete(scope,operation,key);
      if(work)await work.finish();if(alive.current&&at===currentToken.current)open(result);
    }catch(cause){if(alive.current)setError((cause as Error).message);}finally{if(alive.current)setChecking(false);}
  }
  async function startAnother() {
    if (!scope || checking) return;
    setChecking(true);
    try {
      const key = await pendingWrites.lookup(scope, operation);
      if (key) await pendingWrites.complete(scope, operation, key);
      if (!alive.current) return;
      onReset();
      setReceipt(null);
      setError("");
      setCode("");
    } catch {
      if (alive.current)
        setError(
          "Chưa xóa được mã lần lưu trước trên thiết bị. Vui lòng thử lại.",
        );
    } finally {
      if (alive.current) setChecking(false);
    }
  }
  async function completePhotos() {
    if(!scope||!receipt||checking)return;
    const at=currentToken.current;
    if(work)await work.finish();
    const key=await pendingWrites.lookup(scope,operation);
    if(key)await pendingWrites.complete(scope,operation,key);
    if(alive.current&&currentToken.current===at)open(receipt);
  }
  async function loadLatest() {
    if (!api || !id || busy) return;
    setReload(false);
    setBusy(true);
    setError("");
    try {
      const latest = await api.draft(id);
      if (!alive.current) return;
      cache.setQueryData(
        ["draft-edit", userId, storeId, allStores, id],
        latest,
      );
      if(work)await work.flush(latest.input,0);
      onReload(latest.input);
      setCode("");
    } catch (failure) {
      if (alive.current) setError((failure as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function leave() {
    const at=currentToken.current;
    if(!alive.current)return;
    try{if(beforeLeave)await beforeLeave();else if(work)await work.flush();}
    catch(cause){if(alive.current&&at===currentToken.current){setError((cause as Error).message);setExit(null);onError({});}return;}
    if(!alive.current||at!==currentToken.current)return;
    const repeat = exit;
    setSaved(true);
    disablePrevention();
    setExit(null);
    repeat?.();
  }
  return {
    busy,
    checking,
    checked,
    receipt,
    error,
    code,
    exit,
    reload,
    submit,
    checkPrevious,
    openReceipt,
    completePhotos,
    startAnother,
    loadLatest,
    leave,
    dismissPrompt: () => {
      setExit(null);
      setReload(false);
    },
    askReload: () => setReload(true),
    clearError: () => {
      setError("");
      setCode("");
    },
  };
}
