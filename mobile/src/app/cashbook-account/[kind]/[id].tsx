import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { ScrollView } from "react-native";
import type { MobileCashbookAccount, CashbookAccountKind } from "../../../../../shared/mobile-cashbook";
import { useSession } from "@/providers/session";
import { useCashbookAccountWrite } from "@/hooks/use-cashbook-account-write";
import { Button, InlineError, StateView } from "@/components/ui";
import { ConfirmEdit } from "@/components/editor-sheet";
import { CashbookAccountCard } from "@/components/cashbook-account-card";
function AccountInfo({ row }: { row: MobileCashbookAccount }) {
  const { session } = useSession(), write = useCashbookAccountWrite(row.kind, String(row.id), false);
  const [confirm, setConfirm] = useState<"status" | "delete" | null>(null), editable = session!.user.permissions.includes("finance.write"), locked = write.busy || write.checking || write.pending;
  return <>
    <Stack.Screen options={{ title: row.kind === "cash" ? "Két tiền mặt" : "Tài khoản ngân hàng" }} />
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 16, width: "100%", maxWidth: 760, alignSelf: "center" }}>
      <CashbookAccountCard row={row} details />
      {!!write.error && <InlineError message={write.error} />}
      {write.pending && <InlineError message="Tài khoản còn yêu cầu chưa rõ kết quả. Mở Tài khoản → Thao tác cần đối chiếu trước khi sửa tiếp." />}
      {(write.error || write.pending) && <Button secondary label="Mở Tài khoản để đối chiếu" onPress={() => router.push("/(tabs)/account")} />}
      <Button secondary label="Danh sách thu chi của tài khoản" onPress={() => router.push({ pathname: "/cashbook-account-transactions/[kind]/[id]", params: { kind: row.kind, id: String(row.id) } })} />
      {editable && <>
        <Button label="Sửa tài khoản sổ quỹ" disabled={locked} onPress={() => router.push({ pathname: "/cashbook-account-editor/[kind]/[id]", params: { kind: row.kind, id: String(row.id) } })} />
        {row.status === "active" && <Button secondary label="Ngừng sử dụng tài khoản" disabled={locked} onPress={() => setConfirm("status")} />}
        {row.voucherCount === 0 && <Button secondary label="Xóa tài khoản sổ quỹ" disabled={locked} onPress={() => setConfirm("delete")} />}
      </>}
    </ScrollView>
    {confirm && <ConfirmEdit title={confirm === "delete" ? "Xóa tài khoản sổ quỹ?" : "Ngừng sử dụng tài khoản?"} message={`${row.label}\n${confirm === "delete" ? "Xóa vĩnh viễn. Chỉ xóa được tài khoản chưa có phiếu thu/chi nào; nếu có phiếu, chọn Ngừng sử dụng để giữ lịch sử." : "Tài khoản sẽ không xuất hiện khi chọn thu/chi mới. Số dư và toàn bộ lịch sử thu chi được giữ nguyên."}`} confirmLabel={confirm === "delete" ? "Xóa tài khoản" : "Xác nhận ngừng sử dụng"} onCancel={() => setConfirm(null)} onConfirm={() => { const action = confirm!; setConfirm(null); void write.save({ revision: row.revision, ...(action === "status" ? { status: "inactive" } : {}) }, action); }} />}
    {write.exit && <ConfirmEdit title="Rời tài khoản sổ quỹ?" message="Yêu cầu đã gửi vẫn giữ mã để đối chiếu trong Tài khoản. Kiểm tra kết quả trước khi gửi yêu cầu mới." confirmLabel="Rời hồ sơ" busy={write.busy} onCancel={write.cancelExit} onConfirm={write.leave} />}
  </>;
}
function Account({ kind, id }: { kind: CashbookAccountKind; id: string }) {
  const { api, session } = useSession(), allowed = session!.user.permissions.includes("finance.read");
  const query = useQuery({ queryKey: ["cashbook-account", session!.user.id, kind, id], queryFn: ({ signal }) => api!.cashbookAccount(kind, id, signal), enabled: allowed });
  if (!allowed) return <StateView title="Không có quyền xem tài khoản sổ quỹ" />;
  if (query.isPending) return <StateView title="Đang tính số dư tài khoản" loading />;
  if (query.isError) return <StateView title="Chưa mở được tài khoản" message={query.error.message} retry={() => { void query.refetch(); }} />;
  return <AccountInfo key={query.data.revision} row={query.data} />;
}
export default function AccountRoute() {
  const { kind, id } = useLocalSearchParams<{ kind: string; id: string }>(), { api, session } = useSession();
  if (!api || !session || kind !== "bank" && kind !== "cash" || !/^[1-9]\d{0,14}$/.test(id)) return <StateView title="Không mở được tài khoản sổ quỹ" />;
  return <Account key={`${kind}:${id}:${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(",")}`} kind={kind} id={id} />;
}
