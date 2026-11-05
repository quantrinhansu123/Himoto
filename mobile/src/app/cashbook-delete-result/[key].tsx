import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { ScrollView, Text } from "react-native";
import { CASHBOOK_DELETE_OPERATION } from "../../../../shared/mobile-cashbook-delete";
import { useSession } from "@/providers/session";
import { pendingWrites } from "@/lib/pending-writes";
import { useTheme } from "@/theme";
import { Button, Card, InlineError, StateView } from "@/components/ui";
function Result({ requestKey }: { requestKey: string }) {
  const { api, session } = useSession(), theme = useTheme(), cache = useQueryClient();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const alive = useRef(true); useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const allowed = session!.user.permissions.includes("finance.read") && session!.user.permissions.includes("settings.write");
  const query = useQuery({ queryKey: ["cashbook-delete-result", session!.user.id, requestKey], queryFn: ({ signal }) => api!.cashbookDeletion(requestKey, signal), enabled: allowed });
  if (!allowed) return <StateView title="Không có quyền đối chiếu xóa phiếu" />;
  if (query.isPending) return <StateView title="Đang đối chiếu yêu cầu xóa phiếu" loading />;
  if (query.isError) return <StateView title="Chưa đọc được xác nhận xóa phiếu" message={query.error.message} retry={() => { void query.refetch(); }} />;
  async function acknowledge() {
    if (!api || !session || busy) return;
    setBusy(true); setError("");
    try {
      const scope = { origin: api.origin, userId: session.user.id, storeId: session.user.allStores ? null : session.user.storeId, allStores: session.user.allStores };
      const owner = await pendingWrites.entryScope(scope, CASHBOOK_DELETE_OPERATION, requestKey);
      if (!alive.current) return;
      if (owner) await pendingWrites.complete(owner, CASHBOOK_DELETE_OPERATION, requestKey);
      if (!alive.current) return;
      for (const queryKey of [["cashbook"], ["cashbook-accounts"], ["cashbook-account"], ["cashbook-account-transactions"], ["finance"], ["catalogue"], ["record"]]) void cache.invalidateQueries({ queryKey });
      router.replace("/cashbook");
    } catch (cause) { if (alive.current) setError((cause as Error).message); }
    finally { if (alive.current) setBusy(false); }
  }
  return <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 16, width: "100%", maxWidth: 760, alignSelf: "center" }}>
    <Card style={{ gap: 12 }}><Text accessibilityRole="header" style={{ color: theme.success, fontSize: 24, fontWeight: "800" }}>Đã xác nhận xóa {query.data.deletedCount} phiếu</Text>
      <Text style={{ color: theme.text, lineHeight: 23 }}>Đây là kết quả đợt xóa gốc của tài khoản hiện tại. Tiền và chứng từ liên quan đã được cập nhật trong cùng giao dịch.</Text>
      <Text style={{ color: theme.muted, lineHeight: 23 }}>Nếu danh sách lớn có nhiều đợt, xác nhận này chỉ áp dụng cho đợt có mã bên dưới. Tải lại sổ quỹ để rà các phiếu còn lại.</Text>
      <Text selectable style={{ color: theme.muted }}>Mã yêu cầu: {requestKey}</Text>
    </Card>
    {!!error && <InlineError message={error} />}<Button label="Đã kiểm tra xác nhận xóa phiếu" loading={busy} onPress={() => { void acknowledge(); }} />
  </ScrollView>;
}
export default function ResultRoute() {
  const { key } = useLocalSearchParams<{ key: string }>(), { api, session } = useSession();
  if (!api || !session) return <StateView title="Đăng nhập để đối chiếu xóa phiếu" />;
  return <Result key={`${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(",")}`} requestKey={key} />;
}
