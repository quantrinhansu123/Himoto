import { canManageAccounts } from '../../../shared/mobile-managed-accounts';
import { isAdminAccount } from '../../../shared/access-permissions';
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { Building2, CalendarDays, ChartNoAxesCombined, ChevronRight, Files, MapPin, MessageCircle, ReceiptText, Settings, UsersRound, Wallet } from "lucide-react-native";
import { useSession } from "@/providers/session";
import { useTheme } from "@/theme";
import { Card } from "./ui";

export function WorkspaceLinks() {
  const { session } = useSession(), theme = useTheme(), permissions = session?.user.permissions || [];
  const links = [
    ...(permissions.includes("contracts.read") ? [
      { key: "dashboard", title: "Dashboard · Tổng quan", description: "Số hợp đồng, doanh số, doanh thu và phí sửa chữa theo cơ sở", icon: ChartNoAxesCombined, open: () => router.push("/dashboard") },
      { key: "staff-sales", title: "Báo cáo doanh thu", description: "Thực thu NVKD, sổ thu/chi, doanh thu cơ sở và nguồn khách mới", icon: ReceiptText, open: () => router.push("/staff-sales") },
    ] : []),
    ...(permissions.includes("finance.read") ? [{ key: "cashbook", title: "Sổ quỹ / Sổ két", description: "Phiếu thu chi, số dư két tiền mặt và tài khoản ngân hàng", icon: Wallet, open: () => router.push("/cashbook") }] : []),
    ...(permissions.includes("contracts.read") ? [
      { key: "shift-reports", title: "Báo cáo cuối ca", description: "PGD kiểm kê xe, chốt tiền mặt cuối ca và KTNB đối soát", icon: ReceiptText, open: () => router.push("/shift-reports") },
      { key: "debt-reminders", title: "Gửi nhắc nợ", description: "Hợp đồng đến hạn / quá hạn và lịch sử gửi tin nhắc nợ", icon: MessageCircle, open: () => router.push("/debt-reminders") },
      { key: "telegram-pending", title: "Chưa gửi Telegram", description: "Kiểm tra giao dịch chưa gửi, gửi lỗi hoặc đã thu hồi", icon: MessageCircle, open: () => router.push("/telegram-pending") },
    ] : []),
    ...(permissions.includes("vehicles.read") ? [
      { key: "gps", title: "Định vị GPS", description: "Trạng thái di chuyển, dừng đỗ và lịch sử tín hiệu GPS đội xe", icon: MapPin, open: () => router.push("/gps") },
    ] : []),
    { key: 'notifications', title: 'Thông báo công việc', description: 'Điều chuyển cần nhận, hợp đồng đến hạn và việc chờ duyệt', icon: CalendarDays, open: () => router.push('/notifications') },
    { key: 'attendance', title: 'Chấm công & Lịch sử chấm công', description: 'Vào ca, ra ca, đăng ký ca trong tuần và xem bảng công', icon: CalendarDays, open: () => router.push('/attendance') },
    ...(permissions.includes("hr.read") ? [
      { key: "shift-registrations", title: "Đăng ký ca", description: "Bảng đăng ký ca làm theo tháng của toàn bộ cơ sở", icon: CalendarDays, open: () => router.push("/shift-registrations") },
      { key: "duty", title: "Lịch trực cơ sở", description: "Lịch tuần, phân công và ca trực cơ sở", icon: CalendarDays, open: () => router.push("/duty-roster") },
      { key: "staff", title: "Nhân sự", description: "Hồ sơ nhân sự, trạng thái và sơ đồ phân bổ cơ sở", icon: UsersRound, open: () => router.push({ pathname: "/directory/[kind]", params: { kind: "staff" } }) },
    ] : []),
    ...(permissions.includes("contracts.read") ? [{ key: "stores", title: "Cơ sở", description: "Thông tin quản lý, địa chỉ và liên hệ từng cơ sở", icon: Building2, open: () => router.push({ pathname: "/directory/[kind]", params: { kind: "stores" } }) }] : []),
    ...(permissions.includes("settings.write") && permissions.includes("contracts.read") ? [{ key: "contract-types", title: "Loại hợp đồng", description: "Danh mục loại hợp đồng, cách tính tiền và thời hạn", icon: Files, open: () => router.push("/contract-types") }] : []),
    ...(canManageAccounts(session?.user) ? [{ key: "managed-accounts", title: "Tài khoản & Phân quyền", description: "Vai trò, cơ sở, quyền thao tác và trạng thái đăng nhập", icon: UsersRound, open: () => router.push("/managed-accounts") }] : []),
    ...(isAdminAccount(session?.user) ? [{ key: "integrations", title: "Tích hợp GPS & Telegram", description: "Tài khoản GPS, nhóm nhận tin và trạng thái đồng bộ", icon: Settings, open: () => router.push("/integrations") }] : []),
    { key: 'guide', title: 'Hướng dẫn sử dụng', description: 'Các bước nghiệp vụ chuẩn trên Web & App kèm hỏi đáp có ảnh', icon: Files, open: () => router.push('/guide') },
  ];
  if (!links.length) return null;
  return <View style={{ gap: 12 }}>
    <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 19, fontWeight: "700" }}>Hồ sơ và vận hành</Text>
    {links.map(item => { const Icon = item.icon; return <Pressable key={item.key} accessibilityRole="button" accessibilityLabel={`Mở ${item.title}`} onPress={item.open} style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}>
      <Card style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 16, minHeight: 76 }}>
        <Icon color={theme.primary} size={22} accessible={false} />
        <View style={{ flex: 1, gap: 5 }}><Text style={{ color: theme.text, fontSize: 16, fontWeight: "700" }}>{item.title}</Text><Text style={{ color: theme.muted, fontSize: 13, lineHeight: 20 }}>{item.description}</Text></View>
        <ChevronRight color={theme.muted} size={18} accessible={false} />
      </Card>
    </Pressable>; })}
  </View>;
}
