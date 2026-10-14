import { LoginForm } from '@/components/auth/LoginForm';
import { ManagementLanding } from '@/components/auth/ManagementLanding';
import { currentSessionUser, isManagementConfigured } from '@/lib/server/management-session';
import '@/styles/login.css';

export const metadata = { title: 'Đăng nhập — HIMOTO' };

export default async function LoginPage() {
  const connected = isManagementConfigured();
  if (connected) {
    // A database outage must leave the login form available for retry.
    const user = await currentSessionUser().catch(() => null);
    if (user) return <ManagementLanding />;
  }
  return <LoginForm connected={connected} />;
}
