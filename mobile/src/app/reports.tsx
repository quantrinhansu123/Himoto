import { router, Stack } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Building2,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronRight,
  Clock3,
  UsersRound,
} from "lucide-react-native";
import { Card, StateView } from "@/components/ui";
import { useSession } from "@/providers/session";
import { useTheme } from "@/theme";

interface ReportItem {
  key: string;
  title: string;
  description: string;
  icon: typeof ChartNoAxesCombined;
  href: string;
  permission?: string;
}

export default function ReportsHub() {
  const { session } = useSession();
  const theme = useTheme();

  if (!session) {
    return <StateView title="Đăng nhập để xem báo cáo" />;
  }

  const permissions = session.user.permissions || [];

  const businessReports: ReportItem[] = [
    {
      key: "dashboard",
      title: "Tổng quan giao dịch & KPI",
      description: "Chỉ số hợp đồng, tổng doanh số, doanh thu thực thu và phí sửa chữa theo cơ sở/kỳ.",
      icon: ChartNoAxesCombined,
      href: "/dashboard",
      permission: "contracts.read",
    },
    {
      key: "staff-sales",
      title: "Báo cáo doanh thu & NVKD",
      description: "Thực thu theo nhân viên, hoa hồng, doanh thu từng xe, cơ sở chủ quản và nguồn khách mới.",
      icon: UsersRound,
      href: "/staff-sales",
      permission: "contracts.read",
    },
  ];

  const operationalReports: ReportItem[] = [
    {
      key: "mid-shift-reports",
      title: "Báo cáo giữa ca",
      description: "Kiểm kê xe, pin và tiền mặt tại thời điểm giữa ca của từng PGD.",
      icon: Clock3,
      href: "/mid-shift-reports",
      permission: "contracts.read",
    },
    {
      key: "shift-reports",
      title: "Báo cáo Hết ca & Đối soát KTNB",
      description: "PGD kiểm kê xe, số dư tiền mặt hết ca, ảnh minh chứng két và xác nhận KTNB.",
      icon: Clock3,
      href: "/shift-reports",
      permission: "contracts.read",
    },
    {
      key: "cashbook",
      title: "Sổ quỹ & Số dư két",
      description: "Toàn bộ phiếu thu chi, tài khoản ngân hàng và số dư quỹ tiền mặt tại các cơ sở.",
      icon: Building2,
      href: "/cashbook",
      permission: "finance.read",
    },
    {
      key: "debt-reminders",
      title: "Công nợ & Nhắc nợ Zalo",
      description: "Kỳ hạn hợp đồng đến hạn đóng tiền, công nợ chậm trả và mẫu tin nhắn Zalo gửi khách.",
      icon: CalendarDays,
      href: "/debt-reminders",
      permission: "contracts.read",
    },
    {
      key: "collection-report",
      title: "Báo cáo nợ chậm",
      description: "Theo dõi khách quá hạn, cập nhật xử lý và gửi báo cáo theo PGD.",
      icon: CalendarDays,
      href: "/collection-report",
      permission: "contracts.read",
    },
  ];

  const filterReports = (items: ReportItem[]) =>
    items.filter((item) => !item.permission || permissions.includes(item.permission));

  const visibleBusiness = filterReports(businessReports);
  const visibleOperational = filterReports(operationalReports);

  return (
    <SafeAreaView edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: theme.background }}>
      <Stack.Screen options={{ title: "Báo cáo dùng chung" }} />
      <ScrollView
        contentContainerStyle={{
          padding: 20,
          gap: 20,
          width: "100%",
          maxWidth: 760,
          alignSelf: "center",
          paddingBottom: 40,
        }}
      >
        <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 19 }}>
          Tổng hợp các phân hệ báo cáo toàn hệ thống Himoto: doanh thu, giao dịch, ca trực, sổ két và công nợ.
        </Text>

        {visibleBusiness.length > 0 && (
          <View style={{ gap: 12 }}>
            <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>
              Hiệu quả kinh doanh & Doanh số
            </Text>
            {visibleBusiness.map((item) => {
              const Icon = item.icon;
              return (
                <Pressable
                  key={item.key}
                  accessibilityRole="button"
                  accessibilityLabel={`Mở ${item.title}`}
                  onPress={() => router.push(item.href as any)}
                  style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}
                >
                  <Card style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 16, minHeight: 76 }}>
                    <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: theme.tint, alignItems: "center", justifyContent: "center" }}>
                      <Icon color={theme.primary} size={22} accessible={false} />
                    </View>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={{ color: theme.text, fontSize: 16, fontWeight: "700" }}>{item.title}</Text>
                      <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 19 }}>{item.description}</Text>
                    </View>
                    <ChevronRight color={theme.muted} size={18} accessible={false} />
                  </Card>
                </Pressable>
              );
            })}
          </View>
        )}

        {visibleOperational.length > 0 && (
          <View style={{ gap: 12 }}>
            <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>
              Vận hành quầy & Kiểm soát quỹ
            </Text>
            {visibleOperational.map((item) => {
              const Icon = item.icon;
              return (
                <Pressable
                  key={item.key}
                  accessibilityRole="button"
                  accessibilityLabel={`Mở ${item.title}`}
                  onPress={() => router.push(item.href as any)}
                  style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}
                >
                  <Card style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 16, minHeight: 76 }}>
                    <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: theme.tint, alignItems: "center", justifyContent: "center" }}>
                      <Icon color={theme.primary} size={22} accessible={false} />
                    </View>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={{ color: theme.text, fontSize: 16, fontWeight: "700" }}>{item.title}</Text>
                      <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 19 }}>{item.description}</Text>
                    </View>
                    <ChevronRight color={theme.muted} size={18} accessible={false} />
                  </Card>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

