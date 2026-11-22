import { Text, View } from "react-native";
import type { MobileDutySchedule } from "../../../shared/mobile-duty-roster";
import { dateTime, useTheme } from "@/theme";
import { Card, KeyValueRow, StatusBadge } from "./ui";
import { attendanceShift, shiftCreditLabel } from "../../../shared/attendance-shifts";

export function DutyScheduleCard({
  row,
  children,
}: {
  row: MobileDutySchedule;
  children?: React.ReactNode;
}) {
  const theme = useTheme();
  const shiftInfo = attendanceShift(row.shift_name);
  return (
    <Card style={{ gap: 8, padding: 13 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          style={{ color: theme.text, fontSize: 16, fontWeight: "800", flex: 1 }}
        >
          {row.staff_name || "Chưa gắn nhân sự"}
        </Text>
        <StatusBadge
          status="active"
          label={shiftInfo ? `${row.shift_name} · ${shiftCreditLabel(shiftInfo.credit)} công` : row.shift_name}
        />
      </View>
      <View style={{ gap: 2 }}>
        <KeyValueRow label="Cơ sở" value={row.store_name} strong />
        <KeyValueRow label="Vai trò" value={row.role_in_shift} />
        <KeyValueRow
          label="Thời gian"
          value={`${row.starts_at ? dateTime(row.starts_at) : row.duty_date} → ${row.ends_at ? dateTime(row.ends_at) : "Ca theo ngày"}`}
        />
        {!!row.staff_phone && <KeyValueRow label="Điện thoại" value={row.staff_phone} selectable />}
        {!!row.notes && <KeyValueRow label="Ghi chú" value={row.notes} />}
      </View>
      {children}
    </Card>
  );
}
