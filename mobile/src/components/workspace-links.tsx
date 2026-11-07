import { canManageAccounts } from '../../../shared/mobile-managed-accounts';
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { Building2, CalendarDays, ChartNoAxesCombined, ChevronRight, Files, UsersRound } from "lucide-react-native";
import { CONTRACT_WORKSPACES } from "../../../shared/mobile-contract-workspaces";
import { useSession } from "@/providers/session";
import { useTheme } from "@/theme";
import { Card } from "./ui";

export function WorkspaceLinks() {
  const { session } = useSession(), theme = useTheme(), permissions = session?.user.permissions || [];
  const links = [
    {key:'attendance',title:'Chấm công',description:'Vào ca, ra ca, ảnh và GPS; xem lịch sử đi làm',icon:CalendarDays,open:()=>router.push('/attendance')},
    {key:'guide',title:'Hướng dẫn và hỏi đáp',description:'Các bước nghiệp vụ, câu hỏi và câu trả lời có ảnh',icon:Files,open:()=>router.push('/guide')},
    ...(permissions.includes("contracts.read") ? [{ key: "operations", title: "Thao tác nhanh", description: "Làm hợp đồng, trả xe, gia hạn và nhập bổ sung lịch sử", icon: Files, open: () => router.push("/operations") }] : []),
    {key:'notifications',title:'Thông báo công việc',description:'Điều chuyển cần nhận, hợp đồng đến hạn và việc chờ duyệt',icon:CalendarDays,open:()=>router.push('/notifications')},
    ...(permissions.includes('contracts.read')?[{key:'dashboard',title:'Tổng quan giao dịch',description:'Chỉ số hợp đồng, doanh số và doanh thu theo kỳ/cơ sở',icon:ChartNoAxesCombined,open:()=>router.push('/dashboard')}]:[]),
    ...(permissions.includes('contracts.read')?[{key:'telegram-pending',title:'Giao dịch chưa gửi Telegram',description:'Kiểm tra lần gửi lỗi, chưa rõ kết quả hoặc đã thu hồi',icon:Files,open:()=>router.push('/telegram-pending')}]:[]),
    ...(permissions.includes("contracts.read") ? [{ key: "battery-contracts", title: "Hợp đồng pin / sạc", description: "Thuê pin, cọc, gia hạn và lịch sử thu tiền", icon: Files, open: () => router.push("/battery-contracts") }] : []),
    ...(permissions.includes("contracts.read") ? [{ key: "shift-reports", title: "Báo cáo cuối ca", description: "Kiểm kê, minh chứng PGD và đối soát KTNB", icon: Files, open: () => router.push("/shift-reports") }] : []),
    ...(permissions.includes("contracts.read") ? [{ key: "debt-reminders", title: "Gửi nhắc nợ", description: "Công nợ đến hạn, nội dung Zalo và lịch sử gửi", icon: Files, open: () => router.push("/debt-reminders") }] : []),
    ...(permissions.includes("contracts.read") ? [{ key: "staff-sales", title: "Báo cáo doanh thu thuê xe", description: "Thực thu, công nợ, xe, cơ sở và thống kê hợp đồng", icon: ChartNoAxesCombined, open: () => router.push("/staff-sales") }] : []),
    ...(permissions.includes("finance.read") ? [{ key: "cashbook", title: "Sổ quỹ / Sổ két", description: "Thu chi, tài khoản ngân hàng và số dư két", icon: Files, open: () => router.push("/cashbook") }] : []),
    ...(permissions.includes("vehicles.read") ? [{ key: "transfers", title: "Điều chuyển xe", description: "Lịch sử toàn hệ thống, cơ sở đi/đến và audit", icon: Files, open: () => router.push("/vehicle-transfers") }] : []),
    ...(permissions.includes('vehicles.read')?[{key:'fleet-inventory',title:'Kho xe toàn hệ thống',description:'Tra cứu xe giữa các cơ sở và khả năng điều chuyển',icon:Files,open:()=>router.push('/fleet-inventory')}]:[]),
    ...(permissions.includes("contracts.read") ? CONTRACT_WORKSPACES.filter(item => item.key).map(item => ({ key: item.key, title: item.title, description: item.description, icon: Files, open: () => router.push({ pathname: "/contracts-workspace/[scope]", params: { scope: item.key } }) })) : []),
    ...(permissions.includes("hr.read") ? [
      { key: "duty", title: "Lịch trực", description: "Lịch tuần, phân công và ca trực cơ sở", icon: CalendarDays, open: () => router.push("/duty-roster") },
      { key: "staff", title: "Nhân sự", description: "Hồ sơ, trạng thái và phân bổ cơ sở", icon: UsersRound, open: () => router.push({ pathname: "/directory/[kind]", params: { kind: "staff" } }) },
    ] : []),
    ...(permissions.includes("contracts.read") ? [{ key: "stores", title: "Cơ sở", description: "Thông tin quản lý và liên hệ cơ sở", icon: Building2, open: () => router.push({ pathname: "/directory/[kind]", params: { kind: "stores" } }) }] : []),
    ...(canManageAccounts(session?.user)?[{key:'import-contracts',title:'Nhập nháp hợp đồng Excel',description:'Khớp cơ sở, kiểm trùng và sao lưu trước khi nhập',icon:Files,open:()=>router.push('/import-contracts')}]:[]),
    ...(permissions.includes("settings.write")&&permissions.includes("contracts.read") ? [{ key: "contract-types", title: "Loại hợp đồng", description: "Danh mục, cách tính tiền, thời hạn và trạng thái", icon: Files, open: () => router.push("/contract-types") }] : []),
    ...(canManageAccounts(session?.user) ? [{ key: "managed-accounts", title: "Tài khoản và phân quyền", description: "Vai trò, cơ sở, quyền thao tác và trạng thái đăng nhập", icon: UsersRound, open: () => router.push("/managed-accounts") }] : []),
    ...(canManageAccounts(session?.user) ? [{ key: "integrations", title: "Tích hợp GPS và Telegram", description: "Tài khoản GPS, nhóm nhận tin và trạng thái đồng bộ", icon: Files, open: () => router.push("/integrations") }] : []),
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
