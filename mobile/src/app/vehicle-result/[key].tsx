import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { ScrollView, Text } from "react-native";
import { useSession } from "@/providers/session";
import { pendingWrites } from "@/lib/pending-writes";
import { useTheme } from "@/theme";
import { Button, Card, InlineError, StateView } from "@/components/ui";
import { VehicleProfileCard } from "@/components/vehicle-profile-card";
function VehicleResult({ requestKey }: { requestKey: string }) {
  const { api, session } = useSession(), theme = useTheme(), alive = useRef(true);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const allowed = /^[0-9a-f-]{36}$/.test(requestKey) && session!.user.permissions.includes("vehicles.read");
  const query = useQuery({ queryKey: ["vehicle-result", session!.user.id, requestKey], queryFn: ({ signal }) => api!.vehicleResult(requestKey, signal), enabled: allowed });
  if (!allowed) return <StateView title="Không mở được xác nhận lưu xe" />;
  if (query.isPending) return <StateView title="Đang đối chiếu kết quả lưu xe" loading />;
  if (query.isError) return <StateView title="Chưa tải được xác nhận lưu xe" message={query.error.message} retry={() => { void query.refetch(); }} />;
  const result = query.data;
  async function acknowledge() {
    if (!api || !session || busy) return;
    setBusy(true); setError("");
    try {
      const scope = { origin: api.origin, userId: session.user.id, storeId: session.user.allStores ? null : session.user.storeId, allStores: session.user.allStores };
      // Use the original create destination from the actor's exact ledger entry;
      // never complete a similarly named create in the current/different scope.
      const owner = await pendingWrites.entryScope(scope, result.operation, requestKey);
      if (!alive.current) return;
      if (owner) await pendingWrites.complete(owner, result.operation, requestKey);
      if (alive.current) router.replace({ pathname: "/vehicle/[id]", params: { id: String(result.receipt.id) } });
    } catch (cause) { if (alive.current) setError((cause as Error).message); }
    finally { if (alive.current) setBusy(false); }
  }
  return <ScrollView contentContainerStyle={{ padding: 20, gap: 16, width: "100%", maxWidth: 760, alignSelf: "center" }}>
    <Card style={{ gap: 12 }}>
      <Text accessibilityRole="header" style={{ color: theme.success, fontSize: 22, fontWeight: "700" }}>Đã lưu xe #{result.receipt.id}</Text>
      <Text style={{ color: theme.text }}>{result.operation === "vehicle.create" ? "Thêm xe" : "Sửa hồ sơ xe"} · phiên bản xác nhận {result.receipt.revision}</Text>
      <Text selectable style={{ color: theme.muted, fontSize: 12 }}>Mã yêu cầu: {requestKey}</Text>
      <Text style={{ color: theme.muted, lineHeight: 22 }}>Thông tin xe hiện tại{result.current.revision !== result.receipt.revision ? " đã thay đổi sau lần lưu này" : ""}.</Text>
    </Card>
    <VehicleProfileCard profile={result.current} />
    {!!error && <InlineError message={error} />}
    <Button label="Đã kiểm tra xác nhận lưu xe" loading={busy} onPress={() => { void acknowledge(); }} />
  </ScrollView>;
}
export default function VehicleResultRoute() {
  const { key } = useLocalSearchParams<{ key: string }>(), { api, session } = useSession();
  if (!api || !session) return <StateView title="Đăng nhập để đối chiếu" />;
  return <VehicleResult key={`${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(",")}`} requestKey={key} />;
}
