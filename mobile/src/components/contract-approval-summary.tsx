import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Text } from 'react-native';
import { useSession } from '@/providers/session';
import { dateTime, useTheme } from '@/theme';
import { Button, Card, InlineError } from './ui';

export function ContractApprovalSummary({ id }: { id: string }) {
  const { api, session } = useSession(), theme = useTheme();
  const query = useQuery({ queryKey: ['contract-approval-context', api?.origin, session?.user.id, session?.user.storeId, session?.user.allStores, id],
    enabled: !!api, queryFn: ({ signal }) => api!.contractApproval(id, signal) });
  if (query.isPending) return <Text style={{ color: theme.muted }}>Đang kiểm tra điều kiện duyệt hợp đồng…</Text>;
  if (query.isError) return <Card style={{ gap: 12 }}><InlineError message="Chưa kiểm tra được trạng thái duyệt hợp đồng." /><Button secondary label="Kiểm tra lại trạng thái duyệt" onPress={() => void query.refetch()} /></Card>;
  const state = query.data.approval;
  if (!state) return null;
  return <Card style={{ gap: 12 }}>
    <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 18, fontWeight: '700' }}>Duyệt thuê sở hữu</Text>
    <Text style={{ color: theme.muted, lineHeight: 22 }}>{state.approved_at ? `Đã duyệt bởi ${state.approved_by || 'Chưa rõ người duyệt'} · ${dateTime(state.approved_at)}` : state.status === 'draft' ? 'Bản nháp cần được kiểm tra và phát hành trước.' : 'Hợp đồng chưa được duyệt.'}</Text>
    <Button secondary label="Kiểm tra và duyệt hợp đồng" onPress={() => router.push({ pathname: '/contract-approval/[id]', params: { id } })} />
  </Card>;
}
