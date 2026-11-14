import type { Metadata } from 'next';
import { ShiftRegistrationBoard } from '@/components/management/ShiftRegistrationBoard';

export const metadata: Metadata = { title: 'Đăng ký ca — HIMOTO' };

export default function ShiftRegistrationPage() {
  return <ShiftRegistrationBoard />;
}
