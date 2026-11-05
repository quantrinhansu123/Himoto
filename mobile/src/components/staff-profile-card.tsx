import { Text, View } from "react-native";
import { STAFF_PROFILE_STATUSES, type MobileStaffProfile } from "../../../shared/mobile-staff";
import { useTheme } from "@/theme";
import { Card, StatusBadge } from "./ui";
export function StaffProfileCard({ row }: { row: MobileStaffProfile }) {
  const theme = useTheme();
  const fields = [["Mã nhân sự", row.code], ["Số điện thoại", row.phone], ["Email", row.email], ["Chức vụ", row.position], ["Cơ sở", row.storeName || "Trụ sở công ty / Chưa phân bổ"], ["Ngày vào làm", row.joinedAt ? row.joinedAt.split("-").reverse().join("/") : ""], ["Ghi chú", row.notes]];
  return <Card style={{ gap: 16 }}>
    <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 24, fontWeight: "800" }}>{row.name}</Text>
    <StatusBadge status={row.status} label={STAFF_PROFILE_STATUSES.find(status => status.value === row.status)?.label || row.status} />
    {fields.map(([label, value]) => <View key={label} style={{ gap: 5 }}><Text style={{ color: theme.muted }}>{label}</Text><Text selectable style={{ color: theme.text, fontSize: 16, lineHeight: 24 }}>{value || "—"}</Text></View>)}
  </Card>;
}
