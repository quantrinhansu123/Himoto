'use client';
import { useState } from 'react';
import { ArrowDownToLine } from 'lucide-react';
import { useManagement } from './ManagementProvider';
import { downloadFilteredExcel } from '@/lib/management/excel-export';

type ExcelRows = (string | number | null | undefined)[][];
type ExportOptions = {
  label?: string; headers: string[]; filename: string; getRows: () => ExcelRows | Promise<ExcelRows>;
} | {
  label: string; exportFile: () => Promise<number>;
};

export function FilteredExcelButton({ disabled, showOnMobile = false, ...options }: { disabled: boolean; showOnMobile?: boolean } & ExportOptions) {
  const [busy, setBusy] = useState(false);
  const { notify } = useManagement();
  return <button type="button" className={`mg-button${showOnMobile ? '' : ' mg-excel-export'}`} disabled={disabled || busy} onClick={async () => {
    if (busy) return;
    setBusy(true);
    try {
      let count: number;
      if ('exportFile' in options) {
        count = await options.exportFile();
      } else {
        const rows = await options.getRows();
        await downloadFilteredExcel(options.headers, rows, options.filename);
        count = rows.length;
      }
      notify(`Đã xuất ${count} bản ghi theo bộ lọc.`);
    }
    catch (cause) { notify(cause instanceof Error ? cause.message : 'Không tải được Excel.'); }
    finally { setBusy(false); }
  }}><ArrowDownToLine size={17}/>{busy ? 'Đang xuất…' : options.label ?? 'Tải Excel theo bộ lọc'}</button>;
}
