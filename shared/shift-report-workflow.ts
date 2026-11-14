import type { ShiftReport } from './shift-reports';

export const SHIFT_REPORT_DESCRIPTION = 'Kiểm kê xe, pin, tiền và xác nhận an toàn trước khi kết thúc ca.';
export const SHIFT_REPORT_TABS = [
  ['information', 'Thông tin'],
  ['inventory', 'Kiểm kê xe / pin'],
  ['summary', 'Hợp đồng & thu chi'],
  ['accounts', 'Tiền các tài khoản'],
  ['safety', 'An toàn cuối ca'],
  ['ownership', 'Thuê sở hữu & Telegram'],
] as const;
export const SHIFT_REPORT_PROGRESS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'draft', label: 'PGD đang lập' },
  { value: 'pending', label: 'Chờ KTNB xác nhận' },
  { value: 'confirmed', label: 'Đã xác nhận KTNB' },
  { value: 'explained', label: 'Đã xác nhận có giải trình' },
] as const;
export type ShiftReportProgress = typeof SHIFT_REPORT_PROGRESS[number]['value'];

export function matchesShiftReportProgress(row: Pick<ShiftReport, 'status' | 'audit'>, status: string): boolean {
  switch (status) {
    case 'all': return true;
    case 'draft': return row.status === 'draft';
    case 'pending': return row.status === 'submitted' && row.audit?.status !== 'confirmed';
    case 'confirmed': return row.audit?.status === 'confirmed';
    case 'explained': return row.audit?.result === 'explained';
    default: return false;
  }
}
