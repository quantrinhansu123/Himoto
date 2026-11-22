import { Text, View } from "react-native";
import { STAFF_PROFILE_STATUSES, type MobileStaffProfile } from "../../../shared/mobile-staff";
import { useTheme } from "@/theme";
import { Card, KeyValueRow, StatusBadge } from "./ui";
export function StaffProfileCard({ row }: { row: MobileStaffProfile }) {
  const theme = useTheme();
  const fields = [["Mã nhân sự", row.code], ["Số điện thoại", row.phone], ["Email", row.email], ["Chức vụ", row.position], ["Cơ sở", row.storeName || "Trụ sở công ty / Chưa phân bổ"], ["Ngày vào làm", row.joinedAt ? row.joinedAt.split("-").reverse().join("/") : ""], ["Ghi chú", row.notes]];
  return <Card style={{ gap: 8, padding: 14 }}>
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
      <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 18, fontWeight: "800", flex: 1 }}>{row.name}</Text>
      <StatusBadge status={row.status} label={STAFF_PROFILE_STATUSES.find(status => status.value === row.status)?.label || row.status} />
    </View>
    <View style={{ gap: 2, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 6 }}>
      {fields.map(([label, value]) => <KeyValueRow key={label} label={label} value={value || "—"} selectable />)}
    </View>
  </Card>;
}
