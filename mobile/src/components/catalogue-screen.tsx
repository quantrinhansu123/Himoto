import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Check,
  ChevronRight,
  ChevronDown,
  MapPin,
  Menu,
  MoreHorizontal,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react-native";
import type { CatalogueKind, MobileRecord } from "@himoto/mobile-contract";
import { contractWorkspace, type MobileContractScope } from "../../../shared/mobile-contract-workspaces";
import { VehicleThumbnail } from './vehicle-thumbnail';
import {
  Button,
  Card,
  InlineError,
  StateView,
  StatusBadge,
} from "@/components/ui";
import { CatalogueFilters } from "@/components/catalogue-filters";
import { catalogueConfig, contextualStatusLabel } from "@/lib/catalogue-config";
import { useSession } from "@/providers/session";
import { useWorkspace } from "@/hooks/use-workspace";
import { dateTime, money, statuses, useTheme } from "@/theme";
import { rememberRecordPreview } from '@/lib/record-preview';
import { ManagementDrawer } from "@/components/management-drawer";
import { RecordActionsModal } from "@/components/record-actions-modal";

const RecordCard = memo(function RecordCard({
  record,
  kind,
  scope,
  onOpenActions,
}: {
  record: MobileRecord;
  kind: CatalogueKind;
  scope: MobileContractScope;
  onOpenActions?: () => void;
}) {
  const theme = useTheme();
  const cache = useQueryClient();
  const { session, api } = useSession();

  const handlePress = () => {
    if (session && api) rememberRecordPreview(cache, api.origin, session.user, kind, record);
    if (kind === "vehicles") {
      if (api && session) void cache.prefetchQuery({
        queryKey: ['vehicle-profile', session.user.id, String(record.id)],
        queryFn: ({ signal }) => api.vehicleProfile(String(record.id), signal), staleTime: 30_000,
      });
      router.push({
        pathname: "/vehicle/[id]",
        params: { id: String(record.id) },
      });
    } else {
      router.push({
        pathname: "/record/[kind]/[id]",
        params: { kind, id: String(record.id) },
      });
    }
  };

  return (
    <Card style={{ gap: 12, padding: 16 }}>
      <View style={styles.row}>
        {kind === 'vehicles' && <VehicleThumbnail id={record.id} revision={record.thumbnailRevision}/>}
        <Pressable
          style={{ flex: 1 }}
          accessibilityRole="button"
          accessibilityLabel={`Xem ${kind === "vehicles" ? record.license || record.name : record.code}, ${record.name}`}
          onPress={handlePress}
        >
          <Text
            style={{
              color: theme.text,
              fontSize: 18,
              fontWeight: "700",
            }}
          >
            {kind === "vehicles"
              ? record.license || record.code
              : kind === "customers"
                ? record.name
                : record.code}
          </Text>
        </Pressable>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {!!onOpenActions && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Thao tác ${record.code || record.license || record.name}`}
              onPress={onOpenActions}
              hitSlop={10}
              style={({ pressed }) => [
                styles.moreButton,
                {
                  borderColor: theme.border,
                  backgroundColor: pressed ? theme.background : theme.surface,
                },
              ]}
            >
              <MoreHorizontal size={18} color={theme.text} />
            </Pressable>
          )}
          <Pressable onPress={handlePress} hitSlop={10}>
            <ChevronRight size={19} color={theme.muted} accessible={false} />
          </Pressable>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Chi tiết ${record.code || record.name}`}
        onPress={handlePress}
        style={({ pressed }) => ({ gap: 12, opacity: pressed ? 0.72 : 1 })}
      >
        {kind !== "customers" && (
          <Text style={{ color: theme.muted, fontSize: 15, lineHeight: 23 }}>
            {record.name || "Chưa có tên"}
            {kind === "contracts" && record.license
              ? ` · ${record.license}`
              : ""}
          </Text>
        )}
        {kind === "vehicles" && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: -4 }}>
            {!!record.brand && (
              <Text style={{ color: theme.muted, fontSize: 13, fontWeight: "500" }}>
                {record.brand}
              </Text>
            )}
            {record.odometer !== null && (
              <Text style={{ color: theme.text, fontSize: 13, fontWeight: "600" }}>
                · {record.odometer.toLocaleString("vi-VN")} km
              </Text>
            )}
            {!!record.color && (
              <Text style={{ color: theme.muted, fontSize: 13 }}>
                · {record.color}
              </Text>
            )}
          </View>
        )}
        {kind === "customers" && !!(record.phone || record.contactDetail) && (
          <Text numberOfLines={2} style={{ color: theme.muted, fontSize: 15 }}>
            {record.phone || record.contactDetail}
          </Text>
        )}
        <View
          style={[styles.row, { flexWrap: "wrap", alignItems: "flex-start" }]}
        >
          <StatusBadge
            status={record.status}
            label={contextualStatusLabel(kind, record.status)}
          />
          <Text
            style={{
              color: theme.muted,
              fontSize: 13,
              lineHeight: 20,
              flexShrink: 1,
            }}
          >
            {record.storeName || "Chưa xác định cơ sở"}
          </Text>
        </View>
        {kind === "contracts" && record.monitoring && (
          <View style={{ gap: 5 }}>
            {!!record.monitoring.contractTypeName && <Text style={{ color: theme.muted, fontSize: 13 }}>{record.monitoring.contractTypeName}</Text>}
            {!!record.monitoring.nextDueAt && <Text style={{ color: theme.text, fontSize: 13 }}>Kỳ tiếp theo: {dateTime(record.monitoring.nextDueAt)}</Text>}
            {record.monitoring.dueAmount !== null && <Text style={{ color: record.monitoring.collectionOverdue ? theme.danger : theme.text, fontSize: 14, fontWeight: "600" }}>Còn phải đóng theo kỳ: {money(record.monitoring.dueAmount)}</Text>}
            {(scope === "overdue" || scope === "ownership") && record.monitoring.rentalDebt !== null && <Text style={{ color: theme.text, fontSize: 13 }}>Tiền thuê còn thiếu: {money(record.monitoring.rentalDebt)}</Text>}
            {scope === "overdue" && record.monitoring.lateFeeEstimate !== null && <Text style={{ color: theme.warning, fontSize: 13 }}>Phí trả trễ tạm tính: {money(record.monitoring.lateFeeEstimate)}</Text>}
            {scope === "vat" && <Text style={{ color: theme.text, fontSize: 14, fontWeight: "600" }}>Đã thu vào TK công ty: {money(record.monitoring.companyPaidAmount)}</Text>}
          </View>
        )}
      </Pressable>
    </Card>
  );
});
export function CatalogueScreen({
  kind,
  initialStatus = "",
  initialScope = "",
  initialStore,
  initialSearch="",
  operationsCatalogue=false,
}: {
  kind: CatalogueKind;
  initialStatus?: string;
  initialScope?: MobileContractScope;
  initialStore?: string;
  initialSearch?:string;
  operationsCatalogue?:boolean;
}) {
  const theme = useTheme();
  const { session, api, restore } = useSession();
  const cache=useQueryClient();
  const workspace = useWorkspace();
  const { height } = useWindowDimensions();
  const compact = height < 500;
  const [input, setInput] = useState(initialSearch);
  const [search, setSearch] = useState(initialSearch);
  const [status, setStatus] = useState(initialStatus);
  const [scope, setScope] = useState(initialScope);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [storeBasis, setStoreBasis] = useState("source");
  const datesValid = !from || !to || from <= to;
  const defaultStore =
    kind === "vehicles"
      ? "all"
      : session?.user.storeId
      ? String(session.user.storeId)
      : "all";
  const [store, setStore] = useState(initialStore || defaultStore);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [storeModalOpen, setStoreModalOpen] = useState(false);
  const [actionRecord, setActionRecord] = useState<MobileRecord | null>(null);
  const list = useRef<FlatList<MobileRecord>>(null);
  const settings = { ...catalogueConfig[kind], ...(kind === "contracts" && scope ? { title: contractWorkspace(scope)!.title } : {}) };
  const allowed = session?.user.permissions.includes(`${kind}.read`);
  useEffect(() => {
    const timer = setTimeout(() => setSearch(input.trim()), 300);
    return () => clearTimeout(timer);
  }, [input]);
  useEffect(() => {
    list.current?.scrollToOffset({ offset: 0, animated: false });
  }, [search, status, store, scope, from, to, storeBasis]);
  const query = useInfiniteQuery({
    queryKey: ["catalogue", session?.user.id, session?.user.storeId, session?.user.allStores, kind, search, status, store, scope, from, to, storeBasis,operationsCatalogue],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      (operationsCatalogue?(_kind:CatalogueKind,query:string,signal:AbortSignal)=>api!.operationContracts(query,signal):api!.catalogue)(
        kind,
        new URLSearchParams({
          page: String(pageParam),
          size: "20",
          search,
          status,
          store,
          ...(kind === "contracts" ? { scope, from, to, store_basis: storeBasis } : {}),
        }).toString(),
        signal,
      ),
    getNextPageParam: (last) =>
      last.page < last.pages ? last.page + 1 : undefined,
    enabled: !!api && !!allowed && datesValid,
    staleTime: 30_000,
    gcTime: 300_000,
  });
  const records = useMemo(() => [
    ...new Map(query.data?.pages.flatMap(page => page.rows).map(row => [row.id, row])).values(),
  ], [query.data]);
  const renderRecord = useCallback(({ item }: { item: MobileRecord }) => (
    <RecordCard
      record={item}
      kind={kind}
      scope={scope}
      onOpenActions={() => setActionRecord(item)}
    />
  ), [kind, scope]);
  const statusCountsMap = useMemo(() => {
    const map = new Map<string, number>();
    const counts = query.data?.pages[0]?.statusCounts;
    if (Array.isArray(counts)) {
      for (const [st, cnt] of counts) map.set(st, cnt);
    }
    return map;
  }, [query.data]);
  if (!allowed)
    return (
      <StateView
        title="Không có quyền truy cập"
        message="Liên hệ quản trị viên nếu cần thay đổi phạm vi công việc."
      />
    );
  const stores = (workspace.data?.stores || []).filter(
    (item) =>
      kind === "vehicles" ||
      session?.user.allStores ||
      item.id === session?.user.storeId,
  );
  const storeName =
    store === "all"
      ? kind === "vehicles" || session?.user.allStores
        ? "Toàn bộ cơ sở"
        : "Cơ sở được phân công"
      : stores.find((item) => String(item.id) === store)?.name ||
        "Cơ sở được phân công";
  const filterCount = Number(!!status) + Number(store !== defaultStore) + Number(!!from) + Number(!!to) + Number(storeBasis !== "source");

  const quickStatuses = [
    ...new Set(["", ...settings.quickStatuses, ...(status ? [status] : [])]),
  ];
  function resetFilters() {
    setInput("");
    setSearch("");
    setStatus("");
    setStore(defaultStore);
    setFrom("");
    setTo("");
    setStoreBasis("source");
  }
  function fetchMore() {
    if (query.hasNextPage && !query.isFetching && !query.isFetchNextPageError)
      void query.fetchNextPage({ cancelRefetch: false });
  }
  const actions: { label: string; onPress: () => void; disabled?: boolean }[] = [];
  if (kind === "vehicles") {
    actions.push(
      { label: "Lịch sử điều chuyển", onPress: () => router.push("/vehicle-transfers") },
      { label: "Kho xe toàn hệ thống", onPress: () => router.push("/fleet-inventory") },
    );
    if (session?.user.permissions.includes("settings.write"))
      actions.push({ label: "Nhập và đồng bộ Excel xe", onPress: () => router.push("/vehicle-import") });
  }
  if (kind === "customers" && session?.user.permissions.includes("settings.write")) {
    actions.push(
      { label: "Nhập khách hàng từ Excel", onPress: () => router.push("/import-customers") },
      { label: "Khớp cơ sở khách từ Excel", onPress: () => router.push("/customer-store-import") },
    );
  }
  const exportFilters = new URLSearchParams({ search, status, store, ...(kind === "contracts" ? { scope, from, to, store_basis: storeBasis } : {}) }).toString();
  if (!operationsCatalogue) {
    if (kind !== "contracts" && session?.user.permissions.includes("settings.write"))
      actions.push({ label: "Chọn nhiều hồ sơ để xóa", onPress: () => router.push({ pathname: "/bulk-delete/[kind]", params: { kind, filters: exportFilters } }) });
  }
  const toolbar = (
      <View
        style={[
          styles.toolbar,
          { paddingTop: compact ? 8 : 14, paddingBottom: compact ? 8 : 12 },
        ]}
      >
        {/* Top Header with Hamburger Menu and Fast Store Selector */}
        {!compact && (
          <View style={styles.topHeader}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Mở danh mục quản lý"
              onPress={() => setDrawerOpen(true)}
              style={({ pressed }) => [
                styles.menuButton,
                {
                  borderColor: theme.border,
                  backgroundColor: theme.surface,
                  opacity: pressed ? 0.65 : 1,
                },
              ]}
            >
              <Menu size={20} color={theme.text} accessible={false} />
            </Pressable>

            <Text
              accessibilityRole="header"
              numberOfLines={1}
              style={[styles.headerTitle, { color: theme.text }]}
            >
              {settings.title}
            </Text>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Chọn cơ sở"
              onPress={() => setStoreModalOpen(true)}
              style={({ pressed }) => [
                styles.storePillHeader,
                {
                  borderColor: theme.border,
                  backgroundColor: theme.surface,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <MapPin size={13} color={theme.primary} />
              <Text numberOfLines={1} style={{ color: theme.text, fontSize: 12, fontWeight: "600", maxWidth: 105 }}>
                {storeName}
              </Text>
              <ChevronDown size={13} color={theme.muted} />
            </Pressable>
          </View>
        )}

        {!compact && (
          <View style={styles.row}>
            <Text style={{ color: theme.muted, fontSize: 13, flex: 1 }}>
              {query.data
                ? `${query.data.pages[0].total.toLocaleString("vi-VN")} ${settings.noun}`
                : "Đang tải…"}
            </Text>
          </View>
        )}
        {kind === "vehicles" && session?.user.permissions.includes("vehicles.write") && (
          <Button label="+ Thêm xe mới" onPress={() => router.push({ pathname: "/vehicle-editor/[id]", params: { id: "new", store } })} />
        )}
        {kind === "customers" && session?.user.permissions.includes("customers.write") && (
          <Button label="+ Thêm khách hàng" onPress={() => router.push("/customer/new")} />
        )}
        {kind === "contracts" && session?.user.permissions.includes("contracts.draft") && (
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Button
                secondary
                label="+ Nhận cọc giữ xe"
                onPress={() => router.push({ pathname: "/draft/new", params: { store_id: store, reservation: "1" } })}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label="+ Nhập hợp đồng"
                onPress={() => router.push({ pathname: "/draft/new", params: { store_id: store } })}
              />
            </View>
          </View>
        )}
        {actions.length > 0 && <View style={{ gap: 8 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Thao tác khác"
            accessibilityState={{ expanded: actionsOpen }}
            aria-expanded={actionsOpen}
            onPress={() => setActionsOpen(open => !open)}
            style={({ pressed }) => ({ minHeight: 48, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, opacity: pressed ? 0.72 : 1 })}
          >
            <Text style={{ color: theme.muted, fontSize: 15, fontWeight: "600", flex: 1 }}>Thao tác khác</Text>
            <ChevronDown size={20} color={theme.muted} accessible={false} style={{ transform: [{ rotate: actionsOpen ? "180deg" : "0deg" }] }} />
          </Pressable>
          {actionsOpen && <Card style={{ gap: 8, padding: 12 }}>
            {actions.map(action => <Button key={action.label} secondary {...action} />)}
          </Card>}
        </View>}
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View
            style={[
              styles.search,
              {
                backgroundColor: theme.surface,
                borderColor: theme.controlBorder,
              },
            ]}
          >
            <Search size={20} color={theme.muted} accessible={false} />
            <TextInput
              accessibilityLabel={`Tìm ${settings.title.toLowerCase()}`}
              placeholder={settings.placeholder}
              placeholderTextColor={theme.muted}
              value={input}
              onChangeText={setInput}
              autoCorrect={false}
              returnKeyType="search"
              style={{
                color: theme.text,
                flex: 1,
                minWidth: 0,
                minHeight: 52,
                fontSize: 16,
              }}
              maxLength={120}
            />
            {input ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Xóa tìm kiếm"
                onPress={() => setInput("")}
                style={styles.iconButton}
              >
                <X size={19} color={theme.muted} />
              </Pressable>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              filterCount ? `Bộ lọc, ${filterCount} đang áp dụng` : "Bộ lọc"
            }
            onPress={() => setFiltersOpen(true)}
            style={({ pressed }) => [
              styles.filterButton,
              {
                borderColor: filterCount ? theme.primary : theme.controlBorder,
                backgroundColor: filterCount ? theme.tint : theme.surface,
                opacity: pressed ? 0.72 : 1,
              },
            ]}
          >
            <SlidersHorizontal
              size={21}
              color={filterCount ? theme.primary : theme.text}
              accessible={false}
            />
            {!!filterCount && (
              <Text
                style={{
                  color: theme.primary,
                  fontWeight: "700",
                  fontSize: 12,
                }}
              >
                {filterCount}
              </Text>
            )}
          </Pressable>
        </View>
        {!compact && (
          <View style={{ gap: 6 }}>
            {/* 10 Standard Status Tabs matching Web contract-tabs.ts */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
            >
              {quickStatuses.map((value) => {
                const isSelected = status === value;
                const tabLabel = value
                  ? contextualStatusLabel(kind, value) || statuses[value] || value
                  : "Tất cả";
                const count = (() => {
                  if (!value) return query.data?.pages[0]?.total;
                  if (statusCountsMap.size === 0) return undefined;
                  if (kind === "contracts" && value === "renting") {
                    const renting = statusCountsMap.get("renting") || 0;
                    const overdue = statusCountsMap.get("overdue") || 0;
                    const badDebt = statusCountsMap.get("bad_debt") || 0;
                    const sum = renting + overdue + badDebt;
                    return sum > 0 ? sum : undefined;
                  }
                  return statusCountsMap.get(value);
                })();

                return (
                  <Pressable
                    key={value || "all"}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    aria-selected={isSelected}
                    onPress={() => setStatus(value)}
                    style={({ pressed }) => [
                      styles.chip,
                      {
                        backgroundColor:
                          isSelected ? theme.primary : theme.surface,
                        borderColor:
                          isSelected ? theme.primary : theme.controlBorder,
                        opacity: pressed ? 0.75 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: isSelected ? theme.primaryText : theme.text,
                        fontSize: 13,
                        fontWeight: isSelected ? "700" : "500",
                      }}
                    >
                      {tabLabel}{count !== undefined ? ` (${count})` : ""}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Scope notification banner if filtered by specialized workspace */}
            {kind === "contracts" && !!scope && (
              <View
                style={[
                  styles.scopeBanner,
                  { backgroundColor: theme.tint, borderColor: theme.border },
                ]}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: theme.text, fontSize: 13, fontWeight: "700" }}>
                    Đang xem: {contractWorkspace(scope)!.title}
                  </Text>
                  <Text style={{ color: theme.muted, fontSize: 11, lineHeight: 16 }}>
                    {contractWorkspace(scope)!.description}
                  </Text>
                </View>
                <Pressable
                  onPress={() => setScope("")}
                  style={[
                    styles.scopeClearChip,
                    { backgroundColor: theme.surface, borderColor: theme.border },
                  ]}
                >
                  <Text style={{ color: theme.primary, fontSize: 12, fontWeight: "700" }}>
                    Xem tất cả
                  </Text>
                  <X size={13} color={theme.primary} />
                </Pressable>
              </View>
            )}
          </View>
        )}
        <View style={styles.row}>
          <Text
            numberOfLines={2}
            style={{
              color: theme.muted,
              flex: 1,
              fontSize: 13,
              lineHeight: 19,
            }}
          >
            {storeName}
            {storeBasis === "warehouse" ? " · Theo kho xe" : ""}
            {from || to ? ` · ${from || "…"} → ${to || "…"}` : ""}
            {compact && status ? ` · ${statuses[status]}` : ""}
          </Text>
          {(input || filterCount > 0) && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Xóa bộ lọc và tìm kiếm"
              onPress={resetFilters}
              style={{
                minHeight: 48,
                justifyContent: "center",
                paddingHorizontal: 8,
              }}
            >
              <Text
                style={{
                  color: theme.primary,
                  fontSize: 13,
                  fontWeight: "600",
                }}
              >
                Đặt lại
              </Text>
            </Pressable>
          )}
        </View>
      </View>
  );
  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={{ flex: 1, backgroundColor: theme.background }}
    >
      <FlatList
        ref={list}
        style={{ flex: 1 }}
        data={records}
        keyExtractor={(record) => String(record.id)}
        renderItem={renderRecord}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
        updateCellsBatchingPeriod={32}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'web' ? 'none' : 'on-drag'}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching && !query.isFetchingNextPage}
            onRefresh={() => {
              void restore(true);
              void query.refetch();
              if(kind==='vehicles')void cache.invalidateQueries({queryKey:['record-media','vehicle-thumbnail']});
            }}
            tintColor={theme.primary}
          />
        }
        onEndReachedThreshold={0.4}
        onEndReached={fetchMore}
        scrollEventThrottle={100}
        onScroll={({ nativeEvent: { contentOffset, contentSize, layoutMeasurement } }) => {
          // Cached filter results can reuse a content length already reported by
          // onEndReached. Check the actual scroll distance as well in that case.
          if (contentSize.height > 0 && contentSize.height - contentOffset.y - layoutMeasurement.height <= layoutMeasurement.height * 0.4)
            fetchMore();
        }}
        ListHeaderComponent={
          <>{toolbar}{query.isError && !!records.length ? (
            <View style={{ gap: 12, marginBottom: 12 }}>
              <InlineError message="Chưa cập nhật được dữ liệu. Thông tin đang hiển thị có thể đã thay đổi." />
              <Button
                label="Tải lại danh sách"
                secondary
                onPress={() => {
                  void query.refetch();
                }}
              />
            </View>
          ) : null}</>
        }
        ListEmptyComponent={
          !datesValid ? <StateView title="Kiểm tra khoảng ngày" message="Chọn ngày kết thúc từ ngày bắt đầu trở đi." /> : query.isPending ? (
            <StateView title="Đang tải danh mục" loading />
          ) : query.isError ? (
            <StateView
              title="Chưa tải được dữ liệu"
              message={query.error.message}
              retry={() => {
                void query.refetch();
              }}
            />
          ) : (
            <View style={{ gap: 12 }}>
              <StateView
                title="Không có kết quả"
                message="Thử từ khóa hoặc bộ lọc khác."
              />
              {(input || filterCount > 0) && (
                <Button
                  label="Xóa bộ lọc và tìm kiếm"
                  secondary
                  onPress={resetFilters}
                />
              )}
            </View>
          )
        }
        ListFooterComponent={
          query.isFetchingNextPage ? (
            <ActivityIndicator color={theme.primary} style={{ padding: 24 }} />
          ) : query.isFetchNextPageError ? (
            <View style={{ paddingVertical: 16, gap: 12 }}>
              <InlineError message="Chưa tải được phần tiếp theo. Các hồ sơ đã tải vẫn được giữ lại." />
              <Button
                label="Tải tiếp"
                secondary
                onPress={() => {
                  void query.fetchNextPage();
                }}
              />
            </View>
          ) : records.length > 0 ? (
            <Text
              style={{
                color: theme.muted,
                textAlign: "center",
                fontSize: 12,
                paddingVertical: 24,
              }}
            >
              {query.hasNextPage
                ? "Cuộn để xem thêm"
                : "Đã hiển thị hết kết quả"}
            </Text>
          ) : undefined
        }
      />
      {filtersOpen && (
        <CatalogueFilters
          kind={kind}
          selected={{ status, store, from, to, storeBasis }}
          defaultStore={defaultStore}
          stores={stores}
          allowAll={kind === "vehicles" || session?.user.allStores === true}
          loading={workspace.isPending}
          error={workspace.isError}
          retry={() => {
            void workspace.refetch();
          }}
          onClose={() => setFiltersOpen(false)}
          onApply={(selection) => {
            setStatus(selection.status);
            setStore(selection.store);
            setFrom(selection.from || "");
            setTo(selection.to || "");
            setStoreBasis(selection.storeBasis || "source");
            setFiltersOpen(false);
          }}
        />
      )}

      {/* Global Management Drawer */}
      <ManagementDrawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />

      {/* Fast Row Actions Modal */}
      <RecordActionsModal
        visible={!!actionRecord}
        onClose={() => setActionRecord(null)}
        kind={kind}
        record={actionRecord}
        isAdmin={
          session?.user.role === "admin" || session?.user.role === "super_admin"
        }
        canSettle={
          session?.user.permissions.includes("contracts.settle") ||
          session?.user.role === "admin" ||
          session?.user.role === "super_admin"
        }
      />

      {/* Quick Store Picker Modal */}
      <Modal
        visible={storeModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setStoreModalOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setStoreModalOpen(false)}
        >
          <View
            style={[
              styles.modalSheet,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text
                style={{ color: theme.text, fontSize: 17, fontWeight: "700" }}
              >
                Chọn cơ sở xem {settings.noun}
              </Text>
              <Pressable
                onPress={() => setStoreModalOpen(false)}
                hitSlop={8}
              >
                <X size={20} color={theme.muted} />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 360 }}>
              {(kind === "vehicles" || session?.user.allStores) && (
                <Pressable
                  onPress={() => {
                    setStore("all");
                    setStoreModalOpen(false);
                  }}
                  style={[
                    styles.storeOption,
                    {
                      backgroundColor:
                        store === "all" ? theme.tint : "transparent",
                      borderBottomColor: theme.border,
                    },
                  ]}
                >
                  <Text
                    style={{
                      flex: 1,
                      color: store === "all" ? theme.primary : theme.text,
                      fontWeight: store === "all" ? "700" : "500",
                      fontSize: 15,
                    }}
                  >
                    Toàn bộ cơ sở
                  </Text>
                  {store === "all" && (
                    <Check size={18} color={theme.primary} />
                  )}
                </Pressable>
              )}

              {stores.map((st) => {
                const isSelected = store === String(st.id);
                return (
                  <Pressable
                    key={st.id}
                    onPress={() => {
                      setStore(String(st.id));
                      setStoreModalOpen(false);
                    }}
                    style={[
                      styles.storeOption,
                      {
                        backgroundColor: isSelected
                          ? theme.tint
                          : "transparent",
                        borderBottomColor: theme.border,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        flex: 1,
                        color: isSelected ? theme.primary : theme.text,
                        fontWeight: isSelected ? "700" : "500",
                        fontSize: 15,
                      }}
                    >
                      {st.name}
                    </Text>
                    {isSelected && <Check size={18} color={theme.primary} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  toolbar: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    gap: 10,
  },
  topHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingBottom: 2,
  },
  menuButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.4,
    flex: 1,
  },
  storePillHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  moreButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scopeBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 10,
    marginTop: 2,
  },
  scopeClearChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    flexGrow: 1,
  },
  title: { fontSize: 28, fontWeight: "800", letterSpacing: -0.6 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  search: {
    flexDirection: "row",
    flex: 1,
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 14,
    paddingLeft: 14,
  },
  iconButton: {
    minWidth: 48,
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  filterButton: {
    minWidth: 52,
    minHeight: 52,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 4,
  },
  chip: {
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    padding: 20,
    paddingBottom: 34,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  storeOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderRadius: 8,
  },
});
