import { Text, View } from "react-native";
import { STORE_KINDS, type MobileStoreProfile } from "../../../shared/mobile-stores";
import { useTheme } from "@/theme";
import { Card, KeyValueRow, StatusBadge } from "./ui";
export function StoreProfileCard({ row }: { row: MobileStoreProfile }) {
  const theme = useTheme();
  const fields = [["Mã cơ sở", row.code || "—"], ["Loại cơ sở", STORE_KINDS.find(kind => kind.value === row.kind)?.label || row.kind || "—"], ["Điện thoại", row.phone || "—"], ["Địa chỉ", row.address || "—"], ["Người phụ trách", row.managerName || "Chưa phân công"], ["Số xe", String(row.vehicleCount)], ["Nhân sự", String(row.staffCount)]];
  return <Card style={{ gap: 8, padding: 14 }}>
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
      <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 18, fontWeight: "800", flex: 1 }}>{row.name}</Text>
      <StatusBadge status={row.status} label={row.status === "active" ? "Hoạt động" : row.status === "inactive" ? "Tạm ngừng" : row.status} />
    </View>
    <View style={{ gap: 2, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 6 }}>
      {fields.map(([label, value]) => <KeyValueRow key={label} label={label} value={value} selectable />)}
    </View>
  </Card>;
}
