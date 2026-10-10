'use client';

import { ReactNode, useEffect, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import type { ManagementKind } from '@/lib/management/types';
import { Dialog } from './Dialog';
import { useManagement } from './ManagementProvider';

export function ManagementDataBoundary({ kinds, title, onClose, children }: {
  kinds: readonly ManagementKind[]; title: string; onClose: () => void; children: ReactNode;
}) {
  const { resources, ensureData } = useManagement();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    void ensureData(kinds).then(() => { if (active) setReady(true); }).catch(() => {});
    return () => { active = false; };
  }, [ensureData, kinds]);
  const error = kinds.map(kind => resources[kind].error).filter(Boolean).join(' ');
  if (ready) return children;
  return <Dialog title={title} onClose={onClose}><div className="mg-dialog-body">
    {error ? <p className="mg-field-error" role="alert">{error}</p> : <p role="status"><LoaderCircle size={17} className="mg-spin" /> Đang tải dữ liệu…</p>}
  </div><div className="mg-dialog-footer"><button type="button" className="mg-button" onClick={onClose}>Đóng</button>
    {error && <button type="button" className="mg-button" disabled={kinds.some(kind => resources[kind].loading)} onClick={() => void ensureData(kinds, true).then(() => setReady(true)).catch(() => {})}>Thử lại</button>}
  </div></Dialog>;
}
