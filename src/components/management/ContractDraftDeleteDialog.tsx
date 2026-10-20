'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { ManagementRow } from '@/lib/management/types';
import { Dialog } from './Dialog';

export function ContractDraftDeleteDialog({ row, onClose, onDeleted }: { row: ManagementRow; onClose: () => void; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  return <Dialog title="Xóa bản nháp?" subtitle={`${row.code} · ${row.customer_name || 'Chưa có tên khách'}`} onClose={() => { if (!busy) onClose(); }} dismissOnBackdrop={false}>
    <div className="mg-dialog-body"><p>Bản nháp này sẽ được ẩn khỏi danh sách. Hồ sơ đã lưu được giữ để có thể đối chiếu.</p>
      {error && <p className="mg-field-error" role="alert">{error}</p>}</div>
    <div className="mg-dialog-footer"><button type="button" className="mg-button" disabled={busy} onClick={onClose}>Giữ bản nháp</button>
      <button type="button" className="mg-button mg-button-danger" disabled={busy || !row.draft_revision} onClick={async () => {
        setBusy(true); setError('');
        try {
          const response = await fetch(`/api/auth/order/car-rental/${row.id}/draft`, { method: 'DELETE', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: String(row.draft_revision) }) });
          const result = await response.json().catch(() => null);
          if (!response.ok || result?.status !== 'success' || result.data?.id !== row.id) throw new Error(result?.message || 'Không xóa được. Làm mới danh sách để kiểm tra.');
          onDeleted();
        } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không xóa được bản nháp.'); }
        finally { setBusy(false); }
      }}><Trash2 size={16} />{busy ? 'Đang xóa…' : 'Xóa bản nháp'}</button></div>
  </Dialog>;
}
