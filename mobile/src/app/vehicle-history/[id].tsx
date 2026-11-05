import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { VEHICLE_HISTORY_ACTIONS } from "../../../../shared/mobile-vehicles";
import { useSession } from "@/providers/session";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { dateTime, useTheme } from "@/theme";
import { Button, Card, InlineError, StateView } from "@/components/ui";
import { ChoiceField, FormField } from "@/components/form-fields";
import { VehicleChanges } from "@/components/vehicle-changes";
function VehicleHistory({ id }: { id: string }) {
  const { api, session } = useSession(), theme = useTheme();
  const [page, setPage] = useState(1), [action, setAction] = useState(""), [input, setInput] = useState("");
  const search = useDebouncedValue(input), allowed = /^[1-9]\d{0,14}$/.test(id) && session!.user.permissions.includes("vehicles.read");
  const query = useQuery({ queryKey: ["vehicle-history", session!.user.id, id, page, action, search], queryFn: ({ signal }) => api!.vehicleHistory(id, new URLSearchParams({ page: String(page), action, search }).toString(), signal), enabled: allowed });
  if (!allowed) return <StateView title="Không mở được lịch sử xe" />;
  return <FlatList data={query.data?.rows || []} keyExtractor={row => row.key} contentContainerStyle={{ padding: 20, gap: 14, width: "100%", maxWidth: 760, alignSelf: "center" }} keyboardShouldPersistTaps="handled"
    refreshControl={<RefreshControl refreshing={query.isRefetching} tintColor={theme.primary} onRefresh={() => { void query.refetch(); }} />}
    ListHeaderComponent={<View style={{ gap: 14 }}>
      <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 26, fontWeight: "800" }}>Lịch sử xe #{id}</Text>
      <FormField label="Tìm trong lịch sử xe" value={input} onChangeText={value => { setInput(value); setPage(1); }} maxLength={120} />
      <ChoiceField label="Loại sự kiện" value={action} choices={[{ value: "", label: "Tất cả sự kiện" }, ...VEHICLE_HISTORY_ACTIONS]} onChange={value => { setAction(value); setPage(1); }} />
      {query.data && <Text style={{ color: theme.muted, lineHeight: 22 }}>{query.data.total} sự kiện · {query.data.sourceLimit}</Text>}
      {query.isError && <InlineError message={query.error.message} />}
    </View>}
    renderItem={({ item }) => <Card style={{ gap: 10 }}>
      <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>{item.label}</Text>
      <Text style={{ color: theme.muted, lineHeight: 22 }}>{item.at ? dateTime(item.at) : "Chưa có thời điểm"} · {item.actor || "Chưa rõ người thực hiện"}</Text>
      {!!(item.responsible_store || item.beneficiary_store) && <Text style={{ color: theme.primary, lineHeight: 22 }}>{item.responsible_store || "Chưa rõ cơ sở đi"} → {item.beneficiary_store || "Chưa rõ cơ sở đến"}</Text>}
      {!!item.location && <Text style={{ color: theme.text }}>{item.location}</Text>}
      {!!item.note && <Text selectable style={{ color: theme.text, lineHeight: 22 }}>{item.note}</Text>}
      <VehicleChanges changes={item.changes} />
      {item.telegram_event_id&&<Button secondary label={`Telegram lượt chuyển / nhận #${item.telegram_event_id}`} onPress={()=>router.push({pathname:'/transfer-telegram/[id]/[eventId]',params:{id,eventId:String(item.telegram_event_id)}})}/>}
      {!!item.order_id && session!.user.permissions.includes("contracts.read") && <Button secondary label={`Mở hợp đồng #${item.order_id}`} onPress={() => router.push({ pathname: "/record/[kind]/[id]", params: { kind: "contracts", id: String(item.order_id) } })} />}
    </Card>}
    ListEmptyComponent={query.isPending ? <StateView title="Đang tải lịch sử xe" loading /> : query.isError ? <StateView title="Chưa tải được lịch sử xe" retry={() => { void query.refetch(); }} /> : <StateView title="Chưa có sự kiện phù hợp" />}
    ListFooterComponent={query.data ? <View style={{ gap: 10, paddingVertical: 12 }}><Text style={{ color: theme.muted, textAlign: "center" }}>Trang {query.data.page}/{query.data.pages}</Text><View style={{ flexDirection: "row", gap: 10 }}><View style={{ flex: 1 }}><Button secondary label="Trang trước" disabled={query.data.page <= 1} onPress={() => setPage(query.data!.page - 1)} /></View><View style={{ flex: 1 }}><Button secondary label="Trang sau" disabled={query.data.page >= query.data.pages} onPress={() => setPage(query.data!.page + 1)} /></View></View></View> : undefined}
  />;
}
export default function VehicleHistoryRoute() {
  const { id } = useLocalSearchParams<{ id: string }>(), { api, session } = useSession();
  if (!api || !session) return <StateView title="Đăng nhập để xem lịch sử xe" />;
  return <VehicleHistory key={`${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(",")}:${id}`} id={id} />;
}
