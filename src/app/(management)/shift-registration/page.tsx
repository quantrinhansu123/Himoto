import type { Metadata } from 'next';
import { ShiftRegistrationBoard } from '@/components/management/ShiftRegistrationBoard';
import { registrationDates } from '@/lib/management/shift-registration';

export const metadata: Metadata = { title: 'Đăng ký ca — HIMOTO' };

export default async function ShiftRegistrationPage({ searchParams }: {
  searchParams: Promise<{ date?: string | string[]; staff?: string | string[] }>;
}) {
  const { date, staff } = await searchParams;
  if (typeof date !== 'string' || typeof staff !== 'string' || !/^[1-9]\d{0,14}$/.test(staff)) return <ShiftRegistrationBoard />;
  try {
    registrationDates(date, date);
  } catch {
    return <ShiftRegistrationBoard />;
  }
  return <ShiftRegistrationBoard key={`${staff}:${date}`} focusDate={date} focusStaff={staff} />;
}
