import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { VEHICLE_HISTORY_ACTIONS } from "../../../../shared/mobile-vehicles";
import { useSession } from "@/providers/session";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { dateTime, useTheme } from "@/theme";
import { Button, Card, InlineError, KeyValueRow, PaginationBar, SkeletonList, StateView } from "@/components/ui";
import { ChoiceField, FormField } from "@/components/form-fields";
import { FileExportButton } from "@/components/file-export-button";
import { VehicleChanges } from "@/components/vehicle-changes";
function VehicleHistory({ id }: { id: string }) {
  const { api, session } = useSession(), theme = useTheme();
  const [page, setPage] = useState(1), [action, setAction] = useState(""), [input, setInput] = useState("");
  const search = useDebouncedValue(input), allowed = /^[1-9]\d{0,14}$/.test(id) && session!.user.permissions.includes("vehicles.read");
  const query = useQuery({ queryKey: ["vehicle-history", session!.user.id, id, page, action, search], queryFn: ({ signal }) => api!.vehicleHistory(id, new URLSearchParams({ page: String(page), action, search }).toString(), signal), enabled: allowed });
  if (!allowed) return <StateView title="Không mở được lịch sử xe" />;
  return <SafeAreaView edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: theme.background }}><FlatList data={query.data?.rows || []} keyExtractor={row => row.key} contentContainerStyle={{ padding: 16, paddingBottom: 36, gap: 12, width: "100%", maxWidth: 760, alignSelf: "center" }} keyboardShouldPersistTaps="handled"
    refreshControl={<RefreshControl refreshing={query.isRefetching} tintColor={theme.primary} onRefresh={() => { void query.refetch(); }} />}
    ListHeaderComponent={<View style={{ gap: 12 }}>
      <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 20, fontWeight: "800" }}>Lịch sử xe #{id}</Text>
      <FormField label="Tìm trong lịch sử xe" value={input} onChangeText={value => { setInput(value); setPage(1); }} maxLength={120} />
      <ChoiceField label="Loại sự kiện" value={action} choices={[{ value: "", label: "Tất cả sự kiện" }, ...VEHICLE_HISTORY_ACTIONS]} onChange={value => { setAction(value); setPage(1); }} />
      {query.data && <Text style={{ color: theme.muted, fontSize: 13.5, lineHeight: 20 }}>{query.data.total} sự kiện · {query.data.sourceLimit}</Text>}
      {query.data && !!query.data.rows.length && (
        <FileExportButton
          label={`Tải Excel lịch sử xe (${query.data.rows.length})`}
          disabled={query.isFetching}
          load={(signal) =>
            api!.exportWorkbook(
              {
                filename: `himoto-lich-su-xe-${id}`,
                headers: ["Thời điểm", "Sự kiện", "Biển số", "Cơ sở đi", "Cơ sở đến", "Vị trí", "Người thực hiện", "Ghi chú"],
                rows: (query.data?.rows || []).map((r) => [
                  r.at || "",
                  r.label,
                  r.license || "",
                  r.responsible_store || "",
                  r.beneficiary_store || "",
                  r.location || "",
                  r.actor || "",
                  r.note || "",
                ]),
              },
              signal,
            )
          }
        />
      )}
      {query.isError && <InlineError message={query.error.message} />}
    </View>}
    renderItem={({ item }) => <Card style={{ gap: 8 }}>
      <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 16.5, fontWeight: "800" }}>{item.label}</Text>
      <View style={{ gap: 2 }}>
        <KeyValueRow label="Thời điểm & người thực hiện" value={`${item.at ? dateTime(item.at) : "Chưa có"} · ${item.actor || "Chưa rõ"}`} />
        {!!(item.responsible_store || item.beneficiary_store) && <KeyValueRow label="Điều chuyển kho" value={`${item.responsible_store || "—"} → ${item.beneficiary_store || "—"}`} emphasize valueColor={theme.primary} />}
        {!!item.location && <KeyValueRow label="Vị trí" value={item.location} />}
        {!!item.note && <KeyValueRow label="Ghi chú" value={item.note} selectable />}
      </View>
      <VehicleChanges changes={item.changes} />
      {(Boolean(item.telegram_event_id) || (Boolean(item.order_id) && session!.user.permissions.includes("contracts.read"))) && (
        <View style={{ flexDirection: "row", gap: 8 }}>
          {item.telegram_event_id && <Button size="sm" equalWidth secondary label={`Telegram #${item.telegram_event_id}`} onPress={() => router.push({ pathname: '/transfer-telegram/[id]/[eventId]', params: { id, eventId: String(item.telegram_event_id) } })} />}
          {!!item.order_id && session!.user.permissions.includes("contracts.read") && <Button size="sm" equalWidth secondary label={`Mở HĐ #${item.order_id}`} onPress={() => router.push({ pathname: "/record/[kind]/[id]", params: { kind: "contracts", id: String(item.order_id) } })} />}
        </View>
      )}
    </Card>}
    ListEmptyComponent={query.isPending ? <SkeletonList count={4} lines={2} /> : query.isError ? <StateView title="Chưa tải được lịch sử xe" retry={() => { void query.refetch(); }} /> : <StateView title="Chưa có sự kiện phù hợp" />}
    ListFooterComponent={query.data && query.data.pages > 1 ? <PaginationBar page={query.data.page} pages={query.data.pages} total={query.data.total} unit="sự kiện" disabled={query.isFetching} onChange={setPage} /> : undefined}
  /></SafeAreaView>;
}
export default function VehicleHistoryRoute() {
  const { id } = useLocalSearchParams<{ id: string }>(), { api, session } = useSession();
  if (!api || !session) return <StateView title="Đăng nhập để xem lịch sử xe" />;
  return <VehicleHistory key={`${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(",")}:${id}`} id={id} />;
}
