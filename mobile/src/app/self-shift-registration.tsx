import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePreventRemove } from 'expo-router';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { REGISTRATION_SHIFTS, registrationCredit, type SelfRegistrationWeek } from '../../../shared/mobile-shift-registration';
import { dutyAddDays, dutyToday, dutyWeekStart } from '../../../shared/mobile-duty-roster';
import { shiftCreditLabel } from '../../../shared/attendance-shifts';
import { useSession } from '@/providers/session';
import { useTheme } from '@/theme';
import { Button, Card, InlineError, StateView } from '@/components/ui';
import { ChoiceField } from '@/components/form-fields';
import { ConfirmEdit } from '@/components/editor-sheet';
import { KeyboardFormScrollView } from '@/components/keyboard-form-scroll-view';

const labelDate = (date: string) => date.split('-').reverse().join('/');
function WeekForm({ initial, moveWeek }: { initial: SelfRegistrationWeek; moveWeek: (week: string) => void }) {
  const { api, session } = useSession(), cache = useQueryClient(), theme = useTheme(), running = useRef(false);
  const [data, setData] = useState(initial), [draft, setDraft] = useState(() => Object.fromEntries(initial.dates.map(date => [date, initial.registrations.find(row => row.work_date === date)?.shift_code || ''])));
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState(''), [confirm, setConfirm] = useState(false), [exit, setExit] = useState<(() => void) | null>(null), [leaving, setLeaving] = useState(false);
  const changed = data.dates.filter(date => date >= data.today && (draft[date] || '') !== (data.registrations.find(row => row.work_date === date)?.shift_code || ''));
  const prevent = usePreventRemove(!leaving && (busy || changed.length > 0), ({ repeat }) => { if (!running.current) setExit(() => repeat); });
  function apply(value: SelfRegistrationWeek) { setData(value); setDraft(Object.fromEntries(value.dates.map(date => [date, value.registrations.find(row => row.work_date === date)?.shift_code || '']))); }
  async function save() {
    if (running.current || !changed.length) return;
    running.current = true; setBusy(true); setConfirm(false); setError(''); setMessage('');
    try {
      const result = await api!.saveSelfRegistration({ week: data.week, days: changed.map(date => ({ work_date: date, shift_code: draft[date] || null, revision: data.registrations.find(row => row.work_date === date)?.revision || null })) });
      apply(result); cache.setQueryData(['self-shift-registration', session!.user.id, data.week], result); void cache.invalidateQueries({ queryKey: ['shift-registrations'] }); setMessage('Đã lưu đăng ký ca.');
    } catch (cause) { setError((cause as Error).message + ' Tải lại để đối chiếu trước khi lưu tiếp.'); setUncertain(true); }
    finally { running.current = false; setBusy(false); }
  }
  async function reload() {
    if (running.current) return; running.current = true; setBusy(true); setError('');
    try { const result = await api!.selfRegistration(data.week); apply(result); setUncertain(false); setMessage('Đã tải lại đăng ký ca.'); } catch (cause) { setError((cause as Error).message); } finally { running.current = false; setBusy(false); }
  }
  return <KeyboardFormScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 16, maxWidth: 760, width: '100%', alignSelf: 'center' }}>
    <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 26, fontWeight: '800' }}>Đăng ký ca làm việc</Text>
    <Text style={{ color: theme.text }}>{data.staff.name} · {data.staff.store_name}</Text>
    <Text style={{ color: theme.muted }}>Tuần {labelDate(data.week)} – {labelDate(data.dates[6])}</Text>
    <View style={{ gap: 8 }}><Button secondary label="Tuần trước" disabled={busy || changed.length > 0 || data.week <= dutyWeekStart(dutyToday())} onPress={() => moveWeek(dutyAddDays(data.week, -7))} /><Button secondary label="Tuần sau" disabled={busy || changed.length > 0} onPress={() => moveWeek(dutyAddDays(data.week, 7))} /></View>
    {data.dates.map(date => <Card key={date} style={{ gap: 8 }}><ChoiceField label={`Ca làm ngày ${labelDate(date)}${date < data.today ? ' · Đã qua' : date === data.today ? ' · Hôm nay' : ''}`} value={draft[date] || ''} searchable disabled={busy || uncertain || date < data.today} choices={[{ value: '', label: 'Chưa đăng ký' }, ...REGISTRATION_SHIFTS.map(shift => ({ value: shift.code, label: `${shift.code} · ${shift.name}${shift.start ? ` (${shift.start}–${shift.end}${shift.code === 'G1+G3' ? ', nghỉ 12:00–17:00' : ''})` : ''} · ${shiftCreditLabel(shift.credit)} công` }))]} onChange={value => { setDraft(current => ({ ...current, [date]: value })); setMessage(''); }} /></Card>)}
    <Text style={{ color: theme.text, fontWeight: '700' }}>Tổng công đăng ký dự kiến: {shiftCreditLabel(data.dates.reduce((sum, date) => sum + registrationCredit(draft[date]), 0))} công</Text>
    <Text style={{ color: theme.muted, lineHeight: 22 }}>Chỉ đăng ký ca của chính bạn tại cơ sở trong hồ sơ. Ngày đã qua không thể sửa. Ca đăng ký được hiển thị trên bảng tháng của quản lý, chưa thay thế lịch trực và công chấm thực tế.</Text>
    {!!error && <InlineError message={error} />}{!!message && <Text accessibilityLiveRegion="polite" style={{ color: theme.text }}>{message}</Text>}
    <Button label="Lưu đăng ký ca" loading={busy} disabled={uncertain || !changed.length} onPress={() => setConfirm(true)} />
    {!!changed.length && <Button secondary label="Bỏ thay đổi" disabled={busy} onPress={() => apply(data)} />}
    <Button secondary label="Tải lại để đối chiếu" loading={busy} disabled={!uncertain && changed.length > 0} onPress={() => void reload()} />
    {confirm && <ConfirmEdit title="Lưu đăng ký ca?" message={`${data.staff.name} · ${changed.length} ngày thay đổi. Kiểm tra ca đã chọn trước khi xác nhận.`} confirmLabel="Lưu đăng ký ca" onCancel={() => setConfirm(false)} onConfirm={() => void save()} />}
    {exit && <ConfirmEdit title="Bỏ thay đổi đăng ký ca?" message="Các ngày thay đổi chưa được lưu." confirmLabel="Bỏ thay đổi" onCancel={() => setExit(null)} onConfirm={() => { const repeat = exit; setExit(null); setLeaving(true); prevent(); repeat(); }} />}
  </KeyboardFormScrollView>;
}
export default function Route() {
  const { api, session } = useSession(), [week, setWeek] = useState(() => dutyAddDays(dutyWeekStart(dutyToday()), 7));
  const query = useQuery({ queryKey: ['self-shift-registration', session?.user.id, week], queryFn: ({ signal }) => api!.selfRegistration(week, signal), enabled: !!api && !!session, retry: false, refetchOnReconnect: false, refetchOnWindowFocus: false });
  return <SafeAreaView edges={['bottom', 'left', 'right']} style={{ flex: 1 }}>{query.isPending ? <StateView title="Đang tải đăng ký ca…" loading /> : query.isError ? <StateView title="Chưa mở được đăng ký ca" message={query.error.message} retry={() => void query.refetch()} /> : <WeekForm key={`${api!.origin}:${session!.token}:${week}`} initial={query.data} moveWeek={setWeek} />}</SafeAreaView>;
}
