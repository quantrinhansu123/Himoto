'use client';

import { useEffect } from 'react';
import { RotateCcw } from 'lucide-react';

export const RELOAD_EVENT = 'himoto-reload';
export function requestReload() { window.dispatchEvent(new Event(RELOAD_EVENT)); }
export function useReloadAction(action: () => void) {
  useEffect(() => {
    const onReload = () => action();
    window.addEventListener(RELOAD_EVENT, onReload);
    return () => window.removeEventListener(RELOAD_EVENT, onReload);
  }, [action]);
}

export function ReloadButton({ onClick, busy = false, disabled = false, label = 'Làm mới', name }: {
  onClick: () => void; busy?: boolean; disabled?: boolean; label?: string; name?: string;
}) {
  return <button type="button" className="mg-button" aria-label={name || label} disabled={disabled || busy} onClick={onClick}>
    <RotateCcw size={16} className={busy ? 'mg-spin' : undefined} />{busy ? 'Đang tải…' : label}
  </button>;
}
