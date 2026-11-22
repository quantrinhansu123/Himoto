import {FilteredListExport} from '@/components/filtered-list-export';
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { ChevronLeft, ChevronRight, Plus, SlidersHorizontal } from "lucide-react-native";
import { dutyAddDays, dutyToday, dutyWeekStart, localDutyTime, type MobileDutyInput, type MobileDutySchedule } from "../../../shared/mobile-duty-roster";
import { useSession } from "@/providers/session";
import { useWorkspace } from "@/hooks/use-workspace";
import { useDutyWrite } from "@/hooks/use-duty-write";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useTheme } from "@/theme";
import { Button, Card, Chip, InlineError, SkeletonList, StateView } from "./ui";
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
  const people = useQuery({ queryKey: ["shift-registrations", session!.user.id, date.slice(0,7)], queryFn: ({ signal }) => api!.registrationMonth(date.slice(0,7), signal) });
  const change = <K extends keyof MobileDutyInput>(key: K, value: MobileDutyInput[K]) => setForm(current => ({ ...current, [key]: value }));
  const stores = (workspace.data?.stores || []);
  const staffChoices = people.data?.staff.filter(item => item.status === "active" && `${item.name} ${item.store_name}`.toLocaleLowerCase("vi-VN").includes(search.toLocaleLowerCase("vi-VN"))).map(item => ({ value: String(item.id), label: `${item.name} · ${item.store_name}` })) || [];
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

