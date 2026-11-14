import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePreventRemove } from 'expo-router';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { REGISTRATION_SHIFTS, monthDates, registrationCredit, type RegistrationInput, type RegisteredStaff } from '../../../shared/mobile-shift-registration';
import { dutyToday } from '../../../shared/mobile-duty-roster';
import { shiftCreditLabel } from '../../../shared/attendance-shifts';
import { useSession } from '@/providers/session';
import { useTheme } from '@/theme';
import { Button, Card, InlineError, StateView } from '@/components/ui';
import { ChoiceField, FormField } from '@/components/form-fields';
import { ConfirmEdit } from '@/components/editor-sheet';

function Board() {
  const { api, session } = useSession(), theme = useTheme(), cache = useQueryClient(), running = useRef(false);
  const [month, setMonth] = useState(() => dutyToday().slice(0, 7)), [store, setStore] = useState('all'), [search, setSearch] = useState(''), [day, setDay] = useState(dutyToday);
  const [pending, setPending] = useState<{ input: RegistrationInput; staff: RegisteredStaff } | null>(null), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [error, setError] = useState('');
  const query = useQuery({ queryKey: ['shift-registrations', session!.user.id, month], queryFn: ({ signal }) => api!.registrationMonth(month, signal), retry: false });
  usePreventRemove(busy, () => {});
  const dates = monthDates(month), data = query.data, selectedDay = day.startsWith(month) ? day : dates[0];
  const writable = session!.user.permissions.includes('hr.write'), locked = busy || query.isFetching || query.isError || uncertain;
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase();
  const staff = data?.staff.filter(row => (store === 'all' || store === 'none' ? store === 'all' || !row.store_id : String(row.store_id) === store) && normalize(`${row.name} ${row.position}`).includes(normalize(search.trim()))) || [];
  function moveMonth(delta: number) { const [year, value] = month.split('-').map(Number); const next = new Date(Date.UTC(year, value - 1 + delta, 1)).toISOString().slice(0, 7); if (next >= '2000-01' && next <= '2100-12') { setMonth(next); setUncertain(false); setError(''); } }
  async function reload() { if (running.current) return; const result = await query.refetch(); if (!result.isError) { setUncertain(false); setError(''); } }
  async function save() {
    if (!pending || running.current) return;
    running.current = true; setBusy(true); setError(''); const plan = pending; setPending(null);
    try {
      await api!.saveRegistration(plan.input); await query.refetch(); void cache.invalidateQueries({ queryKey: ['self-shift-registration'] });
    } catch (cause) { setError((cause as Error).message + ' Làm mới bảng để đối chiếu trước khi đăng ký tiếp.'); setUncertain(true); }
    finally { running.current = false; setBusy(false); }
  }
  return <SafeAreaView edges={['bottom', 'left', 'right']} style={{ flex: 1 }}><FlatList data={staff} keyExtractor={person => String(person.id)} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 16, maxWidth: 760, width: '100%', alignSelf: 'center' }} refreshControl={<RefreshControl refreshing={query.isRefetching} tintColor={theme.primary} onRefresh={() => void reload()} />}
    ListHeaderComponent={<View style={{ gap: 14 }}>
      <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 26, fontWeight: '800' }}>Đăng ký ca làm việc</Text>
      <Text style={{ color: theme.muted, lineHeight: 22 }}>Ca đăng ký theo tháng, chưa thay thế lịch trực và công chấm thực tế. Chọn ngày để xem và đăng ký ca cho nhân sự.</Text>
      <Text style={{ color: theme.text, fontSize: 20, fontWeight: '700' }}>Tháng đăng ký: {month.slice(5)}/{month.slice(0, 4)}</Text>
      <Button secondary label="Tháng trước" disabled={locked || month === '2000-01'} onPress={() => moveMonth(-1)} /><Button secondary label="Tháng sau" disabled={locked || month === '2100-12'} onPress={() => moveMonth(1)} /><Button secondary label="Tháng này" disabled={busy} onPress={() => { setMonth(dutyToday().slice(0, 7)); setDay(dutyToday()); }} />
      <ChoiceField label="Ngày đăng ký" value={selectedDay} choices={dates.map(value => ({ value, label: value.split('-').reverse().join('/') }))} disabled={busy} onChange={setDay} />
      <ChoiceField label="Cơ sở" value={store} searchable choices={[{ value: 'all', label: 'Tất cả cơ sở' }, ...(data?.stores || []).map(s => ({ value: String(s.id), label: s.name })), { value: 'none', label: 'Chưa có cơ sở' }]} onChange={setStore} />
      <FormField label="Tìm nhân viên" placeholder="Họ tên, chức vụ…" value={search} onChangeText={setSearch} maxLength={120} />
      <Button secondary label="Làm mới bảng" loading={query.isFetching} disabled={busy} onPress={() => void reload()} />
      {!!error && <InlineError message={error} />}
    </View>}
    renderItem={({ item: person }) => {
      const row = data?.registrations.find(r => r.staff_id === person.id && r.work_date === selectedDay);
      return <Card style={{ gap: 12 }}><Text style={{ color: theme.text, fontSize: 19, fontWeight: '700' }}>{person.name}</Text><Text style={{ color: theme.muted }}>{person.position} · {person.store_name}</Text>
        <Text style={{ color: theme.text }}>Tổng công đăng ký dự kiến trong tháng: {shiftCreditLabel((data?.registrations || []).filter(r => r.staff_id === person.id).reduce((sum, r) => sum + registrationCredit(r.shift_code), 0))} công</Text>
        <ChoiceField label={`Ca của ${person.name} ngày ${selectedDay.split('-').reverse().join('/')}`} value={row?.shift_code || ''} disabled={!writable || locked || !person.store_id || person.status !== 'active'} choices={[{ value: '', label: 'Chưa đăng ký' }, ...REGISTRATION_SHIFTS.map(s => ({ value: s.code, label: `${s.code} · ${s.name}${s.start ? ` (${s.start}–${s.end})` : ''} · ${shiftCreditLabel(s.credit)} công` }))]} onChange={code => { if (code !== (row?.shift_code || '') && person.store_id) setPending({ staff: person, input: { staff_id: person.id, store_id: person.store_id, work_date: selectedDay, shift_code: code || null, revision: row?.revision || null } }); }} />
        {!person.store_id && <Text style={{ color: theme.muted }}>Cần gán cơ sở trong hồ sơ nhân viên trước khi đăng ký.</Text>}
      </Card>;
    }}
    ListEmptyComponent={query.isPending ? <StateView title="Đang tải đăng ký ca…" loading /> : query.isError ? <StateView title="Chưa tải được đăng ký ca" message={query.error.message} retry={() => void reload()} /> : <StateView title="Chưa có nhân sự phù hợp." />}
  />{pending && <ConfirmEdit title="Lưu đăng ký ca?" message={`${pending.staff.name} · ${pending.input.work_date.split('-').reverse().join('/')}\n${pending.input.shift_code || 'Chưa đăng ký'}`} confirmLabel="Lưu đăng ký ca" onCancel={() => setPending(null)} onConfirm={() => void save()} />}</SafeAreaView>;
}
export default function Route() { const { api, session } = useSession(); return !api || !session || !session.user.permissions.includes('hr.read') ? <StateView title="Không có quyền xem đăng ký ca" /> : <Board key={`${api.origin}:${session.token}:${session.user.permissions.join(',')}`} />; }
