import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Stack, usePreventRemove } from 'expo-router';
import { uuid } from 'expo';
import { ScrollView, Text } from 'react-native';
import { useSession } from '@/providers/session';
import { useVehicleImportWrite } from '@/hooks/use-vehicle-import-write';
import { useTheme } from '@/theme';
import { Button, Card, InlineError, StateView } from '@/components/ui';
import { FormField } from '@/components/form-fields';
import { ConfirmEdit } from '@/components/editor-sheet';
import { VehicleImportReceipt } from '@/components/vehicle-import-receipt';
import { VehicleImportReferences } from '@/components/vehicle-import-references';
export default function VehicleResetRoute() {
  const { api, session } = useSession();
  if (!api || !session || !session.user.permissions.includes('settings.write')) return <StateView title="Không có quyền xóa danh sách xe" />;
  return <Reset key={`${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(',')}`} />;
}
function Reset() {
  const { api, session } = useSession(), theme = useTheme(), [batch] = useState(() => uuid.v4().toLowerCase()), [confirmation, setConfirmation] = useState(''), [confirm, setConfirm] = useState(false), write = useVehicleImportWrite('reset', batch);
  const disablePrevention = usePreventRemove(write.busy, () => {});
  const query = useQuery({ queryKey: ['vehicle-reset', api?.origin, session?.user.id, session?.user.storeId, session?.user.allStores], queryFn: ({ signal }) => api!.vehicleReset(signal), retry: false, refetchOnWindowFocus: false });
  const p = query.data, disabled = write.busy || write.query.isPending || write.query.isError || query.isFetching || query.isError || !!write.entry, text = { color: theme.text, fontSize: 16, lineHeight: 24 }, muted = { color: theme.muted, fontSize: 14, lineHeight: 22 };
  return <><Stack.Screen options={{ title: 'Xóa danh sách xe có sao lưu' }} /><ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 16, maxWidth: 760, width: '100%', alignSelf: 'center' }}>
    {!!write.error && <InlineError message={write.error} />}{!!write.notice && <Text style={text}>{write.notice}</Text>}
    {write.query.isPending && <StateView title="Đang kiểm tra mã thao tác xe chờ" loading />}{write.query.isError && <StateView title="Chưa kiểm tra được mã thao tác xe chờ" message={write.query.error.message} retry={() => void write.query.refetch()} />}
    {write.entry ? <>{write.proof ? <><VehicleImportReceipt receipt={write.proof} disabled={write.busy} /><Button label="Đã xem kết quả, về đội xe" loading={write.busy} onPress={() => void write.acknowledge(disablePrevention)} /></> : <Card style={{ gap: 12 }}><Text selectable style={muted}>Mã lần gửi: {write.entry.key}</Text><Text style={text}>Đối chiếu thao tác đã gửi trước khi tiếp tục.</Text><Button label="Đối chiếu thao tác Excel xe" loading={write.busy} onPress={() => void write.resolve().then(status => { if (status === 'cancelled') { setConfirmation(''); void query.refetch(); } })} /></Card>}</> : <>
      {query.isPending && <StateView title="Đang kiểm tra xe và liên kết" loading />}{query.isError && <StateView title="Chưa kiểm tra được danh sách xe" message={query.error.message} retry={() => void query.refetch()} />}
      {p && <Card style={{ gap: 14 }}><Text accessibilityRole="header" style={{ ...text, fontSize: 22, fontWeight: '700', color: theme.danger }}>Kiểm tra xóa {p.total} xe</Text><Text style={text}>Áp dụng toàn bộ danh sách trong phạm vi tài khoản, kể cả xe ngoài bộ lọc đang xem. Không xóa hợp đồng hoặc lịch sử liên quan.</Text><Text style={muted}>Máy chủ tạo bản sao lưu trước khi xóa, trong cùng giao dịch. Nếu còn liên kết hoặc dữ liệu đổi sau kiểm tra, thao tác bị hủy.</Text>{p.blocking.map(b => <InlineError key={b} message={b} />)}<VehicleImportReferences references={p.references} />{!p.total && <Text style={text}>Danh sách xe đang trống.</Text>}{p.total > 0 && !p.blocking.length && <><FormField label="Nhập XÓA HẾT XE để xác nhận" value={confirmation} onChangeText={setConfirmation} editable={!disabled} maxLength={32} autoCorrect={false} /><Button label={`Kiểm tra và xóa ${p.total} xe`} disabled={disabled || confirmation !== 'XÓA HẾT XE'} onPress={() => setConfirm(true)} /></>}<Button secondary label="Kiểm tra lại xe và liên kết" disabled={write.busy || write.query.isPending || query.isFetching} onPress={() => { setConfirmation(''); void query.refetch(); }} /></Card>}
    </>}
  </ScrollView>{confirm && p && <ConfirmEdit title={`Xóa ${p.total} xe trong phạm vi?`} message="Thao tác xóa danh sách xe hiện có sau khi tạo bản sao lưu và kiểm tra lại toàn bộ liên kết. Không ảnh hưởng hợp đồng hoặc lịch sử đã có; có liên kết sẽ bị chặn. Dùng bản sao lưu để đối chiếu dữ liệu trước thay đổi." confirmLabel={`Xác nhận xóa ${p.total} xe`} busy={write.busy} onCancel={() => setConfirm(false)} onConfirm={() => { setConfirm(false); void write.save({ revision: p.revision, confirmation }); }} />}</>;
}
