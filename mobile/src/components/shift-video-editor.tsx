import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { SHIFT_PHOTOS, type MobileShiftVideoReview } from '../../../shared/mobile-shift-reports';
import { MOBILE_SHIFT_VIDEO_SECONDS } from '../../../shared/mobile-video';
import { useSession } from '@/providers/session';
import { useShiftVideoWrite } from '@/hooks/use-shift-video-write';
import { selectRecordVideo, type RecordVideo } from '@/lib/record-video';
import { useTheme } from '@/theme';
import { Button, Card, InlineError, StateView } from './ui';
import { ChoiceField } from './form-fields';
import { ConfirmEdit } from './editor-sheet';
import { RecordVideoPlayer } from './record-video-player';

export function ShiftVideoEditor({ id, stage, category }: { id: string; stage: string; category: string }) {
  const { api, session } = useSession();
  if (!api || !session || !/^[1-9]\d{0,14}$/.test(id) || !['pgd', 'audit'].includes(stage) || !SHIFT_PHOTOS.some(([key]) => key === category))
    return <StateView title="Không mở được video ca" message="Mở mục video từ hồ sơ báo cáo ca." />;
  if (!session.user.permissions.includes('contracts.read')) return <StateView title="Không có quyền xem báo cáo ca" />;
  return <VideoForm key={[api.origin, session.token, session.user.storeId, session.user.allStores, session.user.permissions.join(','), id, stage, category].join('|')} id={id} initialStage={stage as 'pgd' | 'audit'} initialCategory={category} />;
}

