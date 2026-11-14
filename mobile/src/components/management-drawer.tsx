import React, { useMemo } from "react";
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
  BatteryCharging,
  BookOpen,
  Building2,
  CalendarDays,
  CarFront,
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
import { Brand } from "./ui";

interface DrawerItem {
  id: string;
  label: string;
  route: Href & string;
  icon: React.ComponentType<{ size: number; color: string }>;
  permission?: string | null;
  badge?: string;
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
  const drawerWidth = Math.min(width * 0.85, 340);

  const permissions = session?.user.permissions || [];

  const currentStore = useMemo(() => {
    if (session?.user.allStores) return "Toàn bộ cơ sở";
    return (
      workspace.data?.stores.find((s) => s.id === session?.user.storeId)?.name ||
      "Cơ sở được phân công"
    );
  }, [session, workspace.data?.stores]);

  const sections: DrawerSection[] = useMemo(() => [
    {
      title: "VẬN HÀNH & QUẦY",
      items: [
        { id: "attendance", label: "Chấm công", route: "/attendance", icon: AlarmClock, permission: null },
        { id: "shift-reports", label: "Báo cáo cuối ca", route: "/shift-reports", icon: ReceiptText, permission: null },
        { id: "operations", label: "Thao tác nhanh", route: "/(tabs)", icon: House, permission: null },
        { id: "dashboard", label: "Tổng quan giao dịch", route: "/dashboard", icon: LayoutDashboard, permission: "contracts.read" },
        { id: "staff-sales", label: "Báo cáo doanh thu", route: "/staff-sales", icon: ReceiptText, permission: "contracts.read" },
      ],
    },
    {
      title: "HỢP ĐỒNG & KHÁCH HÀNG",
      items: [
        { id: "customers", label: "Khách hàng", route: "/(tabs)/customers", icon: UsersRound, permission: "customers.read" },
        { id: "contracts", label: "Danh sách hợp đồng", route: "/(tabs)/contracts", icon: Files, permission: "contracts.read" },
        { id: "drafts", label: "Hợp đồng nháp", route: "/contracts-workspace/drafts", icon: FilePenLine, permission: "contracts.read" },
        { id: "vat", label: "Hợp đồng VAT", route: "/contracts-workspace/vat", icon: ReceiptText, permission: "contracts.read" },
        { id: "overdue", label: "Hợp đồng quá hạn", route: "/contracts-workspace/overdue", icon: AlarmClock, permission: "contracts.read" },
        { id: "due", label: "Đến hạn đóng tiền", route: "/contracts-workspace/due", icon: CalendarDays, permission: "contracts.read" },
        { id: "debt-reminders", label: "Gửi nhắc nợ", route: "/debt-reminders", icon: MessageCircle, permission: "contracts.read" },
        { id: "ownership", label: "Hợp đồng thuê sở hữu", route: "/contracts-workspace/ownership", icon: KeyRound, permission: "contracts.read" },
        { id: "battery", label: "Hợp đồng thuê pin / sạc", route: "/battery-contracts", icon: BatteryCharging, permission: "contracts.read" },
        { id: "contract-types", label: "Loại hợp đồng", route: "/contract-types", icon: Files, permission: "settings.write" },
      ],
    },
    {
      title: "ĐỘI XE & ĐỊNH VỊ",
      items: [
        { id: "vehicles", label: "Danh sách xe", route: "/(tabs)/vehicles", icon: CarFront, permission: "vehicles.read" },
        { id: "vehicle-transfers", label: "Lịch sử luân chuyển", route: "/vehicle-transfers", icon: History, permission: "vehicles.read" },
        { id: "gps", label: "Định vị GPS", route: "/gps", icon: MapPin, permission: "vehicles.read" },
      ],
    },
    {
      title: "NHÂN SỰ & CƠ SỞ",
      items: [
        { id: "staff", label: "Nhân sự", route: "/directory/staff", icon: UsersRound, permission: "hr.read" },
        { id: "duty-roster", label: "Lịch trực cơ sở", route: "/duty-roster", icon: CalendarDays, permission: "hr.read" },
        { id: "stores", label: "Cơ sở", route: "/directory/stores", icon: Building2, permission: "settings.write" },
      ],
    },
    {
      title: "TÀI CHÍNH & HỆ THỐNG",
      items: [
        { id: "cashbook", label: "Sổ quỹ / Sổ két", route: "/cashbook", icon: Wallet, permission: "finance.read" },
        { id: "integrations", label: "Tích hợp GPS & Telegram", route: "/integrations", icon: Settings, permission: "settings.write" },
        { id: "accounts", label: "Tài khoản & Phân quyền", route: "/managed-accounts", icon: UsersRound, permission: "accounts.manage" },
        { id: "guide", label: "Hướng dẫn sử dụng", route: "/guide", icon: BookOpen, permission: null },
      ],
    },
  ], []);

