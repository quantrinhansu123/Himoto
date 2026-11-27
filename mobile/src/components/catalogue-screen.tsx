import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { cataloguePageWindow, CATALOGUE_MAX_PAGES } from '@/lib/catalogue-pages';
import { router, Stack, type Href } from "expo-router";
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
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Check,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  Download,
  MapPin,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  SlidersHorizontal,
  TriangleAlert,
  X,
} from "lucide-react-native";
import type { CatalogueKind, MobileRecord } from "@himoto/mobile-contract";
import { contractWorkspace, type MobileContractScope } from "../../../shared/mobile-contract-workspaces";
import { VehicleThumbnail } from './vehicle-thumbnail';
import {
  Button,
  Card,
  InlineError,
  SkeletonList,
  StateView,
  StatusBadge,
} from "@/components/ui";
import { CatalogueFilters } from "@/components/catalogue-filters";
import { catalogueConfig, catalogueStatuses, catalogueAllLabel, activeRentalCount, contextualStatusLabel } from "@/lib/catalogue-config";
import { useSession } from "@/providers/session";
import { useGlobalBranch } from "@/providers/branch";
import { useWorkspace } from "@/hooks/use-workspace";
import { dateTime, money, statuses, useTheme } from "@/theme";
import { rememberRecordPreview } from '@/lib/record-preview';
import { ManagementDrawer } from "@/components/management-drawer";
import { RecordActionsModal } from "@/components/record-actions-modal";
import { backfillActions } from '../../../shared/mobile-backfill';
import { isAdminAccount } from '../../../shared/mobile-managed-accounts';
import { requiresOwnershipApproval } from '../../../shared/contract-approval';

const GPS_CARD_LABELS: Record<string, string> = {
  online: "ON · Đang di chuyển",
  stopped: "ON · Đang dừng",
  stale: "Chưa cập nhật",
  warning: "Cảnh báo",
  offline: "OFF · Mất kết nối",
  unavailable: "Không còn trong tài khoản GPS",
  none: "Chưa gắn GPS",
};

