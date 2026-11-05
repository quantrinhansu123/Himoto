import { Text, View } from "react-native";
import type { MobileDutySchedule } from "../../../shared/mobile-duty-roster";
import { dateTime, useTheme } from "@/theme";
import { Card } from "./ui";
export function DutyScheduleCard({ row, children }: { row: MobileDutySchedule; children?: React.ReactNode }) {
  const theme = useTheme();
  return <Card style={{ gap: 10 }}>
    <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>{row.staff_name || "Chưa gắn nhân sự"}</Text>
    <Text style={{ color: theme.primary, fontSize: 15, fontWeight: "600" }}>{row.shift_name} · {row.role_in_shift}</Text>
    <View style={{ gap: 5 }}>
      <Text style={{ color: theme.text }}>{row.store_name}</Text>
      <Text style={{ color: theme.muted, lineHeight: 22 }}>{row.starts_at ? dateTime(row.starts_at) : row.duty_date} → {row.ends_at ? dateTime(row.ends_at) : "Ca theo ngày"}</Text>
      {!!row.staff_phone && <Text selectable style={{ color: theme.text }}>{row.staff_phone}</Text>}
      {!!row.notes && <Text style={{ color: theme.muted, lineHeight: 22 }}>{row.notes}</Text>}
    </View>
    {children}
  </Card>;
}
