import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSession } from "@/providers/session";
import { pendingWrites } from "@/lib/pending-writes";
import { useTheme } from "@/theme";
import { Button, Card, InfoBanner, InlineError, KeyValueRow, StateView, StatusBadge } from "@/components/ui";
import { DutyScheduleCard } from "@/components/duty-schedule-card";

function DutyResult({ requestKey }: { requestKey: string }) {
  const { api, session } = useSession(), theme = useTheme(), cache = useQueryClient();
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const valid = /^[0-9a-f-]{36}$/.test(requestKey), allowed = session!.user.permissions.includes("hr.read");
  const query = useQuery({ queryKey: ["duty-result", session!.user.id, requestKey], queryFn: ({ signal }) => api!.dutyResult(requestKey, signal), enabled: valid && allowed });
  if (!valid || !allowed) return <StateView title="Không mở được xác nhận ca trực" />;
  if (query.isPending) return <StateView title="Đang đối chiếu ca trực" loading />;
  if (query.isError) return <StateView title="Chưa tải được xác nhận" message={query.error.message} retry={() => { void query.refetch(); }} />;
  const result = query.data;
  const actionLabel = result.operation.startsWith("duty.delete") ? "Xóa ca trực" : result.operation.startsWith("duty.update") ? "Cập nhật ca trực" : "Tạo ca trực";
  async function acknowledge() {
    if (!api || !session || busy) return;
    setBusy(true); setError("");
    try {
      await pendingWrites.complete({ origin: api.origin, userId: session.user.id, storeId: session.user.allStores ? null : session.user.storeId, allStores: session.user.allStores }, result.operation, requestKey);
      if (!alive.current) return;
      void cache.invalidateQueries({ queryKey: ["duty-roster"] });
      router.replace("/duty-roster");
    } catch (cause) { if (alive.current) setError((cause as Error).message); }
    finally { if (alive.current) setBusy(false); }
  }
  return <SafeAreaView edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: theme.background }}>
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 36, gap: 12, maxWidth: 760, width: "100%", alignSelf: "center" }}>
      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <Text accessibilityRole="header" style={{ color: theme.success, fontSize: 20, fontWeight: "800", flexShrink: 1 }}>Đã ghi nhận ca trực #{result.receipt.id}</Text>
          <StatusBadge label={actionLabel} tone={result.deleted ? "warning" : "success"} />
        </View>
        <KeyValueRow label="Phiên bản xác nhận" value={String(result.receipt.revision)} />
        <Text selectable style={{ color: theme.muted, fontSize: 12 }}>Mã yêu cầu: {requestKey}</Text>
        {result.deleted && <InfoBanner tone="warning" message="Ca trực hiện đã được xóa mềm. Xác nhận yêu cầu gốc vẫn được giữ." />}
      </Card>
      {result.current && <View style={{ gap: 10 }}>
        <Text style={{ color: theme.muted, fontSize: 13 }}>Thông tin ca trực hiện tại{result.current.revision !== result.receipt.revision ? " đã thay đổi sau lần ghi này" : ""}.</Text>
        <DutyScheduleCard row={result.current} />
      </View>}
      {!!error && <InlineError message={error} />}
      <Button label="Đã kiểm tra xác nhận ca trực" loading={busy} onPress={() => { void acknowledge(); }} />
    </ScrollView>
  </SafeAreaView>;
}
export default function DutyResultRoute() {
  const { key } = useLocalSearchParams<{ key: string }>(), { api, session } = useSession();
  if (!api || !session) return <StateView title="Đăng nhập để đối chiếu" />;
  return <DutyResult key={`${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(",")}`} requestKey={key} />;
}
