import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { RefreshControl, ScrollView, Text } from "react-native";
import type { MobileRecord } from '@himoto/mobile-contract';
import { recordPreviewKey } from '@/lib/record-preview';
import { useSession } from "@/providers/session";
import { Button, Card, StatusBadge, StateView, InlineError } from "@/components/ui";
import { VehicleProfileCard } from "@/components/vehicle-profile-card";
import { useTheme } from "@/theme";
function VehicleProfile({ id }: { id: string }) {
  const { api, session } = useSession(), theme = useTheme();
  const cache = useQueryClient();
  const preview = cache.getQueryData<MobileRecord>(recordPreviewKey(api!.origin, session!.user, 'vehicles', id));
  const valid = /^[1-9]\d{0,14}$/.test(id) && session!.user.permissions.includes("vehicles.read");
  const query = useQuery({
    queryKey: ["vehicle-profile", session!.user.id, id],
    queryFn: ({ signal }) => api!.vehicleProfile(id, signal),
    enabled: valid,
    staleTime: 30_000,
    gcTime: 120_000,
  });
  if (!valid) return <StateView title="Không mở được xe" />;
  if (!query.data && preview) return <ScrollView contentContainerStyle={{ padding: 20, gap: 16, maxWidth: 760, width: '100%', alignSelf: 'center' }}>
    <Stack.Screen options={{ title: preview.license || 'Hồ sơ xe' }} />
    <Card style={{ gap: 12 }}>
      <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 25, fontWeight: '800' }}>{preview.license || preview.code}</Text>
      <Text style={{ color: theme.text, fontSize: 18 }}>{preview.name}</Text>
      <StatusBadge status={preview.status} />
      <Text style={{ color: theme.muted }}>{preview.storeName}</Text>
    </Card>
    {query.isError ? <StateView title="Chưa cập nhật được hồ sơ xe" message={query.error.message} retry={() => { void query.refetch(); }} /> :
      <Text accessibilityLiveRegion="polite" style={{ color: theme.muted }}>Đang cập nhật hồ sơ và quyền thao tác…</Text>}
  </ScrollView>;
  if (query.isPending) return <StateView title="Đang tải hồ sơ xe" loading />;
  if (query.isError && !query.data) return <StateView title="Chưa tải được hồ sơ xe" message={query.error.message} retry={() => { void query.refetch(); }} />;
  const row = query.data!;
  return <ScrollView contentContainerStyle={{ padding: 20, gap: 16, width: "100%", maxWidth: 760, alignSelf: "center" }} refreshControl={<RefreshControl refreshing={query.isRefetching} tintColor={theme.primary} onRefresh={() => { void query.refetch(); }} />}>
    <Stack.Screen options={{ title: row.values.license || "Hồ sơ xe" }} />
    {query.isError && <InlineError message="Chưa cập nhật được xe. Thông tin đang hiển thị có thể đã thay đổi." />}
    <VehicleProfileCard profile={row} />
    {session!.user.permissions.includes('contracts.read')&&<Button secondary label="Hợp đồng liên quan của xe" onPress={()=>router.push({pathname:'/vehicle-contracts/[id]',params:{id}})}/>}
    {row.canEdit && <Button label="Sửa hồ sơ xe" onPress={() => router.push({ pathname: "/vehicle-editor/[id]", params: { id } })} />}
    {session!.user.permissions.includes('vehicles.write')&&<Button secondary label="Đổi trạng thái / tạo nháp từ kho" onPress={()=>router.push({pathname:'/vehicle-status-editor/[id]',params:{id}})}/>}
    <Button secondary label="Giấy tờ xe" onPress={() => router.push({ pathname: "/record-media/[entity]/[id]", params: { entity: "vehicles", id, kind: "vehicle", referenceId: id } })} />
    <Button secondary label="Lịch sử xe" onPress={() => router.push({ pathname: "/vehicle-history/[id]", params: { id } })} />
    <Button secondary label="Điều chuyển và nhận xe" onPress={() => router.push({ pathname: "/vehicle-transfer-editor/[id]", params: { id } })} />
    <Button secondary label="Ảnh và hồ sơ nghiệp vụ" onPress={() => router.push({ pathname: "/record-media/[entity]/[id]", params: { entity: "vehicles", id } })} />
  </ScrollView>;
}
export default function VehicleProfileRoute() {
  const { id } = useLocalSearchParams<{ id: string }>(), { api, session } = useSession();
  if (!api || !session) return <StateView title="Đăng nhập để xem xe" />;
  return <VehicleProfile key={`${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(",")}:${id}`} id={id} />;
}
