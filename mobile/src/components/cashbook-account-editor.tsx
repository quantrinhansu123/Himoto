import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { KeyboardAvoidingView, Platform, ScrollView, Text, type ScrollViewInstance, type TextInputInstance } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cashbookAccountValues, validateCashbookAccount, type CashbookAccountKind, type CashbookAccountInput, type MobileCashbookAccount } from "../../../shared/mobile-cashbook";
import { useSession } from "@/providers/session";
import { useCashbookAccountWrite } from "@/hooks/use-cashbook-account-write";
import { money, useTheme } from "@/theme";
import { Button, Card, InlineError, StateView } from "./ui";
import { FormField, ChoiceField } from "./form-fields";
import { ConfirmEdit } from "./editor-sheet";
const types = [{ value: "cash", label: "Tiền mặt (két)" }, { value: "bank", label: "Ngân hàng cơ sở" }, { value: "company", label: "TK công ty" }];
function AccountForm({ profile, kind: initialKind, stores: storeRows, store }: { profile: MobileCashbookAccount | null; kind: CashbookAccountKind; stores: { id: number; name: string }[]; store?: string }) {
  const theme = useTheme(), { session } = useSession(), insets = useSafeAreaInsets();
  const [initial] = useState(() => ({ type: profile ? profile.kind === "cash" ? "cash" : profile.ownerType === "company" ? "company" : "bank" : initialKind,
    store_id: profile ? profile.storeId ? String(profile.storeId) : "" : store && /^[1-9]\d{0,14}$/.test(store) ? store : session!.user.allStores ? "" : String(session!.user.storeId || ""),
    name: profile?.name || "", bank_name: profile?.bankName || "", owner_name: profile?.ownerName || "", account_number: profile?.accountNumber || "", opening_balance: String(profile?.opening ?? 0), status: profile?.status || "active" }));
  const [form, setForm] = useState(initial), [errors, setErrors] = useState<Record<string, string>>({}), [confirm, setConfirm] = useState(false);
  const scroll = useRef<ScrollViewInstance>(null), inputs = useRef<Record<string, TextInputInstance | null>>({}), kind: CashbookAccountKind = form.type === "cash" ? "cash" : "bank";
  const dirty = Object.keys(form).some(key => form[key as keyof typeof form] !== initial[key as keyof typeof form]), write = useCashbookAccountWrite(kind, profile ? String(profile.id) : null, dirty), locked = write.busy || write.checking || write.pending;
  const stores = [{ value: "", label: form.type === "company" ? "Toàn công ty (dùng chung mọi cơ sở)" : "Chọn cơ sở" }, ...storeRows.map(row => ({ value: String(row.id), label: row.name }))];
  if (profile?.storeId && !stores.some(row => row.value === String(profile.storeId))) stores.push({ value: String(profile.storeId), label: profile.storeName || `Cơ sở #${profile.storeId}` });
  const change = (key: keyof typeof form, value: string) => { setForm(current => ({ ...current, [key]: value })); setErrors(current => ({ ...current, [key]: "" })); };
  function input(): CashbookAccountInput {
    return { status: form.status as "active" | "inactive", store_id: form.store_id || "0", opening_balance: Number(form.opening_balance),
      ...(kind === "cash" ? { name: form.name.trim() } : { owner_type: form.type === "company" ? "company" as const : "store" as const, bank_name: form.bank_name.trim(), owner_name: form.owner_name.trim(), account_number: form.account_number.trim() }), ...(profile ? { revision: profile.revision } : {}) };
  }
  function review() {
    const next = validateCashbookAccount(kind, cashbookAccountValues(kind, input() as unknown as Record<string, unknown>));
    if (form.opening_balance.trim() === "") next.opening_balance = "Nhập số dư đầu kỳ, đơn vị đồng.";
    setErrors(next);
    if (Object.keys(next).length) { scroll.current?.scrollTo({ y: 0 }); requestAnimationFrame(() => inputs.current[Object.keys(next)[0]]?.focus()); return; }
    setConfirm(true);
  }
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: 24 + insets.bottom, gap: 18, maxWidth: 760, width: "100%", alignSelf: "center" }}>
      <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 26, fontWeight: "800" }}>{profile ? "Sửa tài khoản sổ quỹ" : "Thêm tài khoản sổ quỹ"}</Text>
      {write.pending && <InlineError message="Tài khoản còn yêu cầu chưa rõ kết quả. Mở Tài khoản → Thao tác cần đối chiếu trước khi lưu tiếp." />}
      {!!write.error && <InlineError message={write.error} />}
      {(write.pending || write.error) && <Button secondary label="Mở Tài khoản để đối chiếu" onPress={() => router.push("/(tabs)/account")} />}
      <Card style={{ gap: 16 }}>
        <ChoiceField label="Loại tài khoản sổ quỹ" value={form.type} choices={types.filter(row => !profile || (profile.kind === "cash" ? row.value === "cash" : row.value !== "cash"))} onChange={value => change("type", value)} disabled={locked || profile?.kind === "cash"} />
        <ChoiceField label="Cơ sở tài khoản sổ quỹ" value={form.store_id} choices={stores} onChange={value => change("store_id", value)} disabled={locked} searchable error={errors.store_id} />
        {kind === "cash" ? <FormField label="Tên két / nội dung" value={form.name} onChangeText={value => change("name", value)} editable={!locked} maxLength={191} error={errors.name} hint="Để trống sẽ hiện Két tiền mặt #số." inputRef={value => { inputs.current.name = value; }} /> : <>
          {([{ key: "bank_name", label: "Ngân hàng" }, { key: "owner_name", label: "Chủ tài khoản" }, { key: "account_number", label: "Số tài khoản" }] as const).map(field => <FormField key={field.key} label={field.label} value={form[field.key]} onChangeText={value => change(field.key, value)} editable={!locked} maxLength={191} autoCapitalize={field.key === "account_number" ? "none" : "words"} error={errors[field.key]} inputRef={value => { inputs.current[field.key] = value; }} />)}
        </>}
        <FormField label="Số dư đầu kỳ (đồng)" value={form.opening_balance} onChangeText={value => change("opening_balance", value)} editable={!locked} maxLength={16} keyboardType={Platform.OS === "ios" ? "numbers-and-punctuation" : "default"} error={errors.opening_balance} hint="Số nguyên, cho phép số âm; không nhập dấu phân cách hàng nghìn." inputRef={value => { inputs.current.opening_balance = value; }} />
        <ChoiceField label="Trạng thái sử dụng tài khoản" value={form.status} choices={[{ value: "active", label: "Đang sử dụng" }, { value: "inactive", label: "Ngừng sử dụng" }]} onChange={value => change("status", value)} disabled={locked} error={errors.status} />
      </Card>
      <Button label={profile ? "Rà soát và lưu tài khoản" : "Rà soát và thêm tài khoản"} onPress={review} loading={write.busy || write.checking} disabled={write.pending} />
    </ScrollView>
    {confirm && <ConfirmEdit title={profile ? "Lưu thay đổi tài khoản?" : "Thêm tài khoản sổ quỹ?"} message={`${types.find(row => row.value === form.type)?.label}\n${kind === "cash" ? form.name || "Két tiền mặt (tên tự động)" : [form.bank_name, form.owner_name, form.account_number].join(" · ")}\n${stores.find(row => row.value === form.store_id)?.label}\nSố dư đầu kỳ: ${money(Number(form.opening_balance))}\n${form.status === "active" ? "Đang sử dụng" : "Ngừng sử dụng"}`} onCancel={() => setConfirm(false)} onConfirm={() => { setConfirm(false); void write.save(input(), profile ? "update" : "create"); }} />}
    {write.exit && <ConfirmEdit title="Rời biểu mẫu tài khoản?" message="Thông tin chưa gửi sẽ mất. Yêu cầu đã gửi vẫn giữ mã trong Tài khoản để đối chiếu." confirmLabel="Rời biểu mẫu" onCancel={write.cancelExit} onConfirm={write.leave} busy={write.busy} />}
  </KeyboardAvoidingView>;
}
export function CashbookAccountEditor({ kind, id, store }: { kind: CashbookAccountKind; id: string | null; store?: string }) {
  const { api, session } = useSession(), allowed = !!api && session!.user.permissions.includes("finance.write");
  const options = useQuery({ queryKey: ["cashbook-account-options", session?.user.id], queryFn: ({ signal }) => api!.cashbookOptions(signal), enabled: allowed });
  const profile = useQuery({ queryKey: ["cashbook-account", session?.user.id, kind, id], queryFn: ({ signal }) => api!.cashbookAccount(kind, id!, signal), enabled: allowed && id !== null, refetchOnWindowFocus: false, refetchOnReconnect: false });
  if (!allowed) return <StateView title="Không có quyền quản lý tài khoản sổ quỹ" />;
  if (options.isPending || id !== null && profile.isPending) return <StateView title="Đang mở tài khoản sổ quỹ" loading />;
  if (options.isError || id !== null && profile.isError) return <StateView title="Chưa mở được biểu mẫu" message={options.error?.message || profile.error?.message} retry={() => { void options.refetch(); if (id) void profile.refetch(); }} />;
  return <AccountForm key={profile.data?.revision || "new"} profile={id ? profile.data! : null} kind={kind} stores={options.data!.stores} store={store} />;
}
