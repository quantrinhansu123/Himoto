'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { ManagementRow } from '@/lib/management/types';
import { Dialog } from './Dialog';

export function ContractDraftDeleteDialog({ row, onClose, onDeleted }: { row: ManagementRow; onClose: () => void; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const completed=row.status==='completed';
  return <Dialog title={completed?'Ẩn hợp đồng đã hoàn thành?':'Xóa hẳn bản nháp?'} subtitle={`${row.code} · ${row.customer_name || 'Chưa có tên khách'}`} onClose={() => { if (!busy) onClose(); }} dismissOnBackdrop={false}>
    <div className="mg-dialog-body"><p>{completed?'Hợp đồng chỉ được ẩn khỏi danh sách. Dữ liệu hợp đồng, lịch sử xe và phiếu thu/chi vẫn được giữ.':'Bản nháp chưa phát hành sẽ bị xóa hẳn.'} Người thao tác và ngày giờ xóa được lưu trong nhật ký.</p>
      {error && <p className="mg-field-error" role="alert">{error}</p>}</div>
    <div className="mg-dialog-footer"><button type="button" className="mg-button" disabled={busy} onClick={onClose}>{completed?'Giữ hợp đồng':'Giữ bản nháp'}</button>
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
      }}><Trash2 size={16} />{busy ? 'Đang xử lý…' : completed?'Ẩn hợp đồng':'Xóa hẳn bản nháp'}</button></div>
  </Dialog>;
}
