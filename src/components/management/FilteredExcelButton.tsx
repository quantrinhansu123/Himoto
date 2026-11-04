'use client';
import { useState } from 'react';
import { ArrowDownToLine } from 'lucide-react';
import { useManagement } from './ManagementProvider';
import { downloadFilteredExcel } from '@/lib/management/excel-export';

export function FilteredExcelButton({ disabled, headers, getRows, filename }: {
  disabled: boolean; headers: string[]; filename: string;
  getRows: () => (string | number | null | undefined)[][] | Promise<(string | number | null | undefined)[][]>;
}) {
  const [busy, setBusy] = useState(false);
  const { notify } = useManagement();
  return <button type="button" className="mg-button" disabled={disabled || busy} onClick={async () => {
    if (busy) return;
    setBusy(true);
    try { const rows = await getRows(); await downloadFilteredExcel(headers, rows, filename); notify(`Đã xuất ${rows.length} bản ghi theo bộ lọc.`); }
    catch (cause) { notify(cause instanceof Error ? cause.message : 'Không tải được Excel.'); }
    finally { setBusy(false); }
  }}><ArrowDownToLine size={17}/>{busy ? 'Đang xuất…' : 'Tải Excel theo bộ lọc'}</button>;
}
