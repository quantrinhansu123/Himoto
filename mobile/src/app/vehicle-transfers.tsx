import { FilteredListExport } from '@/components/filtered-list-export';
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { FlatList, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Search, SlidersHorizontal, X } from "lucide-react-native";
import { dutyToday } from "../../../shared/mobile-duty-roster";
import { useSession } from "@/providers/session";
import { useWorkspace } from "@/hooks/use-workspace";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { dateTime, useTheme } from "@/theme";
import { Button, Card, Chip, InlineError, KeyValueRow, PaginationBar, SkeletonList, StateView, StatusBadge } from "@/components/ui";
import { ChoiceField } from "@/components/form-fields";
import { DateField } from "@/components/date-field";
import { VehicleChanges } from "@/components/vehicle-changes";

const actionBadgeStatus = (action: string) =>
  action === "receive" ? "confirmed" : action === "transfer" ? "in_transit" : action === "reject" || action === "cancel" ? "cancelled" : "pending";

function TransferHistory() {
  const { api, session } = useSession(), theme = useTheme(), workspace = useWorkspace();
  const [from, setFrom] = useState(dutyToday), [to, setTo] = useState(dutyToday), [page, setPage] = useState(1);
  const [store, setStore] = useState("all"), [fromStore, setFromStore] = useState(""), [toStore, setToStore] = useState(""), [action, setAction] = useState("");
  const [input, setInput] = useState(""), [filters, setFilters] = useState(false), search = useDebouncedValue(input);
  const validDates = !!from && !!to && from <= to, allowed = session!.user.permissions.includes("vehicles.read");
  const query = useQuery({
    queryKey: ["transfer-history", session!.user.id, from, to, page, store, fromStore, toStore, action, search],
    queryFn: ({ signal }) => api!.transferHistory(new URLSearchParams({ from, to, page: String(page), store, from_store: fromStore, to_store: toStore, action, search }).toString(), signal),
    enabled: allowed && validDates,
  });
  if (!allowed) return <StateView title="Không có quyền xem điều chuyển" />;
  const stores = workspace.data?.stores.map(row => ({ value: String(row.id), label: row.name })) || [];
  const filterCount = Number(store !== "all") + Number(!!fromStore) + Number(!!toStore) + Number(!!action);
  function change(setter: (value: string) => void, value: string) { setter(value); setPage(1); }

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: theme.background }}>
      <FlatList
        data={query.data?.rows || []}
        keyExtractor={row => String(row.id)}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, paddingBottom: 36, gap: 11, width: "100%", maxWidth: 760, alignSelf: "center" }}
        refreshControl={<RefreshControl refreshing={query.isRefetching} tintColor={theme.primary} onRefresh={() => { void query.refetch(); }} />}
        ListHeaderComponent={<View style={{ gap: 11 }}>
          <Text style={{ color: theme.muted, fontSize: 13 }}>
            {query.data ? `${query.data.total}/${query.data.scopeCount} sự kiện · ${query.data.from.split("-").reverse().join("/")} → ${query.data.to.split("-").reverse().join("/")}` : "Theo dõi chuyển, nhận, từ chối và hủy điều chuyển xe"}
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 10, borderColor: theme.controlBorder, backgroundColor: theme.surface, paddingHorizontal: 11, minHeight: 44 }}>
              <Search size={18} color={theme.muted} accessible={false} />
              <TextInput
                accessibilityLabel="Tìm biển số, xe, cơ sở, người thực hiện"
                placeholder="Tìm biển số, tên xe, cơ sở, người thực hiện…"
                placeholderTextColor={theme.muted}
                value={input}
                onChangeText={value => change(setInput, value)}
                maxLength={200}
                autoCorrect={false}
                style={{ flex: 1, color: theme.text, fontSize: 14.5, paddingVertical: 8 }}
              />
              {!!input && <Pressable onPress={() => change(setInput, "")} hitSlop={8}><X size={17} color={theme.muted} /></Pressable>}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Bộ lọc điều chuyển"
              onPress={() => setFilters(v => !v)}
              style={{ minWidth: 44, minHeight: 44, paddingHorizontal: 11, borderRadius: 10, borderWidth: 1, borderColor: filters || filterCount ? theme.primary : theme.controlBorder, backgroundColor: filters || filterCount ? theme.tint : theme.surface, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 }}
            >
              <SlidersHorizontal size={18} color={filters || filterCount ? theme.primary : theme.text} />
              {!!filterCount && <Text style={{ color: theme.primary, fontSize: 12, fontWeight: "700" }}>{filterCount}</Text>}
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>
            <Chip label="Hôm nay" selected={from === dutyToday() && to === dutyToday()} onPress={() => { const today = dutyToday(); setFrom(today); setTo(today); setPage(1); }} />
            {[
              { value: "", label: "Tất cả" },
              { value: "transfer", label: "Chuyển xe" },
              { value: "receive", label: "Nhận xe" },
              { value: "reject", label: "Từ chối" },
              { value: "cancel", label: "Hủy" },
            ].map(opt => (
              <Chip key={opt.value || "all"} label={opt.label} selected={action === opt.value} onPress={() => change(setAction, opt.value)} />
            ))}
          </ScrollView>
          {filters && <Card style={{ gap: 10 }}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}><DateField label="Từ ngày" value={from} onChange={value => change(setFrom, value)} /></View>
              <View style={{ flex: 1 }}><DateField label="Đến ngày" value={to} onChange={value => change(setTo, value)} /></View>
            </View>
            <ChoiceField label="Cơ sở liên quan" value={store} choices={[{ value: "all", label: "Tất cả cơ sở" }, ...stores]} onChange={value => change(setStore, value)} searchable />
            <ChoiceField label="Cơ sở chuyển đi" value={fromStore} choices={[{ value: "", label: "Tất cả cơ sở đi" }, ...stores]} onChange={value => change(setFromStore, value)} searchable />
            <ChoiceField label="Cơ sở nhận đến" value={toStore} choices={[{ value: "", label: "Tất cả cơ sở đến" }, ...stores]} onChange={value => change(setToStore, value)} searchable />
            <FilteredListExport kind="transfers" filters={new URLSearchParams({ from, to, store, from_store: fromStore, to_store: toStore, action, search }).toString()} disabled={!validDates || query.isFetching || query.isError || !query.data?.total || input !== search} />
            <Button size="sm" secondary label="Đặt lại bộ lọc" onPress={() => { setFrom(dutyToday()); setTo(dutyToday()); setStore("all"); setFromStore(""); setToStore(""); setAction(""); setInput(""); setPage(1); }} />
          </Card>}
          {!validDates && <InlineError message="Chọn đủ ngày; ngày kết thúc phải từ ngày bắt đầu trở đi." />}
          {workspace.isError && <><InlineError message="Chưa tải được danh sách cơ sở." /><Button size="sm" secondary label="Tải lại cơ sở" onPress={() => { void workspace.refetch(); }} /></>}
          {query.isError && <InlineError message={query.error.message} />}
        </View>}
        renderItem={({ item }) => <Card style={{ gap: 8, padding: 13 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 16, fontWeight: "800", flex: 1 }}>{item.license || item.vehicle_name}</Text>
            <StatusBadge status={actionBadgeStatus(item.action)} label={item.label} />
          </View>
          <Text style={{ color: theme.primary, fontSize: 13.5, fontWeight: "700" }}>{item.from_store || "Chưa rõ CS đi"} → {item.to_store || "Chưa rõ CS đến"}</Text>
          <View style={{ gap: 2 }}>
            <KeyValueRow label="Thời điểm" value={item.at ? dateTime(item.at) : "—"} />
            <KeyValueRow label="Người thực hiện" value={item.actor || "—"} />
          </View>
          {!!item.note && <Text selectable style={{ color: theme.text, fontSize: 13.5, lineHeight: 20 }}>{item.note}</Text>}
          <VehicleChanges changes={item.changes} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingTop: 2 }}>
            <Button size="sm" equalWidth secondary label="Mở hồ sơ xe" onPress={() => router.push({ pathname: "/vehicle/[id]", params: { id: String(item.vehicle_id) } })} />
            <Button size="sm" equalWidth secondary label="Điều chuyển" onPress={() => router.push({ pathname: "/vehicle-transfer-editor/[id]", params: { id: String(item.vehicle_id) } })} />
            {(item.action === 'transfer' || item.action === 'receive') && (
              <Button size="sm" equalWidth secondary label="Telegram" onPress={() => router.push({ pathname: '/transfer-telegram/[id]/[eventId]', params: { id: String(item.vehicle_id), eventId: String(item.id) } })} />
            )}
          </View>
        </Card>}
        ListEmptyComponent={!validDates ? <StateView title="Kiểm tra khoảng ngày" /> : query.isPending ? <SkeletonList count={4} lines={3} /> : query.isError ? <StateView title="Chưa tải được điều chuyển" retry={() => { void query.refetch(); }} /> : <StateView title="Không có điều chuyển phù hợp" />}
        ListFooterComponent={query.data && validDates ? <PaginationBar page={query.data.page} pages={query.data.pages} total={query.data.total} unit="sự kiện" disabled={query.isFetching} onChange={setPage} /> : undefined}
      />
    </SafeAreaView>
  );
}

export default function TransferHistoryRoute() {
  const { api, session } = useSession();
  if (!api || !session) return <StateView title="Đăng nhập để xem điều chuyển" />;
  return <TransferHistory key={`${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(",")}`} />;
}
