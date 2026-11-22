import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { FlatList, Linking, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { uuid } from 'expo';
import { Image } from 'expo-image';
import { useSession } from '@/providers/session';
import { useWorkspace } from '@/hooks/use-workspace';
import { Button, Card, InlineError, StateView } from '@/components/ui';
import { ChoiceField } from '@/components/form-fields';
import { DateField } from '@/components/date-field';
import { EditorSheet } from '@/components/editor-sheet';
import { captureAttendancePhoto, locateAttendance } from '@/lib/attendance-capture';
import { loadAttendancePending, storeAttendancePending, clearAttendancePending, discardAttendancePending, refreshAttendancePendingLocation, type AttendancePending } from '@/lib/attendance-pending';
import type { RecordMediaPhoto } from '@/lib/record-media-photo';
import { supportFormData } from '@/lib/support-form-data';
import { dutyToday } from '../../../shared/mobile-duty-roster';
import type { AttendanceLocation, AttendanceEntry } from '../../../shared/mobile-support';
import { AttendanceEdit } from './attendance-edit';
import { FilteredListExport } from './filtered-list-export';
import { dateTime, useTheme } from '@/theme';

export function AttendanceScreen({ historyOnly = false }: { historyOnly?: boolean }) {
  const { api, session } = useSession(), workspace = useWorkspace(), theme = useTheme();
  const actor = session!.user.id, origin = api!.origin;
  const today = dutyToday(), [from, setFrom] = useState(today.slice(0, 7) + '-01'), [to, setTo] = useState(today), [store, setStore] = useState('all'), [page, setPage] = useState(1);
  const [action, setAction] = useState<'in' | 'out' | null>(null), [photo, setPhoto] = useState<RecordMediaPhoto | null>(null), [location, setLocation] = useState<AttendanceLocation | null>(null), [locating, setLocating] = useState(false);
  const [pending, setPending] = useState<AttendancePending | null>(null), [restoring, setRestoring] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [evidence, setEvidence] = useState<string | null>(null);
  const lock = useRef(false), alive = useRef(true), camera = useRef<AbortController | null>(null), currentPhoto = useRef(photo);
  const clockSessionRef = useRef(0), initialLocationRef = useRef<Promise<AttendanceLocation | Error> | null>(null);
  function startClock(nextAction: 'in' | 'out') {
    const token = ++clockSessionRef.current;
    setAction(nextAction);
    setLocation(null);
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
  const [editing, setEditing] = useState<AttendanceEntry | null>(null);
  const query = useQuery({ queryKey: ['attendance', session!.user.id, session!.user.storeId, session!.user.permissions.join(','), historyOnly, from, to, store, page], queryFn: async ({ signal }) => historyOnly ? api!.attendance(new URLSearchParams({ from, to, store, page: String(page) }).toString(), signal) : { ...await api!.attendanceOverview(signal), rows: [] as AttendanceEntry[], total: 0, page: 1 }, enabled: !!api && (!historyOnly || from <= to) });
  const { server_now: serverNow } = query.data ?? {};
  const { dataUpdatedAt, refetch } = query;
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
  async function acknowledge(id: string) { await clearAttendancePending(session!.user.id, id); setPending(null); setAction(null); setLocation(null); photo?.dispose(); setPhoto(null); setNotice('Máy chủ đã xác nhận chấm công.'); await query.refetch(); }
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
    }
    setLocating(true);
    try {
      const fresh = await locateAttendance();
      if (alive.current) setLocation(fresh);
      return fresh;
    } finally {
      if (alive.current) setLocating(false);
    }
  }
  async function save() {
    let attempt = pending;
    if (!attempt) {
      if (!action || !photo) throw Error('Chụp ảnh hiện tại trước khi xác nhận chấm công.');
      const gps = await resolveClockLocation();
      attempt = await storeAttendancePending(session!.user.id, api!.origin, { id: uuid.v4().toLowerCase(), action, photo, location: gps }); setPending(attempt);
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
    const body = await supportFormData({ action: attempt.action, request_id: attempt.id, location: JSON.stringify(attempt.location) }, attempt.photo);
    await api!.clockAttendance(body); await acknowledge(attempt.id);
  }
  const copy = (text: string) => <Text style={{ color: theme.muted, fontSize: 15, lineHeight: 23 }}>{text}</Text>;
  return <>
    <FlatList data={historyOnly?query.data?.rows||[]:[]} keyExtractor={row=>String(row.id)} contentContainerStyle={{padding:20,gap:16,maxWidth:800,width:'100%',alignSelf:'center'}} refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={()=>{void query.refetch();}} tintColor={theme.primary}/>}
      ListHeaderComponent={<View style={{gap:18}}>
        <Button secondary label={historyOnly?'Chấm công':'Lịch sử chấm công'} disabled={busy} onPress={()=>router.push(historyOnly?'/attendance':'/attendance-history')}/>
        {!historyOnly&&<>
        <Button secondary label="Đăng ký ca trong tuần" disabled={busy} onPress={()=>router.push("/self-shift-registration")}/>
        {canReview&&<Button secondary label="Bảng đăng ký ca" disabled={busy} onPress={()=>router.push('/shift-registrations')}/>}
        <Button secondary label="Cài đặt GPS chấm công" disabled={busy} onPress={()=>router.push('/attendance-locations')}/>
        <Text accessibilityRole="header" style={{color:theme.text,fontSize:28,fontWeight:'800'}}>Chấm công</Text>
        <Card style={{gap:14}}>
          <Text style={{color:theme.text,fontSize:20,fontWeight:'700'}}>{query.data?.staff?.name||session!.user.name}</Text>
          {serverNow&&copy(`Giờ máy chủ (VN): ${dateTime(serverNow)}`)}
          {query.data?.staff&&copy(`Cơ sở chấm công: ${query.data.staff.store_name||'Chưa gắn cơ sở'}`)}
          {copy(query.data?.open?'Đang trong ca · Vào lúc '+dateTime(query.data.open.clock_in_at):query.data?.latest?`Ca gần nhất hôm nay: ${dateTime(query.data.latest.clock_in_at)}${query.data.latest.clock_out_at?' → '+dateTime(query.data.latest.clock_out_at):''}`:'Chưa có ca đang mở')}
          {query.data&&(query.data.shift_code==='G1+G3'&&!query.data.latest?copy('Ca G1+G3 · 08:00–12:00 · 17:00–21:00'):query.data.shift?copy(`Ca ${query.data.shift.shift_name==='O'?'Nghỉ':query.data.shift.shift_name} · ${dateTime(query.data.shift.starts_at)} → ${dateTime(query.data.shift.ends_at)}`):query.data.shift_code==='O'?copy('Ca đăng ký: Nghỉ'):<>
            {copy('Chưa đăng ký ca hôm nay')}
            {canReview&&<Button size="sm" secondary label="Mở bảng đăng ký ca" onPress={()=>router.push({pathname:'/shift-registrations',params:{date:today,staff:query.data?.staff?.name||''}})}/>}
          </>)}
          {query.data?.late_minutes!==null&&query.data?.late_minutes!==undefined&&copy(query.data.late_minutes?`Đi muộn ${query.data.late_minutes} phút`:'Đúng giờ theo ca đăng ký')}
          {query.data?.early_leave_minutes!==null&&query.data?.early_leave_minutes!==undefined&&copy(query.data.early_leave_minutes?`Về sớm ${query.data.early_leave_minutes} phút`:'Đủ giờ theo ca đăng ký')}
          {pending?<><InlineError message={`Có lần ${pending.action==='in'?'vào':'ra'} ca chưa xác nhận. Giữ mã ${pending.id} để đối chiếu.`}/><Button label="Đối chiếu lần chấm đang chờ" loading={busy} onPress={()=>{void run(resolve);}}/>{!pendingIsFromPriorDay&&<Button secondary label="Thử lại cùng lần chấm công" disabled={busy} onPress={()=>{void run(save);}}/>}<Button secondary label={pendingIsFromPriorDay?'Chấm công cho ngày mới':`Chụp lại ảnh để ${pending.action==='in'?'vào ca':'ra ca'} ngay`} disabled={busy} onPress={()=>{void run(restartFromPending);}}/></>:<Button label={query.data?.open?'Ra ca':'Vào ca'} disabled={restoring||busy||query.isError||!query.data?.staff||(!query.data.open&&query.data.staff.store_id===null)} onPress={()=>{startClock(query.data?.open?'out':'in');}}/>}
          {query.data&&!query.data.staff&&copy('Tài khoản chưa liên kết với một nhân viên đang hoạt động. Liên hệ quản lý nhân sự.')}
          {query.data?.staff&&query.data.staff.store_id===null&&!query.data.open&&copy('Nhân viên chưa được gắn cơ sở. Liên hệ quản lý nhân sự trước khi chấm công.')}
          {copy('Chấm công cần mạng, ảnh hiện tại và GPS. Giờ được ghi theo máy chủ; ảnh không tự gửi nền.')}
        </Card>
        {!!notice&&<Text accessibilityLiveRegion="polite" style={{color:theme.success,lineHeight:23}}>{notice}</Text>}
        {!!error&&!action&&<InlineError message={error}/>}
        </>}
        {historyOnly && <>
          <Card style={{ gap: 14 }}><Text accessibilityRole="header" style={{ color: theme.text, fontSize: 19, fontWeight: '700' }}>Lịch sử chấm công</Text>
            <DateField label="Từ ngày chấm công" value={from} onChange={value => { setFrom(value); setPage(1); }} />
            <DateField label="Đến ngày chấm công" value={to} onChange={value => { setTo(value); setPage(1); }} />
            <Button secondary label="Tháng này" disabled={query.isFetching} onPress={() => { const current = dutyToday(); setFrom(current.slice(0, 7) + '-01'); setTo(current); setPage(1); }} />
            {canReview && <ChoiceField label="Cơ sở chấm công" value={store} choices={[{ value: 'all', label: 'Tất cả cơ sở được phép' }, ...(workspace.data?.stores || []).map(item => ({ value: String(item.id), label: item.name }))]} onChange={value => { setStore(value); setPage(1); }} />}
            {copy(canReview ? 'Xem lịch sử của mình và nhân sự trong phạm vi cơ sở được cấp.' : 'Chỉ hiển thị lịch sử của tài khoản đang đăng nhập.')}
            {from > to && <InlineError message="Ngày kết thúc phải bằng hoặc sau ngày bắt đầu." />}
          </Card>
          {query.data?.rows.some(row => row.can_manage) && <FilteredListExport kind="attendance" label="Tải Excel theo nhân sự" filters={new URLSearchParams({ from, to, store }).toString()} disabled={query.isFetching || query.isError} />}
        </>}
        {query.isError && <StateView title="Chưa tải được chấm công" message={query.error.message} retry={() => { void query.refetch(); }} />}
        {query.isPending && from <= to && <StateView title="Đang tải chấm công" loading />}
      </View>}
      renderItem={({item:row})=><Card style={{gap:10}}>
        <Text style={{color:theme.text,fontSize:18,fontWeight:'700'}}>{row.staff_name}</Text>
        {copy(row.store_name||'Chưa có cơ sở')}{copy(`Vào ca: ${dateTime(row.clock_in_at)}`)}{copy(row.clock_out_at?`Ra ca: ${dateTime(row.clock_out_at)}`:'Chưa chấm công ra')}
        {copy(`Ca đăng ký: ${row.shift_name==='O'?'Nghỉ':row.shift_name||'Chưa đăng ký ca'}${row.scheduled_in&&row.scheduled_out?` (${dateTime(row.scheduled_in)} → ${dateTime(row.scheduled_out)})`:''}`)}
        {!row.shift_name&&canReview&&<Button size="sm" secondary label="Đăng ký ca cho ngày này" onPress={()=>router.push({pathname:'/shift-registrations',params:{date:row.clock_in_at.slice(0,10),staff:row.staff_name}})}/>}
        {row.late_minutes!==null&&copy(row.late_minutes?`Đi muộn ${row.late_minutes} phút`:'Đúng giờ')}
        {typeof row.standard_credit==='number'&&copy(`Công quy định: ${row.standard_credit.toLocaleString('vi-VN')}`)}
        {row.early_leave_minutes!=null&&copy(row.early_leave_minutes?`Về sớm ${row.early_leave_minutes} phút`:'Không về sớm')}
        {copy(`Công thực tế: ${row.earned_credit!=null?row.earned_credit.toLocaleString('vi-VN',{maximumFractionDigits:4}):row.credit_on_other_row?'Gộp cùng ca':row.standard_credit==null?'Chưa đăng ký ca':'Chưa chốt'}${row.credit_aggregated?' · Tổng hợp cùng ca':''}`)}
        {row.can_manage&&<Button secondary label="Sửa chấm công" onPress={()=>setEditing(row)}/>}
        {evidence===String(row.id)&&<View style={{gap:6}}>{copy(row.store_from_profile?'Cơ sở tham chiếu từ hồ sơ nhân viên':'Cơ sở ghi nhận khi chấm công')}{copy(`Khoảng cách vào ca đến cơ sở: ${row.in_distance_m!=null?row.in_distance_m.toLocaleString('vi-VN')+' m':row.has_store_location?'Chưa có GPS để tính':'Cơ sở chưa cấu hình tọa độ'}`)}{row.clock_out_at&&copy(`Khoảng cách ra ca đến cơ sở: ${row.out_distance_m!=null?row.out_distance_m.toLocaleString('vi-VN')+' m':row.has_store_location?'Chưa có GPS để tính':'Cơ sở chưa cấu hình tọa độ'}`)}{row.clock_out_at&&row.has_out_photo===false&&copy('Không có ảnh ra ca.')}</View>}
        <Button secondary label={`${evidence===String(row.id)?'Ẩn':'Xem'} ảnh và GPS #${row.id}`} onPress={()=>setEvidence(current=>current===String(row.id)?null:String(row.id))}/>
        {evidence===String(row.id)&&(['in','out'] as const).map(side=>{const hasSide=side==='in'||Boolean(row.clock_out_at);if(!hasSide)return null;const loc=side==='in'?row.in_location:row.out_location;const hasPhoto=side==='in'||row.has_out_photo!==false;const photoSource=hasPhoto?api!.supportPhoto('attendance',String(row.id),side):null;return <View key={side} style={{gap:8}}><Text style={{color:theme.text,fontWeight:'700'}}>{side==='in'?'Vào ca':'Ra ca'}</Text>{photoSource?<Image cachePolicy="memory" source={{...photoSource,cacheKey:JSON.stringify([session!.user.id,session!.user.storeId,session!.user.allStores,session!.sessionId||session!.expiresAt,photoSource.uri])}} style={{width:'100%',aspectRatio:4/3,borderRadius:12}} contentFit="contain" accessibilityLabel={`Ảnh ${side==='in'?'vào':'ra'} ca #${row.id}`}/>:copy('Chưa có ảnh chấm công.')}{loc?<>{copy(`GPS ${loc.latitude.toFixed(6)}, ${loc.longitude.toFixed(6)} · sai số ${Math.round(loc.accuracy)} m`)}<Button size="sm" secondary label="Mở vị trí trên Google Maps" onPress={()=>void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${loc.latitude},${loc.longitude}`)}`)} /></>:copy('Chưa ghi nhận GPS')}</View>;})}
      </Card>}
      ListEmptyComponent={historyOnly && !query.isPending && !query.isError ? <Text style={{ color: theme.muted, textAlign: 'center', padding: 20 }}>Chưa có chấm công trong khoảng ngày đã chọn.</Text> : undefined}
      ListFooterComponent={historyOnly && query.data && query.data.total > 50 ? <View style={{ gap: 10 }}>{copy(`Trang ${query.data.page} · ${query.data.total} lần chấm công`)}<Button secondary label="Trang chấm công trước" disabled={page <= 1 || query.isFetching} onPress={() => setPage(value => value - 1)} /><Button secondary label="Trang chấm công sau" disabled={page * 50 >= query.data!.total || query.isFetching} onPress={() => setPage(value => value + 1)} /></View> : undefined} />
    {editing && <AttendanceEdit row={editing} onClose={() => setEditing(null)} onReload={() => { setEditing(null); void query.refetch(); }} />}
    {action && <EditorSheet title={action === 'in' ? 'Chấm công vào ca' : 'Chấm công ra ca'} onClose={() => { if (!busy) { clockSessionRef.current++; initialLocationRef.current = null; setLocating(false); setAction(null); if (!pending) { photo?.dispose(); setPhoto(null); setLocation(null); } } }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        {copy(locating ? 'Đang tự động lấy vị trí GPS… Nếu thiết bị hỏi quyền vị trí, hãy chọn Cho phép. Bạn có thể chụp ảnh ngay trong lúc chờ.' : 'Chụp ảnh hiện tại để xác nhận chấm công. Vị trí gần nhất (trong 60 giây) sẽ được dùng ngay khi xác nhận.')}
        {(pending?.photo || photo) && <Image cachePolicy="none" source={{ uri: (pending?.photo || photo)!.uri }} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 12 }} contentFit="contain" accessibilityLabel="Ảnh chấm công vừa chụp" />}
        <Button secondary label={photo ? 'Chụp lại ảnh hiện tại' : 'Chụp ảnh hiện tại'} disabled={busy || !!pending} onPress={() => { void run(async () => { const controller = new AbortController(); camera.current = controller; const next = await captureAttendancePhoto(controller.signal); if (next) { if (!alive.current) { next.dispose(); return; } photo?.dispose(); setPhoto(next); } }); }} />
        <Button secondary label={locating ? 'Đang lấy vị trí GPS…' : location ? 'Lấy lại GPS' : 'Lấy vị trí GPS'} disabled={busy || locating || !!pending} loading={locating && !busy} onPress={() => { void run(async () => { setLocating(true); try { const next = await locateAttendance(); if (alive.current) setLocation(next); } finally { if (alive.current) setLocating(false); } }); }} />
        {(pending?.location || location) && <View style={{ gap: 6 }}>
          {copy(`Đã lấy GPS · sai số khoảng ${Math.round((pending?.location || location)!.accuracy)} m`)}
          <Button secondary label="Xem vị trí hiện tại trên Google Maps" onPress={() => {
            const coords = (pending?.location || location);
            if (coords) void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${coords.latitude},${coords.longitude}`)}`);
          }} />
        </View>}
        {!!error && <InlineError message={error} />}
        {pending && copy('Ảnh và mã gốc được giữ trên máy. Thử lại sẽ đối chiếu kết quả trước khi gửi.')}
        <Button label={locating && busy ? 'Đang lấy vị trí…' : action === 'in' ? 'Xác nhận vào ca' : 'Xác nhận ra ca'} disabled={!pending && !photo} loading={busy} onPress={() => { void run(save); }} />
        {!pending && !photo && copy('Chụp ảnh hiện tại để bật nút xác nhận chấm công.')}
      </ScrollView>
    </EditorSheet>}
  </>;
}
