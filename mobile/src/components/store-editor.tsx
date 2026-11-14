import { KeyboardFormScrollView } from "./keyboard-form-scroll-view";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Text, type ScrollViewInstance, type TextInputInstance } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { STORE_KINDS, MOBILE_STORE_STATUSES, validateStoreCreation, validateStoreEdits, type StoreCreation, type MobileStoreProfile, type MobileStoreManagers } from "../../../shared/mobile-stores";
import { useSession } from "@/providers/session";
import { useStoreWrite } from "@/hooks/use-store-write";
import { useTheme } from "@/theme";
import { Button, Card, InlineError, StateView } from "./ui";
import { FormField, ChoiceField } from "./form-fields";
import { ConfirmEdit } from "./editor-sheet";

function StoreForm({ profile, managers }: { profile: MobileStoreProfile | null; managers: MobileStoreManagers }) {
  const theme = useTheme(), insets = useSafeAreaInsets();
  const [initial] = useState(() => ({ name: profile?.name || "", phone: profile?.phone || "", address: profile?.address || "", status: profile?.status || "active", user_id: profile?.managerId ?? null, revision: profile?.revision || "", code: profile?.code || "", kind: profile?.kind || "physical" }));
  const [form, setForm] = useState(initial), [errors, setErrors] = useState<Record<string, string>>({}), [confirm, setConfirm] = useState(false);
  const scroll = useRef<ScrollViewInstance>(null), inputs = useRef<Record<string, TextInputInstance | null>>({});
  const dirty = Object.keys(form).some(key => form[key as keyof typeof form] !== initial[key as keyof typeof form]);
  const write = useStoreWrite(profile ? String(profile.id) : null, dirty), locked = write.busy || write.checking || write.pending;
  const choices = [{ value: "", label: "Chưa phân công" }, ...managers.managers.map(row => ({ value: String(row.id), label: `${row.name} · #${row.id}` }))];
  if (profile?.managerId != null && !choices.some(row => row.value === String(profile.managerId))) choices.push({ value: String(profile.managerId), label: `${profile.managerName || `Tài khoản #${profile.managerId}`} (hiện tại)` });
  const change = (key: keyof typeof form, value: string | number | null) => { setForm(current => ({ ...current, [key]: value })); setErrors(current => ({ ...current, [key]: "" })); };
  function details() { return { name: form.name.trim(), phone: form.phone.trim(), address: form.address.trim(), status: form.status, user_id: form.user_id }; }
  function creation(): StoreCreation { return { ...details(), code: form.code.trim().toUpperCase(), kind: form.kind }; }
  function review() {
    const next = profile ? validateStoreEdits(details()) : validateStoreCreation(creation()); setErrors(next);
    if (Object.keys(next).length) { scroll.current?.scrollTo({ y: 0 }); requestAnimationFrame(() => inputs.current[Object.keys(next)[0]]?.focus()); return; }
    setConfirm(true);
  }
  return <><KeyboardFormScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: 24 + insets.bottom, gap: 18, maxWidth: 760, width: "100%", alignSelf: "center" }}>
      <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 26, fontWeight: "800" }}>{profile ? "Chỉnh sửa cơ sở" : "Thêm cơ sở"}</Text>
      {!!Object.keys(errors).length && <InlineError message="Kiểm tra các trường được đánh dấu trước khi lưu cơ sở." />}
      {write.pending && <InlineError message="Cơ sở còn yêu cầu chưa rõ kết quả. Mở Tài khoản để đối chiếu trước khi lưu tiếp." />}
      {!!write.error && <InlineError message={write.error} />}
      {(write.pending || write.error) && <Button secondary label="Mở Tài khoản để đối chiếu" onPress={() => router.push("/(tabs)/account")} />}
      <Card style={{ gap: 16 }}>
        {profile ? <Text style={{ color: theme.muted }}>{profile.code} · {STORE_KINDS.find(row => row.value === profile.kind)?.label || profile.kind}</Text> : <>
          <FormField label="Mã cơ sở" value={form.code} onChangeText={value => change("code", value)} editable={!locked} maxLength={191} autoCapitalize="characters" error={errors.code} hint="Để trống để tạo mã tự động. Dùng chữ không dấu, số, dấu - hoặc _." inputRef={value => { inputs.current.code = value; }} />
          <ChoiceField label="Loại cơ sở" value={form.kind} choices={STORE_KINDS} onChange={value => change("kind", value)} disabled={locked} error={errors.kind} />
        </>}
        {([{ key: "name", label: "Tên cơ sở", required: true }, { key: "phone", label: "Số điện thoại" }, { key: "address", label: "Địa chỉ" }] as const).map(field => <FormField key={field.key} label={field.label} value={form[field.key]} onChangeText={value => change(field.key, value)} editable={!locked} maxLength={255} keyboardType={field.key === "phone" ? "phone-pad" : "default"} autoCapitalize={field.key === "phone" ? "none" : "sentences"} error={errors[field.key]} inputRef={value => { inputs.current[field.key] = value; }} />)}
        <ChoiceField label="Người phụ trách cơ sở" value={form.user_id === null ? "" : String(form.user_id)} choices={choices} onChange={value => change("user_id", value ? Number(value) : null)} searchable disabled={locked} error={errors.user_id} />
        <ChoiceField label="Trạng thái cơ sở" value={form.status} choices={MOBILE_STORE_STATUSES} onChange={value => change("status", value)} disabled={locked} error={errors.status} />
      </Card>
      <Button label={profile ? "Rà soát và lưu cơ sở" : "Rà soát và tạo cơ sở"} loading={write.busy || write.checking} disabled={write.pending} onPress={review} />
    </KeyboardFormScrollView>
    {confirm && <ConfirmEdit title={profile ? "Lưu thay đổi cơ sở?" : "Tạo cơ sở?"} message={`${form.name.trim()}\n${MOBILE_STORE_STATUSES.find(row => row.value === form.status)?.label}\nPhụ trách: ${choices.find(row => row.value === (form.user_id === null ? "" : String(form.user_id)))?.label}`} onCancel={() => setConfirm(false)} onConfirm={() => { setConfirm(false); void write.save(profile ? { ...details(), revision: profile.revision } : creation()); }} />}
    {write.exit && <ConfirmEdit title="Rời biểu mẫu cơ sở?" message="Thông tin chưa gửi trong biểu mẫu sẽ mất. Yêu cầu đã gửi vẫn giữ mã để đối chiếu trong Tài khoản." confirmLabel="Rời biểu mẫu" onCancel={write.cancelExit} onConfirm={write.leave} busy={write.busy} />}
  </>;
}
export function StoreEditor({ id }: { id: string | null }) {
  const { api, session } = useSession(), allowed = !!api && session!.user.permissions.includes("settings.write"), valid = id === null || /^[1-9]\d{0,14}$/.test(id);
  const managers = useQuery({ queryKey: ["store-managers", session?.user.id], queryFn: ({ signal }) => api!.storeManagers(signal), enabled: allowed && valid });
  const profile = useQuery({ queryKey: ["store-profile", session?.user.id, id], queryFn: ({ signal }) => api!.storeProfile(id!, signal), enabled: allowed && valid && id !== null, refetchOnWindowFocus: false, refetchOnReconnect: false });
  if (!allowed || !valid) return <StateView title="Không có quyền quản lý cơ sở" />;
  if (managers.isPending || id !== null && profile.isPending) return <StateView title="Đang mở biểu mẫu cơ sở" loading />;
  if (managers.isError || id !== null && profile.isError) return <StateView title="Chưa mở được biểu mẫu" message={managers.error?.message || profile.error?.message} retry={() => { void managers.refetch(); if (id) void profile.refetch(); }} />;
  return <StoreForm key={profile.data?.rowRevision || "new"} profile={id ? profile.data! : null} managers={managers.data!} />;
}
