import { useState } from "react";
import { SafeAreaView } from 'react-native-safe-area-context';
import { useInfiniteQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { Plus } from "lucide-react-native";
import type { MobileDirectoryKind } from "../../../shared/mobile-directory";
import { STAFF_PROFILE_STATUSES } from "../../../shared/mobile-staff";
import { STAFF_POSITIONS } from "../../../shared/staff-positions";
import { ATTENDANCE_SHIFTS, shiftCreditLabel } from "../../../shared/attendance-shifts";
import { useSession } from "@/providers/session";
import { useGlobalBranch } from "@/providers/branch";
import { useWorkspace } from "@/hooks/use-workspace";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useTheme } from "@/theme";
import { Button, Card, Chip, InlineError, KeyValueRow, SegmentedBar, StateView, StatusBadge } from "./ui";
import { ChoiceField, FormField } from "./form-fields";
import { FilteredListExport } from "./filtered-list-export";

const storeStatuses = [{ value: 'active', label: 'Hoạt động' }, { value: 'inactive', label: 'Tạm ngừng' }];

export function DirectoryScreen({ kind, initialStore }: { kind: MobileDirectoryKind; initialStore?: string }) {
  const { api, session } = useSession(), theme = useTheme(), workspace = useWorkspace();
  const canReadAll = Boolean(session!.user.allStores || session!.user.allStoresRead);
  const defaultStore = canReadAll ? "all" : String(session!.user.storeId || "all");
  const { selectedStore: globalStore, selectStore: setGlobalStore } = useGlobalBranch(defaultStore);
  const [storeOverride, setStoreOverride] = useState<string | null>(initialStore ?? null);
  const store = !canReadAll ? defaultStore : (storeOverride !== null ? storeOverride : globalStore || defaultStore);
  const setStore = (next: string) => {
    if (!canReadAll) return;
    if (initialStore) setStoreOverride(next);
    else { setStoreOverride(null); setGlobalStore(next); }
  };
  const [input, setInput] = useState(""), [status, setStatus] = useState("");
  const [position, setPosition] = useState(""), search = useDebouncedValue(input);
  const [storeTab, setStoreTab] = useState<"stores" | "work_shifts">("stores");
  const searchAllStaff = kind === 'staff' && !initialStore && canReadAll && Boolean(search);
  const readStore = searchAllStaff ? 'all' : store;
  const allowed = session!.user.permissions.includes(kind === "staff" ? "hr.read" : "contracts.read");
  const query = useInfiniteQuery({ queryKey: ["directory", kind, session!.user.id, search, status, readStore, position], initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => api!.directory(kind, new URLSearchParams({ page: String(pageParam), size: "20", search, status, ...(kind === "staff" ? { store: readStore, position } : {}) }).toString(), signal),
    getNextPageParam: page => page.page < page.pages ? page.page + 1 : undefined, enabled: allowed && (kind !== "stores" || storeTab === "stores") });
  if (!allowed) return <StateView title="Không có quyền xem danh bạ" />;
  const rows = [...new Map(query.data?.pages.flatMap(page => page.rows).map(row => [row.id, row])).values()];
  const title = kind === "staff" ? "Nhân sự" : "Cơ sở & Ca làm việc";
  const stores = (workspace.data?.stores || []).filter(item => canReadAll || item.id === session!.user.storeId);

  if (kind === "stores" && storeTab === "work_shifts") {
    return (
      <SafeAreaView edges={['bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: theme.background }}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 36, gap: 12, maxWidth: 760, width: "100%", alignSelf: "center" }}>
          <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 22, fontWeight: "800" }}>{title}</Text>
          <SegmentedBar
            value={storeTab}
            onChange={setStoreTab}
            options={[{ value: "stores", label: "Danh sách cơ sở" }, { value: "work_shifts", label: "Ca làm việc" }]}
          />
          <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 19 }}>
            Danh mục ca làm việc dùng chung cho toàn bộ cơ sở. Phân ca cho nhân viên tại Lịch trực cơ sở.
          </Text>
          <FilteredListExport kind="work-shifts" filters="" disabled={false} limitText="Xuất danh mục ca làm việc theo đúng mã ca, giờ vào/ra và số công." />
          {session!.user.permissions.includes("hr.read") && (
            <Button size="sm" secondary label="Phân ca tại Lịch trực cơ sở" onPress={() => router.push("/duty-roster")} />
          )}
          {ATTENDANCE_SHIFTS.map(s => (
            <Card key={s.code} style={{ gap: 4 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ color: theme.text, fontSize: 16, fontWeight: "800" }}>{s.code} · {s.name}</Text>
                <StatusBadge status="active" label={`${shiftCreditLabel(s.credit)} công`} />
              </View>
              <KeyValueRow label="Giờ vào – ra" value={`${s.start || "—"} – ${s.end || "—"}`} />
            </Card>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return <SafeAreaView edges={['bottom','left','right']} style={{flex:1,backgroundColor:theme.background}}>
    <FlatList data={rows} keyExtractor={row => String(row.id)} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 11, maxWidth: 760, width: "100%", alignSelf: "center" }}
      refreshControl={<RefreshControl refreshing={query.isRefetching && !query.isFetchingNextPage} onRefresh={() => { void query.refetch(); }} tintColor={theme.primary} />}
      ListHeaderComponent={<View style={{ gap: 11 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 22, fontWeight: "800", flex: 1 }}>{title}</Text>
          {kind === "stores" && session!.user.permissions.includes("settings.write") && <Button size="sm" icon={<Plus size={14} color={theme.primaryText} />} label="Thêm cơ sở" onPress={() => router.push({ pathname: "/store-editor/[id]", params: { id: "new" } })} />}
          {kind === "staff" && session!.user.permissions.includes("hr.write") && <Button size="sm" icon={<Plus size={14} color={theme.primaryText} />} label="Thêm nhân sự" onPress={() => router.push({ pathname: "/staff-editor/[id]", params: { id: "new", store: session!.user.allStores ? store : String(session!.user.storeId || "") } })} />}
        </View>
        {kind === "stores" && (
          <SegmentedBar
            value={storeTab}
            onChange={setStoreTab}
            options={[{ value: "stores", label: "Danh sách cơ sở" }, { value: "work_shifts", label: "Ca làm việc" }]}
          />
        )}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>
          {kind === 'staff' && <Chip label="Sơ đồ nhân sự" onPress={() => router.push('/staff-organization')} />}
          <Chip
            label="Xuất Excel"
            disabled={query.isPending || query.isError || input.trim() !== search}
            onPress={() => router.push({ pathname: "/catalogue-export/[kind]", params: { kind, filters: new URLSearchParams({ search, status, ...(kind === "staff" ? { store: readStore, position } : {}) }).toString() } })}
          />
          {session!.user.permissions.includes(kind === 'staff' ? 'hr.write' : 'settings.write') && (
            <Chip
              label="Chọn nhiều để xóa"
              onPress={() => router.push({ pathname: '/bulk-delete/[kind]', params: { kind, filters: new URLSearchParams({ search, status, ...(kind === 'staff' ? { store: session!.user.allStores ? readStore : store, position } : {}) }).toString() } })}
            />
          )}
        </ScrollView>
        <FormField label={kind === "staff" ? "Tìm tên, mã nhân sự, điện thoại" : "Tìm tên, mã, địa chỉ cơ sở"} value={input} onChangeText={setInput} maxLength={120} />
        <ChoiceField label="Trạng thái" value={status} choices={[{ value: "", label: "Tất cả trạng thái" }, ...(kind === "staff" ? STAFF_PROFILE_STATUSES : [{ value: "active", label: "Hoạt động" }, { value: "inactive", label: "Tạm ngừng" }])]} onChange={setStatus} />
        {kind === "staff" && <ChoiceField label="Lọc chức vụ nhân sự" value={position} choices={[{ value: "", label: "Tất cả chức vụ" }, ...[...new Set([...STAFF_POSITIONS, ...rows.map(row => row.position)].filter(Boolean))].map(value => ({ value, label: value }))]} onChange={setPosition} searchable />}
        {kind === "staff" && <ChoiceField label="Cơ sở nhân sự" value={readStore} choices={[...(canReadAll ? [{ value: "all", label: "Tất cả cơ sở" }] : []), ...stores.map(item => ({ value: String(item.id), label: item.name }))]} onChange={setStore} disabled={searchAllStaff} searchable />}
        <Text accessibilityLiveRegion="polite" style={{ color: theme.muted, fontSize: 13 }}>{query.data ? `${query.data.pages[0].total} hồ sơ${searchAllStaff ? ' trong các cơ sở được phép xem' : ''}` : query.isError ? 'Chưa tải được danh bạ.' : 'Đang tải…'}</Text>
        {query.isError && rows.length > 0 && <><InlineError message={query.error.message} /><Button size="sm" secondary label="Tải lại danh bạ" onPress={() => { void query.refetch(); }} /></>}
      </View>}
      renderItem={({ item }) => (
        <Pressable accessibilityRole="button" accessibilityLabel={`Xem ${item.name}`} onPress={() => router.push({ pathname: kind === "stores" ? "/store/[id]" : "/staff/[id]", params: { id: String(item.id) } })} style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}>
          <Card style={{ gap: 7 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <Text style={{ color: theme.text, fontSize: 16, fontWeight: "700", flex: 1 }}>{item.name}</Text>
              <StatusBadge status={item.status} label={kind === "staff" ? STAFF_PROFILE_STATUSES.find(status => status.value === item.status)?.label : storeStatuses.find(status => status.value === item.status)?.label} />
            </View>
            <Text style={{ color: theme.muted, fontSize: 13 }}>
              {[item.code, item.position, item.storeName].filter(Boolean).join(" · ")}
            </Text>
            {!!item.phone && <Text style={{ color: theme.text, fontSize: 13.5, fontWeight: "600" }}>{item.phone}</Text>}
            {kind === "stores" && (
              <View style={{ gap: 2, paddingTop: 2 }}>
                {!!item.address && <KeyValueRow label="Địa chỉ" value={item.address} />}
                {!!item.managerName && <KeyValueRow label="Quản lý" value={item.managerName} />}
                {(item.vehicleCount !== null || item.staffCount !== null) && (
                  <KeyValueRow label="Quy mô" value={`${item.vehicleCount ?? 0} xe · ${item.staffCount ?? 0} nhân sự`} />
                )}
              </View>
            )}
          </Card>
        </Pressable>
      )}
      onEndReachedThreshold={0.4} onEndReached={() => { if (query.hasNextPage && !query.isFetching && !query.isFetchNextPageError) void query.fetchNextPage(); }}
      ListEmptyComponent={query.isPending ? <StateView title="Đang tải danh bạ" loading /> : query.isError ? <StateView title="Chưa tải được danh bạ" message={query.error.message} retry={() => { void query.refetch(); }} /> : <StateView title="Không có kết quả" message="Thử từ khóa hoặc bộ lọc khác." />}
      ListFooterComponent={query.isFetchingNextPage ? <StateView title="Đang tải tiếp" loading /> : query.isFetchNextPageError ? <Button size="sm" secondary label="Tải tiếp danh bạ" onPress={() => { void query.fetchNextPage(); }} /> : undefined}
    />
  </SafeAreaView>;
}
