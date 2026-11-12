import { useState } from "react";
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { Linking, ScrollView, Text } from "react-native";
import type { MobileStoreProfile } from "../../../../shared/mobile-stores";
import { useSession } from "@/providers/session";
import { useStoreWrite } from "@/hooks/use-store-write";
import { useTheme } from "@/theme";
import { Button, InlineError, StateView } from "@/components/ui";
import { StoreProfileCard } from "@/components/store-profile-card";
import { ConfirmEdit } from "@/components/editor-sheet";

function StoreDetails({ row }: { row: MobileStoreProfile }) {
  const { session } = useSession(), theme = useTheme(), write = useStoreWrite(String(row.id), false);
  const [remove, setRemove] = useState(false), [contactError, setContactError] = useState("");
  const editable = session!.user.permissions.includes("settings.write"), phone = row.phone.replace(/[\s().-]/g, "");
  return <>
    <Stack.Screen options={{ title: row.name }} />
    <SafeAreaView edges={['bottom','left','right']} style={{flex:1}}><ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 16, maxWidth: 760, width: "100%", alignSelf: "center" }}>
      <StoreProfileCard row={row} />
      {!!write.error && <InlineError message={write.error} />}
      {write.pending && <InlineError message="Cơ sở còn yêu cầu chưa rõ kết quả. Mở Tài khoản để đối chiếu trước khi sửa hoặc xóa." />}
      {(write.pending || write.error) && <Button secondary label="Mở Tài khoản để đối chiếu" onPress={() => router.push("/(tabs)/account")} />}
      {editable && <Button label="Chỉnh sửa cơ sở" disabled={write.busy || write.checking || write.pending} onPress={() => router.push({ pathname: "/store-editor/[id]", params: { id: String(row.id) } })} />}
      {!!contactError && <InlineError message={contactError} />}
      {/^\+?\d{9,13}$/.test(phone) && <Button secondary label="Gọi điện cơ sở" onPress={() => { setContactError(""); void Linking.openURL(`tel:${phone}`).catch(() => setContactError("Thiết bị chưa mở được cuộc gọi. Có thể sao chép số điện thoại ở trên.")); }} />}
      <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>Dữ liệu tại cơ sở</Text>
      {session!.user.permissions.includes('contracts.read')&&<Button secondary label="Hợp đồng của cơ sở" onPress={()=>router.push({pathname:'/store-records/[id]/[kind]',params:{id:String(row.id),kind:'contracts'}})}/>}
      {session!.user.permissions.includes("finance.read") && <Button secondary label="Sổ quỹ / Sổ két của cơ sở" onPress={() => router.push({ pathname: "/cashbook", params: { store: String(row.id) } })} />}
      {([{ kind: "staff", permission: "hr.read", label: "Nhân sự của cơ sở" }, { kind: "vehicles", permission: "vehicles.read", label: "Xe tại cơ sở" }, { kind: "customers", permission: "customers.read", label: "Khách hàng của cơ sở" }] as const).filter(link => session!.user.permissions.includes(link.permission)).map(link => <Button key={link.kind} secondary label={link.label} onPress={() => router.push({ pathname: "/store-records/[id]/[kind]", params: { id: String(row.id), kind: link.kind } })} />)}
      {editable && <Button secondary label="Xóa cơ sở" disabled={write.busy || write.checking || write.pending} onPress={() => setRemove(true)} />}
    </ScrollView></SafeAreaView>
    {remove && <ConfirmEdit title="Xóa cơ sở?" message={`${row.code} · ${row.name}\nChỉ xóa được cơ sở không có dữ liệu liên quan, kể cả dữ liệu lưu trữ. Thao tác xóa không thể hoàn tác. Có thể chọn Tạm ngừng trong Chỉnh sửa cơ sở để giữ lịch sử.`} confirmLabel="Xóa cơ sở" busy={write.busy} onCancel={() => setRemove(false)} onConfirm={() => { setRemove(false); void write.save({ revision: row.revision }, true); }} />}
    {write.exit && <ConfirmEdit title="Rời hồ sơ cơ sở?" message="Yêu cầu đã gửi vẫn giữ mã trong Tài khoản để đối chiếu. Kiểm tra kết quả trước khi gửi yêu cầu mới." confirmLabel="Rời hồ sơ" busy={write.busy} onCancel={write.cancelExit} onConfirm={write.leave} />}
  </>;
}
function StoreScreen({ id }: { id: string }) {
  const { api, session } = useSession(), valid = /^[1-9]\d{0,14}$/.test(id), allowed = session!.user.permissions.includes("contracts.read");
  const query = useQuery({ queryKey: ["store-profile", session!.user.id, id], queryFn: ({ signal }) => api!.storeProfile(id, signal), enabled: valid && allowed });
  if (!valid || !allowed) return <StateView title="Không có quyền xem cơ sở" />;
  if (query.isPending) return <StateView title="Đang tải cơ sở" loading />;
  if (query.isError) return <StateView title="Chưa mở được cơ sở" message={query.error.message} retry={() => { void query.refetch(); }} />;
  return <StoreDetails key={query.data.rowRevision} row={query.data} />;
}
export default function StoreRoute() {
  const { id } = useLocalSearchParams<{ id: string }>(), { api, session } = useSession();
  if (!api || !session) return <StateView title="Đăng nhập để xem cơ sở" />;
  return <StoreScreen key={`${id}:${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(",")}`} id={id} />;
}
