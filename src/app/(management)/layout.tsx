import { ManagementShell } from '@/components/management/ManagementShell';
import { redirect } from 'next/navigation';
import { currentSessionUser } from '@/lib/server/management-session';
import '@/styles/management.css';
import '@/styles/contract-print.css';

export default async function ManagementLayout({ children }: { children: React.ReactNode }) {
  const user = await currentSessionUser().catch(() => null);
  if (!user) redirect('/login');
  return <ManagementShell user={user}>{children}</ManagementShell>;
}
