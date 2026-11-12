import { useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  AlarmClock,
  BatteryCharging,
  Bell,
  CalendarPlus,
  CarFront,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  FilePenLine,
  FilePlus2,
  Files,
  History,
  MapPin,
  Menu,
  ReceiptText,
  RotateCcw,
  Search,
  UsersRound,
  Wallet,
  X,
} from "lucide-react-native";
import type { CatalogueKind } from "@himoto/mobile-contract";
import { Brand, Button, Card, InlineError } from "@/components/ui";
import { useSession } from "@/providers/session";
import { useWorkspace } from "@/hooks/use-workspace";
import { useTheme, roles } from "@/theme";
import { WorkspaceLinks } from "@/components/workspace-links";
import { ManagementDrawer } from "@/components/management-drawer";

const modules = [
  {
    kind: "vehicles" as CatalogueKind,
    title: "Danh sách xe",
    description: "Biển số, tình trạng và cơ sở",
    icon: CarFront,
    href: "/(tabs)/vehicles" as const,
  },
  {
    kind: "contracts" as CatalogueKind,
    title: "Danh sách hợp đồng",
    description: "Khách thuê, thời hạn và số tiền",
    icon: Files,
    href: "/(tabs)/contracts" as const,
  },
  {
    kind: "customers" as CatalogueKind,
    title: "Khách hàng",
    description: "Hồ sơ và thông tin liên hệ",
    icon: UsersRound,
    href: "/(tabs)/customers" as const,
  },
];

