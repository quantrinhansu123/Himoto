import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePreventRemove } from 'expo-router';
import { Linking, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '@/providers/session';
import { useTheme } from '@/theme';
import { locateAttendance } from '@/lib/attendance-capture';
import { Button, Card, InlineError, StateView } from '@/components/ui';
import { ChoiceField, FormField } from '@/components/form-fields';
import { ConfirmEdit } from '@/components/editor-sheet';
import { KeyboardFormScrollView } from '@/components/keyboard-form-scroll-view';

export default function Route() {
  const { api, session } = useSession(), theme = useTheme(), running = useRef(false);
  const [store, setStore] = useState(''), [latitude, setLatitude] = useState(''), [longitude, setLongitude] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [confirm, setConfirm] = useState(false), [uncertain, setUncertain] = useState(false);
  const query = useQuery({ queryKey: ['attendance-locations', session?.user.id, session?.user.storeId, session?.user.allStores], queryFn: ({ signal }) => api!.attendanceLocations(signal), enabled: !!api && !!session, retry: false });
  usePreventRemove(busy, () => {});
  const lat = latitude.trim() ? Number(latitude) : NaN, lng = longitude.trim() ? Number(longitude) : NaN;
  const valid = !!store && Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lng) && Math.abs(lng) <= 180;
  function choose(id: string) { const row = query.data?.find(item => String(item.id) === id); setStore(id); setLatitude(String(row?.latitude ?? '')); setLongitude(String(row?.longitude ?? '')); setError(''); setNotice(''); }
  async function save() {
    if (running.current || !valid) return; running.current = true; setBusy(true); setConfirm(false); setError(''); setNotice('');
    try { await api!.saveAttendanceLocation({ storeId: store, latitude: lat, longitude: lng }); await query.refetch(); setNotice('Đã lưu vị trí chấm công của cơ sở.'); }
    catch (cause) { setUncertain(true); setError((cause as Error).message + ' Tải lại để đối chiếu trước khi lưu tiếp.'); }
    finally { running.current = false; setBusy(false); }
  }
  async function locate() {
    if (running.current) return; running.current = true; setBusy(true); setError('');
    try { const result = await locateAttendance(); setLatitude(String(result.latitude)); setLongitude(String(result.longitude)); setNotice('Đã lấy vị trí hiện tại. Kiểm tra đúng cơ sở trước khi lưu.'); }
    catch (cause) { setError((cause as Error).message); } finally { running.current = false; setBusy(false); }
  }
  return <SafeAreaView edges={['bottom', 'left', 'right']} style={{ flex: 1 }}><KeyboardFormScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 16, maxWidth: 760, width: '100%', alignSelf: 'center' }}>
    <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 26, fontWeight: '800' }}>Cài đặt GPS chấm công</Text>
    <Text style={{ color: theme.muted, lineHeight: 22 }}>Chọn cơ sở và kiểm tra tọa độ dùng để xác nhận vị trí chấm công.</Text>
    {query.isPending ? <StateView title="Đang tải vị trí cơ sở…" loading /> : query.isError ? <StateView title="Chưa tải được vị trí cơ sở" message={query.error.message} retry={() => void query.refetch()} /> : <Card style={{ gap: 14 }}>
      <ChoiceField label="Cơ sở" value={store} searchable choices={query.data.map(row => ({ value: String(row.id), label: row.store_name }))} disabled={busy || uncertain} onChange={choose} />
      <FormField label="Vĩ độ" value={latitude} onChangeText={value=>{setLatitude(value);setNotice('');}} error={latitude.trim()&&(!Number.isFinite(lat)||Math.abs(lat)>90)?'Nhập vĩ độ từ -90 đến 90, dùng dấu chấm thập phân.':undefined} editable={!busy && !uncertain} keyboardType="numbers-and-punctuation" maxLength={30} />
      <FormField label="Kinh độ" value={longitude} onChangeText={value=>{setLongitude(value);setNotice('');}} error={longitude.trim()&&(!Number.isFinite(lng)||Math.abs(lng)>180)?'Nhập kinh độ từ -180 đến 180, dùng dấu chấm thập phân.':undefined} editable={!busy && !uncertain} keyboardType="numbers-and-punctuation" maxLength={30} />
      <Button secondary label="Lấy vị trí GPS hiện tại" disabled={busy || uncertain || !store} onPress={() => void locate()} />
      <Button secondary label="Xem vị trí trên Google Maps" disabled={busy || !valid} onPress={() => void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`).catch(() => setError('Chưa mở được bản đồ.'))} />
      <Button label="Lưu vị trí" loading={busy} disabled={!valid || uncertain} onPress={() => setConfirm(true)} />
    </Card>}
    {!!error && <InlineError message={error} />}{!!notice && <Text accessibilityLiveRegion="polite" style={{ color: theme.text }}>{notice}</Text>}
    <Button secondary label="Tải lại để đối chiếu" disabled={busy} onPress={() => void query.refetch().then(result => { if (result.data) { const row=result.data.find(item=>String(item.id)===store); if(row){setLatitude(String(row.latitude??''));setLongitude(String(row.longitude??''));}setUncertain(false);setError(''); } })} />
    {confirm && <ConfirmEdit title="Lưu vị trí chấm công?" message={`${query.data?.find(row => String(row.id) === store)?.store_name}\nVĩ độ: ${lat}\nKinh độ: ${lng}`} confirmLabel="Lưu vị trí" onCancel={() => setConfirm(false)} onConfirm={() => void save()} />}
  </KeyboardFormScrollView></SafeAreaView>;
}
