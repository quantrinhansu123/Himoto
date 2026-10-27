'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { ManagementRow } from '@/lib/management/types';
import { Dialog } from './Dialog';

export function ContractDepositDeleteDialog({ row, onClose, onDeleted }: { row: ManagementRow; onClose: () => void; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  return <Dialog title="Xóa hợp đồng cọc?" subtitle={`${row.code} · ${row.customer_name || 'Chưa có tên khách'}`} onClose={() => { if (!busy) onClose(); }} dismissOnBackdrop={false}>
    <div className="mg-dialog-body">
      <p>Hợp đồng cọc sẽ ẩn khỏi danh sách và giải phóng xe đang giữ. Phiếu thu/chi đã ghi vẫn giữ trong Sổ quỹ để đối chiếu.</p>
      {error && <p className="mg-field-error" role="alert">{error}</p>}
    </div>
    <div className="mg-dialog-footer">
      <button type="button" className="mg-button" disabled={busy} onClick={onClose}>Giữ hợp đồng</button>
      <button type="button" className="mg-button mg-button-danger" disabled={busy || !row.draft_revision} onClick={async () => {
        setBusy(true); setError('');
        try {
          const response = await fetch(`/api/auth/order/car-rental/${row.id}/reservation`, {
            method: 'DELETE', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: String(row.draft_revision) }),
          });
          const result = await response.json().catch(() => null);
          if (!response.ok || result?.status !== 'success' || result.data?.id !== row.id) {
            throw new Error(result?.message || 'Không xóa được. Làm mới danh sách để kiểm tra.');
          }
          onDeleted();
        } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không xóa được hợp đồng cọc.'); }
        finally { setBusy(false); }
      }}><Trash2 size={16} />{busy ? 'Đang xóa…' : 'Xóa hợp đồng cọc'}</button>
    </div>
  </Dialog>;
}