const RecordCard = memo(function RecordCard({
  record,
  kind,
  scope,
  operationAction,
  onOpenActions,
}: {
  record: MobileRecord;
  kind: CatalogueKind;
  scope: MobileContractScope;
  operationAction?: "return" | "renew" | "active" | "overdue";
  onOpenActions?: (record: MobileRecord) => void;
}) {
  const theme = useTheme();
  const cache = useQueryClient();
  const { session, api } = useSession();

  const handlePress = () => {
    if (session && api) rememberRecordPreview(cache, api.origin, session.user, kind, record);
    if (kind === "contracts" && operationAction === "return") {
      router.push({ pathname: "/return-editor/[id]", params: { id: String(record.id) } });
      return;
    }
    if (kind === "contracts" && operationAction === "renew") {
      router.push({ pathname: "/renewal/[id]", params: { id: String(record.id) } });
      return;
    }
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

  const perms = session?.user.permissions || [];
  const canReceiveTransfer = kind === "vehicles" && record.status === "in_transit" && Boolean(perms.includes("vehicles.receive") || perms.includes("vehicles.transfer"));
  const needsApproval = kind === "contracts" && record.status !== "draft" && record.status !== "cancelled" && requiresOwnershipApproval(record.monitoring?.rentalType);
  const canApproveRole = Boolean(isAdminAccount(session?.user) || session?.user.role === "ownership_manager" || session?.user.role === "branch_manager");
  const canApproveContract = needsApproval && !record.approvedAt && perms.includes("contracts.finalize") && canApproveRole;
  const showContractTelegram = kind === "contracts" && record.status !== "draft";
  const contractBalance =
    kind === "contracts" && record.totalAmount !== null && record.paidAmount !== null
      ? Math.max(0, record.totalAmount - record.paidAmount)
      : null;

  return (
    <Card style={{ gap: 9, padding: 13 }}>
      <View style={styles.row}>
        {kind === 'vehicles' && <VehicleThumbnail id={record.id} revision={record.thumbnailRevision} />}
        <Pressable
          style={{ flex: 1, gap: 3 }}
          accessibilityRole="button"
          accessibilityLabel={`Xem ${kind === "vehicles" ? record.license || record.name : record.code}, ${record.name}`}
          onPress={handlePress}
        >
          {kind === "contracts" ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <Text style={{ color: theme.primary, fontSize: 13.5, fontWeight: "800" }}>
                {record.code}
              </Text>
              <Text numberOfLines={1} style={{ color: theme.text, fontSize: 15.5, fontWeight: "700", flexShrink: 1 }}>
                {record.name || "Chưa có tên"}
              </Text>
            </View>
          ) : (
            <Text
              numberOfLines={1}
              style={{
                color: theme.text,
                fontSize: 16,
                fontWeight: "700",
              }}
            >
              {kind === "vehicles"
                ? record.license || record.code
                : record.name}
            </Text>
          )}
          {kind === "vehicles" && (
            <Text numberOfLines={1} style={{ color: theme.muted, fontSize: 13 }}>
              {[record.name, record.brand, record.color, record.odometer !== null ? `${record.odometer.toLocaleString("vi-VN")} km` : ""].filter(Boolean).join(" · ")}
            </Text>
          )}
          {kind === "customers" && (
            <Text numberOfLines={1} style={{ color: theme.muted, fontSize: 13 }}>
              {[record.code, record.phone || record.contactDetail].filter(Boolean).join(" · ")}
            </Text>
          )}
        </Pressable>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          {!!onOpenActions && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Thao tác ${record.code || record.license || record.name}`}
              onPress={() => onOpenActions(record)}
              hitSlop={10}
              style={({ pressed }) => [
                styles.moreButton,
                {
                  borderColor: theme.border,
                  backgroundColor: pressed ? theme.background : theme.surface,
                },
              ]}
            >
              <MoreHorizontal size={17} color={theme.text} />
            </Pressable>
          )}
          <Pressable onPress={handlePress} hitSlop={10}>
            <ChevronRight size={18} color={theme.muted} accessible={false} />
          </Pressable>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Chi tiết ${record.code || record.name}`}
        onPress={handlePress}
        style={({ pressed }) => ({ gap: 7, opacity: pressed ? 0.72 : 1 })}
      >
        {kind === "contracts" && (
          <View style={styles.contractMetaRow}>
            {!!record.license && (
              <View style={[styles.platePill, { backgroundColor: theme.background, borderColor: theme.border }]}>
                <Text style={{ color: theme.text, fontSize: 12.5, fontWeight: "700" }}>{record.license}</Text>
              </View>
            )}
            {record.totalAmount !== null && (
              <Text style={{ color: theme.text, fontSize: 13.5, fontWeight: "700" }}>
                {money(record.totalAmount)}
              </Text>
            )}
            {contractBalance !== null && contractBalance > 0 && (
              <Text style={{ color: theme.warning, fontSize: 12.5, fontWeight: "600" }}>
                Còn {money(contractBalance)}
              </Text>
            )}
            {!!record.endsAt && (
              <Text style={{ color: theme.muted, fontSize: 12.5 }}>
                Trả: {dateTime(record.endsAt)}
              </Text>
            )}
          </View>
        )}

        {kind === "vehicles" && (!!record.holderName || !!record.beneficiaryStoreName || !!record.transferRoute) && (
          <View style={{ gap: 3 }}>
            {!!record.holderName && record.holderName !== "Lưu kho" && (
              <Text numberOfLines={1} style={{ color: theme.text, fontSize: 13, fontWeight: "600" }}>
                Người giữ: {record.holderName}
              </Text>
            )}
            {!!record.beneficiaryStoreName && (
              <Text numberOfLines={1} style={{ color: theme.muted, fontSize: 12.5 }}>
                Nguồn khách: {record.beneficiaryStoreName}
              </Text>
            )}
            {!!record.transferRoute && (
              <Text numberOfLines={1} style={{ color: theme.primary, fontSize: 12.5, fontWeight: "700" }}>
                Điều chuyển: {record.transferRoute}
              </Text>
            )}
          </View>
        )}

        <View style={[styles.row, { flexWrap: "wrap", alignItems: "center", gap: 6 }]}>
          <StatusBadge
            status={kind === "vehicles" && record.missingOpenContract ? "warning" : record.status}
            label={kind === 'contracts' && scope === 'drafts' && record.status === 'draft' ? 'Lưu nháp' : contextualStatusLabel(kind, record.status)}
          />
          {kind === "contracts" && record.status !== "draft" && record.status !== "cancelled" && (needsApproval || !!record.approvedAt) && (
            <StatusBadge
              status={record.approvedAt ? "approved" : "unapproved"}
              label={record.approvedAt ? "Đã duyệt" : "Chờ duyệt"}
            />
          )}
          {kind === "contracts" && record.status === "reserved" && !!record.holdUntil && (
            <StatusBadge status="reserved" label={`Giữ đến ${dateTime(record.holdUntil)}`} />
          )}
          {kind === "vehicles" && !!record.locationStatus && record.locationStatus !== "none" && (
            <StatusBadge
              status={record.locationStatus}
              label={GPS_CARD_LABELS[record.locationStatus] || record.locationStatus}
            />
          )}
          {kind === "vehicles" && record.missingOpenContract && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: theme.warningBackground, borderWidth: 1, borderColor: `${theme.warning}44` }}>
              <TriangleAlert size={12} color={theme.warning} accessible={false} />
              <Text style={{ color: theme.warning, fontSize: 11.5, fontWeight: "700" }}>Không có HĐ</Text>
            </View>
          )}
          {kind === "vehicles" && typeof record.overdueDays === "number" && record.overdueDays > 0 && (
            <StatusBadge status="overdue" label={`Quá hạn ${record.overdueDays} ngày`} />
          )}
          <Text
            numberOfLines={1}
            style={{
              color: theme.muted,
              fontSize: 12.5,
              flexShrink: 1,
            }}
          >
            {kind === "vehicles" ? `Kho: ${record.storeName || "Chưa xác định"}` : (record.storeName || "Chưa xác định cơ sở")}
          </Text>
        </View>

        {kind === "customers" && !!record.address && (
          <Text numberOfLines={1} style={{ color: theme.muted, fontSize: 12.5 }}>
            {record.address}
          </Text>
        )}

        {kind === "customers" && !!record.customerNote && (
          <Text numberOfLines={2} style={{ color: theme.warning, fontSize: 12.5, lineHeight: 17 }}>
            Lưu ý: {record.customerNote}
          </Text>
        )}

        {kind === "contracts" && record.monitoring && (
          <View style={{ gap: 3, paddingTop: 2 }}>
            {!!record.monitoring.contractTypeName && <Text style={{ color: theme.muted, fontSize: 12.5 }}>{record.monitoring.contractTypeName}</Text>}
            {!!record.monitoring.nextDueAt && <Text style={{ color: theme.text, fontSize: 12.5 }}>Kỳ tiếp theo: {dateTime(record.monitoring.nextDueAt)}</Text>}
            {scope !== 'overdue' && record.monitoring.dueAmount !== null && <Text style={{ color: record.monitoring.collectionOverdue ? theme.danger : theme.text, fontSize: 13, fontWeight: "700" }}>Còn phải đóng theo kỳ: {money(record.monitoring.dueAmount)}</Text>}
            {(scope === "overdue" || scope === "ownership") && record.monitoring.rentalDebt !== null && <Text style={{ color: theme.text, fontSize: 12.5 }}>Tiền thuê còn thiếu: {money(record.monitoring.rentalDebt)}</Text>}
            {scope === "overdue" && record.status !== 'bad_debt' && (record.monitoring.basis === 'payment' ? record.monitoring.dueAmount : record.monitoring.lateFeeEstimate) !== null && <Text style={{ color: theme.warning, fontSize: 12.5, fontWeight: "600" }}>{record.monitoring.basis === 'payment' ? 'Tiền đến hạn' : 'Phí trễ tạm tính'}: {money((record.monitoring.basis === 'payment' ? record.monitoring.dueAmount : record.monitoring.lateFeeEstimate)!)}</Text>}
            {scope === 'overdue' && record.status !== 'bad_debt' && record.monitoring.basis === 'return' && record.monitoring.referencePrice && <Text style={{ color: theme.muted, fontSize: 12 }}>Theo bảng giá ngày tham chiếu</Text>}
            {scope === "vat" && <Text style={{ color: theme.text, fontSize: 13, fontWeight: "700" }}>Đã thu vào TK công ty: {money(record.monitoring.companyPaidAmount)}</Text>}
          </View>
        )}
      </Pressable>

      {(canReceiveTransfer || canApproveContract || showContractTelegram) && (
        <View style={{ flexDirection: "row", gap: 8, paddingTop: 2 }}>
          {canReceiveTransfer && (
            <Button
              size="sm"
              equalWidth
              label={perms.includes("vehicles.receive") ? "Nhận / Từ chối xe" : "Xem / Huỷ chuyển"}
              onPress={() => router.push({ pathname: "/vehicle-transfer-editor/[id]", params: { id: String(record.id) } })}
            />
          )}
          {canApproveContract && (
            <Button
              size="sm"
              equalWidth
              icon={<CheckCircle2 size={14} color={theme.primaryText} accessible={false} />}
              label="Duyệt hợp đồng"
              onPress={() => router.push({ pathname: "/contract-approval/[id]", params: { id: String(record.id) } })}
            />
          )}
          {showContractTelegram && (
            <Button
              size="sm"
              equalWidth={canApproveContract}
              secondary
              icon={<Send size={13} color={theme.text} accessible={false} />}
              label="Telegram"
              onPress={() => router.push({ pathname: "/contract-telegram/[id]", params: { id: String(record.id) } })}
            />
          )}
        </View>
      )}
    </Card>
  );
});
const CatalogueSeparator = () => <View style={{ height: 10 }} />;

