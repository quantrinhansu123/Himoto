import {useEffect, useRef, useState} from 'react';
import {useQuery, useQueryClient} from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import {usePreventRemove} from 'expo-router';
import {uuid} from 'expo';
import {Linking, Platform, Text, View} from 'react-native';
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

type Side = 'vehicle' | 'plate';
type Photo = { photo: RecordMediaPhoto; gps: AttendanceLocation };
type Pair = Partial<Record<Side, Photo>>;
const sides = [{key:'vehicle', label:'Ảnh toàn xe'}, {key:'plate', label:'Ảnh cận biển số'}] as const;
const noCaptures: ShiftStockCapture[] = [];

export function ShiftStockPhotos({report, writable}: {report:ShiftReport; writable:boolean}) {
  const {api, session} = useSession(), theme = useTheme(), cache = useQueryClient();
  const currentDay = isShiftStockDay(report.payload.date);
  const canWrite = writable && Platform.OS !== 'web' && report.status === 'draft' &&
    (currentDay || report.stock_captures !== undefined);
  const queryKey = ['shift-stock-photos', session!.user.id, report.id] as const;
  const query = useQuery({queryKey, queryFn: ({signal}) => api!.shiftStock(report.id, signal), enabled: canWrite, retry: false});
  const [pair, setPair] = useState<Pair>({}), [busy, setBusy] = useState<Side|'submit'|'delete'|null>(null);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [openId, setOpenId] = useState<number|null>(null), [remove, setRemove] = useState<ShiftStockCapture|null>(null);
  const [leave,setLeave] = useState<(()=>void)|null>(null);
  const [showSaved,setShowSaved] = useState(!canWrite);
  const files = useRef<Pair>({}), controller = useRef<AbortController|null>(null);
  const attempt = useRef<{key:string;revision:number}|null>(null);
  const captures = (canWrite ? query.data?.captures : undefined) ?? report.stock_captures ?? noCaptures;
  const comparison = query.data ? compareShiftStock(query.data.expected, captures) : null;
  const selected = captures.find(row => row.vehicle.id === openId);
  const allowLeave = usePreventRemove(!!busy || !!pair.vehicle || !!pair.plate, ({repeat})=>{
    if (!controller.current) setLeave(()=>repeat);
  });

  useEffect(() => () => {
    controller.current?.abort();
    Object.values(files.current).forEach(file => file.photo.dispose());
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

  async function take(side: Side, signal: AbortSignal) {
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
    files.current[side]?.photo.dispose();
    if (side==='vehicle') {
      files.current.plate?.photo.dispose();
      delete files.current.plate;
    }
    files.current = {...files.current, [side]:{photo, gps}};
    setPair(files.current);
    attempt.current = null;
  }

  function refreshReport() {
    void cache.invalidateQueries({queryKey:['shifts']});
    return cache.invalidateQueries({queryKey:['shift',session!.user.id,String(report.id)]});
  }

  async function submit(signal: AbortSignal) {
    if (!api || !query.data || !pair.vehicle || !pair.plate) return;
    const vehicle = await pair.vehicle.photo.bytes(), plate = await pair.plate.photo.bytes();
    const combined = new Uint8Array(vehicle.byteLength + plate.byteLength);
    combined.set(new Uint8Array(vehicle));
    combined.set(new Uint8Array(plate), vehicle.byteLength);
    const request = attempt.current ?? {key:uuid.v4().toLowerCase(),revision:query.data.revision};
    attempt.current = request;
    try {
      const saved = await api.saveShiftStock(report.id, request.revision, request.key, combined.buffer, vehicle.byteLength, pair.vehicle.gps, pair.plate.gps, signal);
      if (signal.aborted) return;
      Object.values(files.current).forEach(file => file.photo.dispose());
      files.current = {};
      setPair({});
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

  async function removePair(target: ShiftStockCapture) {
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
      <Text style={{color:theme.muted,lineHeight:22}}>Chụp toàn xe từ phía sau sao cho thấy biển số, rồi chụp cận biển số của cùng xe. App đọc hai ảnh và đối chiếu với danh sách Lưu kho của cơ sở.</Text>
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
        {sides.map(({key,label})=><View key={key} style={{gap:8}}>
          {pair[key] && <BillPhoto source={{uri:pair[key].photo.uri}} label={label} context="kiểm kê xe" />}
          <Button secondary label={`${pair[key]?'Chụp lại':'Chụp'} ${label.toLowerCase()}`}
            loading={busy===key} disabled={!!busy || key==='plate'&&!pair.vehicle} onPress={()=>void run(key, signal=>take(key,signal))} />
        </View>)}
        <Button label="Quét biển số và lưu cặp ảnh" loading={busy==='submit'} disabled={!!busy||!pair.vehicle||!pair.plate}
          onPress={()=>void run('submit', submit)} />
      </>}
      {!!error && <><InlineError message={error} />
        {/quyền Camera|quyền vị trí/.test(error) && <Button secondary label="Mở cài đặt quyền Himoto"
          onPress={()=>{void Linking.openSettings().catch(()=>setError('Mở Cài đặt trên điện thoại để cấp quyền cho Himoto.'));}} />}
      </>}
      {!!notice && <Text accessibilityLiveRegion="polite" style={{color:theme.success}}>{notice}</Text>}
    </>}
    {captures.length>0 ? <Button secondary label={`${showSaved?'Ẩn':'Xem'} ${captures.length} cặp ảnh đã lưu`}
      disabled={!!busy} onPress={()=>{setShowSaved(value=>!value);setOpenId(null);}} />
      : <Text style={{color:theme.muted}}>Chưa lưu cặp ảnh nào</Text>}
    {showSaved&&captures.map(entry=><Button key={entry.vehicle.id} secondary label={`${entry.vehicle.license} · ${entry.vehicle.name}`}
      disabled={!!busy} onPress={()=>setOpenId(id=>id===entry.vehicle.id?null:entry.vehicle.id)} />)}
    {selected && <>
      <Text style={{color:theme.muted}}>{selected.actor_name} · {new Date(selected.captured_at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})} · Cách cơ sở {selected.distance_m} m</Text>
      {sides.map(({key,label})=><BillPhoto key={key} source={api!.shiftMediaSource(report.id, key==='vehicle'?selected.vehicle_photo_id:selected.plate_photo_id)}
        label={`${label} ${selected.vehicle.license}`} context="kiểm kê xe" />)}
      {canWrite && <Button secondary danger label="Bỏ cặp ảnh đã ghi nhận" disabled={!!busy} onPress={()=>setRemove(selected)} />}
    </>}
    {remove && <ConfirmEdit title="Bỏ cặp ảnh kiểm kê?" message={`Xe ${remove.vehicle.license} sẽ cần được chụp lại nếu còn trong kho.`}
      confirmLabel="Bỏ cặp ảnh" onCancel={()=>setRemove(null)} onConfirm={()=>{setRemove(null);void run('delete',()=>removePair(remove));}} />}
    {leave && <ConfirmEdit title="Rời màn hình kiểm kê?" message="Cặp ảnh đang chụp chưa được lưu vào báo cáo."
      confirmLabel="Bỏ cặp ảnh và rời" onCancel={()=>setLeave(null)} onConfirm={()=>{allowLeave();leave();}} />}
  </Card>;
}
