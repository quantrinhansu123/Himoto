import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { KeyboardAvoidingView, Platform, ScrollView, Text, type ScrollViewInstance, type TextInputInstance } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { STAFF_PROFILE_STATUSES, staffProfileValues, validateStaffProfile, type MobileStaffProfile, type MobileStaffOptions, type MobileStaffInput } from "../../../shared/mobile-staff";
import { useSession } from "@/providers/session";
import { useStaffWrite } from "@/hooks/use-staff-write";
import { useTheme } from "@/theme";
import { Button, Card, InlineError, StateView } from "./ui";
import { FormField, ChoiceField } from "./form-fields";
import { DateField } from "./date-field";
import { ConfirmEdit } from "./editor-sheet";
import { StaffIssuedCredentials } from "./staff-issued-credentials";

function StaffForm({ profile, options, defaultStore }: { profile: MobileStaffProfile | null; options: MobileStaffOptions; defaultStore: string }) {
  const { session } = useSession(), theme = useTheme(), insets = useSafeAreaInsets();
  const [initial] = useState(() => ({ name: profile?.name || "", phone: profile?.phone || "", email: profile?.email || "", position: profile?.position || "", status: profile?.status || "active", store_id: profile ? profile.storeId === null ? "" : String(profile.storeId) : defaultStore, joined_at: "" }));
  const [form, setForm] = useState(initial), [errors, setErrors] = useState<Record<string, string>>({}), [confirm, setConfirm] = useState(false);
  const scroll = useRef<ScrollViewInstance>(null), inputs = useRef<Record<string, TextInputInstance | null>>({});
  const dirty = Object.keys(form).some(key => form[key as keyof typeof form] !== initial[key as keyof typeof form]);
  const write = useStaffWrite(profile ? String(profile.id) : null, dirty), locked = write.busy || write.checking || write.pending;
  const stores = [{ value: "", label: "Trụ sở công ty / Chưa phân bổ" }, ...options.stores.map(row => ({ value: String(row.id), label: row.name }))];
  if (profile?.storeId && !stores.some(row => row.value === String(profile.storeId))) stores.push({ value: String(profile.storeId), label: profile.storeName || `Cơ sở #${profile.storeId}` });
  const positions = [...new Set([...options.positions, form.position].filter(Boolean))].map(value => ({ value, label: value }));
  const change = (key: keyof typeof form, value: string) => { setForm(current => ({ ...current, [key]: value })); setErrors(current => ({ ...current, [key]: "" })); };
  function input(): MobileStaffInput {
    return { ...staffProfileValues(form), ...(profile ? { revision: profile.revision } : { joined_at: form.joined_at }) };
  }
  function review() {
    const next = validateStaffProfile(input());
    if (!session!.user.allStores && Number(form.store_id) !== session!.user.storeId) next.store_id = "Chọn cơ sở trong phạm vi tài khoản.";
    setErrors(next);
    if (Object.keys(next).length) { scroll.current?.scrollTo({ y: 0 }); requestAnimationFrame(() => inputs.current[Object.keys(next)[0]]?.focus()); return; }
    setConfirm(true);
  }
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: 24 + insets.bottom, gap: 18, maxWidth: 760, width: "100%", alignSelf: "center" }}>
      <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 26, fontWeight: "800" }}>{profile ? "Sửa nhân sự" : "Thêm nhân sự"}</Text>
      <Text style={{ color: theme.muted, lineHeight: 23 }}>{profile ? `${profile.code} · Thay đổi cơ sở hoặc trạng thái sẽ đồng bộ với tài khoản đăng nhập đã liên kết.` : "Mã nhân sự được hệ thống tự cấp. Mặc định trạng thái Bình thường."}</Text>
      {!!Object.keys(errors).length && <InlineError message="Kiểm tra các trường được đánh dấu trước khi lưu nhân sự." />}
      {write.pending && !write.issued && <InlineError message="Nhân sự còn yêu cầu chưa rõ kết quả. Mở Tài khoản để đối chiếu trước khi lưu tiếp." />}
      {!!write.error && <InlineError message={write.error} />}
      {(write.pending && !write.issued || write.error) && <Button secondary label="Mở Tài khoản để đối chiếu" onPress={() => router.push("/(tabs)/account")} />}
      <Card style={{ gap: 16 }}>
        {([{ key: "name", label: "Họ và tên" }, { key: "phone", label: "Số điện thoại nhân sự" }, { key: "email", label: "Email nhân sự" }, { key: "position", label: "Chức vụ" }] as const).map(field => <FormField key={field.key} label={field.label} value={form[field.key]} onChangeText={value => change(field.key, value)} editable={!locked} maxLength={191} keyboardType={field.key === "phone" ? "phone-pad" : field.key === "email" ? "email-address" : "default"} autoCapitalize={field.key === "email" ? "none" : "sentences"} error={errors[field.key]} inputRef={value => { inputs.current[field.key] = value; }} />)}
        <ChoiceField label="Gợi ý chức vụ" value={form.position} choices={[{ value: "", label: "Chọn gợi ý hoặc gõ chức vụ ở trên" }, ...positions]} onChange={value => change("position", value)} searchable disabled={locked} />
        <Text style={{ color: theme.muted, lineHeight: 22 }}>Kiêm nhiệm: ngăn cách bằng dấu /. Chức vụ ghi nhận công việc; quyền tài khoản được quản lý riêng.</Text>
      </Card>
      <Card style={{ gap: 16 }}>
        <ChoiceField label="Cơ sở làm việc" value={form.store_id} choices={stores} onChange={value => change("store_id", value)} disabled={locked} searchable error={errors.store_id} />
        <ChoiceField label="Trạng thái nhân sự" value={form.status} choices={STAFF_PROFILE_STATUSES} onChange={value => change("status", value)} disabled={locked} error={errors.status} />
        <Text style={{ color: theme.muted, lineHeight: 23 }}>Tài khoản theo một cơ sở sẽ chuyển phạm vi truy cập khi đổi cơ sở; tài khoản toàn cơ sở giữ nguyên phạm vi. Đã nghỉ việc sẽ khóa tài khoản đã liên kết.</Text>
        {!profile && <DateField label="Ngày vào làm" value={form.joined_at} onChange={value => change("joined_at", value)} disabled={locked} error={errors.joined_at} />}
      </Card>
      <Button label={profile ? "Rà soát và lưu nhân sự" : "Rà soát và thêm nhân sự"} loading={write.busy || write.checking} disabled={write.pending} onPress={review} />
    </ScrollView>
    {confirm && <ConfirmEdit title={profile ? "Lưu thay đổi nhân sự?" : "Thêm nhân sự?"} message={`${form.name.trim()}\n${form.phone.trim()}\n${input().position || "Chưa ghi chức vụ"}\n${stores.find(row => row.value === form.store_id)?.label}\n${STAFF_PROFILE_STATUSES.find(row => row.value === form.status)?.label}`} onCancel={() => setConfirm(false)} onConfirm={() => { setConfirm(false); void write.save(input()); }} />}
    {write.issued && <StaffIssuedCredentials value={write.issued.value} onClose={write.closeIssued} />}
    {write.exit && <ConfirmEdit title="Rời biểu mẫu nhân sự?" message="Thông tin chưa gửi trong biểu mẫu sẽ mất. Yêu cầu đã gửi vẫn giữ mã để đối chiếu trong Tài khoản." confirmLabel="Rời biểu mẫu" onCancel={write.cancelExit} onConfirm={write.leave} busy={write.busy} />}
  </KeyboardAvoidingView>;
}
export function StaffEditor({ id, store }: { id: string | null; store?: string }) {
  const { api, session } = useSession(), allowed = !!api && session!.user.permissions.includes("hr.write"), valid = id === null || /^[1-9]\d{0,14}$/.test(id);
  const options = useQuery({ queryKey: ["staff-options", session?.user.id], queryFn: ({ signal }) => api!.staffOptions(signal), enabled: allowed && valid });
  const profile = useQuery({ queryKey: ["staff-profile", session?.user.id, id], queryFn: ({ signal }) => api!.staffProfile(id!, signal), enabled: allowed && valid && id !== null, refetchOnWindowFocus: false, refetchOnReconnect: false });
  if (!allowed || !valid) return <StateView title="Không có quyền quản lý nhân sự" />;
  if (options.isPending || id !== null && profile.isPending) return <StateView title="Đang mở biểu mẫu nhân sự" loading />;
  if (options.isError || id !== null && profile.isError) return <StateView title="Chưa mở được biểu mẫu" message={options.error?.message || profile.error?.message} retry={() => { void options.refetch(); if (id) void profile.refetch(); }} />;
  return <StaffForm key={profile.data?.revision || "new"} profile={id ? profile.data! : null} options={options.data!} defaultStore={store && /^[1-9]\d{0,14}$/.test(store) ? store : session!.user.allStores ? "" : String(session!.user.storeId || "")} />;
}
