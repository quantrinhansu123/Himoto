import { Text, View } from "react-native";
import { STORE_KINDS, type MobileStoreProfile } from "../../../shared/mobile-stores";
import { useTheme } from "@/theme";
import { Card, StatusBadge } from "./ui";
export function StoreProfileCard({ row }: { row: MobileStoreProfile }) {
  const theme = useTheme();
  const fields = [["Mã cơ sở", row.code || "—"], ["Loại cơ sở", STORE_KINDS.find(kind => kind.value === row.kind)?.label || row.kind || "—"], ["Điện thoại", row.phone || "—"], ["Địa chỉ", row.address || "—"], ["Người phụ trách", row.managerName || "Chưa phân công"], ["Số xe", String(row.vehicleCount)], ["Nhân sự", String(row.staffCount)]];
  return <Card style={{ gap: 16 }}>
    <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 24, fontWeight: "800" }}>{row.name}</Text>
    <StatusBadge status={row.status} label={row.status === "active" ? "Hoạt động" : row.status === "inactive" ? "Tạm ngừng" : row.status} />
    {fields.map(([label, value]) => <View key={label} style={{ gap: 5 }}><Text style={{ color: theme.muted }}>{label}</Text><Text selectable style={{ color: theme.text, fontSize: 16, lineHeight: 24 }}>{value}</Text></View>)}
  </Card>;
}
