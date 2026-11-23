import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSession } from "@/providers/session";
import { pendingWrites } from "@/lib/pending-writes";
import { useTheme } from "@/theme";
import { Button, Card, InfoBanner, InlineError, KeyValueRow, StateView, StatusBadge } from "@/components/ui";
import { StoreProfileCard } from "@/components/store-profile-card";
function StoreResult({ requestKey }: { requestKey: string }) {
  const { api, session } = useSession(), theme = useTheme(), cache = useQueryClient(), alive = useRef(true);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const allowed = /^[0-9a-f-]{36}$/.test(requestKey) && session!.user.permissions.includes("settings.write");
  const query = useQuery({ queryKey: ["store-result", session!.user.id, requestKey], queryFn: ({ signal }) => api!.storeResult(requestKey, signal), enabled: allowed });
  if (!allowed) return <StateView title="Không có quyền mở xác nhận cơ sở" />;
  if (query.isPending) return <StateView title="Đang đối chiếu cơ sở" loading />;
  if (query.isError) return <StateView title="Chưa tải được xác nhận cơ sở" message={query.error.message} retry={() => { void query.refetch(); }} />;
  const result = query.data;
  const actionLabel = result.operation === "store.create" ? "Tạo cơ sở" : result.operation.startsWith("store.delete:") ? "Xóa cơ sở" : "Sửa cơ sở";
  async function acknowledge() {
    if (!api || !session || busy) return;
    setBusy(true); setError("");
    try {
      const scope = { origin: api.origin, userId: session.user.id, storeId: session.user.allStores ? null : session.user.storeId, allStores: session.user.allStores };
      const owner = await pendingWrites.entryScope(scope, result.operation, requestKey);
      if (!alive.current) return;
      if (owner) await pendingWrites.complete(owner, result.operation, requestKey);
      if (!alive.current) return;
      for (const queryKey of [["directory", "stores"], ["workspace"], ["store-profile"], ["overview"]]) void cache.invalidateQueries({ queryKey });
      if (result.deleted) router.replace({ pathname: "/directory/[kind]", params: { kind: "stores" } });
      else router.replace({ pathname: "/store/[id]", params: { id: String(result.receipt.id) } });
    } catch (cause) { if (alive.current) setError((cause as Error).message); }
    finally { if (alive.current) setBusy(false); }
  }
  return <SafeAreaView edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: theme.background }}>
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 36, gap: 12, maxWidth: 760, width: "100%", alignSelf: "center" }}>
      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <Text accessibilityRole="header" style={{ color: theme.success, fontSize: 20, fontWeight: "800", flexShrink: 1 }}>Đã ghi nhận cơ sở #{result.receipt.id}</Text>
          <StatusBadge label={actionLabel} tone={result.deleted ? "warning" : "success"} />
        </View>
        <KeyValueRow label="Phiên bản xác nhận" value={String(result.receipt.revision)} />
        <Text selectable style={{ color: theme.muted, fontSize: 12 }}>Mã yêu cầu: {requestKey}</Text>
        {result.deleted && <InfoBanner tone="warning" message="Cơ sở đã được xóa. Xác nhận yêu cầu gốc vẫn được giữ." />}
        {result.current && <Text style={{ color: theme.muted, fontSize: 13 }}>Thông tin cơ sở hiện tại{result.current.rowRevision !== result.receipt.revision ? " đã thay đổi sau lần ghi này" : ""}.</Text>}
      </Card>
      {!!error && <InlineError message={error} />}
      <Button label="Đã kiểm tra xác nhận cơ sở" loading={busy} onPress={() => { void acknowledge(); }} />
      {result.current && <StoreProfileCard row={result.current} />}
    </ScrollView>
  </SafeAreaView>;
}
export default function StoreResultRoute() {
  const { key } = useLocalSearchParams<{ key: string }>(), { api, session } = useSession();
  if (!api || !session) return <StateView title="Đăng nhập để đối chiếu" />;
  return <StoreResult key={`${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(",")}`} requestKey={key} />;
}
