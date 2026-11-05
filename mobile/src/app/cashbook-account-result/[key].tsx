import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { ScrollView, Text } from "react-native";
import { useSession } from "@/providers/session";
import { pendingWrites } from "@/lib/pending-writes";
import { useTheme } from "@/theme";
import { Button, Card, InlineError, StateView } from "@/components/ui";
import { CashbookAccountCard } from "@/components/cashbook-account-card";
function Result({ requestKey }: { requestKey: string }) {
  const { api, session } = useSession(), theme = useTheme(), cache = useQueryClient(), alive = useRef(true);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const allowed = /^[0-9a-f-]{36}$/.test(requestKey) && session!.user.permissions.includes("finance.read");
  const query = useQuery({ queryKey: ["cashbook-account-result", session!.user.id, requestKey], queryFn: ({ signal }) => api!.cashbookAccountResult(requestKey, signal), enabled: allowed });
  if (!allowed) return <StateView title="Không mở được xác nhận tài khoản" />;
  if (query.isPending) return <StateView title="Đang đối chiếu tài khoản sổ quỹ" loading />;
  if (query.isError) return <StateView title="Chưa tải được xác nhận tài khoản" message={query.error.message} retry={() => { void query.refetch(); }} />;
  const result = query.data, action = result.operation.split(".")[1].split(":")[0];
  async function acknowledge() {
    if (!api || !session || busy) return;
    setBusy(true); setError("");
    try {
      const scope = { origin: api.origin, userId: session.user.id, storeId: session.user.allStores ? null : session.user.storeId, allStores: session.user.allStores };
      const owner = await pendingWrites.entryScope(scope, result.operation, requestKey);
      if (!alive.current) return;
      if (owner) await pendingWrites.complete(owner, result.operation, requestKey);
      if (!alive.current) return;
      for (const queryKey of [["cashbook"], ["cashbook-accounts"], ["cashbook-account"], ["cashbook-account-transactions"], ["finance"]]) void cache.invalidateQueries({ queryKey });
      if (result.deleted) router.replace("/cashbook-accounts");
      else router.replace({ pathname: "/cashbook-account/[kind]/[id]", params: { kind: result.kind, id: String(result.receipt.id) } });
    } catch (cause) { if (alive.current) setError((cause as Error).message); }
    finally { if (alive.current) setBusy(false); }
  }
  return <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 16, maxWidth: 760, width: "100%", alignSelf: "center" }}>
    <Card style={{ gap: 12 }}><Text accessibilityRole="header" style={{ color: theme.success, fontSize: 22, fontWeight: "700" }}>Đã ghi nhận {result.kind === "cash" ? "két" : "ngân hàng"} #{result.receipt.id}</Text>
      <Text style={{ color: theme.text }}>{({ create: "Thêm tài khoản", update: "Sửa tài khoản", status: "Đổi trạng thái sử dụng", delete: "Xóa tài khoản" } as Record<string, string>)[action]} · phiên bản xác nhận {result.receipt.revision}</Text>
      <Text selectable style={{ color: theme.muted, fontSize: 12 }}>Mã yêu cầu: {requestKey}</Text>
      {result.deleted && <Text style={{ color: theme.text }}>Tài khoản đã được xóa. Xác nhận yêu cầu gốc vẫn được giữ.</Text>}
      {result.current && <Text style={{ color: theme.muted }}>Thông tin và số dư tài khoản hiện tại{result.current.revision !== result.receipt.revision ? " đã thay đổi sau lần ghi này" : ""}.</Text>}
    </Card>
    {!!error && <InlineError message={error} />}<Button label="Đã kiểm tra xác nhận tài khoản sổ quỹ" loading={busy} onPress={() => { void acknowledge(); }} />
    {result.current && <CashbookAccountCard row={result.current} details />}
  </ScrollView>;
}
export default function ResultRoute() {
  const { key } = useLocalSearchParams<{ key: string }>(), { api, session } = useSession();
  if (!api || !session) return <StateView title="Đăng nhập để đối chiếu" />;
  return <Result key={`${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(",")}`} requestKey={key} />;
}
