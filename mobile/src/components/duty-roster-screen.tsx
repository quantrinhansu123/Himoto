import {FilteredListExport} from '@/components/filtered-list-export';
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FlatList, RefreshControl, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { dutyAddDays, dutyToday, dutyWeekStart, localDutyTime, type MobileDutyInput, type MobileDutySchedule } from "../../../shared/mobile-duty-roster";
import { useSession } from "@/providers/session";
import { useWorkspace } from "@/hooks/use-workspace";
import { useDutyWrite } from "@/hooks/use-duty-write";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useTheme } from "@/theme";
import { Button, InlineError, StateView } from "./ui";
import { ChoiceField, FormField } from "./form-fields";
import { DateField } from "./date-field";
import { TimeField } from "./time-field";
import { ConfirmEdit, EditorSheet } from "./editor-sheet";
import { DutyScheduleCard } from "./duty-schedule-card";
import {ATTENDANCE_SHIFTS,attendanceShift,shiftCreditLabel} from '../../../shared/attendance-shifts';

// Adapted selectively from the colleague's duty-roster screen (c08bfb9):
// weekly navigation and 08:00–17:00 defaults; current DTO/auth/domain are used.
function dutyForm(row: MobileDutySchedule | null, date: string, store: string): MobileDutyInput {
  const start = row ? localDutyTime(row.starts_at) : "", end = row ? localDutyTime(row.ends_at) : "";
  return { store_id: row?.store_id || (store === "all" ? 0 : Number(store)), staff_id: row?.staff_id || 0,
    starts_at: start || `${row?.duty_date || date}T08:00`, ends_at: end || `${row?.duty_date || date}T17:00`,
    shift_name: row?.shift_name || "S", role_in_shift: row?.role_in_shift || "Nhân viên trực", notes: row?.notes || "", ...(row ? { revision: row.revision } : {}) };
}

