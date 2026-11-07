import { memo, useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import {
  ActivityIndicator,
  FlatList,
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
  ChevronRight,
  ChevronDown,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react-native";
import type { CatalogueKind, MobileRecord } from "@himoto/mobile-contract";
import { CONTRACT_WORKSPACES, contractWorkspace, type MobileContractScope } from "../../../shared/mobile-contract-workspaces";
import { ChoiceField } from "./form-fields";
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

const RecordCard = memo(function RecordCard({
  record,
  kind,
  scope,
}: {
  record: MobileRecord;
  kind: CatalogueKind;
  scope: MobileContractScope;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Xem ${kind === "vehicles" ? record.license || record.name : record.code}, ${record.name}`}
      onPress={() =>
        kind === "vehicles" ? router.push({ pathname: "/vehicle/[id]", params: { id: String(record.id) } }) : router.push({
          pathname: "/record/[kind]/[id]",
          params: { kind, id: String(record.id) },
        })
      }
      style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}
    >
      <Card style={{ gap: 12, padding: 16 }}>
        <View style={styles.row}>
          {kind==='vehicles'&&<VehicleThumbnail id={record.id} revision={record.thumbnailRevision}/>}
          <Text
            style={{
              flex: 1,
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
          <ChevronRight size={19} color={theme.muted} accessible={false} />
        </View>
        {kind !== "customers" && (
          <Text style={{ color: theme.muted, fontSize: 15, lineHeight: 23 }}>
            {record.name || "Chưa có tên"}
            {kind === "contracts" && record.license
              ? ` · ${record.license}`
              : ""}
          </Text>
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
      </Card>
    </Pressable>
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
    kind === "vehicles" || session?.user.allStores
      ? "all"
      : String(session?.user.storeId || "all");
  const [store, setStore] = useState(initialStore || defaultStore);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
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
  });
  if (!allowed)
    return (
      <StateView
        title="Không có quyền truy cập"
        message="Liên hệ quản trị viên nếu cần thay đổi phạm vi công việc."
      />
    );
  const records = [
    ...new Map(
      query.data?.pages
        .flatMap((page) => page.rows)
        .map((row) => [row.id, row]),
    ).values(),
  ];
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
    actions.push({ label: "Tải Excel theo bộ lọc", disabled: !datesValid || query.isPending || query.isError,
      onPress: () => router.push({ pathname: "/catalogue-export/[kind]", params: { kind, filters: exportFilters } }) });
    if (kind !== "contracts" && session?.user.permissions.includes("settings.write"))
      actions.push({ label: "Chọn nhiều hồ sơ để xóa", onPress: () => router.push({ pathname: "/bulk-delete/[kind]", params: { kind, filters: exportFilters } }) });
  }
  const toolbar = (
      <View
        style={[
          styles.toolbar,
          { paddingTop: compact ? 8 : 20, paddingBottom: compact ? 8 : 12 },
        ]}
      >
        {!compact && (
          <View style={styles.row}>
            <Text
              accessibilityRole="header"
              style={[styles.title, { color: theme.text, flex: 1, flexShrink: 1 }]}
            >
              {settings.title}
            </Text>
            <Text style={{ color: theme.muted, fontSize: 13, maxWidth: 100, textAlign: "right" }}>
              {query.data
                ? `${query.data.pages[0].total.toLocaleString("vi-VN")} ${settings.noun}`
                : "Đang tải…"}
            </Text>
          </View>
        )}
        {kind === "vehicles" && session?.user.permissions.includes("vehicles.write") && <Button label="Thêm xe" onPress={() => router.push({ pathname: "/vehicle-editor/[id]", params: { id: "new", store } })} />}
        {kind === "contracts" && (
          <View style={{ gap: 8 }}>
            <ChoiceField label="Nhóm hợp đồng" value={scope} choices={CONTRACT_WORKSPACES.map(item => ({ value: item.key, label: item.title }))} onChange={value => { setScope(value as MobileContractScope); setStatus(""); }} />
            {!!scope && <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 20 }}>{contractWorkspace(scope)!.description}</Text>}
          </View>
        )}
        {kind === "customers" &&
          session?.user.permissions.includes("customers.write") && (
            <Button
              label="Thêm khách hàng"
              onPress={() => router.push("/customer/new")}
            />
          )}
        {kind === "contracts" &&
          session?.user.permissions.includes("contracts.draft") && (
            <Button
              label="Thêm bản nháp"
              onPress={() => router.push("/draft/new")}
            />
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
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
          >
            {quickStatuses.map((value) => (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityState={{ selected: status === value }}
                aria-selected={status === value}
                onPress={() => setStatus(value)}
                style={({ pressed }) => [
                  styles.chip,
                  {
                    backgroundColor:
                      status === value ? theme.primary : theme.surface,
                    borderColor:
                      status === value ? theme.primary : theme.controlBorder,
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}
              >
                <Text
                  style={{
                    color: status === value ? theme.primaryText : theme.muted,
                    fontSize: 13,
                    fontWeight: "600",
                  }}
                >
                  {value
                    ? contextualStatusLabel(kind, value) || statuses[value]
                    : "Tất cả"}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
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
        renderItem={({ item }) => <RecordCard record={item} kind={kind} scope={scope} />}
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
});
