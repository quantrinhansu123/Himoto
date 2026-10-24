import { ManagementShell } from '@/components/management/ManagementShell';
import { redirect } from 'next/navigation';
import { managementPageSession } from '@/lib/server/management-session';
import { SessionUnavailable } from '@/components/auth/SessionUnavailable';
import '@/styles/management.css';
import '@/styles/management-tables.css';
import '@/styles/contract-print.css';

export const dynamic = 'force-dynamic';

export default async function ManagementLayout({ children }: { children: React.ReactNode }) {
  const { user, unavailable } = await managementPageSession();
  if (unavailable) return <SessionUnavailable />;
  if (!user) redirect('/login');
  return <ManagementShell user={user}>{children}</ManagementShell>;
}
