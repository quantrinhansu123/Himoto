import {FilteredListExport} from '@/components/filtered-list-export';
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { dutyToday } from "../../../shared/mobile-duty-roster";
import { useSession } from "@/providers/session";
import { useWorkspace } from "@/hooks/use-workspace";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { dateTime, useTheme } from "@/theme";
import { Button, Card, InlineError, StateView } from "@/components/ui";
import { ChoiceField, FormField } from "@/components/form-fields";
import { DateField } from "@/components/date-field";
import { VehicleChanges } from "@/components/vehicle-changes";
function TransferHistory() {
  const { api, session } = useSession(), theme = useTheme(), workspace = useWorkspace();
  const [from, setFrom] = useState(dutyToday), [to, setTo] = useState(dutyToday), [page, setPage] = useState(1);
  const [store, setStore] = useState("all"), [fromStore, setFromStore] = useState(""), [toStore, setToStore] = useState(""), [action, setAction] = useState("");
  const [input, setInput] = useState(""), [filters, setFilters] = useState(false), search = useDebouncedValue(input);
  const validDates = !!from && !!to && from <= to, allowed = session!.user.permissions.includes("vehicles.read");
  const query = useQuery({ queryKey: ["transfer-history", session!.user.id, from, to, page, store, fromStore, toStore, action, search],
    queryFn: ({ signal }) => api!.transferHistory(new URLSearchParams({ from, to, page: String(page), store, from_store: fromStore, to_store: toStore, action, search }).toString(), signal), enabled: allowed && validDates });
  if (!allowed) return <StateView title="Không có quyền xem điều chuyển" />;
  const stores = workspace.data?.stores.map(row => ({ value: String(row.id), label: row.name })) || [];
  function change(setter: (value: string) => void, value: string) { setter(value); setPage(1); }
  return <FlatList data={query.data?.rows || []} keyExtractor={row => String(row.id)} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 14, width: "100%", maxWidth: 760, alignSelf: "center" }}
    refreshControl={<RefreshControl refreshing={query.isRefetching} tintColor={theme.primary} onRefresh={() => { void query.refetch(); }} />}
    ListHeaderComponent={<View style={{ gap: 14 }}>
      <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 26, fontWeight: "800" }}>Điều chuyển toàn hệ thống</Text>
      <Text style={{ color: theme.muted, lineHeight: 22 }}>Lịch sử chuyển/nhận/từ chối/hủy theo nghiệp vụ web. Mở xe để thực hiện thao tác trên trạng thái hiện tại.</Text>
      <FormField label="Tìm biển số, xe, cơ sở, người thực hiện" value={input} onChangeText={value => change(setInput, value)} maxLength={200} />
      <Button secondary label={filters ? "Ẩn bộ lọc điều chuyển" : "Bộ lọc điều chuyển"} onPress={() => setFilters(!filters)} />
      {filters && <Card style={{ gap: 14 }}>
        <DateField label="Từ ngày điều chuyển" value={from} onChange={value => change(setFrom, value)} />
        <DateField label="Đến ngày điều chuyển" value={to} onChange={value => change(setTo, value)} />
        <ChoiceField label="Cơ sở liên quan" value={store} choices={[{ value: "all", label: "Tất cả cơ sở" }, ...stores]} onChange={value => change(setStore, value)} searchable />
        <ChoiceField label="Cơ sở chuyển đi" value={fromStore} choices={[{ value: "", label: "Tất cả cơ sở đi" }, ...stores]} onChange={value => change(setFromStore, value)} searchable />
        <ChoiceField label="Cơ sở nhận đến" value={toStore} choices={[{ value: "", label: "Tất cả cơ sở đến" }, ...stores]} onChange={value => change(setToStore, value)} searchable />
        <ChoiceField label="Thao tác điều chuyển" value={action} choices={[{ value: "", label: "Tất cả thao tác" }, { value: "transfer", label: "Chuyển xe" }, { value: "receive", label: "Nhận xe" }, { value: "reject", label: "Từ chối" }, { value: "cancel", label: "Hủy" }]} onChange={value => change(setAction, value)} />
        <Button secondary label="Đặt lại bộ lọc điều chuyển" onPress={() => { setFrom(dutyToday()); setTo(dutyToday()); setStore("all"); setFromStore(""); setToStore(""); setAction(""); setInput(""); setPage(1); }} />
      </Card>}
      {!validDates && <InlineError message="Chọn đủ ngày; ngày kết thúc phải từ ngày bắt đầu trở đi." />}
      {workspace.isError && <><InlineError message="Chưa tải được danh sách cơ sở." /><Button secondary label="Tải lại cơ sở" onPress={() => { void workspace.refetch(); }} /></>}
      {query.data && <Text style={{ color: theme.muted }}>{query.data.total} sự kiện · {query.data.from.split("-").reverse().join("/")} → {query.data.to.split("-").reverse().join("/")}</Text>}

