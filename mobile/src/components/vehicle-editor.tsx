import { KeyboardFormScrollView } from "./keyboard-form-scroll-view";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Text, type ScrollViewInstance, type TextInputInstance } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { MobileVehicleInput, MobileVehicleOptions, MobileVehicleProfile } from "../../../shared/mobile-vehicles";
import { useSession } from "@/providers/session";
import { useVehicleProfileWrite } from "@/hooks/use-vehicle-profile-write";
import { money, useTheme } from "@/theme";
import { Button, Card, InlineError, StateView } from "./ui";
import { ChoiceField, FormField } from "./form-fields";
import { ConfirmEdit } from "./editor-sheet";
import { VehicleRegistrationOcr } from "./vehicle-registration-ocr";
type Form = { [K in keyof Omit<MobileVehicleInput, "revision">]-?: string };
const fields: { key: keyof Form; label: string; max: number; numeric?: boolean; required?: boolean }[] = [
  { key: "name", label: "Tên / dòng xe", max: 255, required: true }, { key: "license", label: "Biển số", max: 25, required: true },
  { key: "brand", label: "Hãng xe", max: 255, required: true }, { key: "color", label: "Màu sắc", max: 255 },
  { key: "year", label: "Năm sản xuất", max: 4, required: true, numeric: true }, { key: "odometer", label: "Số km", max: 15, numeric: true },
  { key: "chassis", label: "Số khung", max: 255 }, { key: "engine", label: "Số máy", max: 255 },
];
function initialForm(profile: MobileVehicleProfile | null, store: string, options: MobileVehicleOptions): Form {
  const row = profile?.values;
  return { name: row?.name || "", license: row?.license || "", brand: row?.brand || "honda", type: row?.type || options.types[0].value,
    year: row?.year == null ? "" : String(row.year), store_id: row ? String(row.store_id) : store === "all" ? "" : store,
    status: row?.status || "ready", color: row?.color || "", chassis: row?.chassis || "", engine: row?.engine || "", odometer: row?.odometer == null ? "" : String(row.odometer), daily_price: row?.daily_price == null ? "" : String(row.daily_price), cost_price: row?.cost_price == null ? "" : String(row.cost_price), note: "" };
}
function VehicleForm({ profile, options, store }: { profile: MobileVehicleProfile | null; options: MobileVehicleOptions; store: string }) {
  const theme = useTheme(), insets = useSafeAreaInsets();
  const [initial] = useState(() => initialForm(profile, store, options)), [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({}), [confirm, setConfirm] = useState(false);
  const[photosBusy,setPhotosBusy]=useState(false);
  const scroll = useRef<ScrollViewInstance>(null), inputs = useRef<Partial<Record<keyof Form, TextInputInstance | null>>>({});
  const dirty = Object.keys(form).some(key => form[key as keyof Form] !== initial[key as keyof Form]);
  const write = useVehicleProfileWrite(profile ? String(profile.id) : null, dirty);
  const change = (key: keyof Form, value: string) => { setForm(current => ({ ...current, [key]: value })); setErrors(current => ({ ...current, [key]: undefined })); };
  const stores = options.stores.map(row => ({ value: String(row.id), label: row.name }));
  if (profile && !stores.some(row => row.value === form.store_id)) stores.unshift({ value: form.store_id, label: profile.storeName || `Cơ sở #${form.store_id}` });
  const locked = write.busy || write.pending || write.checking || photosBusy, storeLocked = locked || profile?.hasOpenContract || profile?.inTransit;
  function validate() {
    const next: typeof errors = {};
    for (const field of fields) if (field.required && !form[field.key].trim()) next[field.key] = `Nhập ${field.label.toLowerCase()}.`;
    if (!Number.isSafeInteger(Number(form.year)) || Number(form.year) < 1980 || Number(form.year) > new Date().getFullYear() + 1) next.year = "Năm sản xuất không hợp lệ.";
    if (form.odometer && (!Number.isSafeInteger(Number(form.odometer)) || Number(form.odometer) < 0)) next.odometer = "Số km phải là số nguyên không âm.";
    for(const key of ['daily_price','cost_price'] as const) if(form[key] && (!/^\d+$/.test(form[key]) || !Number.isSafeInteger(Number(form[key])))) next[key] = 'Nhập số tiền nguyên không âm bằng VND.';
    if (!form.store_id) next.store_id = "Chọn cơ sở cho xe.";
    if (!options.types.some(row => row.value === form.type)) next.type = "Chọn loại xe hợp lệ.";
    if (!options.statuses.some(row => row.value === form.status)) next.status = "Chọn trạng thái xe hợp lệ.";
    setErrors(next);
    if (Object.keys(next).length) { scroll.current?.scrollTo({ y: 0 }); requestAnimationFrame(() => inputs.current[Object.keys(next)[0] as keyof Form]?.focus()); return; }
    setConfirm(true);
  }
  function input(): MobileVehicleInput {
    const {daily_price,cost_price,...rest}=form;
    return { ...rest, year: Number(form.year), store_id: Number(form.store_id), odometer: form.odometer === "" ? null : Number(form.odometer),
      ...(!profile || profile.values.daily_price !== undefined || daily_price !== initial.daily_price ? {daily_price:daily_price === '' ? null : Number(daily_price)} : {}),
      ...(!profile || profile.values.cost_price !== undefined || cost_price !== initial.cost_price ? {cost_price:cost_price === '' ? null : Number(cost_price)} : {}),
      ...(profile ? { revision: profile.revision } : {}) };
  }
  return <><KeyboardFormScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: 24 + insets.bottom, gap: 18, width: "100%", maxWidth: 760, alignSelf: "center" }}>
      <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 26, fontWeight: "800" }}>{profile ? `Sửa xe ${profile.values.license}` : "Thêm xe"}</Text>
      {Object.keys(errors).length > 0 && <InlineError message="Kiểm tra các trường được đánh dấu trước khi lưu xe." />}
      {write.pending && <InlineError message="Xe còn thao tác chưa rõ kết quả. Mở Tài khoản → Thao tác cần đối chiếu trước khi lưu tiếp." />}
      {!!write.error && <InlineError message={write.error} />}
      {(write.pending || write.error) && <Button secondary label="Mở Tài khoản để đối chiếu" onPress={() => router.push("/(tabs)/account")} />}
      <VehicleRegistrationOcr onBusyChange={setPhotosBusy} vehicleId={profile?.id} values={{ license: form.license, chassis: form.chassis, engine: form.engine, color: form.color, year: form.year }} disabled={write.busy||write.pending||write.checking} onApply={values => { setForm(current => ({ ...current, ...values })); setErrors({}); }} />
      <Card style={{ gap: 16 }}>
        <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>Thông tin xe</Text>
        {fields.map(field => <FormField key={field.key} label={field.label} value={form[field.key]} onChangeText={value => change(field.key, value)} editable={!locked} maxLength={field.max} keyboardType={field.numeric ? "number-pad" : "default"} autoCapitalize={field.key === "license" ? "characters" : "none"} error={errors[field.key]} inputRef={value => { inputs.current[field.key] = value; }} />)}
        <ChoiceField label="Loại xe" value={form.type} choices={options.types} onChange={value => change("type", value)} disabled={locked} error={errors.type} />
      </Card>
      <Card style={{ gap: 16 }}>
        <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>Kho và trạng thái</Text>
        <ChoiceField label="Cơ sở hiện tại" value={form.store_id} choices={stores} onChange={value => change("store_id", value)} disabled={!!storeLocked} searchable error={errors.store_id} />
        {!!profile?.ownerStoreName && <Text style={{ color: theme.muted }}>Cơ sở sở hữu: {profile.ownerStoreName}</Text>}
        <ChoiceField label="Trạng thái xe" value={form.status} choices={options.statuses.filter(row=>row.value!=='in_transit'||profile?.inTransit)} onChange={value => change("status", value)} disabled={locked||profile?.inTransit} error={errors.status} />
        <Text style={{ color: theme.muted, lineHeight: 23 }}>{profile?.inTransit ? "Xe đang chờ luân chuyển. Dùng xác nhận nhận xe ở cơ sở đích để cập nhật kho và trạng thái." : "Đổi trạng thái xe không thay đổi hợp đồng hoặc công nợ. Xe còn hợp đồng mở giữ nguyên cơ sở hiện tại."}</Text>
      </Card>
      <Card style={{gap:16}}>
        <Text accessibilityRole="header" style={{color:theme.text,fontSize:18,fontWeight:'700'}}>Giá trị và giá thuê</Text>
        {([['cost_price','Giá trị / giá mua xe'],['daily_price','Giá thuê xe']] as const).map(([key,label])=><FormField key={key} label={label} value={form[key]} onChangeText={value=>change(key,value)} editable={!locked} keyboardType="number-pad" maxLength={16} error={errors[key]} hint={form[key] && /^\d+$/.test(form[key]) ? money(Number(form[key])) : 'Để trống khi chưa ghi nhận giá.'} />)}
      </Card>
      <FormField label="Ghi chú thay đổi xe" value={form.note} onChangeText={value => change("note", value)} multiline maxLength={500} editable={!locked} hint="Thay đổi và ghi chú được lưu vào lịch sử cùng người thực hiện." />
      <Button label={profile ? "Rà soát và lưu xe" : "Rà soát và thêm xe"} loading={write.busy || write.checking} disabled={write.pending} onPress={validate} />
    </KeyboardFormScrollView>
    {confirm && <ConfirmEdit title={profile ? "Lưu thay đổi xe?" : "Thêm xe vào kho?"} message={`${form.name}\n${form.license.trim().toUpperCase()} · ${form.year}\n${stores.find(row => row.value === form.store_id)?.label}\n${options.statuses.find(row => row.value === form.status)?.label}\nLưu hồ sơ xe và ghi nhận thay đổi vào lịch sử.`} onCancel={() => setConfirm(false)} onConfirm={() => { setConfirm(false); void write.save(input()); }} />}
    {write.exit && <ConfirmEdit title="Rời biểu mẫu xe?" message="Thông tin chưa gửi trong biểu mẫu sẽ mất. Yêu cầu đã gửi vẫn giữ mã để đối chiếu trong Tài khoản." confirmLabel="Rời biểu mẫu" busy={write.busy} onCancel={write.cancelExit} onConfirm={write.leave} />}
  </>;
}
export function VehicleEditor({ id, store = "all" }: { id: string | null; store?: string }) {
  const { api, session } = useSession(), allowed = !!api && session?.user.permissions.includes("vehicles.write");
  const valid = id === null || /^[1-9]\d{0,14}$/.test(id);
  const options = useQuery({ queryKey: ["vehicle-options", session?.user.id], queryFn: ({ signal }) => api!.vehicleOptions(signal), enabled: allowed && valid });
  const profile = useQuery({ queryKey: ["vehicle-profile", session?.user.id, id], queryFn: ({ signal }) => api!.vehicleProfile(id!, signal), enabled: allowed && valid && id !== null, refetchOnWindowFocus: false, refetchOnReconnect: false });
  if (!allowed || !valid) return <StateView title="Không có quyền chỉnh sửa hồ sơ xe" />;
  if (options.isPending || id !== null && profile.isPending) return <StateView title="Đang mở hồ sơ xe" loading />;
  if (options.isError || id !== null && profile.isError) return <StateView title="Chưa mở được hồ sơ xe" message={options.error?.message || profile.error?.message} retry={() => { void options.refetch(); if (id) void profile.refetch(); }} />;
  if (id && !profile.data?.canEdit) return <StateView title="Xe ngoài phạm vi chỉnh sửa" message="Có thể tra cứu đội xe; chỉnh sửa vẫn áp dụng quyền và cơ sở như web." />;
  return <VehicleForm key={profile.data?.revision || "new"} options={options.data!} profile={id ? profile.data! : null} store={store} />;
}