export default function Overview() {
  const theme = useTheme();
  const { session, api, restore } = useSession();
  const workspace = useWorkspace();
  const [plate, setPlate] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [storeModalOpen, setStoreModalOpen] = useState(false);

  const initialStore = session?.user.allStores
    ? "all"
    : session?.user.storeId
    ? String(session.user.storeId)
    : "all";
  const [selectedStore, setSelectedStore] = useState(initialStore);

  const available = modules.filter((item) =>
    session?.user.permissions.includes(`${item.kind}.read`),
  );

  const storeScope = (kind: CatalogueKind) => {
    if (kind === "vehicles") return selectedStore;
    return selectedStore;
  };

  const queries = useQueries({
    queries: available.map((item) => ({
      queryKey: [
        "overview",
        session?.user.id,
        selectedStore,
        item.kind,
      ],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        api!.catalogue(
          item.kind,
          `size=1&store=${storeScope(item.kind)}`,
          signal,
        ),
      enabled: !!api,
      staleTime: 60_000,
      gcTime: 300_000,
    })),
  });

  const operationsParams = useMemo(() => {
    const params = new URLSearchParams();
    if (selectedStore && selectedStore !== "all") {
      params.set("store_id", selectedStore);
    }
    return params;
  }, [selectedStore]);

  const operationsQuery = useQuery({
    queryKey: [
      "operations-overview",
      session?.user.id,
      operationsParams.toString(),
    ],
    queryFn: ({ signal }) => api!.operations(operationsParams, signal),
    enabled: !!api && session?.user.permissions.includes("contracts.read"),
    staleTime: 30_000,
    gcTime: 120_000,
  });

  const refresh = () => {
    void restore(true);
    void workspace.refetch();
    void operationsQuery.refetch();
    queries.forEach((query) => {
      void query.refetch();
    });
  };

  const currentStoreLabel = useMemo(() => {
    if (selectedStore === "all") return "Toàn bộ cơ sở";
    return (
      workspace.data?.stores.find((item) => String(item.id) === selectedStore)
        ?.name || "Cơ sở được phân công"
    );
  }, [selectedStore, workspace.data?.stores]);

  const handleQuickReturn = () => {
    const query = plate.trim();
    if (!query) return;
    Keyboard.dismiss();
    router.push({
      pathname: "/operation-contracts/[action]",
      params: { action: "return", query, store: selectedStore },
    });
  };

  const grants = session?.user.permissions || [];
  const canSwitchStore = session?.user.allStores || (workspace.data?.stores && workspace.data.stores.length > 1);

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={{ flex: 1, backgroundColor: theme.background }}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={
              queries.some((query) => query.isRefetching) ||
              workspace.isRefetching ||
              operationsQuery.isRefetching
            }
            onRefresh={refresh}
            tintColor={theme.primary}
          />
        }
      >
        {/* Top App Bar with Hamburger Drawer Trigger */}
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mở danh mục quản lý"
            onPress={() => setDrawerOpen(true)}
            style={({ pressed }) => [
              styles.iconButton,
              {
                borderColor: theme.border,
                backgroundColor: theme.surface,
                opacity: pressed ? 0.65 : 1,
              },
            ]}
          >
            <Menu size={22} color={theme.text} accessible={false} />
          </Pressable>

          <Brand small />

          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Mở thông báo công việc"
              onPress={() => router.push("/notifications")}
              style={({ pressed }) => [
                styles.iconButton,
                {
                  borderColor: theme.border,
                  backgroundColor: theme.surface,
                  opacity: pressed ? 0.65 : 1,
                },
              ]}
            >
              <Bell size={20} color={theme.text} accessible={false} />
            </Pressable>
          </View>
        </View>

        {/* User & Store Banner */}
        <View style={styles.headerBlock}>
          <View style={{ gap: 2 }}>
            <Text
              accessibilityRole="header"
              style={[styles.pageTitle, { color: theme.text }]}
            >
              Thao tác nhanh
            </Text>
            <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 18 }}>
              Làm hợp đồng và xử lý xe tại quầy.
            </Text>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ color: theme.text, fontSize: 15, fontWeight: "700" }}>
              {session?.user.name}
            </Text>
            <Text style={{ color: theme.muted, fontSize: 13 }}>·</Text>
            <Text style={{ color: theme.muted, fontSize: 13 }}>
              {roles[session?.user.role || ""] || "Nhân viên"}
            </Text>
          </View>
        </View>

        {/* Branch Pin & Quick Switcher Card */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Chọn cơ sở làm việc"
          disabled={!canSwitchStore}
          onPress={() => setStoreModalOpen(true)}
          style={({ pressed }) => [
            styles.storePill,
            {
              borderColor: theme.border,
              backgroundColor: theme.surface,
              opacity: pressed && canSwitchStore ? 0.75 : 1,
            },
          ]}
        >
          <MapPin size={18} color={theme.primary} accessible={false} />
          <View style={{ flex: 1, gap: 1 }}>
            <Text style={{ color: theme.muted, fontSize: 11, fontWeight: "600" }}>
              CƠ SỞ VẬN HÀNH
            </Text>
            <Text
              numberOfLines={1}
              style={{
                color: theme.text,
                fontWeight: "700",
                fontSize: 14,
              }}
            >
              {currentStoreLabel}
            </Text>
          </View>
          {canSwitchStore && (
            <ChevronDown size={18} color={theme.muted} accessible={false} />
          )}
        </Pressable>

        {/* 6 Quick Action Cards chuẩn Web OperationsPage */}
        <View style={{ gap: 12 }}>
          <Text
            accessibilityRole="header"
            style={{ color: theme.text, fontSize: 17, fontWeight: "700" }}
          >
            Nghiệp vụ quầy
          </Text>
          <View style={styles.grid}>
            {/* 1. Thuê pin / sạc */}
            {grants.includes("contracts.read") && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Hợp đồng thuê pin và sạc"
                onPress={() => router.push("/battery-contracts")}
                style={({ pressed }) => [
                  styles.gridItem,
                  {
                    borderColor: theme.border,
                    backgroundColor: theme.surface,
                    opacity: pressed ? 0.72 : 1,
                  },
                ]}
              >
                <View
                  style={[styles.gridIcon, { backgroundColor: "#CCFBF1" }]}
                >
                  <BatteryCharging size={22} color="#0D9488" />
                </View>
                <Text style={[styles.gridTitle, { color: theme.text }]}>
                  Thuê pin / sạc
                </Text>
                <Text style={[styles.gridDesc, { color: theme.muted }]}>
                  Quản lý hợp đồng pin & sạc
                </Text>
              </Pressable>
            )}

            {/* 2. Làm hợp đồng */}
            {grants.includes("contracts.draft") && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Làm hợp đồng mới"
                onPress={() => router.push("/draft/new")}
                style={({ pressed }) => [
                  styles.gridItem,
                  {
                    borderColor: theme.border,
                    backgroundColor: theme.surface,
                    opacity: pressed ? 0.72 : 1,
                  },
                ]}
              >
                <View
                  style={[styles.gridIcon, { backgroundColor: theme.tint }]}
                >
                  <FilePlus2 size={22} color={theme.primary} />
                </View>
                <Text style={[styles.gridTitle, { color: theme.text }]}>
                  Làm hợp đồng
                </Text>
                <Text style={[styles.gridDesc, { color: theme.muted }]}>
                  Chọn khách, xe & ghi nhận tiền
                </Text>
              </Pressable>
            )}

            {/* 3. Trả xe */}
            {grants.includes("contracts.return") && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Nhận trả xe"
                onPress={() =>
                  router.push({
                    pathname: "/operation-contracts/[action]",
                    params: { action: "return", store: selectedStore },
                  })
                }
                style={({ pressed }) => [
                  styles.gridItem,
                  {
                    borderColor: theme.border,
                    backgroundColor: theme.surface,
                    opacity: pressed ? 0.72 : 1,
                  },
                ]}
              >
                <View
                  style={[styles.gridIcon, { backgroundColor: "#EEF2FF" }]}
                >
                  <RotateCcw size={22} color="#4F46E5" />
                </View>
                <Text style={[styles.gridTitle, { color: theme.text }]}>
                  Trả xe
                </Text>
                <Text style={[styles.gridDesc, { color: theme.muted }]}>
                  Tìm biển số hoặc HĐ nhận trả
                </Text>
              </Pressable>
            )}

            {/* 4. Gia hạn */}
            {grants.includes("contracts.renew") && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Gia hạn hợp đồng"
                onPress={() =>
                  router.push({
                    pathname: "/operation-contracts/[action]",
                    params: { action: "renew", store: selectedStore },
                  })
                }
                style={({ pressed }) => [
                  styles.gridItem,
                  {
                    borderColor: theme.border,
                    backgroundColor: theme.surface,
                    opacity: pressed ? 0.72 : 1,
                  },
                ]}
              >
                <View
                  style={[styles.gridIcon, { backgroundColor: "#ECFDF5" }]}
                >
                  <CalendarPlus size={22} color="#059669" />
                </View>
                <Text style={[styles.gridTitle, { color: theme.text }]}>
                  Gia hạn
                </Text>
                <Text style={[styles.gridDesc, { color: theme.muted }]}>
                  Cập nhật ngày hẹn trả xe
                </Text>
              </Pressable>
            )}

            {/* 5. Trạng thái kho xe */}
            {grants.includes("vehicles.read") && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Trạng thái kho xe"
                onPress={() => router.push("/(tabs)/vehicles")}
                style={({ pressed }) => [
                  styles.gridItem,
                  {
                    borderColor: theme.border,
                    backgroundColor: theme.surface,
                    opacity: pressed ? 0.72 : 1,
                  },
                ]}
              >
                <View
                  style={[styles.gridIcon, { backgroundColor: "#F0FDF4" }]}
                >
                  <CarFront size={22} color="#16A34A" />
                </View>
                <Text style={[styles.gridTitle, { color: theme.text }]}>
                  Trạng thái kho xe
                </Text>
                <Text style={[styles.gridDesc, { color: theme.muted }]}>
                  Kiểm tra & đổi trạng thái xe
                </Text>
              </Pressable>
            )}

            {/* 6. Nhập bổ sung */}
            {grants.includes("contracts.draft") && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Nhập bổ sung hợp đồng"
                onPress={() => router.push("/backfill-contract")}
                style={({ pressed }) => [
                  styles.gridItem,
                  {
                    borderColor: theme.border,
                    backgroundColor: theme.surface,
                    opacity: pressed ? 0.72 : 1,
                  },
                ]}
              >
                <View
                  style={[styles.gridIcon, { backgroundColor: "#F5F3FF" }]}
                >
                  <History size={22} color="#7C3AED" />
                </View>
                <Text style={[styles.gridTitle, { color: theme.text }]}>
                  Nhập bổ sung
                </Text>
                <Text style={[styles.gridDesc, { color: theme.muted }]}>
                  Bổ sung HĐ, gia hạn, thu chi
                </Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Khung Nhận trả xe nhanh theo biển số / SĐT (Chuẩn Web) */}
        {grants.includes("contracts.return") && (
          <Card style={{ gap: 12, padding: 16 }}>
            <View style={{ gap: 4 }}>
              <Text
                style={{ color: theme.text, fontSize: 16, fontWeight: "700" }}
              >
                Nhận trả xe nhanh theo biển số / SĐT
              </Text>
              <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 18 }}>
                Tìm hợp đồng đang thuê để trả xe ngay
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View
                style={[
                  styles.searchBox,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.controlBorder,
                  },
                ]}
              >
                <Search size={18} color={theme.muted} />
                <TextInput
                  value={plate}
                  onChangeText={setPlate}
                  placeholder="VD: 34C1-358.49 hoặc 09..."
                  placeholderTextColor={theme.muted}
                  returnKeyType="search"
                  onSubmitEditing={handleQuickReturn}
                  style={{
                    flex: 1,
                    color: theme.text,
                    fontSize: 15,
                    paddingVertical: 8,
                  }}
                />
                {!!plate && (
                  <Pressable onPress={() => setPlate("")} hitSlop={8}>
                    <X size={18} color={theme.muted} />
                  </Pressable>
                )}
              </View>
              <Button
                label="Trả xe"
                disabled={!plate.trim()}
                onPress={handleQuickReturn}
              />
            </View>
          </Card>
        )}

        {/* Khối Thống kê vận hành trực tiếp chuẩn Web OperationsPage */}
        {grants.includes("contracts.read") && (
          <View style={{ gap: 12 }}>
            <Text
              accessibilityRole="header"
              style={{ color: theme.text, fontSize: 17, fontWeight: "700" }}
            >
              Theo dõi vận hành
            </Text>
            <View style={{ gap: 8 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Xem hợp đồng đang thuê"
                onPress={() =>
                  router.push({
                    pathname: "/operation-contracts/[action]",
                    params: { action: "active", store: selectedStore },
                  })
                }
                style={({ pressed }) => [
                  styles.statCard,
                  {
                    borderColor: theme.border,
                    backgroundColor: theme.surface,
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}
              >
                <Text style={[styles.statNumber, { color: theme.primary }]}>
                  {operationsQuery.data
                    ? operationsQuery.data.active.toLocaleString("vi-VN")
                    : "—"}
                </Text>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.statLabel, { color: theme.text }]}>
                    Hợp đồng đang thuê
                  </Text>
                  <Text style={{ color: theme.muted, fontSize: 13 }}>
                    Đang lưu thông và cần theo dõi
                  </Text>
                </View>
                <ChevronRight size={18} color={theme.muted} />
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Xem hợp đồng quá hạn"
                onPress={() =>
                  router.push({
                    pathname: "/operation-contracts/[action]",
                    params: { action: "overdue", store: selectedStore },
                  })
                }
                style={({ pressed }) => [
                  styles.statCard,
                  {
                    borderColor: theme.border,
                    backgroundColor: theme.surface,
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}
              >
                <Text style={[styles.statNumber, { color: theme.danger }]}>
                  {operationsQuery.data
                    ? operationsQuery.data.overdue.toLocaleString("vi-VN")
                    : "—"}
                </Text>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.statLabel, { color: theme.text }]}>
                    Hợp đồng quá hạn
                  </Text>
                  <Text style={{ color: theme.muted, fontSize: 13 }}>
                    Chưa trả xe hoặc trễ thanh toán
                  </Text>
                </View>
                <ChevronRight size={18} color={theme.muted} />
              </Pressable>

              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Tiếp tục hợp đồng nháp"
                  onPress={() =>
                    router.push({
                      pathname: "/contracts-workspace/[scope]",
                      params: { scope: "drafts", store: selectedStore },
                    })
                  }
                  style={({ pressed }) => [
                    styles.miniCard,
                    {
                      borderColor: theme.border,
                      backgroundColor: theme.surface,
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}
                >
                  <FilePenLine size={18} color={theme.primary} />
                  <Text
                    style={{
                      color: theme.text,
                      fontSize: 14,
                      fontWeight: "600",
                    }}
                  >
                    Hợp đồng nháp
                  </Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Xem khoản đến hạn đóng tiền"
                  onPress={() =>
                    router.push({
                      pathname: "/contracts-workspace/[scope]",
                      params: { scope: "due", store: selectedStore },
                    })
                  }
                  style={({ pressed }) => [
                    styles.miniCard,
                    {
                      borderColor: theme.border,
                      backgroundColor: theme.surface,
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}
                >
                  <Clock3 size={18} color="#D97706" />
                  <Text
                    style={{
                      color: theme.text,
                      fontSize: 14,
                      fontWeight: "600",
                    }}
                  >
                    Đến hạn đóng tiền
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}

        {/* Tiện ích ca trực (Chấm công, Báo cáo ca, Sổ quỹ, Định vị GPS) */}
        <View style={{ gap: 12 }}>
          <Text
            accessibilityRole="header"
            style={{ color: theme.text, fontSize: 17, fontWeight: "700" }}
          >
            Tiện ích ca trực
          </Text>
          <View style={styles.grid}>
            {/* Chấm công */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Chấm công vào ra ca"
              onPress={() => router.push("/attendance")}
              style={({ pressed }) => [
                styles.gridItem,
                {
                  borderColor: theme.border,
                  backgroundColor: theme.surface,
                  opacity: pressed ? 0.72 : 1,
                },
              ]}
            >
              <View
                style={[styles.gridIcon, { backgroundColor: "#FEF2F2" }]}
              >
                <AlarmClock size={22} color="#DC2626" />
              </View>
              <Text style={[styles.gridTitle, { color: theme.text }]}>
                Chấm công
              </Text>
              <Text style={[styles.gridDesc, { color: theme.muted }]}>
                Vào ca, ra ca & GPS
              </Text>
            </Pressable>

            {/* Báo cáo cuối ca */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Báo cáo cuối ca"
              onPress={() => router.push("/shift-reports")}
              style={({ pressed }) => [
                styles.gridItem,
                {
                  borderColor: theme.border,
                  backgroundColor: theme.surface,
                  opacity: pressed ? 0.72 : 1,
                },
              ]}
            >
              <View
                style={[styles.gridIcon, { backgroundColor: "#EFF6FF" }]}
              >
                <ReceiptText size={22} color="#2563EB" />
              </View>
              <Text style={[styles.gridTitle, { color: theme.text }]}>
                Báo cáo cuối ca
              </Text>
              <Text style={[styles.gridDesc, { color: theme.muted }]}>
                Bàn giao ca & nộp tiền
              </Text>
            </Pressable>

            {/* Sổ quỹ / Sổ két */}
            {grants.includes("finance.read") && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Sổ quỹ và sổ két"
                onPress={() => router.push("/cashbook")}
                style={({ pressed }) => [
                  styles.gridItem,
                  {
                    borderColor: theme.border,
                    backgroundColor: theme.surface,
                    opacity: pressed ? 0.72 : 1,
                  },
                ]}
              >
                <View
                  style={[styles.gridIcon, { backgroundColor: "#FDF4FF" }]}
                >
                  <Wallet size={22} color="#9333EA" />
                </View>
                <Text style={[styles.gridTitle, { color: theme.text }]}>
                  Sổ quỹ / Sổ két
                </Text>
                <Text style={[styles.gridDesc, { color: theme.muted }]}>
                  Tiền mặt két & tài khoản
                </Text>
              </Pressable>
            )}

            {/* Định vị GPS */}
            {grants.includes("vehicles.read") && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Định vị GPS"
                onPress={() => router.push("/gps")}
                style={({ pressed }) => [
                  styles.gridItem,
                  {
                    borderColor: theme.border,
                    backgroundColor: theme.surface,
                    opacity: pressed ? 0.72 : 1,
                  },
                ]}
              >
                <View
                  style={[styles.gridIcon, { backgroundColor: "#F0F9FF" }]}
                >
                  <MapPin size={22} color="#0284C7" />
                </View>
                <Text style={[styles.gridTitle, { color: theme.text }]}>
                  Định vị GPS
                </Text>
                <Text style={[styles.gridDesc, { color: theme.muted }]}>
                  Bản đồ giám sát xe
                </Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Khối Danh mục quản lý (Đội xe, Hợp đồng, Khách hàng) */}
        <View style={{ gap: 12 }}>
          <Text
            accessibilityRole="header"
            style={{ color: theme.text, fontSize: 17, fontWeight: "700" }}
          >
            Danh mục quản lý
          </Text>
          <View style={{ gap: 10 }}>
            {available.map((item, index) => {
              const Icon = item.icon;
              const query = queries[index];
              return (
                <Pressable
                  key={item.kind}
                  accessibilityRole="button"
                  accessibilityLabel={`Mở ${item.title}`}
                  onPress={() => router.push(item.href)}
                  style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}
                >
                  <Card style={{ padding: 16 }}>
                    <View style={styles.row}>
                      <View
                        style={[styles.icon, { backgroundColor: theme.tint }]}
                      >
                        <Icon
                          size={22}
                          color={theme.primary}
                          accessible={false}
                        />
                      </View>
                      <View style={{ gap: 4, flex: 1 }}>
                        <Text
                          style={{
                            color: theme.text,
                            fontSize: 16,
                            fontWeight: "700",
                          }}
                        >
                          {item.title}
                        </Text>
                        <Text
                          style={{
                            color: theme.muted,
                            fontSize: 13,
                            lineHeight: 18,
                          }}
                        >
                          {item.description}
                        </Text>
                      </View>
                      {query.isPending ? (
                        <ActivityIndicator
                          color={theme.primary}
                          accessibilityLabel={`Đang tải ${item.title}`}
                        />
                      ) : (
                        <Text
                          style={{
                            color: theme.text,
                            fontSize: 22,
                            fontWeight: "800",
                          }}
                        >
                          {query.data
                            ? query.data.total.toLocaleString("vi-VN")
                            : "—"}
                        </Text>
                      )}
                      <ChevronRight
                        size={18}
                        color={theme.muted}
                        accessible={false}
                      />
                    </View>
                  </Card>
                </Pressable>
              );
            })}
          </View>
        </View>

        {(queries.some((query) => query.isError) ||
          workspace.isError ||
          operationsQuery.isError) && (
          <InlineError message="Một số dữ liệu chưa tải được. Kéo xuống để thử lại." />
        )}

        {/* Các liên kết hồ sơ mở rộng */}
        <WorkspaceLinks />

        <Text
          style={{
            color: theme.muted,
            fontSize: 12,
            textAlign: "center",
            lineHeight: 18,
            paddingVertical: 10,
          }}
        >
          Kéo xuống để cập nhật dữ liệu.
        </Text>
      </ScrollView>

      {/* Global Management Drawer */}
      <ManagementDrawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
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
                Chọn cơ sở làm việc
              </Text>
              <Pressable
                onPress={() => setStoreModalOpen(false)}
                hitSlop={8}
              >
                <X size={20} color={theme.muted} />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 360 }}>
              {session?.user.allStores && (
                <Pressable
                  onPress={() => {
                    setSelectedStore("all");
                    setStoreModalOpen(false);
                  }}
                  style={[
                    styles.storeOption,
                    {
                      backgroundColor:
                        selectedStore === "all"
                          ? theme.tint
                          : "transparent",
                      borderBottomColor: theme.border,
                    },
                  ]}
                >
                  <Text
                    style={{
                      flex: 1,
                      color:
                        selectedStore === "all"
                          ? theme.primary
                          : theme.text,
                      fontWeight:
                        selectedStore === "all" ? "700" : "500",
                      fontSize: 15,
                    }}
                  >
                    Toàn bộ cơ sở
                  </Text>
                  {selectedStore === "all" && (
                    <Check size={18} color={theme.primary} />
                  )}
                </Pressable>
              )}

              {workspace.data?.stores.map((st) => {
                const isSelected = selectedStore === String(st.id);
                return (
                  <Pressable
                    key={st.id}
                    onPress={() => {
                      setSelectedStore(String(st.id));
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
  container: {
    padding: 16,
    gap: 16,
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  iconButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
  },
  headerBlock: {
    gap: 6,
  },
  pageTitle: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  storePill: {
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  icon: { padding: 10, borderRadius: 10 },
  searchBox: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 46,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  gridItem: {
    width: "48.5%",
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 6,
  },
  gridIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  gridTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  gridDesc: {
    fontSize: 12,
    lineHeight: 16,
  },
  statCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: "800",
    minWidth: 44,
    textAlign: "center",
  },
  statLabel: {
    fontSize: 15,
    fontWeight: "700",
  },
  miniCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    justifyContent: "center",
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