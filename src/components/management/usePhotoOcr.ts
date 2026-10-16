'use client';

import { useEffect, useRef, useState } from 'react';
import { readPhotoWithAi, type OcrKind, type OcrResult } from '@/lib/management/photo-ocr';

interface OcrState { phase: 'reading' | 'done' | 'error'; message: string }
export interface PhotoOcrController { states: Record<string, OcrState>; pending: boolean; read: (slot: string, file?: File) => void; cancel: (slot: string) => void }
export function usePhotoOcr<Snapshot>({ kind, snapshot, apply }: {
  kind: (slot: string) => OcrKind; snapshot: (slot: string) => Snapshot;
  apply: (slot: string, result: OcrResult, before: Snapshot, file: File) => string;
}): PhotoOcrController {
  const [states, setStates] = useState<Record<string, OcrState>>({});
  const jobs = useRef(new Map<string, AbortController>());
  const callbacks = useRef({ kind, snapshot, apply }); callbacks.current = { kind, snapshot, apply };
  useEffect(() => () => { for (const job of jobs.current.values()) job.abort(); jobs.current.clear(); }, []);
  function cancel(slot: string) {
    jobs.current.get(slot)?.abort(); jobs.current.delete(slot);
    setStates(current => { const next = { ...current }; delete next[slot]; return next; });
  }
  function read(slot: string, file?: File) {
    cancel(slot); if (!file) return;
    const controller = new AbortController(); jobs.current.set(slot, controller);
    const before = callbacks.current.snapshot(slot);
    setStates(current => ({ ...current, [slot]: { phase: 'reading', message: 'AI đang đọc ảnh…' } }));
    void readPhotoWithAi(callbacks.current.kind(slot), file, controller.signal).then(result => {
      if (controller.signal.aborted || jobs.current.get(slot) !== controller) return;
      if (!Object.keys(result.fields).length) throw new Error('Chưa đọc được thông tin rõ ràng. Chụp lại ảnh hoặc nhập tay.');
      const message = callbacks.current.apply(slot, result, before, file);
      setStates(current => ({ ...current, [slot]: { phase: 'done', message } }));
    }).catch(cause => {
      if (!controller.signal.aborted && jobs.current.get(slot) === controller) setStates(current => ({ ...current, [slot]: { phase: 'error', message: cause instanceof Error ? cause.message : 'Không đọc được ảnh. Thử lại hoặc nhập tay.' } }));
    }).finally(() => { if (jobs.current.get(slot) === controller) jobs.current.delete(slot); });
  }
  return { states, pending: Object.values(states).some(state => state.phase === 'reading'), read, cancel };
}
