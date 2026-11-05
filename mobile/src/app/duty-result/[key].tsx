import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { useSession } from "@/providers/session";
import { pendingWrites } from "@/lib/pending-writes";
import { useTheme } from "@/theme";
import { Button, Card, InlineError, StateView } from "@/components/ui";
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
  return <ScrollView contentContainerStyle={{ padding: 20, gap: 16, maxWidth: 760, width: "100%", alignSelf: "center" }}>
    <Card style={{ gap: 12 }}>
      <Text accessibilityRole="header" style={{ color: theme.success, fontSize: 22, fontWeight: "700" }}>Đã ghi nhận ca trực #{result.receipt.id}</Text>
      <Text style={{ color: theme.text }}>{result.operation.startsWith("duty.delete") ? "Xóa ca trực" : result.operation.startsWith("duty.update") ? "Cập nhật ca trực" : "Tạo ca trực"} · phiên bản xác nhận {result.receipt.revision}</Text>
      <Text selectable style={{ color: theme.muted, fontSize: 12 }}>Mã yêu cầu: {requestKey}</Text>
      {result.deleted && <Text style={{ color: theme.muted }}>Ca trực hiện đã được xóa mềm. Xác nhận yêu cầu gốc vẫn được giữ.</Text>}
    </Card>
    {result.current && <View style={{ gap: 12 }}>
      <Text style={{ color: theme.muted, lineHeight: 22 }}>Thông tin ca trực hiện tại{result.current.revision !== result.receipt.revision ? " đã thay đổi sau lần ghi này" : ""}.</Text>
      <DutyScheduleCard row={result.current} />
    </View>}
    {!!error && <InlineError message={error} />}
    <Button label="Đã kiểm tra xác nhận ca trực" loading={busy} onPress={() => { void acknowledge(); }} />
  </ScrollView>;
}
export default function DutyResultRoute() {
  const { key } = useLocalSearchParams<{ key: string }>(), { api, session } = useSession();
  if (!api || !session) return <StateView title="Đăng nhập để đối chiếu" />;
  return <DutyResult key={`${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(",")}`} requestKey={key} />;
}
