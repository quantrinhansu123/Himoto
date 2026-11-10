import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, router, useLocalSearchParams } from "expo-router";
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  ArrowLeftRight,
  Camera,
  Check,
  FilePenLine,
  Files,
  FileText,
  History,
  Info,
  RefreshCw,
  RotateCcw,
  Truck,
} from "lucide-react-native";
import type { MobileRecord } from "@himoto/mobile-contract";
import { VEHICLE_HISTORY_ACTIONS } from "../../../../shared/mobile-vehicles";
import { recordPreviewKey } from "@/lib/record-preview";
import { useSession } from "@/providers/session";
import { Button, Card, InlineError, StateView, StatusBadge } from "@/components/ui";
import { SectionTabs } from "@/components/section-tabs";
import { VehicleProfileCard } from "@/components/vehicle-profile-card";
import { FormField, ChoiceField } from "@/components/form-fields";
import { VehicleChanges } from "@/components/vehicle-changes";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { dateTime, useTheme } from "@/theme";

type VehicleTab = "details" | "history";

const TABS = [
  { id: "details" as VehicleTab, label: "Thông tin xe" },
  { id: "history" as VehicleTab, label: "Lịch sử xe" },
] as const;

function VehicleProfile({ id }: { id: string }) {
  const { api, session } = useSession();
  const theme = useTheme();
  const cache = useQueryClient();
  const [activeTab, setActiveTab] = useState<VehicleTab>("details");

  // History Tab states
  const [historyPage, setHistoryPage] = useState(1);
  const [historyAction, setHistoryAction] = useState("");
  const [historyInput, setHistoryInput] = useState("");
  const debouncedSearch = useDebouncedValue(historyInput);

  const valid = /^[1-9]\d{0,14}$/.test(id) && session!.user.permissions.includes("vehicles.read");

  // Main vehicle query
  const query = useQuery({
    queryKey: ["vehicle-profile", session!.user.id, id],
    queryFn: ({ signal }) => api!.vehicleProfile(id, signal),
    enabled: valid,
    staleTime: 30_000,
    gcTime: 120_000,
  });

  // Related contracts query (to surface open/renting contracts prominently like Web)
  const contractsQuery = useQuery({
    queryKey: ["vehicle-contracts-preview", session!.user.id, id],
    queryFn: ({ signal }) => api!.vehicleContracts(id, 1, signal),
    enabled: valid && session!.user.permissions.includes("contracts.read"),
    staleTime: 30_000,
  });

  // History query (only active when history tab is selected)
  const historyQuery = useQuery({
    queryKey: ["vehicle-history", session!.user.id, id, historyPage, historyAction, debouncedSearch],
    queryFn: ({ signal }) =>
      api!.vehicleHistory(
        id,
        new URLSearchParams({
          page: String(historyPage),
          action: historyAction,
          search: debouncedSearch,
        }).toString(),
        signal,
      ),
    enabled: valid && activeTab === "history",
    staleTime: 30_000,
  });

  if (!valid) return <StateView title="Không mở được xe" message="Bạn không có quyền truy cập hoặc ID xe không hợp lệ." />;

  if (query.isPending) return <StateView title="Đang tải hồ sơ xe" loading />;
  if (query.isError && !query.data) {
    return (
      <StateView
        title="Chưa tải được hồ sơ xe"
        message={query.error.message}
        retry={() => {
          void query.refetch();
        }}
      />
    );
  }

  const row = query.data!;
  const title = row.values.license || row.values.name || "Hồ sơ xe";

  // Filter open / relevant rentals
  const openRentals = (contractsQuery.data?.rows || []).filter((item) =>
    ["renting", "overdue", "wait_payment", "deposit_contract", "draft"].includes(item.status.toLowerCase()),
  );
  const primaryRental = openRentals[0];

  const handleRefresh = () => {
    void query.refetch();
    void contractsQuery.refetch();
    if (activeTab === "history") {
      void historyQuery.refetch();
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <Stack.Screen options={{ title }} />

      <View style={styles.tabBarWrapper}>
        <SectionTabs
          sections={TABS}
          active={activeTab}
          onChange={(tab) => setActiveTab(tab)}
        />
      </View>

      {activeTab === "details" ? (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching || contractsQuery.isRefetching}
              tintColor={theme.primary}
              onRefresh={handleRefresh}
            />
          }
        >
          {query.isError && (
            <InlineError message="Chưa cập nhật được xe. Thông tin đang hiển thị có thể đã thay đổi." />
          )}

          {/* In-Transit Alert Banner */}
          {(row.inTransit || row.values.status === "in_transit") && (
            <Card style={[styles.alertCard, { borderColor: theme.warning, backgroundColor: theme.warningBackground }]}>
              <View style={styles.alertHeader}>
                <Truck size={20} color={theme.warning} />
                <Text style={[styles.alertTitle, { color: theme.warning }]}>
                  Xe đang Chờ luân chuyển cơ sở
                </Text>
              </View>
              <Text style={{ color: theme.text, fontSize: 14, lineHeight: 21 }}>
                Xe đang trong lượt điều chuyển. Nhân viên cơ sở đích có thể kiểm tra và nhận xe vào kho.
              </Text>
              <View style={styles.actionRow}>
                <Button
                  label="Xác nhận nhận xe"
                  icon={<Check size={16} color={theme.primaryText} />}
                  onPress={() => router.push({ pathname: "/vehicle-transfer-editor/[id]", params: { id } })}
                />
              </View>
            </Card>
          )}

          {/* Active Contract Prominent Card (Chuẩn Web) */}
          {session!.user.permissions.includes("contracts.read") && primaryRental && (
            <Card style={[styles.activeContractCard, { borderColor: theme.primary, backgroundColor: theme.surface }]}>
              <View style={styles.activeContractHeader}>
                <View style={{ gap: 2, flex: 1 }}>
                  <Text style={{ color: theme.primary, fontSize: 12, fontWeight: "700", textTransform: "uppercase" }}>
                    Hợp đồng đang thực hiện
                  </Text>
                  <Text style={{ color: theme.text, fontSize: 18, fontWeight: "800" }}>
                    {primaryRental.code}
                  </Text>
                </View>
                <StatusBadge status={primaryRental.status} />
              </View>

              <View style={{ gap: 4 }}>
                <Text style={{ color: theme.text, fontSize: 15, fontWeight: "600" }}>
                  Khách thuê: {primaryRental.customer || "Chưa có tên khách"}
                </Text>
                {(primaryRental.startsAt || primaryRental.endsAt) && (
                  <Text style={{ color: theme.muted, fontSize: 13 }}>
                    Thời hạn: {primaryRental.startsAt ? dateTime(primaryRental.startsAt) : "—"} đến {primaryRental.endsAt ? dateTime(primaryRental.endsAt) : "—"}
                  </Text>
                )}
              </View>

              <Button
                label={`Mở hợp đồng ${primaryRental.code}`}
                icon={<FileText size={16} color={theme.primaryText} />}
                onPress={() =>
                  router.push({
                    pathname: "/record/[kind]/[id]",
                    params: { kind: "contracts", id: String(primaryRental.id) },
                  })
                }
              />
            </Card>
          )}

          {/* Grouped Technical Specifications */}
          <VehicleProfileCard profile={row} />

          {/* Counter Action Grid (Lưới tác vụ quầy 2 cột chuẩn Mobile & Web) */}
          <Card style={{ gap: 14, padding: 16 }}>
            <Text style={{ color: theme.text, fontSize: 16, fontWeight: "700" }}>
              Nghiệp vụ quầy & Điều hành
            </Text>

            <View style={styles.actionGrid}>
              {row.canEdit && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Sửa hồ sơ xe"
                  onPress={() => router.push({ pathname: "/vehicle-editor/[id]", params: { id } })}
                  style={({ pressed }) => [
                    styles.gridBtn,
                    { backgroundColor: theme.surface, borderColor: theme.primary },
                    pressed && { opacity: 0.75 },
                  ]}
                >
                  <FilePenLine size={22} color={theme.primary} />
                  <Text style={[styles.gridBtnText, { color: theme.primary, fontWeight: "700" }]}>
                    Sửa hồ sơ xe
                  </Text>
                </Pressable>
              )}

              {session!.user.permissions.includes("vehicles.write") && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Đổi trạng thái xe"
                  onPress={() => router.push({ pathname: "/vehicle-status-editor/[id]", params: { id } })}
                  style={({ pressed }) => [
                    styles.gridBtn,
                    { backgroundColor: theme.surface, borderColor: theme.border },
                    pressed && { opacity: 0.75 },
                  ]}
                >
                  <RefreshCw size={22} color={theme.text} />
                  <Text style={[styles.gridBtnText, { color: theme.text }]}>
                    Đổi trạng thái
                  </Text>
                </Pressable>
              )}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Điều chuyển xe"
                onPress={() => router.push({ pathname: "/vehicle-transfer-editor/[id]", params: { id } })}
                style={({ pressed }) => [
                  styles.gridBtn,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                  pressed && { opacity: 0.75 },
                ]}
              >
                <ArrowLeftRight size={22} color={theme.text} />
                <Text style={[styles.gridBtnText, { color: theme.text }]}>
                  Điều chuyển xe
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Giấy tờ xe & Cà vẹt"
                onPress={() =>
                  router.push({
                    pathname: "/record-media/[entity]/[id]",
                    params: { entity: "vehicles", id, kind: "vehicle", referenceId: id },
                  })
                }
                style={({ pressed }) => [
                  styles.gridBtn,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                  pressed && { opacity: 0.75 },
                ]}
              >
                <FileText size={22} color={theme.text} />
                <Text style={[styles.gridBtnText, { color: theme.text }]}>
                  Giấy tờ xe
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Ảnh nghiệp vụ"
                onPress={() =>
                  router.push({
                    pathname: "/record-media/[entity]/[id]",
                    params: { entity: "vehicles", id },
                  })
                }
                style={({ pressed }) => [
                  styles.gridBtn,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                  pressed && { opacity: 0.75 },
                ]}
              >
                <Camera size={22} color={theme.text} />
                <Text style={[styles.gridBtnText, { color: theme.text }]}>
                  Ảnh nghiệp vụ
                </Text>
              </Pressable>

              {session!.user.permissions.includes("contracts.read") && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Tất cả hợp đồng của xe"
                  onPress={() => router.push({ pathname: "/vehicle-contracts/[id]", params: { id } })}
                  style={({ pressed }) => [
                    styles.gridBtn,
                    { backgroundColor: theme.surface, borderColor: theme.border },
                    pressed && { opacity: 0.75 },
                  ]}
                >
                  <Files size={22} color={theme.text} />
                  <Text style={[styles.gridBtnText, { color: theme.text }]}>
                    Hợp đồng xe ({contractsQuery.data?.total || 0})
                  </Text>
                </Pressable>
              )}
            </View>
          </Card>
        </ScrollView>
      ) : (
        <FlatList
          data={historyQuery.data?.rows || []}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={historyQuery.isRefetching}
              tintColor={theme.primary}
              onRefresh={handleRefresh}
            />
          }
          ListHeaderComponent={
            <View style={{ gap: 12, marginBottom: 6 }}>
              <FormField
                label="Tìm trong lịch sử xe"
                value={historyInput}
                onChangeText={(val) => {
                  setHistoryInput(val);
                  setHistoryPage(1);
                }}
                maxLength={120}
              />
              <ChoiceField
                label="Lọc theo hành động"
                value={historyAction}
                choices={[{ value: "", label: "Tất cả hành động" }, ...VEHICLE_HISTORY_ACTIONS]}
                onChange={(val) => {
                  setHistoryAction(val);
                  setHistoryPage(1);
                }}
              />
              {historyQuery.data && (
                <Text style={{ color: theme.muted, fontSize: 13, paddingHorizontal: 2 }}>
                  Tổng cộng: {historyQuery.data.total} sự kiện · {historyQuery.data.sourceLimit}
                </Text>
              )}
              {historyQuery.isError && <InlineError message={historyQuery.error.message} />}
            </View>
          }
          renderItem={({ item }) => (
            <Card style={{ gap: 10, padding: 16 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 17, fontWeight: "700" }}>
                  {item.label}
                </Text>
                <Text style={{ color: theme.muted, fontSize: 12 }}>
                  {item.at ? dateTime(item.at) : "—"}
                </Text>
              </View>

              <Text style={{ color: theme.muted, fontSize: 13 }}>
                Thực hiện bởi: <Text style={{ color: theme.text, fontWeight: "600" }}>{item.actor || "Hệ thống"}</Text>
              </Text>

              {!!(item.responsible_store || item.beneficiary_store) && (
                <Text style={{ color: theme.primary, fontSize: 13, fontWeight: "600" }}>
                  {item.responsible_store || "Cơ sở đi"} → {item.beneficiary_store || "Cơ sở đến"}
                </Text>
              )}

              {!!item.location && (
                <Text style={{ color: theme.text, fontSize: 13 }}>Vị trí: {item.location}</Text>
              )}

              {!!item.note && (
                <Text selectable style={{ color: theme.text, fontSize: 14, lineHeight: 21 }}>
                  {item.note}
                </Text>
              )}

              <VehicleChanges changes={item.changes} />

              {item.telegram_event_id && (
                <Button
                  secondary
                  label={`Xem Telegram điều chuyển #${item.telegram_event_id}`}
                  onPress={() =>
                    router.push({
                      pathname: "/transfer-telegram/[id]/[eventId]",
                      params: { id, eventId: String(item.telegram_event_id) },
                    })
                  }
                />
              )}

              {!!item.order_id && session!.user.permissions.includes("contracts.read") && (
                <Button
                  secondary
                  label={`Mở hợp đồng #${item.order_id}`}
                  onPress={() =>
                    router.push({
                      pathname: "/record/[kind]/[id]",
                      params: { kind: "contracts", id: String(item.order_id) },
                    })
                  }
                />
              )}
            </Card>
          )}
          ListEmptyComponent={
            historyQuery.isPending ? (
              <StateView title="Đang tải lịch sử xe..." loading />
            ) : historyQuery.isError ? (
              <StateView
                title="Chưa tải được lịch sử"
                retry={() => {
                  void historyQuery.refetch();
                }}
              />
            ) : (
              <StateView title="Chưa có sự kiện phù hợp" />
            )
          }
          ListFooterComponent={
            historyQuery.data && historyQuery.data.pages > 1 ? (
              <View style={{ gap: 10, paddingVertical: 14 }}>
                <Text style={{ color: theme.muted, textAlign: "center", fontSize: 13 }}>
                  Trang {historyQuery.data.page} / {historyQuery.data.pages}
                </Text>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Button
                      secondary
                      label="Trang trước"
                      disabled={historyQuery.data.page <= 1}
                      onPress={() => setHistoryPage((p) => Math.max(1, p - 1))}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      secondary
                      label="Trang sau"
                      disabled={historyQuery.data.page >= historyQuery.data.pages}
                      onPress={() => setHistoryPage((p) => p + 1)}
                    />
                  </View>
                </View>
              </View>
            ) : undefined
          }
        />
      )}
    </View>
  );
}

export default function VehicleProfileRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, session } = useSession();

  if (!api || !session) return <StateView title="Đăng nhập để xem xe" />;

  return (
    <VehicleProfile
      key={`${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(",")}:${id}`}
      id={id}
    />
  );
}

const styles = StyleSheet.create({
  tabBarWrapper: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    maxWidth: 760,
    width: "100%",
    alignSelf: "center",
  },
  scrollContent: {
    padding: 16,
    gap: 16,
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
  },
  alertCard: {
    gap: 10,
    padding: 16,
    borderWidth: 1.5,
  },
  alertHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  alertTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  actionRow: {
    marginTop: 4,
  },
  activeContractCard: {
    gap: 12,
    padding: 18,
    borderWidth: 2,
    borderRadius: 16,
  },
  activeContractHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  gridBtn: {
    width: "48%",
    flexGrow: 1,
    minHeight: 82,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  gridBtnText: {
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
});
