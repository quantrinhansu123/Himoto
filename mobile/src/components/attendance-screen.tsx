import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { FlatList, Linking, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { uuid } from 'expo';
import { fetch as expoFetch } from 'expo/fetch';
import { File as ExpoFile } from 'expo-file-system';
import { Image } from 'expo-image';
import { CalendarDays, Camera, Clock3, History, MapPin, SlidersHorizontal } from 'lucide-react-native';
import { useSession } from '@/providers/session';
import { useWorkspace } from '@/hooks/use-workspace';
import { Button, Card, Chip, InfoBanner, InlineError, KeyValueRow, PaginationBar, SkeletonList, StateView, StatusBadge } from '@/components/ui';
import { ChoiceField, FormField } from '@/components/form-fields';
import { DateField } from '@/components/date-field';
import { ConfirmEdit, EditorSheet } from '@/components/editor-sheet';
import { ApiError } from '@/lib/api';
import { captureAttendancePhoto, locateAttendance } from '@/lib/attendance-capture';
import { loadAttendancePending, storeAttendancePending, clearAttendancePending, discardAttendancePending, refreshAttendancePendingLocation, type AttendancePending } from '@/lib/attendance-pending';
import type { RecordMediaPhoto } from '@/lib/record-media-photo';
import { supportFormData } from '@/lib/support-form-data';
import { dutyToday } from '../../../shared/mobile-duty-roster';
import { canReviewAttendance } from '../../../shared/access-permissions';
import { isAttendanceReceipt, type AttendanceLocation, type AttendanceEntry } from '../../../shared/mobile-support';
import { AttendanceEdit } from './attendance-edit';
import { FilteredListExport } from './filtered-list-export';
import { dateTime, useTheme } from '@/theme';

export function AttendanceScreen({ historyOnly = false }: { historyOnly?: boolean }) {
  const { api, session } = useSession(), workspace = useWorkspace(), theme = useTheme();
  const actor = session!.user.id, origin = api!.origin;
  const today = dutyToday(), [from, setFrom] = useState(today.slice(0, 7) + '-01'), [to, setTo] = useState(today), [store, setStore] = useState('all'), [page, setPage] = useState(1);
  const [action, setAction] = useState<'in' | 'out' | null>(null), [photo, setPhoto] = useState<RecordMediaPhoto | null>(null), [location, setLocation] = useState<AttendanceLocation | null>(null), [locating, setLocating] = useState(false), [punchNote, setPunchNote] = useState('');
  const [pending, setPending] = useState<AttendancePending | null>(null), [restoring, setRestoring] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [evidence, setEvidence] = useState<string | null>(null);
  const lock = useRef(false), alive = useRef(true), camera = useRef<AbortController | null>(null), currentPhoto = useRef(photo);
  const clockSessionRef = useRef(0), initialLocationRef = useRef<Promise<AttendanceLocation | Error> | null>(null);
  function startClock(nextAction: 'in' | 'out') {
    const token = ++clockSessionRef.current;
    setAction(nextAction);
    setLocation(null);
    setPunchNote('');
    setError('');
    setNotice('');
    setLocating(true);
    const promise = locateAttendance().catch((cause: unknown) => cause instanceof Error ? cause : Error('Chưa lấy được tín hiệu GPS. Vui lòng thử lại.'));
    initialLocationRef.current = promise;
    void promise.then(result => {
      if (!alive.current || clockSessionRef.current !== token) return;
      setLocating(false);
      if (result instanceof Error) setError(result.message);
      else setLocation(result);
    });
  }
  useEffect(() => { currentPhoto.current = photo; }, [photo]);
  const canReview = session!.user.permissions.includes('hr.read');
  const canReviewOther = canReviewAttendance(session!.user);
  const historyStore = canReviewOther ? store : 'all';
  const [editing, setEditing] = useState<AttendanceEntry | null>(null);
  const [deleting, setDeleting] = useState<AttendanceEntry | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const query = useQuery({ queryKey: ['attendance', session!.user.id, session!.user.storeId, session!.user.permissions.join(','), canReviewOther, historyOnly, from, to, historyStore, page], queryFn: async ({ signal }) => historyOnly ? api!.attendance(new URLSearchParams({ from, to, store: historyStore, page: String(page) }).toString(), signal) : { ...await api!.attendanceOverview(signal), rows: [] as AttendanceEntry[], total: 0, page: 1 }, enabled: !!api && (!historyOnly || from <= to) });
  const { server_now: serverNow } = query.data ?? {};
  const { dataUpdatedAt, refetch } = query;
  const [clockTick, setClockTick] = useState(() => Date.now());
  useEffect(() => {
    if (historyOnly || !serverNow) return;
    setClockTick(Date.now());
    const id = setInterval(() => setClockTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [historyOnly, serverNow]);
  const liveClockLabel = serverNow
    ? new Intl.DateTimeFormat('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour12: false,
      }).format(new Date(Date.parse(serverNow) + Math.max(0, clockTick - dataUpdatedAt)))
    : '';
  const pendingIsFromPriorDay = Boolean(pending && serverNow &&
    dutyToday(new Date(pending.location.timestamp)) < dutyToday(new Date(serverNow)));
  useEffect(() => {
    if (historyOnly || !serverNow) return;
    const nextMidnight = Date.parse(dutyToday(new Date(serverNow)) + 'T00:00:00+07:00') + 86400000;
    const delay = nextMidnight - Date.parse(serverNow) - (Date.now() - dataUpdatedAt);
    const timer = setTimeout(() => {
      setAction(null);
      void refetch();
    }, Math.max(1000, delay));
    return () => clearTimeout(timer);
  }, [historyOnly, serverNow, dataUpdatedAt, refetch]);
  useEffect(() => { alive.current = true; void loadAttendancePending(actor, origin).then(value => { if (alive.current) setPending(value); }).catch(failure => { if (alive.current) setError(failure.message); }).finally(() => { if (alive.current) setRestoring(false); }); return () => { alive.current = false; camera.current?.abort(); currentPhoto.current?.dispose(); }; }, [actor, origin]);
  async function run(job: () => Promise<void>) { if (lock.current) return; lock.current = true; setBusy(true); setError(''); try { await job(); } catch (failure) { if (alive.current) setError((failure as Error).message); } finally { lock.current = false; if (alive.current) setBusy(false); } }
  async function acknowledge(id: string) { await clearAttendancePending(session!.user.id, id); setPending(null); setAction(null); setLocation(null); setPunchNote(''); photo?.dispose(); setPhoto(null); setNotice('Máy chủ đã xác nhận chấm công.'); await query.refetch(); }
  async function resolve() { if (!pending) return; const result = await api!.resolveAttendance(pending.id); if (result.result) await acknowledge(pending.id); else setNotice('Máy chủ chưa ghi nhận mã này. Thử lại cùng lần chấm; không tạo mã mới.'); }
  async function restartFromPending() {
    if (!pending) return;
    let targetAction = pending.action;
    try {
      const result = await api!.resolveAttendance(pending.id);
      if (result.result) { await acknowledge(pending.id); return; }
    } catch { }
    if (pendingIsFromPriorDay) {
      const latest = await refetch({ throwOnError: true });
      targetAction = latest.data?.open ? 'out' : 'in';
    }
    await discardAttendancePending(session!.user.id, pending.id);
    setPending(null);
    photo?.dispose();
    setPhoto(null);
    setLocation(null);
    setNotice('');
    setError('');
    startClock(targetAction);
  }
  async function resolveClockLocation(): Promise<AttendanceLocation> {
    if (location && Math.abs(Date.now() - location.timestamp) < 60_000) return location;
    if (initialLocationRef.current) {
      const initial = await initialLocationRef.current;
      if (!(initial instanceof Error) && Math.abs(Date.now() - initial.timestamp) < 60_000) {
        if (alive.current) setLocation(initial);
        return initial;
      }
      initialLocationRef.current = null;
    }
    if (alive.current) {
      setError('');
      setLocating(true);
    }
    try {
      const fresh = await locateAttendance();
      if (alive.current) setLocation(fresh);
      return fresh;
    } finally {
      if (alive.current) setLocating(false);
    }
  }
  async function submitClockWithExpoFetch(attempt: AttendancePending) {
    const trimmedNote = attempt.note?.trim() || '';
    const form = new FormData();
    form.append('action', attempt.action);
    form.append('request_id', attempt.id);
    form.append('location', JSON.stringify(attempt.location));
    if (trimmedNote) form.append('note', trimmedNote);
    const file = new ExpoFile(attempt.photo.uri);
    if (!file.exists || file.size <= 0) {
      throw Error('Ảnh chấm công chờ không còn trên máy. Bấm "Chụp lại ảnh" để tạo lần chấm mới.');
    }
    form.append('photo', file, 'attendance.jpg');
    const authHeaders = api!.supportPhoto('attendance', '1').headers || {};
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45_000);
    try {
      const response = await expoFetch(`${api!.origin}/api/mobile/v1/attendance`, {
        method: 'POST',
        body: form,
        headers: { Accept: 'application/json', ...authHeaders },
        credentials: 'omit',
        redirect: 'error',
        signal: controller.signal,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new ApiError(
          typeof data?.message === 'string' ? data.message : 'Không ghi nhận được chấm công. Vui lòng thử lại.',
          response.status,
          typeof data?.code === 'string' ? data.code : 'REQUEST_FAILED',
        );
      }
      if (!isAttendanceReceipt(data)) {
        throw new ApiError('Dữ liệu phản hồi chấm công không hợp lệ.', 502, 'INVALID_RESPONSE');
      }
    } catch (cause) {
      if (cause instanceof ApiError) throw cause;
      throw new ApiError('Không kết nối được máy chủ chấm công.', 0, 'NETWORK');
    } finally {
      clearTimeout(timer);
    }
  }
  async function submitClockAttempt(attempt: AttendancePending) {
    const trimmedNote = attempt.note?.trim() || '';
    const buildBody = () => supportFormData({ action: attempt.action, request_id: attempt.id, location: JSON.stringify(attempt.location), ...(trimmedNote ? { note: trimmedNote } : {}) }, attempt.photo);
    try {
      await api!.clockAttendance(await buildBody());
      return;
    } catch (cause) {
      if (!(cause instanceof ApiError) || cause.status !== 0 || cause.code !== 'NETWORK') throw cause;
      // After returning from the system Camera app, Android (Xiaomi/Oppo/Vivo/Samsung) can drop idle OkHttp sockets.
      // Check if server already recorded this idempotent request_id, then retry using expo/fetch + native ExpoFile.
      await new Promise<void>(resolve => setTimeout(resolve, 900));
      try {
        const resolved = await api!.resolveAttendance(attempt.id);
        if (resolved.result) return;
      } catch {
        // Proceed to fresh native retry below.
      }
      try {
        await submitClockWithExpoFetch(attempt);
        return;
      } catch (retryCause) {
        if (retryCause instanceof ApiError && retryCause.status === 0 && retryCause.code === 'NETWORK') {
          try {
            const resolvedAfter = await api!.resolveAttendance(attempt.id);
            if (resolvedAfter.result) return;
          } catch {}
          throw Error('Mạng đang chập chờn nên chưa gửi được ảnh chấm công. Ảnh và mã chấm công đã được giữ trên máy — kiểm tra Wi-Fi/4G rồi bấm nút "Thử lại gửi chấm công" bên dưới.');
        }
        throw retryCause;
      }
    }
  }
  async function save() {
    let attempt = pending;
    if (!attempt) {
      if (!action || !photo) throw Error('Chụp ảnh hiện tại trước khi xác nhận chấm công.');
      const gps = await resolveClockLocation();
      const trimmedNote = punchNote.trim();
      attempt = await storeAttendancePending(session!.user.id, api!.origin, { id: uuid.v4().toLowerCase(), action, photo, location: gps, ...(trimmedNote ? { note: trimmedNote } : {}) }); setPending(attempt);
    } else {
      const result = await api!.resolveAttendance(attempt.id);
      if (result.result) { await acknowledge(attempt.id); return; }
      if (pendingIsFromPriorDay) throw Error('Lần chấm đang chờ thuộc ngày trước. Bấm Chấm công cho ngày mới.');
      if (Math.abs(Date.now() - attempt.location.timestamp) > 4 * 60000) {
        const refreshed = await locateAttendance();
        attempt = await refreshAttendancePendingLocation(actor, origin, attempt.id, refreshed); setPending(attempt);
      }
    }
    if (attempt.photo.size <= 0) throw Error('Ảnh chấm công chờ không còn trên máy. Bấm "Chụp lại ảnh" để tạo lần chấm mới.');
    await submitClockAttempt(attempt);
    await acknowledge(attempt.id);
  }
  async function confirmDelete() {
    if (!deleting || !api || deleteBusy) return;
    const target = deleting;
    setDeleteBusy(true);
    setError('');
    setNotice('');
    try {
      await api.manageAttendance('DELETE', {
        id: target.id,
        original_in: target.clock_in_at,
        original_out: target.clock_out_at,
      });
      if (!alive.current) return;
      setDeleting(null);
      setNotice(`Đã xóa lượt chấm công của ${target.staff_name}.`);
      await query.refetch();
    } catch (cause) {
      if (alive.current) {
        setDeleting(null);
        setError((cause as Error).message || 'Chưa xóa được lượt chấm công.');
      }
    } finally {
      if (alive.current) setDeleteBusy(false);
    }
  }
  const copy = (text: string) => <Text style={{ color: theme.muted, fontSize: 13.5, lineHeight: 20 }}>{text}</Text>;
  const shiftSummaryLabel = query.data
    ? query.data.shift_code === 'G1+G3' && !query.data.latest
      ? 'G1+G3 (08:00–12:00 · 17:00–21:00)'
      : query.data.shift
        ? `${query.data.shift.shift_name === 'O' ? 'Nghỉ' : query.data.shift.shift_name} (${dateTime(query.data.shift.starts_at)} → ${dateTime(query.data.shift.ends_at)})`
        : query.data.shift_code === 'O'
          ? 'Nghỉ (O)'
          : 'Chưa đăng ký ca hôm nay'
    : 'Đang tải…';
  return <>
    <FlatList data={historyOnly ? query.data?.rows || [] : []} keyExtractor={row => String(row.id)} contentContainerStyle={{ padding: 16, paddingBottom: 36, gap: 12, maxWidth: 760, width: '100%', alignSelf: 'center' }} refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => { void query.refetch(); }} tintColor={theme.primary} />}
      ListHeaderComponent={<View style={{ gap: 12 }}>
        {!historyOnly && <>
          {liveClockLabel ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <Text style={{ color: theme.muted, fontSize: 13 }}>Giờ máy chủ (VN)</Text>
              <Text style={{ color: theme.text, fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{liveClockLabel}</Text>
            </View>
          ) : null}
          {/* Hero Check-In / Check-Out Card FIRST above the fold */}
          {query.isPending && !query.data ? <SkeletonList count={1} lines={4} /> : <Card style={{ gap: 12, padding: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: theme.text, fontSize: 18, fontWeight: '800' }}>{query.data?.staff?.name || session!.user.name}</Text>
                <Text style={{ color: theme.muted, fontSize: 13 }}>{query.data?.staff?.store_name || 'Chưa gắn cơ sở chấm công'}</Text>
              </View>
              <StatusBadge status={query.data?.open ? 'active' : 'pending'} label={query.data?.open ? 'Đang trong ca' : 'Chưa vào ca'} />
            </View>
            <View style={{ borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 8, gap: 2 }}>
              <KeyValueRow label="Trạng thái hôm nay" strong value={query.data?.open ? `Vào lúc ${dateTime(query.data.open.clock_in_at)}` : query.data?.latest ? `${dateTime(query.data.latest.clock_in_at)}${query.data.latest.clock_out_at ? ' → ' + dateTime(query.data.latest.clock_out_at) : ''}` : 'Chưa chấm công hôm nay'} />
              <KeyValueRow label="Ca đăng ký" value={shiftSummaryLabel} />
              {query.data?.late_minutes !== null && query.data?.late_minutes !== undefined && <KeyValueRow label="Vào ca" valueColor={query.data.late_minutes ? theme.warning : theme.success} value={query.data.late_minutes ? `Đi muộn ${query.data.late_minutes} phút` : 'Đúng giờ'} />}
              {query.data?.early_leave_minutes !== null && query.data?.early_leave_minutes !== undefined && <KeyValueRow label="Ra ca" valueColor={query.data.early_leave_minutes ? theme.warning : theme.success} value={query.data.early_leave_minutes ? `Về sớm ${query.data.early_leave_minutes} phút` : 'Đủ giờ'} />}
            </View>
            {query.data && !query.data.shift && query.data.shift_code !== 'O' && query.data.shift_code !== 'G1+G3' && canReview && (
              <Button size="sm" secondary label="Đăng ký ca hôm nay trên bảng ca" onPress={() => router.push({ pathname: '/shift-registrations', params: { date: today, staff: query.data?.staff?.name || '' } })} />
            )}
            {pending ? <View style={{ gap: 8 }}>
              <InlineError message={`Có lần ${pending.action === 'in' ? 'vào' : 'ra'} ca chưa xác nhận. Giữ mã ${pending.id} để đối chiếu.`} />
              <Button label="Đối chiếu lần chấm đang chờ" loading={busy} onPress={() => { void run(resolve); }} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {!pendingIsFromPriorDay && <Button size="sm" equalWidth secondary label="Thử lại lần này" disabled={busy} onPress={() => { void run(save); }} />}
                <Button size="sm" equalWidth secondary label={pendingIsFromPriorDay ? 'Chấm ngày mới' : 'Chụp lại ảnh'} disabled={busy} onPress={() => { void run(restartFromPending); }} />
              </View>
            </View> : <Button icon={<Camera size={17} color={theme.primaryText} accessible={false} />} label={query.data?.open ? 'Chấm công ra ca' : 'Chấm công vào ca'} disabled={restoring || busy || query.isError || !query.data?.staff || (!query.data.open && query.data.staff.store_id === null)} onPress={() => { startClock(query.data?.open ? 'out' : 'in'); }} />}
            {query.data && !query.data.staff && <InfoBanner tone="warning" message="Tài khoản chưa liên kết với một nhân viên đang hoạt động. Liên hệ quản lý nhân sự." />}
            {query.data?.staff && query.data.staff.store_id === null && !query.data.open && <InfoBanner tone="warning" message="Nhân viên chưa được gắn cơ sở. Liên hệ quản lý nhân sự trước khi chấm công." />}
            <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 17 }}>Chấm công cần mạng, ảnh chụp trực tiếp và GPS. Giờ ghi theo máy chủ.</Text>
          </Card>}
          {/* Compact Horizontal Shortcut Strip */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            <Chip label="Lịch sử chấm công" icon={<History size={14} color={theme.text} />} disabled={busy} onPress={() => router.push('/attendance-history')} />
            <Chip label="Đăng ký ca trong tuần" icon={<CalendarDays size={14} color={theme.text} />} disabled={busy} onPress={() => router.push('/self-shift-registration')} />
            {canReview && <Chip label="Bảng đăng ký ca" icon={<Clock3 size={14} color={theme.text} />} disabled={busy} onPress={() => router.push('/shift-registrations')} />}
            <Chip label="Cài đặt" icon={<MapPin size={14} color={theme.text} />} disabled={busy} onPress={() => router.push('/attendance-locations')} />
          </ScrollView>
          {!!notice && <InfoBanner tone="success" message={notice} />}
          {!!error && !action && <InlineError message={error} />}
        </>}
        {historyOnly && <>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <Text style={{ color: theme.muted, fontSize: 13, flex: 1 }}>{from.split('-').reverse().join('/')} → {to.split('-').reverse().join('/')} · {query.data?.total ?? '—'} lượt</Text>
            <Button size="sm" label="Chấm công" disabled={busy} onPress={() => router.push('/attendance')} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            <Chip label={filtersOpen ? 'Ẩn bộ lọc' : 'Bộ lọc'} selected={filtersOpen || store !== 'all'} icon={<SlidersHorizontal size={14} color={filtersOpen || store !== 'all' ? theme.primary : theme.text} />} onPress={() => setFiltersOpen(v => !v)} />
            <Chip label="Tháng này" disabled={query.isFetching} onPress={() => { const current = dutyToday(); setFrom(current.slice(0, 7) + '-01'); setTo(current); setPage(1); }} />
            <Chip label="Hôm nay" disabled={query.isFetching} onPress={() => { const current = dutyToday(); setFrom(current); setTo(current); setPage(1); }} />
          </ScrollView>
          {canReviewOther && Boolean(query.data?.total) && (
            <FilteredListExport kind="attendance" label="Tải Excel theo nhân sự" filters={new URLSearchParams({ from, to, store: historyStore }).toString()} disabled={query.isFetching || query.isError} />
          )}
          {filtersOpen && <Card style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}><DateField label="Từ ngày" value={from} onChange={value => { setFrom(value); setPage(1); }} /></View>
              <View style={{ flex: 1 }}><DateField label="Đến ngày" value={to} onChange={value => { setTo(value); setPage(1); }} /></View>
            </View>
            {canReviewOther && <ChoiceField label="Cơ sở xem lịch sử" value={store} searchable choices={[{ value: 'all', label: 'Tất cả cơ sở được phép' }, ...(workspace.data?.stores || []).map(item => ({ value: String(item.id), label: item.name }))]} onChange={value => { setStore(value); setPage(1); }} />}
            {from > to && <InlineError message="Ngày kết thúc phải bằng hoặc sau ngày bắt đầu." />}
          </Card>}
          {!!notice && <InfoBanner tone="success" message={notice} />}
          {!!error && !action && <InlineError message={error} />}
        </>}
        {query.isError && <StateView title="Chưa tải được chấm công" message={query.error.message} retry={() => { void query.refetch(); }} />}
        {historyOnly && query.isPending && from <= to && <SkeletonList count={4} lines={3} />}
      </View>}
      renderItem={({ item: row }) => <Card style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800', flex: 1 }}>{row.staff_name}</Text>
          <StatusBadge status={row.clock_out_at ? 'completed' : 'active'} label={row.clock_out_at ? 'Đã ra ca' : 'Đang trong ca'} />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          <Text style={{ color: theme.muted, fontSize: 12.5 }}>{row.store_name || 'Chưa có cơ sở'}</Text>
          {row.can_manage && (row.in_gps_alert || row.out_gps_alert) && (
            <StatusBadge status="overdue" label="Lệch vị trí GPS (>200m)" />
          )}
        </View>
        <View style={{ gap: 2 }}>
          <KeyValueRow label="Vào ca" value={dateTime(row.clock_in_at)} />
          {!!row.in_location?.note && <KeyValueRow label="Ghi chú vào ca" value={row.in_location.note} />}
          <KeyValueRow label="Ra ca" value={row.clock_out_at ? dateTime(row.clock_out_at) : 'Chưa chấm ra'} />
          {!!row.out_location?.note && <KeyValueRow label="Ghi chú ra ca" value={row.out_location.note} />}
          <KeyValueRow label="Ca đăng ký" value={`${row.shift_name === 'O' ? 'Nghỉ' : row.shift_name || 'Chưa đăng ký'}${row.scheduled_in && row.scheduled_out ? ` (${dateTime(row.scheduled_in)} → ${dateTime(row.scheduled_out)})` : ''}`} />
          {row.late_minutes !== null && <KeyValueRow label="Trễ / sớm" valueColor={row.late_minutes ? theme.warning : theme.success} value={`${row.late_minutes ? `Muộn ${row.late_minutes}p` : 'Đúng giờ'}${row.early_leave_minutes ? ` · Sớm ${row.early_leave_minutes}p` : ''}`} />}
          <KeyValueRow label="Công thực tế" strong value={`${row.earned_credit != null ? row.earned_credit.toLocaleString('vi-VN', { maximumFractionDigits: 4 }) : row.credit_on_other_row ? 'Gộp cùng ca' : row.standard_credit == null ? 'Chưa đăng ký ca' : 'Chưa chốt'}${typeof row.standard_credit === 'number' ? ` / ${row.standard_credit.toLocaleString('vi-VN')}` : ''}`} />
        </View>
        <View style={{ gap: 8, paddingTop: 2 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button size="sm" equalWidth secondary label={`${evidence === String(row.id) ? 'Ẩn' : 'Xem'} ảnh & GPS`} onPress={() => setEvidence(current => current === String(row.id) ? null : String(row.id))} />
            {canReview && <Button size="sm" equalWidth secondary label="Đăng ký ca" onPress={() => router.push({ pathname: '/shift-registrations', params: { date: dutyToday(new Date(row.clock_in_at)), staff: row.staff_name } })} />}
          </View>
          {row.can_manage && (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button size="sm" equalWidth secondary label="Sửa giờ" disabled={deleteBusy} onPress={() => setEditing(row)} />
              <Button size="sm" equalWidth secondary danger label="Xóa" disabled={deleteBusy} onPress={() => setDeleting(row)} />
            </View>
          )}
        </View>
        {evidence === String(row.id) && <View style={{ gap: 6, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 8 }}>
          {row.can_manage && (
            <>
              <KeyValueRow label="Khoảng cách vào" valueColor={row.in_gps_alert ? theme.danger : undefined} strong={row.in_gps_alert} value={row.in_distance_m != null ? `${row.in_distance_m.toLocaleString('vi-VN')} m${row.in_gps_alert ? ' (Ngoài phạm vi)' : ''}` : row.has_store_location ? 'Chưa có GPS' : 'Cơ sở chưa có tọa độ'} />
              {row.clock_out_at && <KeyValueRow label="Khoảng cách ra" valueColor={row.out_gps_alert ? theme.danger : undefined} strong={row.out_gps_alert} value={row.out_distance_m != null ? `${row.out_distance_m.toLocaleString('vi-VN')} m${row.out_gps_alert ? ' (Ngoài phạm vi)' : ''}` : row.has_store_location ? 'Chưa có GPS' : 'Cơ sở chưa có tọa độ'} />}
            </>
          )}
          {row.clock_out_at && row.has_out_photo === false && copy('Không có ảnh ra ca.')}
        </View>}
        {evidence === String(row.id) && (['in', 'out'] as const).map(side => { const hasSide = side === 'in' || Boolean(row.clock_out_at); if (!hasSide) return null; const loc = side === 'in' ? row.in_location : row.out_location; const nearest = side === 'in' ? row.in_nearest_store : row.out_nearest_store; const hasPhoto = side === 'in' || row.has_out_photo !== false; const photoSource = hasPhoto ? api!.supportPhoto('attendance', String(row.id), side) : null; return <View key={side} style={{ gap: 8 }}><Text style={{ color: theme.text, fontWeight: '700', fontSize: 14 }}>{side === 'in' ? 'Ảnh vào ca' : 'Ảnh ra ca'}</Text>{photoSource ? <Image cachePolicy="memory" source={{ ...photoSource, cacheKey: JSON.stringify([session!.user.id, session!.user.storeId, session!.user.allStores, session!.sessionId || session!.expiresAt, photoSource.uri]) }} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 10 }} contentFit="contain" accessibilityLabel={`Ảnh ${side === 'in' ? 'vào' : 'ra'} ca #${row.id}`} /> : copy('Chưa có ảnh chấm công.')}{loc ? <>{nearest ? <Text style={{ color: theme.text, fontSize: 13.5, fontWeight: '700' }}>Cơ sở gần nhất: {nearest.store_name} · {Math.round(nearest.distance_m).toLocaleString('vi-VN')} m</Text> : nearest === null ? copy('Chưa có cơ sở được cấu hình tọa độ để đối chiếu.') : null}{!!loc.note && copy(`Ghi chú: ${loc.note}`)}{copy(`GPS ${loc.latitude.toFixed(6)}, ${loc.longitude.toFixed(6)} · sai số ${Math.round(loc.accuracy)} m`)}<Button size="sm" secondary label="Mở vị trí trên Google Maps" onPress={() => void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${loc.latitude},${loc.longitude}`)}`)} /></> : copy('Chưa ghi nhận GPS')}</View>; })}
      </Card>}
      ListEmptyComponent={historyOnly && !query.isPending && !query.isError ? <StateView title="Chưa có chấm công" message="Không có lượt chấm công trong khoảng ngày đã chọn." /> : undefined}
      ListFooterComponent={historyOnly && query.data && query.data.total > 50 ? <PaginationBar page={query.data.page} pages={Math.max(1, Math.ceil(query.data.total / 50))} total={query.data.total} unit="lượt" disabled={query.isFetching} onChange={setPage} /> : undefined} />
    {editing && <AttendanceEdit row={editing} onClose={() => setEditing(null)} onReload={() => { setEditing(null); void query.refetch(); }} />}
    {deleting && (
      <ConfirmEdit
        title="Xóa lượt chấm công?"
        message={`${deleting.staff_name} · Vào: ${dateTime(deleting.clock_in_at)} · Ra: ${deleting.clock_out_at ? dateTime(deleting.clock_out_at) : 'Chưa chấm ra'}\nXóa lượt chấm công này cùng ảnh và vị trí GPS đã ghi nhận?`}
        confirmLabel="Xóa lượt chấm công"
        busy={deleteBusy}
        onCancel={() => { if (!deleteBusy) setDeleting(null); }}
        onConfirm={() => { void confirmDelete(); }}
      />
    )}
    {action && <EditorSheet title={action === 'in' ? 'Chấm công vào ca' : 'Chấm công ra ca'} onClose={() => { if (!busy) { clockSessionRef.current++; initialLocationRef.current = null; setLocating(false); setAction(null); if (!pending) { photo?.dispose(); setPhoto(null); setLocation(null); } } }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        {copy(locating ? 'Đang tự động lấy vị trí GPS… Nếu thiết bị hỏi quyền vị trí, hãy chọn Cho phép. Bạn có thể chụp ảnh ngay trong lúc chờ.' : 'Chụp ảnh hiện tại để xác nhận chấm công. Vị trí gần nhất (trong 60 giây) sẽ được dùng ngay khi xác nhận.')}
        {(pending?.photo || photo) && <Image cachePolicy="none" source={{ uri: (pending?.photo || photo)!.uri }} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 12 }} contentFit="contain" accessibilityLabel="Ảnh chấm công vừa chụp" />}
        <Button secondary label={photo ? 'Chụp lại ảnh' : 'Chụp ảnh'} disabled={busy || !!pending} onPress={() => { void run(async () => { const controller = new AbortController(); camera.current = controller; const next = await captureAttendancePhoto(controller.signal); if (next) { if (!alive.current) { next.dispose(); return; } photo?.dispose(); setPhoto(next); } }); }} />
        <FormField label="Ghi chú (không bắt buộc)" value={pending?.note ?? punchNote} onChangeText={setPunchNote} editable={!busy && !pending} multiline maxLength={500} />
        <Button secondary label={locating ? 'Đang lấy vị trí GPS…' : location ? 'Lấy lại GPS' : 'Lấy vị trí GPS'} disabled={busy || locating || !!pending} loading={locating && !busy} onPress={() => { void run(async () => { setLocating(true); try { const next = await locateAttendance(); if (alive.current) setLocation(next); } finally { if (alive.current) setLocating(false); } }); }} />
        {(pending?.location || location) && <View style={{ gap: 6 }}>
          {copy(`Đã lấy GPS · sai số khoảng ${Math.round((pending?.location || location)!.accuracy)} m`)}
          <Button secondary label="Xem vị trí hiện tại trên Google Maps" onPress={() => {
            const coords = (pending?.location || location);
            if (coords) void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${coords.latitude},${coords.longitude}`)}`);
          }} />
        </View>}
        {!!error && <View style={{ gap: 8 }}>
          <InlineError message={error} />
          {/(GPS|vị trí|quyền)/i.test(error) && (
            <Button size="sm" secondary label="Mở cài đặt quyền vị trí" onPress={() => { void Linking.openSettings().catch(() => {}); }} />
          )}
        </View>}
        {pending && copy('Ảnh và mã chấm công đã được giữ trên máy. Bấm thử lại sẽ tự đối chiếu với máy chủ trước khi gửi.')}
        <Button label={locating && busy ? 'Đang lấy vị trí GPS…' : busy ? 'Đang gửi chấm công…' : pending ? 'Thử lại gửi chấm công' : action === 'in' ? 'Xác nhận vào ca' : 'Xác nhận ra ca'} disabled={!pending && !photo} loading={busy} onPress={() => { void run(save); }} />
        {pending && <Button secondary label="Đối chiếu lần chấm đang chờ" disabled={busy} onPress={() => { void run(resolve); }} />}
        {!pending && !photo && copy('Chụp ảnh hiện tại để bật nút xác nhận chấm công.')}
      </ScrollView>
    </EditorSheet>}
  </>;
}