function DutyEditor({ row, date, store, onClose }: { row: MobileDutySchedule | null; date: string; store: string; onClose: () => void }) {
  const { api, session } = useSession(), theme = useTheme(), workspace = useWorkspace();
  const writer = useDutyWrite();
  const [form, setForm] = useState(() => dutyForm(row, date, store));
  const [staffSearch, setStaffSearch] = useState(""), [confirm, setConfirm] = useState<"save" | "close" | null>(null);
  const search = useDebouncedValue(staffSearch, 300);
  const people = useQuery({ queryKey: ["directory", "staff", "duty-picker", session!.user.id, search], queryFn: ({ signal }) => api!.directory("staff", new URLSearchParams({ page: "1", size: "50", status: "active", search }).toString(), signal) });
  const change = <K extends keyof MobileDutyInput>(key: K, value: MobileDutyInput[K]) => setForm(current => ({ ...current, [key]: value }));
  const stores = (workspace.data?.stores || []).filter(item => session!.user.allStores || item.id === session!.user.storeId);
  const staffChoices = people.data?.rows.map(item => ({ value: String(item.id), label: `${item.name} · ${item.code} · ${item.storeName}` })) || [];
  if (row?.staff_id && !staffChoices.some(item => item.value === String(row.staff_id))) staffChoices.unshift({ value: String(row.staff_id), label: `${row.staff_name} (hiện đang phân công)` });
  const duration = Date.parse(`${form.ends_at}+07:00`) - Date.parse(`${form.starts_at}+07:00`);
  const valid = form.store_id > 0 && form.staff_id > 0 && form.shift_name.trim() && form.role_in_shift.trim() && duration > 0 && duration <= 24 * 3600000;
  const title = row ? "Sửa ca trực" : "Tạo ca trực";
  return <EditorSheet title={title} onClose={() => { if (!writer.busy) setConfirm("close"); }}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 16 }}>
      <ChoiceField label="Cơ sở ca trực" value={String(form.store_id)} choices={stores.map(item => ({ value: String(item.id), label: item.name }))} onChange={value => change("store_id", Number(value))} disabled={writer.busy} searchable />
      {workspace.isError && <><InlineError message="Chưa tải được cơ sở." /><Button secondary label="Tải lại cơ sở" onPress={() => { void workspace.refetch(); }} /></>}
      <FormField label="Tìm nhân sự đang hoạt động" value={staffSearch} onChangeText={setStaffSearch} maxLength={120} editable={!writer.busy} />
      <ChoiceField label="Nhân sự trực" value={String(form.staff_id)} choices={staffChoices} onChange={value => change("staff_id", Number(value))} disabled={writer.busy || people.isPending} />
      {people.data && people.data.total > people.data.rows.length && <Text style={{ color: theme.muted }}>Hiển thị 50 kết quả đầu. Nhập tên hoặc mã để tìm đúng nhân sự.</Text>}
      {people.isError && <><InlineError message={people.error.message} /><Button secondary label="Tải lại nhân sự" onPress={() => { void people.refetch(); }} /></>}
      <FormField label="Tên ca" value={form.shift_name} onChangeText={value => change("shift_name", value)} maxLength={80} editable={!writer.busy} />
      <ChoiceField label="Ca chấm công" value={attendanceShift(form.shift_name)?.code||''} choices={[{value:'',label:'Ca tùy chỉnh'},...ATTENDANCE_SHIFTS.filter(item=>item.start).map(item=>({value:item.code,label:`${item.code} · ${item.name} · ${item.start}–${item.end} · ${shiftCreditLabel(item.credit)} công`}))]} disabled={writer.busy} onChange={value=>{const shift=attendanceShift(value);if(shift?.start&&shift.end)setForm(current=>({...current,shift_name:shift.code,starts_at:current.starts_at.slice(0,10)+'T'+shift.start,ends_at:current.starts_at.slice(0,10)+'T'+shift.end}));}}/>
      <FormField label="Vai trò trong ca" value={form.role_in_shift} onChangeText={value => change("role_in_shift", value)} maxLength={100} editable={!writer.busy} />
      <DateField label="Ngày bắt đầu" value={form.starts_at.slice(0, 10)} onChange={value => change("starts_at", value + form.starts_at.slice(10))} disabled={writer.busy} />
      <TimeField label="Giờ bắt đầu" value={form.starts_at.slice(11, 16)} onChange={value => change("starts_at", form.starts_at.slice(0, 11) + value)} disabled={writer.busy} />
      <DateField label="Ngày kết thúc" value={form.ends_at.slice(0, 10)} onChange={value => change("ends_at", value + form.ends_at.slice(10))} disabled={writer.busy} />
      <TimeField label="Giờ kết thúc" value={form.ends_at.slice(11, 16)} onChange={value => change("ends_at", form.ends_at.slice(0, 11) + value)} disabled={writer.busy} />
      <Text style={{ color: theme.muted, lineHeight: 22 }}>Giờ Việt Nam. Một ca tối đa 24 giờ; máy chủ kiểm tra trùng giờ ở mọi cơ sở.</Text>
      {(!Number.isFinite(duration) || duration <= 0 || duration > 24 * 3600000) && <InlineError message="Giờ kết thúc phải sau giờ bắt đầu; một ca tối đa 24 giờ." />}
      <FormField label="Ghi chú ca trực" value={form.notes} onChangeText={value => change("notes", value)} multiline maxLength={2000} editable={!writer.busy} />
      {!!writer.error && <><InlineError message={writer.error} /><Button secondary label="Mở Tài khoản để đối chiếu" onPress={() => { onClose(); router.push("/(tabs)/account"); }} /></>}
      <Button label="Rà soát và lưu ca trực" disabled={!valid} loading={writer.busy} onPress={() => setConfirm("save")} />
    </ScrollView>
    {confirm === "save" && <ConfirmEdit title="Lưu ca trực?" message={`${form.shift_name} · ${form.role_in_shift}\n${stores.find(item => item.id === form.store_id)?.name || form.store_id}\n${staffChoices.find(item => item.value === String(form.staff_id))?.label || form.staff_id}\n${form.starts_at.replace("T", " ")} → ${form.ends_at.replace("T", " ")}`} busy={writer.busy} onCancel={() => { if (!writer.busy) setConfirm(null); }} onConfirm={() => { setConfirm(null); void writer.save(row?.id || null, form).then(saved => { if (saved) onClose(); }); }} />}
    {confirm === "close" && <ConfirmEdit title="Đóng biểu mẫu ca trực?" message="Thông tin chưa gửi trong biểu mẫu sẽ không được lưu. Yêu cầu đã gửi vẫn được giữ để đối chiếu trong Tài khoản." confirmLabel="Đóng biểu mẫu" onCancel={() => setConfirm(null)} onConfirm={onClose} />}
  </EditorSheet>;
}