export function DutyRosterScreen({initialStore}:{initialStore?:string}={}) {
  const { api, session } = useSession(), theme = useTheme(), workspace = useWorkspace(), writer = useDutyWrite();
  const [week, setWeek] = useState(() => dutyWeekStart(dutyToday()));
  const [showShifts,setShowShifts]=useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [store, setStore] = useState(initialStore || "all");
  const [staffFilter, setStaffFilter] = useState("all");
  const [day, setDay] = useState("all"), [editor, setEditor] = useState<{ row: MobileDutySchedule | null } | null>(null), [deleting, setDeleting] = useState<MobileDutySchedule | null>(null);
  const readable = session!.user.permissions.includes("hr.read"), writable = session!.user.permissions.includes("hr.write");
  const roster = useQuery({ queryKey: ["duty-roster", session!.user.id, week, store], queryFn: ({ signal }) => api!.dutyRoster(new URLSearchParams({ week, ...(store === "all" ? {} : { store_id: store }) }).toString(), signal), enabled: readable });
  if (!readable) return <StateView title="Không có quyền xem lịch trực" />;
  const days = Array.from({ length: 7 }, (_, index) => dutyAddDays(week, index));
  const staffOptions = [...new Map((roster.data?.schedules || []).map(r => [String(r.staff_id), r.staff_name])).entries()].map(([value, label]) => ({ value, label }));
  const visible = (roster.data?.schedules || []).filter(row => {
    if (staffFilter !== "all" && String(row.staff_id) !== staffFilter) return false;
    if (day === "all") return true;
    if (!row.starts_at || !row.ends_at) return row.duty_date === day;
    return Date.parse(row.starts_at) < Date.parse(`${dutyAddDays(day, 1)}T00:00:00+07:00`) && Date.parse(row.ends_at) > Date.parse(`${day}T00:00:00+07:00`);
  });
  const stores = (workspace.data?.stores || []);
  const filterCount = Number(store !== (initialStore || "all")) + Number(staffFilter !== "all");
  function moveWeek(value: string) { setWeek(dutyWeekStart(value)); setDay("all"); }
  const shortDay = (d: string, i: number) => `${["T2", "T3", "T4", "T5", "T6", "T7", "CN"][i]} ${d.slice(8, 10)}/${d.slice(5, 7)}`;
  return <>
    <FlatList data={visible} keyExtractor={row => String(row.id)} contentContainerStyle={{ padding: 16, paddingBottom: 36, gap: 11, maxWidth: 760, width: "100%", alignSelf: "center" }}
      refreshControl={<RefreshControl refreshing={roster.isRefetching} onRefresh={() => { void roster.refetch(); }} tintColor={theme.primary} />}
      ListHeaderComponent={<View style={{ gap: 11 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 22, fontWeight: "800" }}>Lịch trực cơ sở</Text>
            <Text style={{ color: theme.muted, fontSize: 12.5 }}>{visible.length} ca · {week.split("-").reverse().join("/")} → {days[6].split("-").reverse().join("/")}</Text>
          </View>
          {writable && <Button size="sm" icon={<Plus size={14} color={theme.primaryText} />} label="Tạo ca" onPress={() => setEditor({ row: null })} />}
        </View>
        {/* Compact Week Stepper Bar */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 11, padding: 6 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Tuần trước" onPress={() => moveWeek(dutyAddDays(week, -7))} style={{ minWidth: 38, minHeight: 36, borderRadius: 8, backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border, alignItems: "center", justifyContent: "center" }}>
            <ChevronLeft size={18} color={theme.text} />
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => moveWeek(dutyToday())} style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 4 }}>
            <Text style={{ color: theme.text, fontSize: 13.5, fontWeight: "700" }}>{week.split("-").reverse().join("/")} – {days[6].split("-").reverse().join("/")}</Text>
            <Text style={{ color: theme.primary, fontSize: 11.5, fontWeight: "600" }}>Chạm để về tuần này</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Tuần sau" onPress={() => moveWeek(dutyAddDays(week, 7))} style={{ minWidth: 38, minHeight: 36, borderRadius: 8, backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border, alignItems: "center", justifyContent: "center" }}>
            <ChevronRight size={18} color={theme.text} />
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>
          <Chip label={filterCount ? `Bộ lọc (${filterCount})` : "Bộ lọc"} selected={filtersOpen || filterCount > 0} icon={<SlidersHorizontal size={14} color={filtersOpen || filterCount > 0 ? theme.primary : theme.text} />} onPress={() => setFiltersOpen(v => !v)} />
          <Chip label="Bảng đăng ký ca" onPress={() => router.push("/shift-registrations")} />
          <Chip label={showShifts ? "Ẩn 7 mã ca" : "7 mã ca"} selected={showShifts} onPress={() => setShowShifts(value => !value)} />
        </ScrollView>
        {showShifts && (
          <Card style={{ gap: 6, padding: 12 }}>
            {ATTENDANCE_SHIFTS.map(shift => <Text key={shift.code} style={{ color: theme.text, fontSize: 13, lineHeight: 19 }}>{shift.code} · {shift.name}{shift.start ? ` · ${shift.start}–${shift.end}` : ''} · {shiftCreditLabel(shift.credit)} công</Text>)}
            <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 17 }}>O: nghỉ, không tạo ca làm việc. Công quy định dùng để đối chiếu, chưa phải công đã duyệt.</Text>
          </Card>
        )}
        {filtersOpen && (
          <Card style={{ gap: 10 }}>
            <DateField label="Chọn ngày trong tuần" value={week} onChange={moveWeek} />
            <ChoiceField label="Cơ sở" value={store} choices={[{ value: "all", label: "Tất cả cơ sở" }, ...stores.map(item => ({ value: String(item.id), label: item.name }))]} onChange={v => { setStore(v); setStaffFilter("all"); }} searchable />
            <ChoiceField label="Nhân viên trực" value={staffFilter} choices={[{ value: "all", label: "Tất cả nhân viên" }, ...staffOptions]} onChange={setStaffFilter} searchable />
            <FilteredListExport kind="duties" filters={new URLSearchParams({week,day,...(store==='all'?{}:{store_id:store}),...(staffFilter==='all'?{}:{staff_id:staffFilter})}).toString()} disabled={roster.isFetching||roster.isError||!visible.length}/>
          </Card>
        )}
        {/* Horizontal Day Filter Chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          <Chip label="Cả tuần" selected={day === "all"} onPress={() => setDay("all")} />
          {days.map((value, idx) => (
            <Chip key={value} label={shortDay(value, idx)} selected={day === value} onPress={() => setDay(value)} />
          ))}
        </ScrollView>
        {roster.isError && <><InlineError message={roster.error.message} /><Button size="sm" secondary label="Tải lại lịch trực" onPress={() => { void roster.refetch(); }} /></>}
        {!!writer.error && <InlineError message={writer.error} />}
      </View>}
      renderItem={({ item }) => <DutyScheduleCard row={item}>{writable && <View style={{ flexDirection: "row", gap: 8, paddingTop: 2 }}><Button size="sm" equalWidth secondary label="Sửa ca" disabled={writer.busy} onPress={() => setEditor({ row: item })} /><Button size="sm" equalWidth danger label="Xóa ca" disabled={writer.busy} onPress={() => setDeleting(item)} /></View>}</DutyScheduleCard>}
      ListEmptyComponent={roster.isPending ? <SkeletonList count={4} lines={3} /> : !roster.isError ? <StateView title="Chưa có ca trực" message="Chọn tuần hoặc cơ sở khác để xem lịch." /> : undefined}
    />
    {editor && <DutyEditor row={editor.row} date={day === "all" ? week : day} store={store} onClose={() => setEditor(null)} />}
    {deleting && <ConfirmEdit title="Xóa ca trực?" message={`${deleting.staff_name} · ${deleting.shift_name}\n${deleting.store_name}\nCa được xóa mềm theo phiên bản đã xem; lịch sử người thực hiện vẫn được giữ.`} confirmLabel="Xác nhận xóa ca" busy={writer.busy} onCancel={() => { if (!writer.busy) setDeleting(null); }} onConfirm={() => { const row = deleting; setDeleting(null); void writer.save(row.id, { revision: row.revision }, true); }} />}
  </>;
}
