import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, router, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { ScrollView, Text } from 'react-native';
import { isImportUuid } from '../../../../shared/mobile-customer-import';
import { isVehicleImportOperation } from '../../../../shared/mobile-vehicle-import';
import { useSession } from '@/providers/session';
import { pendingWrites } from '@/lib/pending-writes';
import { useTheme } from '@/theme';
import { VehicleImportReceipt } from '@/components/vehicle-import-receipt';
import { Button, Card, InlineError, StateView } from '@/components/ui';
import { ConfirmEdit } from '@/components/editor-sheet';
export default function VehicleImportResultRoute() {
  const { key } = useLocalSearchParams<{ key: string }>(), { api, session } = useSession();
  if (!api || !session || !isImportUuid(key) || !session.user.permissions.includes('settings.write')) return <StateView title="Không mở được kết quả Excel xe" />;
  return <Result key={`${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(',')}:${key}`} requestKey={key} />;
}
function Result({ requestKey }: { requestKey: string }) {
  const { api, session } = useSession(), cache = useQueryClient(), theme = useTheme(), alive = useRef(true), running = useRef(false);
  const scope = useMemo(() => ({ origin: api!.origin, userId: session!.user.id, storeId: session!.user.allStores ? null : session!.user.storeId, allStores: session!.user.allStores }), [api, session]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [confirm, setConfirm] = useState(false);
  const disablePrevention = usePreventRemove(busy, () => {});
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const query = useQuery({ queryKey: ['vehicle-import-result', scope, requestKey], gcTime: 0, retry: false, refetchOnWindowFocus: false,
    queryFn: async ({ signal }) => {
      const pending = (await pendingWrites.list(scope, true)).find(p => p.key === requestKey), receipt = (await api!.vehicleImportResult(requestKey, signal)).receipt;
      if (pending && !isVehicleImportOperation(pending.operation) || receipt && (receipt.key !== requestKey || receipt.actorId !== scope.userId || pending && pending.operation !== receipt.operation)) throw Error('Xác nhận Excel xe không khớp mã gốc. Giữ mã để đối chiếu.');
      return { pending, receipt };
    } });
  const data = query.data;
  function invalidate() { for (const queryKey of [['catalogue'], ['overview'], ['vehicle-profile'], ['record'], ['workspace']]) void cache.invalidateQueries({ queryKey }); }
  async function resolve() {
    if (!data?.pending || running.current) return; running.current = true; setBusy(true); setError(''); setConfirm(false);
    try {
      const result = await api!.resolveVehicleImport(requestKey, data.pending.operation);
      if (result.status === 'cancelled') { await pendingWrites.complete(scope, data.pending.operation, requestKey); if (alive.current) setNotice('Thao tác chưa ghi; mã cũ đã khóa. Mở lại Excel xe và kiểm tra danh sách trước khi tiếp tục.'); }
      else { if (result.receipt.actorId !== scope.userId) throw Error('Kết quả không thuộc tài khoản hiện tại.'); invalidate(); }
      if (alive.current) await query.refetch();
    } catch (cause) { if (alive.current) setError((cause as Error).message); }
    finally { running.current = false; if (alive.current) setBusy(false); }
  }
  async function acknowledge() {
    if (!data?.receipt || running.current) return; running.current = true; setBusy(true); setError('');
    try { const owner = await pendingWrites.entryScope(scope, data.receipt.operation, requestKey); if (owner) await pendingWrites.complete(owner, data.receipt.operation, requestKey); if (alive.current) { invalidate(); disablePrevention(); router.dismissTo('/(tabs)/vehicles'); } }
    catch (cause) { if (alive.current) setError((cause as Error).message); }
    finally { running.current = false; if (alive.current) setBusy(false); }
  }
  return <><Stack.Screen options={{ title: 'Kết quả Excel xe' }} /><ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 16, maxWidth: 760, width: '100%', alignSelf: 'center' }}>
    {!!error && <InlineError message={error} />}{!!notice && <Text style={{ color: theme.text, lineHeight: 24 }}>{notice}</Text>}
    {query.isPending ? <StateView title="Đang đối chiếu Excel xe" loading /> : query.isError ? <StateView title="Chưa tải được kết quả Excel xe" message={query.error.message} retry={() => void query.refetch()} /> : data?.receipt ? <><VehicleImportReceipt receipt={data.receipt} disabled={busy} /><Button label="Đã xem kết quả, về đội xe" loading={busy} onPress={() => void acknowledge()} /></> : <Card style={{ gap: 12 }}><Text selectable style={{ color: theme.muted }}>Mã lần gửi: {requestKey}</Text><Text style={{ color: theme.text, lineHeight: 24 }}>Chưa có xác nhận cho mã này. Giữ mã gốc; không tự nhập lại hoặc xóa lại danh sách.</Text>{data?.pending ? <Button label="Đối chiếu thao tác Excel xe" loading={busy} onPress={() => setConfirm(true)} /> : <Button secondary label="Tải lại kết quả Excel xe" disabled={busy} onPress={() => void query.refetch()} />}</Card>}
  </ScrollView>{confirm && <ConfirmEdit title="Đối chiếu thao tác Excel xe?" message="Nếu đã ghi, mở kết quả và bản sao lưu của lần gửi gốc. Nếu chưa ghi, máy chủ khóa mã cũ để chặn yêu cầu đến muộn. Không hủy các thay đổi xe đã được ghi." confirmLabel="Đối chiếu mã gốc" busy={busy} onCancel={() => setConfirm(false)} onConfirm={() => void resolve()} />}</>;
}
