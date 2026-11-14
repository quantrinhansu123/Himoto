import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { Text } from 'react-native';
import { canManageAccounts } from '../../../shared/mobile-managed-accounts';
import { useSession } from '@/providers/session';
import { useTheme } from '@/theme';
import { Button, Card, StateView } from './ui';

export function StaffLinkedAccounts({ id }: { id: number }) {
  const { api, session } = useSession(), theme = useTheme(), allowed = canManageAccounts(session?.user);
  const query = useQuery({ queryKey: ['staff-accounts', session?.user.id, id], queryFn: ({ signal }) => api!.staffAccounts(String(id), signal), enabled: !!api && allowed, staleTime: 0 });
  const refetch=query.refetch;
  useFocusEffect(useCallback(()=>{if(allowed)void refetch();},[allowed,refetch]));
  if (!allowed) return null;
  return <Card style={{ gap: 12 }}>
    <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 20, fontWeight: '700' }}>Tài khoản đăng nhập</Text>
    {query.isPending ? <StateView title="Đang tải tài khoản…" loading /> : query.isError ? <StateView title="Chưa tải được tài khoản của nhân sự" message={query.error.message} retry={() => void query.refetch()} /> : query.data.length ? query.data.map(account => <Card key={account.id} style={{ gap: 10 }}>
      <Text selectable style={{ color: theme.text }}>{account.login_name}</Text>
      <Text style={{ color: theme.muted }}>{account.enabled ? 'Hoạt động' : 'Đã khóa'}</Text>
      <Button secondary label="Xem và sửa tài khoản" onPress={() => router.push({ pathname: '/managed-account/[id]', params: { id: String(account.id) } })} />
    </Card>) : <Text style={{ color: theme.muted }}>Nhân sự chưa có tài khoản đăng nhập được liên kết.</Text>}
  </Card>;
}