function VideoForm({ id, initialStage, initialCategory }: { id: string; initialStage: 'pgd' | 'audit'; initialCategory: string }) {
  const { api, session } = useSession(), theme = useTheme();
  const [stage, setStage] = useState(initialStage), [category, setCategory] = useState(initialCategory);
  const [video, setVideo] = useState<RecordVideo | null>(null), [picking, setPicking] = useState(false), [ready, setReady] = useState(false), [duration, setDuration] = useState(0), [error, setError] = useState('');
  const [review, setReview] = useState<MobileShiftVideoReview | null>(null), [resolving, setResolving] = useState(false);
  const alive = useRef(true), local = useRef<RecordVideo | null>(null), picker = useRef<AbortController | null>(null), pickingLock = useRef(false);
  const write = useShiftVideoWrite(id, !!video || picking), locked = write.busy || !!write.key || !write.checked || picking;
  const query = useQuery({ queryKey: ['shift', 'video', api?.origin, session?.user.id, session?.user.storeId, session?.user.allStores, id], queryFn: ({ signal }) => api!.shift(id, signal), enabled: write.checked && !write.key, staleTime: 0, gcTime: 0, retry: false, refetchOnReconnect: false, refetchOnWindowFocus: false });
  useEffect(() => { alive.current = true; return () => { alive.current = false; picker.current?.abort(); local.current?.dispose(); }; }, []);
  const onReady = useCallback((value: boolean, seconds: number) => { setReady(value); setDuration(seconds); }, []);
  async function pick(camera: boolean) {
    if (locked || pickingLock.current) return;
    pickingLock.current = true; setPicking(true); setError(''); const controller = new AbortController(); picker.current = controller;
    try {
      const chosen = await selectRecordVideo(camera, controller.signal, MOBILE_SHIFT_VIDEO_SECONDS);
      if (!chosen) return;
      if (!alive.current) { chosen.dispose(); return; }
      local.current?.dispose(); local.current = chosen; setReady(false); setDuration(0); setVideo(chosen);
    } catch (cause) { if (alive.current) setError((cause as Error).message); }
    finally { pickingLock.current = false; if (alive.current) setPicking(false); }
  }
  const report = query.data, permissions = session!.user.permissions;
  const writable = !!report && (stage === 'pgd' ? report.status === 'draft' && permissions.some(p => p === 'contracts.draft' || p === 'finance.write') : report.status === 'submitted' && report.audit?.status !== 'confirmed' && permissions.includes('shift.review'));
  const count = report?.media?.filter(m => m.stage === stage && m.mime_type.startsWith('video/')).length || 0;
  const valid = ready && Number.isFinite(duration) && duration > 0 && duration <= MOBILE_SHIFT_VIDEO_SECONDS;
  const label = SHIFT_PHOTOS.find(([key]) => key === category)?.[1], stageLabel = stage === 'pgd' ? 'PGD kiểm kê' : 'KTNB đối soát';
  const text = { color: theme.muted, fontSize: 16, lineHeight: 25 };
  return <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: theme.background }}>
    <ScrollView contentContainerStyle={{ padding: 20, gap: 18, maxWidth: 760, width: '100%', alignSelf: 'center' }}>
      <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 25, fontWeight: '800' }}>Thêm video minh chứng ca</Text>
      {!!(error || write.error) && <InlineError message={error || write.error} />}
      {!!write.notice && <Text accessibilityLiveRegion="polite" style={text}>{write.notice}</Text>}
      {!!write.stage && <Text accessibilityLiveRegion="polite" style={text}>{write.stage}</Text>}
      {write.key ? <Card style={{ gap: 14 }}>
        <Text style={{ color: theme.text, fontSize: 20, fontWeight: '700' }}>Video đang chờ đối chiếu</Text>
        <Text style={text}>Giữ mã lần gửi đến khi đọc được xác nhận gốc hoặc máy chủ xác nhận chưa lưu. Video đã chọn vẫn được giữ khi ở màn hình này.</Text>
        <Button label="Đối chiếu lưu video ca" loading={write.busy} onPress={() => setResolving(true)} />
        <Button label="Mở xác nhận lưu video ca" secondary disabled={write.busy} onPress={write.openResult} />
      </Card> : <>
        {query.isFetching && <Text style={text}>Đang đọc báo cáo ca…</Text>}
        {query.isError && <InlineError message={query.error.message} />}
        {report && <>
          <Card style={{ gap: 8 }}>
            <Text style={{ color: theme.text, fontSize: 20, fontWeight: '700' }}>{report.store_name}</Text>
            <Text style={text}>Ngày ca: {report.payload.date} · {report.status === 'draft' ? 'PGD chưa chốt' : 'PGD đã chốt'}</Text>
            <Text style={text}>{stageLabel} · {count}/3 video đã lưu</Text>
          </Card>
          <ChoiceField label="Phần video ca" value={stage} choices={[{ value: 'pgd', label: 'PGD kiểm kê' }, { value: 'audit', label: 'KTNB đối soát' }]} disabled={locked || !!video} onChange={v => setStage(v as 'pgd' | 'audit')} />
          <ChoiceField label="Mục video minh chứng ca" value={category} choices={SHIFT_PHOTOS.map(([value, label]) => ({ value, label }))} disabled={locked || !!video} onChange={setCategory} />
          {!writable && <InlineError message="Phần này đang khóa theo trạng thái báo cáo hoặc quyền hiện tại. Tải lại báo cáo để kiểm tra." />}
          {count >= 3 && <InlineError message="Phần này đã đủ 3 video. Quay lại hồ sơ để kiểm tra hoặc xóa video trước khi thêm." />}
          <Card style={{ gap: 14 }}>
            <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 20, fontWeight: '700' }}>Video chờ lưu</Text>
            <Text style={text}>Tối đa 3 phút và 45 MB mỗi video. Mỗi phần PGD / KTNB được lưu tối đa 3 video, tính chung tất cả mục.</Text>
            {video && <><RecordVideoPlayer key={video.uri} source={{ uri: video.uri, useCaching: false }} label="Video ca đang chọn" onReady={onReady} /><Text style={text}>{(video.size / 1024 / 1024).toFixed(1)} MB · {duration > 0 ? `${Math.ceil(duration)} giây` : 'Đang đọc thời lượng'}</Text></>}
            {video && ready && !valid && <InlineError message="Video ca cần có thời lượng trên 0 đến 180 giây. Chọn tệp khác." />}
            <Button label="Chọn video ca" secondary loading={picking} disabled={locked || !writable || count >= 3} onPress={() => void pick(false)} />
            <Button label="Quay video ca" secondary disabled={locked || !writable || count >= 3 || Platform.OS === 'web'} onPress={() => void pick(true)} />
            {video && <Button label="Bỏ video ca chưa lưu" secondary disabled={locked} onPress={() => { local.current?.dispose(); local.current = null; setVideo(null); setReady(false); setDuration(0); setError(''); }} />}
          </Card>
          <Button label="Rà soát và lưu video ca" disabled={locked || !video || !valid || !writable || count >= 3 || query.isFetching || query.isError} onPress={() => setReview({ revision: report.revision, stage, category })} />
        </>}
        <Button label="Tải lại báo cáo để rà soát video" secondary loading={query.isFetching} disabled={locked} onPress={() => void query.refetch()} />
        {!write.checked && <Button label="Đọc lại mã lưu video ca" secondary loading={write.busy} onPress={() => void write.check()} />}
      </>}
    </ScrollView>
    {review && video && report && <ConfirmEdit title="Lưu video vào báo cáo ca?" message={`${report.store_name} · ${report.payload.date}\n${stageLabel} · ${label}\n${Math.ceil(duration)} giây · ${(video.size / 1024 / 1024).toFixed(1)} MB\nThêm video thứ ${count + 1}/3 của phần này. Báo cáo phải còn đúng phiên bản ${review.revision}.`} confirmLabel="Xác nhận lưu video ca" onCancel={() => setReview(null)} onConfirm={() => { setReview(null); void write.submit(review, video); }} />}
    {resolving && <ConfirmEdit title="Đối chiếu lưu video ca?" message="Nếu đã lưu, mở xác nhận gốc. Nếu chưa lưu, máy chủ khóa mã cũ. Video đã chọn được giữ để rà soát và gửi lại." confirmLabel="Đối chiếu với máy chủ" onCancel={() => setResolving(false)} onConfirm={() => { setResolving(false); void write.resolve().then(cancelled => { if (cancelled && alive.current) void query.refetch(); }); }} />}
    {write.exit && <ConfirmEdit title="Rời video ca?" busy={write.busy || picking} message={write.busy ? 'Đang xử lý video. Chờ xác nhận kết quả.' : 'Video chưa lưu sẽ cần chọn lại. Mã đã gửi vẫn được giữ để đối chiếu trong Tài khoản.'} confirmLabel="Rời video ca" onCancel={write.dismissExit} onConfirm={write.leave} />}
  </SafeAreaView>;
}
