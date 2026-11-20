import {useEffect, useRef, useState} from 'react';
import {useQuery, useQueryClient} from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import {usePreventRemove} from 'expo-router';
import {uuid} from 'expo';
import {Linking, Platform, Text} from 'react-native';
import {locateAttendance} from '@/lib/attendance-capture';
import {ApiError} from '@/lib/api';
import {prepareRecordMediaAsset, type RecordMediaPhoto} from '@/lib/record-media-photo';
import {useSession} from '@/providers/session';
import {useTheme} from '@/theme';
import type {AttendanceLocation} from '../../../shared/mobile-support';
import type {ShiftReport} from '../../../shared/mobile-shift-reports';
import {compareShiftStock, isShiftStockDay, type ShiftStockCapture} from '../../../shared/shift-stock-check';
import {BillPhoto} from './bill-photo';
import {ConfirmEdit} from './editor-sheet';
import {Button, Card, InlineError} from './ui';

type Photo = { photo: RecordMediaPhoto; gps: AttendanceLocation };
const noCaptures: ShiftStockCapture[] = [];

export function ShiftStockPhotos({report, writable}: {report:ShiftReport; writable:boolean}) {
  const {api, session} = useSession(), theme = useTheme(), cache = useQueryClient();
  const currentDay = isShiftStockDay(report.payload.date);
  const canWrite = writable && Platform.OS !== 'web' && report.status === 'draft' &&
    (currentDay || report.stock_captures !== undefined);
  const queryKey = ['shift-stock-photos', session!.user.id, report.id] as const;
  const query = useQuery({queryKey, queryFn: ({signal}) => api!.shiftStock(report.id, signal), enabled: canWrite, retry: false});
  const [platePhoto, setPlatePhoto] = useState<Photo|null>(null), [busy, setBusy] = useState<'take'|'submit'|'delete'|null>(null);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [openId, setOpenId] = useState<number|null>(null), [remove, setRemove] = useState<ShiftStockCapture|null>(null);
  const [leave,setLeave] = useState<(()=>void)|null>(null);
  const [showSaved,setShowSaved] = useState(!canWrite);
  const file = useRef<Photo|null>(null), controller = useRef<AbortController|null>(null);
  const attempt = useRef<{key:string;revision:number}|null>(null);
  const captures = (canWrite ? query.data?.captures : undefined) ?? report.stock_captures ?? noCaptures;
  const comparison = query.data ? compareShiftStock(query.data.expected, captures) : null;
  const selected = captures.find(row => row.vehicle.id === openId);
  const allowLeave = usePreventRemove(!!busy || !!platePhoto, ({repeat})=>{
    if (!controller.current) setLeave(()=>repeat);
  });

  useEffect(() => () => {
    controller.current?.abort();
    file.current?.photo.dispose();
  }, []);

  if ((report.payload.report_type ?? 'end_shift') !== 'end_shift' ||
      !canWrite && !report.stock_captures?.length && report.status === 'submitted') return null;

  async function run(action: NonNullable<typeof busy>, task: (signal:AbortSignal)=>Promise<void>) {
    if (controller.current) return;
    const active = new AbortController();
    controller.current = active;
    setBusy(action);
    setError('');
    setNotice('');
    try {
      await task(active.signal);
    } catch (cause) {
      if (!active.signal.aborted) setError((cause as Error).message);
    } finally {
      controller.current = null;
      if (!active.signal.aborted) setBusy(null);
    }
  }

  async function take(signal: AbortSignal) {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw Error('Cần cấp quyền Camera để chụp kiểm kê. Mở Cài đặt nếu đã từ chối quyền.');
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes:['images'], cameraType:ImagePicker.CameraType.back, allowsEditing:false, quality:1, exif:false,
    });
    if (result.canceled || signal.aborted) return;
    const gps = await locateAttendance('kiểm kê xe');
    if (signal.aborted) return;
    const photo = await prepareRecordMediaAsset(result.assets[0], signal);
    if (signal.aborted) { photo.dispose(); return; }
    file.current?.photo.dispose();
    file.current = {photo,gps};
    setPlatePhoto(file.current);
    attempt.current = null;
  }

  function refreshReport() {
    void cache.invalidateQueries({queryKey:['shifts']});
    return cache.invalidateQueries({queryKey:['shift',session!.user.id,String(report.id)]});
  }

  async function submit(signal: AbortSignal) {
    if (!api || !query.data || !platePhoto) return;
    const bytes = await platePhoto.photo.bytes();
    const request = attempt.current ?? {key:uuid.v4().toLowerCase(),revision:query.data.revision};
    attempt.current = request;
    try {
      const saved = await api.saveShiftStock(report.id, request.revision, request.key, bytes, platePhoto.gps, signal);
      if (signal.aborted) return;
      file.current?.photo.dispose();
      file.current = null;
      setPlatePhoto(null);
      attempt.current = null;
      setNotice(`Đã khớp ${saved.capture.vehicle.license} · ${saved.capture.vehicle.name}.`);
      await query.refetch();
      await refreshReport();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        attempt.current = null;
        await query.refetch();
        await refreshReport();
      }
      throw cause;
    }
  }

  async function removeCapture(target: ShiftStockCapture) {
    if (!api || !query.data) return;
    try {
      await api.deleteShiftStock(report.id, query.data.revision, uuid.v4().toLowerCase(), target.vehicle.id);
    } finally {
      await query.refetch();
      await refreshReport();
    }
    setOpenId(null);
  }

  return <Card style={{gap:12}}>
    <Text accessibilityRole="header" style={{color:theme.text,fontSize:20,fontWeight:'800'}}>Kiểm kê xe bằng ảnh</Text>
    {canWrite && <>
      <Text style={{color:theme.muted,lineHeight:22}}>Chụp một ảnh cận biển số cho mỗi xe. AI đọc biển số và đối chiếu với danh sách Lưu kho của cơ sở.</Text>
      {!currentDay && <Text style={{color:theme.muted,lineHeight:22}}>Báo cáo ngày {report.payload.date.split('-').reverse().join('/')}. Ảnh bổ sung được ghi theo thời gian chụp và đối chiếu với kho hiện tại.</Text>}
      {query.isPending && <Text accessibilityLiveRegion="polite" style={{color:theme.muted}}>Đang tải danh sách Lưu kho…</Text>}
      {query.isError && <InlineError message={query.error.message} />}
      {query.data && !query.data.gps_configured && <InlineError message="Cơ sở chưa cài tọa độ GPS trong mục Chấm công." />}
      {query.data && comparison && <>
        <Text accessibilityLiveRegion="polite" style={{color:theme.text,fontWeight:'700'}}>
          Đã khớp {query.data.expected.length - comparison.missing.length}/{query.data.expected.length} xe Lưu kho
        </Text>
        {!!comparison.missing.length && <Text style={{color:theme.muted,lineHeight:22}}>
          Còn thiếu: {comparison.missing.map(vehicle=>vehicle.license || vehicle.name || `#${vehicle.id}`).join(', ')}
        </Text>}
        {!!comparison.unexpected.length && <InlineError message={`Xe đã chụp lệch danh sách kho: ${comparison.unexpected.map(entry=>entry.plate).join(', ')}.`} />}
      </>}
      <Button secondary label="Tải lại danh sách Lưu kho" loading={query.isFetching} disabled={!!busy} onPress={()=>{void query.refetch();}} />
      {query.data?.gps_configured && query.data.expected.length > 0 && <>
        {platePhoto && <BillPhoto source={{uri:platePhoto.photo.uri}} label="Ảnh cận biển số" context="kiểm kê xe" />}
        <Button secondary label={platePhoto?'Chụp lại ảnh cận biển số':'Chụp ảnh cận biển số'}
          loading={busy==='take'} disabled={!!busy} onPress={()=>void run('take',take)} />
        <Button label="Quét biển số và lưu ảnh" loading={busy==='submit'} disabled={!!busy||!platePhoto}
          onPress={()=>void run('submit', submit)} />
        {platePhoto && <Button secondary label="Bỏ ảnh đang chụp" disabled={!!busy} onPress={()=>{
          file.current?.photo.dispose();file.current=null;setPlatePhoto(null);attempt.current=null;setError('');
        }} />}
      </>}
      {!!error && <><InlineError message={error} />
        {/quyền Camera|quyền vị trí/.test(error) && <Button secondary label="Mở cài đặt quyền Himoto"
          onPress={()=>{void Linking.openSettings().catch(()=>setError('Mở Cài đặt trên điện thoại để cấp quyền cho Himoto.'));}} />}
      </>}
      {!!notice && <Text accessibilityLiveRegion="polite" style={{color:theme.success}}>{notice}</Text>}
    </>}
    {captures.length>0 ? <Button secondary label={`${showSaved?'Ẩn':'Xem'} ${captures.length} xe đã chụp`}
      disabled={!!busy} onPress={()=>{setShowSaved(value=>!value);setOpenId(null);}} />
      : <Text style={{color:theme.muted}}>Chưa lưu ảnh biển số nào</Text>}
    {showSaved&&captures.map(entry=><Button key={entry.vehicle.id} secondary label={`${entry.vehicle.license} · ${entry.vehicle.name}`}
      disabled={!!busy} onPress={()=>setOpenId(id=>id===entry.vehicle.id?null:entry.vehicle.id)} />)}
    {selected && <>
      <Text style={{color:theme.muted}}>{selected.actor_name} · {new Date(selected.captured_at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})} · Cách cơ sở {selected.distance_m} m</Text>
      <BillPhoto source={api!.shiftMediaSource(report.id,selected.plate_photo_id)} label={`Ảnh biển số ${selected.vehicle.license}`} context="kiểm kê xe" />
      {selected.vehicle_photo_id && <BillPhoto source={api!.shiftMediaSource(report.id,selected.vehicle_photo_id)}
        label={`Ảnh toàn xe ${selected.vehicle.license}`} context="kiểm kê xe" />}
      {canWrite && <Button secondary danger label="Bỏ ảnh kiểm kê đã lưu" disabled={!!busy} onPress={()=>setRemove(selected)} />}
    </>}
    {remove && <ConfirmEdit title="Bỏ ảnh kiểm kê?" message={`Xe ${remove.vehicle.license} sẽ cần được chụp lại nếu còn trong kho.`}
      confirmLabel="Bỏ ảnh kiểm kê" onCancel={()=>setRemove(null)} onConfirm={()=>{setRemove(null);void run('delete',()=>removeCapture(remove));}} />}
    {leave && <ConfirmEdit title="Rời màn hình kiểm kê?" message="Ảnh biển số đang chụp chưa được lưu vào báo cáo."
      confirmLabel="Bỏ ảnh và rời" onCancel={()=>setLeave(null)} onConfirm={()=>{allowLeave();leave();}} />}
  </Card>;
}