<FilteredListExport kind="transfers" filters={new URLSearchParams({from,to,store,from_store:fromStore,to_store:toStore,action,search}).toString()} disabled={!validDates||query.isFetching||query.isError||!query.data?.total||input!==search}/>
      {query.isError && <InlineError message={query.error.message} />}
    </View>}
    renderItem={({ item }) => <Card style={{ gap: 12 }}>
      <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>{item.license || item.vehicle_name} · {item.label}</Text>
      <Text style={{ color: theme.primary, lineHeight: 23 }}>{item.from_store || "Chưa rõ cơ sở đi"} → {item.to_store || "Chưa rõ cơ sở đến"}</Text>
      <Text style={{ color: theme.muted, lineHeight: 22 }}>{item.at ? dateTime(item.at) : "Chưa có thời điểm"} · {item.actor || "Chưa rõ người thực hiện"}</Text>
      {!!item.note && <Text selectable style={{ color: theme.text, lineHeight: 23 }}>{item.note}</Text>}
      <VehicleChanges changes={item.changes} />
      {(item.action==='transfer'||item.action==='receive')&&<Button secondary label={`Telegram lượt ${item.action==='transfer'?'chuyển':'nhận'} xe #${item.id}`} onPress={()=>router.push({pathname:'/transfer-telegram/[id]/[eventId]',params:{id:String(item.vehicle_id),eventId:String(item.id)}})}/>}
      <Button secondary label={`Mở xe ${item.license || item.vehicle_id}`} onPress={() => router.push({ pathname: "/vehicle/[id]", params: { id: String(item.vehicle_id) } })} />
      <Button secondary label={`Điều chuyển / nhận xe #${item.vehicle_id}`} onPress={() => router.push({ pathname: "/vehicle-transfer-editor/[id]", params: { id: String(item.vehicle_id) } })} />
    </Card>}
    ListEmptyComponent={!validDates ? <StateView title="Kiểm tra khoảng ngày" /> : query.isPending ? <StateView title="Đang tải điều chuyển" loading /> : query.isError ? <StateView title="Chưa tải được điều chuyển" retry={() => { void query.refetch(); }} /> : <StateView title="Không có điều chuyển phù hợp" />}
    ListFooterComponent={query.data && validDates ? <View style={{ gap: 10, paddingVertical: 12 }}><Text style={{ color: theme.muted, textAlign: "center" }}>Trang {query.data.page}/{query.data.pages}</Text><View style={{ flexDirection: "row", gap: 10 }}><View style={{ flex: 1 }}><Button secondary label="Trang trước" disabled={query.data.page <= 1} onPress={() => setPage(query.data!.page - 1)} /></View><View style={{ flex: 1 }}><Button secondary label="Trang sau" disabled={query.data.page >= query.data.pages} onPress={() => setPage(query.data!.page + 1)} /></View></View></View> : undefined}
  />;
}
export default function TransferHistoryRoute() {
  const { api, session } = useSession();
  if (!api || !session) return <StateView title="Đăng nhập để xem điều chuyển" />;
  return <TransferHistory key={`${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(",")}`} />;
}