  const hasAccess = (item: DrawerItem) => {
    if (item.permission === null) return true;
    if (item.id === "accounts") return canManageAccounts(session?.user);
    if (!item.permission) return true;
    return permissions.includes(item.permission);
  };

  const handleNavigate = (route: Href & string) => {
    onClose();
    // Small timeout ensures smooth drawer close before navigation
    setTimeout(() => {
      router.push(route);
    }, 120);
  };

  const handleLogout = async () => {
    onClose();
    try {
      await logout();
    } catch {}
  };

  const userRoleLabel = session?.user?.role ? (roles[session.user.role] || session.user.role) : "Nhân viên";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        {/* Backdrop */}
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityLabel="Đóng menu điều hướng"
        />

        {/* Drawer Content */}
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
          {/* Top Brand Header */}
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

          {/* Workspace Pill */}
          <View style={[styles.workspaceCard, { backgroundColor: theme.tint, borderColor: theme.border }]}>
            <View style={[styles.workspaceIcon, { backgroundColor: theme.primary }]}>
              <Building2 size={16} color={theme.primaryText} />
            </View>
            <View style={{ flex: 1, gap: 1 }}>
              <Text style={[styles.workspaceTitle, { color: theme.text }]}>
                HIMOTO Workspace
              </Text>
              <Text style={[styles.workspaceSub, { color: theme.muted }]}>
                Quản lý vận hành
              </Text>
            </View>
          </View>

          {/* User Profile Mini Bar */}
          <View style={[styles.userBar, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <View style={[styles.userAvatar, { backgroundColor: theme.primary }]}>
              <Text style={styles.userAvatarText}>
                {(session?.user?.name || "H").charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={[styles.userName, { color: theme.text }]}>
                {session?.user?.name || "Nhân viên"}
              </Text>
              <Text numberOfLines={1} style={[styles.userRole, { color: theme.muted }]}>
                {userRoleLabel} · {currentStore}
              </Text>
            </View>
          </View>

          {/* Navigation Item List */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollList}
          >
            {sections.map((section) => {
              const visibleItems = section.items.filter(hasAccess);
              if (visibleItems.length === 0) return null;

              return (
                <View key={section.title} style={styles.sectionContainer}>
                  <Text style={[styles.sectionTitle, { color: theme.muted }]}>
                    {section.title}
                  </Text>
                  <View style={styles.sectionItems}>
                    {visibleItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = pathname === (item.route.replace(/\/\([^/]+\)/g, "") || "/");

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
                              size={18}
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
                </View>
              );
            })}
          </ScrollView>

          {/* Drawer Footer Actions */}
          <View style={[styles.footer, { borderTopColor: theme.border }]}>
            <Pressable
              onPress={() => handleNavigate("/change-password")}
              style={({ pressed }) => [
                styles.footerButton,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <KeyRound size={17} color={theme.muted} />
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
              <LogOut size={17} color={theme.danger} />
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
  overlay: {
    flex: 1,
    flexDirection: "row",
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
  },
  drawer: {
    height: "100%",
    borderRightWidth: 1,
    elevation: 16,
    shadowColor: "#000",
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
  },
  brandSubtitle: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
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
  workspaceCard: {
    marginHorizontal: 14,
    marginTop: 10,
    marginBottom: 6,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  workspaceIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  workspaceTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  workspaceSub: {
    fontSize: 11,
  },
  userBar: {
    marginHorizontal: 14,
    marginBottom: 10,
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
  userAvatarText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
  },
  userName: {
    fontSize: 13,
    fontWeight: "700",
  },
  userRole: {
    fontSize: 11,
  },
  scrollList: {
    paddingHorizontal: 10,
    paddingBottom: 24,
    gap: 16,
  },
  sectionContainer: {
    gap: 4,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  sectionItems: {
    gap: 2,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  navIconBox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  navLabel: {
    fontSize: 14,
    flex: 1,
  },
  footer: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
    gap: 8,
  },
  footerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  footerButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
});
