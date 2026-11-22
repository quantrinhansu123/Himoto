import { useState } from "react";
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { Linking, ScrollView, Text, View } from "react-native";
import type { MobileStaffProfile } from "../../../../shared/mobile-staff";
import { useSession } from "@/providers/session";
import { useStaffWrite } from "@/hooks/use-staff-write";
import { useTheme } from "@/theme";
import { Button, InlineError, StateView } from "@/components/ui";
import { StaffProfileCard } from "@/components/staff-profile-card";
import { StaffLinkedAccounts } from '@/components/staff-linked-accounts';
import { ConfirmEdit } from "@/components/editor-sheet";
function StaffDetails({ row }: { row: MobileStaffProfile }) {
  const { session } = useSession(), theme = useTheme(), write = useStaffWrite(String(row.id), false);
  const [confirm, setConfirm] = useState<"delete" | "leave" | null>(null), [contactError, setContactError] = useState("");
  const editable = session!.user.permissions.includes("hr.write"), locked = write.busy || write.checking || write.pending, phone = row.phone.replace(/[\s().-]/g, "");
  const canCall = /^\+?\d{9,13}$/.test(phone);
  return <>
    <Stack.Screen options={{ title: row.name }} />
    <SafeAreaView edges={['bottom','left','right']} style={{flex:1,backgroundColor:theme.background}}><ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12, maxWidth: 760, width: "100%", alignSelf: "center" }}>
      <StaffProfileCard row={row} />
      {(editable || canCall) && (
        <View style={{ flexDirection: "row", gap: 8 }}>
          {editable && <Button size="sm" equalWidth label="Sửa nhân sự" disabled={locked} onPress={() => router.push({ pathname: "/staff-editor/[id]", params: { id: String(row.id) } })} />}
          {canCall && <Button size="sm" equalWidth secondary label={`Gọi ${phone}`} onPress={() => { setContactError(""); void Linking.openURL(`tel:${phone}`).catch(() => setContactError("Thiết bị chưa mở được cuộc gọi. Có thể sao chép số điện thoại ở trên.")); }} />}
        </View>
      )}
      {!!contactError && <InlineError message={contactError} />}
      <StaffLinkedAccounts id={row.id} />
      {!!write.error && <InlineError message={write.error} />}
      {write.pending && <InlineError message="Nhân sự còn yêu cầu chưa rõ kết quả. Mở Tài khoản để đối chiếu trước khi sửa hoặc xóa." />}
      {(write.pending || write.error) && <Button size="sm" secondary label="Mở Tài khoản để đối chiếu" onPress={() => router.push("/(tabs)/account")} />}
      {editable && <>
        <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 19 }}>Đã nghỉ việc giữ hồ sơ và khóa tài khoản đã liên kết. Xóa hồ sơ chỉ thực hiện khi không có dữ liệu liên quan.</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {row.status !== "leave" && <Button size="sm" equalWidth secondary label="Chuyển Đã nghỉ việc" disabled={locked} onPress={() => setConfirm("leave")} />}
          <Button size="sm" equalWidth secondary danger label="Xóa hồ sơ nhân sự" disabled={locked} onPress={() => setConfirm("delete")} />
        </View>
      </>}
    </ScrollView></SafeAreaView>
    {confirm && <ConfirmEdit title={confirm === "delete" ? "Xóa hồ sơ nhân sự?" : "Chuyển sang Đã nghỉ việc?"} message={`${row.code} · ${row.name}\n${confirm === "delete" ? "Xóa vĩnh viễn hồ sơ; không tự khóa hoặc xóa tài khoản đăng nhập. Nhân sự còn lịch trực hoặc dữ liệu liên quan sẽ bị chặn xóa. Đổi sang Đã nghỉ việc để khóa tài khoản và giữ lịch sử." : "Giữ hồ sơ nhân sự, khóa và ngừng tài khoản đăng nhập đã liên kết."}`} confirmLabel={confirm === "delete" ? "Xóa hồ sơ nhân sự" : "Xác nhận nghỉ việc"} busy={write.busy} onCancel={() => setConfirm(null)} onConfirm={() => { const removing = confirm === "delete"; setConfirm(null); void write.save(removing ? { revision: row.revision } : { name: row.name, phone: row.phone, email: row.email, position: row.position, store_id: row.storeId, status: "leave", revision: row.revision }, removing); }} />}
    {write.exit && <ConfirmEdit title="Rời hồ sơ nhân sự?" message="Yêu cầu đã gửi vẫn giữ mã trong Tài khoản để đối chiếu. Kiểm tra kết quả trước khi gửi yêu cầu mới." confirmLabel="Rời hồ sơ" busy={write.busy} onCancel={write.cancelExit} onConfirm={write.leave} />}
  </>;
}
function StaffScreen({ id }: { id: string }) {
  const { api, session } = useSession(), valid = /^[1-9]\d{0,14}$/.test(id), allowed = session!.user.permissions.includes("hr.read");
  const query = useQuery({ queryKey: ["staff-profile", session!.user.id, id], queryFn: ({ signal }) => api!.staffProfile(id, signal), enabled: valid && allowed });
  if (!valid || !allowed) return <StateView title="Không có quyền xem nhân sự" />;
  if (query.isPending) return <StateView title="Đang tải nhân sự" loading />;
  if (query.isError) return <StateView title="Chưa mở được nhân sự" message={query.error.message} retry={() => { void query.refetch(); }} />;
  return <StaffDetails key={query.data.revision} row={query.data} />;
}
export default function StaffRoute() {
  const { id } = useLocalSearchParams<{ id: string }>(), { api, session } = useSession();
  if (!api || !session) return <StateView title="Đăng nhập để xem nhân sự" />;
  return <StaffScreen key={`${id}:${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(",")}`} id={id} />;
}