export function DutyRosterScreen() {
  const { api, session } = useSession(), theme = useTheme(), workspace = useWorkspace(), writer = useDutyWrite();
  const [week, setWeek] = useState(() => dutyWeekStart(dutyToday()));
  const [showShifts,setShowShifts]=useState(false);
  const [store, setStore] = useState(session!.user.allStores ? "all" : String(session!.user.storeId || "all"));
  const [day, setDay] = useState("all"), [editor, setEditor] = useState<{ row: MobileDutySchedule | null } | null>(null), [deleting, setDeleting] = useState<MobileDutySchedule | null>(null);
  const readable = session!.user.permissions.includes("hr.read"), writable = session!.user.permissions.includes("hr.write");
  const roster = useQuery({ queryKey: ["duty-roster", session!.user.id, week, store], queryFn: ({ signal }) => api!.dutyRoster(new URLSearchParams({ week, ...(store === "all" ? {} : { store_id: store }) }).toString(), signal), enabled: readable });
  if (!readable) return <StateView title="Không có quyền xem lịch trực" />;
  const days = Array.from({ length: 7 }, (_, index) => dutyAddDays(week, index));
  const visible = (roster.data?.schedules || []).filter(row => {
    if (day === "all") return true;
    if (!row.starts_at || !row.ends_at) return row.duty_date === day;
    return Date.parse(row.starts_at) < Date.parse(`${dutyAddDays(day, 1)}T00:00:00+07:00`) && Date.parse(row.ends_at) > Date.parse(`${day}T00:00:00+07:00`);
  });
  const stores = (workspace.data?.stores || []).filter(item => session!.user.allStores || item.id === session!.user.storeId);
  function moveWeek(value: string) { setWeek(dutyWeekStart(value)); setDay("all"); }
  return <>
    <FlatList data={visible} keyExtractor={row => String(row.id)} contentContainerStyle={{ padding: 20, gap: 14, maxWidth: 760, width: "100%", alignSelf: "center" }}
      refreshControl={<RefreshControl refreshing={roster.isRefetching} onRefresh={() => { void roster.refetch(); }} tintColor={theme.primary} />}
      ListHeaderComponent={<View style={{ gap: 14 }}>
        <Button secondary label={showShifts?'Ẩn danh mục 7 mã ca':'Xem danh mục 7 mã ca'} onPress={()=>setShowShifts(value=>!value)}/>
        {showShifts&&<View style={{gap:10}}>{ATTENDANCE_SHIFTS.map(shift=><Text key={shift.code} style={{color:theme.text,lineHeight:23}}>{shift.code} · {shift.name}{shift.start?` · ${shift.start}–${shift.end}`:''} · {shiftCreditLabel(shift.credit)} công</Text>)}<Text style={{color:theme.muted,lineHeight:22}}>O: nghỉ, không tạo ca làm việc. Công quy định dùng để đối chiếu, chưa phải công đã duyệt.</Text></View>}
        <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 26, fontWeight: "800" }}>Lịch trực cơ sở</Text>
        <View style={{ flexDirection: "row", gap: 10 }}><View style={{ flex: 1 }}><Button secondary label="Tuần trước" onPress={() => moveWeek(dutyAddDays(week, -7))} /></View><View style={{ flex: 1 }}><Button secondary label="Tuần này" onPress={() => moveWeek(dutyToday())} /></View><View style={{ flex: 1 }}><Button secondary label="Tuần sau" onPress={() => moveWeek(dutyAddDays(week, 7))} /></View></View>
        <DateField label="Ngày trong tuần cần xem" value={week} onChange={moveWeek} />
        <ChoiceField label="Cơ sở" value={store} choices={[...(session!.user.allStores ? [{ value: "all", label: "Tất cả cơ sở" }] : []), ...stores.map(item => ({ value: String(item.id), label: item.name }))]} onChange={setStore} searchable />
        <ChoiceField label="Ngày trực" value={day} choices={[{ value: "all", label: `Cả tuần: ${week} → ${days[6]}` }, ...days.map(value => ({ value, label: value.split("-").reverse().join("/") }))]} onChange={setDay} />
        <FilteredListExport kind="duties" filters={new URLSearchParams({week,day,...store==='all'?{}:{store_id:store}}).toString()} disabled={roster.isFetching||roster.isError||!visible.length}/>
        <Text style={{ color: theme.muted }}>{visible.length} ca trực trong phạm vi đang xem</Text>
        {writable && <Button label="Tạo ca trực" onPress={() => setEditor({ row: null })} />}
        {roster.isError && <><InlineError message={roster.error.message} /><Button secondary label="Tải lại lịch trực" onPress={() => { void roster.refetch(); }} /></>}
        {!!writer.error && <InlineError message={writer.error} />}
      </View>}
      renderItem={({ item }) => <DutyScheduleCard row={item}>{writable && <View style={{ flexDirection: "row", gap: 10 }}><View style={{ flex: 1 }}><Button secondary label={`Sửa ca #${item.id}`} disabled={writer.busy} onPress={() => setEditor({ row: item })} /></View><View style={{ flex: 1 }}><Button secondary label={`Xóa ca #${item.id}`} disabled={writer.busy} onPress={() => setDeleting(item)} /></View></View>}</DutyScheduleCard>}
      ListEmptyComponent={roster.isPending ? <StateView title="Đang tải lịch trực" loading /> : !roster.isError ? <StateView title="Chưa có ca trực" message="Chọn tuần hoặc cơ sở khác để xem lịch." /> : undefined}
    />
    {editor && <DutyEditor row={editor.row} date={day === "all" ? week : day} store={store} onClose={() => setEditor(null)} />}
    {deleting && <ConfirmEdit title="Xóa ca trực?" message={`${deleting.staff_name} · ${deleting.shift_name}\n${deleting.store_name}\nCa được xóa mềm theo phiên bản đã xem; lịch sử người thực hiện vẫn được giữ.`} confirmLabel="Xác nhận xóa ca" busy={writer.busy} onCancel={() => { if (!writer.busy) setDeleting(null); }} onConfirm={() => { const row = deleting; setDeleting(null); void writer.save(row.id, { revision: row.revision }, true); }} />}
  </>;
}
