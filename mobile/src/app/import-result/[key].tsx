import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, router, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isImportUuid, isImportOperation } from '../../../../shared/mobile-customer-import';
import { useSession } from '@/providers/session';
import { pendingWrites } from '@/lib/pending-writes';
import { dateTime, useTheme } from '@/theme';
import { Button, Card, InfoBanner, InlineError, KeyValueRow, StateView, StatusBadge } from '@/components/ui';
import { ConfirmEdit } from '@/components/editor-sheet';
import {useCsvExport} from '@/hooks/use-csv-export';
import {readContractImportBackup} from '@/lib/contract-import-backup';

export default function ImportResultRoute() {
  const { key } = useLocalSearchParams<{ key: string }>(), { api, session } = useSession();
  if (!api || !session || !isImportUuid(key) || !session.user.permissions.includes('settings.write')) return <StateView title="Không mở được kết quả nhập Excel" />;
  return <ImportResult key={`${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(',')}:${key}`} requestKey={key} />;
}
function ImportResult({ requestKey }: { requestKey: string }) {
  const { api, session } = useSession(), theme = useTheme(), cache = useQueryClient(), download=useCsvExport(), alive = useRef(true), running = useRef(false);
  const scope = useMemo(() => ({ origin: api!.origin, userId: session!.user.id, storeId: session!.user.allStores ? null : session!.user.storeId, allStores: session!.user.allStores }), [api, session]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [confirm, setConfirm] = useState(false);
  const disablePrevention = usePreventRemove(busy, () => {});
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const query = useQuery({ queryKey: ['import-result', scope, requestKey], gcTime: 0, retry: false, refetchOnWindowFocus: false,
    queryFn: async ({ signal }) => {
      const pending = (await pendingWrites.list(scope, true)).find(p => p.key === requestKey);
      const receipt = (await api!.importResult(requestKey, signal)).receipt;
      if (pending && !isImportOperation(pending.operation) || receipt && (receipt.key !== requestKey || receipt.actorId !== scope.userId || pending && receipt.operation !== pending.operation)) throw Error('Mã lần nhập không khớp kết quả gốc. Giữ mã để đối chiếu.');
      return { pending, receipt };
    } });
  const data = query.data, text = { color: theme.text, fontSize: 15, lineHeight: 22 }, muted = { color: theme.muted, fontSize: 13, lineHeight: 20 };
  function invalidate() { for (const queryKey of [['catalogue'], ['overview'], ['customer-matches'], ['record']]) void cache.invalidateQueries({ queryKey }); }
  async function resolve() {
    if (!data?.pending || running.current) return;
    running.current = true; setBusy(true); setError(''); setConfirm(false);
    try {
      const result = await api!.resolveWrite(requestKey, data.pending.operation);
      if (result.status === 'cancelled') {
        await pendingWrites.complete(scope, data.pending.operation, requestKey);
        if (alive.current) setNotice('Lần nhập chưa được ghi. Mã cũ đã khóa; chọn lại file và kiểm tra trước khi nhập tiếp.');
      } else invalidate();
      if (alive.current) await query.refetch();
    } catch (cause) { if (alive.current) setError((cause as Error).message); }
    finally { running.current = false; if (alive.current) setBusy(false); }
  }
  async function acknowledge() {
    if (!data?.receipt || running.current) return;
    running.current = true; setBusy(true); setError('');
    try {
      const owner = await pendingWrites.entryScope(scope, data.receipt.operation, requestKey);
      if (owner) await pendingWrites.complete(owner, data.receipt.operation, requestKey);
      if (alive.current) { invalidate(); disablePrevention(); router.dismissTo(data.receipt.kind==='contracts'?'/(tabs)/contracts':'/(tabs)/customers'); }
    } catch (cause) { if (alive.current) setError((cause as Error).message); }
    finally { running.current = false; if (alive.current) setBusy(false); }
  }
  return <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: theme.background }}>
    <Stack.Screen options={{ title: 'Kết quả nhập Excel' }} />
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 36, gap: 12, maxWidth: 760, width: '100%', alignSelf: 'center' }}>
      {!!error && <InlineError message={error} />}
      {!!notice && <InfoBanner tone="info" message={notice} />}
      {query.isPending ? <StateView title="Đang đối chiếu lần nhập Excel" loading /> : query.isError ? <StateView title="Chưa tải được kết quả nhập" message={query.error.message} retry={() => void query.refetch()} /> : <Card style={{ gap: 12 }}>
        <Text selectable style={{ color: theme.muted, fontSize: 12 }}>Mã lần nhập: {requestKey}</Text>
        {data?.receipt ? <>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <Text accessibilityRole="header" style={{ color: theme.success, fontSize: 20, fontWeight: '800', flexShrink: 1 }}>{data.receipt.kind === 'customer_stores' ? 'Đã cập nhật cơ sở cho' : 'Đã nhập'} {data.receipt.count} {data.receipt.kind==='contracts'?'nháp hợp đồng':'khách hàng'}</Text>
            <StatusBadge label="Hoàn tất" tone="success" />
          </View>
          <KeyValueRow label="Ghi nhận lúc" value={dateTime(data.receipt.recordedAt)} />
          <Text style={muted}>Đây là kết quả lần gửi gốc; hồ sơ có thể đã được chỉnh sửa tiếp.</Text>
          {data.receipt.kind==='contracts'&&<>
            <InfoBanner tone="warning" message="Nháp chưa đối soát tài chính. Kiểm tra từng hồ sơ trước khi phát hành; lần nhập chưa thay đổi kho, phiếu hoặc tiền thực thu." />
            <Button label="Xuất bản sao lưu trước nhập" secondary loading={download.busy} onPress={()=>void download.run(()=>readContractImportBackup({origin:scope.origin,actorId:scope.userId},data.receipt!.batchId))}/>
          </>}
          <Button label={data.receipt.kind==='contracts'?'Đã xem kết quả, về hợp đồng':'Đã xem kết quả, về danh sách khách'} loading={busy} disabled={download.busy} onPress={() => void acknowledge()} />
        </> : data?.pending ? <>
          <Text style={text}>Chưa có xác nhận nhập. Đối chiếu mã gốc trước khi gửi lại dữ liệu.</Text>
          <Button label="Đối chiếu kết quả lần nhập" loading={busy} onPress={() => setConfirm(true)} />
        </> : <>
          <Text style={text}>Chưa tìm thấy xác nhận nhập hoặc mã chờ trên thiết bị. Không tự gửi lại file từ màn này.</Text>
          <Button secondary label="Tải lại kết quả" disabled={busy} onPress={() => void query.refetch()} />
          <Button label="Mở nhập Excel khách hàng" disabled={busy} onPress={() => router.replace('/import-customers')} />
        </>}
      </Card>}
      {!!download.error&&<InlineError message={download.error}/>}
      {!!download.message&&<InfoBanner tone="success" message={download.message}/>}
    </ScrollView>
    {confirm && <ConfirmEdit title="Đối chiếu lần nhập Excel?" message="Nếu đã ghi, tải lại kết quả lần gửi gốc. Nếu chưa ghi, máy chủ khóa mã cũ để chặn yêu cầu đến muộn. Dữ liệu đã được nhập vẫn được giữ." confirmLabel="Đối chiếu lần nhập" busy={busy} onCancel={() => setConfirm(false)} onConfirm={() => void resolve()} />}
  </SafeAreaView>;
}
