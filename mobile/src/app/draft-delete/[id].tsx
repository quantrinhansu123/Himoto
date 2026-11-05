import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { useSession } from '@/providers/session';
import { useDraftDeleteWrite } from '@/hooks/use-draft-delete-write';
import { useTheme } from '@/theme';
import { Button, Card, InlineError, StateView } from '@/components/ui';
import { ConfirmEdit } from '@/components/editor-sheet';
export default function DraftDeleteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(), { api, session } = useSession();
  if (!api || !session || !/^[1-9]\d{0,14}$/.test(id) || !session.user.permissions.includes('contracts.read') || !session.user.permissions.includes('contracts.draft')) return <StateView title="Không mở được xóa nháp" />;
  return <DraftDeleteView key={`${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${id}`} id={id} />;
}
function DraftDeleteView({ id }: { id: string }) {
  const write = useDraftDeleteWrite(id), theme = useTheme(), [confirm, setConfirm] = useState(false);
  const disablePrevention = usePreventRemove(write.busy, () => {}), p = write.query.data?.profile, text = { color: theme.text, fontSize: 16, lineHeight: 24 }, muted = { color: theme.muted, fontSize: 14, lineHeight: 22 };
  return <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: theme.background }}><Stack.Screen options={{ title: 'Xóa nháp trên máy chủ' }} /><ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
    {!!write.error && <InlineError message={write.error} />}{!!write.notice && <Text style={muted}>{write.notice}</Text>}
    {write.query.isPending && <StateView title="Đang kiểm tra bản nháp" loading />}{write.query.isError && <StateView title="Chưa kiểm tra được bản nháp" message={(write.query.error as Error).message} retry={() => void write.query.refetch()} />}
    {write.key ? <Card style={{ gap: 12 }}><Text selectable style={muted}>Mã lần xóa: {write.key}</Text>{write.proof ? <><Text accessibilityRole="header" style={{ ...text, fontSize: 21, fontWeight: '700' }}>Đã ghi nhận xóa nháp #{write.proof.receipt.id}</Text><Text style={text}>Phiên bản lần xóa: {write.proof.receipt.revision}</Text><Text style={muted}>Nháp đã được xóa mềm ở lần gửi này; giữ lịch sử đối chiếu. Bản đang soạn trên thiết bị vẫn cần xử lý riêng.</Text><Button label="Đã xem kết quả, về danh sách hợp đồng" loading={write.busy} onPress={() => void write.acknowledge(disablePrevention)} /></> : <Button label="Đối chiếu kết quả xóa nháp" loading={write.busy} onPress={() => void write.resolve()} />}</Card> : p && <Card style={{ gap: 14 }}><Text accessibilityRole="header" style={{ ...text, fontSize: 22, fontWeight: '700' }}>{p.code}</Text><Text style={muted}>Mã hồ sơ #{p.id} · Phiên bản {p.revision}</Text><Text style={text}>Xóa mềm bản nháp chưa phát hành trên máy chủ. Bản đang soạn và ảnh chưa gửi trên thiết bị được giữ riêng.</Text><Text style={muted}>Nháp có số hợp đồng, đã phát hành, có phiếu hoặc bất kỳ lịch sử dòng xe sẽ bị chặn xóa.</Text>{p.blockedReason && <InlineError message={p.blockedReason} />}<Button label="Kiểm tra và xóa nháp máy chủ" disabled={!p.canDelete || write.busy || write.query.isFetching} onPress={() => setConfirm(true)} /><Button secondary label="Tải lại tình trạng bản nháp" disabled={write.busy || write.query.isFetching} onPress={() => void write.query.refetch()} /></Card>}
  </ScrollView>{confirm && p && <ConfirmEdit title="Xóa bản nháp trên máy chủ?" message={`${p.code} · Hồ sơ #${p.id}\n\nBản nháp sẽ không còn trong danh sách đang dùng. Chỉ thực hiện nếu chưa phát hành, chưa có phiếu và chưa có lịch sử xe. Giữ dấu vết người xóa và nội dung trước xóa để đối chiếu.`} confirmLabel="Xác nhận xóa nháp máy chủ" busy={write.busy} onCancel={() => setConfirm(false)} onConfirm={() => { setConfirm(false); void write.save({ revision: p.revision }); }} />}</SafeAreaView>;
}
