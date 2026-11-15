import type { Metadata } from 'next';
import { AttendanceHistoryPage } from '@/components/management/AttendancePage';

export const metadata: Metadata = { title: 'Lịch sử chấm công — HIMOTO' };

export default function Page() {
  return <AttendanceHistoryPage />;
}
