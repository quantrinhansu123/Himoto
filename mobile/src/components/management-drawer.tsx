import React, { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { usePathname, useRouter, type Href } from "expo-router";
import {
  AlarmClock,
  AlertTriangle,
  BatteryCharging,
  Bell,
  BookOpen,
  Building2,
  CalendarDays,
  CarFront,
  ChevronDown,
  FilePenLine,
  Files,
  History,
  House,
  KeyRound,
  LayoutDashboard,
  LogOut,
  MapPin,
  MessageCircle,
  ReceiptText,
  Settings,
  UsersRound,
  Wallet,
  X,
} from "lucide-react-native";
import { useSession } from "@/providers/session";
import { useWorkspace } from "@/hooks/use-workspace";
import { roles, useTheme } from "@/theme";
import { canManageAccounts } from "../../../shared/mobile-managed-accounts";
import { isAdminAccount } from "../../../shared/access-permissions";
import { Brand } from "./ui";

interface DrawerItem {
  id: string;
  label: string;
  route: Href & string;
  icon: React.ComponentType<{ size: number; color: string }>;
  permission?: string | null;
}

interface DrawerSection {
  title: string;
  items: DrawerItem[];
}

export function ManagementDrawer({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const theme = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const { session, logout } = useSession();
  const workspace = useWorkspace();
  const { width } = useWindowDimensions();
  const drawerWidth = Math.min(width * 0.84, 328);

  const permissions = session?.user.permissions || [];

  const currentStore = useMemo(() => {
    if (session?.user.allStores) return "Toàn bộ cơ sở";
    const homeName =
      workspace.data?.stores.find((s) => s.id === session?.user.storeId)?.name ||
      "Cơ sở được phân công";
    return session?.user.allStoresRead
      ? `${homeName} · Xem toàn hệ thống`
      : homeName;
  }, [session, workspace.data?.stores]);

  // Exact Web ManagementShell.tsx section structure so staff transition seamlessly.
  const sections: DrawerSection[] = useMemo(
    () => [
      {
        title: "TỔNG QUAN & CHẤM CÔNG",
        items: [
          { id: "operations", label: "Thao tác nhanh", route: "/(tabs)", icon: House, permission: null },
          { id: "attendance", label: "Chấm công", route: "/attendance", icon: AlarmClock, permission: null },
          { id: "attendance-history", label: "Lịch sử chấm công", route: "/attendance-history", icon: History, permission: null },
          { id: "dashboard", label: "Dashboard · Tổng quan", route: "/dashboard", icon: LayoutDashboard, permission: "contracts.read" },
          { id: "notifications", label: "Thông báo công việc", route: "/notifications", icon: Bell, permission: null },
        ],
      },
      {
        title: "HỢP ĐỒNG",
        items: [
          { id: "contracts", label: "Danh sách hợp đồng", route: "/(tabs)/contracts", icon: Files, permission: "contracts.read" },
          { id: "drafts", label: "Hợp đồng nháp", route: "/contracts-workspace/drafts", icon: FilePenLine, permission: "contracts.read" },
          { id: "vat", label: "Hợp đồng VAT", route: "/contracts-workspace/vat", icon: ReceiptText, permission: "contracts.read" },
          { id: "overdue", label: "Hợp đồng quá hạn", route: "/contracts-workspace/overdue", icon: AlarmClock, permission: "contracts.read" },
          { id: "due", label: "Đến hạn đóng tiền", route: "/contracts-workspace/due", icon: CalendarDays, permission: "contracts.read" },
          { id: "ownership", label: "Hợp đồng thuê sở hữu", route: "/contracts-workspace/ownership", icon: KeyRound, permission: "contracts.read" },
          { id: "battery", label: "Hợp đồng thuê pin / sạc", route: "/battery-contracts", icon: BatteryCharging, permission: "contracts.read" },
          { id: "telegram-pending", label: "Chưa gửi Telegram", route: "/telegram-pending", icon: MessageCircle, permission: "contracts.read" },
          { id: "contract-types", label: "Loại hợp đồng", route: "/contract-types", icon: Files, permission: "settings.write" },
        ],
      },
      {
        title: "HCNS",
        items: [
          { id: "staff", label: "Nhân sự", route: "/directory/staff", icon: UsersRound, permission: "hr.read" },
          { id: "shift-registrations", label: "Đăng ký ca", route: "/shift-registrations", icon: CalendarDays, permission: "hr.read" },
          { id: "duty-roster", label: "Lịch trực cơ sở", route: "/duty-roster", icon: CalendarDays, permission: "hr.read" },
        ],
      },
      {
        title: "KẾ TOÁN",
        items: [
          { id: "cashbook", label: "Sổ quỹ / Sổ két", route: "/cashbook", icon: Wallet, permission: "finance.read" },
          { id: "staff-sales", label: "Báo cáo doanh thu", route: "/staff-sales", icon: ReceiptText, permission: "contracts.read" },
          { id: "debt-reminders", label: "Gửi nhắc nợ", route: "/debt-reminders", icon: MessageCircle, permission: "contracts.read" },
          { id: "collection-report", label: "Báo cáo nợ chậm", route: "/collection-report", icon: AlertTriangle, permission: "contracts.read" },
        ],
      },
      {
        title: "BÁO CÁO",
        items: [
          { id: "mid-shift-reports", label: "Báo cáo giữa ca", route: "/mid-shift-reports", icon: ReceiptText, permission: "contracts.read" },
          { id: "shift-reports", label: "Báo cáo Hết ca", route: "/shift-reports", icon: ReceiptText, permission: "contracts.read" },
        ],
      },
      {
        title: "VẬN HÀNH",
        items: [
          { id: "customers", label: "Khách hàng", route: "/(tabs)/customers", icon: UsersRound, permission: "customers.read" },
          { id: "stores", label: "Cơ sở", route: "/directory/stores", icon: Building2, permission: "contracts.read" },
          { id: "vehicles", label: "Danh sách xe", route: "/(tabs)/vehicles", icon: CarFront, permission: "vehicles.read" },
          { id: "fleet-inventory", label: "Kho xe toàn hệ thống", route: "/fleet-inventory", icon: CarFront, permission: "vehicles.read" },
          { id: "vehicle-transfers", label: "Lịch sử luân chuyển", route: "/vehicle-transfers", icon: History, permission: "vehicles.read" },
          { id: "gps", label: "Định vị GPS", route: "/gps", icon: MapPin, permission: "vehicles.read" },
        ],
      },
      {
        title: "HỆ THỐNG",
        items: [
          { id: "integrations", label: "Tích hợp GPS & Telegram", route: "/integrations", icon: Settings, permission: "settings.write" },
          { id: "accounts", label: "Tài khoản & Phân quyền", route: "/managed-accounts", icon: UsersRound, permission: "accounts.manage" },
          { id: "guide", label: "Hướng dẫn sử dụng", route: "/guide", icon: BookOpen, permission: null },
        ],
      },
    ],
    [],
  );

  const hasAccess = (item: DrawerItem) => {
    if (item.id === "integrations") return isAdminAccount(session?.user);
    if (item.permission === null) return true;
    if (item.id === "accounts") return canManageAccounts(session?.user);
    if (!item.permission) return true;
    return permissions.includes(item.permission);
  };

  const isItemActive = (item: DrawerItem) =>
    pathname === (item.route.replace(/\/\([^/]+\)/g, "") || "/");
  const activeSection =
    sections.find((section) =>
      section.items.some((item) => hasAccess(item) && isItemActive(item)),
    )?.title ?? null;
  const [expandedSection, setExpandedSection] = useState<{
    pathname: string;
    title: string | null;
  } | null>(null);
  const expandedTitle =
    expandedSection?.pathname === pathname
      ? expandedSection.title
      : activeSection;

  const handleNavigate = (route: Href & string) => {
    onClose();
    setTimeout(() => {
      router.push(route);
    }, 100);
  };

  const handleLogout = async () => {
    onClose();
    try {
      await logout();
    } catch {}
  };

  const userRoleLabel = session?.user?.role
    ? roles[session.user.role] || session.user.role
    : "Nhân viên";

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityLabel="Đóng menu điều hướng"
        />

        <SafeAreaView
          edges={["top", "bottom", "left"]}
          style={[
            styles.drawer,
            {
              width: drawerWidth,
              backgroundColor: theme.surface,
              borderRightColor: theme.border,
            },
          ]}
        >
          <View style={[styles.header, { borderBottomColor: theme.border }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Brand small />
              <Text style={[styles.brandSubtitle, { color: theme.muted }]}>
                HỆ THỐNG QUẢN LÝ
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              accessibilityLabel="Đóng menu"
              style={({ pressed }) => [
                styles.closeButton,
                {
                  backgroundColor: theme.background,
                  borderColor: theme.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <X size={18} color={theme.text} />
            </Pressable>
          </View>

          <View
            style={[
              styles.userBar,
              { backgroundColor: theme.background, borderColor: theme.border },
            ]}
          >
            <View
              style={[styles.userAvatar, { backgroundColor: theme.primary }]}
            >
              <Text style={styles.userAvatarText}>
                {(session?.user?.name || "H").charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text
                numberOfLines={1}
                style={[styles.userName, { color: theme.text }]}
              >
                {session?.user?.name || "Nhân viên"}
              </Text>
              <Text
                numberOfLines={1}
                style={[styles.userRole, { color: theme.muted }]}
              >
                {userRoleLabel} · {currentStore}
              </Text>
            </View>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollList}
          >
            {sections.map((section) => {
              const visibleItems = section.items.filter(hasAccess);
              if (visibleItems.length === 0) return null;
              const expanded = expandedTitle === section.title;

              return (
                <View key={section.title} style={styles.sectionContainer}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={section.title}
                    accessibilityState={{ expanded }}
                    aria-expanded={expanded}
                    onPress={() =>
                      setExpandedSection((current) => ({
                        pathname,
                        title:
                          (current?.pathname === pathname
                            ? current.title
                            : activeSection) === section.title
                            ? null
                            : section.title,
                      }))
                    }
                    style={({ pressed }) => [
                      styles.sectionToggle,
                      {
                        backgroundColor: pressed
                          ? theme.background
                          : "transparent",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.sectionTitle,
                        {
                          color:
                            activeSection === section.title
                              ? theme.primary
                              : theme.muted,
                        },
                      ]}
                    >
                      {section.title}
                    </Text>
                    <ChevronDown
                      size={16}
                      color={theme.muted}
                      accessible={false}
                      style={{
                        transform: [{ rotate: expanded ? "180deg" : "0deg" }],
                      }}
                    />
                  </Pressable>
                  {expanded && (
                    <View style={styles.sectionItems}>
                      {visibleItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = isItemActive(item);

                        return (
                          <Pressable
                            key={item.id}
                            accessibilityRole="button"
                            accessibilityState={{ selected: isActive }}
                            onPress={() => handleNavigate(item.route)}
                            style={({ pressed }) => [
                              styles.navItem,
                              {
                                backgroundColor: isActive
                                  ? theme.tint
                                  : pressed
                                    ? theme.background
                                    : "transparent",
                              },
                            ]}
                          >
                            <View
                              style={[
                                styles.navIconBox,
                                isActive && { backgroundColor: theme.primary },
                              ]}
                            >
                              <Icon
                                size={17}
                                color={isActive ? theme.primaryText : theme.text}
                              />
                            </View>
                            <Text
                              style={[
                                styles.navLabel,
                                {
                                  color: isActive ? theme.primary : theme.text,
                                  fontWeight: isActive ? "700" : "500",
                                },
                              ]}
                            >
                              {item.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: theme.border }]}>
            <Pressable
              onPress={() => handleNavigate("/change-password")}
              style={({ pressed }) => [
                styles.footerButton,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <KeyRound size={16} color={theme.muted} />
              <Text style={[styles.footerButtonText, { color: theme.text }]}>
                Đổi mật khẩu
              </Text>
            </Pressable>
            <Pressable
              onPress={handleLogout}
              style={({ pressed }) => [
                styles.footerButton,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <LogOut size={16} color={theme.danger} />
              <Text style={[styles.footerButtonText, { color: theme.danger }]}>
                Đăng xuất
              </Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, flexDirection: "row" },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(15, 23, 42, 0.48)",
  },
  drawer: {
    height: "100%",
    borderRightWidth: 1,
    elevation: 16,
    shadowColor: "#000",
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
  },
  header: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
  },
  brandSubtitle: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.1,
    marginTop: 2,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  userBar: {
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  userAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  userAvatarText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  userName: { fontSize: 13.5, fontWeight: "700" },
  userRole: { fontSize: 11.5 },
  scrollList: { paddingHorizontal: 10, paddingBottom: 20, gap: 4 },
  sectionContainer: { gap: 2 },
  sectionTitle: {
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  sectionToggle: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 8,
  },
  sectionItems: { gap: 2, paddingBottom: 4 },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  navIconBox: {
    width: 26,
    height: 26,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  navLabel: { fontSize: 13.5, flex: 1 },
  footer: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  footerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  footerButtonText: { fontSize: 13.5, fontWeight: "600" },
});