export function CatalogueScreen({
  kind,
  initialStatus = "",
  initialScope = "",
  initialStore,
  initialSearch = "",
  initialCustomerId,
  customerName,
  operationsCatalogue = false,
  operationAction,
  showManagementMenu = true,
}: {
  kind: CatalogueKind;
  initialStatus?: string;
  initialScope?: MobileContractScope;
  initialStore?: string;
  initialSearch?: string;
  initialCustomerId?: string;
  customerName?: string;
  operationsCatalogue?: boolean;
  operationAction?: "return" | "renew" | "active" | "overdue";
  showManagementMenu?: boolean;
}) {
  const theme = useTheme();
  const { session, api, restore } = useSession();
  const cache = useQueryClient();
  const workspace = useWorkspace();
  const { height } = useWindowDimensions();
  const compact = height < 500;
  const [input, setInput] = useState(initialSearch);
  const [search, setSearch] = useState(initialSearch);
  const [status, setStatus] = useState(initialStatus);
  const [scope, setScope] = useState(initialScope);
  const [customerId, setCustomerId] = useState(initialCustomerId || "");
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
  const canReadAllStores = Boolean(session?.user.allStores || session?.user.allStoresRead);
  const { selectedStore: globalStore, selectStore: setGlobalStore } = useGlobalBranch(defaultStore);
  const [storeOverride, setStoreOverride] = useState<string | null>(
    initialStore ? (kind === "vehicles" || canReadAllStores ? initialStore : defaultStore) : null,
  );
  const store =
    kind !== "vehicles" && !canReadAllStores
      ? defaultStore
      : storeOverride !== null
        ? storeOverride
        : kind === "vehicles"
          ? "all"
          : globalStore || defaultStore;
  const setStore = (next: string) => {
    if (kind !== "vehicles" && !canReadAllStores) return;
    if (initialStore || kind === "vehicles") setStoreOverride(next);
    else {
      setStoreOverride(null);
      setGlobalStore(next);
    }
  };
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [storeModalOpen, setStoreModalOpen] = useState(false);
  const [actionRecord, setActionRecord] = useState<MobileRecord | null>(null);
  const [extraFilters, setExtraFilters] = useState<{
    rentalType?: string;
    ownershipTerm?: string;
    overdueBucket?: string;
    sort?: string;
    direction?: string;
    vehicleType?: string;
    warehouseStore?: string;
    beneficiaryStore?: string;
    missingContract?: string;
  }>({});
  const list = useRef<FlatList<MobileRecord>>(null);
  const nextPageGesture = useRef(true);
  const settings = { ...catalogueConfig[kind], ...(kind === "contracts" && scope ? { title: contractWorkspace(scope)!.title } : {}) };
  const allowed = session?.user.permissions.includes(`${kind}.read`);
  useEffect(() => {
    const timer = setTimeout(() => setSearch(input.trim()), 300);
    return () => clearTimeout(timer);
  }, [input]);
  useEffect(() => {
    nextPageGesture.current = true;
    list.current?.scrollToOffset({ offset: 0, animated: false });
  }, [search, status, store, scope, from, to, storeBasis, customerId, extraFilters]);
  const extraParams = useMemo(() => ({
    ...(extraFilters.sort ? { sort: extraFilters.sort } : {}),
    ...(extraFilters.direction ? { direction: extraFilters.direction } : {}),
    ...(kind === "contracts"
      ? {
        ...(extraFilters.rentalType ? { rental_type: extraFilters.rentalType } : {}),
        ...(extraFilters.ownershipTerm ? { ownership_term_months: extraFilters.ownershipTerm } : {}),
        ...(extraFilters.overdueBucket ? { overdue_bucket: extraFilters.overdueBucket } : {}),
      }
      : {}),
    ...(kind === "vehicles"
      ? {
        ...(extraFilters.vehicleType ? { vehicle_type: extraFilters.vehicleType } : {}),
        ...(extraFilters.warehouseStore ? { warehouse_store_id: extraFilters.warehouseStore } : {}),
        ...(extraFilters.beneficiaryStore ? { beneficiary_store_id: extraFilters.beneficiaryStore } : {}),
        ...(extraFilters.missingContract ? { missing_contract: extraFilters.missingContract } : {}),
      }
      : {}),
  }), [kind, extraFilters]);
  const query = useInfiniteQuery({
    queryKey: ["catalogue", session?.user.id, session?.user.storeId, session?.user.allStores, kind, search, status, store, scope, from, to, storeBasis, operationsCatalogue, customerId, extraParams],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      (operationsCatalogue ? (_kind: CatalogueKind, query: string, signal: AbortSignal) => api!.operationContracts(query, signal) : api!.catalogue)(
        kind,
        new URLSearchParams({
          page: String(pageParam),
          size: "20",
          search,
          status,
          store,
          ...(kind === "contracts" ? { scope, from, to, store_basis: storeBasis, ...(customerId ? { customer_id: customerId } : {}) } : {}),
          ...extraParams,
        }).toString(),
        signal,
      ),
    ...cataloguePageWindow,
    enabled: !!api && !!allowed && datesValid,
    staleTime: 30_000,
    gcTime: 300_000,
  });
  // Counts are independent of the selected status and never block the first page.
  const statistics = useQuery({
    queryKey: ['catalogue', 'status-counts', 'contracts', session?.user.id, session?.user.storeId, session?.user.allStores, scope, search, store, from, to, storeBasis, customerId, extraParams],
    queryFn: ({ signal }) => api!.catalogue('contracts', new URLSearchParams({ statistics: '1', size: '1', scope, search, store, from, to, store_basis: storeBasis, ...(customerId ? { customer_id: customerId } : {}), ...(kind === 'contracts' ? extraParams : {}) }).toString(), signal),
    enabled: kind === 'contracts' && !!api && !!allowed && datesValid && query.isSuccess,
    staleTime: 30_000, gcTime: 300_000, retry: false,
  });
  const records = useMemo(() => [
    ...new Map(query.data?.pages.flatMap(page => page.rows).map(row => [row.id, row])).values(),
  ], [query.data]);
  const renderRecord = useCallback(({ item }: { item: MobileRecord }) => (
    <RecordCard
      record={item}
      kind={kind}
      scope={scope}
      operationAction={operationAction}
      onOpenActions={setActionRecord}
    />
  ), [kind, scope, operationAction]);
  const statusCountsMap = useMemo(() => {
    const map = new Map<string, number>();
    const counts = kind === 'contracts' ? statistics.data?.statusCounts : query.data?.pages[0]?.statusCounts;
    if (Array.isArray(counts)) {
      for (const [st, cnt] of counts) map.set(st, cnt);
    }
    return map;
  }, [kind, statistics.data, query.data]);
  const fetchMore = useCallback((automatic = true) => {
    if (automatic && !nextPageGesture.current) return;
    if (query.hasNextPage && !query.isFetching && !query.isFetchNextPageError) {
      // Trimming a full page window can emit another native edge event without
      // user movement. Consume one gesture so it cannot drain every later page.
      nextPageGesture.current = false;
      void query.fetchNextPage({ cancelRefetch: false });
    }
  }, [query]);
  const checkListEnd = useCallback(({ nativeEvent: { contentOffset, contentSize, layoutMeasurement } }: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (contentSize.height > 0 && contentSize.height - contentOffset.y - layoutMeasurement.height <= layoutMeasurement.height * 0.4)
      fetchMore();
  }, [fetchMore]);
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
      canReadAllStores ||
      item.id === session?.user.storeId,
  );
  const storeName =
    store === "all"
      ? kind === "vehicles" || canReadAllStores
        ? "Toàn bộ cơ sở"
        : "Cơ sở được phân công"
      : stores.find((item) => String(item.id) === store)?.name ||
      "Cơ sở được phân công";
  const extraFilterCount = Object.values(extraParams).filter(Boolean).length;
  const filterCount = Number(!!status) + Number(store !== defaultStore) + Number(!!from) + Number(!!to) + Number(storeBasis !== "source") + Number(!!customerId) + extraFilterCount;

  const quickStatuses = [...new Set([...catalogueStatuses(kind, scope), ...(status ? [status] : [])])];
  function resetFilters() {
    setInput("");
    setSearch("");
    setStatus("");
    setStore(defaultStore);
    setFrom("");
    setTo("");
    setStoreBasis("source");
    setCustomerId("");
    setExtraFilters({});
  }
  const actions: { label: string; onPress: () => void; disabled?: boolean }[] = [];
  if (kind === "contracts" && !operationsCatalogue) {
    actions.push({ label: "Chưa gửi Telegram", onPress: () => router.push("/telegram-pending") });
    actions.push({ label: "Báo cáo nợ chậm", onPress: () => router.push("/collection-report") });
    if (session?.user.permissions.includes("contracts.draft") || session?.user.permissions.includes("finance.write"))
      actions.push({ label: "Nhắc nợ hợp đồng", onPress: () => router.push("/debt-reminders") });
  }
  if (kind === "vehicles") {
    if (session?.user.permissions.includes("settings.write"))
      actions.push({ label: "Nhập và đồng bộ Excel xe", onPress: () => router.push("/vehicle-import") });
  }
  if (kind === "customers" && session?.user.permissions.includes("settings.write")) {
    actions.push(
      { label: "Nhập khách hàng từ Excel", onPress: () => router.push("/import-customers") },
      { label: "Khớp cơ sở theo căn cước", onPress: () => router.push("/customer-store-import") },
    );
  }
  const exportFilters = new URLSearchParams({ search, status, store, ...(kind === "contracts" ? { scope, from, to, store_basis: storeBasis, ...(customerId ? { customer_id: customerId } : {}) } : {}), ...extraParams }).toString();
  if (kind === 'contracts' && !operationsCatalogue && isAdminAccount(session?.user)) actions.push({ label: 'Nhập nháp hợp đồng từ Excel', onPress: () => router.push('/import-contracts') });
  if (!operationsCatalogue) {
    if (session?.user.permissions.includes(kind === 'contracts' ? 'contracts.delete' : 'settings.write'))
      actions.push({ label: "Xóa đã chọn", onPress: () => router.push({ pathname: "/bulk-delete/[kind]", params: { kind, filters: exportFilters } }) });
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
          {showManagementMenu && <Pressable
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
          </Pressable>}

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
          <Text style={{ color: theme.muted, fontSize: 12.5, flex: 1 }}>
            {query.data
              ? `${query.data.pages[0].total.toLocaleString("vi-VN")} ${settings.noun}`
              : "Đang tải…"}
            {kind === "vehicles" ? " · Chưa gồm xe đã bán" : ""}
          </Text>
        </View>
      )}
      {/* Compact Primary CTA Row */}
      {kind === "contracts" && session?.user.permissions.includes("contracts.draft") && (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button
            size="sm"
            equalWidth
            label="Nhập hợp đồng"
            icon={<Plus size={15} color={theme.primaryText} />}
            onPress={() => router.push({ pathname: "/draft/new", params: { store_id: store } })}
          />
          <Button
            size="sm"
            equalWidth
            secondary
            label="Nhận cọc giữ xe"
            icon={<Plus size={15} color={theme.text} />}
            onPress={() => router.push({ pathname: "/draft/new", params: { store_id: store, reservation: "1" } })}
          />
        </View>
      )}
      {kind === "vehicles" && (session?.user.permissions.includes("vehicles.write") || session?.user.permissions.includes("vehicles.transfer")) && (
        <View style={{ flexDirection: "row", gap: 8 }}>
          {session?.user.permissions.includes("vehicles.write") && (
            <Button
              size="sm"
              equalWidth
              label="Thêm xe"
              icon={<Plus size={15} color={theme.primaryText} />}
              onPress={() => router.push({ pathname: "/vehicle-editor/[id]", params: { id: "new", store } })}
            />
          )}
          {session?.user.permissions.includes("vehicles.transfer") && (
            <Button
              size="sm"
              equalWidth
              secondary
              label="Chuyển xe"
              onPress={() => router.push({ pathname: "/fleet-inventory", params: { purpose: "transfer", store } })}
            />
          )}
        </View>
      )}
      {kind === "customers" && session?.user.permissions.includes("customers.write") && (
        <Button
          size="sm"
          label="Thêm khách hàng"
          icon={<Plus size={15} color={theme.primaryText} />}
          onPress={() => router.push("/customer/new")}
        />
      )}
      {/* Compact Horizontal Secondary Action Strip */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>
        {kind === "vehicles" && (
          <>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/fleet-inventory")}
              style={({ pressed }) => [styles.actionPill, { borderColor: theme.border, backgroundColor: theme.surface, opacity: pressed ? 0.72 : 1 }]}
            >
              <Text style={{ color: theme.text, fontSize: 12.5, fontWeight: "600" }}>Kho xe toàn hệ thống</Text>
            </Pressable>
            {session?.user.permissions.includes("vehicles.write") && (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push({ pathname: "/fleet-inventory", params: { purpose: "status", store } })}
                style={({ pressed }) => [styles.actionPill, { borderColor: theme.border, backgroundColor: theme.surface, opacity: pressed ? 0.72 : 1 }]}
              >
                <Text style={{ color: theme.text, fontSize: 12.5, fontWeight: "600" }}>Đổi trạng thái xe</Text>
              </Pressable>
            )}
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/vehicle-transfers")}
              style={({ pressed }) => [styles.actionPill, { borderColor: theme.border, backgroundColor: theme.surface, opacity: pressed ? 0.72 : 1 }]}
            >
              <Text style={{ color: theme.text, fontSize: 12.5, fontWeight: "600" }}>Lịch sử luân chuyển</Text>
            </Pressable>
          </>
        )}
        {kind === "contracts" && !operationsCatalogue && (scope === "due" || scope === "overdue") && (session?.user.permissions.includes("contracts.draft") || session?.user.permissions.includes("finance.write")) && (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: "/debt-reminders", params: { tab: "compose", store } })}
            style={({ pressed }) => [styles.actionPill, { borderColor: theme.primary, backgroundColor: theme.tint, opacity: pressed ? 0.72 : 1 }]}
          >
            <Text style={{ color: theme.primary, fontSize: 12.5, fontWeight: "700" }}>Gửi nhắc nợ hàng loạt</Text>
          </Pressable>
        )}
        {kind === "contracts" && !operationsCatalogue && !!backfillActions(session!.user.permissions).length && (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: "/backfill", params: { store_id: store } })}
            style={({ pressed }) => [styles.actionPill, { borderColor: theme.border, backgroundColor: theme.surface, opacity: pressed ? 0.72 : 1 }]}
          >
            <Text style={{ color: theme.text, fontSize: 12.5, fontWeight: "600" }}>Nhập bổ sung giao dịch</Text>
          </Pressable>
        )}
        {kind === "contracts" && !operationsCatalogue && !scope && session?.user.permissions.includes("contracts.read") && (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/contract-anomalies" as Href)}
            style={({ pressed }) => [styles.actionPill, { borderColor: theme.border, backgroundColor: theme.surface, opacity: pressed ? 0.72 : 1 }]}
          >
            <Text style={{ color: theme.text, fontSize: 12.5, fontWeight: "600" }}>Bất thường HĐ</Text>
          </Pressable>
        )}
        {!operationsCatalogue && (
          <Pressable
            accessibilityRole="button"
            disabled={!datesValid || query.isPending || query.isError || input.trim() !== search}
            onPress={() => router.push({ pathname: "/catalogue-export/[kind]", params: { kind, filters: exportFilters } })}
            style={({ pressed }) => [
              styles.actionPill,
              {
                borderColor: theme.border,
                backgroundColor: theme.surface,
                opacity: !datesValid || query.isPending || query.isError || input.trim() !== search ? 0.45 : pressed ? 0.72 : 1,
              },
            ]}
          >
            <Download size={13} color={theme.text} accessible={false} />
            <Text style={{ color: theme.text, fontSize: 12.5, fontWeight: "600" }}>Tải Excel theo bộ lọc</Text>
          </Pressable>
        )}
        {actions.length > 0 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Thao tác khác"
            accessibilityState={{ expanded: actionsOpen }}
            aria-expanded={actionsOpen}
            onPress={() => setActionsOpen((open) => !open)}
            style={({ pressed }) => [
              styles.actionPill,
              {
                borderColor: actionsOpen ? theme.primary : theme.border,
                backgroundColor: actionsOpen ? theme.tint : theme.surface,
                opacity: pressed ? 0.72 : 1,
              },
            ]}
          >
            <Text style={{ color: actionsOpen ? theme.primary : theme.text, fontSize: 12.5, fontWeight: "600" }}>
              Thao tác khác ({actions.length})
            </Text>
            <ChevronDown size={14} color={actionsOpen ? theme.primary : theme.muted} accessible={false} style={{ transform: [{ rotate: actionsOpen ? "180deg" : "0deg" }] }} />
          </Pressable>
        )}
      </ScrollView>
      {actionsOpen && actions.length > 0 && (
        <Card style={{ gap: 8, padding: 10 }}>
          {actions.map((action) => (
            <Button key={action.label} size="sm" secondary {...action} />
          ))}
        </Card>
      )}
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
              minHeight: 44,
              fontSize: 15,
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
                : catalogueAllLabel(kind, scope);
              const count = (() => {
                if (!value) return kind === 'contracts' ? statistics.data?.tabCount ?? (!status ? query.data?.pages[0]?.total : undefined) : query.data?.pages[0]?.tabCount ?? (!status ? query.data?.pages[0]?.total : undefined);
                if (statusCountsMap.size === 0 && !(kind === 'contracts' ? statistics.data : query.data)) return undefined;
                if (kind === "contracts" && value === "renting") {
                  return statistics.data?.tabCount === undefined ? undefined : activeRentalCount(statusCountsMap, statistics.data.tabCount);
                }
                if (kind === 'contracts' && value === 'overdue') return (statusCountsMap.get('overdue') || 0) + (statusCountsMap.get('bad_debt') || 0);
                if (kind === 'customers' && value === 'blacklist') return statusCountsMap.get('bad_debt') ?? statusCountsMap.get('blacklist') ?? 0;
                return statusCountsMap.get(value) ?? 0;
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

          {!!customerId && <Text style={{ color: theme.text, fontSize: 14 }}>Hợp đồng của khách: {customerName || `#${customerId}`}</Text>}
          {kind === 'contracts' && statistics.isError && <Button label="Tải lại số lượng theo trạng thái" secondary loading={statistics.isFetching} onPress={() => void statistics.refetch()} />}

          {kind === "contracts" && !scope && (statistics.data?.dueCount || 0) > 0 && (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: "/contracts-workspace/[scope]", params: { scope: "due" } })}
              style={[styles.scopeBanner, { backgroundColor: theme.warningBackground, borderColor: theme.warning }]}
            >
              <Text style={{ color: theme.warning, fontSize: 12.5, fontWeight: "700", flex: 1 }}>
                Có {statistics.data!.dueCount} hợp đồng thuê sở hữu đến hạn đóng tiền → Mở danh sách
              </Text>
            </Pressable>
          )}

          {/* Overdue Bucket Chips on Overdue tab/workspace */}
          {kind === "contracts" && (scope === "overdue" || status === "overdue") && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {[
                { key: "", label: "Tất cả mức trễ" },
                { key: "d1_3", label: "1–3 ngày" },
                { key: "d4_7", label: "4–7 ngày" },
                { key: "d8_15", label: "8–15 ngày" },
                { key: "d16_30", label: "16–30 ngày" },
                { key: "gt30", label: "> 30 ngày" },
              ].map((b) => {
                const active = (extraFilters.overdueBucket || "") === b.key;
                const bCount = b.key ? new Map(statistics.data?.overdueCounts || query.data?.pages[0]?.overdueCounts || []).get(b.key) : undefined;
                return (
                  <Pressable
                    key={b.key || "all_buckets"}
                    accessibilityRole="button"
                    onPress={() => setExtraFilters((cur) => ({ ...cur, overdueBucket: b.key || undefined }))}
                    style={[styles.chip, { backgroundColor: active ? theme.warning : theme.surface, borderColor: active ? theme.warning : theme.border }]}
                  >
                    <Text style={{ color: active ? "#FFFFFF" : theme.text, fontSize: 12, fontWeight: "700" }}>
                      {b.label}{bCount !== undefined ? ` (${bCount})` : ""}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          {/* Vehicle Missing Contract Filter Chip */}
          {kind === "vehicles" && ((query.data?.pages[0]?.missingOpenContractCount || 0) > 0 || extraFilters.missingContract === "1") && (
            <Pressable
              accessibilityRole="button"
              onPress={() => setExtraFilters((cur) => ({ ...cur, missingContract: cur.missingContract === "1" ? undefined : "1" }))}
              style={[styles.scopeBanner, { backgroundColor: extraFilters.missingContract === "1" ? theme.warning : theme.warningBackground, borderColor: theme.warning }]}
            >
              <Text style={{ color: extraFilters.missingContract === "1" ? "#FFFFFF" : theme.warning, fontSize: 12.5, fontWeight: "700", flex: 1 }}>
                {extraFilters.missingContract === "1"
                  ? "Đang lọc: Xe đang thuê nhưng thiếu hợp đồng mở (Chạm để bỏ lọc)"
                  : `Cảnh báo: ${query.data?.pages[0]?.missingOpenContractCount} xe đang thuê thiếu hợp đồng mở · Chạm để lọc`}
              </Text>
            </Pressable>
          )}

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
                accessibilityRole="button"
                accessibilityLabel="Xem tất cả hợp đồng"
                onPress={() => { setScope(""); setStatus(""); }}
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
      edges={showManagementMenu ? ["top", "left", "right"] : ["bottom", "left", "right"]}
      style={{ flex: 1, backgroundColor: theme.background }}
    >
      {kind === 'contracts' && !!initialScope && !operationsCatalogue && <Stack.Screen options={{ title: settings.title }} />}
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
        maintainVisibleContentPosition={Platform.OS !== 'web' && (query.data?.pages.length || 0) >= CATALOGUE_MAX_PAGES ? { minIndexForVisible: 1 } : undefined}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'web' ? 'none' : 'on-drag'}
        ItemSeparatorComponent={CatalogueSeparator}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching && !query.isFetchingNextPage}
            onRefresh={() => {
              void restore(true);
              void query.refetch();
              if (kind === 'contracts') void statistics.refetch();
              if (kind === 'vehicles') void cache.invalidateQueries({ queryKey: ['record-media', 'vehicle-thumbnail'] });
            }}
            tintColor={theme.primary}
          />
        }
        onEndReachedThreshold={0.4}
        onEndReached={() => fetchMore()}
        scrollEventThrottle={100}
        onScrollBeginDrag={() => { nextPageGesture.current = true; }}
        onScroll={checkListEnd}
        onScrollEndDrag={checkListEnd}
        onMomentumScrollEnd={checkListEnd}
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
          ) : null}{query.hasPreviousPage && <View style={{ gap: 10, paddingVertical: 12 }}>
            <Button label="Xem kết quả trước" secondary loading={query.isFetchingPreviousPage} disabled={query.isFetching && !query.isFetchingPreviousPage} onPress={() => { void query.fetchPreviousPage({ cancelRefetch: false }); }} />
            {query.isFetchPreviousPageError && <InlineError message="Chưa tải được kết quả trước. Các hồ sơ đang xem vẫn được giữ." />}
          </View>}</>
        }
        ListEmptyComponent={
          !datesValid ? <StateView title="Kiểm tra khoảng ngày" message="Chọn ngày kết thúc từ ngày bắt đầu trở đi." /> : query.isPending ? (
            <SkeletonList count={4} lines={3} />
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
          ) : records.length > 0 && query.hasNextPage ? (
            <View style={{ paddingVertical: 16 }}>
              <Button label="Tải thêm kết quả" secondary disabled={query.isFetching} onPress={() => fetchMore(false)} />
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
              Đã đến cuối kết quả
            </Text>
          ) : undefined
        }
      />
      {filtersOpen && (
        <CatalogueFilters
          kind={kind}
          scope={scope}
          selected={{ status, store, from, to, storeBasis, ...extraFilters }}
          defaultStore={defaultStore}
          stores={stores}
          allowAll={kind === "vehicles" || canReadAllStores}
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
            setExtraFilters({
              rentalType: selection.rentalType || undefined,
              ownershipTerm: selection.ownershipTerm || undefined,
              overdueBucket: selection.overdueBucket || undefined,
              sort: selection.sort || undefined,
              direction: selection.direction || undefined,
              vehicleType: selection.vehicleType || undefined,
              warehouseStore: selection.warehouseStore || undefined,
              beneficiaryStore: selection.beneficiaryStore || undefined,
              missingContract: selection.missingContract || undefined,
            });
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
        permissions={session?.user.permissions || []}
      />

      {/* Quick Store Picker Modal */}
      <Modal
        visible={storeModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setStoreModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setStoreModalOpen(false)}
          />
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
              {(kind === "vehicles" || canReadAllStores) && (
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
        </View>
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
    paddingHorizontal: 16,
    paddingBottom: 16,
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    flexGrow: 1,
  },
  title: { fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  contractMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  platePill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  actionPill: {
    minHeight: 34,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 9,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  search: {
    flexDirection: "row",
    flex: 1,
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 11,
    paddingLeft: 12,
  },
  iconButton: {
    minWidth: 40,
    minHeight: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  filterButton: {
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: 11,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 4,
  },
  chip: {
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 7,
    justifyContent: "center",
    borderRadius: 9,
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
